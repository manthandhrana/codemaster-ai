# Prompt library

Every prompt CodeMaster AI sends to an AI provider lives in this folder, together with the
contract its answer must follow and the JSON Schema it is validated against before anything
is stored in MongoDB. Whatever provider answers (Gemini, Groq, Claude, ...), the result is
normalized to **one** stored shape.

```
prompts/
  system/                 persona (system message) for each generation type
    coding.md             coding problems
    mcq.md                multiple-choice questions
  templates/              the creative part - one file per template, editable in the panel too
    coding/*.md           easy, medium, hard, very-hard, google-interview, real-world
    mcq/*.md              easy, medium, hard, very-hard, predict-output, dsa-complexity
  contracts/              appended to every generation prompt - the exact JSON the AI must return
    coding.md
    mcq.md
    avoid.md              "don't repeat these existing questions" block
  assistant/              prompts used while solving
    hint.*.md             AI hint for the candidate's code
    review.*.md           interview-style code review
    judge.*.md            AI judge when no code runner exists for a language
    starter.*.md          translate a starter template to another language
    test.*.md             provider health check (AI Providers -> Test)
    problem.*.md          how a stored question is described to the AI
  schemas/                JSON Schemas (draft-07)
    coding-response.schema.json   what the AI is asked to return for a coding problem
    mcq-response.schema.json      what the AI is asked to return for MCQs
    coding-question.schema.json   what is STORED (questions.data) - enforced before insert
    mcq-question.schema.json      what is STORED for one MCQ - enforced before insert
    ai-hint / ai-review / ai-judge.schema.json   assistant answers
  examples/               sample AI answers used by the tests (and as documentation)
    coding.response.json, mcq.response.json      clean answers
    messy/*               real-world messy answers the normalizer must still accept
  language-rules.json     extra rules per language appended to the coding contract
```

## Template files

Templates are Markdown with a small front-matter block:

```md
---
key: coding_easy            # unique, never change it (the DB links templates by key)
name: Coding · Easy (Warm-up)
type: coding                # coding | mcq
difficulty: easy            # easy | medium | hard | very_hard | any
version: 1                  # bump when you change the meaning - stored with every question
description: Shown in the template list
---
Create ONE original coding problem ...
```

Placeholders (all templates, contracts and assistant prompts):

| Syntax | Meaning |
|---|---|
| `{{name}}` | value of a variable (missing -> empty) |
| `{{#if name}} ... {{/if}}` | block only when the variable is set / true / non-empty |
| `{{#unless name}} ... {{/unless}}` | block only when it is NOT set |
| `{{#each list}}- {{this}}{{/each}}` | repeat for each item of a list |

Generation variables: `difficulty`, `language`, `topic`, `count`, `extra`, `date`.

## How it reaches the database

1. Template + `contracts/avoid.md` + `contracts/<type>.md` are rendered into the user message,
   `system/<type>.md` (or the template's custom system prompt) is the system message.
2. The answer is parsed tolerantly (markdown fences, `<think>` blocks, trailing commas...).
3. It is **normalized** (`src/services/normalize.js`): field aliases, letters for answers,
   `A)` prefixes, double-escaped newlines, MCQ options shuffled...
4. It is **validated** against `schemas/<type>-question.schema.json`. A response that does
   not fit is rejected and the next AI provider is asked instead - nothing malformed is stored.
5. Coding problems are verified by running the reference solution on every test.
6. The question is stored with `schemaVersion` and `generation` metadata
   (provider, model, prompt key + version, tokens, latency), and the raw answer is kept in the
   `airesponses` collection for 90 days.

## Editing

- Edit files here; the dev server restarts and syncs them to MongoDB automatically
  (or click **Sync from folder** on the *Prompt Templates* page).
- Edits made in the panel mark a template as *edited*; syncing then keeps your panel version.
  *Reset* restores the file version.
- Add a template: create a new `.md` file with a new `key`.
- Run `npm test` in `backend/` after changing contracts or schemas.
