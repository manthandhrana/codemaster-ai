import { NoProviderError } from '../ai/router.js';
import { CODING_LANGUAGE_IDS, CODING_TOPICS, DIFFICULTY_IDS, LANGUAGE_IDS, MCQ_TOPICS, difficultyLabel, languageLabel } from '../constants.js';
import { Job, Question, Schedule, toClient } from '../db/models.js';
import { badRequest, clamp, notFound, shuffle, toInt, truncate, uid } from '../utils/misc.js';
import { generateCodingQuestion, generateMcqBatch } from './generator.js';

const MAX_CONCURRENT_JOBS = 2;
const active = new Map(); // id -> in-memory job (source of truth while it runs)
const queue = [];
let running = 0;

// ------------------------------------------------------------------ task planning

export function validateItems(items) {
  if (!Array.isArray(items) || !items.length) throw badRequest('Add at least one item to generate');
  if (items.length > 20) throw badRequest('Too many items (max 20)');
  return items.map((it) => {
    const type = it.type === 'mcq' ? 'mcq' : it.type === 'coding' ? 'coding' : null;
    if (!type) throw badRequest('Item type must be coding or mcq');
    if (!DIFFICULTY_IDS.includes(it.difficulty)) throw badRequest(`Invalid difficulty: ${it.difficulty}`);
    const allowed = type === 'coding' ? CODING_LANGUAGE_IDS : LANGUAGE_IDS;
    if (!allowed.includes(it.language)) throw badRequest(`Invalid language for ${type}: ${it.language}`);
    const max = type === 'coding' ? 20 : 100;
    return {
      type,
      difficulty: it.difficulty,
      language: it.language,
      count: clamp(toInt(it.count, 1), 1, max),
      promptId: it.promptId ? toInt(it.promptId, null) : null,
    };
  });
}

/** Expands items into AI tasks: one coding problem per task, MCQs in batches of 5. */
export function buildTasks({ items, topics = [], customTopic = '', provider = 'auto', extra = '' }) {
  const tasks = [];
  const custom = String(customTopic || '').trim();
  for (const item of validateItems(items)) {
    const pool = topics.length ? topics : item.type === 'coding' ? CODING_TOPICS : MCQ_TOPICS;
    const deck = shuffle(pool);
    let k = 0;
    const nextTopic = () => deck[k++ % deck.length];
    const base = { difficulty: item.difficulty, language: item.language, promptId: item.promptId, provider, extra };
    if (item.type === 'coding') {
      for (let i = 0; i < item.count; i++) tasks.push({ ...base, type: 'coding', count: 1, topic: custom || nextTopic() });
    } else {
      for (let left = item.count; left > 0; left -= 5) {
        const n = Math.min(5, left);
        const topic = custom || (pool.length <= 2 ? pool.join(', ') : [nextTopic(), nextTopic()].join(', '));
        tasks.push({ ...base, type: 'mcq', count: n, topic });
      }
    }
  }
  return tasks;
}

// ------------------------------------------------------------------ job lifecycle

function serialize(job) {
  return {
    id: job.id,
    source: job.source,
    scheduleId: job.scheduleId ?? null,
    status: job.status,
    params: job.params,
    total: job.total,
    done: job.done,
    failed: job.failed,
    logs: job.logs,
    questionIds: job.questionIds,
    error: job.error ?? null,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
  };
}

async function persist(job) {
  const { id, ...rest } = serialize(job);
  await Job.updateOne({ _id: id }, { $set: rest }).catch((e) => console.error('[jobs] persist failed:', e.message));
}

function schedulePersist(job) {
  if (job.persistTimer) return;
  job.persistTimer = setTimeout(() => {
    job.persistTimer = null;
    persist(job);
  }, 400);
}

function log(job, level, msg) {
  job.logs.push({ t: new Date(), level, msg: truncate(msg, 600) });
  if (job.logs.length > 400) job.logs.splice(0, job.logs.length - 400);
  schedulePersist(job);
}

export async function createJob({ source, scheduleId, params, tasks, batchDate }) {
  if (!tasks.length) throw badRequest('Nothing to generate');
  const job = {
    id: uid(),
    source,
    scheduleId,
    params,
    tasks,
    batchDate,
    status: 'queued',
    total: tasks.reduce((s, t) => s + (t.count || 1), 0),
    done: 0,
    failed: 0,
    logs: [],
    questionIds: [],
    createdAt: new Date(),
    cancelled: false,
  };
  active.set(job.id, job);
  await Job.create({ _id: job.id, source, scheduleId, status: 'queued', params, total: job.total });
  log(job, 'info', `Queued: ${job.total} question(s) in ${tasks.length} AI task(s)`);
  queue.push(job);
  pump();
  return serialize(job);
}

