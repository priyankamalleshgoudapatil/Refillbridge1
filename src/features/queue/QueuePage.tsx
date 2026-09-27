import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertOctagon, ClipboardList, Filter, Hand, Inbox, PhoneIncoming, Search, UserRoundX, X, Zap } from 'lucide-react';
import type { CaseSummary, ListCasesParams, Paginated } from '@shared/dto.ts';
import type { BlockerCode, CaseStatus, Priority, SlaState } from '@shared/types.ts';
import { BLOCKER_CODES } from '@shared/types.ts';
import { friendlyMessage, refillService } from '@/services';
import { useAuth } from '@/app/auth-context';
import { BLOCKER_LABELS, BlockerChip, PriorityBadge, SlaBadge, StatusBadge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader, Pagination, Tabs } from '@/components/ui/Layout';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/format';
import { useDebounced, useNow } from '@/lib/hooks';
import { useCases } from '@/features/cases/hooks';

type StatusTab = 'OPEN' | 'NEEDS_PATIENT_MATCH' | 'TRIAGE' | 'WAITING_ON_INFO' | 'WAITING_ON_PROVIDER' | 'WAITING_ON_PATIENT_VISIT' | 'WAITING_ON_INSURANCE' | 'SENT_TO_PHARMACY' | 'ALL';
const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'OPEN', label: 'All open' },
  { value: 'NEEDS_PATIENT_MATCH', label: 'Needs match' },
  { value: 'TRIAGE', label: 'Triage' },
  { value: 'WAITING_ON_INFO', label: 'Waiting on info' },
  { value: 'WAITING_ON_PROVIDER', label: 'With provider' },
  { value: 'WAITING_ON_PATIENT_VISIT', label: 'Visit needed' },
  { value: 'WAITING_ON_INSURANCE', label: 'Insurance' },
  { value: 'SENT_TO_PHARMACY', label: 'Awaiting pharmacy' },
  { value: 'ALL', label: 'All incl. closed' },
];

