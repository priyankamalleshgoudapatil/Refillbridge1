import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowLeft, ExternalLink, Inbox, PartyPopper, Pill, ShieldAlert, Stethoscope } from 'lucide-react';
import type { CaseSummary, PracticeCaseDetail } from '@shared/dto.ts';
import { refillService } from '@/services';
import { ApiError } from '@/services/errors';
import { useAuth } from '@/app/auth-context';
import { BlockerChip, PriorityBadge, SlaBadge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card, KeyValue, PageHeader } from '@/components/ui/Layout';
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/ui/States';
import { cn, formatDate, formatDob, timeAgo } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { AiSummaryCard } from '@/features/cases/AiSummaryCard';
import { DiagnosisPanel } from '@/features/cases/DiagnosisPanel';
import { useCase, useCases } from '@/features/cases/hooks';
import { DecisionPanel } from './DecisionPanel';

export default function ProviderInboxPage() {
  const { caseId } = useParams();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') === 'mine' ? 'mine' : 'all';
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const list = useCases({ status: 'WAITING_ON_PROVIDER', owner: scope === 'mine' ? 'me' : undefined, sort: 'priority', limit: 100 });
  const rows = useMemo(() => list.data?.data ?? [], [list.data]);

  // Desktop: auto-open the first case so the provider can start immediately.
  useEffect(() => {
    if (!caseId && rows.length > 0 && window.matchMedia('(min-width: 1024px)').matches) navigate(`/provider/inbox/${rows[0].id}${scope === 'mine' ? '?scope=mine' : ''}`, { replace: true });
  }, [caseId, rows, navigate, scope]);

  const goNext = () => {
    const idx = rows.findIndex((r) => r.id === caseId);
    const next = rows[idx + 1] ?? rows.find((r) => r.id !== caseId);
    navigate(next ? `/provider/inbox/${next.id}` : '/provider/inbox');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Provider inbox"
        title={
          <>
            <span className="font-light">Good {greeting()},</span> <span className="font-bold">{user?.name.replace(/,.*$/, '')}</span>
          </>
        }
        description={list.data ? `${list.data.meta.total} refill${list.data.meta.total === 1 ? '' : 's'} waiting for a clinical decision, most urgent first.` : 'Loading your queue…'}
        actions={
          <div className="flex rounded-lg bg-white p-1 ring-1 ring-line" role="radiogroup" aria-label="Inbox scope">
            {(['all', 'mine'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => setParams(s === 'mine' ? { scope: 'mine' } : {})} className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition', scope === s ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ice-100')}>
                {s === 'all' ? 'All providers' : 'Assigned to me'}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className={cn(caseId && 'hidden lg:block')}>
          {list.isLoading ? (
            <SkeletonRows rows={5} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<PartyPopper className="size-6" />} title="Inbox zero" description="Nothing is waiting on you. New requests appear here as soon as the rules route them." />
          ) : (
            <ul className="space-y-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-1" aria-label="Cases waiting on a provider">
              {rows.map((r, i) => (
                <InboxRow key={r.id} row={r} active={r.id === caseId} index={i} now={now} scope={scope} />
              ))}
            </ul>
          )}
        </div>
        <div className={cn('min-w-0', !caseId && 'hidden lg:block')}>{caseId ? <InboxDetail caseId={caseId} onDecided={goNext} /> : rows.length > 0 && <EmptyState icon={<Inbox className="size-6" />} title="Select a case" />}</div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function InboxRow({ row: r, active, index, now, scope }: { row: CaseSummary; active: boolean; index: number; now: number; scope: string }) {
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.03, 0.25) }}>
      <Link
        to={`/provider/inbox/${r.id}${scope === 'mine' ? '?scope=mine' : ''}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'block rounded-xl border bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]',
          active ? 'border-brand-500 shadow-[var(--shadow-glow)]' : 'border-line hover:border-brand-300',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{r.patientName}</p>
            <p className="truncate text-[13px] text-ink-500">{r.medication}</p>
          </div>
          <PriorityBadge priority={r.priority} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {r.blockers.slice(0, 3).map((b) => (
            <BlockerChip key={b} code={b} />
          ))}
          {r.blockers.length > 3 && <span className="text-[12px] text-ink-400">+{r.blockers.length - 3}</span>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <SlaBadge state={r.slaState} dueAt={r.dueAt} now={now} />
          <span className="text-[11.5px] text-ink-400">{r.injectionSuspected ? <ShieldAlert className="inline size-3.5 text-bad-600" aria-label="Unusual instructions" /> : null} {timeAgo(r.statusSince, now)}</span>
        </div>
      </Link>
    </motion.li>
  );
}

function InboxDetail({ caseId, onDecided }: { caseId: string; onDecided: () => void }) {
  const q = useCase(caseId);
  const policies = useQuery({ queryKey: ['policies'], queryFn: () => refillService.getPolicies(), staleTime: 60_000 });
  if (q.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={q.error instanceof ApiError && q.error.code === 'NOT_FOUND' ? 'Case not found' : "Couldn't load this case"} />;
  const d = q.data as PracticeCaseDetail;
  if (d.view !== 'practice') return null;
  const c = d.case;
  const decided = c.status !== 'WAITING_ON_PROVIDER';
  return (
    <motion.div key={caseId} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="space-y-5">
      <Link to="/provider/inbox" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700 lg:hidden">
        <ArrowLeft className="size-4" /> Back to inbox
      </Link>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[12.5px] text-brand-700">{c.caseNumber}</p>
            <h2 className="text-2xl text-brand-900">
              <span className="font-bold">{c.patientName}</span>
              {d.patientAge !== null && <span className="font-light">, {d.patientAge}</span>}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-600">
              <span className="inline-flex items-center gap-1">
                <Pill className="size-4 text-brand-500" /> {c.medication}
              </span>
              {d.patient && (
                <span>
                  DOB {formatDob(d.patient.dob)} · <span className="font-mono">{d.patient.chartNumber}</span>
                </span>
              )}
            </p>
          </div>
          <Link to={`/cases/${c.id}`}>
            <Button variant="ghost" size="sm" icon={<ExternalLink className="size-3.5" />}>
              Full case
            </Button>
          </Link>
        </div>
        {c.injectionSuspected && (
          <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-bad-50 px-3 py-2 text-[13px] text-bad-700">
            <ShieldAlert className="size-4" /> This document contains unusual instructions. They were ignored — review the source carefully.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {c.blockerDetails.map((b) => (
            <BlockerChip key={b.code} code={b.code} source={b.source} />
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-[13px] text-ink-600">
          {c.blockerDetails.map((b) => (
            <li key={b.code}>
              <span className="font-mono text-[11.5px] text-ink-400">{b.source}</span> {b.detail}
            </li>
          ))}
        </ul>
        {d.prescription && (
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-ice-50 p-3.5 sm:grid-cols-4">
            <KeyValue label="Refills left">{d.prescription.refillsRemaining}</KeyValue>
            <KeyValue label="Last fill">{formatDate(d.prescription.lastFillAt, { month: 'short', day: 'numeric' })}</KeyValue>
            <KeyValue label="Last visit">{formatDate(d.lastVisit, { month: 'short', year: 'numeric' })}</KeyValue>
            <KeyValue label={d.lastA1c ? 'Last A1c' : 'Written'}>{formatDate(d.lastA1c ?? d.prescription.writtenAt, { month: 'short', year: 'numeric' })}</KeyValue>
          </dl>
        )}
        {d.conflicts.length > 0 && (
          <p className="mt-3 rounded-lg bg-warn-50 px-3 py-2 text-[13px] text-warn-700">
            Conflict: {d.conflicts.map((x) => `${x.field} — pharmacy ${x.reported}, chart ${x.chart}`).join('; ')}
          </p>
        )}
      </Card>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {decided ? (
            <EmptyState icon={<Stethoscope className="size-6" />} title="Decision recorded" description="This case has moved on. The timeline shows what happens next." action={<Button onClick={onDecided}>Next case</Button>} />
          ) : (
            <DecisionPanel detail={d} maxBridgeDays={policies.data?.maxBridgeDays ?? 30} onDecided={onDecided} />
          )}
        </div>
        <div className="space-y-5">
          <AiSummaryCard caseId={c.id} version={c.version} />
          <DiagnosisPanel caseId={c.id} compact />
        </div>
      </div>
    </motion.div>
  );
}
