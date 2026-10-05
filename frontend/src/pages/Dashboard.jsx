import {
  ArrowRight,
  BarChart3,
  Brain,
  CalendarDays,
  Flame,
  History,
  LayoutDashboard,
  ListChecks,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Heatmap from '../components/Heatmap';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DIFFICULTY,
  DifficultyBadge,
  EmptyState,
  ErrorState,
  FullPageSpinner,
  Meter,
  Page,
  PageHeader,
  StatTile,
  StatusIcon,
} from '../components/ui';
import { useMeta } from '../context/meta';
import { compact, fmtDuration, pct, timeAgo, TONE_TEXT, verdictInfo } from '../lib/format';
import { useApi } from '../lib/hooks';

const ORDER = ['easy', 'medium', 'hard', 'very_hard'];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function QuestionRow({ q, right }) {
  return (
    <Link to={`/problems/${q.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
      <StatusIcon status={q.progress?.status} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{q.title}</span>
      <Badge tone="neutral">{q.type === 'mcq' ? 'MCQ' : 'Code'}</Badge>
      <DifficultyBadge value={q.difficulty} />
      {right}
    </Link>
  );
}

export default function Dashboard() {
  const { data: s, error, reload } = useApi('/stats/overview');
  const meta = useMeta();
  const navigate = useNavigate();
  const providerName = (id) => meta.providers.find((p) => p.id === id)?.name || id;

  if (error && !s) return <ErrorState error={error} onRetry={reload} />;
  if (!s) return <FullPageSpinner label="Loading your progress…" />;

  const aiTodayRate = s.ai.today.calls ? s.ai.today.ok / s.ai.today.calls : 0;
  const maxProviderCalls = Math.max(1, ...s.ai.last30.map((p) => p.calls));

  return (
    <Page>
      <PageHeader
        icon={LayoutDashboard}
        title={`${greeting()}, Admin`}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <>
            <Button icon={Target} onClick={() => navigate('/problems?status=todo')}>
              Practice unsolved
            </Button>
            <Button variant="primary" icon={Sparkles} onClick={() => navigate('/generate')}>
              Generate questions
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Problems solved"
          value={s.totals.solved}
          sub={`of ${s.totals.questions} questions · ${s.totals.attempted} in progress`}
          icon={Trophy}
          accent="text-emerald-400"
        />
        <StatTile
          label="Acceptance rate"
          value={pct(s.submissions.acceptanceRate)}
          sub={`${s.submissions.accepted} of ${s.submissions.total} submissions accepted`}
          icon={Target}
          accent="text-sky-400"
        />
        <StatTile
          label="Current streak"
          value={`${s.streak.current} day${s.streak.current === 1 ? '' : 's'}`}
          sub={`Longest streak: ${s.streak.longest} day${s.streak.longest === 1 ? '' : 's'}`}
          icon={Flame}
          accent="text-amber-400"
        />
        <StatTile
          label="AI calls today"
          value={s.ai.today.calls}
          sub={s.ai.today.calls ? `${pct(aiTodayRate)} success · ${compact(s.ai.today.tokens)} tokens` : 'No AI requests yet today'}
          icon={Zap}
          accent="text-violet-300"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Progress by difficulty" subtitle={`${s.totals.coding} coding problems · ${s.totals.mcq} MCQs`} icon={BarChart3} />
          <div className="space-y-4 px-5 pt-4 pb-5">
            {ORDER.map((d) => {
              const row = s.difficulty[d] || { total: 0, solved: 0 };
              return (
                <div key={d}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className={`size-2 rounded-full ${DIFFICULTY[d].dot}`} />
                      {DIFFICULTY[d].label}
                    </span>
                    <span className="text-muted">
                      <strong className="font-semibold text-ink">{row.solved}</strong> / {row.total}
                    </span>
                  </div>
                  <Meter value={row.solved} max={row.total} label={`${DIFFICULTY[d].label}: ${row.solved} of ${row.total} solved`} />
                </div>
              );
            })}
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink-2">
                  <Brain className="size-4 text-violet-300" /> Solved without any help
                </span>
                <strong className="font-semibold text-ink">{pct(s.assistance.independentRate)}</strong>
              </div>
              <p className="mt-1 text-xs text-muted">
                {s.assistance.independent} of {s.assistance.solved} solves used no hints, AI help or solution. Time practised:{' '}
                {fmtDuration(s.assistance.timeSpentSec)}.
              </p>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Activity" subtitle="Submissions per day - last 6 months" icon={CalendarDays} />
          <div className="px-5 pt-4 pb-5">
            <Heatmap data={s.heatmap} weeks={26} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Today's daily set"
            subtitle={`Generated by automation for ${s.today.date}`}
            icon={CalendarDays}
            actions={
              <Link to={`/problems?batchDate=${s.today.date}`} className="text-xs text-violet-300 hover:underline">
                Open set
              </Link>
            }
          />
          <div className="px-3 pt-2 pb-3">
            {s.today.questions.length ? (
              s.today.questions.map((q) => <QuestionRow key={q.id} q={q} />)
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No daily set yet"
                action={
                  <Link to="/automation">
                    <Button size="sm" icon={ArrowRight}>
                      Set up daily automation
                    </Button>
                  </Link>
                }
              >
                Schedule a daily set (for example 2 easy + 2 medium + 1 hard) and it will appear here every morning.
              </EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Reattempt queue" subtitle="Attempted but not solved yet" icon={RotateCcw} />
          <div className="px-3 pt-2 pb-2">
            {s.unfinished.length ? (
              s.unfinished.map((q) => <QuestionRow key={q.id} q={{ ...q, progress: { status: 'attempted' } }} />)
            ) : (
              <p className="px-2 py-4 text-sm text-muted">Nothing pending - every attempt was solved. 💪</p>
            )}
          </div>
          {s.revision.length > 0 && (
            <>
              <CardHeader title="Due for revision" subtitle="Solved over a week ago" icon={History} className="pt-2" />
              <div className="px-3 pt-2 pb-3">
                {s.revision.map((q) => (
                  <QuestionRow key={q.id} q={{ ...q, progress: { status: 'solved' } }} />
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Recent submissions" icon={ListChecks} />
          <div className="px-3 pt-2 pb-3">
            {s.recentSubmissions.length ? (
              s.recentSubmissions.map((sub) => {
                const v = verdictInfo(sub.verdict);
                return (
                  <Link key={sub.id} to={`/problems/${sub.questionId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                    <span className={`w-28 shrink-0 truncate text-xs font-semibold ${TONE_TEXT[v.tone]}`}>{v.label}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{sub.title}</span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(sub.createdAt)}</span>
                  </Link>
                );
              })
            ) : (
              <p className="px-2 py-4 text-sm text-muted">No submissions yet - pick a problem and hit Submit.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="AI calls by provider"
            subtitle="Last 30 days"
            icon={Zap}
            actions={
              <Link to="/usage" className="text-xs text-violet-300 hover:underline">
                Details
              </Link>
            }
          />
          <div className="space-y-3 px-5 pt-4 pb-5">
            {s.ai.last30.length ? (
              s.ai.last30.slice(0, 7).map((p) => (
                <div key={p.provider} title={`${providerName(p.provider)}: ${p.calls} calls, ${p.ok} succeeded`}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink-2">{providerName(p.provider)}</span>
                    <span className="text-muted">
                      <strong className="font-semibold text-ink">{p.calls}</strong> · {pct(p.calls ? p.ok / p.calls : 0)} ok
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#172238]">
                    <div className="h-2 rounded-full bg-series-1" style={{ width: `${(p.calls / maxProviderCalls) * 100}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="py-2 text-sm text-muted">
                No AI calls yet. Add API keys in <code>backend/.env</code>, then check the{' '}
                <Link to="/providers" className="text-violet-300 hover:underline">
                  AI Providers
                </Link>{' '}
                page.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Top topics" subtitle="Questions per topic" icon={Target} />
          <div className="space-y-3 px-5 pt-4 pb-5">
            {s.topics.length ? (
              s.topics.slice(0, 7).map((t) => (
                <div key={t.topic}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <Link to={`/problems?topic=${encodeURIComponent(t.topic)}`} className="truncate text-ink-2 hover:text-ink">
                      {t.topic}
                    </Link>
                    <span className="text-muted">
                      <strong className="font-semibold text-ink">{t.solved}</strong> / {t.total}
                    </span>
                  </div>
                  <Meter value={t.solved} max={t.total} label={`${t.topic}: ${t.solved} of ${t.total} solved`} />
                </div>
              ))
            ) : (
              <p className="py-2 text-sm text-muted">Generate some questions to see topic coverage.</p>
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
}
