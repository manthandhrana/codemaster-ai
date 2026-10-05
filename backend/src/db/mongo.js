import { execFileSync } from 'node:child_process';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { BACKEND_DIR, env } from '../config.js';

let embedded = null;
export const dbInfo = { mode: null, uri: null, dbName: null, version: null };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (uri) => uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:****@');

// MongoDB 5.0+ needs a CPU with AVX. On older CPUs (e.g. Celeron/Pentium Silver) newer builds
// start once but crash with ILLEGAL_INSTRUCTION during crash recovery, so we use 4.4 there.
const EMBEDDED_VERSION_AVX = '8.2.6';
const EMBEDDED_VERSION_NO_AVX = '4.4.29';

function detectAvx() {
  try {
    if (process.platform === 'linux') return /\bavx\b/.test(fs.readFileSync('/proc/cpuinfo', 'utf8'));
    if (process.platform === 'darwin') {
      if (process.arch === 'arm64') return true;
      return /AVX1\.0/i.test(execFileSync('sysctl', ['-n', 'machdep.cpu.features'], { encoding: 'utf8' }));
    }
    if (process.platform === 'win32') {
      const script =
        "Add-Type -Namespace CM -Name Cpu -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern bool IsProcessorFeaturePresent(uint f);'; [CM.Cpu]::IsProcessorFeaturePresent(39)";
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
      });
      return /true/i.test(out);
    }
  } catch {
    /* unknown - assume a modern CPU */
  }
  return true;
}

/** AVX support, cached in backend/data so the (slow on Windows) probe runs once per machine. */
function cpuHasAvx() {
  const cacheFile = path.resolve(BACKEND_DIR, 'data', '.cpu.json');
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (typeof cached.avx === 'boolean') return cached.avx;
  } catch {
    /* no cache yet */
  }
  const avx = detectAvx();
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ avx, checkedAt: new Date().toISOString() }));
  } catch {
    /* read-only disk - fine */
  }
  return avx;
}

const majorMinor = (v) => String(v).split('.').slice(0, 2).join('.');

/**
 * With MONGODB_URI unset (or "embedded"), a real mongod is started in-process through
 * mongodb-memory-server with a persistent data folder - no MongoDB install needed.
 * The first run downloads the MongoDB binary once.
 */
async function startEmbedded() {
  // Pin the binary cache to backend/ so it is downloaded once, whatever directory the app is started from.
  process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(BACKEND_DIR, 'node_modules', '.cache', 'mongodb-memory-server');
  const { MongoMemoryServer } = await import('mongodb-memory-server');

  const dbPath = path.resolve(BACKEND_DIR, env('EMBEDDED_MONGO_PATH', './data/mongo'));
  const port = Number(env('EMBEDDED_MONGO_PORT', '27027'));
  const avx = cpuHasAvx();
  const version = env('EMBEDDED_MONGO_VERSION') || (avx ? EMBEDDED_VERSION_AVX : EMBEDDED_VERSION_NO_AVX);
  fs.mkdirSync(dbPath, { recursive: true });

  // Data files are not portable between arbitrary major versions - refuse instead of corrupting.
  const marker = path.join(dbPath, '.codemaster-mongo-version');
  const hasData = fs.readdirSync(dbPath).some((f) => f.endsWith('.wt'));
  const previous = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : null;
  if (hasData && previous && majorMinor(previous) !== majorMinor(version)) {
    throw new Error(
      `The data in ${dbPath} was created by MongoDB ${previous}, but MongoDB ${version} is selected. ` +
        `Set EMBEDDED_MONGO_VERSION=${previous} in backend/.env, or move that folder away to start fresh.`,
    );
  }

  console.log(`[db] Starting embedded MongoDB ${version} on port ${port} (data: ${dbPath})${avx ? '' : ' - CPU without AVX detected'}`);
  console.log('[db] The first run downloads the MongoDB binary once - this can take a few minutes...');
  for (let attempt = 1; ; attempt++) {
    try {
      embedded = await MongoMemoryServer.create({
        binary: { version },
        instance: { dbPath, port, storageEngine: 'wiredTiger', launchTimeout: 60000 },
      });
      fs.writeFileSync(marker, version);
      dbInfo.version = version;
      return embedded.getUri();
    } catch (e) {
      // A previous dev-server process may still be releasing the data folder lock.
      if (attempt >= 8) throw e;
      console.warn(`[db] Embedded MongoDB not ready (${e.message.split('\n')[0]}), retrying...`);
      await sleep(1500);
    }
  }
}

function useDnsServers(servers) {
  dns.setServers(servers);
  dns.promises.setServers(servers);
}

/**
 * mongodb+srv:// needs DNS SRV records. Some Windows setups give Node a resolver
 * (often 127.0.0.1) that refuses SRV queries, so fall back to public DNS when that happens.
 * DNS_SERVERS=1.1.1.1,8.8.8.8 forces specific servers.
 */
async function prepareSrvDns(uri) {
  if (!uri.startsWith('mongodb+srv://')) return;
  const forced = env('DNS_SERVERS');
  if (forced) {
    useDnsServers(forced.split(',').map((s) => s.trim()).filter(Boolean));
    return;
  }
  const host = new URL(uri.replace(/^mongodb\+srv:\/\//, 'http://')).hostname;
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch (e) {
    const fallback = ['1.1.1.1', '8.8.8.8', '1.0.0.1'];
    console.warn(`[db] SRV lookup failed with the system DNS (${e.code}) - using public DNS ${fallback.join(', ')}`);
    useDnsServers(fallback);
  }
}

export async function connectDb() {
  let uri = env('MONGODB_URI');
  const dbName = env('MONGODB_DB', 'codemaster');
  if (!uri || uri.toLowerCase() === 'embedded') {
    uri = await startEmbedded();
    dbInfo.mode = 'embedded';
  } else {
    dbInfo.mode = /mongodb\.net/i.test(uri) ? 'atlas' : 'external';
    await prepareSrvDns(uri);
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
  dbInfo.uri = redact(uri);
  dbInfo.dbName = dbName;
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  console.log(`[db] Connected to MongoDB (${dbInfo.mode}) ${dbInfo.uri} / ${dbName}`);
}

export async function disconnectDb() {
  await mongoose.disconnect().catch(() => {});
  if (embedded) await embedded.stop({ doCleanup: false }).catch(() => {});
}

export const dbConnected = () => mongoose.connection.readyState === 1;
