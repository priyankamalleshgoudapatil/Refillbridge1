import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Bot, Building2, ChevronDown, Cog, User } from 'lucide-react';
import type { CaseEvent } from '@shared/dto.ts';
import { StatusBadge } from '@/components/ui/Badges';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { cn, formatDateTime, timeAgo } from '@/lib/format';
import { useCaseEvents } from './hooks';

const ACTOR = {
  user: { icon: <User className="size-3.5" />, ring: 'bg-brand-600 text-white', label: 'Person' },
  system: { icon: <Cog className="size-3.5" />, ring: 'bg-ice-200 text-ink-600', label: 'System' },
  ai: { icon: <Bot className="size-3.5" />, ring: 'bg-info-600 text-white', label: 'AI' },
  pharmacy_system: { icon: <Building2 className="size-3.5" />, ring: 'bg-ok-600 text-white', label: 'Pharmacy system' },
} as const;

export function Timeline({ caseId, showWhy = true }: { caseId: string; showWhy?: boolean }) {
  const q = useCaseEvents(caseId);
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn't load the timeline" />;
  const events = q.data!.data;
  if (events.length === 0) return <EmptyState icon={<Cog className="size-6" />} title="No activity yet" description="Events appear here as the case moves." />;
  return (
    <ol className="relative space-y-1" aria-label="Case timeline, newest first">
      <span className="absolute bottom-3 left-[15px] top-3 w-px bg-gradient-to-b from-brand-200 via-line to-transparent" aria-hidden />
      {events.map((e, i) => (
        <TimelineItem key={e.id} event={e} index={i} showWhy={showWhy} />
      ))}
    </ol>
  );
}

function TimelineItem({ event: e, index, showWhy }: { event: CaseEvent; index: number; showWhy: boolean }) {
  const [open, setOpen] = useState(false);
  const actor = ACTOR[e.actorType];
  const hasWhy = showWhy && (e.reason || e.ruleIds.length > 0 || e.promptVersion);
  return (
    <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index * 0.03, 0.3) }} className="relative flex gap-3 rounded-xl py-2 pl-0 pr-2">
      <span className={cn('relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white', actor.ring)} title={actor.label} aria-hidden>
        {actor.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium text-ink-900">{e.title}</p>
          <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)} className="shrink-0 text-[12px] text-ink-400">
            {timeAgo(e.createdAt)}
          </time>
        </div>
        <p className="text-[12.5px] text-ink-500">
          <span className="sr-only">{actor.label}: </span>
          {e.actorName}
        </p>
        {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={e.fromStatus} />
            <ArrowRight className="size-3.5 text-ink-400" aria-label="to" />
            <StatusBadge status={e.toStatus} />
          </div>
        )}
        {hasWhy && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-brand-700 hover:bg-brand-50">
            Why?
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        )}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-2 space-y-2 rounded-lg border border-line bg-ice-50 p-3 text-[13px] text-ink-700">
                {e.reason && <p className="leading-relaxed">{e.reason}</p>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                  <dt className="text-ink-400">Actor</dt>
                  <dd>
                    {actor.label} · {e.actorName}
                  </dd>
                  {e.ruleIds.length > 0 && (
                    <>
                      <dt className="text-ink-400">Rules</dt>
                      <dd className="flex flex-wrap gap-1">
                        {e.ruleIds.map((r) => (
                          <span key={r} className="rounded bg-white px-1.5 font-mono text-[11px] ring-1 ring-line">
                            {r}
                          </span>
                        ))}
                      </dd>
                    </>
                  )}
                  {e.promptVersion && (
                    <>
                      <dt className="text-ink-400">Prompt</dt>
                      <dd className="font-mono">{e.promptVersion}</dd>
                    </>
                  )}
                  <dt className="text-ink-400">Request ID</dt>
                  <dd className="truncate font-mono">{e.requestId}</dd>
                  <dt className="text-ink-400">Time</dt>
                  <dd>{formatDateTime(e.createdAt)}</dd>
                </dl>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}
