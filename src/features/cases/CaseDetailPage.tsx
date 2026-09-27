import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileWarning,
  Hand,
  Link2,
  Phone,
  Pill,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import type { PharmacyCaseDetail, PracticeCaseDetail } from '@shared/dto.ts';
import { can, ROLE_LABELS } from '@shared/domain/permissions.ts';
import { CLINICAL_BLOCKERS, type TransitionAction } from '@shared/types.ts';
import { friendlyMessage, refillService } from '@/services';
import { ApiError } from '@/services/errors';
import { useAuth } from '@/app/auth-context';
import { BlockerChip, PriorityBadge, SlaBadge, StatusBadge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Card, CardHeader, KeyValue, Tabs } from '@/components/ui/Layout';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { cn, formatDate, formatDob } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { ACTION_META, ActionConfirmDialog, RequestInfoDialog } from './ActionDialogs';
import { AiSummaryCard } from './AiSummaryCard';
import { DeliveriesTab, InfoRequestsPanel, MessagesTab, NotesTab, RequestTab, TasksTab } from './CaseTabs';
import { DiagnosisPanel } from './DiagnosisPanel';
import { useCase, useInvalidateCase, useTransition } from './hooks';
import { PatientMatchPanel } from './PatientMatchPanel';
import { PharmacyCaseView } from './PharmacyCaseView';
import { Timeline } from './Timeline';

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const q = useCase(caseId);
  if (q.isLoading) return <CaseDetailSkeleton />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.code === 'NOT_FOUND') return <CaseNotFound />;
    return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn't load this case" />;
  }
  const d = q.data!;
  return d.view === 'practice' ? <PracticeCaseView detail={d} /> : <PharmacyCaseView detail={d as PharmacyCaseDetail} />;
}

function CaseNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-light text-brand-900">Case not found</h1>
      <p className="mt-2 text-sm text-ink-500">It may not exist, or it belongs to another organisation.</p>
      <Link to="/" className="mt-6 inline-block">
        <Button variant="secondary" icon={<ArrowLeft className="size-4" />}>
          Go back
        </Button>
      </Link>
    </div>
  );
}

type TabKey = 'timeline' | 'notes' | 'tasks' | 'messages' | 'request' | 'deliveries';

function PracticeCaseView({ detail }: { detail: PracticeCaseDetail }) {
  const c = detail.case;
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const [tab, setTab] = useState<TabKey>('timeline');
  const openTasks = detail.tasks.filter((t) => t.status === 'open').length;

  return (
    <div>
      <Link to={user?.role === 'provider' ? '/provider/inbox' : '/queue'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-brand-700">
        <ArrowLeft className="size-4" /> Back to {user?.role === 'provider' ? 'inbox' : 'queue'}
      </Link>

      {/* Header */}
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[12.5px] font-medium text-brand-800 ring-1 ring-line">{c.caseNumber}</span>
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
            <SlaBadge state={c.slaState} dueAt={c.dueAt} now={now} />
            {c.escalationLevel > 0 && <span className="rounded-full bg-bad-50 px-2 py-0.5 text-[12px] font-medium text-bad-700 ring-1 ring-bad-600/20">Escalation level {c.escalationLevel}</span>}
          </div>
          <h1 className="text-[26px] leading-tight text-brand-900 sm:text-[30px]">
            <span className="font-bold">{c.patientName}</span>
            {detail.patientAge !== null && <span className="font-light">, {detail.patientAge}</span>}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <Pill className="size-4 text-brand-500" aria-hidden /> {c.medication}
            </span>
            {detail.patient && <span className="font-mono text-[12.5px] text-ink-500">{detail.patient.chartNumber}</span>}
            <span>via {detail.pharmacy.name}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OwnerControls detail={detail} />
          {user?.role === 'provider' && c.status === 'WAITING_ON_PROVIDER' && (
            <Button icon={<Stethoscope className="size-4" />} onClick={() => navigate(`/provider/inbox/${c.id}`)}>
              Review &amp; decide
            </Button>
          )}
        </div>
      </motion.header>

      {/* Safety banners */}
      <div className="space-y-3">
        {c.injectionSuspected && (
          <Banner tone="bad" icon={<ShieldAlert className="size-5" />} title="This document contains unusual instructions. Review carefully.">
            Text that looks like instructions to the system (for example "approve immediately") was found in the request. It was treated as data only — the AI cannot take actions, and only a provider can decide.
          </Banner>
        )}
        {c.blockers.includes('CONTROLLED_SUBSTANCE') && (
          <Banner tone="bad" icon={<ShieldAlert className="size-5" />} title="Controlled substance: provider must review">
            Handled by rules only — AI makes no suggestions on this case.
            {c.blockerDetails.some((b) => b.code === 'NEW_RX_REQUIRED' && b.source === 'R5') && ' Schedule II cannot be refilled; a new prescription is needed.'}
          </Banner>
        )}
        {c.linkedCaseId && (
          <Banner tone="info" icon={<Link2 className="size-5" />} title={`This request was added to case ${c.linkedCaseNumber}`}>
            <Link to={`/cases/${c.linkedCaseId}`} className="font-medium text-info-700 underline underline-offset-2">
              Open {c.linkedCaseNumber}
            </Link>
          </Banner>
        )}
        {detail.conflicts.length > 0 && <ConflictsPanel conflicts={detail.conflicts} />}
        {c.status === 'NEEDS_PATIENT_MATCH' && <PatientMatchPanel detail={detail} />}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <ActionsCard detail={detail} />
          {detail.infoRequests.length > 0 && <InfoRequestsPanel caseId={c.id} requests={detail.infoRequests} canAnswer={can(user!.role, 'case.requestInfo')} />}
          <Card>
            <div className="px-3 pt-1">
              <Tabs<TabKey>
                label="Case sections"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'timeline', label: 'Timeline' },
                  { value: 'notes', label: 'Notes', count: detail.notes.length },
                  { value: 'tasks', label: 'Tasks', count: openTasks },
                  { value: 'messages', label: 'Patient messages', count: detail.notifications.length },
                  { value: 'request', label: 'Original request' },
                  { value: 'deliveries', label: 'Deliveries' },
                ]}
              />
            </div>
            <div className="p-5">
              {tab === 'timeline' && <Timeline caseId={c.id} />}
              {tab === 'notes' && <NotesTab detail={detail} />}
              {tab === 'tasks' && <TasksTab detail={detail} />}
              {tab === 'messages' && <MessagesTab detail={detail} />}
              {tab === 'request' && <RequestTab detail={detail} />}
              {tab === 'deliveries' && <DeliveriesTab detail={detail} />}
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <DiagnosisPanel caseId={c.id} />
          {detail.patient && <AiSummaryCard caseId={c.id} version={c.version} onSourceClick={() => setTab('request')} />}
          <FactsCard detail={detail} />
        </aside>
      </div>
    </div>
  );
}

