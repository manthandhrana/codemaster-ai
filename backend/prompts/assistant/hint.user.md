{{problem}}

{{#if shownHints}}
Hints already shown:
{{shownHints}}
{{/if}}
{{#if isMcq}}
Give ONE hint that explains the concept needed to choose correctly. Do not say which option is correct.
{{/if}}
{{#unless isMcq}}
Candidate's current {{language}} code:
```
{{code}}
```

Give ONE targeted hint for their next step. If the code has a bug, point at where/why without writing the fix. If they are on the wrong track, redirect them. Never provide complete code.
{{/unless}}
Max 120 words.
Return JSON: {"hint": "markdown", "focus": "approach" | "bug" | "edge-case" | "complexity" | "concept"}
