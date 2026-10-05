import { Router } from 'express';
import { MODE } from '../config.js';
import { PROVIDERS } from '../ai/providers.js';
import { BOILERPLATES, CODING_TOPICS, DIFFICULTIES, LANGUAGES, MCQ_TOPICS } from '../constants.js';
import { canExecute, canExecuteLocally } from '../executor/index.js';
import { TEMPLATE_VARIABLES } from '../services/prompts.js';
import { tz } from '../utils/time.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    languages: LANGUAGES.map((l) => ({
      ...l,
      boilerplate: BOILERPLATES[l.id] || '',
      runnable: l.coding ? canExecute(l.id) : false,
      local: l.coding ? canExecuteLocally(l.id) : false,
    })),
    difficulties: DIFFICULTIES,
    topics: { coding: CODING_TOPICS, mcq: MCQ_TOPICS },
    providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, tier: p.tier })),
    templateVariables: TEMPLATE_VARIABLES,
    timezone: tz(),
    mode: MODE,
  });
});

export default router;