export default function QueuePage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const status = (params.get('status') as StatusTab) || 'OPEN';
  const blocker = (params.get('blocker') as BlockerCode) || undefined;
  const priority = (params.get('priority') as Priority) || undefined;
  const owner = params.get('owner') || undefined;
  const sla = (params.get('sla') as SlaState) || undefined;
  const page = Number(params.get('page') || '1');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search, 300);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const listParams: ListCasesParams = { status: status as CaseStatus | 'OPEN' | 'ALL', blocker, priority, owner, sla, search: debounced || undefined, page, limit: 20, sort: 'priority' };
  const list = useCases(listParams);
  const kpiSource = useCases({ status: 'OPEN', limit: 100 });
  const kpis = useMemo(() => {
    const rows = kpiSource.data?.data ?? [];
    return {
      open: kpiSource.data?.meta.total ?? 0,
      urgent: rows.filter((r) => r.priority === 'URGENT').length,
      breached: rows.filter((r) => r.slaState === 'breached').length,
      unassigned: rows.filter((r) => !r.ownerUserId && r.ownerRole !== 'system').length,
    };
  }, [kpiSource.data]);
  const filtersActive = Boolean(blocker || priority || owner || sla || debounced);

  return (
    <div>
      <PageHeader
        eyebrow={user?.orgName}
        title={
          <>
            <span className="font-light">Refill</span> <span className="font-bold">queue</span>
          </>
        }
        description="Every stuck refill as one shared case — one owner, one next step, one due time."
        actions={
          <Link to="/cases/new">
            <Button icon={<PhoneIncoming className="size-4" />}>Log phone request</Button>
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open cases" value={kpis.open} icon={<ClipboardList className="size-5" />} onClick={() => update({ status: undefined, priority: undefined, sla: undefined, owner: undefined })} />
        <Kpi label="Urgent (≤ 2 days supply)" value={kpis.urgent} icon={<Zap className="size-5" />} tone="bad" active={priority === 'URGENT'} onClick={() => update({ priority: priority === 'URGENT' ? undefined : 'URGENT' })} />
        <Kpi label="SLA breached" value={kpis.breached} icon={<AlertOctagon className="size-5" />} tone="warn" active={sla === 'breached'} onClick={() => update({ sla: sla === 'breached' ? undefined : 'breached' })} />
        <Kpi label="Unassigned" value={kpis.unassigned} icon={<UserRoundX className="size-5" />} active={owner === 'unassigned'} onClick={() => update({ owner: owner === 'unassigned' ? undefined : 'unassigned' })} />
      </div>

      <div className="surface">
        <div className="px-3 pt-1">
          <Tabs<StatusTab> label="Status" value={status} onChange={(v) => update({ status: v === 'OPEN' ? undefined : v })} tabs={STATUS_TABS} />
        </div>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-end">
          <Input label="Search" placeholder="Patient, medication, case # or chart #" value={search} onChange={(e) => setSearch(e.target.value)} leading={<Search className="size-4" />} shellClassName="lg:flex-1" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
            <Select label="Blocker" value={blocker ?? ''} onChange={(e) => update({ blocker: e.target.value || undefined })}>
              <option value="">Any blocker</option>
              {BLOCKER_CODES.map((b) => (
                <option key={b} value={b}>
                  {BLOCKER_LABELS[b]}
                </option>
              ))}
            </Select>
            <Select label="Priority" value={priority ?? ''} onChange={(e) => update({ priority: e.target.value || undefined })}>
              <option value="">Any</option>
              <option value="URGENT">Urgent</option>
              <option value="ROUTINE">Routine</option>
            </Select>
            <Select label="Owner" value={owner ?? ''} onChange={(e) => update({ owner: e.target.value || undefined })}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
            </Select>
            <Select label="SLA" value={sla ?? ''} onChange={(e) => update({ sla: e.target.value || undefined })}>
              <option value="">Any</option>
              <option value="breached">Breached</option>
              <option value="at_risk">At risk</option>
              <option value="on_track">On track</option>
            </Select>
          </div>
        </div>
        {filtersActive && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-ice-50 px-4 py-2 text-[12.5px] text-ink-600">
            <Filter className="size-3.5" /> Filters active
            <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-50" onClick={() => { setSearch(''); setParams(status === 'OPEN' ? {} : { status }, { replace: true }); }}>
              <X className="size-3.5" /> Clear all
            </button>
          </div>
        )}
        <div className="p-4">
          {list.isLoading ? (
            <SkeletonRows rows={6} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} title="Couldn't load the queue" />
          ) : list.data!.data.length === 0 ? (
            filtersActive || status !== 'OPEN' ? (
              <EmptyState icon={<Search className="size-6" />} title="No cases match" description="Try a different filter or clear them." action={<Button variant="secondary" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={<Inbox className="size-6" />} title="No open refills" description="When a pharmacy sends a request, it lands here already triaged. Invite your pharmacies to start." action={<Link to="/settings/pharmacies"><Button>Invite your pharmacy</Button></Link>} />
            )
          ) : (
            <QueueTable data={list.data!} now={now} onOpen={(id) => navigate(`/cases/${id}`)} listParams={listParams} />
          )}
          {list.data && <Pagination page={page} limit={20} total={list.data.meta.total} onPage={(p) => update({ page: String(p) })} />}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, tone = 'brand', onClick, active }: { label: string; value: number; icon: React.ReactNode; tone?: 'brand' | 'bad' | 'warn'; onClick: () => void; active?: boolean }) {
  const tones = { brand: 'bg-brand-50 text-brand-700', bad: 'bg-bad-50 text-bad-600', warn: 'bg-warn-50 text-warn-600' };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('surface flex items-center gap-3 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]', active && 'ring-2 ring-brand-400')}
    >
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-display text-2xl font-semibold text-ink-900">{value}</span>
        <span className="block truncate text-[12.5px] text-ink-500">{label}</span>
      </span>
    </motion.button>
  );
}

