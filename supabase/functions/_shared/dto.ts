// API contract (DTOs). The mock service and the real service return exactly these shapes.
import type { PatientRecord, PrescriptionRecord } from './records.ts';
import type {
  ActorType,
  Aal,
  BlockerCode,
  CaseBlocker,
  CaseSource,
  CaseStatus,
  DecisionType,
  OrgType,
  PracticePolicies,
  Priority,
  RequestedPayload,
  Resolution,
  Role,
  RuleId,
  SlaState,
  TransitionAction,
} from './types.ts';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}
export interface PageParams {
  page?: number;
  limit?: number;
}

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  timezone: string;
  phone: string;
  city: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgId: string;
  orgName: string;
  orgType: OrgType;
  title: string;
  mfaEnrolled: boolean;
  aal: Aal;
}

export interface ListCasesParams extends PageParams {
  status?: CaseStatus | 'OPEN' | 'ALL';
  blocker?: BlockerCode;
  priority?: Priority;
  owner?: 'me' | 'unassigned' | string;
  pharmacyId?: string;
  sla?: SlaState;
  search?: string;
  sort?: 'due' | 'updated' | 'priority';
}

export interface CaseSummary {
  id: string;
  caseNumber: string;
  patientName: string; // full for practice; initials for pharmacy
  medication: string;
  status: CaseStatus;
  resolution: Resolution | null;
  blockers: BlockerCode[];
  priority: Priority;
  ownerName: string | null;
  ownerRole: Role | 'system';
  ownerUserId: string | null;
  nextAction: string;
  dueAt: string | null;
  statusSince: string;
  slaState: SlaState;
  pharmacyName: string;
  practiceName: string;
  escalationLevel: number;
  source: CaseSource;
  updatedAt: string;
  createdAt: string;
  injectionSuspected: boolean;
}

export interface CaseEvent {
  id: string;
  caseId: string;
  actorType: ActorType;
  actorName: string;
  eventType: string;
  title: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus | null;
  reason: string | null;
  ruleIds: RuleId[];
  aiSuggestionId: string | null;
  promptVersion: string | null;
  requestId: string;
  public: boolean;
  createdAt: string;
}

