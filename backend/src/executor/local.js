import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const IS_WIN = process.platform === 'win32';
const BIN = IS_WIN ? 'main.exe' : 'main';

export class InfraError extends Error {
  constructor(message) {
    super(message);
    this.infra = true;
  }
}

/** Candidate commands per tool; the first one whose version output matches wins. */
const PROBES = {
  python: [
    ['python', ['--version'], /Python 3/],
    ['python3', ['--version'], /Python 3/],
    ['py', ['-3', '--version'], /Python 3/],
  ],
  gpp: [
    ['g++', ['--version'], /g\+\+|gcc|clang/i],
    ['clang++', ['--version'], /clang/i],
  ],
  gcc: [
    ['gcc', ['--version'], /gcc|clang/i],
    ['clang', ['--version'], /clang/i],
  ],
  javac: [['javac', ['-version'], /javac/i]],
  java: [['java', ['-version'], /version/i]],
  go: [['go', ['version'], /go version/i]],
  rustc: [['rustc', ['--version'], /rustc/i]],
  php: [['php', ['--version'], /PHP/]],
  ruby: [['ruby', ['--version'], /ruby/i]],
};

// Extra leading args for a probe command (e.g. `py -3 main.py`).
const BASE_ARGS = { py: ['-3'] };

function killTree(child) {
  if (!child.pid) return;
  if (IS_WIN) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
  } else {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already exited */
    }
  }
}

// Preloaded into Node runs: reports the program's own run time on fd 3, so the
// verdict's runtime excludes interpreter start-up (~200 ms on Windows).
const NODE_TIMER = `const t0 = process.hrtime.bigint();
process.on('exit', () => { try { require('fs').writeSync(3, String(Number(process.hrtime.bigint() - t0) / 1e6)); } catch {} });
`;

/**
 * Spawns a process with stdin, a wall-clock limit and an output cap. Never rejects.
 * With `timerFd`, the child may write its own elapsed ms to fd 3 (see NODE_TIMER).
 */
export function runProcess(cmd, args, { cwd, input, timeoutMs = 5000, maxOutput = 1 << 20, timerFd = false } = {}) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    let child;
    let selfTimed = '';
    try {
      child = spawn(cmd, args, {
        cwd,
        windowsHide: true,
        env: process.env,
        stdio: timerFd ? ['pipe', 'pipe', 'pipe', 'pipe'] : 'pipe',
      });
      if (timerFd) child.stdio[3].on('data', (d) => (selfTimed += d));
    } catch (e) {
      resolve({ status: 'spawn_error', error: e.message, stdout: '', stderr: '', exitCode: null, timeMs: 0 });
      return;
    }
    let stdout = '';
    let stderr = '';
    let killedFor = null;
    let settled = false;
    const kill = (reason) => {
      if (killedFor) return;
      killedFor = reason;
      killTree(child);
    };
    const timer = setTimeout(() => kill('timeout'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > maxOutput) {
        stdout = stdout.slice(0, maxOutput);
        kill('output_limit');
      }
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < 65536) stderr += d;
    });
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: 'spawn_error', error: e.message, stdout, stderr, exitCode: null, timeMs: 0 });
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const wallMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      const own = Number.parseFloat(selfTimed);
      const timeMs = Number.isFinite(own) ? Math.max(0, Math.round(own)) : wallMs;
      const status = killedFor || (code === 0 ? 'ok' : 'runtime_error');
      resolve({ status, stdout, stderr, exitCode: code, signal, timeMs, wallMs });
    });
    child.stdin.on('error', () => {}); // EPIPE when the program exits without reading stdin
    child.stdin.end(input ?? '');
  });
}

let runtimes = null;
let detecting = null;

export async function detectRuntimes(force = false) {
  if (runtimes && !force) return runtimes;
  if (detecting && !force) return detecting;
  detecting = (async () => {
    const found = {
      node: { cmd: process.execPath, base: [], version: process.version },
    };
    await Promise.all(
      Object.entries(PROBES).map(async ([tool, probes]) => {
        for (const [cmd, args, re] of probes) {
          const r = await runProcess(cmd, args, { timeoutMs: 8000 });
          const out = `${r.stdout}\n${r.stderr}`;
          if (r.status === 'ok' && re.test(out)) {
            found[tool] = { cmd, base: BASE_ARGS[cmd] || [], version: out.trim().split('\n')[0].slice(0, 80) };
            return;
          }
        }
        found[tool] = null;
      }),
    );
    runtimes = found;
    detecting = null;
    return found;
  })();
  return detecting;
}

const javaClassName = (code) => code.match(/public\s+(?:final\s+)?class\s+([A-Za-z_]\w*)/)?.[1] || code.match(/\bclass\s+([A-Za-z_]\w*)/)?.[1] || 'Main';

