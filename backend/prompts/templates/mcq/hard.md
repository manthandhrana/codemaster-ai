---
key: mcq_hard
name: MCQ · Hard
type: mcq
difficulty: hard
version: 1
description: Deep internals and multi-step reasoning.
---
Create {{count}} multiple-choice questions.

Difficulty: {{difficulty}}
Language / subject: {{language}}
Topic focus: {{topic}}

Calibration (HARD): deep internals (memory model, garbage collection, event loop / concurrency, generics/templates, iterator invalidation, hashing & equality contracts, floating point), advanced DSA reasoning (amortized analysis, graph algorithm properties, DP state correctness) and multi-step output tracing.
{{#if extra}}
Additional instructions from the admin: {{extra}}
{{/if}}
