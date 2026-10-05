import { CircleCheck, CircleX, ExternalLink, Loader2, ShieldCheck, Square, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { http } from '../lib/api';
import { cn, fmtDateTime, fmtDuration } from '../lib/format';
import { Badge, Button, DifficultyBadge } from './ui';

export const JOB_STATUS = {
  queued: { label: 'Queued', tone: 'neutral' },
  running: { label: 'Running', tone: 'violet' },
  completed: { label: 'Completed', tone: 'green' },
  partial: { label: 'Partially done', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const LEVEL_STYLE = {
  info: 'text-ink-2',
  success: 'text-emerald-300',
  warn: 'text-amber-300',
  error: 'text-rose-300',
};

const isActive = (job) => job && ['queued', 'running'].includes(job.status);

/** Polls a generation job until it finishes. */
export function useJob(jobId, onFinish) {
  const [job, setJob] = useState(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return undefined;
    }
    let alive = true;
    let timer = null;
    const tick = async () => {
      try {
        const j = await http.get(`/jobs/${jobId}`);
        if (!alive) return;
        setJob(j);
        if (isActive(j)) timer = setTimeout(tick, 1200);
        else finishRef.current?.(j);
      } catch {
        if (alive) timer = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobId]);
  return job;
}

export default function JobPanel({ job, className }) {
  const logRef = useRef(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.logs?.length]);

  if (!job) return null;
  const st = JOB_STATUS[job.status] || { label: job.status, tone: 'neutral' };
  const processed = job.done + job.failed;
  const ratio = job.total ? processed / job.total : 0;
  const elapsed = job.startedAt ? ((job.finishedAt ? new Date(job.finishedAt) : new Date()) - new Date(job.startedAt)) / 1000 : 0;

  const cancel = async () => {
    setCancelling(true);
    try {
      await http.post(`/jobs/${job.id}/cancel`);
      toast.message('Cancelling after the current question…');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isActive(job) ? (
            <Loader2 className="size-4 animate-spin text-violet-300" />
          ) : job.status === 'completed' ? (
            <CircleCheck className="size-4 text-emerald-400" />
          ) : job.status === 'failed' ? (
            <CircleX className="size-4 text-rose-400" />
          ) : (
            <TriangleAlert className="size-4 text-amber-400" />
          )}
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-xs text-muted">
            {job.done} generated · {job.failed} failed · {job.total} total
            {elapsed > 0 && ` · ${fmtDuration(elapsed)}`}
          </span>
        </div>
        {isActive(job) && (
          <Button size="xs" variant="danger" icon={Square} loading={cancelling} onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', job.failed && !job.done ? 'bg-rose-500' : 'bg-gradient-to-r from-violet-500 to-cyan-400')}
          style={{ width: `${Math.max(isActive(job) ? 4 : 0, ratio * 100)}%` }}
        />
      </div>

      <div ref={logRef} className="mt-4 max-h-80 min-h-40 overflow-y-auto rounded-xl border border-line bg-editor p-3 font-mono text-[12px] leading-relaxed">
        {job.logs?.length ? (
          job.logs.map((l, i) => (
            <div key={i} className={cn('flex gap-2', LEVEL_STYLE[l.level] || 'text-ink-2')}>
              <span className="shrink-0 text-muted">{new Date(l.t).toLocaleTimeString(undefined, { hour12: false })}</span>
              <span className="min-w-0 break-words">{l.msg}</span>
            </div>
          ))
        ) : (
          <p className="text-muted">Waiting for the job to start…</p>
        )}
      </div>

      {job.questions?.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-2">Generated questions</p>
          <div className="space-y-1.5">
            {job.questions.map((q) => (
              <Link
                key={q.id}
                to={`/problems/${q.id}`}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm hover:border-violet-500/40 hover:bg-surface-3"
              >
                <span className="font-mono text-xs text-muted">#{q.id}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{q.title}</span>
                {q.verified && (
                  <Badge tone="green" icon={ShieldCheck} title="Test cases verified by running the reference solution">
                    Verified
                  </Badge>
                )}
                <DifficultyBadge value={q.difficulty} />
                <ExternalLink className="size-3.5 text-muted" />
              </Link>
            ))}
          </div>
        </div>
      )}
      {job.error && <p className="mt-3 text-xs text-rose-300">{job.error}</p>}
      <p className="mt-3 text-[11px] text-muted">Started {fmtDateTime(job.startedAt || job.createdAt)}</p>
    </div>
  );
}
