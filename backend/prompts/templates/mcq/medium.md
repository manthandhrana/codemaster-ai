---
key: mcq_medium
name: MCQ · Medium
type: mcq
difficulty: medium
version: 1
description: Language internals, tricky output prediction, subtle bugs.
---
Create {{count}} multiple-choice questions.

Difficulty: {{difficulty}}
Language / subject: {{language}}
Topic focus: {{topic}}

Calibration (MEDIUM): language internals (scope, closures, references vs values, mutability, integer overflow, string immutability, collection behaviour), tricky output prediction (<= 15 lines), complexity of common algorithms, spotting subtle bugs.
Distractors should be the answers a candidate with a common misconception would pick.
{{#if extra}}
Additional instructions from the admin: {{extra}}
{{/if}}