function Banner({ tone, icon, title, children }: { tone: 'bad' | 'info' | 'warn'; icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  const tones = { bad: 'border-bad-600/25 bg-bad-50 text-bad-700', info: 'border-info-600/25 bg-info-50 text-info-700', warn: 'border-warn-600/25 bg-warn-50 text-warn-700' };
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role={tone === 'bad' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-4', tones[tone])}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-[13px] text-ink-700">{children}</div>}
      </div>
    </motion.div>
  );
}

function ConflictsPanel({ conflicts }: { conflicts: PracticeCaseDetail['conflicts'] }) {
  return (
    <section aria-labelledby="conflicts" className="rounded-xl border border-warn-600/30 bg-warn-50/60 p-4">
      <h2 id="conflicts" className="flex items-center gap-2 text-sm font-semibold text-warn-700">
        <FileWarning className="size-4" /> Conflicting information (R8)
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ice-50 text-left text-[11.5px] uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Pharmacy says</th>
              <th className="px-3 py-2">Chart says</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((c) => (
              <tr key={c.field} className="border-t border-line">
                <td className="px-3 py-2 text-ink-600">{c.field}</td>
                <td className="px-3 py-2 font-semibold text-warn-700">{c.reported}</td>
                <td className="px-3 py-2 font-semibold text-brand-800">{c.chart}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OwnerControls({ detail }: { detail: PracticeCaseDetail }) {
  const { user } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateCase();
  const [assigning, setAssigning] = useState(false);
  const users = useQuery({ queryKey: ['assignable'], queryFn: () => refillService.listAssignableUsers(), enabled: assigning });
  const claim = useMutation({
    mutationFn: () => refillService.claimCase(detail.case.id),
    onSuccess: (d) => {
      invalidate(detail.case.id, d);
      toast.success('You own this case now');
    },
    onError: (e) => toast.error("Couldn't claim", friendlyMessage(e)),
  });
  const assign = useMutation({
    mutationFn: (userId: string) => refillService.assignCase(detail.case.id, userId),
    onSuccess: (d) => {
      invalidate(detail.case.id, d);
      setAssigning(false);
      toast.success('Case reassigned');
    },
    onError: (e) => toast.error("Couldn't assign", friendlyMessage(e)),
  });
  if (!user || !can(user.role, 'case.claim') || ['CLOSED', 'CANCELLED'].includes(detail.case.status)) return null;
  const mine = detail.case.ownerUserId === user.id;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!mine && (
        <Button variant="secondary" icon={<Hand className="size-4" />} loading={claim.isPending} onClick={() => claim.mutate()}>
          Claim
        </Button>
      )}
      {assigning ? (
        <Select label="Assign to" hideLabel className="h-10 w-48" defaultValue="" onChange={(e) => e.target.value && assign.mutate(e.target.value)} disabled={users.isLoading || assign.isPending}>
          <option value="" disabled>
            {users.isLoading ? 'Loading…' : 'Assign to…'}
          </option>
          {(users.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} — {ROLE_LABELS[u.role]}
            </option>
          ))}
        </Select>
      ) : (
        <Button variant="ghost" icon={<UserRound className="size-4" />} onClick={() => setAssigning(true)}>
          Assign
        </Button>
      )}
    </div>
  );
}

function ActionsCard({ detail }: { detail: PracticeCaseDetail }) {
  const c = detail.case;
  const { user } = useAuth();
  const toast = useToast();
  const transition = useTransition(c.id);
  const [dialog, setDialog] = useState<TransitionAction | null>(null);
  const suggestion = useMutation({ mutationFn: () => refillService.suggestNextAction(c.id), onError: (e) => toast.warning('AI assist unavailable', e instanceof ApiError && e.code === 'AI_UNAVAILABLE' ? 'Rules still work — choose an action below.' : friendlyMessage(e)) });
  const actions = detail.allowedActions.filter((a) => a !== 'DECIDE' && a !== 'CONFIRM_PATIENT_MATCH' && ACTION_META[a]);
  const hasClinical = c.blockers.some((b) => CLINICAL_BLOCKERS.includes(b));
  const run = (action: TransitionAction) => (payload: Record<string, unknown>, key: string) =>
    transition.mutateAsync({ input: { action, version: c.version, payload }, key }).then((d) => {
      toast.success(`${ACTION_META[action]?.label ?? 'Done'} — saved`);
      return d;
    });
  const irSuggestions = c.blockerDetails.filter((b) => b.code === 'MISSING_INFO').length
    ? c.requestedPayload.strength
      ? ['What quantity are you requesting?']
      : ['What strength is the patient taking?', 'What quantity are you requesting?']
    : c.blockers.includes('CONFLICTING_INFO')
      ? detail.conflicts.map((x) => `Please confirm ${x.field.toLowerCase()}: you sent ${x.reported}, our chart shows ${x.chart}.`)
      : [];

  const isTerminal = c.status === 'CLOSED' || c.status === 'CANCELLED';
  return (
    <Card>
      <CardHeader
        title="Next step"
        description={isTerminal ? (c.resolution ? `Closed — ${c.resolution.replace(/_/g, ' ')}` : `Cancelled${c.cancelReason ? ` — ${c.cancelReason.replace(/_/g, ' ')}` : ''}`) : c.nextAction}
        icon={<Sparkles className="size-4" />}
        action={
          !isTerminal && user && can(user.role, 'case.route') && actions.length > 0 ? (
            <Button size="sm" variant="subtle" icon={<Sparkles className="size-3.5" />} loading={suggestion.isPending} onClick={() => suggestion.mutate()}>
              Suggest
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4 p-5">
        {c.blockerDetails.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {c.blockerDetails.map((b) => (
              <BlockerChip key={b.code} code={b.code} source={b.source} />
            ))}
          </div>
        )}
        {detail.suggestedAction && actions.includes(detail.suggestedAction) && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-[13px] text-brand-800">
            Rules suggest: <strong>{ACTION_META[detail.suggestedAction]?.label}</strong>. You confirm — nothing happens automatically.
          </p>
        )}
        {suggestion.data && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-info-600/20 bg-info-50 px-3 py-2.5 text-[13px] text-info-700">
            <p className="flex items-center gap-1.5 font-medium">
              <Sparkles className="size-3.5" /> Demo AI (mock): {suggestion.data.action ? ACTION_META[suggestion.data.action]?.label : 'No suggestion'}
            </p>
            <p className="mt-0.5 text-ink-700">{suggestion.data.reason}</p>
            {suggestion.data.action && actions.includes(suggestion.data.action) && (
              <button
                type="button"
                className="mt-1.5 text-[12.5px] font-semibold text-info-700 underline underline-offset-2"
                onClick={() => {
                  void refillService.recordAiOutcome(suggestion.data!.suggestionId, 'accepted');
                  setDialog(suggestion.data!.action);
                }}
              >
                Use this suggestion
              </button>
            )}
          </motion.div>
        )}
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => {
              const m = ACTION_META[a]!;
              const suggested = detail.suggestedAction === a;
              return (
                <Button key={a} variant={suggested ? 'primary' : m.variant === 'primary' ? 'secondary' : m.variant} icon={m.icon} onClick={() => setDialog(a)} className={cn(suggested && 'ring-2 ring-brand-300 ring-offset-2')}>
                  {m.label}
                </Button>
              );
            })}
          </div>
        ) : (
          !isTerminal && <p className="text-sm text-ink-500">{c.status === 'WAITING_ON_PROVIDER' ? (user?.role === 'provider' ? 'Open the decision panel to decide.' : 'Waiting for the provider. Only providers can make clinical decisions.') : 'No manual action needed right now — RefillBridge is handling the next step.'}</p>
        )}
      </div>
      {dialog === 'REQUEST_INFO' ? (
        <RequestInfoDialog
          open
          onClose={() => setDialog(null)}
          pending={transition.isPending}
          pharmacyName={detail.pharmacy.name}
          suggestions={irSuggestions}
          onSubmit={(input, key) => run('REQUEST_INFO')({ ...input }, key)}
        />
      ) : (
        dialog && (
          <ActionConfirmDialog
            action={dialog}
            open
            onClose={() => setDialog(null)}
            pending={transition.isPending}
            onConfirm={run(dialog)}
            requireReasonOverride={dialog === 'ROUTE_TO_PROVIDER' && !hasClinical ? { label: 'Why does the provider need to review?', placeholder: 'e.g. Patient reports new side effects' } : undefined}
          />
        )
      )}
    </Card>
  );
}

