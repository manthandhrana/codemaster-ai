import { Code2, Eye, History, ListChecks, Minus, Plus, Rocket, Shuffle, Sparkles, TriangleAlert, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import JobPanel, { JOB_STATUS, useJob } from '../components/JobPanel';
import { Badge, Button, Callout, Card, CardHeader, Chip, CopyButton, DIFFICULTY, Field, Input, Modal, Page, PageHeader, Select, Textarea } from '../components/ui';
import { useMeta } from '../context/meta';
import { http } from '../lib/api';
import { cn, fmtDuration, timeAgo } from '../lib/format';
import { localPref, useApi } from '../lib/hooks';
import { providerSuffix } from '../lib/providers';

const DEFAULT_FORM = {
  type: 'coding',
  difficulty: 'medium',
  language: 'python',
  topics: [],
  customTopic: '',
  count: 3,
  promptId: '',
  provider: 'auto',
  extra: '',
};

const PIPELINE = [
  'Your prompt template is filled with difficulty, language and topic, plus a strict JSON output contract.',
  'The request goes to your AI providers in priority order - if one fails or is rate-limited, the next one takes over automatically.',
  'The JSON is validated; duplicates of existing problems are rejected.',
  'For coding problems the reference solution is executed on every test - wrong expected outputs are auto-corrected.',
  'Questions are saved to MongoDB and appear in your Problem Set, ready to solve and reattempt.',
];

export default function Generate() {
  const meta = useMeta();
  const [form, setForm] = useState(() => ({ ...DEFAULT_FORM, ...localPref.get('cm.gen.form', {}) }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  useEffect(() => localPref.set('cm.gen.form', form), [form]);

  const { data: prompts } = useApi('/prompts');
  const { data: prov } = useApi('/providers');
  const jobs = useApi('/jobs?limit=12');
  const [jobId, setJobId] = useState(null);
  const job = useJob(jobId, (j) => {
    jobs.reload();
    if (j.status === 'completed') toast.success(`Generated ${j.done} question${j.done === 1 ? '' : 's'} 🎉`);
    else if (j.status === 'partial') toast.warning(`Generated ${j.done} of ${j.total} questions`);
    else if (j.status === 'failed') toast.error('Generation failed - see the job log');
  });
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const isCoding = form.type === 'coding';
  const languages = isCoding ? meta.codingLanguages : meta.languages;
  const topics = meta.topics[form.type] || [];
  const maxCount = isCoding ? 10 : 30;
  const ready = (prov?.providers || []).filter((p) => p.configured && p.enabled);

  useEffect(() => {
    if (isCoding && !meta.language(form.language)?.coding) set({ language: 'python' });
    if (form.count > maxCount) set({ count: maxCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type]);

  const promptOptions = useMemo(
    () => (prompts?.items || []).filter((p) => p.type === form.type && (p.difficulty === form.difficulty || p.difficulty === 'any')),
    [prompts, form.type, form.difficulty],
  );
  useEffect(() => {
    if (form.promptId && prompts && !promptOptions.some((p) => String(p.id) === String(form.promptId))) set({ promptId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptOptions]);

  const payload = () => ({ ...form, promptId: form.promptId || undefined, count: Number(form.count) || 1 });

  const generate = async () => {
    setSubmitting(true);
    try {
      const r = await http.post('/generate', payload());
      setJobId(r.job.id);
      toast.message(`Job queued: ${r.job.total} question${r.job.total === 1 ? '' : 's'}`);
      jobs.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const showPreview = async () => {
    setPreviewBusy(true);
    try {
      setPreview(await http.post('/generate/preview', payload()));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const toggleTopic = (t) => set({ topics: form.topics.includes(t) ? form.topics.filter((x) => x !== t) : [...form.topics, t] });
  const langInfo = meta.language(form.language);

  return (
    <Page wide>
      <PageHeader
        icon={Sparkles}
        title="AI Question Generator"
        subtitle="Create LeetCode-style coding problems or MCQs - calibrated from warm-up to competitive level."
      />

      {prov && ready.length === 0 && (
        <Callout tone="warn" icon={TriangleAlert} title="No AI provider is configured yet" className="mb-5">
          Add at least one free API key (Google Gemini, Groq, Cerebras, OpenRouter…) to <code>backend/.env</code>, then click{' '}
          <strong>Reload .env</strong> on the{' '}
          <Link to="/providers" className="underline">
            AI Providers
          </Link>{' '}
          page.
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="p-5 xl:col-span-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'coding', label: 'Coding problem', desc: 'Statement, examples, hidden tests, hints, solution', icon: Code2 },
              { value: 'mcq', label: 'Multiple choice', desc: 'Concepts, output prediction, complexity, bugs', icon: ListChecks },
            ].map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set({ type: t.value })}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  form.type === t.value ? 'border-violet-500/60 bg-violet-500/10 ring-2 ring-violet-500/20' : 'border-line bg-surface-2/50 hover:border-line-strong',
                )}
              >
                <t.icon className={cn('mt-0.5 size-5', form.type === t.value ? 'text-violet-300' : 'text-muted')} />
                <div>
                  <p className="text-sm font-semibold text-ink">{t.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>

          <p className="mt-6 mb-2 text-xs font-medium text-ink-2">Difficulty</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {meta.difficulties.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => set({ difficulty: d.id })}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all',
                  form.difficulty === d.id ? 'border-violet-500/60 bg-violet-500/10 ring-2 ring-violet-500/20' : 'border-line bg-surface-2/50 hover:border-line-strong',
                )}
              >
                <p className={cn('text-sm font-semibold', DIFFICULTY[d.id].text)}>{d.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted">{d.blurb}</p>
              </button>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field
              label={isCoding ? 'Language (starter + reference solution)' : 'Language / subject'}
              hint={isCoding ? (langInfo?.local ? '✓ Runs on this PC' : langInfo?.runnable ? 'Runs via free online compiler' : 'Judged by AI (no runner)') : undefined}
            >
              <Select value={form.language} onChange={(e) => set({ language: e.target.value })}>
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={isCoding ? 'Number of problems' : 'Number of questions'} hint={isCoding ? 'One AI call per problem' : 'Generated in batches of 5'}>
              <div className="flex items-center gap-2">
                <Button size="md" icon={Minus} aria-label="Fewer" onClick={() => set({ count: Math.max(1, form.count - 1) })} />
                <Input
                  type="number"
                  min={1}
                  max={maxCount}
                  value={form.count}
                  onChange={(e) => set({ count: Math.max(1, Math.min(maxCount, Number(e.target.value) || 1)) })}
                  className="text-center"
                />
                <Button size="md" icon={Plus} aria-label="More" onClick={() => set({ count: Math.min(maxCount, form.count + 1) })} />
              </div>
            </Field>
            <Field label="AI provider" hint={`${ready.length} provider${ready.length === 1 ? '' : 's'} ready for fallback`}>
              <Select value={form.provider} onChange={(e) => set({ provider: e.target.value })}>
                <option value="auto">Auto (fallback)</option>
                {(prov?.providers || []).map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.configured || !p.enabled}>
                    {p.name}
                    {providerSuffix(p) || ' first'}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-ink-2">Topics {form.topics.length ? `(${form.topics.length} selected)` : ''}</p>
              <button type="button" onClick={() => set({ topics: [] })} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                <Shuffle className="size-3" /> Random mix
              </button>
            </div>
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
              <Chip active={form.topics.length === 0} onClick={() => set({ topics: [] })}>
                🎲 Random mix
              </Chip>
              {topics.map((t) => (
                <Chip key={t} active={form.topics.includes(t)} onClick={() => toggleTopic(t)}>
                  {t}
                </Chip>
              ))}
            </div>
            <Input
              className="mt-3"
              placeholder="…or type a custom topic, e.g. 'LRU cache design', 'Dijkstra on grids', 'Python generators'"
              value={form.customTopic}
              onChange={(e) => set({ customTopic: e.target.value })}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Prompt template"
              hint={
                <>
                  Edit or add templates on the{' '}
                  <Link to="/prompts" className="text-violet-300 hover:underline">
                    Prompt Templates
                  </Link>{' '}
                  page.
                </>
              }
            >
              <Select value={form.promptId} onChange={(e) => set({ promptId: e.target.value })}>
                <option value="">Auto (best match)</option>
                {promptOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Extra instructions (optional)">
              <Textarea
                rows={3}
                placeholder="e.g. 'Make it about graphs on a 2D grid', 'Asked at Google onsite', 'Include negative numbers'"
                value={form.extra}
                onChange={(e) => set({ extra: e.target.value })}
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Button icon={Eye} loading={previewBusy} onClick={showPreview}>
              Preview prompt
            </Button>
            <Button variant="primary" size="lg" icon={Wand2} loading={submitting} onClick={generate} disabled={prov && ready.length === 0}>
              Generate {form.count} {isCoding ? `problem${form.count === 1 ? '' : 's'}` : `MCQ${form.count === 1 ? '' : 's'}`}
            </Button>
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Rocket className="size-4 text-violet-300" />
              <h3 className="text-sm font-semibold text-ink">{job ? 'Live generation log' : 'What happens next'}</h3>
            </div>
            {job ? (
              <JobPanel job={job} />
            ) : (
              <ol className="space-y-3">
                {PIPELINE.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-violet-500/30 bg-violet-500/10 text-[11px] font-bold text-violet-200">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent jobs" icon={History} />
            <div className="px-3 pt-2 pb-3">
              {jobs.data?.items?.length ? (
                jobs.data.items.map((j) => {
                  const st = JOB_STATUS[j.status] || { label: j.status, tone: 'neutral' };
                  const p = j.params || {};
                  const dur = j.startedAt && j.finishedAt ? (new Date(j.finishedAt) - new Date(j.startedAt)) / 1000 : null;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setJobId(j.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2',
                        jobId === j.id && 'bg-surface-2 ring-1 ring-line-strong',
                      )}
                    >
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {j.source === 'schedule' ? `⏰ ${p.scheduleName || 'Automation'}` : `${p.count || j.total} × ${p.type === 'mcq' ? 'MCQ' : 'coding'} · ${DIFFICULTY[p.difficulty]?.label || ''}`}
                      </span>
                      <span className="tabular text-xs text-muted">
                        {j.done}/{j.total}
                      </span>
                      <span className="w-16 text-right text-xs text-muted">{dur ? fmtDuration(dur) : timeAgo(j.createdAt)}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-3 text-sm text-muted">No generation jobs yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Prompt preview" subtitle={preview?.prompt?.name} size="lg">
        {preview && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-2">System message</p>
                <CopyButton text={preview.system} />
              </div>
              <pre className="max-h-40 overflow-auto rounded-lg border border-line bg-editor p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">{preview.system}</pre>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-2">User message (template + output contract)</p>
                <CopyButton text={preview.user} />
              </div>
              <pre className="max-h-[50vh] overflow-auto rounded-lg border border-line bg-editor p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">{preview.user}</pre>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