function pump() {
  while (running < MAX_CONCURRENT_JOBS && queue.length) {
    const job = queue.shift();
    if (job.cancelled) continue;
    running++;
    runJob(job)
      .catch((e) => {
        job.status = 'failed';
        job.error = e.message;
        console.error('[jobs] crashed:', e);
        return persist(job);
      })
      .finally(() => {
        running--;
        pump();
      });
  }
}

async function runJob(job) {
  job.status = 'running';
  job.startedAt = new Date();
  log(job, 'info', '🚀 Job started');
  const ctx = {
    jobId: job.id,
    source: job.source === 'schedule' ? 'daily' : 'manual',
    scheduleId: job.scheduleId,
    batchDate: job.batchDate,
    log: (e) => log(job, e.level, e.msg),
  };

  for (let i = 0; i < job.tasks.length; i++) {
    const task = job.tasks[i];
    if (job.cancelled) {
      log(job, 'warn', '⏹ Job cancelled');
      break;
    }
    const what = task.type === 'coding' ? 'Coding problem' : `${task.count} MCQs`;
    log(job, 'info', `▶ [${i + 1}/${job.tasks.length}] ${what} · ${difficultyLabel(task.difficulty)} · ${languageLabel(task.language)} · ${task.topic}`);
    try {
      if (task.type === 'coding') {
        const r = await generateCodingQuestion(task, ctx);
        job.done += 1;
        job.questionIds.push(r.id);
        const badge = r.verification?.status === 'verified' ? ' ✔ verified' : '';
        log(job, 'success', `✅ Saved #${r.id} "${r.title}" via ${r.provider}${badge}`);
      } else {
        const r = await generateMcqBatch(task, ctx);
        job.done += r.ids.length;
        job.failed += task.count - r.ids.length;
        job.questionIds.push(...r.ids);
        log(job, 'success', `✅ Saved ${r.ids.length} MCQ(s) (#${r.ids.join(', #')}) via ${r.provider}`);
      }
    } catch (e) {
      job.failed += task.count || 1;
      log(job, 'error', `❌ ${e.message}`);
      if (e instanceof NoProviderError) {
        const rest = job.tasks.slice(i + 1).reduce((s, t) => s + (t.count || 1), 0);
        job.failed += rest;
        job.error = e.message;
        break;
      }
    }
    schedulePersist(job);
  }

  job.status = job.cancelled ? 'cancelled' : job.failed === 0 ? 'completed' : job.done === 0 ? 'failed' : 'partial';
  job.finishedAt = new Date();
  log(job, job.status === 'completed' ? 'success' : 'warn', `🏁 Job ${job.status}: ${job.done} generated, ${job.failed} failed`);
  clearTimeout(job.persistTimer);
  job.persistTimer = null;
  await persist(job);
  if (job.scheduleId) {
    await Schedule.updateOne(
      { _id: job.scheduleId },
      { $set: { lastStatus: job.status, lastMessage: `${job.done} generated, ${job.failed} failed` } },
    );
  }
  setTimeout(() => active.delete(job.id), 15 * 60 * 1000).unref();
}

async function withQuestions(job) {
  const qs = job.questionIds.length
    ? await Question.find({ _id: { $in: job.questionIds } }, { title: 1, type: 1, difficulty: 1, language: 1, verified: 1, topic: 1 }).lean()
    : [];
  return { ...job, questions: qs.map(toClient) };
}

export async function getJob(id) {
  const mem = active.get(id);
  if (mem) return withQuestions(serialize(mem));
  const row = await Job.findById(id).lean();
  if (!row) throw notFound('Job not found');
  return withQuestions(toClient(row));
}

export async function listJobs({ limit = 20, scheduleId } = {}) {
  const filter = scheduleId ? { scheduleId: Number(scheduleId) } : {};
  const rows = await Job.find(filter, { logs: 0 }).sort({ createdAt: -1 }).limit(clamp(toInt(limit, 20), 1, 100)).lean();
  return rows.map((r) => {
    const mem = active.get(r._id);
    if (!mem) return toClient(r);
    const { logs, ...live } = serialize(mem);
    return live;
  });
}

export async function cancelJob(id) {
  const job = active.get(id);
  if (!job || !['queued', 'running'].includes(job.status)) throw badRequest('Job is not running');
  job.cancelled = true;
  if (job.status === 'queued') {
    job.status = 'cancelled';
    job.finishedAt = new Date();
    log(job, 'warn', '⏹ Cancelled before start');
    await persist(job);
  } else {
    log(job, 'warn', '⏹ Cancel requested - stopping after the current task');
  }
  return serialize(job);
}

export const isScheduleRunning = (scheduleId) =>
  [...active.values()].some((j) => j.scheduleId === scheduleId && ['queued', 'running'].includes(j.status));

/** Jobs left "running" by a crash/restart can never finish - mark them as interrupted. */
export async function recoverInterruptedJobs() {
  await Job.updateMany(
    { status: { $in: ['queued', 'running'] } },
    { $set: { status: 'failed', error: 'Interrupted by a server restart', finishedAt: new Date() } },
  );
}
