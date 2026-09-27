import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Building2, Check, ClipboardCheck, EyeOff, Phone } from 'lucide-react';
import type { PharmacyCaseDetail } from '@shared/dto.ts';
import type { CaseStatus, TransitionAction } from '@shared/types.ts';
import { StatusBadge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, KeyValue } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { cn, formatDateTime } from '@/lib/format';
import { ACTION_META, ActionConfirmDialog } from './ActionDialogs';
import { InfoRequestsPanel } from './CaseTabs';
import { useTransition } from './hooks';
import { Timeline } from './Timeline';

const PROGRESS: { label: string; states: CaseStatus[] }[] = [
  { label: 'Submitted', states: ['RECEIVED', 'NEEDS_PATIENT_MATCH', 'TRIAGE', 'WAITING_ON_INFO', 'WAITING_ON_INSURANCE'] },
  { label: 'Provider review', states: ['WAITING_ON_PROVIDER', 'WAITING_ON_PATIENT_VISIT'] },
  { label: 'Decision', states: ['APPROVED', 'DENIED'] },
  { label: 'At your pharmacy', states: ['SENT_TO_PHARMACY', 'PHARMACY_CONFIRMED', 'FILLING'] },
  { label: 'Ready / done', states: ['READY_FOR_PICKUP', 'DISPENSED', 'CLOSED'] },
];

/** Pharmacy-safe view (pharmacy_cases_v): initials + DOB year, medication, next step, public events only. */
export function PharmacyCaseView({ detail }: { detail: PharmacyCaseDetail }) {
  const c = detail.case;
  const toast = useToast();
  const transition = useTransition(c.id);
  const [dialog, setDialog] = useState<TransitionAction | null>(null);
  const idx = PROGRESS.findIndex((p) => p.states.includes(c.status));
  const direct: TransitionAction[] = ['PHARMACY_ACKNOWLEDGED', 'START_FILLING', 'MARK_READY'];
  const run = (action: TransitionAction) => (payload: Record<string, unknown>, key: string) =>
    transition.mutateAsync({ input: { action, version: c.version, payload }, key }).then((d) => {
      toast.success(`${ACTION_META[action]?.label ?? 'Updated'} — the practice can see it now`);
      return d;
    });

  return (
    <div>
      <Link to="/pharmacy/requests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700">
        <ArrowLeft className="size-4" /> Back to requests
      </Link>
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[12.5px] font-medium text-brand-800 ring-1 ring-line">{c.caseNumber}</span>
          <StatusBadge status={c.status} />
        </div>
        <h1 className="text-[26px] leading-tight text-brand-900 sm:text-[30px]">
          <span className="font-light">Patient</span> <span className="font-bold">{c.patientInitials}</span> <span className="font-light text-ink-500">· born {c.dobYear}</span>
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {c.medication}
          {c.quantity ? ` · qty ${c.quantity}` : ''} · {c.practiceName}
        </p>
      </motion.header>

      {/* Progress */}
      <Card className="mb-5 p-5">
        <ol className="grid grid-cols-5 gap-2" aria-label="Request progress">
          {PROGRESS.map((p, i) => {
            const done = i < idx || (c.status === 'CLOSED' && c.resolution === 'completed');
            const current = i === idx && !done;
            return (
              <li key={p.label} className="flex flex-col items-center gap-2 text-center">
                <span className={cn('relative flex size-8 items-center justify-center rounded-full text-[13px] font-semibold', done ? 'bg-brand-700 text-white' : current ? 'bg-white text-brand-700 ring-2 ring-brand-600' : 'bg-ice-200 text-ink-400')}>
                  {current && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-300" aria-hidden />}
                  <span className="relative">{done ? <Check className="size-4" /> : i + 1}</span>
                </span>
                <span className={cn('text-[11.5px] leading-tight sm:text-[12.5px]', current ? 'font-semibold text-brand-800' : 'text-ink-500')}>
                  {p.label}
                  {current && <span className="sr-only"> (current)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="What happens next" description={c.nextStep} icon={<ClipboardCheck className="size-4" />} />
            <div className="space-y-4 p-5">
              {c.approvedOrder && (
                <div className="rounded-xl border border-ok-600/25 bg-ok-50 p-4">
                  <p className="text-sm font-semibold text-ok-700">Approved order (new eRx)</p>
                  <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <KeyValue label="Drug">
                      {c.approvedOrder.medicationName} {c.approvedOrder.strength}
                    </KeyValue>
                    <KeyValue label="Quantity">{c.approvedOrder.quantity}</KeyValue>
                    <KeyValue label="Days supply">{c.approvedOrder.daysSupply}</KeyValue>
                    <KeyValue label="Refills">{c.approvedOrder.refills}</KeyValue>
                  </dl>
                </div>
              )}
              {c.denialNextStep && (
                <div className="rounded-xl border border-bad-600/25 bg-bad-50 p-4 text-sm">
                  <p className="font-semibold text-bad-700">Not approved</p>
                  <p className="mt-1 text-ink-700">Next step for the patient: {c.denialNextStep}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {detail.allowedActions
                  .filter((a) => ACTION_META[a])
                  .map((a) => {
                    const m = ACTION_META[a]!;
                    const isDirect = direct.includes(a);
                    return (
                      <Button
                        key={a}
                        variant={isDirect ? 'primary' : m.variant}
                        icon={m.icon}
                        loading={isDirect && transition.isPending && transition.variables?.input.action === a}
                        onClick={() => (isDirect ? void run(a)({}, crypto.randomUUID()).catch(() => undefined) : setDialog(a))}
                      >
                        {m.label}
                      </Button>
                    );
                  })}
              </div>
            </div>
          </Card>
          {detail.infoRequests.length > 0 && <InfoRequestsPanel caseId={c.id} requests={detail.infoRequests} canAnswer />}
          <Card>
            <CardHeader title="Activity" description="Updates shared with your pharmacy." />
            <div className="p-5">
              <Timeline caseId={c.id} showWhy={false} />
            </div>
          </Card>
        </div>
        <aside className="space-y-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Building2 className="size-4 text-brand-600" /> {c.practiceName}
            </h2>
            <a href={`tel:${c.practicePhone}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
              <Phone className="size-4" /> {c.practicePhone}
            </a>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <KeyValue label="Submitted">{formatDateTime(c.createdAt)}</KeyValue>
              <KeyValue label="Updated">{formatDateTime(c.updatedAt)}</KeyValue>
            </dl>
          </Card>
          <div className="flex gap-3 rounded-xl border border-line bg-white/70 p-4 text-[13px] text-ink-600">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
            <p>Minimum necessary: you see what you need to fill the prescription. Clinical notes, chart data and AI outputs stay with the practice.</p>
          </div>
        </aside>
      </div>
      {dialog && <ActionConfirmDialog action={dialog} open onClose={() => setDialog(null)} pending={transition.isPending} onConfirm={run(dialog)} />}
    </div>
  );
}
