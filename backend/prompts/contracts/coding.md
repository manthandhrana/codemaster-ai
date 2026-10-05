OUTPUT FORMAT - reply with ONLY one JSON object (no markdown fences, no text before or after) with exactly these keys:
{
  "title": "Short catchy title, max 8 words",
  "topic": "Primary topic, e.g. Sliding Window",
  "tags": ["2-5 short tags"],
  "pattern": "Name of the core technique",
  "description": "Problem statement in Markdown: story + precise task. Do NOT include the examples here.",
  "inputFormat": "Markdown: exact STDIN format, line by line",
  "outputFormat": "Markdown: exact STDOUT format",
  "constraints": ["1 <= n <= 2*10^5", "..."],
  "examples": [{ "input": "exact stdin", "output": "exact stdout", "explanation": "why this output is correct" }],
  "testCases": [{ "input": "exact stdin", "output": "exact stdout" }],
  "hints": ["Hint 1 - a gentle nudge", "Hint 2 - the key idea", "Hint 3 - near-complete approach"],
  "approach": "Markdown editorial: intuition, algorithm steps, proof sketch, why brute force fails",
  "complexity": { "time": "O(...)", "space": "O(...)" },
  "starterCode": "{{language}} template the candidate completes",
  "solutionCode": "complete {{language}} reference solution",
  "followUps": ["follow-up question"]{{#if withReferenceJs}},
  "referenceJs": "independent Node.js solution of the same problem"{{/if}}
}

RULES:
1. STDIN/STDOUT only (competitive-programming style). No interactive problems, no file I/O, no randomness.
2. "examples": 2-3 items. "testCases": 6-10 more hidden tests covering edge cases, tricky cases and a few larger inputs; keep every test input under 1500 characters.
3. Every "output" must be exactly what solutionCode prints for that input. Trace each one carefully.
4. solutionCode: a complete, correct and optimal {{language}} program that reads STDIN and writes STDOUT. {{languageRules}}
5. starterCode: a {{language}} program that ALREADY reads and parses the input and prints the result of a function the candidate must implement (its body is a TODO returning a placeholder). It must compile and run as-is.
6. Inside JSON strings use \n for line breaks and escape double quotes. No trailing commas, no comments.
7. The problem must be original: never name or copy an existing problem (e.g. "Two Sum", "LeetCode 42").
8. Plain Markdown only - no LaTeX/math delimiters ($n$, \(...\)); write n, 2*10^5, O(n log n).{{#if withReferenceJs}}
9. referenceJs: an independent, correct Node.js solution (read with require('fs').readFileSync(0, 'utf8'), print with console.log). Use BigInt whenever values can exceed 2^53.{{/if}}
