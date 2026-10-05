/** stdout helpers shared by the judge, the normalizer and the tests (no I/O, no DB). */

export const normalizeOutput = (s) =>
  String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\s+$/, '');

const FLOATY = /[.eE]/;

/** Whitespace-insensitive comparison with a small tolerance for floating point tokens. */
export function compareOutput(actual, expected) {
  const a = normalizeOutput(actual);
  const e = normalizeOutput(expected);
  if (a === e) return true;
  const at = a.split(/\s+/).filter(Boolean);
  const et = e.split(/\s+/).filter(Boolean);
  if (at.length !== et.length) return false;
  for (let i = 0; i < at.length; i++) {
    if (at[i] === et[i]) continue;
    if (!FLOATY.test(at[i]) && !FLOATY.test(et[i])) return false;
    const x = Number(at[i]);
    const y = Number(et[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(y))) return false;
  }
  return true;
}
