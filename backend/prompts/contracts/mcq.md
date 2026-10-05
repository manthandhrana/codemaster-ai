OUTPUT FORMAT - reply with ONLY one JSON object (no markdown fences, no text before or after):
{
  "questions": [
    {
      "title": "short title, max 8 words",
      "topic": "specific topic",
      "tags": ["1-4 tags"],
      "question": "Markdown question text. Put code in fenced blocks with a language tag.",
      "options": ["first option", "second option", "third option", "fourth option"],
      "correctIndex": 0,
      "explanation": "Markdown: why the correct option is right and why each other option is wrong",
      "hints": ["a hint that nudges without revealing the answer"]
    }
  ]
}

RULES:
1. Exactly {{countLabel}}, each with exactly 4 options and exactly one correct option.
2. Options are plain text without "A)" / "1." prefixes, similar in length, and all plausible.
3. Never use "All of the above" or "None of the above".
4. Code snippets must be valid and any stated output must be exactly right - trace them carefully.
5. Inside JSON strings use \n for line breaks and escape double quotes. No trailing commas.
6. Plain Markdown only - no LaTeX/math delimiters ($n$, \(...\)); write n, O(n log n), 10^5.
