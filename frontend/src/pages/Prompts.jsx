import {
  CircleCheck,
  CircleX,
  Copy,
  FileText,
  FlaskConical,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Markdown from '../components/Markdown';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  DIFFICULTY,
  EmptyState,
  Field,
  FullPageSpinner,
  Input,
  Modal,
  Page,
  PageHeader,
  Segmented,
  Select,
  Textarea,
  Toggle,
} from '../components/ui';
import { useMeta } from '../context/meta';
import { http } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useApi } from '../lib/hooks';
import { providerSuffix } from '../lib/providers';

const SAMPLE_VARS = {
  difficulty: 'Medium',
  language: 'Python 3',
  topic: 'Sliding Window',
  count: 5,
  extra: 'Asked at Google onsite',
  date: new Date().toDateString(),
};

// Same mini engine as backend/src/services/promptLibrary.js (preview only).
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
const render = (tpl, vars) =>
  String(tpl || '')
    .replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, k, body) =>
      (Array.isArray(vars[k]) ? vars[k] : []).map((it) => body.replace(/\{\{\s*this\s*\}\}/g, String(it))).join(''),
    )
    .replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, body) => (truthy(vars[k]) ? body : ''))
    .replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, k, body) => (truthy(vars[k]) ? '' : body))
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k])))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const EMPTY = { name: '', type: 'coding', difficulty: 'any', description: '', systemPrompt: '', template: '' };

const LETTERS = 'ABCDEF';

