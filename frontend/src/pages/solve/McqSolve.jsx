import { Bot, CircleCheck, CircleX, Eye, Lightbulb, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Markdown from '../../components/Markdown';
import { Badge, Button, Callout, Card, ConfirmDialog, DifficultyBadge } from '../../components/ui';
import { useMeta } from '../../context/meta';
import { http } from '../../lib/api';
import { cn, fmtDuration } from '../../lib/format';
import { useStopwatch } from '../../lib/hooks';
import { AiHintCard } from './parts';
import { SolveHeader } from './SolveHeader';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function McqSolve({ q, setQ }) {
  const meta = useMeta();
  const [seconds, setSeconds] = useStopwatch(true);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiHints, setAiHints] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [shake, setShake] = useState(0);

  const resetsRef = useRef(q.progress?.resets || 0);
  useEffect(() => {
    const r = q.progress?.resets || 0;
    if (r === resetsRef.current) return;
    resetsRef.current = r;
    setSelected(null);
    setFeedback(null);
    setAiHints([]);
    setSeconds(0);
  }, [q.progress?.resets, setSeconds]);

  const tried = new Set(q.triedOptions || []);
  const answer = q.answer;
  const revealed = Boolean(answer);

  const submit = async () => {
    if (selected === null || busy) return;
    setBusy(true);
    try {
      const r = await http.post(`/questions/${q.id}/answer`, { answer: selected, timeSpentSec: seconds });
      setSeconds(0);
      setFeedback(r);
      setQ((prev) => ({
        ...prev,
        progress: r.progress,
        triedOptions: [...new Set([...(prev.triedOptions || []), selected])],
        answer: r.correct ? { correctIndex: r.correctIndex, explanation: r.explanation } : prev.answer,
      }));
      if (r.correct) toast.success('Correct! 🎉');
      else {
        setShake((k) => k + 1);
        setSelected(null);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
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
    try {
      const h = await http.post(`/questions/${q.id}/ai-hint`, {});
      setAiHints((prev) => [...prev, h]);
      setQ((prev) => ({ ...prev, progress: { ...prev.progress, aiHints: (prev.progress?.aiHints || 0) + 1 } }));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const reveal = async () => {
    try {
      const a = await http.post(`/questions/${q.id}/reveal`);
      setQ((prev) => ({ ...prev, answer: a, progress: { ...prev.progress, solutionViewed: true } }));
      setConfirmReveal(false);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const optionState = (i) => {
    if (revealed) {
      if (i === answer.correctIndex) return 'correct';
      if (tried.has(i)) return 'wrong';
      return 'dim';
    }
    if (tried.has(i)) return 'wrong';
    if (selected === i) return 'selected';
    return 'idle';
  };

  const OPTION_STYLE = {
    idle: 'border-line bg-surface-2/60 hover:border-line-strong hover:bg-surface-2',
    selected: 'border-violet-500/70 bg-violet-500/10 ring-2 ring-violet-500/25',
    wrong: 'border-rose-500/40 bg-rose-500/5 opacity-80',
    correct: 'border-emerald-500/60 bg-emerald-500/10 ring-2 ring-emerald-500/20',
    dim: 'border-line bg-surface-2/30 opacity-60',
  };

  return (
    <div className="flex h-full flex-col">
      <SolveHeader q={q} setQ={setQ} sessionSeconds={seconds} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Card className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">MCQ</Badge>
              <DifficultyBadge value={q.difficulty} />
              <Badge>{meta.langLabel(q.language)}</Badge>
              {q.topic && <Badge>{q.topic}</Badge>}
            </div>
            <Markdown className="mt-5 text-[15px]">{q.question}</Markdown>

            <div key={shake} className={cn('mt-6 space-y-2.5', shake > 0 && 'animate-shake')} role="radiogroup" aria-label="Options">
              {q.options.map((opt, i) => {
                const st = optionState(i);
                const disabled = revealed || tried.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={selected === i}
                    disabled={disabled}
                    onClick={() => setSelected(i)}
                    className={cn('flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all disabled:cursor-default', OPTION_STYLE[st])}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-bold',
                        st === 'correct'
                          ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                          : st === 'wrong'
                            ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                            : st === 'selected'
                              ? 'border-violet-500/60 bg-violet-500/25 text-violet-100'
                              : 'border-line-strong bg-surface-3 text-ink-2',
                      )}
                    >
                      {LETTERS[i]}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <Markdown className="text-sm text-ink">{opt}</Markdown>
                    </div>
                    {st === 'correct' && <CircleCheck className="mt-1 size-5 shrink-0 text-emerald-400" />}
                    {st === 'wrong' && <CircleX className="mt-1 size-5 shrink-0 text-rose-400" />}
                  </button>
                );
              })}
            </div>

            {feedback && !feedback.correct && !revealed && (
              <Callout tone="bad" icon={CircleX} className="mt-4" title="Not quite - try again!">
                That option is marked above. Use a hint if you&apos;re stuck.
              </Callout>
            )}

            {!revealed && (
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Button variant="primary" icon={Send} disabled={selected === null} loading={busy} onClick={submit}>
                  Submit answer
                </Button>
                {q.hints.length < q.hintsTotal && (
                  <Button icon={Lightbulb} onClick={revealHint}>
                    Hint ({q.hints.length}/{q.hintsTotal})
                  </Button>
                )}
                <Button icon={Bot} loading={aiBusy} onClick={askAi}>
                  Explain the concept
                </Button>
                <Button variant="ghost" icon={Eye} onClick={() => setConfirmReveal(true)} className="ml-auto">
                  Reveal answer
                </Button>
              </div>
            )}

            {revealed && (
              <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <CircleCheck className="size-4" />
                  {q.progress?.status === 'solved' ? 'Solved' : 'Answer revealed'} - correct answer: {LETTERS[answer.correctIndex]}
                </p>
                <Markdown>{answer.explanation}</Markdown>
              </div>
            )}
          </Card>

          {(q.hints.length > 0 || aiHints.length > 0) && (
            <div className="mt-4 space-y-3">
              {q.hints.map((h, i) => (
                <div key={i} className="animate-pop rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="mb-1 text-xs font-semibold text-amber-300">Hint {i + 1}</p>
                  <Markdown>{h}</Markdown>
                </div>
              ))}
              {aiHints.map((h, i) => (
                <AiHintCard key={i} hint={h} index={i} />
              ))}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted">
            Attempts: {q.progress?.attempts || 0} · Time on this question: {fmtDuration((q.progress?.timeSpentSec || 0) + seconds)} · Every answer is
            saved - use Reattempt to try it fresh later.
          </p>
        </div>
      </div>

      <ConfirmDialog open={confirmReveal} onClose={() => setConfirmReveal(false)} onConfirm={reveal} title="Reveal the answer?" confirmLabel="Reveal">
        The correct option and explanation will be shown and this question will count as assisted. You can reattempt it from scratch anytime.
      </ConfirmDialog>
    </div>
  );
}
