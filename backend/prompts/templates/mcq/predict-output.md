---
key: mcq_output
name: MCQ · Predict the Output
type: mcq
difficulty: any
version: 1
description: Every question is a runnable snippet - what does it print?
---
Create {{count}} "predict the output" multiple-choice questions.

Difficulty: {{difficulty}}
Language: {{language}}
Topic focus: {{topic}}

Every question shows a complete, runnable code snippet in a fenced code block and asks for its exact output. Target the behaviour people get wrong: evaluation order, scoping, mutation/aliasing, integer division and overflow, string formatting, default arguments, short-circuiting, exceptions.
Double-check each output by tracing the code line by line.
{{#if extra}}
Additional instructions from the admin: {{extra}}
{{/if}}
