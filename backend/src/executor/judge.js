import { aiComplete } from '../ai/router.js';
import { languageLabel } from '../constants.js';
import { normalizeJudge } from '../services/normalize.js';
import { assistantPrompt, assistantText } from '../services/promptLibrary.js';
import { getSetting } from '../services/settings.js';
import { truncate } from '../utils/misc.js';
import { compareOutput, normalizeOutput } from '../utils/output.js';
import { canExecuteLocally, runProgram } from './index.js';

export { compareOutput, normalizeOutput };

/** Reference programs for a question, locally-runnable ones first. */
function referencePrograms(question) {
  const d = question.data;
  const progs = [];
  if (d.solutionCode) progs.push({ language: question.language, code: d.solutionCode });
  if (d.referenceJs && question.language !== 'javascript') progs.push({ language: 'javascript', code: d.referenceJs });
  return progs.sort((a, b) => Number(canExecuteLocally(b.language)) - Number(canExecuteLocally(a.language)));
}

/** Expected outputs for arbitrary inputs, computed by running the reference solution. */
export async function runReference(question, inputs) {
  for (const prog of referencePrograms(question)) {
    try {
      const r = await runProgram(prog.language, prog.code, inputs, { timeLimitMs: 10000 });
      if (!r.compileError && r.results.length === inputs.length && r.results.every((x) => x.status === 'ok')) {
        return r.results.map((x) => normalizeOutput(x.stdout));
      }
    } catch {
      /* try the next reference program */
    }
  }
  return null;
}

/**
 * Runs the generated reference solution on the generated tests. Expected outputs that disagree
 * with a solution that passes most tests are corrected (LLMs often mis-compute outputs by hand).
 * Mutates `q.examples` / `q.testCases` on success.
 */
export async function verifyCodingQuestion(q, language, onEvent) {
  const tests = [
    ...q.examples.map((t) => ({ ...t, kind: 'example' })),
    ...q.testCases.map((t) => ({ ...t, kind: 'hidden' })),
  ];
  const progs = referencePrograms({ language, data: q });
  let lastIssue = 'no code runner available';
  let executed = false;
  for (const prog of progs) {
    let exec;
    try {
      exec = await runProgram(prog.language, prog.code, tests.map((t) => t.input), { timeLimitMs: 10000 });
    } catch (e) {
      lastIssue = e.message;
      continue;
    }
    executed = true;
    const by = `${languageLabel(prog.language)} reference via ${exec.executor}`;
    if (exec.compileError) {
      lastIssue = `${languageLabel(prog.language)} reference solution failed to compile: ${truncate(exec.compileError, 160)}`;
      continue;
    }
    const ok = exec.results.map((r) => r?.status === 'ok');
    const okCount = ok.filter(Boolean).length;
    if (okCount < Math.ceil(tests.length * 0.6)) {
      lastIssue = `reference solution crashed/timed out on ${tests.length - okCount}/${tests.length} tests`;
      continue;
    }
    let matches = 0;
    exec.results.forEach((r, i) => {
      if (ok[i] && compareOutput(r.stdout, tests[i].output)) matches++;
    });
    if (matches / okCount < 0.5) {
      lastIssue = `expected outputs disagree with the reference solution (${matches}/${okCount} match)`;
      continue;
    }
    const kept = [];
    let fixed = 0;
    exec.results.forEach((r, i) => {
      if (!ok[i]) return;
      const out = normalizeOutput(r.stdout);
      if (!compareOutput(out, tests[i].output)) fixed++;
      kept.push({ ...tests[i], output: out });
    });
    const examples = kept.filter((t) => t.kind === 'example').map(({ kind, ...t }) => t);
    const hidden = kept.filter((t) => t.kind === 'hidden').map(({ kind, explanation, ...t }) => t);
    if (!examples.length && hidden.length) examples.push(hidden.shift());
    q.examples = examples;
    q.testCases = hidden;
    const result = { status: 'verified', by, fixed, dropped: tests.length - okCount, matched: matches, total: tests.length };
    onEvent?.({
      level: 'success',
      msg: `✓ Tests verified by running the ${by} (${matches}/${tests.length} matched${fixed ? `, ${fixed} auto-corrected` : ''}${result.dropped ? `, ${result.dropped} dropped` : ''})`,
    });
    return result;
  }
  const status = executed ? 'failed' : 'unverifiable';
  onEvent?.({ level: 'warn', msg: `⚠ Test verification ${status}: ${truncate(lastIssue, 180)}` });
  return { status, reason: lastIssue };
}

// ---------------------------------------------------------------- submissions

function verdictOf(results, total) {
  for (const r of results) {
    if (r.passed) continue;
    if (r.status === 'timeout') return 'time_limit';
    if (r.status === 'output_limit') return 'output_limit';
    if (r.status === 'runtime_error') return 'runtime_error';
    return 'wrong_answer';
  }
  return results.length === total ? 'accepted' : 'wrong_answer';
}

function buildTests(question, mode, customInput) {
  const d = question.data;
  const examples = (d.examples || []).map((t, i) => ({ input: t.input, output: t.output, label: `Example ${i + 1}`, hidden: false }));
  if (mode === 'run') {
    if (customInput !== undefined && customInput !== null && String(customInput).trim() !== '') {
      return [{ input: String(customInput), output: null, label: 'Custom input', hidden: false, custom: true }];
    }
    return examples;
  }
  const hidden = (d.testCases || []).map((t, i) => ({ input: t.input, output: t.output, label: `Hidden test ${i + 1}`, hidden: true }));
  return [...examples, ...hidden];
}

