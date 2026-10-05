import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODING_LANGUAGE_IDS, DIFFICULTY_IDS } from '../src/constants.js';
import {
  assistantPrompt,
  assistantText,
  loadLibrary,
  parseFrontMatter,
  render,
  renderContract,
  templateVariables,
} from '../src/services/promptLibrary.js';

const lib = loadLibrary({ force: true });
const GENERATION_VARS = ['difficulty', 'language', 'topic', 'count', 'extra', 'date'];
const sampleVars = { difficulty: 'Hard', language: 'Python 3', topic: 'Graphs', count: 5, extra: 'Use a grid', date: 'today' };

test('prompt library loads with no file errors', () => {
  assert.deepEqual(lib.errors, []);
  assert.ok(lib.templates.length >= 12, `expected >= 12 templates, got ${lib.templates.length}`);
});

test('template keys are unique and folders match the front-matter type', () => {
  const keys = lib.templates.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const t of lib.templates) assert.ok(t.file.startsWith(`templates/${t.type}/`), `${t.file} is not in templates/${t.type}/`);
});

test('every difficulty has a dedicated coding and MCQ template', () => {
  for (const type of ['coding', 'mcq']) {
    for (const d of DIFFICULTY_IDS) {
      assert.ok(
        lib.templates.some((t) => t.type === type && t.difficulty === d && t.key === `${type}_${d}`),
        `missing ${type}_${d} template`,
      );
    }
  }
});

test('templates only use the documented generation variables', () => {
  for (const t of lib.templates) {
    for (const v of templateVariables(t.template)) assert.ok(GENERATION_VARS.includes(v), `${t.file} uses unknown variable {{${v}}}`);
  }
});

test('rendered templates leave no unresolved placeholders', () => {
  for (const t of lib.templates) {
    const out = render(t.template, sampleVars);
    assert.ok(!/\{\{|\}\}/.test(out), `${t.file} still contains a placeholder:\n${out}`);
    assert.ok(out.includes('Use a grid'), `${t.file} ignores {{extra}}`);
  }
});

test('mini template engine: variables, if, unless, each', () => {
  assert.equal(render('Hi {{name}}!', { name: 'Admin' }), 'Hi Admin!');
  assert.equal(render('a{{#if x}}B{{/if}}c', { x: true }), 'aBc');
  assert.equal(render('a{{#if x}}B{{/if}}c', { x: '' }), 'ac');
  assert.equal(render('a{{#unless x}}B{{/unless}}c', {}), 'aBc');
  assert.equal(render('{{#each list}}- {{this}}\n{{/each}}', { list: ['x', 'y'] }), '- x\n- y');
  assert.equal(render('{{missing}}', {}), '');
});

test('front matter parser', () => {
  const { meta, body } = parseFrontMatter('---\nkey: demo_key   # comment\nversion: 3\nname: "Demo # 1"\nlang: C# drills\n---\nBody text');
  assert.deepEqual(meta, { key: 'demo_key', version: 3, name: 'Demo # 1', lang: 'C# drills' });
  assert.equal(body, 'Body text');
});

test('coding contract renders for every coding language', () => {
  for (const language of CODING_LANGUAGE_IDS) {
    assert.ok(lib.languageRules[language], `no language rule for ${language}`);
    const out = renderContract('coding', { language, languageRules: lib.languageRules[language], withReferenceJs: true });
    assert.ok(!/\{\{|\}\}/.test(out), `unresolved placeholder for ${language}`);
    assert.ok(out.includes('"referenceJs"') && out.includes(lib.languageRules[language]));
  }
  const withoutJs = renderContract('coding', { language: 'JavaScript', languageRules: '', withReferenceJs: false });
  assert.ok(!withoutJs.includes('referenceJs'));
});

test('MCQ contract and avoid block', () => {
  assert.match(renderContract('mcq', { countLabel: '5 questions' }), /Exactly 5 questions/);
  const avoid = renderContract('avoid', { titles: ['Two Pointers Party', 'Grid Walk'], kind: 'problems' });
  assert.match(avoid, /existing problems:\n- Two Pointers Party\n- Grid Walk/);
  assert.equal(renderContract('avoid', { titles: [], kind: 'problems' }), '');
});

test('assistant prompts exist and render without placeholders', () => {
  const vars = {
    problem: 'P',
    shownHints: '1. h',
    isMcq: false,
    language: 'Python 3',
    code: 'print(1)',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(1)',
    verdict: 'accepted',
    ratings: 'Hire | No Hire',
    tests: '[]',
    inputFormat: 'n',
    fromLanguage: 'Python 3',
    starterCode: 'x',
    languageRules: 'rule',
  };
  for (const name of ['hint', 'review', 'judge', 'starter', 'test']) {
    const p = assistantPrompt(name, vars);
    assert.ok(p.system.length > 20 && p.user.length > 10, `${name} prompt is empty`);
    assert.ok(!/\{\{|\}\}/.test(p.system + p.user), `${name} prompt has an unresolved placeholder`);
  }
  assert.match(assistantText('problem', 'coding', { title: 'T', description: 'D' }), /^# T/);
});
