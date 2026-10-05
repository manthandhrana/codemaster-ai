import { Router } from 'express';
import { CODING_LANGUAGE_IDS } from '../constants.js';
import { Submission } from '../db/models.js';
import { judgeCode } from '../executor/judge.js';
import { aiHint, reviewCode, translateStarter } from '../services/assist.js';
import {
  deleteQuestions,
  facets,
  getQuestionDoc,
  getSubmission,
  listQuestions,
  listSubmissions,
  publicQuestion,
  recordCodingSubmission,
  recordMcqAnswer,
  resetProgress,
  revealNextHint,
  revealSolution,
  updateQuestionMeta,
} from '../services/questions.js';
import { badRequest, toInt } from '../utils/misc.js';

const router = Router();

function codeInput(body) {
  const language = String(body?.language || '');
  const code = String(body?.code ?? '');
  if (!CODING_LANGUAGE_IDS.includes(language)) throw badRequest('Unsupported language');
  if (!code.trim()) throw badRequest('Code is empty');
  if (code.length > 100_000) throw badRequest('Code is too long (max 100 KB)');
  return { language, code };
}

async function codingDoc(id) {
  const doc = await getQuestionDoc(id);
  if (doc.type !== 'coding') throw badRequest('This is not a coding problem');
  return doc;
}

router.get('/', async (req, res) => res.json(await listQuestions(req.query)));
router.get('/facets', async (_req, res) => res.json(await facets()));
router.get('/:id', async (req, res) => res.json(await publicQuestion(await getQuestionDoc(req.params.id))));

router.patch('/:id', async (req, res) => {
  await updateQuestionMeta(req.params.id, req.body || {});
  res.json(await publicQuestion(await getQuestionDoc(req.params.id)));
});

router.delete('/:id', async (req, res) => res.json({ deleted: await deleteQuestions([toInt(req.params.id, -1)]) }));
router.post('/bulk-delete', async (req, res) => res.json({ deleted: await deleteQuestions(req.body?.ids || []) }));

// ---- practice flow
router.post('/:id/hint', async (req, res) => {
  const doc = await getQuestionDoc(req.params.id);
  const hints = await revealNextHint(doc);
  res.json({ hints, hintsTotal: (doc.data.hints || []).length });
});

router.post('/:id/reveal', async (req, res) => {
  const doc = await getQuestionDoc(req.params.id);
  res.json(await revealSolution(doc));
});

router.post('/:id/reset', async (req, res) => {
  await resetProgress(await getQuestionDoc(req.params.id));
  res.json(await publicQuestion(await getQuestionDoc(req.params.id)));
});

router.post('/:id/run', async (req, res) => {
  const doc = await codingDoc(req.params.id);
  const { language, code } = codeInput(req.body);
  res.json(await judgeCode({ question: doc, language, code, mode: 'run', customInput: req.body?.customInput }));
});

router.post('/:id/submit', async (req, res) => {
  const doc = await codingDoc(req.params.id);
  const { language, code } = codeInput(req.body);
  const result = await judgeCode({ question: doc, language, code, mode: 'submit' });
  const submissionId = await recordCodingSubmission(doc, { language, code, result, timeSpentSec: req.body?.timeSpentSec });
  const fresh = await getQuestionDoc(doc._id);
  res.json({ ...result, submissionId, progress: fresh.progress });
});

router.post('/:id/answer', async (req, res) => {
  const doc = await getQuestionDoc(req.params.id);
  if (doc.type !== 'mcq') throw badRequest('This is not an MCQ');
  const result = await recordMcqAnswer(doc, { answer: req.body?.answer, timeSpentSec: req.body?.timeSpentSec });
  const fresh = await getQuestionDoc(doc._id);
  res.json({ ...result, progress: fresh.progress });
});

router.get('/:id/submissions', async (req, res) => res.json({ items: await listSubmissions(req.params.id) }));

// ---- AI assistance (counted in "AI usage")
router.post('/:id/ai-hint', async (req, res) => {
  const doc = await getQuestionDoc(req.params.id);
  res.json(await aiHint(doc, { language: req.body?.language || doc.language, code: req.body?.code || '' }));
});

router.post('/:id/review', async (req, res) => {
  const doc = await codingDoc(req.params.id);
  let { language, code, verdict } = req.body || {};
  const submissionId = req.body?.submissionId;
  if (submissionId) {
    const sub = await Submission.findOne({ _id: toInt(submissionId, -1), questionId: doc._id }).lean();
    if (!sub) throw badRequest('Submission not found for this question');
    if (sub.review) return res.json(sub.review);
    ({ language, code, verdict } = sub);
  }
  res.json(await reviewCode(doc, { language: language || doc.language, code, verdict, submissionId }));
});

router.post('/:id/starter', async (req, res) => {
  const doc = await codingDoc(req.params.id);
  const language = String(req.body?.language || '');
  if (!CODING_LANGUAGE_IDS.includes(language)) throw badRequest('Unsupported language');
  if (language === doc.language) return res.json({ starterCode: doc.data.starterCode, cached: true });
  res.json(await translateStarter(doc, language));
});

export const submissionRouter = Router();
submissionRouter.get('/:id', async (req, res) => res.json(await getSubmission(req.params.id)));

export default router;
