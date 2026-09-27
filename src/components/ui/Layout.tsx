import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/format';

export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & Record<string, unknown>) {
  return (
    <As className={cn('surface', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-brand-600">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }} className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</div>}
        <h1 className="text-[26px] font-light leading-tight text-brand-900 sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}

export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <nav className="mt-4 flex items-center justify-between text-sm text-ink-500" aria-label="Pagination">
      <span>
        {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className="rounded-md p-2 hover:bg-white disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 font-medium text-ink-700">
          {page} / {pages}
        </span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} className="rounded-md p-2 hover:bg-white disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn('relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors', active ? 'text-brand-800' : 'text-ink-500 hover:text-ink-900')}
          >
            <span className="flex items-center gap-1.5">
              {t.label}
              {t.count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px]', active ? 'bg-brand-100 text-brand-800' : 'bg-ice-200 text-ink-600')}>{t.count}</span>}
            </span>
            {active && <motion.span layoutId={`tab-${label}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
          </button>
        );
      })}
    </div>
  );
}

export function KeyValue({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-sm text-ink-900', mono && 'font-mono text-[13px]')}>{children}</dd>
    </div>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="rb-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2a768a" />
            <stop offset="1" stopColor="#143b46" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#rb-g)" />
        <path d="M7.5 20.5c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5" fill="none" stroke="#e4f2f6" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="7.5" cy="21.5" r="2.6" fill="#9fcfdb" />
        <circle cx="24.5" cy="21.5" r="2.6" fill="#9fcfdb" />
        <path d="M14.5 16h3M16 14.5v3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className="font-display text-[17px] tracking-tight text-brand-900">
          <span className="font-light">Refill</span>
          <span className="font-bold">Bridge</span>
        </span>
      )}
    </span>
  );
}