function TestResult({ result, isCoding }) {
  if (!result.ok) {
    return (
      <div className="space-y-3">
        <Callout tone="bad" icon={CircleX} title="Test failed - nothing would have been saved">
          <span className="whitespace-pre-wrap">{result.error}</span>
        </Callout>
        <LogList logs={result.logs} />
      </div>
    );
  }
  const g = result.generation || {};
  const v = result.question?.verification;
  const stored = isCoding ? result.question : result.questions;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green" icon={CircleCheck}>
          Matches {result.schema} schema
        </Badge>
        {isCoding && v && (
          <Badge tone={v.status === 'verified' ? 'green' : 'amber'} icon={ShieldCheck} title={v.by || v.reason}>
            Tests {v.status}
            {v.fixed ? ` · ${v.fixed} auto-corrected` : ''}
          </Badge>
        )}
        <Badge tone="violet">
          {g.providerName} · {g.model}
        </Badge>
        <Badge>{(g.latencyMs / 1000).toFixed(1)}s AI time</Badge>
        <Badge>
          {g.inputTokens} in / {g.outputTokens} out tokens
        </Badge>
        <Badge>
          attempt {g.attempts} · {(result.ms / 1000).toFixed(1)}s total
        </Badge>
      </div>
      {result.fallbacks?.length > 0 && (
        <Callout tone="warn" icon={TriangleAlert} title="Rejected or failed before this provider answered">
          {result.fallbacks.map((f, i) => (
            <div key={i}>{f}</div>
          ))}
        </Callout>
      )}

      {isCoding ? (
        <Card className="space-y-3 p-4">
          <p className="text-base font-semibold text-ink">{result.question.title}</p>
          <div className="flex flex-wrap gap-1.5">
            {result.question.topic && <Badge>{result.question.topic}</Badge>}
            {result.question.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
          <Markdown>{result.question.description}</Markdown>
          <p className="text-xs text-muted">
            {result.question.examples.length} examples · {result.question.testCases.length} hidden tests · {result.question.hints.length} hints ·{' '}
            {result.question.constraints.length} constraints · complexity {result.question.complexity.time} / {result.question.complexity.space}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {result.questions.map((q, i) => (
            <Card key={i} className="p-4">
              <p className="mb-2 text-sm font-semibold text-ink">
                {i + 1}. {q.title}
              </p>
              <Markdown>{q.question}</Markdown>
              <div className="mt-3 space-y-1">
                {q.options.map((o, j) => (
                  <p key={j} className={j === q.correctIndex ? 'text-sm text-emerald-300' : 'text-sm text-ink-2'}>
                    {LETTERS[j]}. {o} {j === q.correctIndex && '✓'}
                  </p>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <details className="rounded-xl border border-line bg-surface-2/40 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink-2">Stored JSON - exactly what would be saved in MongoDB</summary>
        <pre className="mt-2 max-h-80 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-ink-2">{JSON.stringify(stored, null, 2)}</pre>
      </details>
      <details className="rounded-xl border border-line bg-surface-2/40 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink-2">Raw AI response</summary>
        <pre className="mt-2 max-h-80 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-ink-2">{result.raw}</pre>
      </details>
      <LogList logs={result.logs} />
    </div>
  );
}

function LogList({ logs }) {
  if (!logs?.length) return null;
  return (
    <div className="max-h-48 overflow-y-auto rounded-xl border border-line bg-editor p-3 font-mono text-[11.5px] leading-relaxed">
      {logs.map((l, i) => (
        <div key={i} className={l.level === 'warn' ? 'text-amber-300' : l.level === 'success' ? 'text-emerald-300' : l.level === 'error' ? 'text-rose-300' : 'text-ink-2'}>
          {l.msg}
        </div>
      ))}
    </div>
  );
}

/** Dry-runs a template: real AI call + normalization + schema validation (+ test verification), no DB write. */
function PromptTester({ prompt, onClose }) {
  const meta = useMeta();
  const { data: prov } = useApi('/providers');
  const isCoding = prompt.type === 'coding';
  const [opts, setOpts] = useState({
    difficulty: prompt.difficulty === 'any' ? 'medium' : prompt.difficulty,
    language: 'python',
    topic: '',
    provider: 'auto',
    count: 2,
    verify: true,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (patch) => setOpts((o) => ({ ...o, ...patch }));
  const ready = (prov?.providers || []).filter((p) => p.configured && p.enabled);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await http.post(`/prompts/${prompt.id}/test`, opts));
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Test template - ${prompt.name}`}
      subtitle="Dry run: the AI answer is parsed, normalized and schema-validated exactly like a real generation - nothing is saved."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={FlaskConical} loading={busy} disabled={prov && !ready.length} onClick={run}>
            {result ? 'Run again' : 'Run test'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-5">
        <Field label="Difficulty">
          <Select value={opts.difficulty} disabled={prompt.difficulty !== 'any'} onChange={(e) => set({ difficulty: e.target.value })}>
            {meta.difficulties.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Language">
          <Select value={opts.language} onChange={(e) => set({ language: e.target.value })}>
            {(isCoding ? meta.codingLanguages : meta.languages).map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Topic (optional)">
          <Input value={opts.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="random" />
        </Field>
        <Field label="AI provider">
          <Select value={opts.provider} onChange={(e) => set({ provider: e.target.value })}>
            <option value="auto">Auto (fallback)</option>
            {ready.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {providerSuffix(p) || ' first'}
              </option>
            ))}
          </Select>
        </Field>
        {isCoding ? (
          <label className="flex items-end gap-2 pb-2 text-xs text-ink-2">
            <Toggle size="sm" checked={opts.verify} onChange={(v) => set({ verify: v })} label="Verify tests" /> Run reference solution
          </label>
        ) : (
          <Field label="Questions">
            <Input type="number" min={1} max={5} value={opts.count} onChange={(e) => set({ count: Number(e.target.value) || 1 })} />
          </Field>
        )}
      </div>
      {prov && !ready.length && (
        <Callout tone="warn" icon={TriangleAlert} className="mt-4">
          No AI provider is ready - add a key in backend/.env and click Reload .env on the AI Providers page.
        </Callout>
      )}
      <div className="mt-5">
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin text-violet-400" /> Waiting for the AI and validating the answer… (up to a minute)
          </p>
        )}
        {result && <TestResult result={result} isCoding={isCoding} />}
      </div>
    </Modal>
  );
}

function PromptEditor({ open, initial, onClose, onSaved }) {
  const meta = useMeta();
  const [form, setForm] = useState(initial || EMPTY);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const preview = useMemo(() => render(form.template, SAMPLE_VARS), [form.template]);

  const insertVar = (name) => {
    const el = ref.current;
    const token = `{{${name}}}`;
    if (!el) return set({ template: `${form.template}${token}` });
    const start = el.selectionStart ?? form.template.length;
    const end = el.selectionEnd ?? start;
    const next = form.template.slice(0, start) + token + form.template.slice(end);
    set({ template: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = initial?.id ? await http.put(`/prompts/${initial.id}`, form) : await http.post('/prompts', form);
      toast.success('Template saved');
      onSaved(saved);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={initial?.id ? `Edit template - ${initial.name}` : 'New prompt template'}
      subtitle="You write the creative instructions - the strict JSON output format is appended automatically."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save template
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Coding · Graph interview drills" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="coding">Coding problem</option>
                <option value="mcq">MCQ</option>
              </Select>
            </Field>
            <Field label="Difficulty" hint="'Any' templates can be picked for every level">
              <Select value={form.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                <option value="any">Any</option>
                {meta.difficulties.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Short note shown in the template list" />
          </Field>
          <Field label="System prompt (optional)" hint="Leave empty to use the built-in expert problem-setter persona.">
            <Textarea rows={3} value={form.systemPrompt} onChange={(e) => set({ systemPrompt: e.target.value })} />
          </Field>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-ink-2">Template</span>
              {meta.templateVariables.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  title={v.description}
                  onClick={() => insertVar(v.name)}
                  className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[11px] text-violet-200 hover:bg-violet-500/20"
                >
                  {`{{${v.name}}}`}
                </button>
              ))}
            </div>
            <textarea
              ref={ref}
              value={form.template}
              onChange={(e) => set({ template: e.target.value })}
              rows={16}
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-editor p-3 font-mono text-[12.5px] leading-relaxed text-ink focus:border-violet-500/70 focus:outline-none"
              placeholder={'Create ONE original {{difficulty}} coding problem about {{topic}} in {{language}}...'}
            />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-2">Live preview (sample values)</p>
          <pre className="h-full max-h-[34rem] min-h-64 overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {preview || 'Start typing a template…'}
            {'\n\n'}
            <span className="text-muted">
              {form.type === 'coding'
                ? '+ [auto] "Do not repeat these problems: …" list\n+ [auto] JSON output contract: title, description, examples, hidden testCases, hints, approach, complexity, starterCode, solutionCode…'
                : '+ [auto] "Do not repeat these questions: …" list\n+ [auto] JSON output contract: questions[{ question, options[4], correctIndex, explanation, hints }]'}
            </span>
          </pre>
        </div>
      </div>
    </Modal>
  );
}

export default function Prompts() {
  const { data, reload } = useApi('/prompts');
  const [type, setType] = useState('coding');
  const [editing, setEditing] = useState(null); // null | 'new' | prompt
  const [confirm, setConfirm] = useState(null); // { kind: 'delete'|'reset', prompt }
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(null);

  if (!data) return <FullPageSpinner />;
  const items = data.items.filter((p) => p.type === type);
  const order = { easy: 0, medium: 1, hard: 2, very_hard: 3, any: 4 };
  items.sort((a, b) => order[a.difficulty] - order[b.difficulty] || a.id - b.id);

  const act = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'delete') {
        await http.del(`/prompts/${confirm.prompt.id}`);
        toast.success('Template deleted');
      } else {
        await http.post(`/prompts/${confirm.prompt.id}/reset`);
        toast.success('Template reset to the built-in default');
      }
      setConfirm(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (p) => {
    try {
      const copy = await http.post(`/prompts/${p.id}/duplicate`);
      toast.success('Template duplicated');
      reload();
      setEditing(copy);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await http.post('/prompts/sync');
      toast.success(`Synced from folder: ${r.added} added, ${r.updated} updated, ${r.unchanged} unchanged${r.keptEdited ? `, ${r.keptEdited} edited kept` : ''}`);
      if (r.errors?.length) toast.error(`${r.errors.length} prompt file problem(s): ${r.errors[0]}`);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const lib = data.library;

  return (
    <Page wide>
      <PageHeader
        icon={FileText}
        title="Prompt Templates"
        subtitle="Multiple prompts per difficulty - the generator picks the best match, or you choose one explicitly."
        actions={
          <>
            <Button icon={RefreshCw} loading={syncing} onClick={sync} title="Re-read backend/prompts and update templates you did not edit here">
              Sync from folder
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              New template
            </Button>
          </>
        }
      />
      <Callout tone="violet" icon={FolderOpen} className="mb-5" title="All prompts live in backend/prompts">
        {lib.templates} templates, {lib.assistant.length} assistant prompts and {lib.schemas.length} JSON schemas are loaded from the folder. Every AI
        answer is normalized and validated against <code>schemas/coding-question</code> / <code>schemas/mcq-question</code> before it is saved, so all
        providers produce the same stored shape. Templates use <code>{'{{difficulty}}'}</code>, <code>{'{{language}}'}</code>,{' '}
        <code>{'{{topic}}'}</code>, <code>{'{{count}}'}</code>, <code>{'{{#if extra}}…{{/if}}'}</code> - the output contract is appended
        automatically. Use <strong>Test</strong> on a card to dry-run a template against your AI providers.
        {lib.errors?.length > 0 && <span className="mt-1 block text-rose-300">⚠ {lib.errors.join(' · ')}</span>}
      </Callout>

      <Segmented
        className="mb-4"
        value={type}
        onChange={setType}
        options={[
          { value: 'coding', label: 'Coding problems', count: data.items.filter((p) => p.type === 'coding').length },
          { value: 'mcq', label: 'MCQ', count: data.items.filter((p) => p.type === 'mcq').length },
        ]}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="No templates of this type" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink">{p.name}</h3>
                  <p className="mt-1 text-xs text-muted">{p.description || 'No description'}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {p.difficulty === 'any' ? <Badge tone="violet">Any level</Badge> : <Badge tone={DIFFICULTY[p.difficulty].tone}>{DIFFICULTY[p.difficulty].label}</Badge>}
                  {p.source === 'file' && !p.edited && (
                    <Badge tone="blue" title={`backend/prompts/${p.file}`}>
                      Folder · v{p.version}
                    </Badge>
                  )}
                  {p.edited && (
                    <Badge tone="amber" title={`Edited in the panel - backend/prompts/${p.file} is not applied until you Reset`}>
                      Edited
                    </Badge>
                  )}
                  {p.source !== 'file' && <Badge>Custom</Badge>}
                </div>
              </div>
              {p.file && <p className="mt-2 truncate font-mono text-[10.5px] text-muted">prompts/{p.file}</p>}
              <pre className="mt-4 line-clamp-6 flex-1 overflow-hidden rounded-lg border border-line bg-editor p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
                {p.template}
              </pre>
              <div className="mt-4 flex items-center gap-1.5">
                <Button size="sm" icon={Pencil} onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" icon={FlaskConical} onClick={() => setTesting(p)} title="Dry-run this template with your AI providers">
                  Test
                </Button>
                <Button size="sm" variant="ghost" icon={Copy} onClick={() => duplicate(p)}>
                  Copy
                </Button>
                {p.builtinKey ? (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirm({ kind: 'reset', prompt: p })}>
                    Reset
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" icon={Trash2} className="hover:text-rose-300" onClick={() => setConfirm({ kind: 'delete', prompt: p })}>
                    Delete
                  </Button>
                )}
                <span className="ml-auto text-[11px] text-muted">edited {timeAgo(p.updatedAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {testing && <PromptTester prompt={testing} onClose={() => setTesting(null)} />}

      {editing && (
        <PromptEditor
          open
          initial={editing === 'new' ? { ...EMPTY, type } : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={act}
        busy={busy}
        danger={confirm?.kind === 'delete'}
        title={confirm?.kind === 'delete' ? 'Delete template?' : 'Reset to default?'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Reset'}
      >
        {confirm?.kind === 'delete'
          ? `"${confirm?.prompt.name}" will be removed. Questions generated with it are kept.`
          : `Your edits to "${confirm?.prompt.name}" will be replaced with backend/prompts/${confirm?.prompt.file}.`}
      </ConfirmDialog>
    </Page>
  );
}
