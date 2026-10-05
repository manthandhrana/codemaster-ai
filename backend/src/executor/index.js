import { getSetting } from '../services/settings.js';
import { detectRuntimes, localExecutor, localLanguages } from './local.js';
import { judge0Executor, pistonExecutor, wandboxExecutor } from './remote.js';

export const EXECUTORS = {
  local: localExecutor,
  wandbox: wandboxExecutor,
  judge0: judge0Executor,
  piston: pistonExecutor,
};

export class NoExecutorError extends Error {
  constructor(message) {
    super(message);
    this.noExecutor = true;
  }
}

function orderedExecutors() {
  const s = getSetting('executor');
  const order = [...new Set([...(s.order || []), ...Object.keys(EXECUTORS)])];
  return order.map((id) => EXECUTORS[id]).filter((ex) => ex && s.enabled?.[ex.id] !== false && ex.configured());
}

export const canExecute = (language) => orderedExecutors().some((ex) => ex.supports(language));
export const canExecuteLocally = (language) => localExecutor.supports(language);

/**
 * Runs `code` once per input using the first executor that supports the language,
 * falling through to the next executor when a service is down.
 */
export async function runProgram(language, code, inputs, { timeLimitMs, shouldContinue, exclude = [] } = {}) {
  await detectRuntimes();
  const limit = timeLimitMs || getSetting('executor').timeLimitMs || 5000;
  const errors = [];
  for (const ex of orderedExecutors()) {
    if (exclude.includes(ex.id) || !ex.supports(language)) continue;
    try {
      return await ex.run(language, code, inputs, { timeLimitMs: limit, shouldContinue });
    } catch (e) {
      if (!e.infra) throw e;
      errors.push(`${ex.name}: ${e.message}`);
    }
  }
  throw new NoExecutorError(
    errors.length ? `Code execution failed for ${language} (${errors.join('; ')})` : `No code runner available for ${language}`,
  );
}

export async function executorOverview() {
  const rt = await detectRuntimes();
  const s = getSetting('executor');
  return {
    settings: s,
    runtimes: rt,
    localLanguages: localLanguages(),
    executors: Object.values(EXECUTORS).map((ex) => ({
      id: ex.id,
      name: ex.name,
      configured: ex.configured(),
      enabled: s.enabled?.[ex.id] !== false,
    })),
  };
}
