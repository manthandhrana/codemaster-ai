import {
  BarChart3,
  CalendarClock,
  Code2,
  Cpu,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { cn } from '../lib/format';
import { useApi } from '../lib/hooks';
import { FullPageSpinner } from './ui';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'CodeMaster AI';

const NAV = [
  {
    group: 'Practice',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/problems', label: 'Problem Set', icon: ListChecks },
    ],
  },
  {
    group: 'Create',
    items: [
      { to: '/generate', label: 'AI Generator', icon: Sparkles },
      { to: '/prompts', label: 'Prompt Templates', icon: FileText },
      { to: '/automation', label: 'Daily Automation', icon: CalendarClock },
    ],
  },
  {
    group: 'AI Engine',
    items: [
      { to: '/providers', label: 'AI Providers', icon: Cpu },
      { to: '/usage', label: 'AI Usage', icon: BarChart3 },
    ],
  },
  { group: 'System', items: [{ to: '/settings', label: 'Settings', icon: Settings }] },
];

export function Logo({ compact }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-900/40">
        <Code2 className="size-5 text-white" strokeWidth={2.5} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="text-[15px] font-bold tracking-tight text-ink">{APP_NAME}</p>
          <p className="text-[10px] font-medium tracking-wider text-muted uppercase">Crack the interview</p>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }) {
  const { logout } = useAuth();
  const { data: me } = useApi('/auth/me');
  const email = me?.user?.email;
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV.map((section) => (
          <div key={section.group}>
            <p className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-muted uppercase">{section.group}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-violet-500/12 text-ink ring-1 ring-violet-500/25' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn('size-4', isActive ? 'text-violet-300' : 'text-muted group-hover:text-ink-2')} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 text-xs font-bold text-white uppercase">
            {(email || 'A')[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Admin</p>
            <p className="truncate text-[11px] text-muted" title={email || ''}>
              {email || 'Full access'}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-rose-300"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface/60 lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-surface shadow-2xl">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute top-5 right-3 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-3"
            >
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2"
          >
            <Menu className="size-5" />
          </button>
          <Logo />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<FullPageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
