import { AlertTriangle, Check, CircleCheck, CircleDashed, Circle, Copy, Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/format';

// ---------------------------------------------------------------- layout

export function Page({ children, className, wide }) {
  return <div className={cn('mx-auto w-full px-4 py-6 md:px-8 md:py-8', wide ? 'max-w-[1600px]' : 'max-w-7xl', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-violet-300">
            <Icon className="size-5" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, ...rest }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, actions, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="size-4 shrink-0 text-violet-300" />}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- buttons

const BTN_VARIANTS = {
  primary:
    'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/30 hover:from-violet-500 hover:to-indigo-500 border border-violet-500/40',
  secondary: 'bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2 border border-transparent',
  danger: 'bg-rose-600/15 text-rose-300 border border-rose-500/30 hover:bg-rose-600/25',
  success: 'bg-emerald-600 text-white border border-emerald-500/50 hover:bg-emerald-500 shadow-lg shadow-emerald-900/30',
};
const BTN_SIZES = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
};

export function Button({ variant = 'secondary', size = 'md', loading, icon: Icon, children, className, disabled, ...rest }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50',
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'xs' ? 'size-3.5' : 'size-4'} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, active, ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40',
        active && 'text-amber-300',
        className,
      )}
      {...rest}
    >
      <Icon className="size-4" />
    </button>
  );
}

export function CopyButton({ text, label = 'Copy', className }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface-3 hover:text-ink', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      {label && <span>{done ? 'Copied' : label}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- badges

const BADGE_TONES = {
  neutral: 'bg-surface-3 text-ink-2 border-line',
  violet: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  red: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
  blue: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/25',
};

export function Badge({ tone = 'neutral', children, className, icon: Icon, title }) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', BADGE_TONES[tone], className)}
    >
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}

export const DIFFICULTY = {
  easy: { label: 'Easy', text: 'text-emerald-400', tone: 'green', dot: 'bg-emerald-400' },
  medium: { label: 'Medium', text: 'text-amber-400', tone: 'amber', dot: 'bg-amber-400' },
  hard: { label: 'Hard', text: 'text-rose-400', tone: 'red', dot: 'bg-rose-400' },
  very_hard: { label: 'Very Hard', text: 'text-fuchsia-400', tone: 'fuchsia', dot: 'bg-fuchsia-400' },
};

export function DifficultyBadge({ value, className }) {
  const d = DIFFICULTY[value] || { label: value, tone: 'neutral' };
  return (
    <Badge tone={d.tone} className={className}>
      {d.label}
    </Badge>
  );
}

export function StatusIcon({ status, className }) {
  if (status === 'solved') return <CircleCheck className={cn('size-4 text-emerald-400', className)} aria-label="Solved" />;
  if (status === 'attempted') return <CircleDashed className={cn('size-4 text-amber-400', className)} aria-label="Attempted" />;
  return <Circle className={cn('size-4 text-line-strong', className)} aria-label="Todo" />;
}

// ---------------------------------------------------------------- form controls

const CONTROL =
  'w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-muted transition-colors focus:border-violet-500/70 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60';

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...rest }) {
  return <input className={cn(CONTROL, 'h-9', className)} {...rest} />;
}

export function Textarea({ className, ...rest }) {
  return <textarea className={cn(CONTROL, 'py-2 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={cn(CONTROL, 'h-9 cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled, size = 'md' }) {
  const small = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
        small ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'border-violet-500/60 bg-violet-600' : 'border-line bg-surface-3',
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow transition-transform',
          small ? 'size-3.5' : 'size-4.5',
          checked ? (small ? 'translate-x-4.5' : 'translate-x-5.5') : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function Segmented({ options, value, onChange, size = 'md', className }) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active ? 'bg-surface-3 text-ink shadow-sm ring-1 ring-line-strong' : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {o.label}
            {o.count !== undefined && <span className="rounded bg-bg/60 px-1 text-[10px] text-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto border-b border-line px-2', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors',
              active ? 'text-ink' : 'text-muted hover:text-ink-2',
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {t.label}
            {t.badge !== undefined && t.badge !== null && (
              <span className="rounded-full bg-surface-3 px-1.5 text-[10px] text-ink-2">{t.badge}</span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" />}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'border-violet-500/60 bg-violet-500/15 text-violet-200' : 'border-line bg-surface-2 text-ink-2 hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- feedback

export function Spinner({ className }) {
  return <Loader2 className={cn('size-5 animate-spin text-violet-400', className)} />;
}

export function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div className="grid h-full min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm text-muted">
        <Spinner className="size-7" />
        {label}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 grid size-12 place-items-center rounded-2xl border border-line bg-surface-2 text-muted">
          <Icon className="size-6" />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, full }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 p-8 text-center', full && 'min-h-screen')}>
      <AlertTriangle className="size-8 text-amber-400" />
      <p className="max-w-md text-sm text-ink-2">{error?.message || 'Something went wrong'}</p>
      {onRetry && (
        <Button size="sm" icon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Callout({ tone = 'info', icon: Icon, title, children, className }) {
  const tones = {
    info: 'border-sky-500/25 bg-sky-500/5 text-sky-200',
    warn: 'border-amber-500/25 bg-amber-500/5 text-amber-200',
    bad: 'border-rose-500/25 bg-rose-500/5 text-rose-200',
    good: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200',
    violet: 'border-violet-500/25 bg-violet-500/5 text-violet-200',
  };
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn('text-[13px] leading-relaxed opacity-90', title && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- figures

/** Stat tile: label · value · optional sub line (proportional figures on the value). */
export function StatTile({ label, value, sub, icon: Icon, accent = 'text-violet-300' }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        {Icon && <Icon className={cn('size-4', accent)} />}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

/** Meter: blue fill on a same-hue track. */
export function Meter({ value, max, className, label }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-[#172238]', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      title={label}
    >
      <div className="h-full rounded-full bg-series-1 transition-[width] duration-500" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-line-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{children}</kbd>;
}

// ---------------------------------------------------------------- dialogs

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm md:p-8" onMouseDown={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('animate-pop my-auto w-full rounded-2xl border border-line bg-surface shadow-2xl outline-none', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', danger, busy }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-2">{children}</div>
    </Modal>
  );
}
