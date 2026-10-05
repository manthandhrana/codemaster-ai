import { Question, Schedule, Setting, nextSeq } from './models.js';
import { seedPrompts } from '../services/prompts.js';
import { createQuestion } from '../services/questions.js';
import { reloadSchedules } from '../services/scheduler.js';

const SAMPLE_CODING = [
  {
    title: 'Bracket Depth Meter',
    difficulty: 'easy',
    language: 'javascript',
    topic: 'Stack',
    tags: ['stack', 'strings'],
    data: {
      pattern: 'Stack matching',
      description:
        'A code editor plugin highlights how deeply nested a snippet is.\n\nYou are given a string `s` made only of the characters `(`, `)`, `[`, `]`, `{` and `}`. If the brackets are **balanced**, report the maximum nesting depth. Otherwise report `-1`.',
      inputFormat: 'A single line containing the string `s`.',
      outputFormat: 'Print one integer - the maximum nesting depth, or `-1` if `s` is not balanced.',
      constraints: ['1 <= |s| <= 10^5', 's contains only ()[]{}'],
      examples: [
        { input: '([]{})', output: '2', explanation: '`(` opens depth 1; `[` and `{` each reach depth 2, and every bracket closes in order.' },
        { input: '([)]', output: '-1', explanation: '`)` tries to close `[` - the pairs cross, so the string is not balanced.' },
      ],
      testCases: [
        { input: '((()))', output: '3' },
        { input: '()', output: '1' },
        { input: '{[()()]}', output: '3' },
        { input: '(((', output: '-1' },
        { input: '())(', output: '-1' },
        { input: '[]{}()', output: '1' },
        { input: ')(', output: '-1' },
        { input: '{{[[(())]]}}', output: '6' },
      ],
      hints: [
        'Scan left to right and keep track of the brackets that are still open.',
        'A stack of open brackets works well - its size is the current depth.',
        'On a closing bracket the top of the stack must be its matching opener. At the end the stack must be empty. Track the largest stack size you saw.',
      ],
      approach:
        'Use a stack of opening brackets.\n\n1. For an opener, push it and update `best = max(best, stack.length)`.\n2. For a closer, pop - if the stack was empty or the popped opener does not match, the string is unbalanced.\n3. After the scan the stack must be empty.\n\nEach character is pushed and popped at most once.',
      complexity: { time: 'O(n)', space: 'O(n)' },
      starterCode:
        "const s = require('fs').readFileSync(0, 'utf8').trim();\n\nfunction maxDepth(s) {\n  // TODO: return the maximum nesting depth, or -1 if s is not balanced\n  return 0;\n}\n\nconsole.log(maxDepth(s));\n",
      starterCodes: {},
      solutionCode:
        "const s = require('fs').readFileSync(0, 'utf8').trim();\nconst pair = { ')': '(', ']': '[', '}': '{' };\nconst stack = [];\nlet best = 0;\nlet ok = true;\nfor (const ch of s) {\n  if ('([{'.includes(ch)) {\n    stack.push(ch);\n    best = Math.max(best, stack.length);\n  } else if (stack.pop() !== pair[ch]) {\n    ok = false;\n    break;\n  }\n}\nconsole.log(ok && stack.length === 0 ? best : -1);\n",
      followUps: [
        'If the string only contained ( and ), can you do it with O(1) extra space?',
        'Instead of -1, report the index of the first character that breaks the balance.',
      ],
      verification: { status: 'verified', by: 'hand-checked sample' },
    },
  },
  {
    title: 'Longest Calm Streak',
    difficulty: 'medium',
    language: 'python',
    topic: 'Sliding Window',
    tags: ['sliding window', 'two pointers'],
    data: {
      pattern: 'Variable-size sliding window',
      description:
        'A fitness tracker records `n` positive stress readings during the day. A streak of **consecutive** readings is *calm* if its total stress is at most `k`.\n\nFind the length of the longest calm streak. If even a single reading exceeds `k`, a streak of that reading alone is not calm - the answer can be `0`.',
      inputFormat: 'The first line contains two integers `n` and `k`.\nThe second line contains `n` positive integers `a1 ... an`.',
      outputFormat: 'Print one integer - the length of the longest calm streak.',
      constraints: ['1 <= n <= 2*10^5', '1 <= ai <= 10^9', '1 <= k <= 10^15'],
      examples: [
        { input: '5 7\n2 1 3 4 1', output: '3', explanation: 'Readings 2 1 3 sum to 6 <= 7. No 4 consecutive readings stay within 7.' },
        { input: '3 1\n5 6 7', output: '0', explanation: 'Every single reading is larger than k = 1.' },
      ],
      testCases: [
        { input: '4 100\n10 20 30 40', output: '4' },
        { input: '6 5\n1 1 1 1 1 1', output: '5' },
        { input: '1 3\n3', output: '1' },
        { input: '7 10\n4 2 2 7 8 1 2', output: '3' },
        { input: '5 1000000000000000\n1000000000 1000000000 1000000000 1000000000 1000000000', output: '5' },
        { input: '8 6\n3 3 3 3 3 3 3 3', output: '2' },
        { input: '6 9\n9 1 8 1 1 9', output: '2' },
        { input: '2 1\n1 2', output: '1' },
      ],
      hints: [
        'All readings are positive - what happens to a window sum when you extend it or shrink it?',
        'Use two pointers: extend the right end, and shrink from the left while the sum is too big.',
        'Each index enters and leaves the window at most once, so the whole scan is linear. Update the answer after shrinking.',
      ],
      approach:
        'Because every reading is positive, the window sum only grows when the right end moves and only shrinks when the left end moves.\n\nKeep `left`, `right` and the running `sum`. For each `right`, add `a[right]`, then while `sum > k` remove `a[left]` and advance `left`. The window `[left, right]` is now the longest calm streak ending at `right`; record its length.\n\nA brute force over all O(n^2) windows is too slow for n = 2*10^5.',
      complexity: { time: 'O(n)', space: 'O(1) extra' },
      starterCode:
        'import sys\n\n\ndef longest_calm_streak(a, k):\n    # TODO: return the length of the longest contiguous streak with sum <= k\n    return 0\n\n\ndef main():\n    data = sys.stdin.read().split()\n    n, k = int(data[0]), int(data[1])\n    a = list(map(int, data[2:2 + n]))\n    print(longest_calm_streak(a, k))\n\n\nif __name__ == "__main__":\n    main()\n',
      starterCodes: {},
      solutionCode:
        'import sys\n\n\ndef main():\n    data = sys.stdin.read().split()\n    n, k = int(data[0]), int(data[1])\n    a = list(map(int, data[2:2 + n]))\n    best = left = cur = 0\n    for right, x in enumerate(a):\n        cur += x\n        while cur > k and left <= right:\n            cur -= a[left]\n            left += 1\n        best = max(best, right - left + 1)\n    print(best)\n\n\nif __name__ == "__main__":\n    main()\n',
      referenceJs:
        "const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);\nconst n = Number(data[0]);\nconst k = BigInt(data[1]);\nconst a = data.slice(2, 2 + n).map(BigInt);\nlet best = 0;\nlet left = 0;\nlet cur = 0n;\nfor (let right = 0; right < n; right++) {\n  cur += a[right];\n  while (cur > k && left <= right) {\n    cur -= a[left];\n    left++;\n  }\n  best = Math.max(best, right - left + 1);\n}\nconsole.log(best);\n",
      followUps: ['What changes if readings can be zero or negative?', 'Answer q queries, each with its own k, efficiently.'],
      verification: { status: 'verified', by: 'hand-checked sample' },
    },
  },
];

