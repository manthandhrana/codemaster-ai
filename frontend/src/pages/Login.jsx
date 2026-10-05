import { Bot, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Layout';
import { Button } from '../components/ui';
import { useAuth } from '../context/auth';
import { http } from '../lib/api';
import { localPref } from '../lib/hooks';

const FEATURES = [
  { icon: Sparkles, text: 'Generate LeetCode-style problems & MCQs with 18 AI providers' },
  { icon: Bot, text: 'Automatic fallback when an AI fails or hits its rate limit' },
  { icon: ShieldCheck, text: 'Every generated test case verified by running the reference solution' },
  { icon: Zap, text: 'Daily automation, hints, AI interview reviews and progress tracking' },
];

export default function Login() {
  const { login, isAuthed } = useAuth();
  const [email, setEmail] = useState(() => localPref.get('cm.loginEmail', ''));
  const [emailRequired, setEmailRequired] = useState(true);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    http
      .get('/auth/config')
      .then((c) => setEmailRequired(Boolean(c.emailRequired)))
      .catch(() => {});
  }, []);

  if (isAuthed) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!password || (emailRequired && !email.trim())) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      localPref.set('cm.loginEmail', email.trim());
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="bg-grid relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2">
        <div className="hidden lg:block">
          <Logo />
          <h1 className="mt-8 text-4xl leading-tight font-extrabold tracking-tight text-ink">
            Practice like it&apos;s the <span className="gradient-text">real interview</span>.
          </h1>
          <p className="mt-4 max-w-md text-ink-2">
            Your private AI-powered coding gym - fresh problems every day, calibrated from warm-up to competitive level.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-start gap-3 text-sm text-ink-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-violet-300">
                  <f.icon className="size-3.5" />
                </span>
                <span className="pt-1">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={submit} className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface/90 p-7 shadow-2xl backdrop-blur">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="mt-6 lg:mt-0">
            <div className="grid size-11 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
              <Lock className="size-5" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-ink">Admin sign in</h2>
            <p className="mt-1 text-sm text-muted">Use the admin {emailRequired ? 'email and password' : 'password'} from the backend env files</p>
          </div>

          {emailRequired && (
            <label className="mt-6 block">
              <span className="mb-1.5 block text-xs font-medium text-ink-2">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus={!email}
                  autoComplete="username"
                  placeholder="admin@example.com"
                  className="h-11 w-full rounded-xl border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-muted focus:border-violet-500/70 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
                />
              </div>
            </label>
          )}

          <label className={emailRequired ? 'mt-4 block' : 'mt-6 block'}>
            <span className="mb-1.5 block text-xs font-medium text-ink-2">Password</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={!emailRequired || Boolean(email)}
                autoComplete="current-password"
                placeholder="••••••••••"
                className="h-11 w-full rounded-xl border border-line bg-surface-2 pr-10 pl-9 text-sm text-ink placeholder:text-muted focus:border-violet-500/70 focus:ring-2 focus:ring-violet-500/20 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
          {error && <p className="animate-shake mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-5 w-full">
            Sign in
          </Button>
          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted">
            Only the admin can use this panel. The login is set with <code className="text-ink-2">ADMIN_EMAIL</code> and{' '}
            <code className="text-ink-2">ADMIN_PASSWORD</code> / <code className="text-ink-2">ADMIN_PASSWORD_HASH</code> in the backend env files.
          </p>
        </form>
      </div>
    </div>
  );
}
