import { useMemo, useState } from 'react';

// Ordinal one-hue ramp validated against the dark card surface (#13161d).
const RAMP = ['#184f95', '#256abf', '#3987e5', '#6da7ec'];
const EMPTY = '#1f2430';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function level(count) {
  if (!count) return -1;
  if (count === 1) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  return 3;
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** GitHub-style activity grid of submissions per day (last `weeks` weeks). */
export default function Heatmap({ data = [], weeks = 26 }) {
  const [hover, setHover] = useState(null);
  const { columns, months, total, activeDays } = useMemo(() => {
    const counts = new Map(data.map((d) => [d.date, d.count]));
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (weeks * 7 - 1));
    start.setDate(start.getDate() - start.getDay()); // align to Sunday so rows are weekdays
    const cols = [];
    const monthLabels = [];
    let sum = 0;
    let active = 0;
    const cursor = new Date(start);
    for (let w = 0; cursor <= today; w++) {
      const col = [];
      for (let dow = 0; dow < 7; dow++) {
        const key = isoDay(cursor);
        const future = cursor > today;
        const count = counts.get(key) || 0;
        if (!future) {
          sum += count;
          if (count) active++;
        }
        col.push({ key, count, future, date: new Date(cursor) });
        if (dow === 0 && cursor.getDate() <= 7) monthLabels.push({ col: w, label: cursor.toLocaleDateString(undefined, { month: 'short' }) });
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(col);
    }
    return { columns: cols, months: monthLabels, total: sum, activeDays: active };
  }, [data, weeks]);

  const cell = 12;
  const gap = 3;
  const labelW = 26;

  return (
    <div>
      <div className="relative overflow-x-auto pb-1">
        <svg
          width={labelW + columns.length * (cell + gap)}
          height={18 + 7 * (cell + gap)}
          role="img"
          aria-label={`${total} submissions on ${activeDays} active days in the last ${weeks} weeks`}
        >
          {months.map((m) => (
            <text key={`${m.col}-${m.label}`} x={labelW + m.col * (cell + gap)} y={10} fontSize={10} fill="#737b8c">
              {m.label}
            </text>
          ))}
          {[1, 3, 5].map((d) => (
            <text key={d} x={0} y={18 + d * (cell + gap) + cell - 2} fontSize={9} fill="#737b8c">
              {DAYS[d]}
            </text>
          ))}
          {columns.map((col, ci) =>
            col.map((c, di) =>
              c.future ? null : (
                <rect
                  key={c.key}
                  x={labelW + ci * (cell + gap)}
                  y={18 + di * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={3}
                  fill={level(c.count) < 0 ? EMPTY : RAMP[level(c.count)]}
                  stroke={hover?.key === c.key ? '#e9ebf1' : 'none'}
                  strokeWidth={1.5}
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`${c.count} submission${c.count === 1 ? '' : 's'} · ${c.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`}</title>
                </rect>
              ),
            ),
          )}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {hover ? (
            <>
              <strong className="font-semibold text-ink">{hover.count}</strong> submission{hover.count === 1 ? '' : 's'} on{' '}
              {hover.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink">{total}</strong> submissions · <strong className="font-semibold text-ink">{activeDays}</strong> active days
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          Less
          {[EMPTY, ...RAMP].map((c) => (
            <span key={c} className="inline-block size-3 rounded-[3px]" style={{ background: c }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
