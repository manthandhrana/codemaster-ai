import Anthropic from '@anthropic-ai/sdk';

/** Normalized provider error. `code` drives the router's cooldown/fallback decisions. */
export class AIError extends Error {
  constructor(message, { status, code = 'error', retryAfter } = {}) {
    super(message);
    this.name = 'AIError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// A paid model/account with no balance: DeepSeek 402, Z.ai/OpenAI 429, SiliconFlow 403, Anthropic 400.
// Gemini's free-tier 429 also says "exceeded your current quota" but resets within a minute, so it stays a rate limit.
const NO_BALANCE = /insufficient.{0,20}balance|balance.{0,20}insufficient|credit balance is too low|recharge|no resource package|no credits remaining|out of credits/i;
const NO_BALANCE_CODES = /^(insufficient_quota|credit_balance_exhausted|billing_hard_limit_reached)$/;

function classify(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 404) return 'not_found';
  if (status === 400 || status === 413 || status === 422) return 'bad_request';
  if (status === 402) return 'quota';
  if (status >= 500) return 'server';
  return 'error';
}

async function errorFromResponse(res) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  let msg = text;
  let errCode = '';
  try {
    const j = JSON.parse(text);
    msg = j.error?.message || j.message || j.error || j.detail || j.errors?.[0]?.message || text;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    errCode = String(j.error?.code ?? j.code ?? '');
  } catch {
    /* not JSON */
  }
  const retryAfter = Number(res.headers.get('retry-after')) || undefined;
  let code = classify(res.status);
  // Per-model problems where the key itself is fine (free models still work): a paid model with
  // no balance and "model X is not on your plan" (403).
  if (NO_BALANCE_CODES.test(errCode) || NO_BALANCE.test(msg)) code = 'quota';
  else if (res.status === 403 && /model/i.test(msg)) code = 'model_access';
  // A removed/renamed model often comes back as a plain 400; keep real parameter errors as
  // bad_request so the compatibility retry below still gets them.
  else if (
    code === 'bad_request' &&
    /model.{0,80}(does ?n[o']t exist|not exist|not found|not supported|is not a valid)|(invalid|unknown|unsupported) model|not a valid model/i.test(msg) &&
    !/response_format|json|max_(completion_)?tokens|temperature|tool/i.test(msg)
  )
    code = 'not_found';
  return new AIError(`HTTP ${res.status}: ${String(msg || res.statusText).slice(0, 400)}`, {
    status: res.status,
    code,
    retryAfter,
  });
}

function networkError(e) {
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return new AIError('Request timed out', { code: 'timeout' });
  return new AIError(`Network error: ${e?.cause?.code || e?.cause?.message || e?.message}`, { code: 'network' });
}

async function http(method, url, headers, body, signal) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await errorFromResponse(res);
  try {
    return await res.json();
  } catch {
    throw new AIError('Provider returned a non-JSON response', { code: 'bad_response' });
  }
}

// ---------------------------------------------------------------- OpenAI-compatible

async function callOpenAICompatible(p, req) {
  const headers = { ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}), ...(p.headers || {}) };
  const body = {
    model: p.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    temperature: req.temperature,
    max_tokens: req.maxTokens,
  };
  if (req.json && p.jsonMode) body.response_format = { type: 'json_object' };

  let data;
  try {
    data = await http('POST', `${p.baseUrl}/chat/completions`, headers, body, req.signal);
  } catch (e) {
    if (e.code !== 'bad_request') throw e;
    // Compatibility retry: some models reject json mode, max_tokens or temperature.
    const m = e.message.toLowerCase();
    let changed = false;
    if (body.response_format && (m.includes('response_format') || m.includes('json') || !/max_tokens|temperature/.test(m))) {
      delete body.response_format;
      changed = true;
    }
    if (m.includes('max_tokens') || m.includes('max_completion_tokens')) {
      body.max_completion_tokens = body.max_tokens;
      delete body.max_tokens;
      changed = true;
    }
    if (m.includes('temperature')) {
      delete body.temperature;
      changed = true;
    }
    if (!changed) throw e;
    data = await http('POST', `${p.baseUrl}/chat/completions`, headers, body, req.signal);
  }

  const choice = data.choices?.[0];
  let text = choice?.message?.content;
  if (Array.isArray(text)) text = text.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  else if (text && typeof text === 'object') text = JSON.stringify(text); // Workers AI hands back already-parsed JSON
  if (!text) text = choice?.text || '';
  if (!text) {
    throw new AIError(`Empty response (finish_reason: ${choice?.finish_reason || 'unknown'})`, { code: 'empty' });
  }
  return {
    text,
    finishReason: choice?.finish_reason,
    usage: { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 },
    model: data.model || p.model,
  };
}

// ---------------------------------------------------------------- Google Gemini (native)

