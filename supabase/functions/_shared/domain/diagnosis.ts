// "Why is this stuck?" — computed diagnosis panel (master prompt §5.8). Pure.
import type { CaseDiagnosis, OutboxMessage } from '../dto.ts';
import type { CaseBlocker, CaseStatus } from '../types.ts';
import { formatDuration, slaState } from './sla.ts';

export const STATUS_LABELS: Record<CaseStatus, string> = {
  RECEIVED: 'Received',
  NEEDS_PATIENT_MATCH: 'Needs patient match',
  TRIAGE: 'Triage',
  WAITING_ON_INFO: 'Waiting on info',
  WAITING_ON_PROVIDER: 'Waiting on provider',
  WAITING_ON_PATIENT_VISIT: 'Waiting on visit',
  WAITING_ON_INSURANCE: 'Waiting on insurance',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  SENT_TO_PHARMACY: 'Sent to pharmacy',
  PHARMACY_CONFIRMED: 'Pharmacy confirmed',
  FILLING: 'Filling',
  READY_FOR_PICKUP: 'Ready for pickup',
  DISPENSED: 'Dispensed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const WAITING_FOR: Record<CaseStatus, string> = {
  RECEIVED: 'the system to match the patient',
  NEEDS_PATIENT_MATCH: 'staff to confirm which patient this is',
  TRIAGE: 'staff to review the blockers and route the case',
  WAITING_ON_INFO: 'answers to the information request',
  WAITING_ON_PROVIDER: 'a provider decision',
  WAITING_ON_PATIENT_VISIT: 'the patient to complete a visit',
  WAITING_ON_INSURANCE: 'the insurance issue to be resolved',
  APPROVED: 'the approval to be delivered to the pharmacy',
  DENIED: 'the pharmacy and patient to be notified',
  SENT_TO_PHARMACY: 'the pharmacy to confirm receipt',
  PHARMACY_CONFIRMED: 'the pharmacy to start filling',
  FILLING: 'the pharmacy to finish filling',
  READY_FOR_PICKUP: 'the patient to pick up',
  DISPENSED: 'automatic completion',
  CLOSED: 'nothing — this case is closed',
  CANCELLED: 'nothing — this case was cancelled',
};

export function buildDiagnosis(params: {
  status: CaseStatus;
  statusSince: string;
  blockers: CaseBlocker[];
  ownerLabel: string;
  dueAt: string | null;
  escalationLevel: number;
  escalateToLabel: string | null;
  outbox: OutboxMessage[];
  now: Date;
  pharmacyName: string;
}): CaseDiagnosis {
  const { status, statusSince, blockers, ownerLabel, dueAt, now } = params;
  const inState = formatDuration(now.getTime() - new Date(statusSince).getTime());
  const sla = slaState({ statusSince, dueAt, now });

  const pharmacyMsgs = params.outbox.filter((m) => m.channel === 'pharmacy');
  const last = pharmacyMsgs[pharmacyMsgs.length - 1] ?? params.outbox[params.outbox.length - 1] ?? null;
  let lastAttempt: string | null = null;
  if (last) {
    if (last.status === 'dead') lastAttempt = `Pharmacy message failed ${last.attempts}× — ${last.lastError ?? 'pharmacy system unreachable'}. Handed to staff.`;
    else if (last.status === 'failed') lastAttempt = `Pharmacy message failed ${last.attempts}× — ${last.lastError ?? 'unreachable'}. Retrying automatically.`;
    else if (last.status === 'sent') lastAttempt = `${last.channel === 'pharmacy' ? 'Pharmacy message' : 'Patient message'} delivered.`;
    else if (last.status === 'pending') lastAttempt = 'Message queued for delivery.';
  }

  let nextAutomaticAction: string | null = null;
  if (status === 'CLOSED' || status === 'CANCELLED') nextAutomaticAction = null;
  else if (last && last.status === 'failed' && last.nextAttemptAt)
    nextAutomaticAction = `Retry #${last.attempts + 1} at ${fmtTime(last.nextAttemptAt)}.`;
  else if (dueAt && params.escalateToLabel)
    nextAutomaticAction = `${sla === 'breached' ? 'Escalated' : 'Escalates'} to ${params.escalateToLabel} ${sla === 'breached' ? '(SLA breached)' : `at ${fmtTime(dueAt)}`}.`;
  else if (dueAt) nextAutomaticAction = `SLA due at ${fmtTime(dueAt)}.`;

  const headline =
    status === 'SENT_TO_PHARMACY'
      ? `Waiting for ${params.pharmacyName} to confirm receipt for ${inState}`
      : status === 'CLOSED' || status === 'CANCELLED'
        ? `${STATUS_LABELS[status]} — no further action`
        : `${STATUS_LABELS[status]} for ${inState}`;

  return {
    status,
    timeInState: inState,
    headline,
    blockers,
    ownerLabel,
    waitingFor: WAITING_FOR[status],
    lastAttempt,
    nextAutomaticAction,
    slaState: sla,
    dueAt,
  };
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
