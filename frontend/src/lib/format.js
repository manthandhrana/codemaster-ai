export function timeAgo(value) {
  if (!value) return '—';
  const t = new Date(value).getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 0) return timeUntil(value);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return fmtDate(value);
}

export function timeUntil(value) {
  if (!value) return '—';
  const s = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  if (s <= 0) return 'now';
  if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `in ${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
  return `in ${Math.round(s / 86400)}d`;
}

export const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

export function fmtDuration(totalSec) {
  const s = Math.max(0, Math.round(totalSec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export const clock = (totalSec) => {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export function compact(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 10000) return v.toLocaleString();
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export const pct = (x, digits = 0) => `${((Number(x) || 0) * 100).toFixed(digits)}%`;

export const VERDICTS = {
  accepted: { label: 'Accepted', tone: 'good' },
  correct: { label: 'Correct', tone: 'good' },
  finished: { label: 'Finished', tone: 'info' },
  wrong_answer: { label: 'Wrong Answer', tone: 'bad' },
  incorrect: { label: 'Incorrect', tone: 'bad' },
  runtime_error: { label: 'Runtime Error', tone: 'bad' },
  compile_error: { label: 'Compilation Error', tone: 'bad' },
  time_limit: { label: 'Time Limit Exceeded', tone: 'warn' },
  output_limit: { label: 'Output Limit Exceeded', tone: 'warn' },
};

export const verdictInfo = (v) => VERDICTS[v] || { label: v || 'Unknown', tone: 'info' };

export const TONE_TEXT = {
  good: 'text-emerald-400',
  bad: 'text-rose-400',
  warn: 'text-amber-400',
  info: 'text-sky-400',
};

export const EXECUTOR_LABEL = {
  local: 'Local',
  wandbox: 'Wandbox',
  judge0: 'Judge0',
  piston: 'Piston',
  ai: 'AI judge',
};

export const cn = (...parts) => parts.filter(Boolean).join(' ');
