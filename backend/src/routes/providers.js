import { createHash } from 'node:crypto';
import { Router } from 'express';
import { env, envFiles, loadEnv } from '../config.js';
import { listModels } from '../ai/adapters.js';
import {
  getProviderDef,
  listResolvedProviders,
  maskKey,
  resolveProvider,
  setProviderOrder,
  setProviderOverride,
} from '../ai/providers.js';
import { aiComplete, modelList, providerHealth, resetHealth } from '../ai/router.js';
import { assistantPrompt } from '../services/promptLibrary.js';
import { getSetting, patchSetting, setSettingField } from '../services/settings.js';
import { providerCallsToday } from '../services/stats.js';
import { badRequest, clamp, notFound, toInt } from '../utils/misc.js';

const router = Router();

function resolvedOr404(id) {
  const def = getProviderDef(id);
  if (!def) throw notFound('Unknown provider');
  return resolveProvider(def);
}

// Fingerprint of the credentials a check ran with: a new key in .env makes the old result stale.
const keyHash = (p) =>
  createHash('sha256')
    .update([p.envKey, ...(p.requiredEnv || []), p.optionalKeyEnv || ''].map((k) => (k ? env(k) : '')).join('\n'))
    .digest('hex')
    .slice(0, 12);

/** Why a test failed, from the most to the least definitive cause. */
function failureState(failures = []) {
  const codes = new Set(failures.map((f) => f.code));
  if (codes.has('auth')) return 'invalid_key';
  if (['rate_limit', 'server', 'timeout', 'network', 'empty'].some((c) => codes.has(c))) return 'unavailable';
  if (codes.has('quota')) return 'no_credits';
  if (codes.has('model_access')) return 'plan_required';
  if (codes.has('not_found')) return 'model_missing';
  if (codes.has('invalid_output')) return 'bad_output';
  return 'error';
}

/** One tiny request per model (in order) to check the key, model and latency; the result is kept. */
async function testProvider(p) {
  resetHealth(p.id);
  const models = modelList(p.model);
  let result;
  try {
    const r = await aiComplete({
      purpose: 'test',
      only: p.id,
      maxAttempts: models.length,
      json: true,
      temperature: 0,
      maxTokens: 1024, // reasoning models (Qwen3, GLM, gpt-oss) think before answering
      ...assistantPrompt('test', {}),
    });
    result = { ok: true, state: 'working', latencyMs: r.latencyMs, model: r.model, reply: r.data, usage: r.usage, skipped: r.errors };
  } catch (e) {
    const failures = e.failures || [];
    // Each model usually fails the same way - show that once (request ids differ per call).
    const messages = (e.details || [e.message]).map((d) => d.replace(/^[^:]+:\s*/, '').replace(/\s*\(request_id: [^)]*\)/g, ''));
    result = { ok: false, state: failureState(failures), error: [...new Set(messages)].join(' | '), failures };
  }
  // Stamped when the test ends, so errors of models it skipped don't look newer than the result.
  const base = { at: new Date().toISOString(), modelSpec: p.model, keyHash: keyHash(p) };
  const { reply: _reply, usage: _usage, ...stored } = result;
  await setSettingField('providerChecks', p.id, { ...base, ...stored });
  return { ...base, ...result };
}

function publicCheck(p, check) {
  if (!check) return null;
  const { keyHash: hash, modelSpec, ...rest } = check;
  return { ...rest, stale: hash !== keyHash(p) || modelSpec !== p.model };
}

router.get('/', async (_req, res) => {
  const today = await providerCallsToday();
  const checks = getSetting('providerChecks');
  const providers = listResolvedProviders().map((p, index) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    tier: p.tier,
    priority: index + 1,
    envKey: p.envKey,
    requiredEnv: p.requiredEnv || [],
    optionalKeyEnv: p.optionalKeyEnv || null,
    modelEnv: p.modelEnv,
    keyUrl: p.keyUrl,
    note: p.note,
    configured: p.configured,
    missing: p.missing,
    enabled: p.enabled,
    model: p.model,
    defaultModel: getProviderDef(p.id).defaultModel,
    maxTokens: p.maxTokens,
    defaultMaxTokens: getProviderDef(p.id).maxTokens,
    maskedKey: maskKey(env(p.envKey)),
    models: modelList(p.model),
    health: providerHealth(p.id, modelList(p.model)),
    check: p.configured ? publicCheck(p, checks[p.id]) : null,
    today: today.get(p.id) || { calls: 0, ok: 0 },
  }));
  res.json({ settings: getSetting('ai'), providers, envFiles: envFiles() });
});

router.put('/settings', async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.strategy !== undefined) {
    if (!['priority', 'round_robin'].includes(b.strategy)) throw badRequest('Strategy must be priority or round_robin');
    patch.strategy = b.strategy;
  }
  if (b.maxAttempts !== undefined) patch.maxAttempts = clamp(toInt(b.maxAttempts, 6), 1, 20);
  if (b.timeoutMs !== undefined) patch.timeoutMs = clamp(toInt(b.timeoutMs, 120000), 10000, 600000);
  res.json(await patchSetting('ai', patch));
});

router.put('/order', async (req, res) => {
  if (!Array.isArray(req.body?.order)) throw badRequest('order must be an array of provider ids');
  res.json({ order: await setProviderOrder(req.body.order) });
});

router.post('/reload-env', (_req, res) => {
  const files = loadEnv();
  resetHealth();
  const list = listResolvedProviders();
  res.json({ files, configured: list.filter((p) => p.configured).length, total: list.length });
});

router.put('/:id', async (req, res) => {
  resolvedOr404(req.params.id);
  await setProviderOverride(req.params.id, req.body || {});
  resetHealth(req.params.id);
  res.json({ ok: true });
});

// Tests every provider that has a key (disabled ones too, so a topped-up account shows up as working).
router.post('/test-all', async (_req, res) => {
  const list = listResolvedProviders().filter((p) => p.configured);
  const results = await Promise.all(
    list.map(async (p) => {
      const { keyHash: _hash, modelSpec: _spec, ...r } = await testProvider(p);
      return { id: p.id, name: p.name, enabled: p.enabled, ...r };
    }),
  );
  res.json({ tested: results.length, working: results.filter((r) => r.ok).length, results });
});

router.post('/:id/test', async (req, res) => {
  const p = resolvedOr404(req.params.id);
  if (!p.configured) throw badRequest(`Set ${p.missing.join(', ')} in backend/.env first, then click "Reload .env".`);
  const { keyHash: _hash, modelSpec: _spec, ...r } = await testProvider(p);
  res.json(r);
});

router.get('/:id/models', async (req, res) => {
  const p = resolvedOr404(req.params.id);
  if (!p.configured) throw badRequest(`Set ${p.missing.join(', ')} in backend/.env first.`);
  try {
    const models = await listModels(p);
    res.json({ models: [...new Set(models)].slice(0, 500) });
  } catch (e) {
    throw badRequest(`Could not list models: ${e.message}`);
  }
});

export default router;
