import { AiLog, AiResponse } from '../db/models.js';
import { getSetting } from '../services/settings.js';
import { nowIso } from '../utils/time.js';
import { truncate, uid } from '../utils/misc.js';
import { callProvider } from './adapters.js';
import { parseJsonLoose, ValidationError } from './json.js';
import { listResolvedProviders } from './providers.js';

/**
 * In-memory health per provider. Rate-limited or unauthorized providers are "cooled down"
 * and tried last until the cooldown expires, so a dead key never slows every request.
 */
const health = new Map();
let rrCounter = 0;

function h(id) {
  if (!health.has(id)) health.set(id, { failures: 0, cooldownUntil: 0 });
  return health.get(id);
}

/** "a, b ,c" -> ['a','b','c'] - a provider can list several models for in-provider fallback. */
export const modelList = (model) =>
  String(model || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

const modelKey = (id, model) => `${id}:${model}`;
const coolingDown = (c, now = Date.now()) => h(c.id).cooldownUntil > now || h(modelKey(c.id, c.model)).cooldownUntil > now;

/** Provider-level health for the panel; model-level cooldowns are folded in. */
export function providerHealth(id, models = []) {
  const now = Date.now();
  const p = h(id);
  const entries = models.map((m) => [m, h(modelKey(id, m))]);
  const modelCooling = entries.filter(([, s]) => s.cooldownUntil > now);
  const allCooling = entries.length > 0 && modelCooling.length === entries.length;
  const latest = [p, ...entries.map(([, s]) => s)].filter((s) => s.lastErrorAt).sort((a, b) => (a.lastErrorAt < b.lastErrorAt ? 1 : -1))[0];
  const success = [p, ...entries.map(([, s]) => s)].filter((s) => s.lastSuccessAt).sort((a, b) => (a.lastSuccessAt < b.lastSuccessAt ? 1 : -1))[0];
  let cooldownUntil = p.cooldownUntil > now ? p.cooldownUntil : 0;
  let cooldownReason = cooldownUntil ? p.cooldownReason : null;
  if (!cooldownUntil && allCooling) {
    cooldownUntil = Math.min(...modelCooling.map(([, s]) => s.cooldownUntil));
    cooldownReason = `all models ${modelCooling[0][1].cooldownReason}`;
  }
  return {
    cooldownUntil: cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
    cooldownReason,
    coolingModels: modelCooling.map(([m, s]) => ({ model: m, until: new Date(s.cooldownUntil).toISOString(), reason: s.cooldownReason })),
    consecutiveFailures: p.failures,
    lastError: latest?.lastError || null,
    lastErrorAt: latest?.lastErrorAt || null,
    lastSuccessAt: success?.lastSuccessAt || null,
    lastLatencyMs: success?.lastLatencyMs ?? null,
  };
}

export function resetHealth(id) {
  if (!id) return health.clear();
  for (const key of [...health.keys()]) if (key === id || key.startsWith(`${id}:`)) health.delete(key);
}

function markSuccess(c, latency) {
  for (const key of [c.id, modelKey(c.id, c.model)]) {
    const s = h(key);
    s.failures = 0;
    s.cooldownUntil = 0;
    s.lastSuccessAt = nowIso();
    s.lastLatencyMs = latency;
  }
}

function markFailure(c, err) {
  // A bad key affects the whole provider; payment-required, overload, rate limits and missing
  // models only affect that one model (free tiers differ per model), so its siblings still run.
  const s = h(err.code === 'auth' ? c.id : modelKey(c.id, c.model));
  s.failures += 1;
  s.lastError = truncate(err.message, 300);
  s.lastErrorAt = nowIso();
  let cooldown = 0;
  let reason = '';
  if (err.code === 'rate_limit') {
    cooldown = Math.min(Math.max((err.retryAfter || 60) * 1000, 15000), 15 * 60000);
    reason = 'rate limited';
  } else if (err.code === 'auth' || err.code === 'quota') {
    cooldown = 10 * 60000;
    reason = err.code === 'auth' ? 'invalid API key' : 'quota exhausted';
  } else if (err.code === 'not_found') {
    cooldown = 5 * 60000;
    reason = 'model not found';
  } else if (err.code === 'model_access') {
    cooldown = 30 * 60000;
    reason = 'model not available on this plan';
  } else if (['server', 'timeout', 'network'].includes(err.code) && s.failures >= 3) {
    cooldown = 2 * 60000;
    reason = 'repeated errors';
  }
  if (cooldown) {
    s.cooldownUntil = Date.now() + cooldown;
    s.cooldownReason = reason;
  }
}

/** Raw model output, kept for auditing/re-processing (TTL-expired after 90 days). */
function recordResponse({ requestId, attempt, p, out, purpose, record, accepted, error }) {
  AiResponse.create({
    requestId,
    attempt,
    provider: p.id,
    model: out.model || p.model,
    purpose,
    promptKey: record.promptKey,
    promptVersion: record.promptVersion,
    accepted,
    error: error ? truncate(error, 1000) : undefined,
    finishReason: out.finishReason,
    raw: truncate(out.text, 200000),
  }).catch((e) => console.error('[ai] failed to store raw response:', e.message));
}

function logAttempt(entry) {
  AiLog.create({
    requestId: entry.requestId,
    attempt: entry.attempt,
    provider: entry.provider,
    model: entry.model,
    purpose: entry.purpose,
    success: Boolean(entry.success),
    statusCode: entry.status ?? undefined,
    error: entry.error ? truncate(entry.error, 500) : undefined,
    latencyMs: entry.latency,
    inputTokens: entry.input || 0,
    outputTokens: entry.output || 0,
    jobId: entry.jobId ?? undefined,
  }).catch((e) => console.error('[ai] failed to write usage log:', e.message));
}

/** One candidate per (provider, model) pair, in try order; cooling-down ones go last. */
const expand = (providers) => providers.flatMap((p) => modelList(p.model).map((model) => ({ ...p, model })));

export function candidateProviders(preferred) {
  const settings = getSetting('ai');
  let list = listResolvedProviders().filter((p) => p.enabled && p.configured);
  if (settings.strategy === 'round_robin' && list.length > 1) {
    const k = rrCounter++ % list.length;
    list = [...list.slice(k), ...list.slice(0, k)];
  }
  if (preferred && preferred !== 'auto') {
    const idx = list.findIndex((p) => p.id === preferred);
    if (idx > 0) list = [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
  }
  const all = expand(list);
  const now = Date.now();
  return [...all.filter((c) => !coolingDown(c, now)), ...all.filter((c) => coolingDown(c, now))];
}

export class NoProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NoProviderError';
    this.status = 503;
  }
}

