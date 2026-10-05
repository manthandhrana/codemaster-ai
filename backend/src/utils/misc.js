import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (message, details) => new HttpError(400, message, details);
export const notFound = (message = 'Not found') => new HttpError(404, message);

export const uid = () => crypto.randomUUID();
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function safeJson(str, fallback) {
  if (str === null || str === undefined || str === '') return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function truncate(value, n) {
  const s = String(value ?? '');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const normalizeTitle = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Runs async fn over items with at most `limit` in flight. Stops scheduling when shouldStop() is true. */
export async function mapLimit(items, limit, fn, shouldStop = () => false) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length && !shouldStop()) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const toInt = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
