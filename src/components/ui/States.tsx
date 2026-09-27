import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { ApiError, friendlyMessage } from '@/services';
import { cn } from '@/lib/format';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-line bg-white p-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-white/70 px-6 py-14 text-center', className)}>
      <div className="relative mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-brand-100" aria-hidden />
        <span className="relative">{icon}</span>
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({ error, onRetry, title = "Couldn't load this", className }: { error: unknown; onRetry?: () => void; title?: string; className?: string }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div role="alert" className={cn('flex flex-col items-center rounded-2xl border border-bad-600/20 bg-bad-50/60 px-6 py-12 text-center', className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-white text-bad-600 shadow-sm">
        <AlertCircle className="size-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-600">{friendlyMessage(error)}</p>
      {requestId && <p className="mt-2 font-mono text-xs text-ink-400">Reference: {requestId.slice(0, 8)}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry} icon={<RotateCcw className="size-4" />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600', className)} role="status" aria-label="Loading" />;
}