export interface CaseNote {
  id: string;
  caseId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface CaseTask {
  id: string;
  caseId: string;
  type: 'call_pharmacy' | 'book_visit' | 'confirm_patient' | 'call_patient' | 'insurance' | 'bridge_runout' | 'review';
  title: string;
  assigneeRole: Role;
  assigneeName: string | null;
  status: 'open' | 'done' | 'cancelled';
  dueAt: string;
}

export interface InfoRequest {
  id: string;
  caseId: string;
  requestedFrom: 'pharmacy' | 'patient' | 'staff';
  questions: { id: string; text: string; answer: string | null }[];
  status: 'open' | 'partial' | 'answered';
  dueAt: string;
  createdAt: string;
}

export interface ProviderDecision {
  id: string;
  caseId: string;
  providerName: string;
  decision: DecisionType;
  medicationName: string;
  strength: string;
  quantity: number;
  daysSupply: number;
  refills: number;
  bridgeDays: number | null;
  reasonCode: string | null;
  patientNextStep: string | null;
  note: string | null;
  aal: Aal;
  confirmationHash: string;
  createdAt: string;
}

export interface PatientNotification {
  id: string;
  caseId: string;
  channel: 'sms' | 'email';
  template: string;
  text: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'quiet_hours';
  createdAt: string;
}

export interface OutboxMessage {
  id: string;
  caseId: string;
  channel: 'pharmacy' | 'sms' | 'email';
  template: string;
  status: 'pending' | 'sent' | 'failed' | 'dead' | 'cancelled';
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface PatientMatch {
  id: string;
  name: string;
  dob: string;
  chartNumber: string;
  phoneLast4: string | null;
  lastVisit: string | null;
}

export interface PracticeCaseDetail {
  view: 'practice';
  case: CaseSummary & {
    blockerDetails: CaseBlocker[];
    requestedPayload: RequestedPayload;
    linkedCaseId: string | null;
    linkedCaseNumber: string | null;
    version: number;
    practiceOrgId: string;
    pharmacyOrgId: string;
    cancelReason: string | null;
  };
  patient: PatientRecord | null;
  patientAge: number | null;
  prescription: PrescriptionRecord | null;
  lastVisit: string | null;
  lastA1c: string | null;
  pharmacy: Organization;
  priorCases: { id: string; caseNumber: string; status: CaseStatus; createdAt: string }[];
  matchCandidates: PatientMatch[];
  conflicts: { field: string; reported: string; chart: string }[];
  notes: CaseNote[];
  tasks: CaseTask[];
  infoRequests: InfoRequest[];
  decisions: ProviderDecision[];
  notifications: PatientNotification[];
  outbox: OutboxMessage[];
  allowedActions: TransitionAction[];
  suggestedAction: TransitionAction | null;
}

export interface PharmacyCaseDetail {
  view: 'pharmacy';
  case: {
    id: string;
    caseNumber: string;
    status: CaseStatus;
    resolution: Resolution | null;
    patientInitials: string;
    dobYear: string;
    medication: string;
    quantity: number | null;
    nextStep: string;
    practiceName: string;
    practicePhone: string;
    version: number;
    updatedAt: string;
    createdAt: string;
    approvedOrder: { medicationName: string; strength: string; quantity: number; daysSupply: number; refills: number } | null;
    denialNextStep: string | null;
  };
  infoRequests: InfoRequest[];
  allowedActions: TransitionAction[];
}

export type CaseDetail = PracticeCaseDetail | PharmacyCaseDetail;

export interface CaseDiagnosis {
  status: CaseStatus;
  timeInState: string;
  headline: string;
  blockers: CaseBlocker[];
  ownerLabel: string;
  waitingFor: string;
  lastAttempt: string | null;
  nextAutomaticAction: string | null;
  slaState: SlaState;
  dueAt: string | null;
}

export interface TransitionInput {
  action: TransitionAction;
  version: number;
  payload?: Record<string, unknown>;
}

export interface FieldExtraction {
  value: string;
  confidence: number;
  sourceSpan: string | null;
}

export interface IntakeExtraction {
  suggestionId: string;
  mock: boolean;
  fields: Partial<Record<
    'patientFirstName' | 'patientLastName' | 'patientDob' | 'patientPhone' | 'medicationName' | 'strength' | 'quantity' | 'sig' | 'pharmacyName' | 'prescriberName' | 'notes',
    FieldExtraction
  >>;
  injectionSuspected: boolean;
  unreadable: boolean;
  latencyMs: number;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

export interface AiSummary {
  suggestionId: string;
  mock: boolean;
  bullets: { text: string; sourceRefs: { label: string; ref: string }[] }[];
  promptVersion: string;
}

export interface AiNextAction {
  suggestionId: string;
  mock: boolean;
  action: TransitionAction | null;
  reason: string;
}

export interface AiPatientMessage {
  suggestionId: string;
  mock: boolean;
  smsText: string;
  emailText: string;
}

export type AiOutcome = 'accepted' | 'edited' | 'rejected';

export interface PatientStatusView {
  clinicName: string;
  clinicPhone: string;
  pharmacyName: string;
  firstName: string;
  step: 1 | 2 | 3 | 4 | 5;
  stepLabel: string;
  actionNeeded: boolean;
  headline: string;
  nextStep: string;
  updatedAt: string;
  closed: boolean;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface AnalyticsSummary {
  northStarPct: number;
  medianHoursToConfirm: number;
  touchesPerRefill: number;
  infoRoundTrips: number;
  slaBreachRate: number;
  aiAcceptanceRate: number;
  openCases: number;
  resolvedCases: number;
  casesByStatus: { status: CaseStatus; count: number }[];
  topBlockers: { code: BlockerCode; count: number }[];
  weekly: { week: string; resolved: number; within48h: number }[];
  byPharmacy: { name: string; cases: number; medianAckHours: number }[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'invited' | 'active' | 'removed';
  mfaEnrolled: boolean;
  lastActive: string | null;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  token: string; // shown once in the mock (would be emailed)
}

export interface PharmacyLink {
  id: string;
  pharmacyName: string;
  practiceName: string;
  status: 'pending' | 'active' | 'revoked';
  city: string;
  casesLast30d: number;
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  requestId: string;
  createdAt: string;
}

export interface SimulatorState {
  pharmacyDownUntil: string | null;
  smsDown: boolean;
  clockOffsetMinutes: number;
}

export type { PracticePolicies };
