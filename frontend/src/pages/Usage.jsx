import { Activity, BarChart3, Bot, Brain, CircleCheck, CircleX, Coins, LifeBuoy, ScrollText, Zap } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, CardHeader, ErrorState, FullPageSpinner, Meter, Page, PageHeader, Segmented, Select, StatTile } from '../components/ui';
import { useMeta } from '../context/meta';
import { qs } from '../lib/api';
import { cn, compact, fmtDateTime, pct, timeAgo } from '../lib/format';
import { useApi } from '../lib/hooks';

// Chart tokens - validated with the dataviz palette checker against the card surface #13161d (dark mode).
const C = {
  ok: '#3987e5', // series slot 1
  failed: '#e66767', // passes CVD separation vs slot 1 (green/red does not)
  grid: '#232834',
  axis: '#343b4b',
  tick: '#737b8c',
  surface: '#13161d',
};

const PURPOSE_LABEL = {
  generate_coding: 'Coding problem generation',
  generate_mcq: 'MCQ generation',
  hint: 'AI hints',
  review: 'Interview reviews',
  judge: 'AI judge (no runner)',
  starter: 'Starter code translation',
  test: 'Provider tests',
  general: 'Other',
};

const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function topRounded(x, y, w, h, r = 4) {
  if (!(h > 0) || !(w > 0)) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}L${x},${y + rr}Q${x},${y} ${x + rr},${y}L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${y + h}Z`;
}

// Stacked columns: the top-most visible segment gets the 4px rounded data-end, a 2px surface gap separates segments.
const OkShape = ({ x, y, width, height, payload }) => {
  if (!(height > 0)) return null;
  if (payload.failed > 0) {
    const gap = Math.min(2, height);
    return <rect x={x} y={y + gap} width={width} height={Math.max(0, height - gap)} fill={C.ok} />;
  }
  return <path d={topRounded(x, y, width, height)} fill={C.ok} />;
};
const FailShape = ({ x, y, width, height }) => (height > 0 ? <path d={topRounded(x, y, width, height)} fill={C.failed} /> : null);

function TooltipBox({ title, rows }) {
  return (
    <div className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 text-muted">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />
          <strong className="tabular font-semibold text-ink">{r.value}</strong>
          <span className="text-ink-2">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

const RequestsTooltip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <TooltipBox
      title={dayLabel(label)}
      rows={[
        { label: 'succeeded', value: payload[0].payload.ok, color: C.ok },
        { label: 'failed', value: payload[0].payload.failed, color: C.failed },
      ]}
    />
  ) : null;

const TokensTooltip = ({ active, payload, label }) =>
  active && payload?.length ? <TooltipBox title={dayLabel(label)} rows={[{ label: 'tokens', value: payload[0].value.toLocaleString(), color: C.ok }]} /> : null;

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-ink-2">
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: C.ok }} /> Succeeded
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: C.failed }} /> Failed
      </span>
    </div>
  );
}

function RankedBars({ rows, valueKey, labelOf, subOf }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={labelOf(r)} title={`${labelOf(r)}: ${r[valueKey]}`}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-ink-2">{labelOf(r)}</span>
            <span className="shrink-0 text-muted">{subOf?.(r)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-[#172238]">
              <div className="h-2 rounded-full" style={{ width: `${(r[valueKey] / max) * 100}%`, background: C.ok }} />
            </div>
            <span className="tabular w-10 text-right text-xs font-semibold text-ink">{compact(r[valueKey])}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function LogsTable({ providerName }) {
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const { data, loading } = useApi(`/usage/logs${qs({ provider, status, offset, limit })}`);
  const meta = useMeta();
  return (
    <Card>
      <CardHeader
        title="AI request log"
        subtitle="Every provider attempt, including the ones that failed over"
        icon={ScrollText}
        actions={
          <>
            <Select
              className="h-8 w-auto text-xs"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setOffset(0);
              }}
              aria-label="Provider"
            >
              <option value="">All providers</option>
              {meta.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select
              className="h-8 w-auto text-xs"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
              aria-label="Status"
            >
              <option value="">All results</option>
              <option value="ok">Succeeded</option>
              <option value="failed">Failed</option>
            </Select>
          </>
        }
      />
      <div className={cn('mt-3 overflow-x-auto transition-opacity', loading && data && 'opacity-60')}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-line text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
              <th className="px-5 py-2.5">Time</th>
              <th className="px-3 py-2.5">Provider</th>
              <th className="px-3 py-2.5">Model</th>
              <th className="px-3 py-2.5">Purpose</th>
              <th className="px-3 py-2.5">Result</th>
              <th className="px-3 py-2.5 text-right">Latency</th>
              <th className="px-3 py-2.5 text-right">Tokens in / out</th>
              <th className="px-3 py-2.5">Error</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((l) => (
              <tr key={l.id} className="border-b border-line/60 last:border-0">
                <td className="px-5 py-2 whitespace-nowrap text-muted">{fmtDateTime(l.createdAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-ink">
                  {providerName(l.provider)}
                  {l.attempt > 1 && <Badge className="ml-1.5">attempt {l.attempt}</Badge>}
                </td>
                <td className="max-w-44 truncate px-3 py-2 font-mono text-[11px] text-ink-2" title={l.model}>
                  {l.model}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-ink-2">{PURPOSE_LABEL[l.purpose] || l.purpose}</td>
                <td className="px-3 py-2">
                  {l.success ? (
                    <span className="inline-flex items-center gap-1 text-ink-2">
                      <CircleCheck className="size-3.5 text-emerald-400" /> ok
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-ink-2">
                      <CircleX className="size-3.5 text-rose-400" /> failed
                    </span>
                  )}
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-2">{l.latencyMs != null ? `${(l.latencyMs / 1000).toFixed(1)}s` : '—'}</td>
                <td className="tabular px-3 py-2 text-right text-ink-2">
                  {compact(l.inputTokens)} / {compact(l.outputTokens)}
                </td>
                <td className="max-w-72 truncate px-3 py-2 text-rose-300/80" title={l.error || ''}>
                  {l.error || ''}
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-muted">
                  No AI requests recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.total > limit && (
        <div className="flex items-center justify-between px-5 py-3 text-xs text-muted">
          <span>
            {offset + 1}-{Math.min(offset + limit, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button size="xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
              Newer
            </Button>
            <Button size="xs" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)}>
              Older
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Usage() {
  const meta = useMeta();
  const [days, setDays] = useState(30);
  const { data: u, error, reload, loading } = useApi(`/usage?days=${days}`);
  const { data: overview } = useApi('/stats/overview');
  const providerName = (id) => meta.providers.find((p) => p.id === id)?.name || id;

  if (error && !u) return <ErrorState error={error} onRetry={reload} />;
  if (!u) return <FullPageSpinner />;

  const t = u.totals;
  const daily = u.daily.map((d) => ({ date: d.date, ok: d.total - d.failed, failed: d.failed, tokens: d.tokens }));
  const a = overview?.assistance;

  return (
    <Page wide>
      <PageHeader icon={BarChart3} title="AI Usage" subtitle="How much AI you are using - per provider, per purpose and per day." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={days}
          onChange={setDays}
          options={[
            { value: 7, label: 'Last 7 days' },
            { value: 30, label: 'Last 30 days' },
            { value: 90, label: 'Last 90 days' },
          ]}
        />
      </div>

      <div className={cn('space-y-4 transition-opacity', loading && 'opacity-60')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="AI calls" value={compact(t.calls)} sub={`${t.requests} requests · ${t.failed} failed attempts`} icon={Zap} />
          <StatTile label="Success rate" value={pct(t.successRate)} sub={`${t.ok} of ${t.calls} provider calls succeeded`} icon={Activity} accent="text-sky-400" />
          <StatTile label="Tokens used" value={compact(t.inputTokens + t.outputTokens)} sub={`${compact(t.inputTokens)} in · ${compact(t.outputTokens)} out`} icon={Coins} accent="text-amber-400" />
          <StatTile
            label="Rescued by fallback"
            value={compact(t.rescuedByFallback)}
            sub="Requests that succeeded after another provider failed"
            icon={LifeBuoy}
            accent="text-emerald-400"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Provider calls per day" subtitle="Every attempt, including failovers" icon={BarChart3} actions={<Legend />} />
            <div className="h-64 px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: C.tick, fontSize: 11 }} axisLine={{ stroke: C.axis }} tickLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fill: C.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<RequestsTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="ok" stackId="calls" maxBarSize={24} shape={<OkShape />} isAnimationActive={false} />
                  <Bar dataKey="failed" stackId="calls" maxBarSize={24} shape={<FailShape />} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardHeader title="Tokens per day" subtitle="Input + output tokens across all providers" icon={Coins} />
            <div className="h-64 px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: C.tick, fontSize: 11 }} axisLine={{ stroke: C.axis }} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={compact} tick={{ fill: C.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<TokensTooltip />} cursor={{ stroke: '#aab1c0', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke={C.ok}
                    strokeWidth={2}
                    fill={C.ok}
                    fillOpacity={0.1}
                    dot={false}
                    activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2, fill: C.ok }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader title="Calls by provider" icon={Bot} />
            <div className="px-5 pt-4 pb-5">
              {u.providers.length ? (
                <RankedBars rows={u.providers} valueKey="calls" labelOf={(r) => providerName(r.provider)} subOf={(r) => `${pct(r.successRate)} ok`} />
              ) : (
                <p className="text-sm text-muted">No calls in this period.</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="What the AI was used for" icon={Activity} />
            <div className="px-5 pt-4 pb-5">
              {u.purposes.length ? (
                <RankedBars rows={u.purposes} valueKey="calls" labelOf={(r) => PURPOSE_LABEL[r.purpose] || r.purpose} subOf={(r) => `${compact(r.tokens)} tokens`} />
              ) : (
                <p className="text-sm text-muted">No calls in this period.</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Your AI assistance while solving" subtitle="All time" icon={Brain} />
            {a ? (
              <div className="space-y-3 px-5 pt-4 pb-5 text-sm">
                {[
                  ['Stored hints revealed', a.hints],
                  ['AI hints asked', a.aiHints],
                  ['AI interview reviews', a.aiReviews],
                  ['Solutions / answers revealed', a.solutionViews],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-ink-2">{label}</span>
                    <strong className="font-semibold text-ink">{value}</strong>
                  </div>
                ))}
                <div className="border-t border-line pt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-ink-2">Solved without any help</span>
                    <strong className="font-semibold text-ink">{pct(a.independentRate)}</strong>
                  </div>
                  <Meter value={a.independent} max={a.solved} label={`${a.independent} of ${a.solved} solves were independent`} />
                  <p className="mt-1.5 text-xs text-muted">
                    {a.independent} of {a.solved} solved questions used no hint, AI help or solution.
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-5 py-6 text-sm text-muted">Loading…</div>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Provider breakdown" subtitle={`Last ${u.days} days`} icon={Bot} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                  <th className="px-5 py-2.5">Provider</th>
                  <th className="px-3 py-2.5 text-right">Calls</th>
                  <th className="px-3 py-2.5 text-right">Succeeded</th>
                  <th className="px-3 py-2.5 text-right">Failed</th>
                  <th className="px-3 py-2.5 text-right">Success rate</th>
                  <th className="px-3 py-2.5 text-right">Avg latency</th>
                  <th className="px-3 py-2.5 text-right">Tokens in / out</th>
                  <th className="px-3 py-2.5">Last used</th>
                  <th className="px-3 py-2.5">Last error</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {u.providers.map((p) => (
                  <tr key={p.provider} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-2.5 text-ink">{providerName(p.provider)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{p.calls}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{p.ok}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{p.failed}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{pct(p.successRate)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{p.avgLatencyMs != null ? `${(p.avgLatencyMs / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">
                      {compact(p.inputTokens)} / {compact(p.outputTokens)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">{timeAgo(p.lastUsed)}</td>
                    <td className="max-w-72 truncate px-3 py-2.5 text-xs text-rose-300/80" title={p.lastError?.error || ''}>
                      {p.lastError?.error || '—'}
                    </td>
                  </tr>
                ))}
                {u.providers.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-muted">
                      No AI calls in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <LogsTable providerName={providerName} />
      </div>
    </Page>
  );
}
