import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = path.resolve(here, '..');
export const FRONTEND_DIST = path.resolve(BACKEND_DIR, '../frontend/dist');

// Variables that already exist in the real OS environment always win over .env files.
const EXTERNAL_KEYS = new Set(Object.keys(process.env));

/** development (npm run dev) | production (npm start, or NODE_ENV=production) */
export const MODE = process.env.NODE_ENV || (process.argv.includes('--production') ? 'production' : 'development');
process.env.NODE_ENV = MODE;
export const IS_PROD = MODE === 'production';

/** Load order - later files override earlier ones (same convention as Vite). */
export const ENV_FILES = ['.env', '.env.local', `.env.${MODE}`, `.env.${MODE}.local`];
export const ENV_PATH = path.join(BACKEND_DIR, '.env');

const loadedFromFiles = new Set();
let loadedFiles = [];

/**
 * (Re)loads the .env files. Keys removed from the files are removed from process.env too,
 * so "Reload .env" in the admin panel behaves like a restart for API keys.
 */
export function loadEnv() {
  const merged = {};
  const used = [];
  for (const name of ENV_FILES) {
    const file = path.join(BACKEND_DIR, name);
    if (!fs.existsSync(file)) continue;
    Object.assign(merged, dotenv.parse(fs.readFileSync(file)));
    used.push(name);
  }
  for (const key of loadedFromFiles) {
    if (!(key in merged)) {
      delete process.env[key];
      loadedFromFiles.delete(key);
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    if (EXTERNAL_KEYS.has(key)) continue;
    process.env[key] = value;
    loadedFromFiles.add(key);
  }
  loadedFiles = used;
  return used;
}
loadEnv();

export const envFiles = () => loadedFiles;

export function env(key, fallback = '') {
  const v = process.env[key];
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  return s === '' ? fallback : s;
}

export const config = {
  port: Number(env('PORT', '5050')),
  host: env('HOST', '127.0.0.1'),
  clientOrigins: env('CLIENT_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  dbPath: path.resolve(BACKEND_DIR, env('DB_PATH', './data/codemaster.db')),
  jwtExpiresIn: env('JWT_EXPIRES_IN', '7d'),
  requestLogs: env('REQUEST_LOGS', IS_PROD ? 'false' : 'true').toLowerCase() === 'true',
};

let tempSecret = null;
export function jwtSecret() {
  const s = env('JWT_SECRET');
  if (s && !s.startsWith('replace-with')) return s;
  if (!tempSecret) {
    tempSecret = crypto.randomBytes(48).toString('hex');
    console.warn('[config] JWT_SECRET is not set - using a temporary secret (you will be logged out on restart).');
  }
  return tempSecret;
}

export const adminPassword = () => env('ADMIN_PASSWORD');
export const adminPasswordHash = () => env('ADMIN_PASSWORD_HASH');
export const adminEmail = () => env('ADMIN_EMAIL').toLowerCase();

/** Express "trust proxy": loopback (default) | true | <number of hops> | comma list of IPs/subnets. */
export function trustProxy() {
  const v = env('TRUST_PROXY', 'loopback');
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
