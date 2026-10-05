import { ChevronLeft, ChevronRight, RotateCcw, ShieldCheck, Star, Timer } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, Button, ConfirmDialog, DifficultyBadge, IconButton } from '../../components/ui';
import { http, qs } from '../../lib/api';
import { clock } from '../../lib/format';
import { localPref } from '../../lib/hooks';

const STATUS_BADGE = {
  solved: { tone: 'green', label: 'Solved' },
  attempted: { tone: 'amber', label: 'Attempted' },
  todo: { tone: 'neutral', label: 'Todo' },
};

/** Top bar shared by the coding and MCQ solvers. */
export function SolveHeader({ q, setQ, sessionSeconds }) {
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = STATUS_BADGE[q.progress?.status || 'todo'];

  const toggleStar = async () => {
    try {
      const fresh = await http.patch(`/questions/${q.id}`, { starred: !q.starred });
      setQ(fresh);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const reattempt = async () => {
    setBusy(true);
    try {
      const fresh = await http.post(`/questions/${q.id}/reset`);
      localPref.removePrefix(`cm.code.${q.id}.`);
      setConfirmReset(false);
      setQ(fresh);
      toast.success('Fresh start! Hints, solution and status were reset - history is kept.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const nextUnsolved = async () => {
    try {
      const r = await http.get(`/questions${qs({ status: 'todo', type: q.type, sort: 'oldest', pageSize: 5 })}`);
      const next = r.items.find((x) => x.id !== q.id);
      if (next) navigate(`/problems/${next.id}`);
      else toast.message('No unsolved questions left - generate some more! 🚀');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2 md:px-4">
      <Link to="/problems" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
        <ChevronLeft className="size-4" /> Problems
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-mono text-xs text-muted">#{q.id}</span>
        <h1 className="truncate text-sm font-semibold text-ink md:text-base">{q.title}</h1>
        <DifficultyBadge value={q.difficulty} />
        <Badge tone={status.tone}>{status.label}</Badge>
        {q.verified && (
          <Badge tone="green" icon={ShieldCheck} title="Test cases verified by running the reference solution" className="hidden sm:inline-flex">
            Verified tests
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="tabular inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 font-mono text-xs text-ink-2"
          title="Time spent on this question (counts while this tab is visible)"
        >
          <Timer className="size-3.5 text-violet-300" />
          {clock((q.progress?.timeSpentSec || 0) + sessionSeconds)}
        </span>
        <IconButton icon={Star} label={q.starred ? 'Unstar' : 'Star'} active={q.starred} onClick={toggleStar} />
        <Button size="sm" icon={RotateCcw} onClick={() => setConfirmReset(true)} title="Reset progress and solve again from scratch">
          Reattempt
        </Button>
        <Button size="sm" onClick={nextUnsolved}>
          Next unsolved <ChevronRight className="size-4" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={reattempt}
        busy={busy}
        title="Reattempt from scratch?"
        confirmLabel="Reset & reattempt"
      >
        Your status, revealed hints, solution access and saved code drafts for this question will be reset so you can solve it fresh. All previous
        submissions stay in your history.
      </ConfirmDialog>
    </div>
  );
}
