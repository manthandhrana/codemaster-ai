import { env } from '../config.js';
import { mapLimit } from '../utils/misc.js';
import { InfraError, withNewline } from './local.js';

/**
 * Remote executors. Each run() returns { executor, compileError?, results: [{ status, stdout, stderr, timeMs }] }
 * and throws InfraError when the service itself is unavailable (so the next executor is tried).
 */

async function postJson(url, body, headers, timeoutMs) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return { timedOut: true };
    throw new InfraError(`network error: ${e.cause?.code || e.message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new InfraError(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  try {
    return { data: await res.json() };
  } catch {
    throw new InfraError('invalid JSON from executor');
  }
}

/** Runs input 0 alone (fast compile-error detection), then the rest with limited concurrency. */
async function runTests(inputs, runOne, { shouldContinue, concurrency = 3 }) {
  const first = await runOne(inputs[0], 0);
  if (first.compileError !== undefined) return { compileError: first.compileError, results: [] };
  const results = [first];
  if (inputs.length === 1 || (shouldContinue && !shouldContinue(0, first))) return { results };
  let stop = false;
  const rest = await mapLimit(
    inputs.slice(1),
    concurrency,
    async (input, j) => {
      const r = await runOne(input, j + 1);
      if (shouldContinue && !shouldContinue(j + 1, r)) stop = true;
      return r;
    },
    () => stop,
  );
  for (let j = 0; j < rest.length; j++) {
    if (!rest[j]) break;
    results.push(rest[j]);
    if (shouldContinue && !shouldContinue(j + 1, rest[j])) break;
  }
  return { results };
}

// ---------------------------------------------------------------- Wandbox (free, no key)

const WANDBOX_LANG = {
  cpp: 'C++',
  c: 'C',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  csharp: 'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  php: 'PHP',
  ruby: 'Ruby',
  swift: 'Swift',
};
const WANDBOX_PICK = {
  cpp: /^gcc-\d/,
  c: /^gcc-\d.*-c$/,
  python: /^cpython-3\.\d+\.\d+$/,
  java: /^openjdk-jdk-/,
  go: /^go-/,
  rust: /^rust-/,
  csharp: /^mono-/,
  javascript: /^nodejs-/,
  typescript: /^typescript-/,
  php: /^php-8/,
  ruby: /^ruby-3/,
  swift: /^swift-/,
};
const WANDBOX_FALLBACK = {
  cpp: 'gcc-13.2.0',
  c: 'gcc-13.2.0-c',
  python: 'cpython-3.12.7',
  java: 'openjdk-jdk-22+36',
  go: 'go-1.23.2',
  rust: 'rust-1.82.0',
  csharp: 'mono-6.12.0.199',
  javascript: 'nodejs-20.17.0',
  typescript: 'typescript-5.6.2',
  php: 'php-8.3.12',
  ruby: 'ruby-3.4.9',
  swift: 'swift-6.0.1',
};
const WANDBOX_OPTIONS = { cpp: '-O2\n-std=gnu++17', c: '-O2', rust: '-O' };

const wandboxBase = () => env('WANDBOX_URL', 'https://wandbox.org/api').replace(/\/+$/, '');
let wandboxList = { at: 0, compilers: null };

async function wandboxCompiler(language) {
  if (!wandboxList.compilers || Date.now() - wandboxList.at > 12 * 3600e3) {
    try {
      const res = await fetch(`${wandboxBase()}/list.json`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) wandboxList = { at: Date.now(), compilers: await res.json() };
    } catch {
      /* use fallback names */
    }
  }
  const match = (wandboxList.compilers || []).find(
    (c) => c.language === WANDBOX_LANG[language] && WANDBOX_PICK[language].test(c.name) && !c.name.includes('head'),
  );
  return match?.name || WANDBOX_FALLBACK[language];
}

export const wandboxExecutor = {
  id: 'wandbox',
  name: 'Wandbox (free online compilers)',
  configured: () => env('WANDBOX_ENABLED', 'true').toLowerCase() !== 'false',
  supports: (language) => Boolean(WANDBOX_LANG[language]),

  async run(language, code, inputs, { timeLimitMs = 5000, shouldContinue } = {}) {
    const compiler = await wandboxCompiler(language);
    // Wandbox saves Java as prog.java, so a public class must not be named differently.
    const source = language === 'java' ? code.replace(/public\s+((?:final\s+)?class\s+)/, '$1') : code;
    const requestTimeout = Math.max(30000, timeLimitMs * 4);

    const runOne = async (stdin) => {
      const body = { compiler, code: source, stdin: withNewline(stdin), save: false };
      if (WANDBOX_OPTIONS[language]) body['compiler-option-raw'] = WANDBOX_OPTIONS[language];
      const t0 = Date.now();
      const { data, timedOut } = await postJson(`${wandboxBase()}/compile.json`, body, {}, requestTimeout);
      if (timedOut) return { status: 'timeout', stdout: '', stderr: 'Time limit exceeded', timeMs: Date.now() - t0 };
      const exit = Number(data.status);
      const stdout = data.program_output || '';
      const stderr = data.program_error || '';
      if (exit !== 0 && !stdout && !stderr && data.compiler_error && !data.signal) {
        return { compileError: data.compiler_error.slice(0, 8000) };
      }
      let status = exit === 0 && !data.signal ? 'ok' : 'runtime_error';
      if (data.signal && /kill|xcpu/i.test(data.signal)) status = 'timeout';
      return { status, stdout, stderr: stderr || (data.signal ? `Signal: ${data.signal}` : ''), timeMs: null };
    };

    const out = await runTests(inputs, runOne, { shouldContinue, concurrency: 4 });
    return { executor: 'wandbox', runtime: compiler, ...out };
  },
};

// ---------------------------------------------------------------- Judge0 (RapidAPI or self-hosted)

const JUDGE0_IDS = {
  cpp: 54,
  c: 50,
  java: 62,
  python: 71,
  javascript: 63,
  typescript: 74,
  go: 60,
  rust: 73,
  csharp: 51,
  kotlin: 78,
  php: 68,
  ruby: 72,
  swift: 83,
};

const b64 = (s) => Buffer.from(String(s ?? ''), 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');

/** Judge0/Piston save Java as Main.java: rename the public class if needed. */
function javaAsMain(code) {
  const name = code.match(/public\s+(?:final\s+)?class\s+([A-Za-z_]\w*)/)?.[1];
  if (!name || name === 'Main') return code;
  return code.replace(new RegExp(`\\b${name}\\b`, 'g'), 'Main');
}

export const judge0Executor = {
  id: 'judge0',
  name: 'Judge0',
  configured: () => Boolean(env('JUDGE0_URL') || env('JUDGE0_API_KEY')),
  supports: (language) => Boolean(JUDGE0_IDS[language]),

  async run(language, code, inputs, { timeLimitMs = 5000, shouldContinue } = {}) {
    const base = env('JUDGE0_URL', 'https://judge0-ce.p.rapidapi.com').replace(/\/+$/, '');
    const headers = {};
    if (env('JUDGE0_API_KEY')) {
      headers['X-RapidAPI-Key'] = env('JUDGE0_API_KEY');
      headers['X-RapidAPI-Host'] = env('JUDGE0_API_HOST') || new URL(base).host;
    }
    if (env('JUDGE0_AUTH_TOKEN')) headers['X-Auth-Token'] = env('JUDGE0_AUTH_TOKEN');
    const source = language === 'java' ? javaAsMain(code) : code;

    const runOne = async (stdin) => {
      const body = {
        language_id: JUDGE0_IDS[language],
        source_code: b64(source),
        stdin: b64(withNewline(stdin)),
        cpu_time_limit: Math.min(15, timeLimitMs / 1000),
      };
      const { data, timedOut } = await postJson(
        `${base}/submissions?base64_encoded=true&wait=true`,
        body,
        headers,
        Math.max(30000, timeLimitMs * 4),
      );
      if (timedOut) return { status: 'timeout', stdout: '', stderr: 'Time limit exceeded', timeMs: null };
      const sid = data.status?.id;
      if (sid === 6) return { compileError: unb64(data.compile_output).slice(0, 8000) || 'Compilation error' };
      if (sid === 13 || sid === 14 || !sid) throw new InfraError(`Judge0: ${data.status?.description || 'internal error'}`);
      const stdout = unb64(data.stdout);
      const stderr = unb64(data.stderr);
      let status = 'ok';
      if (sid === 5) status = 'timeout';
      else if (sid >= 7) status = 'runtime_error';
      return { status, stdout, stderr, timeMs: data.time ? Math.round(Number(data.time) * 1000) : null };
    };

    const out = await runTests(inputs, runOne, { shouldContinue, concurrency: 1 });
    return { executor: 'judge0', ...out };
  },
};

// ---------------------------------------------------------------- Piston (self-hosted)

const PISTON_LANG = {
  cpp: ['c++', 'main.cpp'],
  c: ['c', 'main.c'],
  python: ['python', 'main.py'],
  java: ['java', 'Main.java'],
  javascript: ['javascript', 'main.js'],
  typescript: ['typescript', 'main.ts'],
  go: ['go', 'main.go'],
  rust: ['rust', 'main.rs'],
  csharp: ['csharp', 'main.cs'],
  kotlin: ['kotlin', 'main.kt'],
  php: ['php', 'main.php'],
  ruby: ['ruby', 'main.rb'],
  swift: ['swift', 'main.swift'],
};

export const pistonExecutor = {
  id: 'piston',
  name: 'Piston (self-hosted)',
  configured: () => Boolean(env('PISTON_URL')),
  supports: (language) => Boolean(PISTON_LANG[language]),

  async run(language, code, inputs, { timeLimitMs = 5000, shouldContinue } = {}) {
    const base = env('PISTON_URL').replace(/\/+$/, '');
    const [lang, fileName] = PISTON_LANG[language];
    const source = language === 'java' ? javaAsMain(code) : code;

    const runOne = async (stdin) => {
      const body = {
        language: lang,
        version: '*',
        files: [{ name: fileName, content: source }],
        stdin: withNewline(stdin),
        compile_timeout: 30000,
        run_timeout: timeLimitMs,
      };
      const { data, timedOut } = await postJson(`${base}/api/v2/execute`, body, {}, Math.max(30000, timeLimitMs * 4));
      if (timedOut) return { status: 'timeout', stdout: '', stderr: 'Time limit exceeded', timeMs: null };
      if (data.message && !data.run) throw new InfraError(`Piston: ${data.message}`);
      if (data.compile && data.compile.code !== 0) {
        return { compileError: (data.compile.stderr || data.compile.output || 'Compilation error').slice(0, 8000) };
      }
      const run = data.run || {};
      let status = run.code === 0 && !run.signal ? 'ok' : 'runtime_error';
      if (run.signal === 'SIGKILL') status = 'timeout';
      return { status, stdout: run.stdout || '', stderr: run.stderr || '', timeMs: null };
    };

    const out = await runTests(inputs, runOne, { shouldContinue, concurrency: 2 });
    return { executor: 'piston', ...out };
  },
};
