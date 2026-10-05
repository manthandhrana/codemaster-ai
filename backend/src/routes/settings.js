import { Router } from 'express';
import { envFiles, MODE } from '../config.js';
import { dbInfo } from '../db/mongo.js';
import { EXECUTORS, executorOverview } from '../executor/index.js';
import { compareOutput } from '../executor/judge.js';
import { detectRuntimes } from '../executor/local.js';
import { getSetting, setSetting } from '../services/settings.js';
import { badRequest, clamp, toInt } from '../utils/misc.js';
import { tz } from '../utils/time.js';

const router = Router();

// Tiny echo programs used by the "Test runner" button.
const ECHO = {
  python: 'print(input().strip())\n',
  javascript: "console.log(require('fs').readFileSync(0, 'utf8').trim());\n",
  typescript: "declare const require: any;\nconsole.log(require('fs').readFileSync(0, 'utf8').trim());\n",
  cpp: '#include <bits/stdc++.h>\nint main() { std::string s; std::getline(std::cin, s); std::cout << s << "\\n"; }\n',
  c: '#include <stdio.h>\nint main(void) { char s[256]; if (fgets(s, 256, stdin)) fputs(s, stdout); return 0; }\n',
  java: 'import java.util.*;\npublic class Main { public static void main(String[] a) { System.out.println(new Scanner(System.in).nextLine()); } }\n',
  go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\ts, _ := bufio.NewReader(os.Stdin).ReadString(\'\\n\')\n\tfmt.Print(s)\n}\n',
  rust: 'use std::io::stdin;\nfn main() { let mut s = String::new(); stdin().read_line(&mut s).unwrap(); print!("{}", s); }\n',
  csharp: 'using System;\nclass Program { static void Main() { Console.WriteLine(Console.ReadLine()); } }\n',
  kotlin: 'fun main() { println(readLine()!!) }\n',
  php: '<?php echo trim(fgets(STDIN)), "\\n";\n',
  ruby: 'puts STDIN.gets\n',
  swift: 'print(readLine()!)\n',
};

router.get('/', async (_req, res) => {
  res.json({ ...(await executorOverview()), db: dbInfo, mode: MODE, timezone: tz(), envFiles: envFiles() });
});

router.put('/executor', async (req, res) => {
  const b = req.body || {};
  const current = getSetting('executor');
  const ids = Object.keys(EXECUTORS);
  const order = Array.isArray(b.order) ? [...new Set(b.order.filter((id) => ids.includes(id)))] : current.order;
  for (const id of ids) if (!order.includes(id)) order.push(id);
  const enabled = { ...current.enabled };
  for (const id of ids) if (b.enabled && b.enabled[id] !== undefined) enabled[id] = Boolean(b.enabled[id]);
  const next = {
    order,
    enabled,
    timeLimitMs: b.timeLimitMs !== undefined ? clamp(toInt(b.timeLimitMs, 5000), 500, 30000) : current.timeLimitMs,
    verifyGenerated: b.verifyGenerated !== undefined ? Boolean(b.verifyGenerated) : current.verifyGenerated,
    aiJudge: b.aiJudge !== undefined ? Boolean(b.aiJudge) : current.aiJudge,
  };
  await setSetting('executor', next);
  res.json(await executorOverview());
});

router.post('/detect-runtimes', async (_req, res) => {
  await detectRuntimes(true);
  res.json(await executorOverview());
});

router.post('/test-runner', async (req, res) => {
  const { executor, language } = req.body || {};
  const ex = EXECUTORS[executor];
  if (!ex) throw badRequest('Unknown executor');
  if (!ECHO[language]) throw badRequest('Unsupported language');
  if (!ex.configured()) throw badRequest(`${ex.name} is not configured`);
  if (!ex.supports(language)) throw badRequest(`${ex.name} cannot run ${language} here`);
  const t0 = Date.now();
  try {
    const r = await ex.run(language, ECHO[language], ['CodeMaster'], { timeLimitMs: getSetting('executor').timeLimitMs });
    if (r.compileError) return res.json({ ok: false, error: `Compile error: ${r.compileError.slice(0, 400)}` });
    const out = r.results[0];
    const ok = out?.status === 'ok' && compareOutput(out.stdout, 'CodeMaster');
    res.json({ ok, ms: Date.now() - t0, output: out?.stdout, stderr: out?.stderr, runtime: r.runtime });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

export default router;
