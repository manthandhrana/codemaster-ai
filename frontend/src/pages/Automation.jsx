import { CalendarClock, Clock, History, Info, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import JobPanel, { JOB_STATUS, useJob } from '../components/JobPanel';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Chip,
  ConfirmDialog,
  DIFFICULTY,
  EmptyState,
  Field,
  FullPageSpinner,
  Input,
  Modal,
  Page,
  PageHeader,
  Select,
  Textarea,
  Toggle,
} from '../components/ui';
import { useMeta } from '../context/meta';
import { http } from '../lib/api';
import { fmtDateTime, timeAgo, timeUntil } from '../lib/format';
import { useApi } from '../lib/hooks';
import { providerSuffix } from '../lib/providers';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describeDays(days) {
  const d = [...days].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '0,6') return 'Weekends';
  return d.map((x) => DAY_LABELS[x]).join(', ');
}

const itemText = (it, langLabel) =>
  `${it.count} × ${DIFFICULTY[it.difficulty]?.label} ${it.type === 'mcq' ? 'MCQ' : 'coding'} · ${langLabel(it.language)}`;

const NEW_SCHEDULE = {
  name: 'Daily practice set',
  enabled: true,
  time: '09:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  cron: '',
  catchUp: true,
  config: {
    items: [
      { type: 'coding', difficulty: 'easy', count: 1, language: 'python' },
      { type: 'coding', difficulty: 'medium', count: 2, language: 'python' },
      { type: 'mcq', difficulty: 'medium', count: 5, language: 'python' },
    ],
    topics: [],
    provider: 'auto',
    extra: '',
  },
};

