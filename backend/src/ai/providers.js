import { env } from '../config.js';
import { getSetting, setSetting } from '../services/settings.js';

/**
 * Registry of AI providers. `kind` selects the adapter:
 *  - openai    : any OpenAI-compatible /chat/completions endpoint
 *  - gemini    : Google Generative Language API (native)
 *  - cohere    : Cohere v2 chat API
 *  - anthropic : Anthropic Messages API via the official SDK
 * Keys always come from backend/.env. Models can be overridden from the admin panel
 * (or with <ID>_MODEL in .env).
 */
export const PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'gemini',
    tier: 'free',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    // Each Gemini model has its own free quota - several models = more free capacity.
    defaultModel: 'gemini-3.8-flash,gemini-3.5-flash,gemini-3.1-flash-lite',
    maxTokens: 16384,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Generous free tier (Google AI Studio). Every model has a separate quota.',
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai',
    tier: 'free',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b',
    jsonMode: true,
    maxTokens: 8192,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Extremely fast LPU inference, free tier with rate limits.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    kind: 'openai',
    tier: 'free',
    envKey: 'CEREBRAS_API_KEY',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'gpt-oss-120b',
    jsonMode: true,
    maxTokens: 8192,
    keyUrl: 'https://cloud.cerebras.ai',
    note: 'Very fast free tier.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (free models)',
    kind: 'openai',
    tier: 'free',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'qwen/qwen3.8-27b:free,nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free',
    headers: { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'CodeMaster AI' },
    maxTokens: 8192,
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Use any model id ending in ":free".',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    kind: 'openai',
    tier: 'free',
    envKey: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    jsonMode: true,
    maxTokens: 8192,
    keyUrl: 'https://console.mistral.ai/api-keys',
    note: 'Free "Experiment" plan.',
  },
  {
    id: 'sambanova',
    name: 'SambaNova Cloud',
    kind: 'openai',
    tier: 'free',
    envKey: 'SAMBANOVA_API_KEY',
    baseUrl: 'https://api.sambanova.ai/v1',
    // Free accounts: most models need a payment method (402) - these answer without one.
    defaultModel: 'gemma-4-31B-it,MiniMax-M3',
    maxTokens: 8192,
    keyUrl: 'https://cloud.sambanova.ai/apis',
    note: 'Free tier: Gemma 4 and MiniMax run without a card; other models need billing.',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    kind: 'openai',
    tier: 'free',
    envKey: 'NVIDIA_API_KEY',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    maxTokens: 4096,
    keyUrl: 'https://build.nvidia.com',
    note: 'Free developer credits.',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    kind: 'cohere',
    tier: 'free',
    envKey: 'COHERE_API_KEY',
    baseUrl: 'https://api.cohere.com/v2',
    modelsUrl: 'https://api.cohere.com/v1/models?endpoint=chat',
    defaultModel: 'command-a-03-2025,command-a-plus-05-2026,north-mini-code-1-0',
    maxTokens: 8000,
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    note: 'Free trial key.',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    kind: 'openai',
    tier: 'free',
    envKey: 'HF_TOKEN',
    baseUrl: 'https://router.huggingface.co/v1',
    defaultModel: 'openai/gpt-oss-120b,deepseek-ai/DeepSeek-V3.2,Qwen/Qwen3-Coder-30B-A3B-Instruct',
    maxTokens: 4096,
    keyUrl: 'https://huggingface.co/settings/tokens',
    note: 'Inference Providers router, monthly free credits.',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    kind: 'openai',
    tier: 'free',
    envKey: 'CLOUDFLARE_API_TOKEN',
    requiredEnv: ['CLOUDFLARE_ACCOUNT_ID'],
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1',
    modelsUrl:
      'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/models/search?task=Text%20Generation&per_page=100',
    defaultModel: '@cf/openai/gpt-oss-120b,@cf/qwen/qwen3.8-27b,@cf/zai-org/glm-4.7-flash',
    maxTokens: 8192,
    keyUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    note: 'Free daily allowance (10k neurons). Needs CLOUDFLARE_ACCOUNT_ID and a "Workers AI" token. Kimi, GLM-5.x and DeepSeek-V4 need the Workers Paid plan.',
  },
  {
    id: 'zai',
    name: 'Z.ai (Zhipu GLM)',
    kind: 'openai',
    tier: 'free',
    envKey: 'ZAI_API_KEY',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-4.7-flash,glm-4.5-flash',
    maxTokens: 8192,
    timeoutMs: 300000, // the free flash models are slow and think before answering
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
    note: 'Official GLM API - glm-4.7-flash and glm-4.5-flash are free (slow; flashx/5.x need balance).',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    kind: 'openai',
    tier: 'free',
    envKey: 'SILICONFLOW_API_KEY',
    baseUrl: 'https://api.siliconflow.com/v1',
    defaultModel: 'Qwen/Qwen3-8B,Qwen/Qwen2.5-7B-Instruct',
    maxTokens: 8192,
    keyUrl: 'https://cloud.siliconflow.com/account/ak',
    note: 'Qwen3-8B and Qwen2.5-7B are free (small - last-resort fallback). With balance, add e.g. moonshotai/Kimi-K2.7-Code first.',
  },
  {
    id: 'together',
    name: 'Together AI',
    kind: 'openai',
    tier: 'free',
    envKey: 'TOGETHER_API_KEY',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    jsonMode: true,
    maxTokens: 8192,
    keyUrl: 'https://api.together.ai/settings/api-keys',
    note: 'Has free "-Free" model endpoints.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    tier: 'paid',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash,deepseek-v4-pro',
    jsonMode: true,
    maxTokens: 8192,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: 'Very cheap, strong at coding - needs a topped-up balance (402 "Insufficient Balance" otherwise).',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    tier: 'paid',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    jsonMode: true,
    maxTokens: 16000,
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Paid.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    kind: 'anthropic',
    tier: 'paid',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-5',
    maxTokens: 16000,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Paid. Uses the official SDK with streaming + server-side refusal fallbacks.',
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    kind: 'openai',
    tier: 'local',
    envKey: 'OLLAMA_BASE_URL',
    keyIsUrl: true,
    defaultModel: 'qwen2.5-coder:7b',
    maxTokens: 8192,
    keyUrl: 'https://ollama.com/download',
    note: 'Runs models on your own PC - set OLLAMA_BASE_URL=http://localhost:11434',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    kind: 'openai',
    tier: 'custom',
    envKey: 'CUSTOM_AI_BASE_URL',
    keyIsUrl: true,
    optionalKeyEnv: 'CUSTOM_AI_API_KEY',
    defaultModel: '',
    maxTokens: 8192,
    keyUrl: '',
    note: 'Any OpenAI-compatible API: set CUSTOM_AI_BASE_URL, CUSTOM_AI_API_KEY, CUSTOM_AI_MODEL.',
  },
];

