import cron from 'node-cron';
import { getProviderDef } from '../ai/providers.js';
import { Schedule, nextSeq, toClient } from '../db/models.js';
import { badRequest, notFound, toInt, truncate } from '../utils/misc.js';
import { addDays, localDate, localParts, tz, weekdayOf, zonedToUtcIso } from '../utils/time.js';
import { buildTasks, createJob, isScheduleRunning, validateItems } from './jobs.js';

const cronTasks = new Map();
let catchUpTimer = null;

export function toCron(time, days) {
  const [h, m] = time.split(':').map(Number);
  const dow = days.length === 7 ? '*' : [...days].sort().join(',');
  return `${m} ${h} * * ${dow}`;
}

export function nextRunOf(s) {
  if (!s.enabled || s.cron) return null;
  const now = localParts();
  const [h, m] = s.time.split(':').map(Number);
  for (let i = 0; i < 8; i++) {
    const date = addDays(now.date, i);
    if (!s.days.includes(weekdayOf(date))) continue;
    if (i === 0 && now.hour * 60 + now.minute >= h * 60 + m) continue;
    return zonedToUtcIso(date, s.time);
  }
  return null;
}

const present = (s) => ({ ...toClient(s), expression: s.cron || toCron(s.time, s.days), nextRunAt: nextRunOf(s), running: isScheduleRunning(s._id) });

export async function reloadSchedules() {
  for (const t of cronTasks.values()) t.stop();
  cronTasks.clear();
  const all = await Schedule.find({ enabled: true }).lean();
  for (const s of all) {
    const expr = s.cron?.trim() || toCron(s.time, s.days);
    if (!cron.validate(expr)) {
      console.warn(`[scheduler] invalid cron "${expr}" for schedule #${s._id}`);
      continue;
    }
    try {
      const task = cron.schedule(expr, () => runSchedule(s._id, 'cron').catch((e) => console.error('[scheduler]', e.message)), {
        timezone: tz(),
      });
      cronTasks.set(s._id, task);
    } catch (e) {
      console.warn(`[scheduler] could not schedule #${s._id}: ${e.message}`);
    }
  }
  return cronTasks.size;
}

export async function runSchedule(id, trigger = 'manual') {
  const s = await Schedule.findById(toInt(id, -1)).lean();
  if (!s) throw notFound('Schedule not found');
  if (isScheduleRunning(s._id)) return { skipped: true, reason: 'This schedule is already running' };
  const cfg = s.config || {};
  const tasks = buildTasks({ items: cfg.items || [], topics: cfg.topics || [], provider: cfg.provider || 'auto', extra: cfg.extra || '' });
  const job = await createJob({
    source: 'schedule',
    scheduleId: s._id,
    params: { scheduleName: s.name, trigger, ...cfg },
    tasks,
    batchDate: localDate(),
  });
  await Schedule.updateOne(
    { _id: s._id },
    { $set: { lastRunAt: new Date(), lastStatus: 'running', lastMessage: `Started (${trigger})`, lastJobId: job.id } },
  );
  console.log(`[scheduler] "${s.name}" started (${trigger}) - job ${job.id}`);
  return { jobId: job.id };
}

/** If the PC was off/asleep at the scheduled time, run today's set as soon as the server is up. */
export async function catchUpSchedules() {
  const now = localParts();
  const all = await Schedule.find({ enabled: true, catchUp: true }).lean();
  for (const s of all) {
    if (s.cron || !s.days.includes(now.weekday)) continue;
    const [h, m] = s.time.split(':').map(Number);
    if (now.hour * 60 + now.minute < h * 60 + m) continue;
    if (s.lastRunAt && localDate(s.lastRunAt) === now.date) continue;
    await runSchedule(s._id, 'catch-up').catch((e) => console.error('[scheduler] catch-up failed:', e.message));
  }
}

export async function startScheduler() {
  const n = await reloadSchedules();
  await catchUpSchedules();
  catchUpTimer = setInterval(() => catchUpSchedules().catch(() => {}), 10 * 60 * 1000);
  catchUpTimer.unref();
  console.log(`[scheduler] ${n} active schedule(s), timezone ${tz()}`);
}

export function stopScheduler() {
  for (const t of cronTasks.values()) t.stop();
  cronTasks.clear();
  clearInterval(catchUpTimer);
}

// ------------------------------------------------------------------ CRUD

function validate(body) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('Name is required');
  const time = String(body.time || '09:00');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw badRequest('Time must be HH:MM (24h)');
  const days = [...new Set((Array.isArray(body.days) ? body.days : []).map(Number))].filter((d) => d >= 0 && d <= 6);
  if (!days.length) throw badRequest('Pick at least one day');
  const cronExpr = String(body.cron || '').trim();
  if (cronExpr && !cron.validate(cronExpr)) throw badRequest('Invalid cron expression');
  const cfg = body.config || {};
  const provider = cfg.provider && cfg.provider !== 'auto' ? cfg.provider : 'auto';
  if (provider !== 'auto' && !getProviderDef(provider)) throw badRequest('Unknown AI provider');
  return {
    name: name.slice(0, 100),
    enabled: body.enabled !== false,
    time,
    days: days.sort(),
    cron: cronExpr,
    catchUp: body.catchUp !== false,
    config: {
      items: validateItems(cfg.items),
      topics: (Array.isArray(cfg.topics) ? cfg.topics : []).map((t) => truncate(String(t).trim(), 60)).filter(Boolean).slice(0, 30),
      provider,
      extra: String(cfg.extra || '').slice(0, 1000),
    },
  };
}

export async function listSchedules() {
  const rows = await Schedule.find().sort({ _id: 1 }).lean();
  return rows.map(present);
}

export async function createSchedule(body) {
  const doc = await Schedule.create({ _id: await nextSeq('schedules'), ...validate(body) });
  await reloadSchedules();
  return present(doc.toObject());
}

export async function updateSchedule(id, body) {
  const row = await Schedule.findByIdAndUpdate(toInt(id, -1), { $set: validate(body) }, { returnDocument: 'after', lean: true });
  if (!row) throw notFound('Schedule not found');
  await reloadSchedules();
  return present(row);
}

export async function toggleSchedule(id, enabled) {
  const row = await Schedule.findByIdAndUpdate(toInt(id, -1), { $set: { enabled: Boolean(enabled) } }, { returnDocument: 'after', lean: true });
  if (!row) throw notFound('Schedule not found');
  await reloadSchedules();
  return present(row);
}

export async function deleteSchedule(id) {
  const r = await Schedule.deleteOne({ _id: toInt(id, -1) });
  if (!r.deletedCount) throw notFound('Schedule not found');
  await reloadSchedules();
}
