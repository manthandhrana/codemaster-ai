import { Router } from 'express';
import { canExecuteLocally } from '../executor/index.js';
import { buildTasks, cancelJob, createJob, getJob, listJobs, validateItems } from '../services/jobs.js';
import { buildGenerationPrompt } from '../services/prompts.js';
import { recentTitles } from '../services/questions.js';

const router = Router();

const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

function parseRequest(body = {}) {
  const type = body.type === 'mcq' ? 'mcq' : 'coding';
  const [item] = validateItems([{ type, difficulty: body.difficulty, language: body.language, count: body.count, promptId: body.promptId }]);
  return {
    item,
    topics: list(body.topics),
    customTopic: String(body.customTopic || '').trim().slice(0, 120),
    provider: body.provider || 'auto',
    extra: String(body.extra || '').trim().slice(0, 1500),
  };
}

// Queue a generation job; progress is polled via GET /jobs/:id
router.post('/generate', async (req, res) => {
  const r = parseRequest(req.body);
  const tasks = buildTasks({ items: [r.item], topics: r.topics, customTopic: r.customTopic, provider: r.provider, extra: r.extra });
  const job = await createJob({ source: 'manual', params: { ...r.item, topics: r.topics, customTopic: r.customTopic, provider: r.provider, extra: r.extra }, tasks });
  res.status(202).json({ job });
});

// Shows the exact messages that will be sent to the AI (no AI call).
router.post('/generate/preview', async (req, res) => {
  const r = parseRequest(req.body);
  const { type, difficulty, language, count, promptId } = r.item;
  const topic = r.customTopic || (r.topics.length ? r.topics.join(', ') : '');
  const out = await buildGenerationPrompt({
    type,
    difficulty,
    language,
    topic,
    count: type === 'mcq' ? Math.min(5, count) : 1,
    promptId,
    extra: r.extra,
    avoid: await recentTitles(type, 40),
    withReferenceJs: type === 'coding' && !canExecuteLocally(language) && !['javascript', 'typescript'].includes(language),
  });
  res.json(out);
});

router.get('/jobs', async (req, res) => res.json({ items: await listJobs(req.query) }));
router.get('/jobs/:id', async (req, res) => res.json(await getJob(req.params.id)));
router.post('/jobs/:id/cancel', async (req, res) => res.json(await cancelJob(req.params.id)));

export default router;