export const getProviderDef = (id) => PROVIDERS.find((p) => p.id === id);

const modelEnvKey = (p) => (p.id === 'custom' ? 'CUSTOM_AI_MODEL' : `${p.id.toUpperCase()}_MODEL`);

function fillTemplate(url) {
  return url.replace(/\{(\w+)\}/g, (_, k) => env(k));
}

/** Resolved runtime config for a provider (never sent to the browser as-is: contains the key). */
export function resolveProvider(p) {
  const overrides = getSetting('providers').overrides[p.id] || {};
  const primary = env(p.envKey);
  const missing = [];
  if (!primary) missing.push(p.envKey);
  for (const k of p.requiredEnv || []) if (!env(k)) missing.push(k);

  let baseUrl = p.baseUrl ? fillTemplate(p.baseUrl) : '';
  let apiKey = primary;
  if (p.keyIsUrl) {
    baseUrl = primary.replace(/\/+$/, '');
    if (p.id === 'ollama' && baseUrl && !/\/v1$/.test(baseUrl)) baseUrl += '/v1';
    apiKey = p.optionalKeyEnv ? env(p.optionalKeyEnv) : '';
  }
  const model = overrides.model || env(modelEnvKey(p)) || p.defaultModel;
  if (!model) missing.push(modelEnvKey(p));

  return {
    ...p,
    baseUrl,
    modelsUrl: p.modelsUrl ? fillTemplate(p.modelsUrl) : baseUrl ? `${baseUrl}/models` : '',
    apiKey,
    model,
    maxTokens: Number(overrides.maxTokens) || p.maxTokens || 8192,
    enabled: overrides.enabled !== false,
    configured: missing.length === 0,
    missing,
    modelEnv: modelEnvKey(p),
  };
}

export function providerOrder() {
  const saved = getSetting('providers').order.filter((id) => getProviderDef(id));
  for (const p of PROVIDERS) if (!saved.includes(p.id)) saved.push(p.id);
  return saved;
}

export async function setProviderOrder(order) {
  const current = getSetting('providers');
  const valid = order.filter((id) => getProviderDef(id));
  await setSetting('providers', { ...current, order: [...new Set(valid)] });
  return providerOrder();
}

export async function setProviderOverride(id, patch) {
  const current = getSetting('providers');
  const next = { ...(current.overrides[id] || {}) };
  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);
  if (patch.model !== undefined) {
    const model = String(patch.model || '').trim();
    if (model) next.model = model;
    else delete next.model;
  }
  if (patch.maxTokens !== undefined) {
    const n = Number(patch.maxTokens);
    if (n > 0) next.maxTokens = n;
    else delete next.maxTokens;
  }
  await setSetting('providers', { ...current, overrides: { ...current.overrides, [id]: next } });
}

/** All providers resolved and sorted by admin priority. */
export function listResolvedProviders() {
  return providerOrder().map((id) => resolveProvider(getProviderDef(id)));
}

export function maskKey(key) {
  if (!key) return '';
  if (/^https?:\/\//.test(key)) return key;
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
