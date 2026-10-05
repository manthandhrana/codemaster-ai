import { ValidationError } from '../ai/json.js';
import { aiComplete } from '../ai/router.js';
import { AiResponse } from '../db/models.js';
import { canExecuteLocally } from '../executor/index.js';
import { verifyCodingQuestion } from '../executor/judge.js';
import { truncate } from '../utils/misc.js';
import { normalizeCoding, normalizeMcqList } from './normalize.js';
import { buildGenerationPrompt } from './prompts.js';
import { createQuestion, recentTitles, titleExists, uniqueTitle } from './questions.js';
import { getSetting } from './settings.js';
import { assertSchema, QUESTION_SCHEMA_VERSION } from './validate.js';

export { normalizeCoding, normalizeMcqList };

/** Same metadata on every generated question, whichever provider answered. */
function generationMeta(res, prompt) {
  return {
    provider: res.provider,
    providerName: res.providerName,
    model: res.model,
    promptKey: prompt?.builtinKey || `custom:${prompt?.id}`,
    promptName: prompt?.name,
    promptVersion: prompt?.version || 1,
    requestId: res.requestId,
    attempts: res.attempts,
    latencyMs: res.latencyMs,
    inputTokens: res.usage?.input || 0,
    outputTokens: res.usage?.output || 0,
    generatedAt: new Date().toISOString(),
  };
}

const linkResponse = (requestId, ids) =>
  AiResponse.updateMany({ requestId, accepted: true }, { $set: { questionIds: ids } }).catch(() => {});

/**
 * Generates, validates, verifies and stores ONE coding problem.
 * @param task { difficulty, language, topic, promptId, extra, provider }
 * @param ctx  { jobId, source, scheduleId, batchDate, log, dryRun }
 */
export async function generateCodingQuestion(task, ctx = {}) {
  const { difficulty, language, topic, promptId, extra, provider } = task;
  const avoid = await recentTitles('coding', 40);
  // When the language cannot run on this machine, also ask for a Node.js reference so tests can be verified locally.
  const withReferenceJs = !canExecuteLocally(language) && !['javascript', 'typescript'].includes(language);
  const { system, user, prompt } = await buildGenerationPrompt({
    type: 'coding',
    difficulty,
    language,
    topic,
    count: 1,
    promptId,
    extra,
    avoid,
    withReferenceJs,
  });
  const verify = ctx.verify ?? getSetting('executor').verifyGenerated;

  const res = await aiComplete({
    purpose: ctx.dryRun ? 'prompt_test' : 'generate_coding',
    system,
    user,
    json: true,
    temperature: 0.8,
    maxTokens: 12000,
    preferred: provider,
    jobId: ctx.jobId,
    onEvent: ctx.log,
    record: { promptKey: prompt?.builtinKey || `custom:${prompt?.id}`, promptVersion: prompt?.version || 1 },
    validate: async (raw, { isLast }) => {
      const q = normalizeCoding(raw, language); // throws on anything that doesn't fit the schema
      if (!ctx.dryRun && !isLast && (await titleExists(q.title))) {
        throw new ValidationError(`duplicate of an existing problem ("${q.title}")`);
      }
      if (verify) {
        ctx.log?.({ level: 'info', msg: `⚙ Verifying "${truncate(q.title, 60)}" - running the reference solution on all tests…` });
        q.verification = await verifyCodingQuestion(q, language, ctx.log);
        if (q.verification.status === 'failed' && !isLast) {
          throw new ValidationError(`reference solution check failed: ${q.verification.reason}`);
        }
      } else {
        q.verification = { status: 'skipped' };
      }
      return assertSchema('coding-question', q); // final shape, after verification adjusted the tests
    },
  });

  const q = res.data;
  const meta = generationMeta(res, prompt);
  if (ctx.dryRun) return { question: q, raw: res.text, generation: meta, fallbacks: res.errors };

  const title = await uniqueTitle(q.title);
  const { title: _t, topic: qTopic, tags, ...data } = q;
  const id = await createQuestion({
    type: 'coding',
    title,
    difficulty,
    language,
    topic: qTopic || topic?.split(',')[0]?.trim() || '',
    tags,
    data,
    provider: res.provider,
    model: res.model,
    promptId: prompt?.id,
    source: ctx.source || 'manual',
    scheduleId: ctx.scheduleId,
    jobId: ctx.jobId,
    batchDate: ctx.batchDate,
    verified: q.verification?.status === 'verified',
    schemaVersion: QUESTION_SCHEMA_VERSION,
    generation: meta,
  });
  linkResponse(res.requestId, [id]);
  return { id, title, provider: res.providerName, model: res.model, verification: q.verification };
}

/** Generates and stores up to `task.count` MCQs with one AI call. */
export async function generateMcqBatch(task, ctx = {}) {
  const { difficulty, language, topic, promptId, extra, provider } = task;
  const count = Math.max(1, Math.min(10, task.count || 5));
  const avoid = await recentTitles('mcq', 40);
  const { system, user, prompt } = await buildGenerationPrompt({ type: 'mcq', difficulty, language, topic, count, promptId, extra, avoid });

  const res = await aiComplete({
    purpose: ctx.dryRun ? 'prompt_test' : 'generate_mcq',
    system,
    user,
    json: true,
    temperature: 0.8,
    maxTokens: Math.min(1500 * count + 1000, 12000),
    preferred: provider,
    jobId: ctx.jobId,
    onEvent: ctx.log,
    record: { promptKey: prompt?.builtinKey || `custom:${prompt?.id}`, promptVersion: prompt?.version || 1 },
    validate: (raw) => {
      const list = normalizeMcqList(raw);
      if (list.rejected.length) ctx.log?.({ level: 'warn', msg: `⚠ Dropped ${list.rejected.length} invalid MCQ(s): ${truncate(list.rejected[0], 140)}` });
      return list.slice(0, count);
    },
  });

  const meta = generationMeta(res, prompt);
  if (ctx.dryRun) return { questions: res.data, raw: res.text, generation: meta, fallbacks: res.errors };

  const ids = [];
  for (const m of res.data) {
    const { title, topic: mTopic, tags, ...data } = m;
    ids.push(
      await createQuestion({
        type: 'mcq',
        title: await uniqueTitle(title),
        difficulty,
        language,
        topic: mTopic || topic?.split(',')[0]?.trim() || '',
        tags,
        data,
        provider: res.provider,
        model: res.model,
        promptId: prompt?.id,
        source: ctx.source || 'manual',
        scheduleId: ctx.scheduleId,
        jobId: ctx.jobId,
        batchDate: ctx.batchDate,
        verified: false,
        schemaVersion: QUESTION_SCHEMA_VERSION,
        generation: meta,
      }),
    );
  }
  linkResponse(res.requestId, ids);
  return { ids, provider: res.providerName, model: res.model };
}
