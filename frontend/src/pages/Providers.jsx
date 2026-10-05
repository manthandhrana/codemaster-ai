import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleDashed,
  CircleX,
  Cpu,
  ExternalLink,
  FlaskConical,
  KeyRound,
  ListChecks,
  ListRestart,
  RefreshCw,
  Save,
  Snowflake,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Callout, Card, CopyButton, Field, FullPageSpinner, Input, Page, PageHeader, Segmented, Toggle } from '../components/ui';
import { http } from '../lib/api';
import { cn, timeAgo, timeUntil } from '../lib/format';
import { useApi } from '../lib/hooks';
import { GROUPS, checkState, providerGroup } from '../lib/providers';

const TIER = {
  free: { label: 'Free', tone: 'green' },
  paid: { label: 'Paid', tone: 'amber' },
  local: { label: 'Local', tone: 'blue' },
  custom: { label: 'Custom', tone: 'violet' },
};

function statusOf(p) {
  const group = providerGroup(p);
  if (group === 'no_key' || group === 'disabled') return GROUPS.find((g) => g.key === group);
  if (p.health?.cooldownUntil) return { label: `Cooling down · ${p.health.cooldownReason}`, tone: 'amber', icon: Snowflake };
  if (group === 'untested') return { label: p.check?.stale ? 'Key/model changed - test again' : 'Not tested yet', tone: 'blue', icon: CircleDashed };
  return checkState(p);
}

