import { Router } from 'express';
import { generateCodingQuestion, generateMcqBatch } from '../services/generator.js';
import { validateItems } from '../services/jobs.js';
import {
  createPrompt,
  deletePrompt,
  duplicatePrompt,
  getPrompt,
  libraryInfo,
  listPrompts,
  renderTemplate,
  resetPrompt,
  syncPromptsFromFiles,
  TEMPLATE_VARIABLES,
  updatePrompt,
} from '../services/prompts.js';
import { clamp, toInt } from '../utils/misc.js';

const router = Router();

router.get('/', async (_req, res) => res.json({ items: await listPrompts(), variables: TEMPLATE_VARIABLES, library: libraryInfo() }));

// Re-reads backend/prompts and updates every template that was not edited in the panel.
router.post('/sync', async (_req, res) => res.json(await syncPromptsFromFiles({ reload: true })));

// Live preview of a template with sample values
router.post('/render', (req, res) => {
  const vars = {
    difficulty: 'Medium',
    language: 'Python 3',
    topic: 'Sliding Window',
    count: 5,
    extra: '',
    date: new Date().toDateString(),
    ...(req.body?.vars || {}),
  };
  res.json({ text: renderTemplate(String(req.body?.template || ''), vars) });
});

router.get('/:id', async (req, res) => res.json(await getPrompt(req.params.id)));
router.post('/', async (req, res) => res.status(201).json(await createPrompt(req.body || {})));
router.put('/:id', async (req, res) => res.json(await updatePrompt(req.params.id, req.body || {})));
router.delete('/:id', async (req, res) => {
  await deletePrompt(req.params.id);
  res.json({ ok: true });
});
router.post('/:id/duplicate', async (req, res) => res.status(201).json(await duplicatePrompt(req.params.id)));
router.post('/:id/reset', async (req, res) => res.json(await resetPrompt(req.params.id)));

/**
 * Dry run: sends this template to the AI, normalizes + schema-validates the answer (and verifies
 * coding tests) exactly like a real generation, but saves nothing.
 */
router.post('/:id/test', async (req, res) => {
  const p = await getPrompt(req.params.id);
  const b = req.body || {};
  const difficulty = p.difficulty === 'any' ? b.difficulty || 'medium' : p.difficulty;
  const [item] = validateItems([{ type: p.type, difficulty, language: b.language || 'python', count: 1 }]);
  const task = {
    difficulty,
    language: item.language,
    topic: String(b.topic || '').trim(),
    promptId: p.id,
    extra: String(b.extra || '').trim(),
    provider: b.provider || 'auto',
    count: p.type === 'mcq' ? clamp(toInt(b.count, 2), 1, 5) : 1,
  };
  const logs = [];
  const ctx = { dryRun: true, verify: b.verify !== false, log: (e) => logs.push({ ...e, t: new Date() }) };
  const t0 = Date.now();
  try {
    const out = p.type === 'coding' ? await generateCodingQuestion(task, ctx) : await generateMcqBatch(task, ctx);
    res.json({ ok: true, ms: Date.now() - t0, type: p.type, schema: `${p.type}-question`, logs, ...out });
  } catch (e) {
    res.json({ ok: false, ms: Date.now() - t0, type: p.type, error: e.message, details: e.details, logs });
  }
});

export default router;
