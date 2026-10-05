import { Bot, Check, CircleCheck, CircleX, Cpu, Gauge, Lightbulb, Loader2, MessageSquare, ThumbsUp, TrendingUp, TriangleAlert, X } from 'lucide-react';
import Markdown, { IOBlock } from '../../components/Markdown';
import { Badge, Button, Callout, Card } from '../../components/ui';
import { cn, EXECUTOR_LABEL, TONE_TEXT, verdictInfo } from '../../lib/format';

export function ExecutorBadge({ executor, runtime, approximate }) {
  if (!executor) return null;
  return (
    <Badge tone={approximate ? 'amber' : 'neutral'} icon={approximate ? Bot : Cpu} title={runtime || undefined}>
      {EXECUTOR_LABEL[executor] || executor}
      {runtime ? ` · ${runtime}` : ''}
      {approximate ? ' (approx.)' : ''}
    </Badge>
  );
}

/** Verdict + per-test breakdown for a run or a submission. */
export function ResultView({ result, running, onReview, onAskAi, reviewBusy, aiBusy }) {
  if (running) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-sm text-muted">
        <Loader2 className="size-6 animate-spin text-violet-400" />
        {running === 'submit' ? 'Judging against all test cases…' : 'Running your code…'}
        <span className="text-xs">Remote compilers can take a few seconds.</span>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted">
        <p>
          Press <strong className="text-ink-2">Run</strong> to test with the examples, or <strong className="text-ink-2">Submit</strong> to judge all
          hidden tests.
        </p>
      </div>
    );
  }
  if (result.error) {
    return (
      <Callout tone="bad" icon={TriangleAlert} title="Could not run the code">
        {result.error}
      </Callout>
    );
  }

  const v = verdictInfo(result.verdict);
  const visible = result.results.filter((r) => r.input !== undefined);
  const hiddenPassed = result.results.filter((r) => r.input === undefined && r.passed).length;
  const accepted = result.verdict === 'accepted';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={cn('text-lg font-bold', TONE_TEXT[v.tone])}>{v.label}</h3>
        {result.verdict !== 'compile_error' && result.verdict !== 'finished' && (
          <span className="text-sm text-ink-2">
            <strong className="text-ink">{result.passed}</strong> / {result.total} test cases passed
          </span>
        )}
        {typeof result.runtimeMs === 'number' && <span className="text-xs text-muted">Runtime {result.runtimeMs} ms</span>}
        <ExecutorBadge executor={result.executor} runtime={result.runtime} approximate={result.approximate} />
      </div>

      {result.notice && (
        <Callout tone="warn" icon={Bot}>
          {result.notice}
        </Callout>
      )}

      {result.compileError && (
        <pre className="max-h-72 overflow-auto rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-rose-200">
          {result.compileError}
        </pre>
      )}

      {visible.map((r) => (
        <div key={r.index} className="rounded-xl border border-line bg-surface-2/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs">
            {r.passed ? <CircleCheck className="size-4 text-emerald-400" /> : <CircleX className="size-4 text-rose-400" />}
            <span className="font-medium text-ink">{r.label}</span>
            {!r.passed && r.status !== 'ok' && <Badge tone="red">{verdictInfo(r.status === 'timeout' ? 'time_limit' : r.status).label}</Badge>}
            {r.hidden && <Badge tone="amber">hidden test</Badge>}
            {typeof r.timeMs === 'number' && <span className="ml-auto text-muted">{r.timeMs} ms</span>}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <IOBlock label="Input" value={r.input} />
            {r.expected !== undefined && <IOBlock label="Expected" value={r.expected} tone="good" />}
            <IOBlock label="Your output" value={r.actual} tone={r.passed || r.expected === undefined ? undefined : 'bad'} />
          </div>
          {r.note && <p className="mt-2 text-xs text-amber-200">AI note: {r.note}</p>}
          {r.stderr && (
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-rose-500/25 bg-rose-500/5 p-2 font-mono text-[11px] whitespace-pre-wrap text-rose-200">
              {r.stderr}
            </pre>
          )}
        </div>
      ))}

      {hiddenPassed > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-300">
          <Check className="size-3.5" /> {hiddenPassed} hidden test{hiddenPassed === 1 ? '' : 's'} passed
        </p>
      )}

      {result.kind === 'submit' && (
        <div className="flex flex-wrap gap-2 pt-1">
          {accepted ? (
            <Button variant="primary" size="sm" icon={MessageSquare} loading={reviewBusy} onClick={onReview}>
              Get AI interview review
            </Button>
          ) : (
            <Button size="sm" icon={Lightbulb} loading={aiBusy} onClick={onAskAi}>
              Ask AI what&apos;s wrong
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const RATING_TONE = {
  'Strong Hire': 'green',
  Hire: 'green',
  'Lean Hire': 'amber',
  'Lean No Hire': 'red',
  'No Hire': 'red',
};

export function ReviewCard({ review }) {
  if (!review) return null;
  return (
    <Card className="overflow-hidden border-violet-500/25">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-violet-500/5 px-4 py-3">
        <MessageSquare className="size-4 text-violet-300" />
        <span className="text-sm font-semibold text-ink">Interview debrief</span>
        <Badge tone={RATING_TONE[review.interviewRating] || 'neutral'}>{review.interviewRating}</Badge>
        <Badge tone="neutral" icon={Gauge}>
          Code quality {review.codeQuality}/10
        </Badge>
        <Badge tone={review.isOptimal ? 'green' : 'amber'}>{review.isOptimal ? 'Optimal' : 'Not optimal'}</Badge>
        <span className="ml-auto text-[11px] text-muted">
          Time {review.timeComplexity || '?'} · Space {review.spaceComplexity || '?'}
        </span>
      </div>
      <div className="space-y-4 p-4">
        <p className="text-sm leading-relaxed text-ink">{review.summary}</p>
        {review.correctness && (
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-2">Correctness</p>
            <Markdown>{review.correctness}</Markdown>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {review.strengths?.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <ThumbsUp className="size-3.5" /> Strengths
              </p>
              <ul className="space-y-1 text-sm text-ink-2">
                {review.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {review.improvements?.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <TrendingUp className="size-3.5" /> Improve
              </p>
              <ul className="space-y-1 text-sm text-ink-2">
                {review.improvements.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <X className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {review.optimizedApproach && (
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-2">Optimal approach</p>
            <Markdown>{review.optimizedApproach}</Markdown>
          </div>
        )}
        <p className="text-[11px] text-muted">
          Reviewed by {review.provider} · {review.model}
        </p>
      </div>
    </Card>
  );
}

export function AiHintCard({ hint, index }) {
  return (
    <div className="animate-pop rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <Bot className="size-3.5 text-violet-300" />
        <span className="font-semibold text-violet-200">AI hint {index + 1}</span>
        {hint.focus && <Badge tone="violet">{hint.focus}</Badge>}
        <span className="ml-auto text-muted">{hint.provider}</span>
      </div>
      <Markdown>{hint.hint}</Markdown>
    </div>
  );
}
