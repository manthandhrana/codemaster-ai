import { ValidationError } from '../ai/json.js';
import { aiComplete } from '../ai/router.js';
import { languageLabel } from '../constants.js';
import { Question, Submission } from '../db/models.js';
import { badRequest, truncate } from '../utils/misc.js';
import { normalizeHint, normalizeReview, REVIEW_RATINGS } from './normalize.js';
import { assistantPrompt, assistantText, languageRule } from './promptLibrary.js';

/** How a stored question is described to the AI (prompts/assistant/problem.<type>.md). */
function problemText(doc) {
  const d = doc.data;
  if (doc.type === 'mcq') {
    return assistantText('problem', 'mcq', {
      language: languageLabel(doc.language),
      question: d.question,
      options: d.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n'),
    });
  }
  return truncate(
    assistantText('problem', 'coding', {
      title: doc.title,
      description: d.description,
      inputFormat: d.inputFormat || '',
      outputFormat: d.outputFormat || '',
      constraints: (d.constraints || []).join('\n'),
    }),
    6000,
  );
}

/** A hint tailored to the candidate's current code - never the full solution. */
export async function aiHint(doc, { language, code }) {
  const shown = (doc.data.hints || []).slice(0, doc.progress?.hintsUsed || 0);
  const res = await aiComplete({
    purpose: 'hint',
    temperature: 0.4,
    maxTokens: 1500,
    ...assistantPrompt('hint', {
      problem: problemText(doc),
      shownHints: shown.map((h, i) => `${i + 1}. ${h}`).join('\n'),
      isMcq: doc.type === 'mcq',
      language: languageLabel(language),
      code: truncate(code || '(empty)', 10000),
    }),
    validate: normalizeHint,
  });
  await Question.updateOne({ _id: doc._id }, { $inc: { 'progress.aiHints': 1 } });
  return { ...res.data, provider: res.providerName, model: res.model };
}

/** Interview-style code review of a submission (or arbitrary code). */
export async function reviewCode(doc, { language, code, verdict, submissionId }) {
  if (doc.type !== 'coding') throw badRequest('Reviews are only available for coding problems');
  if (!String(code || '').trim()) throw badRequest('No code to review');
  const d = doc.data;
  const res = await aiComplete({
    purpose: 'review',
    temperature: 0.3,
    maxTokens: 3000,
    ...assistantPrompt('review', {
      problem: problemText(doc),
      timeComplexity: d.complexity?.time || 'unknown',
      spaceComplexity: d.complexity?.space || 'unknown',
      verdict: verdict || 'not submitted',
      language: languageLabel(language),
      code: truncate(code, 12000),
      ratings: REVIEW_RATINGS.join(' | '),
    }),
    validate: normalizeReview,
  });
  const review = { ...res.data, provider: res.providerName, model: res.model, createdAt: new Date() };
  await Question.updateOne({ _id: doc._id }, { $inc: { 'progress.aiReviews': 1 } });
  if (submissionId) await Submission.updateOne({ _id: Number(submissionId) }, { $set: { review } });
  return review;
}

/** Translates the starter template to another language and caches it on the question. */
export async function translateStarter(doc, language) {
  if (doc.type !== 'coding') throw badRequest('Starter code only exists for coding problems');
  const d = doc.data;
  if (d.starterCodes?.[language]) return { starterCode: d.starterCodes[language], cached: true };
  const res = await aiComplete({
    purpose: 'starter',
    temperature: 0.2,
    maxTokens: 2500,
    ...assistantPrompt('starter', {
      inputFormat: d.inputFormat || '(see statement)',
      fromLanguage: languageLabel(doc.language),
      starterCode: truncate(d.starterCode || '', 6000),
      language: languageLabel(language),
      languageRules: languageRule(language),
    }),
    validate: (data) => {
      const code = String(data?.starterCode || '').trim();
      if (code.length < 10) throw new ValidationError('missing starterCode');
      return `${code}\n`;
    },
  });
  await Question.updateOne({ _id: doc._id }, { $set: { [`data.starterCodes.${language}`]: res.data } });
  return { starterCode: res.data, cached: false, provider: res.providerName };
}