/**
 * Sends one logical request through the provider chain with automatic fallback.
 *
 * @param opts.purpose     label stored in usage logs (generate_coding, hint, review, ...)
 * @param opts.json        parse the response as JSON (default true)
 * @param opts.validate    async (parsed, { isLast, provider }) => value; throw to reject and try the next provider
 * @param opts.onEvent     ({ level, msg }) => void - live progress for job logs
 * @param opts.preferred   provider id to try first ('auto' = admin priority order)
 * @param opts.only        restrict to exactly this provider (used by "Test" button)
 * @param opts.record      { promptKey, promptVersion } - store every raw response in `airesponses`
 */
export async function aiComplete(opts) {
  const {
    purpose = 'general',
    system,
    user,
    json = true,
    temperature = 0.7,
    maxTokens,
    validate,
    onEvent,
    preferred,
    only,
    jobId,
    record,
    maxAttempts: maxAttemptsOverride,
  } = opts;
  const settings = getSetting('ai');
  let candidates = candidateProviders(preferred);
  if (only) candidates = expand(listResolvedProviders().filter((p) => p.id === only && p.configured));
  if (!candidates.length) {
    throw new NoProviderError('No AI provider is configured/enabled. Add at least one API key in backend/.env and reload.');
  }

  const maxAttempts = Math.max(1, Math.min(maxAttemptsOverride || settings.maxAttempts || 8, candidates.length));
  const requestId = uid();
  const errors = [];
  const failures = []; // same as errors, with the error code (panel status: no credits, bad key, ...)

  for (let i = 0; i < maxAttempts; i++) {
    const p = candidates[i];
    const isLast = i === maxAttempts - 1;
    const tokens = Math.min(maxTokens || p.maxTokens, p.maxTokens);
    onEvent?.({ level: 'info', msg: `→ Trying ${p.name} (${p.model})` });
    const t0 = Date.now();
    let out = null;
    let latency = 0;
    try {
      out = await callProvider(p, {
        system,
        user,
        json,
        temperature,
        maxTokens: tokens,
        // Slow free tiers (e.g. Z.ai flash models) declare a longer timeoutMs of their own.
        signal: AbortSignal.timeout(Math.max(settings.timeoutMs || 120000, p.timeoutMs || 0)),
      });
      latency = Date.now() - t0; // AI latency only (validation may run code afterwards)
      onEvent?.({ level: 'info', msg: `← ${p.name} responded in ${(latency / 1000).toFixed(1)}s, checking the output…` });
      let data = json ? parseJsonLoose(out.text) : out.text;
      if (validate) data = await validate(data, { isLast, provider: p });
      markSuccess(p, latency);
      if (record) recordResponse({ requestId, attempt: i + 1, p, out, purpose, record, accepted: true });
      logAttempt({
        requestId,
        attempt: i + 1,
        provider: p.id,
        model: out.model || p.model,
        purpose,
        success: true,
        latency,
        input: out.usage?.input,
        output: out.usage?.output,
        jobId,
      });
      return {
        data,
        text: out.text,
        provider: p.id,
        providerName: p.name,
        model: out.model || p.model,
        latencyMs: latency,
        usage: out.usage,
        attempts: i + 1,
        requestId,
        errors,
        failures,
      };
    } catch (err) {
      if (!latency) latency = Date.now() - t0;
      const invalid = err instanceof ValidationError;
      const message = invalid ? `Invalid output: ${err.message}` : err.message;
      if (!invalid) markFailure(p, err);
      if (record && out) recordResponse({ requestId, attempt: i + 1, p, out, purpose, record, accepted: false, error: message });
      logAttempt({
        requestId,
        attempt: i + 1,
        provider: p.id,
        model: out?.model || p.model,
        purpose,
        success: false,
        status: err.status,
        error: message,
        latency,
        input: out?.usage?.input,
        output: out?.usage?.output,
        jobId,
      });
      errors.push(`${p.name}: ${truncate(message, 200)}`);
      failures.push({ provider: p.id, model: p.model, code: invalid ? 'invalid_output' : err.code || 'error', message: truncate(message, 300) });
      onEvent?.({
        level: 'warn',
        msg: `✗ ${p.name} ${invalid ? 'output rejected' : 'failed'} - ${truncate(message, 160)}${isLast ? '' : ' → switching to next AI'}`,
      });
    }
  }
  const e = new Error(`All AI providers failed:\n${errors.join('\n')}`);
  e.status = 502;
  e.details = errors;
  e.failures = failures;
  throw e;
}
