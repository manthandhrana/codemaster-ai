import { ChevronDown, ChevronUp, CircleCheck, CircleX, Database, FlaskConical, KeyRound, LogOut, RefreshCw, Save, Server, Settings as SettingsIcon, TerminalSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Callout, Card, CardHeader, Field, FullPageSpinner, Input, Page, PageHeader, Select, Toggle } from '../components/ui';
import { useAuth } from '../context/auth';
import { useMeta } from '../context/meta';
import { http } from '../lib/api';
import { cn } from '../lib/format';
import { useApi } from '../lib/hooks';

const EXECUTOR_INFO = {
  local: 'Compilers/interpreters installed on this PC (Node.js is always available).',
  wandbox: 'Free online compilers - no key needed. Supports C++, Java, Python, Go, Rust, C#, PHP, Ruby, Swift...',
  judge0: 'Judge0 CE via RapidAPI (JUDGE0_API_KEY) or your own Judge0 server (JUDGE0_URL).',
  piston: 'Self-hosted Piston (PISTON_URL). The public Piston API is whitelist-only.',
};

const RUNTIME_LABEL = {
  node: 'Node.js',
  python: 'Python 3',
  gpp: 'g++ (C++)',
  gcc: 'gcc (C)',
  javac: 'javac',
  java: 'java',
  go: 'Go',
  rustc: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
};

