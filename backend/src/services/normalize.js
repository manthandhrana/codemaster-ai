import { ValidationError } from '../ai/json.js';
import { BOILERPLATES } from '../constants.js';
import { shuffle } from '../utils/misc.js';
import { normalizeOutput } from '../utils/output.js';
import { assertSchema, checkSchema } from './validate.js';

/**
 * Turns any provider's answer into the ONE stored shape (prompts/schemas/*-question.schema.json).
 * Tolerates field aliases, numbers instead of strings, arrays of lines, double-escaped
 * newlines, "A)" option prefixes, letter answers... and rejects anything still invalid.
 */

function str(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(str).join('\n');
  if (typeof v === 'object') return v.text ?? v.content ?? v.value ?? JSON.stringify(v);
  return String(v);
}

function strList(v) {
  if (Array.isArray(v)) return v.map((x) => str(x).trim()).filter(Boolean);
  return str(v)
    .split('\n')
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/** Test data: arrays of lines are joined; a double-escaped "\n" is unescaped when there is no real newline. */
function ioString(v) {
  let s = Array.isArray(v) ? v.map(str).join('\n') : str(v);
  if (!s.includes('\n') && s.includes('\\n')) s = s.replace(/\\n/g, '\n');
  return s.replace(/\r\n?/g, '\n');
}

const sameCode = (a, b) => a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
const stripQuotes = (s) => s.replace(/^["'`]+|["'`]+$/g, '').trim();

/** Drops undefined keys so optional fields are absent instead of `undefined` (schema-friendly). */
const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// ------------------------------------------------------------------ coding problems

export function normalizeCoding(raw, language) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('expected a JSON object');
  const r = raw.problem && typeof raw.problem === 'object' ? { ...raw, ...raw.problem } : raw;

  const title = stripQuotes(str(r.title)).slice(0, 120);
  const description = str(r.description || r.statement).trim();
  const examples = (Array.isArray(r.examples) ? r.examples : [])
    .map((e) => ({
      input: ioString(e?.input),
      output: normalizeOutput(ioString(e?.output ?? e?.expectedOutput ?? e?.expected)),
      explanation: str(e?.explanation).trim(),
    }))
    .filter((e) => e.input.trim() !== '' && e.output !== '');
  const rawTests = r.testCases || r.tests || r.hiddenTests || r.hiddenTestCases || [];
  const tests = (Array.isArray(rawTests) ? rawTests : [])
    .map((t) => ({ input: ioString(t?.input), output: normalizeOutput(ioString(t?.output ?? t?.expectedOutput ?? t?.expected)) }))
    .filter((t) => t.input.trim() !== '' && t.output !== '');
  const solutionCode = str(r.solutionCode || r.solution || r.referenceSolution).trim();

  if (!title) throw new ValidationError('missing title');
  if (description.length < 30) throw new ValidationError('missing or too short description');
  if (!examples.length) throw new ValidationError('no valid examples');
  if (!solutionCode) throw new ValidationError('missing solutionCode');

  const seen = new Set(examples.map((e) => e.input.trim()));
  const hidden = [];
  for (const t of tests) {
    const key = t.input.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    hidden.push(t);
    if (hidden.length >= 15) break;
  }

  const hints = strList(r.hints).slice(0, 5);
  const complexity =
    r.complexity && typeof r.complexity === 'object'
      ? { time: str(r.complexity.time), space: str(r.complexity.space) }
      : { time: str(r.timeComplexity), space: str(r.spaceComplexity) };
  let starter = str(r.starterCode || r.starter).trim();
  if (!starter || sameCode(starter, solutionCode)) starter = (BOILERPLATES[language] || '# write your solution here').trim();
  const referenceJs = str(r.referenceJs).trim();

  const q = compact({
    title,
    topic: str(r.topic).trim().slice(0, 60),
    tags: strList(r.tags)
      .slice(0, 6)
      .map((t) => t.slice(0, 30)),
    pattern: str(r.pattern).trim().slice(0, 80),
    description,
    inputFormat: str(r.inputFormat || r.input_format).trim(),
    outputFormat: str(r.outputFormat || r.output_format).trim(),
    constraints: strList(r.constraints),
    examples: examples.slice(0, 4),
    testCases: hidden,
    hints: hints.length ? hints : ['Start with a brute force, then find the repeated work you can avoid.'],
    approach: str(r.approach || r.editorial || r.explanation).trim(),
    complexity,
    starterCode: `${starter}\n`,
    starterCodes: {},
    solutionCode: `${solutionCode}\n`,
    referenceJs: referenceJs.length >= 10 ? `${referenceJs}\n` : undefined,
    followUps: strList(r.followUps || r.followups || r.follow_ups).slice(0, 4),
  });
  return assertSchema('coding-question', q);
}

// ------------------------------------------------------------------ MCQs

const OPTION_PREFIX = /^\s*(?:\(?[A-Da-d][).:]|Option\s+[A-Da-d][:.)]?|[1-4][).])\s+/;
const POSITIONAL = /\b(all|none|both|neither)\b.*\b(above|of these|[A-D]\b)/i;

