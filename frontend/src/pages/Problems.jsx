import { ChevronLeft, ChevronRight, ListChecks, Search, ShieldCheck, Sparkles, Star, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DifficultyBadge,
  EmptyState,
  IconButton,
  Page,
  PageHeader,
  Segmented,
  Select,
  StatusIcon,
} from '../components/ui';
import { useMeta } from '../context/meta';
import { http, qs } from '../lib/api';
import { cn, timeAgo } from '../lib/format';
import { useApi, useDebounced } from '../lib/hooks';

const FILTER_KEYS = ['search', 'type', 'difficulty', 'status', 'language', 'topic', 'source', 'batchDate', 'starred', 'sort', 'page'];

export default function Problems() {
  const meta = useMeta();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const page = Number(f.page) || 1;

  const setFilter = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined || v === false) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const [searchInput, setSearchInput] = useState(f.search);
  const debounced = useDebounced(searchInput, 300);
  useEffect(() => {
    if (debounced !== f.search) setFilter({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, loading, reload } = useApi(`/questions${qs({ ...f, page, pageSize: 25 })}`);
  const { data: facets } = useApi('/questions/facets');
  const [selected, setSelected] = useState(new Set());
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSelected(new Set()), [data]);

  const items = data?.items || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = FILTER_KEYS.some((k) => k !== 'sort' && k !== 'page' && f[k]);

  const toggleStar = async (q) => {
    try {
      await http.patch(`/questions/${q.id}`, { starred: !q.starred });
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      const ids = confirm === 'bulk' ? [...selected] : [confirm.id];
      const r = await http.post('/questions/bulk-delete', { ids });
      toast.success(`Deleted ${r.deleted} question${r.deleted === 1 ? '' : 's'}`);
      setConfirm(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const allChecked = items.length > 0 && items.every((q) => selected.has(q.id));

  return (
    <Page wide>
      <PageHeader
        icon={ListChecks}
        title="Problem Set"
        subtitle={data ? `${data.total} question${data.total === 1 ? '' : 's'}${hasFilters ? ' match your filters' : ' in your bank'}` : 'Loading…'}
        actions={
          <Button variant="primary" icon={Sparkles} onClick={() => navigate('/generate')}>
            Generate new
          </Button>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, topic, tag or #id"
              className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-muted focus:border-violet-500/70 focus:outline-none"
            />
          </div>
          <Segmented
            size="sm"
            value={f.type}
            onChange={(v) => setFilter({ type: v })}
            options={[
              { value: '', label: 'All' },
              { value: 'coding', label: 'Coding' },
              { value: 'mcq', label: 'MCQ' },
            ]}
          />
          <Select className="w-auto" value={f.difficulty} onChange={(e) => setFilter({ difficulty: e.target.value })} aria-label="Difficulty">
            <option value="">Any difficulty</option>
            {meta.difficulties.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
          <Select className="w-auto" value={f.status} onChange={(e) => setFilter({ status: e.target.value })} aria-label="Status">
            <option value="">Any status</option>
            <option value="todo">Todo</option>
            <option value="attempted">Attempted (reattempt)</option>
            <option value="solved">Solved</option>
          </Select>
          <Select className="w-auto" value={f.language} onChange={(e) => setFilter({ language: e.target.value })} aria-label="Language">
            <option value="">Any language</option>
            {(facets?.languages || []).map((l) => (
              <option key={l} value={l}>
                {meta.langLabel(l)}
              </option>
            ))}
          </Select>
          <Select className="w-auto max-w-48" value={f.topic} onChange={(e) => setFilter({ topic: e.target.value })} aria-label="Topic">
            <option value="">Any topic</option>
            {(facets?.topics || []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Select className="w-auto" value={f.source} onChange={(e) => setFilter({ source: e.target.value })} aria-label="Source">
            <option value="">Any source</option>
            <option value="manual">Generated manually</option>
            <option value="daily">Daily automation</option>
            <option value="sample">Samples</option>
          </Select>
          <Button size="sm" variant={f.starred ? 'secondary' : 'ghost'} icon={Star} onClick={() => setFilter({ starred: f.starred ? '' : 'true' })}>
            Starred
          </Button>
          <Select className="w-auto" value={f.sort || 'newest'} onChange={(e) => setFilter({ sort: e.target.value })} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="difficulty">Easiest first</option>
            <option value="difficulty_desc">Hardest first</option>
            <option value="recent_attempt">Recently attempted</option>
            <option value="title">Title A-Z</option>
          </Select>
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                setSearchInput('');
                setParams({}, { replace: true });
              }}
            >
              Clear
            </Button>
          )}
        </div>
        {f.batchDate && (
          <div className="mt-2 text-xs text-muted">
            Showing the daily set of <strong className="text-ink">{f.batchDate}</strong>
          </div>
        )}
      </Card>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm">
          <span className="text-violet-200">{selected.size} selected</span>
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm('bulk')}>
            Delete selected
          </Button>
        </div>
      )}

      <Card className={cn('overflow-hidden transition-opacity', loading && data && 'opacity-60')}>
        {items.length === 0 && !loading ? (
          <EmptyState
            icon={ListChecks}
            title={hasFilters ? 'No questions match these filters' : 'Your problem set is empty'}
            action={
              <Button variant="primary" icon={Sparkles} onClick={() => navigate('/generate')}>
                Generate questions
              </Button>
            }
          >
            {hasFilters ? 'Try clearing a filter.' : 'Use the AI generator to create coding problems and MCQs.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(items.map((q) => q.id)))}
                      className="accent-violet-500"
                    />
                  </th>
                  <th className="w-10 px-2 py-3">Status</th>
                  <th className="px-3 py-3">Title</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Difficulty</th>
                  <th className="px-3 py-3">Topic</th>
                  <th className="px-3 py-3">Language</th>
                  <th className="px-3 py-3 text-right">Attempts</th>
                  <th className="px-3 py-3">Added</th>
                  <th className="w-24 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => navigate(`/problems/${q.id}`)}
                    className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${q.title}`}
                        checked={selected.has(q.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(q.id)) next.delete(q.id);
                          else next.add(q.id);
                          setSelected(next);
                        }}
                        className="accent-violet-500"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <StatusIcon status={q.progress?.status} />
                    </td>
                    <td className="max-w-md px-3 py-3">
                      <Link to={`/problems/${q.id}`} className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="font-mono text-xs text-muted">#{q.id}</span>
                        <span className="truncate font-medium text-ink hover:text-violet-200">{q.title}</span>
                        {q.verified && <ShieldCheck className="size-3.5 shrink-0 text-emerald-400" aria-label="Verified tests" />}
                      </Link>
                      {q.tags?.length > 0 && <p className="mt-0.5 truncate text-[11px] text-muted">{q.tags.join(' · ')}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={q.type === 'mcq' ? 'blue' : 'violet'}>{q.type === 'mcq' ? 'MCQ' : 'Coding'}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <DifficultyBadge value={q.difficulty} />
                    </td>
                    <td className="max-w-40 truncate px-3 py-3 text-ink-2">{q.topic || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-ink-2">{meta.langLabel(q.language)}</td>
                    <td className="tabular px-3 py-3 text-right text-ink-2">{q.progress?.attempts || 0}</td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap text-muted">
                      {timeAgo(q.createdAt)}
                      {q.source === 'daily' && (
                        <Badge tone="amber" className="ml-1.5">
                          Daily
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Star} label={q.starred ? 'Unstar' : 'Star'} active={q.starred} onClick={() => toggleStar(q)} />
                        <IconButton icon={Trash2} label="Delete" className="hover:text-rose-300" onClick={() => setConfirm(q)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setFilter({ page: page - 1 })}>
              Previous
            </Button>
            <Button size="sm" disabled={page >= totalPages} onClick={() => setFilter({ page: page + 1 })}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={doDelete}
        busy={busy}
        danger
        title={confirm === 'bulk' ? `Delete ${selected.size} questions?` : 'Delete this question?'}
        confirmLabel="Delete"
      >
        {confirm === 'bulk' ? 'The selected questions' : <strong className="text-ink">{confirm?.title}</strong>} and all their submissions will be
        permanently removed.
      </ConfirmDialog>
    </Page>
  );
}
