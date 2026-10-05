import {
  BookOpen,
  Bot,
  Eye,
  FlaskConical,
  History,
  Lightbulb,
  Lock,
  MessageSquare,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Tag,
  Terminal,
  Wand2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import CodeEditor from '../../components/CodeEditor';
import Markdown, { IOBlock } from '../../components/Markdown';
import { Badge, Button, Callout, Chip, ConfirmDialog, CopyButton, EmptyState, Kbd, Select, Tabs, Textarea } from '../../components/ui';
import { useMeta } from '../../context/meta';
import { http } from '../../lib/api';
import { cn, timeAgo, TONE_TEXT, verdictInfo } from '../../lib/format';
import { localPref, useApi, useStopwatch } from '../../lib/hooks';
import { AiHintCard, ExecutorBadge, ResultView, ReviewCard } from './parts';
import { SolveHeader } from './SolveHeader';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Pointer-drag helper for the split panes. */
function startDrag(e, axis, container, onMove) {
  e.preventDefault();
  const rect = container.getBoundingClientRect();
  const move = (ev) => {
    const pct = axis === 'x' ? ((ev.clientX - rect.left) / rect.width) * 100 : ((ev.clientY - rect.top) / rect.height) * 100;
    onMove(pct);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
  document.body.style.userSelect = 'none';
}

const fence = (code, lang) => {
  const ticks = code.includes('```') ? '````' : '```';
  return `${ticks}${lang}\n${code.replace(/\n$/, '')}\n${ticks}`;
};

export default function CodingSolve({ q, setQ }) {
  const meta = useMeta();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [seconds, setSeconds] = useStopwatch(true);

  // ---- editor state (drafts are saved per question + language in this browser)
  const starterFor = useCallback(
    (l) => q.starterCodes?.[l] || (l === q.language ? q.starterCode : meta.boilerplate(l)),
    [q.starterCodes, q.language, q.starterCode, meta],
  );
  const [lang, setLang] = useState(() => localPref.get(`cm.lang.${q.id}`, q.language));
  const [code, setCode] = useState(() => localPref.get(`cm.code.${q.id}.${lang}`, null) ?? starterFor(lang));
  useEffect(() => {
    const t = setTimeout(() => localPref.set(`cm.code.${q.id}.${lang}`, code), 400);
    return () => clearTimeout(t);
  }, [code, lang, q.id]);

  const [leftTab, setLeftTab] = useState('description');
  const [consoleTab, setConsoleTab] = useState('tests');
  const [activeCase, setActiveCase] = useState(0);
  const [customInput, setCustomInput] = useState(q.examples?.[0]?.input || '');
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [aiHints, setAiHints] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [starterBusy, setStarterBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'reveal' | 'resetCode'
  const [showTags, setShowTags] = useState(false);
  const subs = useApi(`/questions/${q.id}/submissions`);

  // ---- split panes
  const rowRef = useRef(null);
  const rightRef = useRef(null);
  const [leftPct, setLeftPct] = useState(() => localPref.get('cm.split.x', 44));
  const [editorPct, setEditorPct] = useState(() => localPref.get('cm.split.y', 62));
  useEffect(() => {
    const t = setTimeout(() => {
      localPref.set('cm.split.x', leftPct);
      localPref.set('cm.split.y', editorPct);
    }, 300);
    return () => clearTimeout(t);
  }, [leftPct, editorPct]);

  // "Reattempt" resets progress on the server and clears drafts: start fresh here too.
  const resetsRef = useRef(q.progress?.resets || 0);
  useEffect(() => {
    const r = q.progress?.resets || 0;
    if (r === resetsRef.current) return;
    resetsRef.current = r;
    setCode(starterFor(lang));
    setResult(null);
    setAiHints([]);
    setReview(null);
    setLeftTab('description');
    setSeconds(0);
    subs.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.progress?.resets]);

  const langInfo = meta.language(lang);
  const untouched = !code.trim() || code.trim() === meta.boilerplate(lang).trim();
  const canTranslate = lang !== q.language && !q.starterCodes?.[lang];

  const switchLang = (l) => {
    localPref.set(`cm.code.${q.id}.${lang}`, code);
    localPref.set(`cm.lang.${q.id}`, l);
    setLang(l);
    setCode(localPref.get(`cm.code.${q.id}.${l}`, null) ?? starterFor(l));
  };

  const run = async () => {
    if (running) return;
    const custom = activeCase === 'custom';
    setRunning('run');
    setConsoleTab('result');
    try {
      const r = await http.post(`/questions/${q.id}/run`, { language: lang, code, customInput: custom ? customInput : undefined });
      setResult({ ...r, kind: 'run' });
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setRunning(null);
    }
  };

  const submit = async () => {
    if (running) return;
    setRunning('submit');
    setConsoleTab('result');
    try {
      const r = await http.post(`/questions/${q.id}/submit`, { language: lang, code, timeSpentSec: seconds });
      setSeconds(0);
      setResult({ ...r, kind: 'submit' });
      setQ((prev) => ({ ...prev, progress: r.progress }));
      subs.reload();
      if (r.verdict === 'accepted') toast.success(`Accepted! ${r.passed}/${r.total} tests passed 🎉`);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setRunning(null);
    }
  };

  const revealHint = async () => {
    try {
      const r = await http.post(`/questions/${q.id}/hint`);
      setQ((prev) => ({ ...prev, hints: r.hints, progress: { ...prev.progress, hintsUsed: r.hints.length } }));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const askAi = async () => {
    setAiBusy(true);
    setLeftTab('hints');
    try {
      const h = await http.post(`/questions/${q.id}/ai-hint`, { language: lang, code });
      setAiHints((prev) => [...prev, h]);
      setQ((prev) => ({ ...prev, progress: { ...prev.progress, aiHints: (prev.progress?.aiHints || 0) + 1 } }));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const getReview = async (submissionId) => {
    setReviewBusy(true);
    try {
      const body = submissionId ? { submissionId } : { language: lang, code, verdict: result?.verdict };
      const r = await http.post(`/questions/${q.id}/review`, body);
      setReview(r);
      setLeftTab('review');
      subs.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setReviewBusy(false);
    }
  };

  const revealSolution = async () => {
    try {
      const s = await http.post(`/questions/${q.id}/reveal`);
      setQ((prev) => ({ ...prev, solution: s, progress: { ...prev.progress, solutionViewed: true } }));
      setConfirm(null);
      setLeftTab('solution');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const translateStarter = async () => {
    setStarterBusy(true);
    try {
      const r = await http.post(`/questions/${q.id}/starter`, { language: lang });
      setQ((prev) => ({ ...prev, starterCodes: { ...prev.starterCodes, [lang]: r.starterCode } }));
      if (untouched) setCode(r.starterCode);
      else toast.message('Starter template ready - use "Reset code" to load it.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setStarterBusy(false);
    }
  };

  const loadSubmission = async (id) => {
    try {
      const s = await http.get(`/submissions/${id}`);
      if (s.language !== lang) {
        localPref.set(`cm.code.${q.id}.${lang}`, code);
        localPref.set(`cm.lang.${q.id}`, s.language);
        setLang(s.language);
      }
      setCode(s.code || '');
      toast.message(`Loaded submission #${s.id} into the editor`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const status = q.progress?.status;
  const monacoLang = meta.monaco(lang);

  // ------------------------------------------------------------------ left panel
  const leftTabs = [
    { value: 'description', label: 'Description', icon: BookOpen },
    { value: 'hints', label: 'Hints', icon: Lightbulb, badge: `${q.hints.length}/${q.hintsTotal}` },
    { value: 'solution', label: 'Solution', icon: q.solution ? Eye : Lock },
    { value: 'submissions', label: 'Submissions', icon: History, badge: subs.data?.items?.length || null },
    ...(review ? [{ value: 'review', label: 'AI Review', icon: MessageSquare }] : []),
  ];

  const description = (
    <article>
      <h2 className="text-xl font-bold text-ink">
        {q.id}. {q.title}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Reference: {meta.langLabel(q.language)}</Badge>
        {q.source === 'daily' && <Badge tone="amber">Daily set · {q.batchDate}</Badge>}
        {q.verification?.status === 'verified' && (
          <Badge tone="green" icon={ShieldCheck} title={q.verification.by}>
            Tests verified
          </Badge>
        )}
        {q.tags?.length > 0 && (
          <button type="button" onClick={() => setShowTags((s) => !s)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink-2">
            <Tag className="size-3" /> {showTags ? 'Hide topics' : 'Show topics'}
          </button>
        )}
        {showTags && q.tags.map((t) => <Badge key={t}>{t}</Badge>)}
      </div>

      <Markdown className="mt-5">{q.description}</Markdown>

      {q.inputFormat && (
        <section className="mt-5">
          <h3 className="mb-1.5 text-sm font-semibold text-ink">Input</h3>
          <Markdown>{q.inputFormat}</Markdown>
        </section>
      )}
      {q.outputFormat && (
        <section className="mt-4">
          <h3 className="mb-1.5 text-sm font-semibold text-ink">Output</h3>
          <Markdown>{q.outputFormat}</Markdown>
        </section>
      )}

      {q.examples.map((ex, i) => (
        <section key={i} className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Example {i + 1}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <IOBlock label="Input" value={ex.input} />
            <IOBlock label="Output" value={ex.output} />
          </div>
          {ex.explanation && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Explanation</p>
              <Markdown>{ex.explanation}</Markdown>
            </div>
          )}
        </section>
      ))}

      {q.constraints?.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">Constraints</h3>
          <ul className="space-y-1.5">
            {q.constraints.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-muted">•</span>
                <code className="rounded-md border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{c}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q.followUps?.length > 0 && (
        <details className="mt-5 rounded-xl border border-line bg-surface-2/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Follow-up questions (interviewer style)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {q.followUps.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-6 border-t border-line pt-3 text-[11px] text-muted">
        {q.hiddenTestCount} hidden tests · generated by {q.provider} ({q.model}) · added {timeAgo(q.createdAt)}
      </p>
    </article>
  );

  const hintsPanel = (
    <div className="space-y-3">
      <Callout tone="violet" icon={Lightbulb}>
        Hints unlock one at a time. Solving after a hint, AI help or the solution counts as an <strong>assisted</strong> solve on your dashboard.
      </Callout>
      {q.hints.map((h, i) => (
        <div key={i} className="animate-pop rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-300">Hint {i + 1}</p>
          <Markdown>{h}</Markdown>
        </div>
      ))}
      {q.hints.length < q.hintsTotal ? (
        <Button icon={Eye} onClick={revealHint}>
          Reveal hint {q.hints.length + 1} of {q.hintsTotal}
        </Button>
      ) : (
        <p className="text-xs text-muted">All {q.hintsTotal} hints revealed.</p>
      )}
      <div className="border-t border-line pt-4">
        <p className="text-sm font-semibold text-ink">Stuck on your own code?</p>
        <p className="mt-0.5 mb-3 text-xs text-muted">The AI reads your current code and gives one targeted nudge - never the full solution.</p>
        <Button icon={Bot} loading={aiBusy} onClick={askAi}>
          Ask AI for a hint
        </Button>
      </div>
      {aiHints.map((h, i) => (
        <AiHintCard key={i} hint={h} index={i} />
      ))}
      <p className="pt-2 text-[11px] text-muted">
        On this problem: {q.progress?.hintsUsed || 0} hints · {q.progress?.aiHints || 0} AI hints · {q.progress?.aiReviews || 0} AI reviews
        {q.progress?.solutionViewed ? ' · solution viewed' : ''}
      </p>
    </div>
  );

  const solutionPanel = q.solution ? (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {q.solution.complexity?.time && <Badge tone="blue">Time {q.solution.complexity.time}</Badge>}
        {q.solution.complexity?.space && <Badge tone="blue">Space {q.solution.complexity.space}</Badge>}
        {q.pattern && <Badge tone="violet">Pattern: {q.pattern}</Badge>}
      </div>
      <Markdown>{q.solution.approach || '_No editorial provided._'}</Markdown>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Reference solution · {meta.langLabel(q.solution.language)}</p>
          <CopyButton text={q.solution.solutionCode} />
        </div>
        <Markdown>{fence(q.solution.solutionCode, meta.monaco(q.solution.language))}</Markdown>
      </div>
    </div>
  ) : (
    <EmptyState
      icon={Lock}
      title="Solution is locked"
      action={
        <Button icon={Eye} onClick={() => (status === 'solved' ? revealSolution() : setConfirm('reveal'))}>
          Reveal solution
        </Button>
      }
    >
      {status === 'solved'
        ? 'You solved it - compare your code with the reference solution and editorial.'
        : 'Try the hints first. Revealing the solution before solving marks this problem as assisted.'}
    </EmptyState>
  );

  const submissionsPanel = subs.data?.items?.length ? (
    <div className="space-y-2">
      {subs.data.items.map((s) => {
        const v = verdictInfo(s.verdict);
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
            <span className={cn('w-36 text-sm font-semibold', TONE_TEXT[v.tone])}>{v.label}</span>
            <span className="text-xs text-ink-2">{meta.langLabel(s.language)}</span>
            <span className="tabular text-xs text-muted">
              {s.passed}/{s.total}
            </span>
            {typeof s.runtimeMs === 'number' && <span className="tabular text-xs text-muted">{s.runtimeMs} ms</span>}
            <ExecutorBadge executor={s.executor} approximate={s.approximate} />
            <span className="ml-auto text-xs text-muted">{timeAgo(s.createdAt)}</span>
            <Button size="xs" onClick={() => loadSubmission(s.id)}>
              Load code
            </Button>
            <Button size="xs" icon={MessageSquare} onClick={() => getReview(s.id)} loading={reviewBusy}>
              {s.hasReview ? 'Review' : 'AI review'}
            </Button>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-muted">Every attempt is stored in MongoDB - reattempt as many times as you like.</p>
    </div>
  ) : (
    <EmptyState icon={History} title="No submissions yet">
      Your attempts will appear here with verdicts, runtime and code.
    </EmptyState>
  );

  const leftContent = {
    description,
    hints: hintsPanel,
    solution: solutionPanel,
    submissions: submissionsPanel,
    review: <ReviewCard review={review} />,
  }[leftTab];

  // ------------------------------------------------------------------ console
  const cases = q.examples || [];
  const testcases = (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {cases.map((_, i) => (
          <Chip key={i} active={activeCase === i} onClick={() => setActiveCase(i)}>
            Case {i + 1}
          </Chip>
        ))}
        <Chip active={activeCase === 'custom'} onClick={() => setActiveCase('custom')}>
          Custom input
        </Chip>
      </div>
      {activeCase === 'custom' ? (
        <div>
          <Textarea
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            rows={6}
            spellCheck={false}
            className="font-mono text-[12.5px]"
            aria-label="Custom input"
          />
          <p className="mt-1.5 text-[11px] text-muted">Run uses this input. The expected output is computed by running the reference solution.</p>
        </div>
      ) : cases[activeCase] ? (
        <div className="grid gap-3 md:grid-cols-2">
          <IOBlock label="Input" value={cases[activeCase].input} />
          <IOBlock label="Expected output" value={cases[activeCase].output} />
        </div>
      ) : null}
    </div>
  );

  const runnable = langInfo?.local ? { text: 'Runs locally', tone: 'green' } : langInfo?.runnable ? { text: 'Online compiler', tone: 'blue' } : { text: 'AI-judged', tone: 'amber' };

  return (
    <div className="flex h-full flex-col">
      <SolveHeader q={q} setQ={setQ} sessionSeconds={seconds} />
      <div ref={rowRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* problem panel */}
        <section className="flex min-h-0 flex-col border-line bg-surface/40 lg:border-r" style={isDesktop ? { width: `${leftPct}%` } : undefined}>
          <Tabs tabs={leftTabs} value={leftTab} onChange={setLeftTab} className="shrink-0 bg-surface" />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{leftContent}</div>
        </section>

        {isDesktop && (
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => startDrag(e, 'x', rowRef.current, (p) => setLeftPct(Math.min(70, Math.max(25, p))))}
            className="w-1 shrink-0 cursor-col-resize bg-line transition-colors hover:bg-violet-500/60"
          />
        )}

        {/* editor + console */}
        <section ref={rightRef} className="flex min-w-0 flex-1 flex-col border-t border-line lg:min-h-0 lg:border-t-0">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
            <Select value={lang} onChange={(e) => switchLang(e.target.value)} className="h-8 w-auto text-xs" aria-label="Language">
              {meta.codingLanguages.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
            <Badge tone={runnable.tone} title="Where your code will be executed">
              {runnable.text}
            </Badge>
            {canTranslate && (
              <Button size="xs" icon={Wand2} loading={starterBusy} onClick={translateStarter} title="Generate a starter template for this language with AI">
                AI starter
              </Button>
            )}
            <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => setConfirm('resetCode')}>
              Reset code
            </Button>
            <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted xl:flex">
              <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> run · <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> submit
            </span>
          </div>

          <div className="min-h-0 shrink-0" style={{ height: isDesktop ? `${editorPct}%` : 440 }}>
            <CodeEditor value={code} onChange={setCode} language={monacoLang} onRun={run} onSubmit={submit} />
          </div>

          {isDesktop && (
            <div
              role="separator"
              aria-orientation="horizontal"
              onPointerDown={(e) => startDrag(e, 'y', rightRef.current, (p) => setEditorPct(Math.min(80, Math.max(25, p))))}
              className="h-1 shrink-0 cursor-row-resize bg-line transition-colors hover:bg-violet-500/60"
            />
          )}

          <div className="flex min-h-72 flex-1 flex-col bg-surface/60 lg:min-h-0">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line pr-2">
              <Tabs
                className="border-b-0"
                value={consoleTab}
                onChange={setConsoleTab}
                tabs={[
                  { value: 'tests', label: 'Testcases', icon: FlaskConical },
                  {
                    value: 'result',
                    label: 'Result',
                    icon: Terminal,
                    badge: result && !result.error && result.total ? `${result.passed}/${result.total}` : null,
                  },
                ]}
              />
              <div className="flex gap-2">
                <Button size="sm" icon={Play} loading={running === 'run'} disabled={Boolean(running)} onClick={run}>
                  Run
                </Button>
                <Button size="sm" variant="success" icon={Send} loading={running === 'submit'} disabled={Boolean(running)} onClick={submit}>
                  Submit
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {consoleTab === 'tests' ? (
                testcases
              ) : (
                <ResultView
                  result={result}
                  running={running}
                  onReview={() => getReview(result?.submissionId)}
                  reviewBusy={reviewBusy}
                  onAskAi={askAi}
                  aiBusy={aiBusy}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirm === 'reveal'}
        onClose={() => setConfirm(null)}
        onConfirm={revealSolution}
        title="Reveal the solution?"
        confirmLabel="Reveal solution"
      >
        You haven&apos;t solved this problem yet. Revealing the solution marks it as <strong className="text-ink">assisted</strong>. You can always
        use <strong className="text-ink">Reattempt</strong> later to solve it again from scratch.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'resetCode'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setCode(starterFor(lang));
          setConfirm(null);
        }}
        title="Reset code?"
        confirmLabel="Reset to starter"
        danger
      >
        Your current {meta.langLabel(lang)} code for this problem will be replaced with the starter template.
      </ConfirmDialog>
    </div>
  );
}
