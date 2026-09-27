// Status is NEVER shown by colour alone — every badge pairs colour with an icon and a text label.
import type { ReactNode } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  FileQuestion,
  FlaskConical,
  Hourglass,
  Inbox,
  Package,
  PackageCheck,
  Pill,
  RefreshCcw,
  Send,
  ShieldAlert,
  ShieldQuestion,
  Stethoscope,
  UserSearch,
  Users,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { STATUS_LABELS } from '@shared/domain/diagnosis.ts';
import type { BlockerCode, CaseStatus, Priority, SlaState } from '@shared/types.ts';
import { cn, dueIn } from '@/lib/format';

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info' | 'muted';
const tones: Record<Tone, string> = {
  neutral: 'bg-ice-100 text-ink-700 ring-line-strong',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  ok: 'bg-ok-50 text-ok-700 ring-ok-600/25',
  warn: 'bg-warn-50 text-warn-700 ring-warn-600/25',
  bad: 'bg-bad-50 text-bad-700 ring-bad-600/25',
  info: 'bg-info-50 text-info-700 ring-info-600/25',
  muted: 'bg-white text-ink-500 ring-line',
};

export function Badge({ tone = 'neutral', icon, children, className, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset', tones[tone], className)}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

const ic = 'size-3.5 shrink-0';
const STATUS_META: Record<CaseStatus, { tone: Tone; icon: ReactNode }> = {
  RECEIVED: { tone: 'info', icon: <Inbox className={ic} aria-hidden /> },
  NEEDS_PATIENT_MATCH: { tone: 'warn', icon: <UserSearch className={ic} aria-hidden /> },
  TRIAGE: { tone: 'info', icon: <CircleDashed className={ic} aria-hidden /> },
  WAITING_ON_INFO: { tone: 'warn', icon: <FileQuestion className={ic} aria-hidden /> },
  WAITING_ON_PROVIDER: { tone: 'brand', icon: <Stethoscope className={ic} aria-hidden /> },
  WAITING_ON_PATIENT_VISIT: { tone: 'warn', icon: <CalendarClock className={ic} aria-hidden /> },
  WAITING_ON_INSURANCE: { tone: 'warn', icon: <ShieldQuestion className={ic} aria-hidden /> },
  APPROVED: { tone: 'ok', icon: <CheckCircle2 className={ic} aria-hidden /> },
  DENIED: { tone: 'bad', icon: <XCircle className={ic} aria-hidden /> },
  SENT_TO_PHARMACY: { tone: 'info', icon: <Send className={ic} aria-hidden /> },
  PHARMACY_CONFIRMED: { tone: 'ok', icon: <PackageCheck className={ic} aria-hidden /> },
  FILLING: { tone: 'info', icon: <Pill className={ic} aria-hidden /> },
  READY_FOR_PICKUP: { tone: 'ok', icon: <Package className={ic} aria-hidden /> },
  DISPENSED: { tone: 'ok', icon: <CheckCircle2 className={ic} aria-hidden /> },
  CLOSED: { tone: 'muted', icon: <CheckCircle2 className={ic} aria-hidden /> },
  CANCELLED: { tone: 'muted', icon: <Ban className={ic} aria-hidden /> },
};

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} icon={m.icon} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export const BLOCKER_LABELS: Record<BlockerCode, string> = {
  NO_REFILLS_REMAINING: 'No refills remaining',
  NEW_RX_REQUIRED: 'New Rx required',
  VISIT_REQUIRED: 'Visit required',
  MISSING_INFO: 'Missing info',
  CONFLICTING_INFO: 'Conflicting info',
  CLINICAL_REVIEW: 'Clinical review',
  MED_DISCONTINUED: 'Med discontinued',
  CONTROLLED_SUBSTANCE: 'Controlled substance',
  INSURANCE_PA_REQUIRED: 'Prior auth needed',
  INSURANCE_NOT_COVERED: 'Not covered',
  INSURANCE_TOO_EARLY: 'Too early to refill',
  INSURANCE_CHANGED: 'Insurance changed',
  PATIENT_MATCH_UNCERTAIN: 'Patient match uncertain',
  DISPATCH_FAILED: 'Pharmacy unreachable',
};

const BLOCKER_META: Record<BlockerCode, { tone: Tone; icon: ReactNode }> = {
  NO_REFILLS_REMAINING: { tone: 'brand', icon: <RefreshCcw className={ic} aria-hidden /> },
  NEW_RX_REQUIRED: { tone: 'brand', icon: <Pill className={ic} aria-hidden /> },
  VISIT_REQUIRED: { tone: 'warn', icon: <CalendarClock className={ic} aria-hidden /> },
  MISSING_INFO: { tone: 'warn', icon: <FileQuestion className={ic} aria-hidden /> },
  CONFLICTING_INFO: { tone: 'warn', icon: <AlertTriangle className={ic} aria-hidden /> },
  CLINICAL_REVIEW: { tone: 'brand', icon: <FlaskConical className={ic} aria-hidden /> },
  MED_DISCONTINUED: { tone: 'bad', icon: <Ban className={ic} aria-hidden /> },
  CONTROLLED_SUBSTANCE: { tone: 'bad', icon: <ShieldAlert className={ic} aria-hidden /> },
  INSURANCE_PA_REQUIRED: { tone: 'info', icon: <ShieldQuestion className={ic} aria-hidden /> },
  INSURANCE_NOT_COVERED: { tone: 'info', icon: <ShieldQuestion className={ic} aria-hidden /> },
  INSURANCE_TOO_EARLY: { tone: 'info', icon: <Hourglass className={ic} aria-hidden /> },
  INSURANCE_CHANGED: { tone: 'info', icon: <ShieldQuestion className={ic} aria-hidden /> },
  PATIENT_MATCH_UNCERTAIN: { tone: 'warn', icon: <Users className={ic} aria-hidden /> },
  DISPATCH_FAILED: { tone: 'bad', icon: <WifiOff className={ic} aria-hidden /> },
};

export function BlockerChip({ code, source, className }: { code: BlockerCode; source?: string; className?: string }) {
  const m = BLOCKER_META[code];
  return (
    <Badge tone={m.tone} icon={m.icon} className={className} title={source ? `Raised by ${source}` : undefined}>
      {BLOCKER_LABELS[code]}
      {source && <span className="ml-1 font-mono text-[10.5px] opacity-70">{source}</span>}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority !== 'URGENT') return null;
  return (
    <Badge tone="bad" icon={<Zap className={ic} aria-hidden />}>
      Urgent
    </Badge>
  );
}

export function SlaBadge({ state, dueAt, now }: { state: SlaState; dueAt: string | null; now?: number }) {
  if (state === 'none') return <Badge tone="muted" icon={<CircleDot className={ic} aria-hidden />}>No SLA</Badge>;
  const text = dueIn(dueAt, now);
  if (state === 'breached') return <Badge tone="bad" icon={<AlertOctagon className={ic} aria-hidden />} title="SLA breached">Breached · {text}</Badge>;
  if (state === 'at_risk') return <Badge tone="warn" icon={<AlertTriangle className={ic} aria-hidden />} title="SLA at risk">At risk · {text}</Badge>;
  return <Badge tone="ok" icon={<Clock className={ic} aria-hidden />} title="SLA on track">On track · {text}</Badge>;
}
