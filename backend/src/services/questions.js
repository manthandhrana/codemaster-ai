import { DIFFICULTY_IDS } from '../constants.js';
import { Question, Submission, nextSeq, toClient } from '../db/models.js';
import { badRequest, clamp, normalizeTitle, notFound, toInt } from '../utils/misc.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function titleExists(title) {
  return Boolean(await Question.exists({ titleKey: normalizeTitle(title) }));
}

/** Appends " · v2", " · v3"... until the title is unique. */
export async function uniqueTitle(title) {
  if (!(await titleExists(title))) return title;
  for (let v = 2; v < 100; v++) {
    const candidate = `${title} · v${v}`;
    if (!(await titleExists(candidate))) return candidate;
  }
  return `${title} · ${Date.now().toString(36)}`;
}

export async function recentTitles(type, limit = 40) {
  const rows = await Question.find({ type }, { title: 1 }).sort({ _id: -1 }).limit(limit).lean();
  return rows.map((r) => r.title);
}

export async function createQuestion(fields) {
  const _id = await nextSeq('questions');
  await Question.create({ _id, ...fields, titleKey: normalizeTitle(fields.title) });
  return _id;
}

export async function getQuestionDoc(id) {
  const doc = await Question.findById(toInt(id, -1)).lean();
  if (!doc) throw notFound('Question not found');
  return doc;
}

/** Shape sent to the solver: hidden tests, unrevealed hints and the answer stay on the server. */
export async function publicQuestion(doc) {
  const d = doc.data || {};
  const p = doc.progress || {};
  const base = {
    id: doc._id,
    type: doc.type,
    title: doc.title,
    difficulty: doc.difficulty,
    language: doc.language,
    topic: doc.topic,
    tags: doc.tags || [],
    provider: doc.provider,
    model: doc.model,
    source: doc.source,
    batchDate: doc.batchDate,
    verified: doc.verified,
    starred: doc.starred,
    createdAt: doc.createdAt,
    hintsTotal: (d.hints || []).length,
    hints: (d.hints || []).slice(0, p.hintsUsed || 0),
    progress: p,
  };
  if (doc.type === 'coding') {
    return {
      ...base,
      description: d.description,
      inputFormat: d.inputFormat,
      outputFormat: d.outputFormat,
      constraints: d.constraints || [],
      examples: d.examples || [],
      followUps: d.followUps || [],
      pattern: d.pattern,
      starterCode: d.starterCode,
      starterCodes: d.starterCodes || {},
      hiddenTestCount: (d.testCases || []).length,
      verification: d.verification || null,
      solution: p.solutionViewed
        ? { approach: d.approach, complexity: d.complexity, solutionCode: d.solutionCode, language: doc.language }
        : null,
    };
  }
  // MCQ: options already tried since the last reset, so the UI can mark them.
  const since = p.resetAt ? { createdAt: { $gt: p.resetAt } } : {};
  const tries = await Submission.find({ questionId: doc._id, kind: 'mcq', ...since }, { answer: 1, verdict: 1 }).sort({ _id: 1 }).lean();
  const revealed = p.status === 'solved' || p.solutionViewed;
  return {
    ...base,
    question: d.question,
    options: d.options || [],
    triedOptions: [...new Set(tries.map((t) => t.answer))],
    answer: revealed ? { correctIndex: d.correctIndex, explanation: d.explanation } : null,
  };
}

const LIST_PROJECTION = {
  type: 1,
  title: 1,
  difficulty: 1,
  language: 1,
  topic: 1,
  tags: 1,
  source: 1,
  verified: 1,
  starred: 1,
  createdAt: 1,
  batchDate: 1,
  provider: 1,
  progress: 1,
};