/** One glance: which providers work, which fail and why, which are disabled or have no key. */
function StatusSummary({ providers }) {
  const groups = GROUPS.map((g) => ({ ...g, items: providers.filter((p) => providerGroup(p) === g.key) })).filter((g) => g.items.length);
  return (
    <Card className="mb-5 grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      {groups.map((g) => (
        <div key={g.key} className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Badge tone={g.tone} icon={g.icon}>
              {g.items.length}
            </Badge>
            {g.label}
          </p>
          <ul className="space-y-1">
            {g.items.map((p) => {
              // working: which model answered; failing/disabled: the last test's verdict
              const reason = g.key === 'working' ? p.check.model : ['failing', 'disabled'].includes(g.key) ? checkState(p)?.label : null;
              return (
                <li key={p.id} className="truncate text-xs">
                  <a href={`#provider-${p.id}`} className="text-ink-2 hover:text-ink hover:underline" title={p.check?.error || p.note}>
                    {p.name}
                  </a>
                  {reason && <span className="text-muted"> · {reason}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Card>
  );
}

function ProviderRow({ p, index, count, onMove, onChanged }) {
  const [model, setModel] = useState(p.model);
  const [maxTokens, setMaxTokens] = useState(p.maxTokens);
  const [models, setModels] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState(null);
  useEffect(() => {
    setModel(p.model);
    setMaxTokens(p.maxTokens);
  }, [p.model, p.maxTokens]);

  const st = statusOf(p);
  const verdict = checkState(p);
  const dirty = model !== p.model || Number(maxTokens) !== p.maxTokens;
  // A runtime error newer than the last test (e.g. a rate limit during generation).
  const runtimeError = p.health?.lastError && (!p.check || new Date(p.health.lastErrorAt) > new Date(p.check.at));

  const save = async (patch) => {
    setSaving(true);
    try {
      await http.put(`/providers/${p.id}`, patch);
      onChanged();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await http.post(`/providers/${p.id}/test`));
      onChanged();
    } catch (e) {
      setTest({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const r = await http.get(`/providers/${p.id}/models`);
      setModels(r.models);
      toast.message(`${r.models.length} models available - pick one from the list`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <Card id={`provider-${p.id}`} className={cn('scroll-mt-6 p-4 transition-opacity', (!p.configured || !p.enabled) && 'opacity-75')}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            className="grid size-6 place-items-center rounded text-muted hover:bg-surface-3 hover:text-ink disabled:opacity-30"
          >
            <ChevronUp className="size-4" />
          </button>
          <span className="tabular grid size-7 place-items-center rounded-lg border border-line bg-surface-2 text-xs font-bold text-ink-2">{index + 1}</span>
          <button
            type="button"
            aria-label="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(index, 1)}
            className="grid size-6 place-items-center rounded text-muted hover:bg-surface-3 hover:text-ink disabled:opacity-30"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{p.name}</h3>
            <Badge tone={TIER[p.tier]?.tone}>{TIER[p.tier]?.label}</Badge>
            <Badge tone={st.tone} icon={st.icon}>
              {st.label}
            </Badge>
            {!p.enabled && verdict && (
              <Badge tone={verdict.tone} icon={verdict.icon} title="Result of the last test">
                {verdict.label}
              </Badge>
            )}
            {p.today.calls > 0 && (
              <span className="text-[11px] text-muted">
                today: {p.today.ok}/{p.today.calls} ok
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{p.note}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <KeyRound className="size-3.5 text-muted" />
              <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink">{p.envKey}</code>
              <CopyButton text={`${p.envKey}=`} label="" />
              {p.maskedKey ? <span className="font-mono text-muted">{p.maskedKey}</span> : <span className="text-amber-300">not set</span>}
            </span>
            {p.requiredEnv.map((k) => (
              <code key={k} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink">
                {k}
              </code>
            ))}
            {p.optionalKeyEnv && <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted">{p.optionalKeyEnv} (optional)</code>}
            {p.keyUrl && (
              <a href={p.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-300 hover:underline">
                Get {p.tier === 'free' ? 'free ' : ''}key <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_120px_auto]">
            <div className="flex gap-2">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                list={`models-${p.id}`}
                placeholder={p.defaultModel || 'model id'}
                className="h-8 font-mono text-xs"
                aria-label="Model"
              />
              <datalist id={`models-${p.id}`}>{models?.map((m) => <option key={m} value={m} />)}</datalist>
              <Button size="sm" icon={ListRestart} loading={loadingModels} disabled={!p.configured} onClick={loadModels} title="Fetch the model list from the provider">
                Models
              </Button>
            </div>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              className="h-8 text-xs"
              title="Max output tokens per request"
              aria-label="Max output tokens"
            />
            <div className="flex gap-2">
              <Button size="sm" variant={dirty ? 'primary' : 'secondary'} icon={Save} loading={saving} disabled={!dirty} onClick={() => save({ model, maxTokens: Number(maxTokens) })}>
                Save
              </Button>
              {model !== p.defaultModel && (
                <Button size="sm" variant="ghost" onClick={() => save({ model: '', maxTokens: 0 })} title={`Back to ${p.defaultModel}`}>
                  Default
                </Button>
              )}
            </div>
          </div>

          <p className="mt-1.5 text-[11px] text-muted">
            Comma-separate models (e.g. <code>model-a,model-b</code>) - they are tried in order before moving to the next provider; each has its own free
            quota.
          </p>
          {p.health?.coolingModels?.length > 0 && (
            <p className="mt-1 text-[11px] text-amber-300/90">
              Cooling down:{' '}
              {p.health.coolingModels.map((m) => `${m.model} (${m.reason}, retry ${timeUntil(m.until)})`).join(' · ')}
            </p>
          )}
          {test && (
            <div
              className={cn(
                'mt-3 rounded-lg border px-3 py-2 text-xs',
                test.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-rose-500/30 bg-rose-500/5 text-rose-200',
              )}
            >
              {test.ok ? (
                <span className="flex flex-wrap items-center gap-2">
                  <CircleCheck className="size-3.5" /> Works! {test.latencyMs} ms · {test.model} · &quot;{test.reply?.message || 'ok'}&quot;
                  {test.skipped?.length > 0 && <span className="text-amber-200/80">(skipped first: {test.skipped.join(' | ')})</span>}
                </span>
              ) : (
                <span className="flex items-start gap-2">
                  <CircleX className="mt-0.5 size-3.5 shrink-0" /> {test.error}
                </span>
              )}
            </div>
          )}
          {!test && p.check && (
            <div className="mt-2 text-[11px]">
              <p className={cn('truncate', p.check.stale ? 'text-muted' : p.check.ok ? 'text-emerald-300/90' : 'text-rose-300/90')} title={p.check.error}>
                Last test {timeAgo(p.check.at)}
                {p.check.stale && ' (before the key/model changed)'}:{' '}
                {p.check.ok
                  ? `${p.check.model} answered in ${(p.check.latencyMs / 1000).toFixed(1)}s`
                  : `${verdict?.label || 'failed'} - ${p.check.error}`}
              </p>
              {!p.check.stale && verdict?.hint && <p className="mt-0.5 text-muted">{verdict.hint}</p>}
            </div>
          )}
          {!test && runtimeError && (
            <p className="mt-1 truncate text-[11px] text-amber-300/80" title={p.health.lastError}>
              Last error {timeAgo(p.health.lastErrorAt)}: {p.health.lastError}
              {p.health.cooldownUntil && ` · retry ${timeUntil(p.health.cooldownUntil)}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" icon={FlaskConical} loading={testing} disabled={!p.configured} onClick={runTest}>
            Test
          </Button>
          <Toggle checked={p.enabled} onChange={(v) => save({ enabled: v })} label={p.enabled ? 'Disable provider' : 'Enable provider'} />
        </div>
      </div>
    </Card>
  );
}

export default function Providers() {
  const { data, reload, setData } = useApi('/providers');
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  useEffect(() => {
    if (data && !settings) setSettings(data.settings);
  }, [data, settings]);

  if (!data || !settings) return <FullPageSpinner />;
  const providers = data.providers;
  const configured = providers.filter((p) => p.configured).length;
  const ready = providers.filter((p) => p.configured && p.enabled).length;
  const working = providers.filter((p) => providerGroup(p) === 'working').length;

  const testAll = async () => {
    setTestingAll(true);
    try {
      const r = await http.post('/providers/test-all');
      toast.success(`${r.working} of ${r.tested} providers with a key are working`);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTestingAll(false);
    }
  };

  const move = async (index, dir) => {
    const order = providers.map((p) => p.id);
    const j = index + dir;
    [order[index], order[j]] = [order[j], order[index]];
    setData({ ...data, providers: order.map((id) => providers.find((p) => p.id === id)) });
    try {
      await http.put('/providers/order', { order });
    } catch (e) {
      toast.error(e.message);
    }
    reload();
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const s = await http.put('/providers/settings', settings);
      setSettings(s);
      toast.success('Routing settings saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const reloadEnv = async () => {
    setReloading(true);
    try {
      const r = await http.post('/providers/reload-env');
      toast.success(`Reloaded ${r.files.join(', ')} - ${r.configured}/${r.total} providers configured`);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setReloading(false);
    }
  };

  return (
    <Page wide>
      <PageHeader
        icon={Cpu}
        title="AI Providers"
        subtitle={`${working} working · ${configured} of ${providers.length} have a key · ${ready} enabled for fallback`}
        actions={
          <>
            <Button icon={RefreshCw} loading={reloading} onClick={reloadEnv}>
              Reload .env
            </Button>
            <Button variant="primary" icon={ListChecks} loading={testingAll} disabled={!configured} onClick={testAll} title="Send one tiny request to every provider that has a key">
              {testingAll ? 'Testing…' : 'Test all'}
            </Button>
          </>
        }
      />

      <StatusSummary providers={providers} />

      <div className="mb-5 grid gap-4 xl:grid-cols-3">
        <Callout tone="violet" icon={KeyRound} title="Where do API keys go?" className="xl:col-span-2">
          Paste keys into <code>backend/.env</code> (e.g. <code>GROQ_API_KEY=gsk_…</code>) and click <strong>Reload .env</strong> - no restart needed.
          Keys never leave the server; this page only shows masked values. Loaded files: {data.envFiles.join(' → ')}.
          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs">
            <li>
              <strong>Test all</strong> sends one tiny request to every provider that has a key and remembers the result, also after a restart.
            </li>
            <li>
              <strong>Working</strong> providers are tried in the order below. <strong>Disabled</strong> ones are skipped - switch them back on after
              adding credits on the provider&apos;s website.
            </li>
            <li>
              <strong>No credits</strong>, <strong>Invalid key</strong> and <strong>Paid plan needed</strong> are fixed on the provider&apos;s website;{' '}
              <strong>Busy / rate limited</strong> is usually temporary.
            </li>
          </ul>
        </Callout>
        <Card className="p-4">
          <p className="mb-3 text-xs font-semibold text-ink">Routing strategy</p>
          <Segmented
            size="sm"
            value={settings.strategy}
            onChange={(v) => setSettings({ ...settings, strategy: v })}
            options={[
              { value: 'priority', label: 'Priority fallback' },
              { value: 'round_robin', label: 'Round robin' },
            ]}
          />
          <p className="mt-2 text-[11px] text-muted">
            {settings.strategy === 'priority'
              ? 'Always start with #1, fall back down the list on errors.'
              : 'Rotate the starting provider each request to spread free-tier limits.'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Max providers / request">
              <Input type="number" min={1} max={20} value={settings.maxAttempts} onChange={(e) => setSettings({ ...settings, maxAttempts: Number(e.target.value) })} className="h-8" />
            </Field>
            <Field label="Timeout (seconds)">
              <Input
                type="number"
                min={10}
                max={600}
                value={Math.round(settings.timeoutMs / 1000)}
                onChange={(e) => setSettings({ ...settings, timeoutMs: Number(e.target.value) * 1000 })}
                className="h-8"
              />
            </Field>
          </div>
          <Button size="sm" variant="primary" className="mt-3 w-full" loading={savingSettings} onClick={saveSettings}>
            Save routing
          </Button>
        </Card>
      </div>

      <div className="space-y-3">
        {providers.map((p, i) => (
          <ProviderRow key={p.id} p={p} index={i} count={providers.length} onMove={move} onChanged={reload} />
        ))}
      </div>
    </Page>
  );
}
