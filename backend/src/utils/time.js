import { env } from '../config.js';

export function tz() {
  return env('APP_TIMEZONE') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export const nowIso = () => new Date().toISOString();

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map();

function partsFormatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(
      zone,
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      }),
    );
  }
  return formatters.get(zone);
}

/** Calendar parts of an instant in the app timezone. */
export function localParts(instant = new Date()) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const p = Object.fromEntries(partsFormatter(tz()).formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS[p.weekday],
    date: `${p.year}-${p.month}-${p.day}`,
  };
}

/** YYYY-MM-DD in the app timezone. */
export const localDate = (instant = new Date()) => localParts(instant).date;

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

function offsetMs(instantMs) {
  const p = localParts(new Date(instantMs));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instantMs / 1000) * 1000;
}

/** UTC ISO string for a wall-clock time (HH:MM) on a local date in the app timezone. */
export function zonedToUtcIso(dateStr, hm = '00:00') {
  const guess = Date.parse(`${dateStr}T${hm}:00Z`);
  const off = offsetMs(guess);
  let t = guess - off;
  const off2 = offsetMs(t);
  if (off2 !== off) t = guess - off2;
  return new Date(t).toISOString();
}

export const startOfTodayIso = () => zonedToUtcIso(localDate(), '00:00');
export const isoDaysAgo = (days) => zonedToUtcIso(addDays(localDate(), -days), '00:00');