/**
 * Judges code against a question's tests.
 * mode 'run'    -> examples only (or a custom input, whose expected output comes from the reference solution)
 * mode 'submit' -> examples + hidden tests, stopping at the first failure
 */
export async function judgeCode({ question, language, code, mode = 'run', customInput }) {
  const tests = buildTests(question, mode, customInput);
  if (!tests.length) throw Object.assign(new Error('This question has no test cases'), { status: 400 });

  if (tests[0].custom) {
    const expected = await runReference(question, [tests[0].input]);
    tests[0].output = expected ? expected[0] : null;
  }

  const settings = getSetting('executor');
  const shouldContinue =
    mode === 'submit' ? (i, r) => r.status === 'ok' && (tests[i].output == null || compareOutput(r.stdout, tests[i].output)) : null;

  let exec;
  try {
    exec = await runProgram(language, code, tests.map((t) => t.input), { timeLimitMs: settings.timeLimitMs, shouldContinue });
  } catch (e) {
    if (e.noExecutor && settings.aiJudge) return aiJudge({ question, language, code, tests, mode, reason: e.message });
    throw e;
  }
  return finalize({ tests, exec, mode });
}

function finalize({ tests, exec, mode, approximate = false }) {
  if (exec.compileError) {
    return {
      verdict: 'compile_error',
      compileError: exec.compileError,
      passed: 0,
      total: tests.length,
      runtimeMs: null,
      executor: exec.executor,
      runtime: exec.runtime,
      approximate,
      results: [],
    };
  }
  let revealedHiddenFailure = false;
  const results = exec.results.map((r, i) => {
    const t = tests[i];
    const hasExpected = t.output !== null && t.output !== undefined;
    const passed = r.status === 'ok' && (!hasExpected || compareOutput(r.stdout, t.output));
    // Like LeetCode: hidden tests stay hidden unless it is the first failing one.
    const reveal = !t.hidden || (!passed && !revealedHiddenFailure);
    if (t.hidden && !passed) revealedHiddenFailure = true;
    return {
      index: i,
      label: t.label,
      hidden: t.hidden,
      passed,
      status: r.status,
      timeMs: r.timeMs ?? null,
      input: reveal ? truncate(t.input, 5000) : undefined,
      expected: reveal && hasExpected ? truncate(normalizeOutput(t.output), 5000) : undefined,
      actual: reveal ? truncate(normalizeOutput(r.stdout), 5000) : undefined,
      stderr: reveal && r.stderr ? truncate(r.stderr, 3000) : undefined,
      note: r.note,
    };
  });
  const custom = tests[0]?.custom;
  let verdict = verdictOf(results, tests.length);
  if (custom && tests[0].output == null) verdict = results[0]?.status === 'ok' ? 'finished' : verdict;
  const times = results.map((r) => r.timeMs).filter((t) => typeof t === 'number');
  return {
    verdict,
    passed: results.filter((r) => r.passed).length,
    total: tests.length,
    runtimeMs: times.length ? Math.max(...times) : null,
    executor: exec.executor,
    runtime: exec.runtime,
    approximate,
    mode,
    results,
  };
}

/** Last-resort judge when no code runner supports the language: the AI traces the program. */
async function aiJudge({ question, language, code, tests, mode, reason }) {
  const d = question.data;
  const problem = truncate(
    assistantText('problem', 'coding', {
      title: question.title,
      description: d.description,
      inputFormat: d.inputFormat,
      outputFormat: d.outputFormat,
      constraints: (d.constraints || []).join('\n'),
    }),
    5000,
  );
  const payload = tests.map((t, i) => ({ index: i, input: truncate(t.input, 1500), expected: t.output }));
  const res = await aiComplete({
    purpose: 'judge',
    temperature: 0,
    maxTokens: 4000,
    ...assistantPrompt('judge', {
      problem,
      language: languageLabel(language),
      code: truncate(code, 12000),
      tests: JSON.stringify(payload, null, 1),
    }),
    validate: (data) => normalizeJudge(data, tests.length),
  });
  const data = res.data;
  const exec = { executor: 'ai', runtime: `${res.providerName} (${res.model})` };
  if (data.compiles === false) {
    exec.compileError = String(data.compileError || 'The AI judge believes this code does not compile.');
  } else {
    const byIndex = new Map((data.results || []).map((r) => [Number(r.index), r]));
    exec.results = [];
    for (let i = 0; i < tests.length; i++) {
      const r = byIndex.get(i) || {};
      const status = ['ok', 'runtime_error', 'timeout'].includes(r.status) ? r.status : 'ok';
      const result = { status, stdout: String(r.output ?? ''), stderr: '', timeMs: null, note: r.note };
      exec.results.push(result);
      if (mode === 'submit' && !(status === 'ok' && (tests[i].output == null || compareOutput(result.stdout, tests[i].output)))) break;
    }
  }
  const out = finalize({ tests, exec, mode, approximate: true });
  out.notice = `No code runner is available for ${languageLabel(language)} (${truncate(reason, 160)}). Result was estimated by AI and may be inaccurate.`;
  return out;
}
