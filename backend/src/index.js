import { adminEmail, adminPassword, adminPasswordHash, config, envFiles, IS_PROD, MODE } from './config.js';
import { libraryInfo } from './services/prompts.js';
import { listResolvedProviders } from './ai/providers.js';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db/mongo.js';
import { seed } from './db/seed.js';
import { detectRuntimes, localLanguages } from './executor/local.js';
import { recoverInterruptedJobs } from './services/jobs.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { getSetting, loadSettings } from './services/settings.js';

async function main() {
  console.log(`\n⚡ CodeMaster AI backend - ${MODE} mode (env: ${envFiles().join(' -> ') || 'no .env files found'})`);
  if (!adminPassword() && !adminPasswordHash()) console.warn('⚠  Neither ADMIN_PASSWORD nor ADMIN_PASSWORD_HASH is set - login will fail.');
  else if (IS_PROD && !adminPasswordHash()) console.warn('⚠  Production uses a plain ADMIN_PASSWORD - prefer ADMIN_PASSWORD_HASH (npm run hash-password).');
  if (adminPassword() === 'CodeMaster@2026') console.warn('⚠  You are using the old default ADMIN_PASSWORD - change it.');
  console.log(`🔐 Admin login: ${adminEmail() || '(no email - password only)'} · ${adminPasswordHash() ? 'scrypt password hash' : 'plain password'}`);

  await connectDb();
  await loadSettings();
  await recoverInterruptedJobs();
  await seed();
  await detectRuntimes();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`🚀 API ready on http://${config.host}:${config.port}/api`);
  });
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `❌ Port ${config.port} is already in use (change PORT in .env)` : `❌ ${e.message}`);
    process.exit(1);
  });

  await startScheduler();

  const providers = listResolvedProviders();
  const ready = providers.filter((p) => p.configured && p.enabled);
  console.log(
    `🤖 AI providers ready: ${ready.length}/${providers.length}${ready.length ? ` - ${ready.map((p) => p.name).join(', ')}` : ' - add API keys in backend/.env'}`,
  );
  // From the last "Test" on the AI Providers page (kept in MongoDB).
  const checks = getSetting('providerChecks');
  const failing = ready.filter((p) => checks[p.id] && !checks[p.id].ok);
  const disabled = providers.filter((p) => p.configured && !p.enabled);
  if (failing.length) console.log(`   ⚠️  last test failed: ${failing.map((p) => `${p.name} (${checks[p.id].state})`).join(', ')}`);
  if (disabled.length) console.log(`   ⏸️  disabled: ${disabled.map((p) => p.name).join(', ')}`);
  console.log(`🧪 Local code runners: ${localLanguages().join(', ')} (other languages: Wandbox -> Judge0 -> Piston -> AI judge)`);
  const lib = libraryInfo();
  console.log(
    `📝 Prompt library: ${lib.templates} templates, ${lib.assistant.length} assistant prompts, ${lib.schemas.length} schemas${lib.errors.length ? ` - ⚠ ${lib.errors.length} problem(s), see above` : ''}`,
  );

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n${signal} received - shutting down...`);
    stopScheduler();
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(async (e) => {
  console.error('❌ Failed to start:', e);
  await disconnectDb();
  process.exit(1);
});