function ScheduleEditor({ initial, onClose, onSaved, providers }) {
  const meta = useMeta();
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(initial)));
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(Boolean(initial.cron));
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const setCfg = (patch) => setS((x) => ({ ...x, config: { ...x.config, ...patch } }));
  const setItem = (i, patch) => setCfg({ items: s.config.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const allTopics = [...new Set([...meta.topics.coding, ...meta.topics.mcq])];

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...s, cron: advanced ? s.cron : '' };
      const saved = s.id ? await http.put(`/schedules/${s.id}`, body) : await http.post('/schedules', body);
      toast.success('Schedule saved');
      onSaved(saved);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={s.id ? `Edit schedule - ${initial.name}` : 'New daily schedule'}
      subtitle={`Runs in ${meta.timezone}. Generated questions become that day's "Daily set".`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save schedule
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Name" className="md:col-span-2">
            <Input value={s.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Time (24h)">
            <Input type="time" value={s.time} onChange={(e) => set({ time: e.target.value })} disabled={advanced} />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-ink-2">Days</span>
            {[
              ['Every day', [0, 1, 2, 3, 4, 5, 6]],
              ['Weekdays', [1, 2, 3, 4, 5]],
              ['Weekends', [0, 6]],
            ].map(([label, days]) => (
              <button key={label} type="button" onClick={() => set({ days })} className="text-[11px] text-violet-300 hover:underline">
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((d, i) => (
              <Chip
                key={d}
                active={s.days.includes(i)}
                onClick={() => set({ days: s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i] })}
              >
                {d}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-ink-2">What to generate</p>
          <div className="space-y-2">
            {s.config.items.map((it, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface-2/50 p-2 md:grid-cols-[1fr_1fr_90px_1.4fr_auto]">
                <Select value={it.type} onChange={(e) => setItem(i, { type: e.target.value, language: e.target.value === 'coding' && !meta.language(it.language)?.coding ? 'python' : it.language })}>
                  <option value="coding">Coding</option>
                  <option value="mcq">MCQ</option>
                </Select>
                <Select value={it.difficulty} onChange={(e) => setItem(i, { difficulty: e.target.value })}>
                  {meta.difficulties.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>
                <Input type="number" min={1} max={it.type === 'coding' ? 20 : 100} value={it.count} onChange={(e) => setItem(i, { count: Number(e.target.value) || 1 })} aria-label="Count" />
                <Select value={it.language} onChange={(e) => setItem(i, { language: e.target.value })}>
                  {(it.type === 'coding' ? meta.codingLanguages : meta.languages).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  icon={X}
                  aria-label="Remove item"
                  disabled={s.config.items.length === 1}
                  onClick={() => setCfg({ items: s.config.items.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
          </div>
          <Button size="sm" className="mt-2" icon={Plus} onClick={() => setCfg({ items: [...s.config.items, { type: 'coding', difficulty: 'medium', count: 1, language: 'python' }] })}>
            Add item
          </Button>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-2">Topics (optional - empty means a random mix every day)</p>
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {allTopics.map((t) => (
              <Chip
                key={t}
                active={s.config.topics.includes(t)}
                onClick={() => setCfg({ topics: s.config.topics.includes(t) ? s.config.topics.filter((x) => x !== t) : [...s.config.topics, t] })}
              >
                {t}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="AI provider">
            <Select value={s.config.provider} onChange={(e) => setCfg({ provider: e.target.value })}>
              <option value="auto">Auto - smart fallback</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured || !p.enabled}>
                  {p.name}
                  {providerSuffix(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Extra instructions (optional)">
            <Textarea rows={2} value={s.config.extra} onChange={(e) => setCfg({ extra: e.target.value })} placeholder="e.g. Focus on Google interview style" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-6 rounded-xl border border-line bg-surface-2/40 p-4">
          <label className="flex items-center gap-3 text-sm text-ink-2">
            <Toggle checked={s.enabled} onChange={(v) => set({ enabled: v })} label="Enabled" /> Enabled
          </label>
          <label className="flex items-center gap-3 text-sm text-ink-2">
            <Toggle checked={s.catchUp} onChange={(v) => set({ catchUp: v })} label="Catch up" /> Catch up if the PC was off at that time
          </label>
          <label className="flex items-center gap-3 text-sm text-ink-2">
            <Toggle checked={advanced} onChange={setAdvanced} label="Custom cron" /> Custom cron expression
          </label>
        </div>
        {advanced && (
          <Field label="Cron expression" hint="minute hour day-of-month month day-of-week - e.g. '30 7 * * 1-5' = 07:30 on weekdays. Catch-up is not used with cron.">
            <Input value={s.cron} onChange={(e) => set({ cron: e.target.value })} placeholder="0 9 * * *" className="font-mono" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export default function Automation() {
  const meta = useMeta();
  const { data, reload } = useApi('/schedules', { interval: 15000 });
  const { data: prov } = useApi('/providers');
  const jobs = useApi('/jobs?limit=40', { interval: 15000 });
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewJob, setViewJob] = useState(null);
  const liveJob = useJob(viewJob, () => {
    reload();
    jobs.reload();
  });

  if (!data) return <FullPageSpinner />;
  const autoJobs = (jobs.data?.items || []).filter((j) => j.source === 'schedule').slice(0, 10);

  const runNow = async (s) => {
    try {
      const r = await http.post(`/schedules/${s.id}/run`);
      if (r.skipped) toast.message(r.reason);
      else {
        toast.success(`"${s.name}" started`);
        setViewJob(r.jobId);
      }
      reload();
      jobs.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const toggle = async (s, enabled) => {
    try {
      await http.patch(`/schedules/${s.id}/toggle`, { enabled });
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await http.del(`/schedules/${confirm.id}`);
      toast.success('Schedule deleted');
      setConfirm(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page wide>
      <PageHeader
        icon={CalendarClock}
        title="Daily Automation"
        subtitle="Generate a fresh practice set automatically every day - e.g. 1 easy + 2 medium + 1 hard coding problems and 5 MCQs."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing(NEW_SCHEDULE)}>
            New schedule
          </Button>
        }
      />
      <Callout tone="info" icon={Info} className="mb-5">
        Schedules run inside the backend while it is running (timezone <strong>{data.timezone}</strong>). If your PC was off at the scheduled time,
        catch-up runs the set as soon as the server starts. Generated questions are tagged as that day&apos;s <strong>Daily set</strong>.
      </Callout>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          {data.items.length === 0 ? (
            <Card>
              <EmptyState icon={CalendarClock} title="No schedules yet" action={<Button icon={Plus} onClick={() => setEditing(NEW_SCHEDULE)}>Create one</Button>}>
                Create a schedule to receive new questions every day.
              </EmptyState>
            </Card>
          ) : (
            data.items.map((s) => {
              const st = s.lastStatus ? JOB_STATUS[s.lastStatus] || { label: s.lastStatus, tone: 'neutral' } : null;
              return (
                <Card key={s.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-ink">{s.name}</h3>
                        {s.running && <Badge tone="violet">Running</Badge>}
                        {!s.enabled && <Badge>Paused</Badge>}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-2">
                        <Clock className="size-3.5 text-muted" />
                        {s.cron ? (
                          <span className="font-mono text-xs">cron: {s.cron}</span>
                        ) : (
                          <>
                            {describeDays(s.days)} at {s.time}
                          </>
                        )}
                        {s.nextRunAt && <span className="text-muted">· next {timeUntil(s.nextRunAt)}</span>}
                      </p>
                    </div>
                    <Toggle checked={s.enabled} onChange={(v) => toggle(s, v)} label={s.enabled ? 'Pause schedule' : 'Enable schedule'} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {s.config.items.map((it, i) => (
                      <Badge key={i} tone={DIFFICULTY[it.difficulty]?.tone}>
                        {itemText(it, meta.langLabel)}
                      </Badge>
                    ))}
                    {s.config.topics.length > 0 && <Badge tone="neutral">Topics: {s.config.topics.join(', ')}</Badge>}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <Button size="sm" variant="primary" icon={Play} onClick={() => runNow(s)} disabled={s.running}>
                      Run now
                    </Button>
                    <Button size="sm" icon={Pencil} onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" icon={Trash2} className="hover:text-rose-300" onClick={() => setConfirm(s)}>
                      Delete
                    </Button>
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                      {s.lastRunAt ? (
                        <>
                          Last run {timeAgo(s.lastRunAt)}
                          {st && <Badge tone={st.tone}>{st.label}</Badge>}
                          {s.lastJobId && (
                            <button type="button" className="text-violet-300 hover:underline" onClick={() => setViewJob(s.lastJobId)}>
                              view log
                            </button>
                          )}
                        </>
                      ) : (
                        'Never run'
                      )}
                    </span>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-5 xl:col-span-2">
          {liveJob && (
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold text-ink">{liveJob.params?.scheduleName || 'Automation run'}</p>
              <JobPanel job={liveJob} />
            </Card>
          )}
          <Card>
            <CardHeader title="Automation history" icon={History} subtitle="Last 10 scheduled runs" />
            <div className="px-3 pt-2 pb-3">
              {autoJobs.length ? (
                autoJobs.map((j) => {
                  const st = JOB_STATUS[j.status] || { label: j.status, tone: 'neutral' };
                  return (
                    <button key={j.id} type="button" onClick={() => setViewJob(j.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {j.params?.scheduleName} <span className="text-xs text-muted">({j.params?.trigger})</span>
                      </span>
                      <span className="tabular text-xs text-muted">
                        {j.done}/{j.total}
                      </span>
                      <span className="text-xs text-muted">{fmtDateTime(j.createdAt)}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-3 text-sm text-muted">No automation runs yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {editing && (
        <ScheduleEditor
          initial={editing}
          providers={prov?.providers || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={remove} busy={busy} danger title="Delete schedule?" confirmLabel="Delete">
        &quot;{confirm?.name}&quot; will stop running. Questions it already generated are kept.
      </ConfirmDialog>
    </Page>
  );
}