function QueueTable({ data, now, onOpen, listParams }: { data: Paginated<CaseSummary>; now: number; onOpen: (id: string) => void; listParams: ListCasesParams }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  // Claim is a SAFE action → optimistic update with rollback (§9 F11).
  const claim = useMutation({
    mutationFn: (id: string) => refillService.claimCase(id),
    onMutate: async (id) => {
      const key = ['cases', listParams];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Paginated<CaseSummary>>(key);
      if (prev && user) qc.setQueryData(key, { ...prev, data: prev.data.map((r) => (r.id === id ? { ...r, ownerUserId: user.id, ownerName: user.name } : r)) });
      return { prev, key };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't claim", friendlyMessage(e));
    },
    onSuccess: () => toast.success('Claimed — it\'s yours now'),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['cases'] }),
  });

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-line md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-ice-50 text-[11.5px] uppercase tracking-wide text-ink-400">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Patient & medication</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Status & blockers</th>
              <th scope="col" className="hidden px-4 py-2.5 font-semibold xl:table-cell">Next action</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Owner</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {data.data.map((r, i) => (
              <motion.tr
                key={r.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.2) }}
                onClick={() => onOpen(r.id)}
                className="group cursor-pointer transition-colors hover:bg-brand-50/50"
              >
                <td className="px-4 py-3">
                  <Link to={`/cases/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink-900 group-hover:text-brand-800">
                    {r.patientName}
                  </Link>
                  <div className="flex items-center gap-2 text-[12.5px] text-ink-500">
                    <span className="font-mono text-brand-700">{r.caseNumber}</span>
                    <span className="truncate">{r.medication}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={r.status} />
                    <PriorityBadge priority={r.priority} />
                  </div>
                  {r.blockers.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.blockers.slice(0, 2).map((b) => (
                        <BlockerChip key={b} code={b} />
                      ))}
                      {r.blockers.length > 2 && <span className="text-[11.5px] text-ink-400">+{r.blockers.length - 2}</span>}
                    </div>
                  )}
                </td>
                <td className="hidden max-w-[220px] px-4 py-3 text-[13px] text-ink-600 xl:table-cell">{r.nextAction}</td>
                <td className="px-4 py-3">
                  {r.ownerName ? (
                    <span className="text-[13px] text-ink-700">{r.ownerName}</span>
                  ) : r.ownerRole === 'system' ? (
                    <span className="text-[13px] text-ink-400">Automatic</span>
                  ) : (
                    <Button size="sm" variant="secondary" icon={<Hand className="size-3.5" />} onClick={(e) => { e.stopPropagation(); claim.mutate(r.id); }}>
                      Claim
                    </Button>
                  )}
                  {r.escalationLevel > 0 && <div className="mt-0.5 text-[11.5px] font-medium text-bad-700">Escalated L{r.escalationLevel}</div>}
                </td>
                <td className="px-4 py-3">
                  <SlaBadge state={r.slaState} dueAt={r.dueAt} now={now} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <ul className="space-y-2.5 md:hidden">
        {data.data.map((r) => (
          <li key={r.id}>
            <Link to={`/cases/${r.id}`} className="block rounded-xl border border-line bg-white p-3.5 transition active:scale-[0.99]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.patientName}</p>
                  <p className="truncate text-[12.5px] text-ink-500">
                    <span className="font-mono text-brand-700">{r.caseNumber}</span> · {r.medication}
                  </p>
                </div>
                <PriorityBadge priority={r.priority} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <StatusBadge status={r.status} />
                {r.blockers.slice(0, 2).map((b) => (
                  <BlockerChip key={b} code={b} />
                ))}
              </div>
              <p className="mt-2 text-[13px] text-ink-600">{r.nextAction}</p>
              <div className="mt-2 flex items-center justify-between">
                <SlaBadge state={r.slaState} dueAt={r.dueAt} now={now} />
                <span className="text-[12px] text-ink-500">{r.ownerName ?? 'Unassigned'}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
