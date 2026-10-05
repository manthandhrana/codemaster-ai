import { Router } from 'express';
import { listJobs } from '../services/jobs.js';
import { createSchedule, deleteSchedule, listSchedules, runSchedule, toggleSchedule, updateSchedule } from '../services/scheduler.js';
import { tz } from '../utils/time.js';

const router = Router();

router.get('/', async (_req, res) => res.json({ items: await listSchedules(), timezone: tz() }));
router.post('/', async (req, res) => res.status(201).json(await createSchedule(req.body || {})));
router.put('/:id', async (req, res) => res.json(await updateSchedule(req.params.id, req.body || {})));
router.patch('/:id/toggle', async (req, res) => res.json(await toggleSchedule(req.params.id, req.body?.enabled)));
router.delete('/:id', async (req, res) => {
  await deleteSchedule(req.params.id);
  res.json({ ok: true });
});
router.post('/:id/run', async (req, res) => res.json(await runSchedule(req.params.id, 'manual')));
router.get('/:id/jobs', async (req, res) => res.json({ items: await listJobs({ scheduleId: req.params.id, limit: 20 }) }));

export default router;