async function callGemini(p, req) {
  const model = p.model.replace(/^models\//, '');
  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.user }] }],
    generationConfig: {
      temperature: req.temperature,
      maxOutputTokens: req.maxTokens,
      ...(req.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const data = await http(
    'POST',
    `${p.baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': p.apiKey },
    body,
    req.signal,
  );
  if (data.promptFeedback?.blockReason) {
    throw new AIError(`Blocked by Gemini: ${data.promptFeedback.blockReason}`, { code: 'refusal' });
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || [])
    .filter((part) => !part.thought)
    .map((part) => part.text || '')
    .join('');
  if (!text) throw new AIError(`Empty response (finishReason: ${cand?.finishReason || 'unknown'})`, { code: 'empty' });
  const u = data.usageMetadata || {};
  return {
    text,
    finishReason: cand?.finishReason,
    usage: { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
    model: data.modelVersion || model,
  };
}

// ---------------------------------------------------------------- Cohere v2

async function callCohere(p, req) {
  const body = {
    model: p.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    ...(req.json ? { response_format: { type: 'json_object' } } : {}),
  };
  const data = await http('POST', `${p.baseUrl}/chat`, { Authorization: `Bearer ${p.apiKey}` }, body, req.signal);
  const text = (data.message?.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('');
  if (!text) throw new AIError(`Empty response (finish_reason: ${data.finish_reason || 'unknown'})`, { code: 'empty' });
  const tokens = data.usage?.tokens || data.usage?.billed_units || {};
  return {
    text,
    finishReason: data.finish_reason,
    usage: { input: tokens.input_tokens || 0, output: tokens.output_tokens || 0 },
    model: p.model,
  };
}

// ---------------------------------------------------------------- Anthropic (official SDK)

const anthropicClients = new Map();
function anthropicClient(apiKey) {
  if (!anthropicClients.has(apiKey)) {
    // The router owns retries and provider fallback, so disable SDK-level retries.
    anthropicClients.set(apiKey, new Anthropic({ apiKey, maxRetries: 0 }));
  }
  return anthropicClients.get(apiKey);
}

// Server-side refusal fallbacks are available for the Opus 5 / Fable 5 family.
const supportsServerFallbacks = (model) => /^claude-(opus-5|fable-5)/.test(model);

async function callAnthropic(p, req) {
  const client = anthropicClient(p.apiKey);
  // No temperature: sampling parameters are rejected by current Claude models.
  const params = {
    model: p.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
  };
  let message;
  try {
    // Streaming avoids HTTP timeouts on long generations.
    const stream = supportsServerFallbacks(p.model)
      ? client.beta.messages.stream(
          { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
          { signal: req.signal },
        )
      : client.messages.stream(params, { signal: req.signal });
    message = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) throw new AIError('Request timed out', { code: 'timeout' });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new AIError(`Auth failed: ${e.message}`, { status: e.status, code: 'auth' });
    }
    if (e instanceof Anthropic.RateLimitError) {
      const ra = typeof e.headers?.get === 'function' ? e.headers.get('retry-after') : e.headers?.['retry-after'];
      throw new AIError(`Rate limited: ${e.message}`, { status: 429, code: 'rate_limit', retryAfter: Number(ra) || undefined });
    }
    if (e instanceof Anthropic.NotFoundError) throw new AIError(`Not found: ${e.message}`, { status: 404, code: 'not_found' });
    if (e instanceof Anthropic.BadRequestError) {
      throw new AIError(`Bad request: ${e.message}`, { status: 400, code: NO_BALANCE.test(e.message) ? 'quota' : 'bad_request' });
    }
    if (e instanceof Anthropic.APIConnectionError) throw new AIError(`Network error: ${e.message}`, { code: 'network' });
    if (e instanceof Anthropic.APIError) {
      throw new AIError(`API error ${e.status}: ${e.message}`, { status: e.status, code: e.status >= 500 ? 'server' : 'error' });
    }
    throw e;
  }
  // Check stop_reason before reading content: a refusal can arrive with empty or partial content.
  if (message.stop_reason === 'refusal') {
    throw new AIError('Claude declined this request (stop_reason: refusal)', { code: 'refusal' });
  }
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!text) throw new AIError(`Empty response (stop_reason: ${message.stop_reason})`, { code: 'empty' });
  return {
    text,
    finishReason: message.stop_reason,
    usage: { input: message.usage?.input_tokens || 0, output: message.usage?.output_tokens || 0 },
    model: message.model || p.model,
  };
}

// ---------------------------------------------------------------- public API

const ADAPTERS = {
  openai: callOpenAICompatible,
  gemini: callGemini,
  cohere: callCohere,
  anthropic: callAnthropic,
};

/**
 * @param p   resolved provider (see resolveProvider)
 * @param req { system, user, json, temperature, maxTokens, signal }
 */
export function callProvider(p, req) {
  const adapter = ADAPTERS[p.kind];
  if (!adapter) throw new AIError(`Unknown provider kind: ${p.kind}`);
  return adapter(p, req);
}

/** Lists model ids available to the configured key (best effort; format differs per provider). */
export async function listModels(p) {
  const signal = AbortSignal.timeout(20000);
  if (p.kind === 'anthropic') {
    const ids = [];
    for await (const m of anthropicClient(p.apiKey).models.list()) ids.push(m.id);
    return ids;
  }
  if (p.kind === 'gemini') {
    const data = await http('GET', `${p.baseUrl}/models?pageSize=1000`, { 'x-goog-api-key': p.apiKey }, null, signal);
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));
  }
  const headers = p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {};
  const data = await http('GET', p.modelsUrl, headers, null, signal);
  let arr = Array.isArray(data) ? data : data.data || data.models || data.result || [];
  if (p.id === 'cloudflare') {
    // Models flagged require_workers_paid answer 403 on the free plan - list them last.
    const paid = (m) => (m.properties || []).some((x) => x.property_id === 'require_workers_paid' && String(x.value) === 'true');
    arr = [...arr.filter((m) => !paid(m)), ...arr.filter(paid)];
  }
  let ids = arr.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
  if (p.id === 'openrouter') ids = [...ids.filter((id) => id.endsWith(':free')), ...ids.filter((id) => !id.endsWith(':free'))];
  return ids;
}
