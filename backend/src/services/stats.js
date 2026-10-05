import { AiLog, Question, Submission, toClient } from '../db/models.js';
import { clamp, toInt } from '../utils/misc.js';
import { addDays, isoDaysAgo, localDate, startOfTodayIso } from '../utils/time.js';

const SOLVED = { $cond: [{ $eq: ['$progress.status', 'solved'] }, 1, 0] };
const ATTEMPTED = { $cond: [{ $eq: ['$progress.status', 'attempted'] }, 1, 0] };
const OK = { $cond: ['$success', 1, 0] };
const TOKENS = { $add: [{ $ifNull: ['$inputTokens', 0] }, { $ifNull: ['$outputTokens', 0] }] };

function streaks(days) {
  const today = localDate();
  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of [...days].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

export async function overview() {
  const today = localDate();
  const [byDiff, recentSubs, subTotals, topics, languages, recent, daily, aiMonth, aiToday, assist, revision, unfinished] =
    await Promise.all([
      Question.aggregate([
        { $group: { _id: { type: '$type', difficulty: '$difficulty' }, total: { $sum: 1 }, solved: { $sum: SOLVED }, attempted: { $sum: ATTEMPTED } } },
      ]),
      Submission.find({ createdAt: { $gte: new Date(isoDaysAgo(370)) } }, { createdAt: 1, verdict: 1 }).lean(),
      Submission.aggregate([
        { $group: { _id: null, total: { $sum: 1 }, accepted: { $sum: { $cond: [{ $in: ['$verdict', ['accepted', 'correct']] }, 1, 0] } } } },
      ]),
      Question.aggregate([
        { $match: { topic: { $nin: [null, ''] } } },
        { $group: { _id: '$topic', total: { $sum: 1 }, solved: { $sum: SOLVED } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      Question.aggregate([{ $group: { _id: '$language', total: { $sum: 1 }, solved: { $sum: SOLVED } } }, { $sort: { total: -1 } }]),
      Submission.aggregate([
        { $sort: { _id: -1 } },
        { $limit: 8 },
        { $lookup: { from: 'questions', localField: 'questionId', foreignField: '_id', as: 'q' } },
        { $unwind: '$q' },
        {
          $project: {
            questionId: 1,
            verdict: 1,
            language: 1,
            createdAt: 1,
            kind: 1,
            passed: 1,
            total: 1,
            title: '$q.title',
            difficulty: '$q.difficulty',
          },
        },
      ]),
      Question.find({ batchDate: today }, { title: 1, type: 1, difficulty: 1, language: 1, topic: 1, 'progress.status': 1 }).sort({ _id: 1 }).lean(),
      AiLog.aggregate([
        { $match: { createdAt: { $gte: new Date(isoDaysAgo(29)) } } },
        { $group: { _id: '$provider', calls: { $sum: 1 }, ok: { $sum: OK }, tokens: { $sum: TOKENS } } },
        { $sort: { calls: -1 } },
      ]),
      AiLog.aggregate([
        { $match: { createdAt: { $gte: new Date(startOfTodayIso()) } } },
        { $group: { _id: null, calls: { $sum: 1 }, ok: { $sum: OK }, tokens: { $sum: TOKENS } } },
      ]),
      Question.aggregate([
        {
          $group: {
            _id: null,
            hints: { $sum: '$progress.hintsUsed' },
            aiHints: { $sum: '$progress.aiHints' },
            aiReviews: { $sum: '$progress.aiReviews' },
            solutionViews: { $sum: { $cond: ['$progress.solutionViewed', 1, 0] } },
            solved: { $sum: SOLVED },
            independent: { $sum: { $cond: [{ $and: [{ $eq: ['$progress.status', 'solved'] }, '$progress.solvedIndependently'] }, 1, 0] } },
            timeSpentSec: { $sum: '$progress.timeSpentSec' },
          },
        },
      ]),
      // Spaced revision: solved problems not touched for a week.
      Question.find(
        { 'progress.status': 'solved', 'progress.lastAttemptAt': { $lte: new Date(Date.now() - 7 * 86400e3) } },
        { title: 1, type: 1, difficulty: 1, 'progress.lastAttemptAt': 1 },
      )
        .sort({ 'progress.lastAttemptAt': 1 })
        .limit(5)
        .lean(),
      // Attempted but not solved yet - the reattempt queue.
      Question.find({ 'progress.status': 'attempted' }, { title: 1, type: 1, difficulty: 1, 'progress.attempts': 1, 'progress.lastAttemptAt': 1 })
        .sort({ 'progress.lastAttemptAt': -1 })
        .limit(5)
        .lean(),
    ]);

  const heat = {};
  const solvedDays = new Set();
  for (const s of recentSubs) {
    const d = localDate(s.createdAt);
    heat[d] = (heat[d] || 0) + 1;
    if (s.verdict === 'accepted' || s.verdict === 'correct') solvedDays.add(d);
  }
  const difficulty = {};
  const totals = { questions: 0, coding: 0, mcq: 0, solved: 0, attempted: 0 };
  for (const row of byDiff) {
    const { type, difficulty: diff } = row._id;
    difficulty[diff] ??= { total: 0, solved: 0, attempted: 0, coding: 0, mcq: 0 };
    difficulty[diff].total += row.total;
    difficulty[diff].solved += row.solved;
    difficulty[diff].attempted += row.attempted;
    difficulty[diff][type] += row.total;
    totals.questions += row.total;
    totals[type] += row.total;
    totals.solved += row.solved;
    totals.attempted += row.attempted;
  }
  const a = assist[0] || { hints: 0, aiHints: 0, aiReviews: 0, solutionViews: 0, solved: 0, independent: 0, timeSpentSec: 0 };
  const sub = subTotals[0] || { total: 0, accepted: 0 };
  const t = aiToday[0] || { calls: 0, ok: 0, tokens: 0 };

  return {
    totals,
    difficulty,
    submissions: { total: sub.total, accepted: sub.accepted, acceptanceRate: sub.total ? sub.accepted / sub.total : 0 },
    streak: streaks(solvedDays),
    heatmap: Object.entries(heat).map(([date, count]) => ({ date, count })),
    topics: topics.map((r) => ({ topic: r._id, total: r.total, solved: r.solved })),
    languages: languages.map((r) => ({ language: r._id, total: r.total, solved: r.solved })),
    recentSubmissions: recent.map(toClient),
    today: { date: today, questions: daily.map(toClient) },
    revision: revision.map(toClient),
    unfinished: unfinished.map(toClient),
    ai: {
      today: { calls: t.calls, ok: t.ok, tokens: t.tokens },
      last30: aiMonth.map((r) => ({ provider: r._id, calls: r.calls, ok: r.ok, tokens: r.tokens })),
    },
    assistance: { ...a, _id: undefined, independentRate: a.solved ? a.independent / a.solved : 0 },
  };
}

export async function aiUsage(daysParam) {
  const days = clamp(toInt(daysParam, 30), 1, 365);
  const since = new Date(isoDaysAgo(days - 1));
  const match = { $match: { createdAt: { $gte: since } } };
  const [providers, lastErrors, rows, purposes, requests] = await Promise.all([
    AiLog.aggregate([
      match,
      {
        $group: {
          _id: '$provider',
          calls: { $sum: 1 },
          ok: { $sum: OK },
          avgLatencyMs: { $avg: { $cond: ['$success', '$latencyMs', null] } },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          lastUsed: { $max: '$createdAt' },
        },
      },
      { $sort: { calls: -1 } },
    ]),
    AiLog.aggregate([
      { $match: { createdAt: { $gte: since }, success: false } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$provider', error: { $first: '$error' }, at: { $first: '$createdAt' } } },
    ]),
    AiLog.find({ createdAt: { $gte: since } }, { provider: 1, success: 1, createdAt: 1, inputTokens: 1, outputTokens: 1 }).lean(),
    AiLog.aggregate([match, { $group: { _id: '$purpose', calls: { $sum: 1 }, ok: { $sum: OK }, tokens: { $sum: TOKENS } } }, { $sort: { calls: -1 } }]),
    AiLog.aggregate([
      match,
      { $group: { _id: '$requestId', attempts: { $sum: 1 }, anyOk: { $max: OK } } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          succeeded: { $sum: '$anyOk' },
          rescued: { $sum: { $cond: [{ $and: [{ $gt: ['$attempts', 1] }, { $eq: ['$anyOk', 1] }] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const errMap = new Map(lastErrors.map((e) => [e._id, { error: e.error, at: e.at }]));
  const dailyMap = new Map();
  for (let i = days - 1; i >= 0; i--) dailyMap.set(addDays(localDate(), -i), { date: addDays(localDate(), -i), total: 0, failed: 0, tokens: 0, byProvider: {} });
  for (const r of rows) {
    const day = dailyMap.get(localDate(r.createdAt));
    if (!day) continue;
    day.total++;
    if (!r.success) day.failed++;
    day.tokens += (r.inputTokens || 0) + (r.outputTokens || 0);
    day.byProvider[r.provider] = (day.byProvider[r.provider] || 0) + 1;
  }
  const req = requests[0] || { requests: 0, succeeded: 0, rescued: 0 };
  const calls = providers.reduce((s, p) => s + p.calls, 0);
  const ok = providers.reduce((s, p) => s + p.ok, 0);

  return {
    days,
    totals: {
      calls,
      ok,
      failed: calls - ok,
      successRate: calls ? ok / calls : 0,
      inputTokens: providers.reduce((s, p) => s + p.inputTokens, 0),
      outputTokens: providers.reduce((s, p) => s + p.outputTokens, 0),
      requests: req.requests,
      requestsSucceeded: req.succeeded,
      rescuedByFallback: req.rescued,
    },
    providers: providers.map((p) => ({
      provider: p._id,
      calls: p.calls,
      ok: p.ok,
      failed: p.calls - p.ok,
      successRate: p.calls ? p.ok / p.calls : 0,
      avgLatencyMs: p.avgLatencyMs ? Math.round(p.avgLatencyMs) : null,
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      lastUsed: p.lastUsed,
      lastError: errMap.get(p._id) || null,
    })),
    purposes: purposes.map((p) => ({ purpose: p._id || 'general', calls: p.calls, ok: p.ok, tokens: p.tokens })),
    daily: [...dailyMap.values()],
  };
}

export async function aiLogs({ limit, offset, provider, status }) {
  const filter = {};
  if (provider) filter.provider = provider;
  if (status === 'ok') filter.success = true;
  if (status === 'failed') filter.success = false;
  const lim = clamp(toInt(limit, 50), 1, 200);
  const off = Math.max(0, toInt(offset, 0));
  const [items, total] = await Promise.all([
    AiLog.find(filter).sort({ createdAt: -1 }).skip(off).limit(lim).lean(),
    AiLog.countDocuments(filter),
  ]);
  return { items: items.map(toClient), total, limit: lim, offset: off };
}

export async function providerCallsToday() {
  const rows = await AiLog.aggregate([
    { $match: { createdAt: { $gte: new Date(startOfTodayIso()) } } },
    { $group: { _id: '$provider', calls: { $sum: 1 }, ok: { $sum: OK } } },
  ]);
  return new Map(rows.map((r) => [r._id, { calls: r.calls, ok: r.ok }]));
}
