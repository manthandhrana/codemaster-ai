import { Router } from 'express';
import { aiLogs, aiUsage, overview } from '../services/stats.js';

const router = Router();

router.get('/stats/overview', async (_req, res) => res.json(await overview()));
router.get('/usage', async (req, res) => res.json(await aiUsage(req.query.days)));
router.get('/usage/logs', async (req, res) => res.json(await aiLogs(req.query)));

export default router;