function FactsCard({ detail }: { detail: PracticeCaseDetail }) {
  const p = detail.patient;
  const rx = detail.prescription;
  const statusLink = useMutation({ mutationFn: () => refillService.getDemoStatusLink(detail.case.id), onSuccess: (link) => link && window.open(link, '_blank', 'noopener') });
  return (
    <Card>
      <CardHeader title="Patient & prescription" icon={<UserRound className="size-4" />} />
      <div className="space-y-4 p-5">
        {p ? (
          <dl className="grid grid-cols-2 gap-3">
            <KeyValue label="DOB">{formatDob(p.dob)}</KeyValue>
            <KeyValue label="Chart" mono>
              {p.chartNumber}
            </KeyValue>
            <KeyValue label="Phone">
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5 text-ink-400" /> {p.phone ?? '—'}
              </span>
            </KeyValue>
            <KeyValue label="Contact">{p.smsOptOut ? 'Email (SMS opt-out)' : p.preferredChannel.toUpperCase()}</KeyValue>
            <KeyValue label="Last visit">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5 text-ink-400" /> {formatDate(detail.lastVisit)}
              </span>
            </KeyValue>
            {detail.lastA1c && <KeyValue label="Last A1c">{formatDate(detail.lastA1c)}</KeyValue>}
          </dl>
        ) : (
          <p className="flex items-center gap-2 text-sm text-warn-700">
            <AlertTriangle className="size-4" /> Patient not confirmed yet.
          </p>
        )}
        {rx && (
          <div className="rounded-xl bg-ice-50 p-3.5">
            <p className="text-sm font-semibold text-ink-900">
              {rx.medicationName} {rx.strength} <span className="font-normal text-ink-500">{rx.form}</span>
            </p>
            <p className="mt-0.5 text-[13px] text-ink-600">{rx.sig}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <KeyValue label="Qty">{rx.quantity}</KeyValue>
              <KeyValue label="Refills left">
                <span className={rx.refillsRemaining === 0 ? 'font-semibold text-bad-700' : ''}>{rx.refillsRemaining}</span>
              </KeyValue>
              <KeyValue label="Last fill">{formatDate(rx.lastFillAt, { month: 'short', day: 'numeric' })}</KeyValue>
            </dl>
            <p className="mt-2 text-[12px] text-ink-500">
              {rx.controlledSchedule ? `Schedule ${rx.controlledSchedule} · ` : ''}
              {rx.status !== 'active' ? `Status: ${rx.status} · ` : ''}Written {formatDate(rx.writtenAt)}
            </p>
          </div>
        )}
        {detail.priorCases.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-400">Other requests (12 months)</p>
            <ul className="space-y-1">
              {detail.priorCases.slice(0, 4).map((pc) => (
                <li key={pc.id}>
                  <Link to={`/cases/${pc.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-ice-100">
                    <span className="font-mono text-brand-700">{pc.caseNumber}</span>
                    <StatusBadge status={pc.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {p && (
          <Button variant="ghost" size="sm" icon={<ExternalLink className="size-3.5" />} loading={statusLink.isPending} onClick={() => statusLink.mutate()} className="w-full">
            Open patient status page (demo)
          </Button>
        )}
      </div>
    </Card>
  );
}

function CaseDetailSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <Skeleton className="h-4 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-9 w-80" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
