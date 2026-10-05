import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseJsonLoose, ValidationError } from '../src/ai/json.js';
import { normalizeCoding, normalizeHint, normalizeJudge, normalizeMcqList, normalizeReview } from '../src/services/normalize.js';
import { checkSchema } from '../src/services/validate.js';

const example = (p) => fs.readFileSync(new URL(`../prompts/examples/${p}`, import.meta.url), 'utf8');
const cleanCoding = JSON.parse(example('coding.response.json'));
const cleanMcq = JSON.parse(example('mcq.response.json'));

test('examples follow the response contracts given to the AI', () => {
  assert.deepEqual(checkSchema('coding-response', cleanCoding).errors, []);
  assert.deepEqual(checkSchema('mcq-response', cleanMcq).errors, []);
});

test('clean coding answer -> stored coding-question shape', () => {
  const q = normalizeCoding(cleanCoding, 'python');
  assert.deepEqual(checkSchema('coding-question', q).errors, []);
  assert.equal(q.examples.length, 2);
  assert.equal(q.testCases.length, 6);
  assert.equal(q.hints.length, 3);
  assert.ok(q.referenceJs.includes('BigInt'));
  assert.deepEqual(q.starterCodes, {});
});

test('messy coding answer (think block, prose, fences, aliases, trailing comma) still normalizes', () => {
  const q = normalizeCoding(parseJsonLoose(example('messy/coding-fenced.txt')), 'python');
  assert.deepEqual(checkSchema('coding-question', q).errors, []);
  assert.equal(q.title, 'Quiet Corridor'); // quotes stripped
  assert.deepEqual(q.tags, ['prefix sums', 'two pointers']); // string -> list
  assert.equal(q.constraints.length, 2);
  assert.equal(q.examples[0].input, '3 2\n1 1 1'); // array of lines joined
  assert.equal(q.examples[0].output, '2'); // number -> string
  assert.equal(q.examples[1].input, '3 3\n1 2 3'); // double-escaped newline repaired
  assert.equal(q.examples[1].output, '2'); // "expectedOutput" alias
  assert.equal(q.testCases.length, 3); // "tests" alias, duplicate of an example removed
  assert.equal(q.hints.length, 2);
  assert.deepEqual(q.complexity, { time: 'O(n)', space: 'O(n)' });
  assert.ok(q.solutionCode.includes('defaultdict')); // "solution" alias
  assert.ok(q.starterCode.includes('def main')); // missing starter -> language boilerplate
  assert.deepEqual(q.followUps, ['Return the stretches themselves, not just the count.']);
  assert.equal('referenceJs' in q, false); // optional field absent, not undefined
});

test('answers that cannot be stored consistently are rejected (-> next provider)', () => {
  assert.throws(() => normalizeCoding('not an object', 'python'), ValidationError);
  assert.throws(() => normalizeCoding({ ...cleanCoding, description: 'too short' }, 'python'), /description/);
  assert.throws(() => normalizeCoding({ ...cleanCoding, solutionCode: '' }, 'python'), /solutionCode/);
  assert.throws(() => normalizeCoding({ ...cleanCoding, examples: [] }, 'python'), /examples/);
  assert.throws(() => normalizeCoding({ ...cleanCoding, solutionCode: 'x=1' }, 'python'), /schema/);
  assert.throws(() => normalizeMcqList({ questions: [{ question: 'Which one is it?', options: ['a', 'a', 'b', 'c'], correctIndex: 0 }] }), /no valid MCQs/);
});

test('MCQ shuffle never loses the correct answer', () => {
  for (let i = 0; i < 25; i++) {
    const [q1, q2] = normalizeMcqList(cleanMcq);
    assert.equal(q1.options[q1.correctIndex], 'It is not guaranteed');
    assert.equal(q2.options[q2.correctIndex], 'true false');
  }
});

test('messy MCQ variants: letter answers, "A)" prefixes, option objects, text answers; broken item dropped', () => {
  const list = normalizeMcqList(JSON.parse(example('messy/mcq-variants.json')));
  assert.equal(list.length, 2);
  assert.equal(list.rejected.length, 1);
  for (const q of list) assert.deepEqual(checkSchema('mcq-question', q).errors, []);
  const bs = list.find((q) => q.question.includes('binary search'));
  assert.equal(bs.options[bs.correctIndex], 'O(log n)');
  assert.ok(bs.options.every((o) => !/^[A-D]\)/.test(o)));
  assert.deepEqual(bs.hints, ['How many times can you halve n?']);
  const ht = list.find((q) => q.question.includes('O(1) average'));
  assert.equal(ht.options[ht.correctIndex], 'Hash table');
});

test('assistant answers are coerced into their schemas', () => {
  assert.deepEqual(normalizeHint({ hint: 'Use a stack', focus: '' }), { hint: 'Use a stack', focus: 'approach' });
  assert.throws(() => normalizeHint({}), ValidationError);

  const r = normalizeReview({ summary: 'Good', codeQuality: '8.6', interviewRating: 'strong hire', isOptimal: 'true', strengths: 'a\nb' });
  assert.equal(r.codeQuality, 9);
  assert.equal(r.interviewRating, 'Strong Hire');
  assert.equal(r.isOptimal, true);
  assert.deepEqual(r.strengths, ['a', 'b']);
  assert.deepEqual(checkSchema('ai-review', r).errors, []);

  const j = normalizeJudge({ results: [{ index: '0', output: 5 }, { index: 9, output: 'x' }] }, 2);
  assert.equal(j.compiles, true);
  assert.deepEqual(j.results, [{ index: 0, output: '5', status: 'ok', note: null }]);
});
