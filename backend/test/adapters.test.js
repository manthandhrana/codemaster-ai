import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { callProvider } from '../src/ai/adapters.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const provider = { kind: 'openai', baseUrl: 'http://provider.test/v1', model: 'some-model', apiKey: 'k' };
const req = { system: 's', user: 'u', maxTokens: 100 };

function reply(status, body) {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function errorCode(status, body) {
  reply(status, body);
  const err = await callProvider(provider, req).then(
    () => assert.fail('expected an error'),
    (e) => e,
  );
  return err.code;
}

test('error codes: a bad key is provider-wide, paid/plan-only models are per-model', async () => {
  assert.equal(await errorCode(401, { errors: [{ code: 10000, message: 'Authentication error' }] }), 'auth');
  assert.equal(await errorCode(403, { error: { message: 'Invalid API key' } }), 'auth');
  // Cloudflare: model needs the Workers Paid plan
  assert.equal(
    await errorCode(403, { errors: [{ message: 'AiError: Model @cf/zai-org/glm-5.3 is not available on the Workers Free plan' }] }),
    'model_access',
  );
  // Z.ai answers 429 and SiliconFlow 403 when a paid model has no balance
  assert.equal(await errorCode(429, { error: { code: '1113', message: 'Insufficient balance or no resource package. Please recharge.' } }), 'quota');
  assert.equal(await errorCode(403, { code: 30001, message: 'Sorry, your account balance is insufficient', data: null }), 'quota');
  assert.equal(await errorCode(402, { error: { message: 'Insufficient Balance' } }), 'quota');
  assert.equal(
    await errorCode(429, { error: { code: 'credit_balance_exhausted', message: 'You have no credits remaining. Add credits to continue using the API' } }),
    'quota',
  );
  // Gemini free tier: per-minute limit worded as "quota" - must stay a short rate-limit cooldown
  assert.equal(
    await errorCode(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details.' } }),
    'rate_limit',
  );
  assert.equal(await errorCode(429, { error: { message: 'Rate limit reached, retry in 20s' } }), 'rate_limit');
  assert.equal(await errorCode(403, { code: 30003, message: 'Model disabled.', data: null }), 'model_access');
});

test('error codes: removed models are not_found, parameter errors stay bad_request', async () => {
  assert.equal(await errorCode(400, { code: 20012, message: 'Model does not exist. Please check it carefully.' }), 'not_found');
  assert.equal(await errorCode(400, { error: { message: 'openai/gpt-x is not a valid model ID' } }), 'not_found');
  assert.equal(await errorCode(400, { message: 'Invalid model: mistral-tiny-1' }), 'not_found');
  assert.equal(await errorCode(400, { error: { message: 'response_format is not supported by this model' } }), 'bad_request');
  assert.equal(await errorCode(400, { error: { message: 'max_tokens must be <= 4096 for this model' } }), 'bad_request');
});

test('Anthropic: an empty credit balance is a quota error, not a bad request', async () => {
  reply(400, {
    type: 'error',
    error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' },
  });
  await assert.rejects(callProvider({ kind: 'anthropic', model: 'claude-opus-5', apiKey: 'k' }, req), { code: 'quota' });
  // (new key = new SDK client: a client keeps the fetch it was created with)
  reply(400, { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: Field required' } });
  await assert.rejects(callProvider({ kind: 'anthropic', model: 'claude-opus-5', apiKey: 'k2' }, req), { code: 'bad_request' });
});

test('OpenAI-compatible: string, multi-part and already-parsed JSON content', async () => {
  reply(200, { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] });
  assert.equal((await callProvider(provider, req)).text, '{"ok":true}');

  reply(200, { choices: [{ message: { content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] } }] });
  assert.equal((await callProvider(provider, req)).text, '{"a":1}');

  // Workers AI returns JSON output as an object instead of a string for some models
  reply(200, { choices: [{ message: { content: { ok: true, sum: 5 } } }] });
  assert.equal((await callProvider(provider, req)).text, '{"ok":true,"sum":5}');

  reply(200, { choices: [{ message: { content: '' }, finish_reason: 'length' }] });
  await assert.rejects(callProvider(provider, req), { code: 'empty' });
});