export default function Settings() {
  const meta = useMeta();
  const { logout } = useAuth();
  const { data, setData } = useApi('/settings');
  const [ex, setEx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testLang, setTestLang] = useState('python');
  const [tests, setTests] = useState({});

  useEffect(() => {
    if (data && !ex) setEx(data.settings);
  }, [data, ex]);
  if (!data || !ex) return <FullPageSpinner />;

  const executors = ex.order.map((id) => data.executors.find((e) => e.id === id)).filter(Boolean);
  const move = (i, dir) => {
    const order = [...ex.order];
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    setEx({ ...ex, order });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await http.put('/settings/executor', ex);
      setData({ ...data, ...r });
      setEx(r.settings);
      meta.reloadMeta();
      toast.success('Code execution settings saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const detect = async () => {
    setDetecting(true);
    try {
      const r = await http.post('/settings/detect-runtimes');
      setData({ ...data, ...r });
      meta.reloadMeta();
      toast.success(`Local runners: ${r.localLanguages.join(', ')}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDetecting(false);
    }
  };

  const testRunner = async (executor) => {
    setTests((t) => ({ ...t, [executor]: { busy: true } }));
    try {
      const r = await http.post('/settings/test-runner', { executor, language: testLang });
      setTests((t) => ({ ...t, [executor]: r }));
    } catch (e) {
      setTests((t) => ({ ...t, [executor]: { ok: false, error: e.message } }));
    }
  };

  return (
    <Page>
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Code execution, database and environment." />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Code runners"
            subtitle="Used for Run / Submit and to verify generated test cases - tried top to bottom"
            icon={TerminalSquare}
            actions={
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Test with</span>
                <Select value={testLang} onChange={(e) => setTestLang(e.target.value)} className="h-8 w-auto text-xs" aria-label="Test language">
                  {meta.codingLanguages.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>
            }
          />
          <div className="space-y-2 p-5">
            {executors.map((e, i) => {
              const t = tests[e.id];
              return (
                <div key={e.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3', !e.configured && 'opacity-70')}>
                  <div className="flex flex-col">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted hover:text-ink disabled:opacity-30">
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === executors.length - 1}
                      onClick={() => move(i, 1)}
                      className="text-muted hover:text-ink disabled:opacity-30"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>
                  <span className="tabular grid size-7 place-items-center rounded-lg border border-line bg-surface-3 text-xs font-bold text-ink-2">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{e.name}</p>
                      <Badge tone={e.configured ? 'green' : 'neutral'}>{e.configured ? 'Available' : 'Not configured'}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{EXECUTOR_INFO[e.id]}</p>
                    {t && !t.busy && (
                      <p className={cn('mt-1 text-xs', t.ok ? 'text-emerald-300' : 'text-rose-300')}>
                        {t.ok ? `✓ ${testLang} works (${t.ms} ms${t.runtime ? `, ${t.runtime}` : ''})` : `✗ ${t.error || t.stderr || 'unexpected output'}`}
                      </p>
                    )}
                  </div>
                  <Button size="sm" icon={FlaskConical} loading={t?.busy} disabled={!e.configured} onClick={() => testRunner(e.id)}>
                    Test
                  </Button>
                  <Toggle checked={ex.enabled[e.id] !== false} onChange={(v) => setEx({ ...ex, enabled: { ...ex.enabled, [e.id]: v } })} label={`Enable ${e.name}`} />
                </div>
              );
            })}
            <div className="grid gap-4 pt-3 md:grid-cols-3">
              <Field label="Time limit per test (ms)" hint="Local runs are killed after this limit (TLE).">
                <Input type="number" min={500} max={30000} step={500} value={ex.timeLimitMs} onChange={(e) => setEx({ ...ex, timeLimitMs: Number(e.target.value) })} />
              </Field>
              <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
                <Toggle checked={ex.verifyGenerated} onChange={(v) => setEx({ ...ex, verifyGenerated: v })} label="Verify generated tests" />
                <span className="text-xs text-ink-2">
                  <strong className="block text-ink">Verify generated tests</strong>Run the reference solution on every AI-generated test and fix wrong
                  expected outputs.
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
                <Toggle checked={ex.aiJudge} onChange={(v) => setEx({ ...ex, aiJudge: v })} label="AI judge fallback" />
                <span className="text-xs text-ink-2">
                  <strong className="block text-ink">AI judge fallback</strong>When no runner supports a language, let the AI estimate the verdict
                  (marked approximate).
                </span>
              </label>
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="primary" icon={Save} loading={saving} onClick={save}>
                Save runner settings
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader
              title="Local runtimes"
              subtitle={`Runs locally: ${data.localLanguages.join(', ')}`}
              icon={Server}
              actions={
                <Button size="sm" icon={RefreshCw} loading={detecting} onClick={detect}>
                  Re-detect
                </Button>
              }
            />
            <div className="grid grid-cols-2 gap-2 p-5">
              {Object.entries(RUNTIME_LABEL).map(([key, label]) => {
                const rt = data.runtimes[key];
                return (
                  <div key={key} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs">
                    {rt ? <CircleCheck className="size-3.5 shrink-0 text-emerald-400" /> : <CircleX className="size-3.5 shrink-0 text-muted" />}
                    <span className={rt ? 'text-ink' : 'text-muted'}>{label}</span>
                    {rt && (
                      <span className="ml-auto truncate text-[10px] text-muted" title={rt.version}>
                        {rt.version}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="px-5 pb-5 text-xs leading-relaxed text-muted">
              Install Python, g++ (MinGW), a JDK, Go or Rust and click Re-detect to judge those languages locally - faster and unlimited. Until then they run
              on Wandbox.
            </p>
          </Card>

          <Card>
            <CardHeader title="Database & environment" icon={Database} />
            <div className="space-y-3 p-5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">MongoDB</span>
                <Badge tone={data.db.mode === 'embedded' ? 'blue' : 'green'}>
                  {{ embedded: 'Embedded (built-in)', atlas: 'MongoDB Atlas (cloud)', external: 'External server' }[data.db.mode] || data.db.mode}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">Connection</span>
                <code className="truncate font-mono text-xs text-ink" title={data.db.uri}>
                  {data.db.uri} / {data.db.dbName}
                </code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">Mode</span>
                <Badge>{data.mode}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">Env files loaded</span>
                <code className="font-mono text-xs text-ink">{data.envFiles.join(' → ')}</code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">Timezone</span>
                <span className="text-ink">{data.timezone}</span>
              </div>
              {data.db.mode === 'embedded' && (
                <Callout tone="info" icon={Database} className="mt-2">
                  Data is stored in <code>backend/data/mongo</code>. To use your own MongoDB (local server or free Atlas cluster) set{' '}
                  <code>MONGODB_URI</code> in <code>backend/.env</code> and restart the backend.
                </Callout>
              )}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Account" icon={KeyRound} />
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-sm text-ink-2">
              There is a single admin account. Change the password by editing <code className="text-ink">ADMIN_PASSWORD</code> in{' '}
              <code className="text-ink">backend/.env</code> and restarting the backend.
            </p>
            <Button variant="danger" icon={LogOut} onClick={logout}>
              Log out
            </Button>
          </div>
        </Card>
      </div>
    </Page>
  );
}
