import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, Bot, Building2, Clock3, Hand, MessageSquareMore, Send, Target, TimerOff } from 'lucide-react';
import type { AnalyticsSummary, DateRange } from '@shared/dto.ts';
import { STATUS_LABELS } from '@shared/domain/diagnosis.ts';
import { isPracticeRole } from '@shared/domain/permissions.ts';
import { useAuth } from '@/app/auth-context';
import { refillService } from '@/services';
import { BLOCKER_LABELS, StatusBadge } from '@/components/ui/Badges';
import { Select } from '@/components/ui/Field';
import { Card, CardHeader, PageHeader } from '@/components/ui/Layout';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { cn } from '@/lib/format';
import { HBarChart, WeeklyColumnChart, fadeUp } from './charts';

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
] as const;
type RangeDays = (typeof RANGES)[number]['days'];

export function rangeFor(days: number, now: number = Date.now()): DateRange {
  return { from: new Date(now - days * 86_400_000).toISOString(), to: new Date(now).toISOString() };
}

const linkBtn = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-input)] px-4 text-sm font-medium transition-all duration-200 hover:-translate-y-px';
const linkPrimary = cn(linkBtn, 'bg-brand-700 text-white shadow-[0_6px_16px_-6px_rgb(27_77_91/0.6)] hover:bg-brand-800');
const linkSecondary = cn(linkBtn, 'border border-line-strong bg-white text-ink-900 hover:border-brand-300 hover:bg-brand-50');

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState<RangeDays>(30);
  const range = useMemo(() => rangeFor(days), [days]);
  const query = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => refillService.getAnalyticsSummary(range),
    placeholderData: keepPreviousData,
  });

  const practice = user ? isPracticeRole(user.role) : true;
  const data = query.data;
  const isEmpty = data !== undefined && data.openCases + data.resolvedCases === 0;
  const refetching = query.isFetching && query.isPlaceholderData;

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title={
          <>
            Refill <span className="font-bold">performance</span>
          </>
        }
        description={
          practice
            ? 'How quickly stuck refills move from pharmacy request to pharmacy-confirmed — across your whole practice.'
            : `Requests you submitted to linked practices from ${user?.orgName ?? 'your pharmacy'}, and how fast they came back.`
        }
        actions={
          <div className="w-44">
            <Select label="Date range" hideLabel value={days} onChange={(e) => setDays(Number(e.target.value) as RangeDays)}>
              {RANGES.map((r) => (
                <option key={r.days} value={r.days}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {query.isPending ? (
        <AnalyticsSkeleton />
      ) : query.isError ? (
        <ErrorState title="Couldn't load analytics" error={query.error} onRetry={() => void query.refetch()} />
      ) : isEmpty || !data ? (
        <AnalyticsEmpty role={user?.role} />
      ) : (
        <div className={cn('space-y-5 transition-opacity', refetching && 'opacity-60')} aria-busy={refetching || undefined}>
          <NorthStar pct={data.northStarPct} practice={practice} />
          <KpiTiles data={data} practice={practice} />

          <div className="grid gap-5 xl:grid-cols-5">
            <motion.div {...fadeUp(4)} className="surface min-w-0 xl:col-span-3">
              <WeeklyColumnChart
                data={data.weekly}
                title="Resolved per week"
                description="Cases resolved each week, and how many of those were pharmacy-confirmed within 48 business hours."
                footnote="Earlier weeks come from the nightly metrics rollup; this week is live."
              />
            </motion.div>
            <motion.div {...fadeUp(5)} className="surface min-w-0 xl:col-span-2">
              <HBarChart
                title="Top blockers"
                description={practice ? 'What stops refills most often.' : 'Why your requests needed more work.'}
                rows={data.topBlockers.map((b) => ({ key: b.code, label: BLOCKER_LABELS[b.code], text: BLOCKER_LABELS[b.code], value: b.count }))}
                footnote={data.topBlockers.length === 0 ? 'No blockers raised in this period.' : 'A case can carry more than one blocker.'}
              />
            </motion.div>
          </div>

          <div className="grid gap-5 xl:grid-cols-5">
            <motion.div {...fadeUp(6)} className="surface min-w-0 xl:col-span-2">
              <HBarChart
                title="Cases by status"
                description="Where every case sits right now."
                rows={data.casesByStatus.map((s) => ({ key: s.status, label: <StatusBadge status={s.status} />, text: STATUS_LABELS[s.status], value: s.count }))}
              />
            </motion.div>
            <motion.div {...fadeUp(7)} className="min-w-0 xl:col-span-3">
              <ByPharmacy rows={data.byPharmacy} practice={practice} />
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ North Star

function NorthStar({ pct, practice }: { pct: number; practice: boolean }) {
  return (
    <motion.section {...fadeUp(0)} aria-labelledby="north-star-label" className="surface relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand-100/60 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
        <div className="shrink-0">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">
            <Target className="size-3.5" aria-hidden /> North Star
          </p>
          <p className="mt-1 font-sans text-[56px] font-semibold leading-none text-brand-900 sm:text-[64px]">
            {pct}
            <span className="ml-0.5 text-[28px] font-medium text-brand-700">%</span>
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="north-star-label" className="text-lg font-semibold leading-snug text-ink-900">
            of stuck refills resolved (pharmacy-confirmed) within 48 business hours
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-500">
            A refill is <em>stuck</em> when something blocks it — no refills left, a visit or lab due, missing information, or insurance. It counts as resolved only when the pharmacy confirms
            receipt, not when {practice ? 'your team' : 'the practice'} clicks approve.
          </p>
          <div className="mt-4 h-2 w-full max-w-xl overflow-hidden rounded-full bg-brand-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Stuck refills resolved within 48 business hours">
            <motion.div className="h-full rounded-full bg-brand-600" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }} />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ------------------------------------------------------------------ KPI tiles

interface Tile {
  label: string;
  value: ReactNode;
  unit?: string;
  hint: string;
  icon: ReactNode;
}

function Value({ n, unit }: { n: number | string; unit?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[28px] font-semibold leading-none text-ink-900">{n}</span>
      {unit && <span className="text-sm font-medium text-ink-500">{unit}</span>}
    </span>
  );
}

function KpiTiles({ data, practice }: { data: AnalyticsSummary; practice: boolean }) {
  const ic = 'size-4';
  const total = data.openCases + data.resolvedCases;
  const tiles: Tile[] = [
    { label: 'Median time to pharmacy confirmation', value: <Value n={data.medianHoursToConfirm} unit="h" />, hint: 'From request received to pharmacy confirmed. Lower is better.', icon: <Clock3 className={ic} /> },
    { label: 'Touches per refill', value: <Value n={data.touchesPerRefill} unit="touches" />, hint: 'Manual actions by people per case. Lower is better.', icon: <Hand className={ic} /> },
    { label: 'Info-request round trips', value: <Value n={data.infoRoundTrips} unit="per case" />, hint: 'Questions sent back for missing details. Lower is better.', icon: <MessageSquareMore className={ic} /> },
    { label: 'SLA breach rate', value: <Value n={data.slaBreachRate} unit="%" />, hint: 'Cases escalated for missing a response deadline. Lower is better.', icon: <TimerOff className={ic} /> },
    { label: 'AI suggestion acceptance', value: <Value n={data.aiAcceptanceRate} unit="%" />, hint: 'Suggestions staff accepted as-is. AI never changes rules.', icon: <Bot className={ic} /> },
    {
      label: 'Open vs resolved',
      value: (
        <span className="flex items-baseline gap-3">
          <Value n={data.openCases} unit="open" />
          <span className="text-ink-400" aria-hidden>
            /
          </span>
          <Value n={data.resolvedCases} unit="resolved" />
        </span>
      ),
      hint: practice ? `${total} cases in this period.` : `${total} requests in this period.`,
      icon: <Activity className={ic} />,
    },
  ];
  return (
    <ul aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t, i) => (
        <motion.li key={t.label} {...fadeUp(i + 1)} className="surface flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-ink-600">{t.label}</p>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600" aria-hidden>
              {t.icon}
            </span>
          </div>
          <div>{t.value}</div>
          <p className="text-[12px] text-ink-500">{t.hint}</p>
        </motion.li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ By pharmacy

function ByPharmacy({ rows, practice }: { rows: AnalyticsSummary['byPharmacy']; practice: boolean }) {
  return (
    <Card className="h-full">
      <CardHeader
        icon={<Building2 className="size-4" aria-hidden />}
        title={practice ? 'By pharmacy' : 'Your pharmacy'}
        description="Cases and median hours from sending to the pharmacy until they acknowledged it."
      />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-500">No pharmacy activity in this period.</p>
      ) : (
        <>
          <table className="hidden w-full text-sm sm:table">
            <caption className="sr-only">Cases and median hours to acknowledge, by pharmacy</caption>
            <thead>
              <tr className="border-b border-line text-left text-[12px] font-medium uppercase tracking-wide text-ink-400">
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Pharmacy
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">
                  Cases
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">
                  Median to acknowledge
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-line last:border-0 hover:bg-ice-50">
                  <th scope="row" className="px-5 py-3 text-left font-medium text-ink-900">
                    {r.name}
                  </th>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-700">{r.cases}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-700">{r.medianAckHours ? `${r.medianAckHours} h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-line sm:hidden">
            {rows.map((r) => (
              <li key={r.name} className="px-5 py-3">
                <p className="font-medium text-ink-900">{r.name}</p>
                <dl className="mt-1 flex gap-6 text-[13px]">
                  <div>
                    <dt className="text-ink-500">Cases</dt>
                    <dd className="font-medium tabular-nums text-ink-900">{r.cases}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Median to acknowledge</dt>
                    <dd className="font-medium tabular-nums text-ink-900">{r.medianAckHours ? `${r.medianAckHours} h` : '—'}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ States

function AnalyticsEmpty({ role }: { role: string | undefined }) {
  let description = 'Numbers appear here once refill requests start flowing through RefillBridge.';
  let actions: ReactNode = null;
  if (role === 'pharmacy_admin') {
    description = 'Once you send refill requests to a linked practice, you will see how quickly they come back.';
    actions = (
      <Link to="/pharmacy/requests/new" className={linkPrimary}>
        <Send className="size-4" aria-hidden /> Submit your first refill request
      </Link>
    );
  } else if (role === 'practice_admin') {
    description = 'Invite the pharmacies you work with. Their refill requests — and these numbers — start flowing once they accept.';
    actions = (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to="/settings/pharmacies" className={linkPrimary}>
          <Building2 className="size-4" aria-hidden /> Invite your pharmacy
        </Link>
        <Link to="/cases/new" className={linkSecondary}>
          Log a phone request
        </Link>
      </div>
    );
  } else if (role === 'provider') {
    actions = (
      <Link to="/provider/inbox" className={linkSecondary}>
        Open your inbox
      </Link>
    );
  }
  return <EmptyState icon={<BarChart3 className="size-6" aria-hidden />} title="No data yet" description={description} action={actions} />;
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading analytics">
      <div className="surface flex flex-col gap-4 p-6 md:flex-row md:items-center">
        <Skeleton className="h-16 w-32" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3.5 w-full max-w-lg" />
          <Skeleton className="h-2 w-full max-w-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="surface space-y-3 p-4">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="surface p-5 xl:col-span-3">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
        <div className="surface space-y-3 p-5 xl:col-span-2">
          <Skeleton className="mb-2 h-4 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