function normalizeOneMcq(m) {
  if (!m || typeof m !== 'object') throw new ValidationError('mcq item is not an object');
  const question = str(m.question || m.prompt || m.stem).trim();
  let options = (Array.isArray(m.options || m.choices) ? m.options || m.choices : []).map((o) =>
    typeof o === 'string' ? o : str(o?.text ?? o?.value ?? o?.option ?? o),
  );
  if (options.length && options.every((o) => OPTION_PREFIX.test(o))) options = options.map((o) => o.replace(OPTION_PREFIX, ''));
  options = options.map((o) => o.trim());
  if (question.length < 10) throw new ValidationError('mcq question too short');
  if (options.length < 3 || options.length > 6 || options.some((o) => !o)) throw new ValidationError('mcq needs 3-6 options');
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new ValidationError('duplicate options');

  let ci = m.correctIndex ?? m.correct_index ?? m.answerIndex ?? m.correct ?? m.answer;
  if (typeof ci === 'string') {
    const t = ci.trim();
    if (/^[A-Fa-f]$/.test(t)) ci = t.toUpperCase().charCodeAt(0) - 65;
    else if (/^\d+$/.test(t)) ci = Number(t);
    else ci = options.findIndex((o) => o.toLowerCase() === t.replace(OPTION_PREFIX, '').toLowerCase());
  }
  if (!Number.isInteger(ci) || ci < 0 || ci >= options.length) throw new ValidationError('invalid correctIndex');

  // Models put the right answer first far too often: shuffle unless options refer to each other.
  let finalOptions = options;
  let correctIndex = ci;
  if (!options.some((o) => POSITIONAL.test(o))) {
    const order = shuffle(options.map((_, i) => i));
    finalOptions = order.map((i) => options[i]);
    correctIndex = order.indexOf(ci);
  }
  const hints = strList(m.hints || (m.hint ? [m.hint] : []));
  const firstLine = question.replace(/```[\s\S]*?```/g, ' ').replace(/[`*#_>]/g, '').trim().split('\n')[0];
  let title = (stripQuotes(str(m.title)) || firstLine).slice(0, 90);
  if (title.length < 3) title = 'Untitled question';
  return {
    title,
    topic: str(m.topic).trim().slice(0, 60),
    tags: strList(m.tags)
      .slice(0, 5)
      .map((t) => t.slice(0, 30)),
    question,
    options: finalOptions,
    correctIndex,
    explanation: str(m.explanation || m.rationale).trim() || 'No explanation provided.',
    hints: hints.length ? hints.slice(0, 3) : ['Eliminate the options you are sure are wrong first.'],
  };
}

/** Valid items only (invalid ones are dropped with their reasons); throws when none survive. */
export function normalizeMcqList(raw) {
  const list = Array.isArray(raw) ? raw : raw?.questions || raw?.mcqs || raw?.items || (raw?.question ? [raw] : []);
  const out = [];
  const rejected = [];
  for (const item of list) {
    try {
      const m = normalizeOneMcq(item);
      const check = checkSchema('mcq-question', m);
      if (!check.ok) throw new ValidationError(check.errors.join('; '));
      out.push(m);
    } catch (e) {
      rejected.push(e.message);
    }
  }
  if (!out.length) throw new ValidationError(`no valid MCQs in the response${rejected.length ? ` (${rejected.slice(0, 2).join(' | ')})` : ''}`);
  out.rejected = rejected;
  return out;
}

// ------------------------------------------------------------------ assistant answers

export function normalizeHint(raw) {
  return assertSchema('ai-hint', { hint: str(raw?.hint).trim(), focus: str(raw?.focus).trim() || 'approach' });
}

const RATINGS = ['Strong Hire', 'Hire', 'Lean Hire', 'Lean No Hire', 'No Hire'];
export const REVIEW_RATINGS = RATINGS;

export function normalizeReview(raw) {
  if (!raw?.summary) throw new ValidationError('missing summary');
  return assertSchema('ai-review', {
    summary: str(raw.summary),
    correctness: str(raw.correctness),
    timeComplexity: str(raw.timeComplexity),
    spaceComplexity: str(raw.spaceComplexity),
    isOptimal: raw.isOptimal === true || raw.isOptimal === 'true',
    codeQuality: Math.max(1, Math.min(10, Math.round(Number(raw.codeQuality)) || 5)),
    interviewRating: RATINGS.find((r) => r.toLowerCase() === str(raw.interviewRating).trim().toLowerCase()) || 'Lean Hire',
    strengths: strList(raw.strengths).slice(0, 6),
    improvements: strList(raw.improvements).slice(0, 6),
    optimizedApproach: str(raw.optimizedApproach),
  });
}

export function normalizeJudge(raw, total) {
  const results = (Array.isArray(raw?.results) ? raw.results : []).map((r, i) => ({
    index: Number.isInteger(Number(r?.index)) ? Number(r.index) : i,
    output: str(r?.output),
    status: ['ok', 'runtime_error', 'timeout'].includes(r?.status) ? r.status : 'ok',
    note: r?.note ? str(r.note) : null,
  }));
  const value = {
    compiles: raw?.compiles !== false,
    compileError: raw?.compileError ? str(raw.compileError) : null,
    results: results.filter((r) => r.index >= 0 && r.index < total),
  };
  return assertSchema('ai-judge', value);
}