const SPECS = {
  javascript: {
    requires: [],
    selfTimed: true,
    file: () => 'main.js',
    run: () => [process.execPath, ['--require', './__timer.cjs', 'main.js']],
  },
  typescript: {
    requires: [],
    selfTimed: true,
    supported: () => Boolean(process.features?.typescript),
    file: () => 'main.ts',
    run: () => [process.execPath, ['--disable-warning=ExperimentalWarning', '--require', './__timer.cjs', 'main.ts']],
  },
  python: {
    requires: ['python'],
    file: () => 'main.py',
    run: (rt) => [rt.python.cmd, [...rt.python.base, 'main.py']],
  },
  cpp: {
    requires: ['gpp'],
    file: () => 'main.cpp',
    compile: (rt) => [rt.gpp.cmd, ['-O2', '-std=gnu++17', '-o', BIN, 'main.cpp']],
    run: (rt, dir) => [path.join(dir, BIN), []],
  },
  c: {
    requires: ['gcc'],
    file: () => 'main.c',
    compile: (rt) => [rt.gcc.cmd, ['-O2', '-o', BIN, 'main.c', '-lm']],
    run: (rt, dir) => [path.join(dir, BIN), []],
  },
  java: {
    requires: ['javac', 'java'],
    file: (code) => `${javaClassName(code)}.java`,
    compile: (rt, file) => [rt.javac.cmd, ['-encoding', 'UTF-8', file]],
    run: (rt, dir, file) => [rt.java.cmd, ['-Xss256m', '-cp', '.', file.replace(/\.java$/, '')]],
  },
  go: {
    requires: ['go'],
    file: () => 'main.go',
    compile: (rt) => [rt.go.cmd, ['build', '-o', BIN, 'main.go']],
    run: (rt, dir) => [path.join(dir, BIN), []],
  },
  rust: {
    requires: ['rustc'],
    file: () => 'main.rs',
    compile: (rt) => [rt.rustc.cmd, ['-O', '-o', BIN, 'main.rs']],
    run: (rt, dir) => [path.join(dir, BIN), []],
  },
  php: {
    requires: ['php'],
    file: () => 'main.php',
    run: (rt) => [rt.php.cmd, ['main.php']],
  },
  ruby: {
    requires: ['ruby'],
    file: () => 'main.rb',
    run: (rt) => [rt.ruby.cmd, ['main.rb']],
  },
};

export function localSupports(language) {
  const spec = SPECS[language];
  if (!spec || !runtimes) return false;
  if (spec.supported && !spec.supported()) return false;
  return spec.requires.every((tool) => runtimes[tool]);
}

export function localLanguages() {
  return Object.keys(SPECS).filter(localSupports);
}

export const localExecutor = {
  id: 'local',
  name: 'Local runtimes (this computer)',
  configured: () => true,
  supports: (language) => localSupports(language),

  async run(language, code, inputs, { timeLimitMs = 5000, shouldContinue } = {}) {
    await detectRuntimes();
    const spec = SPECS[language];
    if (!localSupports(language)) throw new InfraError(`${language} is not installed locally`);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codemaster-'));
    try {
      const file = spec.file(code);
      await fs.writeFile(path.join(dir, file), code, 'utf8');
      if (spec.selfTimed) await fs.writeFile(path.join(dir, '__timer.cjs'), NODE_TIMER, 'utf8');
      if (spec.compile) {
        const [cmd, args] = spec.compile(runtimes, file);
        const c = await runProcess(cmd, args, { cwd: dir, timeoutMs: 60000 });
        if (c.status === 'spawn_error') throw new InfraError(c.error);
        if (c.status !== 'ok') {
          return { executor: 'local', compileError: (c.stderr || c.stdout || 'Compilation failed').slice(0, 8000), results: [] };
        }
      }
      const results = [];
      for (let i = 0; i < inputs.length; i++) {
        const [cmd, args] = spec.run(runtimes, dir, file);
        const r = await runProcess(cmd, args, {
          cwd: dir,
          input: withNewline(inputs[i]),
          // Interpreter start-up doesn't count towards the limit for self-timed runs.
          timeoutMs: spec.selfTimed ? timeLimitMs + 2000 : timeLimitMs,
          timerFd: spec.selfTimed,
        });
        if (spec.selfTimed && r.status === 'ok' && r.timeMs > timeLimitMs) r.status = 'timeout';
        if (r.status === 'spawn_error') throw new InfraError(r.error);
        results.push(r);
        if (shouldContinue && !shouldContinue(i, r)) break;
      }
      return { executor: 'local', results };
    } finally {
      fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
    }
  },
};

export const withNewline = (s) => {
  const str = String(s ?? '');
  return str.endsWith('\n') ? str : `${str}\n`;
};