export async function listQuestions(query) {
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.difficulty) filter.difficulty = query.difficulty;
  if (query.language) filter.language = query.language;
  if (query.topic) filter.topic = query.topic;
  if (query.source) filter.source = query.source;
  if (query.batchDate) filter.batchDate = query.batchDate;
  if (query.starred === 'true') filter.starred = true;
  if (query.status) filter['progress.status'] = query.status === 'todo' ? { $in: ['todo', null] } : query.status;
  if (query.ids) filter._id = { $in: String(query.ids).split(',').map(Number).filter(Number.isFinite) };
  if (query.search) {
    const s = String(query.search).trim().replace(/^#/, '');
    const rx = new RegExp(escapeRegex(s), 'i');
    filter.$or = [{ title: rx }, { topic: rx }, { tags: rx }];
    if (/^\d+$/.test(s)) filter.$or.push({ _id: Number(s) });
  }
  const pageSize = clamp(toInt(query.pageSize, 25), 1, 200);
  const page = Math.max(1, toInt(query.page, 1));
  const sorts = {
    newest: { _id: -1 },
    oldest: { _id: 1 },
    title: { title: 1 },
    difficulty: { difficultyRank: 1, _id: -1 },
    difficulty_desc: { difficultyRank: -1, _id: -1 },
    recent_attempt: { 'progress.lastAttemptAt': -1, _id: -1 },
  };
  const [result] = await Question.aggregate([
    { $match: filter },
    { $addFields: { difficultyRank: { $indexOfArray: [DIFFICULTY_IDS, '$difficulty'] } } },
    { $sort: sorts[query.sort] || sorts.newest },
    {
      $facet: {
        items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }, { $project: LIST_PROJECTION }],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  return {
    items: result.items.map(toClient),
    total: result.total[0]?.n || 0,
    page,
    pageSize,
  };
}

export async function facets() {
  const [topics, languages] = await Promise.all([Question.distinct('topic'), Question.distinct('language')]);
  return { topics: topics.filter(Boolean).sort(), languages: languages.filter(Boolean).sort() };
}

export async function updateQuestionMeta(id, body) {
  const set = {};
  if (body.starred !== undefined) set.starred = Boolean(body.starred);
  if (body.notes !== undefined) set['progress.notes'] = String(body.notes).slice(0, 10000);
  if (!Object.keys(set).length) throw badRequest('Nothing to update');
  const r = await Question.updateOne({ _id: toInt(id, -1) }, { $set: set });
  if (!r.matchedCount) throw notFound('Question not found');
}

export async function deleteQuestions(ids) {
  const list = ids.map(Number).filter(Number.isFinite);
  if (!list.length) throw badRequest('No question ids given');
  const r = await Question.deleteMany({ _id: { $in: list } });
  await Submission.deleteMany({ questionId: { $in: list } });
  return r.deletedCount;
}

/** Reveals the next stored hint (counts towards "assisted" solves). */
export async function revealNextHint(doc) {
  const total = (doc.data?.hints || []).length;
  const used = doc.progress?.hintsUsed || 0;
  if (used >= total) return doc.data.hints || [];
  await Question.updateOne({ _id: doc._id }, { $set: { 'progress.hintsUsed': used + 1 } });
  return doc.data.hints.slice(0, used + 1);
}

export async function revealSolution(doc) {
  await Question.updateOne({ _id: doc._id }, { $set: { 'progress.solutionViewed': true } });
  const d = doc.data;
  if (doc.type === 'coding') {
    return { approach: d.approach, complexity: d.complexity, solutionCode: d.solutionCode, language: doc.language };
  }
  return { correctIndex: d.correctIndex, explanation: d.explanation };
}

/** Reattempt from scratch: clears status, hints and revealed solution; submission history is kept. */
export async function resetProgress(doc) {
  const p = doc.progress || {};
  await Question.updateOne(
    { _id: doc._id },
    {
      $set: {
        'progress.status': 'todo',
        'progress.attempts': 0,
        'progress.hintsUsed': 0,
        'progress.aiHints': 0,
        'progress.aiReviews': 0,
        'progress.solutionViewed': false,
        'progress.solvedIndependently': false,
        'progress.timeSpentSec': 0,
        'progress.bestRuntimeMs': null,
        'progress.solvedAt': null,
        'progress.resetAt': new Date(),
        'progress.resets': (p.resets || 0) + 1,
      },
    },
  );
}

async function applyAttempt(doc, { solved, timeSpentSec, runtimeMs }) {
  const p = doc.progress || {};
  const set = { 'progress.lastAttemptAt': new Date() };
  if (solved) {
    if (p.status !== 'solved') {
      set['progress.status'] = 'solved';
      set['progress.solvedAt'] = new Date();
      set['progress.solvedIndependently'] = !(p.hintsUsed > 0 || p.aiHints > 0 || p.solutionViewed);
    }
    if (typeof runtimeMs === 'number' && (p.bestRuntimeMs == null || runtimeMs < p.bestRuntimeMs)) {
      set['progress.bestRuntimeMs'] = runtimeMs;
    }
  } else if (!p.status || p.status === 'todo') {
    set['progress.status'] = 'attempted';
  }
  await Question.updateOne(
    { _id: doc._id },
    { $set: set, $inc: { 'progress.attempts': 1, 'progress.timeSpentSec': clamp(Math.round(Number(timeSpentSec) || 0), 0, 4 * 3600) } },
  );
}

export async function recordCodingSubmission(doc, { language, code, result, timeSpentSec }) {
  const _id = await nextSeq('submissions');
  const accepted = result.verdict === 'accepted';
  await Submission.create({
    _id,
    questionId: doc._id,
    kind: 'coding',
    language,
    code,
    verdict: result.verdict,
    passed: result.passed,
    total: result.total,
    runtimeMs: result.runtimeMs,
    executor: result.executor,
    approximate: Boolean(result.approximate),
    details: { results: result.results, compileError: result.compileError, runtime: result.runtime, notice: result.notice },
    timeSpentSec: Math.round(Number(timeSpentSec) || 0),
  });
  await applyAttempt(doc, { solved: accepted, timeSpentSec, runtimeMs: result.runtimeMs });
  return _id;
}

export async function recordMcqAnswer(doc, { answer, timeSpentSec }) {
  const d = doc.data;
  const idx = toInt(answer, -1);
  if (idx < 0 || idx >= (d.options || []).length) throw badRequest('Invalid option');
  const correct = idx === d.correctIndex;
  const _id = await nextSeq('submissions');
  await Submission.create({
    _id,
    questionId: doc._id,
    kind: 'mcq',
    answer: idx,
    verdict: correct ? 'correct' : 'incorrect',
    passed: correct ? 1 : 0,
    total: 1,
    timeSpentSec: Math.round(Number(timeSpentSec) || 0),
  });
  await applyAttempt(doc, { solved: correct, timeSpentSec });
  return { submissionId: _id, correct, correctIndex: correct ? d.correctIndex : undefined, explanation: correct ? d.explanation : undefined };
}

export async function listSubmissions(questionId) {
  const rows = await Submission.find({ questionId: toInt(questionId, -1) }, { code: 0, details: 0 }).sort({ _id: -1 }).limit(100).lean();
  return rows.map(({ review, ...r }) => ({ ...toClient(r), hasReview: Boolean(review) }));
}

export async function getSubmission(id) {
  const row = await Submission.findById(toInt(id, -1)).lean();
  if (!row) throw notFound('Submission not found');
  return toClient(row);
}