const SAMPLE_MCQ = [
  {
    title: 'var inside a setTimeout loop',
    difficulty: 'medium',
    language: 'javascript',
    topic: 'Closures',
    tags: ['closures', 'event loop'],
    data: {
      question: 'What does this code print?\n\n```javascript\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}\n```',
      options: ['0, 1, 2', '3, 3, 3', '0, 0, 0', 'undefined three times'],
      correctIndex: 1,
      explanation:
        '`var` is function-scoped, so all three callbacks close over the **same** `i`. The callbacks run only after the loop has finished, when `i` is already `3` - so `3` is printed three times.\n\nWith `let`, each iteration gets a fresh binding and the output would be `0, 1, 2`.',
      hints: ['How many `i` variables exist, and when do the callbacks actually run?'],
    },
  },
  {
    title: 'Mutable default argument',
    difficulty: 'medium',
    language: 'python',
    topic: 'Functions & Scope',
    tags: ['default arguments', 'mutability'],
    data: {
      question: 'What is printed?\n\n```python\ndef add(item, bucket=[]):\n    bucket.append(item)\n    return bucket\n\nprint(add(1), add(2))\n```',
      options: ['[1] [2]', '[1] [1, 2]', '[1, 2] [1, 2]', 'TypeError'],
      correctIndex: 2,
      explanation:
        'Default values are evaluated **once**, when the function is defined. Both calls append to - and return - the same list object. `print` receives that same list twice after both calls have run, so it shows `[1, 2] [1, 2]`.\n\nFix: use `bucket=None` and create a new list inside the function.',
      hints: ['When is the default list created - at definition time or at each call?'],
    },
  },
  {
    title: 'Doubling loop complexity',
    difficulty: 'easy',
    language: 'general',
    topic: 'Time & Space Complexity',
    tags: ['big-o'],
    data: {
      question: 'What is the time complexity of this loop?\n\n```python\ni = 1\nwhile i < n:\n    i *= 2\n```',
      options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(sqrt(n))'],
      correctIndex: 1,
      explanation: '`i` takes the values 1, 2, 4, 8, ... so it reaches `n` after about log2(n) iterations.',
      hints: ['How many times can you double 1 before it exceeds n?'],
    },
  },
];

const SAMPLE_SCHEDULE = {
  name: 'Daily Google Prep Set',
  enabled: false,
  time: '09:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  cron: '',
  catchUp: true,
  config: {
    items: [
      { type: 'coding', difficulty: 'easy', count: 1, language: 'python', promptId: null },
      { type: 'coding', difficulty: 'medium', count: 2, language: 'python', promptId: null },
      { type: 'coding', difficulty: 'hard', count: 1, language: 'python', promptId: null },
      { type: 'mcq', difficulty: 'medium', count: 5, language: 'python', promptId: null },
    ],
    topics: [],
    provider: 'auto',
    extra: '',
  },
};

export async function seed() {
  await seedPrompts();
  if (await Setting.exists({ _id: 'seeded' })) return;
  if ((await Question.countDocuments()) === 0) {
    for (const q of [...SAMPLE_CODING.map((x) => ({ ...x, type: 'coding' })), ...SAMPLE_MCQ.map((x) => ({ ...x, type: 'mcq' }))]) {
      await createQuestion({ ...q, source: 'sample', provider: 'sample', model: 'hand-written', verified: q.type === 'coding' });
    }
  }
  if ((await Schedule.countDocuments()) === 0) {
    await Schedule.create({ _id: await nextSeq('schedules'), ...SAMPLE_SCHEDULE });
    await reloadSchedules();
  }
  await Setting.updateOne({ _id: 'seeded' }, { $set: { value: new Date().toISOString() } }, { upsert: true });
  console.log('[seed] Sample questions, prompt templates and a (disabled) daily schedule were created.');
}
