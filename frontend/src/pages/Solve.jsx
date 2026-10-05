import { useParams } from 'react-router-dom';
import { ErrorState, FullPageSpinner } from '../components/ui';
import { useApi } from '../lib/hooks';
import CodingSolve from './solve/CodingSolve';
import McqSolve from './solve/McqSolve';

export default function Solve() {
  const { id } = useParams();
  const { data: q, error, reload, setData } = useApi(`/questions/${id}`);
  if (error && (!q || String(q.id) !== id)) return <ErrorState error={error} onRetry={reload} />;
  if (!q || String(q.id) !== id) return <FullPageSpinner label="Loading question…" />;
  return q.type === 'coding' ? (
    <CodingSolve key={q.id} q={q} setQ={setData} />
  ) : (
    <McqSolve key={q.id} q={q} setQ={setData} />
  );
}
