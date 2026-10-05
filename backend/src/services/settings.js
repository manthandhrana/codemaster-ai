import { Setting } from '../db/models.js';

export const DEFAULT_SETTINGS = {
  ai: {
    strategy: 'priority', // priority | round_robin
    maxAttempts: 8, // max (provider, model) attempts for a single request
    timeoutMs: 120000,
  },
  providers: {
    order: [], // provider ids by priority; unknown/new providers are appended
    overrides: {}, // { [id]: { enabled, model, maxTokens } }
  },
  providerChecks: {}, // { [id]: last "Test" result } - survives restarts so the panel shows what really works
  executor: {
    order: ['local', 'wandbox', 'judge0', 'piston'],
    enabled: { local: true, wandbox: true, judge0: true, piston: true },
    timeLimitMs: 5000,
    verifyGenerated: true,
    aiJudge: true,
  },
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

// Settings are read on every AI/executor call, so they live in memory and are written through to MongoDB.
const cache = new Map();

export async function loadSettings() {
  const rows = await Setting.find().lean();
  cache.clear();
  for (const row of rows) cache.set(row._id, row.value);
}

export function getSetting(key) {
  return deepMerge(DEFAULT_SETTINGS[key] ?? {}, cache.get(key) ?? {});
}

export async function setSetting(key, value) {
  cache.set(key, value);
  await Setting.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
  return getSetting(key);
}

export async function patchSetting(key, patch) {
  return setSetting(key, deepMerge(getSetting(key), patch));
}

/** Sets one field of an object setting without rewriting the whole document (safe for parallel writers). */
export async function setSettingField(key, field, value) {
  cache.set(key, { ...(cache.get(key) ?? {}), [field]: value });
  await Setting.updateOne({ _id: key }, { $set: { [`value.${field}`]: value } }, { upsert: true });
}
