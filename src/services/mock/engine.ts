// In-memory mock back end. It mirrors what transition_case(), the outbox worker and the SLA worker
// will do in Postgres/Edge Functions, using the SAME shared domain code (state machine, rules, SLA).
// Nothing here is persisted to browser storage (H7) — refreshing the page resets the demo.
import type {
  AuditLogEntry,
  CaseEvent,
  CaseNote,
  CaseTask,
  InfoRequest,
  Organization,
  OutboxMessage,
  PatientNotification,
  PharmacyLink,
  ProviderDecision,
} from '@shared/dto.ts';
import type { EncounterRecord, ObservationRecord, PatientRecord, PrescriptionRecord } from '@shared/records.ts';
import { orderConfirmationHash } from '@shared/domain/confirmation.ts';
import { checkTransition, isTerminal } from '@shared/domain/state-machine.ts';
import { computeDueAt, DEFAULT_BUSINESS_HOURS, DEFAULT_POLICIES, slaWindowFor } from '@shared/domain/sla.ts';
import { matchPatient, runTriage } from '@shared/domain/triage-rules.ts';
import { STATUS_LABELS } from '@shared/domain/diagnosis.ts';
import { decisionSchema, infoRequestSchema, reasonSchema } from '@shared/schemas/index.ts';
import type {
  Aal,
  Actor,
  ActorType,
  CaseBlocker,
  CaseSource,
  CaseStatus,
  PracticePolicies,
  Priority,
  RequestedPayload,
  Resolution,
  Role,
  RuleId,
  TransitionAction,
} from '@shared/types.ts';
import { CLINICAL_BLOCKERS, DATA_BLOCKERS, INSURANCE_BLOCKERS } from '@shared/types.ts';
import { ApiError, newRequestId } from '../errors';
import type { UserFixture } from '@/mocks/data/fixtures';

const MIN = 60_000;
const DAY = 86_400_000;
const RETRY_BACKOFF_MIN = [1, 5, 30, 120];
const MAX_ATTEMPTS = 5;

export interface UserRow extends UserFixture {
  password: string;
  status: 'invited' | 'active' | 'removed';
  lastActive: string | null;
}

export interface CaseRow {
  id: string;
  caseNumber: string;
  practiceOrgId: string;
  pharmacyOrgId: string;
  patientId: string | null;
  prescriptionId: string | null;
  source: CaseSource;
  status: CaseStatus;
  resolution: Resolution | null;
  blockers: CaseBlocker[];
  priority: Priority;
  ownerUserId: string | null;
  ownerRole: Role | 'system';
  nextAction: string;
  dueAt: string | null;
  statusSince: string;
  escalationLevel: number;
  requestedPayload: RequestedPayload;
  injectionSuspected: boolean;
  linkedCaseId: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  cancelReason: string | null;
  conflicts: { field: string; reported: string; chart: string }[];
  matchCandidateIds: string[];
  suggestedAction: TransitionAction | null;
}

export interface OutboxRow extends OutboxMessage {
  pharmacyOrgId: string;
  notificationId: string | null;
  idempotencyKey: string;
}

export interface InfoRequestRow extends InfoRequest {
  responseToken: string;
}

export interface AiSuggestionRow {
  id: string;
  caseId: string | null;
  orgId: string;
  feature: 'AI-1' | 'AI-2' | 'AI-3' | 'AI-4' | 'AI-5';
  model: string;
  promptVersion: string;
  inputHash: string;
  output: unknown;
  valid: boolean;
  latencyMs: number;
  outcome: 'accepted' | 'edited' | 'rejected' | null;
  createdAt: string;
}

export interface StatusTokenRow {
  caseId: string;
  token: string; // DEMO ONLY: the real DB stores SHA-256(token + pepper), never the token.
  expiresAt: string;
  failedAttempts: number;
  lockedAt: string | null;
}

export interface InviteRow {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: string;
  usedAt: string | null;
  invitedBy: string;
}

export interface LinkRow extends PharmacyLink {
  practiceOrgId: string;
  pharmacyOrgId: string;
}

export interface SimState {
  pharmacyDownUntil: string | null;
  smsDown: boolean;
  quietHours: boolean;
}

export interface Db {
  orgs: Organization[];
  users: UserRow[];
  patients: PatientRecord[];
  prescriptions: PrescriptionRecord[];
  encounters: EncounterRecord[];
  observations: ObservationRecord[];
  cases: CaseRow[];
  events: CaseEvent[];
  notes: CaseNote[];
  tasks: (CaseTask & { orgId: string })[];
  infoRequests: InfoRequestRow[];
  decisions: ProviderDecision[];
  notifications: PatientNotification[];
  outbox: OutboxRow[];
  ai: AiSuggestionRow[];
  statusTokens: StatusTokenRow[];
  audit: (AuditLogEntry & { orgId: string })[];
  invites: InviteRow[];
  links: LinkRow[];
  policies: Record<string, PracticePolicies>;
  heartbeats: Record<string, string>;
  nextCaseNumber: number;
}

export interface ActorCtx {
  actor: Actor;
  userId: string | null;
  name: string;
  actorType: ActorType;
  requestId: string;
}

export const SYSTEM: ActorCtx = { actor: { kind: 'system' }, userId: null, name: 'RefillBridge', actorType: 'system', requestId: 'system' };

let idCounter = 0;
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const PUBLIC_EVENTS = new Set([
  'case.created',
  'case.duplicate',
  'match.rejected',
  'info.requested_pharmacy',
  'info.answered',
  'decision.approved',
  'decision.denied',
  'decision.visit_required',
  'dispatch.sent',
  'pharmacy.acknowledged',
  'pharmacy.filling',
  'pharmacy.ready',
  'pharmacy.dispensed',
  'case.closed',
  'case.cancelled',
  'case.withdrawn',
  'insurance.resolved',
]);

export class MockEngine {
  db: Db;
  sim: SimState = { pharmacyDownUntil: null, smsDown: false, quietHours: true };
  clockOffsetMin = 0;
  fixedNow: Date | null = null;
  /** Seed script key → case id (demo/test helper). */
  seedKeys: Record<string, string> = {};

  constructor(db: Db) {
    this.db = db;
  }

  now(): Date {
    return this.fixedNow ? new Date(this.fixedNow) : new Date(Date.now() + this.clockOffsetMin * MIN);
  }
  nowIso(): string {
    return this.now().toISOString();
  }

  // ------------------------------------------------------------------ lookups

  org(id: string): Organization {
    const o = this.db.orgs.find((x) => x.id === id);
    if (!o) throw new ApiError('NOT_FOUND', 'Organisation not found.');
    return o;
  }
  user(id: string | null): UserRow | undefined {
    return id ? this.db.users.find((u) => u.id === id) : undefined;
  }
  getCase(id: string): CaseRow {
    const c = this.db.cases.find((x) => x.id === id);
    if (!c) throw new ApiError('NOT_FOUND', "We couldn't find that case.");
    return c;
  }
  policiesFor(orgId: string): PracticePolicies {
    return this.db.policies[orgId] ?? DEFAULT_POLICIES;
  }
  patient(id: string | null): PatientRecord | undefined {
    return id ? this.db.patients.find((p) => p.id === id) : undefined;
  }
  rx(id: string | null): PrescriptionRecord | undefined {
    return id ? this.db.prescriptions.find((p) => p.id === id) : undefined;
  }

  // ------------------------------------------------------------------ events

  addEvent(
    c: CaseRow,
    ctx: ActorCtx,
    e: {
      eventType: string;
      title: string;
      from?: CaseStatus | null;
      to?: CaseStatus | null;
      reason?: string | null;
      ruleIds?: RuleId[];
      aiSuggestionId?: string | null;
      promptVersion?: string | null;
      actorType?: ActorType;
      actorName?: string;
    },
  ): CaseEvent {
    const ev: CaseEvent = {
      id: uid('ev'),
      caseId: c.id,
      actorType: e.actorType ?? ctx.actorType,
      actorName: e.actorName ?? ctx.name,
      eventType: e.eventType,
      title: e.title,
      fromStatus: e.from ?? null,
      toStatus: e.to ?? null,
      reason: e.reason ?? null,
      ruleIds: e.ruleIds ?? [],
      aiSuggestionId: e.aiSuggestionId ?? null,
      promptVersion: e.promptVersion ?? null,
      requestId: ctx.requestId,
      public: PUBLIC_EVENTS.has(e.eventType),
      createdAt: this.nowIso(),
    };
    this.db.events.push(ev);
    return ev;
  }

  audit(orgId: string, ctx: ActorCtx, action: string, entity: string, entityId: string | null) {
    this.db.audit.push({ id: uid('aud'), orgId, actorName: ctx.name, action, entity, entityId, requestId: ctx.requestId, createdAt: this.nowIso() });
  }

  addTask(c: CaseRow, t: Omit<CaseTask, 'id' | 'caseId' | 'status'>) {
    // One open task per type per case (avoids alert fatigue).
    const open = this.db.tasks.find((x) => x.caseId === c.id && x.type === t.type && x.status === 'open');
    if (open) return open;
    const task = { ...t, id: uid('task'), caseId: c.id, status: 'open' as const, orgId: c.practiceOrgId };
    this.db.tasks.push(task);
    return task;
  }

  // ------------------------------------------------------------------ ownership & SLA

  private defaultOwner(c: CaseRow, status: CaseStatus): { role: Role | 'system'; userId: string | null; nextAction: string } {
    const rx = this.rx(c.prescriptionId);
    const pharmacy = this.org(c.pharmacyOrgId).name;
    const keepStaff = this.user(c.ownerUserId)?.role === 'practice_staff' ? c.ownerUserId : null;
    switch (status) {
      case 'RECEIVED':
        return { role: 'system', userId: null, nextAction: 'Match the patient' };
      case 'NEEDS_PATIENT_MATCH':
        return { role: 'practice_staff', userId: keepStaff, nextAction: 'Confirm which patient this is' };
      case 'TRIAGE':
        return { role: 'practice_staff', userId: keepStaff, nextAction: c.nextAction || 'Review blockers and route' };
      case 'WAITING_ON_INFO': {
        const ir = [...this.db.infoRequests].reverse().find((r) => r.caseId === c.id);
        const who = ir?.requestedFrom === 'pharmacy' ? pharmacy : ir?.requestedFrom === 'patient' ? 'the patient' : 'a colleague';
        return { role: 'practice_staff', userId: keepStaff, nextAction: `Waiting for answers from ${who}` };
      }
      case 'WAITING_ON_PROVIDER':
        return { role: 'provider', userId: rx?.prescriberId ?? 'u-rao', nextAction: 'Provider to review and decide' };
      case 'WAITING_ON_PATIENT_VISIT':
        return { role: 'practice_staff', userId: keepStaff, nextAction: "Book the patient's visit" };
      case 'WAITING_ON_INSURANCE':
        return { role: 'practice_staff', userId: keepStaff, nextAction: 'Resolve the insurance issue' };
      case 'APPROVED':
        return { role: 'system', userId: null, nextAction: `Deliver approval to ${pharmacy}` };
      case 'DENIED':
        return { role: 'system', userId: null, nextAction: 'Notify pharmacy and patient' };
      case 'SENT_TO_PHARMACY':
        return { role: 'pharmacy_staff', userId: null, nextAction: `${pharmacy} to confirm receipt` };
      case 'PHARMACY_CONFIRMED':
        return { role: 'pharmacy_staff', userId: null, nextAction: 'Pharmacy to start filling' };
      case 'FILLING':
        return { role: 'pharmacy_staff', userId: null, nextAction: 'Pharmacy to mark ready for pickup' };
      case 'READY_FOR_PICKUP':
        return { role: 'pharmacy_staff', userId: null, nextAction: 'Patient to pick up' };
      case 'DISPENSED':
        return { role: 'system', userId: null, nextAction: 'Complete the case' };
      default:
        return { role: 'system', userId: null, nextAction: 'None — case is finished' };
    }
  }

  private dueFor(c: CaseRow, status: CaseStatus, from: Date): string | null {
    const due = computeDueAt({
      status,
      priority: c.priority,
      from,
      policies: this.policiesFor(c.practiceOrgId),
      businessHours: DEFAULT_BUSINESS_HOURS,
      timeZone: this.org(c.practiceOrgId).timezone,
    });
    return due ? due.toISOString() : null;
  }

  /** Writes a state change (the heart of transition_case). */
  private setStatus(c: CaseRow, to: CaseStatus, nextAction?: string) {
    const now = this.now();
    c.status = to;
    c.statusSince = now.toISOString();
    c.updatedAt = now.toISOString();
    c.version += 1;
    c.escalationLevel = 0;
    const owner = this.defaultOwner(c, to);
    c.ownerRole = owner.role;
    c.ownerUserId = owner.userId;
    c.nextAction = nextAction ?? owner.nextAction;
    c.dueAt = isTerminal(to) ? null : this.dueFor(c, to, now);
  }

  // ------------------------------------------------------------------ intake

  createCase(params: {
    payload: RequestedPayload;
    source: CaseSource;
    practiceOrgId: string;
    pharmacyOrgId: string;
    ctx: ActorCtx;
    rawText?: string;
    injectionSuspected?: boolean;
    stopAtReceived?: boolean;
  }): CaseRow {
    const { payload, source, practiceOrgId, pharmacyOrgId, ctx } = params;
    const link = this.db.links.find((l) => l.practiceOrgId === practiceOrgId && l.pharmacyOrgId === pharmacyOrgId && l.status === 'active');
    if (!link) throw new ApiError('FORBIDDEN', "You're not connected to this practice yet. Request a link.");

    const now = this.nowIso();
    const text = `${params.rawText ?? ''}\n${payload.notes ?? ''}`;
    const injection = params.injectionSuspected ?? detectInjection(text);
    const c: CaseRow = {
      id: uid('case'),
      caseNumber: `RB-${this.db.nextCaseNumber++}`,
      practiceOrgId,
      pharmacyOrgId,
      patientId: null,
      prescriptionId: null,
      source,
      status: 'RECEIVED',
      resolution: null,
      blockers: [],
      priority: 'ROUTINE',
      ownerUserId: null,
      ownerRole: 'system',
      nextAction: 'Match the patient',
      dueAt: null,
      statusSince: now,
      escalationLevel: 0,
      requestedPayload: payload,
      injectionSuspected: injection,
      linkedCaseId: null,
      version: 1,
      createdBy: ctx.userId ?? 'system',
      createdAt: now,
      updatedAt: now,
      cancelReason: null,
      conflicts: [],
      matchCandidateIds: [],
      suggestedAction: null,
    };
    this.db.cases.push(c);
    const via = { portal: 'pharmacy portal', electronic: 'electronic renewal request (NCPDP)', fax: 'fax', phone: 'patient phone call' }[source];
    this.addEvent(c, ctx, { eventType: 'case.created', title: `Refill request received via ${via}`, to: 'RECEIVED' });
    if (injection) {
      this.addEvent(c, SYSTEM, {
        eventType: 'security.injection_suspected',
        title: 'Document contains unusual instructions',
        reason: 'Text that looks like instructions to the system was found. It was treated as data only — the AI cannot act on it.',
      });
    }
    this.createStatusToken(c);
    this.enqueuePatientMessage(c, 'received');
    if (!params.stopAtReceived) this.processReceived(c);
    return c;
  }

  /** R1 + duplicate detection + triage. */
  processReceived(c: CaseRow) {
    const patients = this.db.patients.filter((p) => p.practiceOrgId === c.practiceOrgId);
    const m = matchPatient(c.requestedPayload, patients);
    if (m.kind === 'uncertain') {
      c.matchCandidateIds = m.candidates.map((p) => p.id);
      c.blockers = [{ code: 'PATIENT_MATCH_UNCERTAIN', source: 'R1', detail: m.reason }];
      this.apply(c, 'MATCH_UNCERTAIN', SYSTEM, { reason: m.reason, ruleIds: ['R1'] });
      return;
    }
    c.patientId = m.patient.id;
    const dup = this.findDuplicate(c);
    if (dup) {
      c.linkedCaseId = dup.id;
      this.apply(c, 'MARK_DUPLICATE', SYSTEM, { reason: `Same patient and medication as ${dup.caseNumber}.`, linkedCaseId: dup.id });
      return;
    }
    this.apply(c, 'AUTO_MATCH', SYSTEM, { reason: 'Exact match on name, date of birth and phone/chart number.', ruleIds: ['R1'] });
  }

  private findDuplicate(c: CaseRow): CaseRow | undefined {
    const token = c.requestedPayload.medicationName.trim().toLowerCase().split(/\s+/)[0];
    const cutoff = this.now().getTime() - 30 * DAY;
    return this.db.cases.find(
      (o) =>
        o.id !== c.id &&
        o.patientId === c.patientId &&
        o.requestedPayload.medicationName.trim().toLowerCase().split(/\s+/)[0] === token &&
        o.resolution !== 'duplicate' &&
        o.status !== 'CANCELLED' &&
        (!isTerminal(o.status) || new Date(o.updatedAt).getTime() > cutoff) &&
        o.resolution !== 'completed',
    );
  }

  /** Runs R2–R10, stores blockers, auto-routes to the provider only when rules alone are certain. */
  runTriageAndRoute(c: CaseRow, ctx: ActorCtx = SYSTEM) {
    const patient = this.patient(c.patientId);
    if (!patient) return;
    const res = runTriage({
      now: this.now(),
      request: c.requestedPayload,
      patient,
      prescriptions: this.db.prescriptions.filter((r) => r.patientId === patient.id),
      encounters: this.db.encounters.filter((e) => e.patientId === patient.id),
      observations: this.db.observations.filter((o) => o.patientId === patient.id),
      policies: this.policiesFor(c.practiceOrgId),
    });
    // Rule-raised blockers replace the old rule-raised ones; staff/provider/outbox ones are kept.
    const kept = c.blockers.filter((b) => ['staff', 'provider', 'outbox', 'AI'].includes(b.source) && b.code !== 'PATIENT_MATCH_UNCERTAIN');
    c.blockers = [...res.blockers, ...kept.filter((k) => !res.blockers.some((b) => b.code === k.code))];
    c.prescriptionId = res.prescription?.id ?? c.prescriptionId;
    c.priority = res.priority;
    c.conflicts = res.conflicts;
    c.suggestedAction = res.suggestedAction;
    c.nextAction = res.nextAction;
    c.dueAt = this.dueFor(c, c.status, new Date(c.statusSince));
    c.updatedAt = this.nowIso();
    this.addEvent(c, ctx.actorType === 'system' ? SYSTEM : ctx, {
      eventType: 'triage.completed',
      title: res.blockers.length ? `Triage found ${res.blockers.length} blocker${res.blockers.length > 1 ? 's' : ''}` : 'Triage found no blockers',
      reason: res.blockers.length ? res.blockers.map((b) => `${b.source}: ${b.detail}`).join(' ') : 'Refills remain and nothing blocks this refill (R10).',
      ruleIds: res.ruleIds,
      actorType: 'system',
      actorName: 'Rules engine',
    });
    if (res.priority === 'URGENT') {
      this.addEvent(c, SYSTEM, { eventType: 'triage.urgent', title: 'Marked urgent', reason: `About ${res.daysSupplyLeft ?? 0} day(s) of medication left.` });
    }
    if (res.autoRoute && c.status === 'TRIAGE') {
      this.apply(c, 'ROUTE_TO_PROVIDER', SYSTEM, { reason: 'Rules found a clinical blocker; routed automatically.', ruleIds: res.ruleIds });
    }
  }

  // ------------------------------------------------------------------ transitions

  /**
   * transition_case(): validate (state machine + role + aal + payload guards), write the new state,
   * bump version, append the event and enqueue outbox rows — all in one step.
   */
  apply(c: CaseRow, action: TransitionAction, ctx: ActorCtx, payload: Record<string, unknown> = {}): CaseRow {
    const decision = typeof payload.decision === 'string' ? (payload.decision as never) : undefined;
    const check = checkTransition({ action, from: c.status, actor: ctx.actor, decision });
    if (!check.ok) throw new ApiError(check.code, check.message, { requestId: ctx.requestId });
    const from = c.status;
    const to = check.to;
    const reason = typeof payload.reason === 'string' ? payload.reason : null;
    const ruleIds = (payload.ruleIds as RuleId[] | undefined) ?? [];
    const pharmacyName = this.org(c.pharmacyOrgId).name;
    const needReason = () => {
      const r = reasonSchema.safeParse({ reason: payload.reason });
      if (!r.success) throw new ApiError('VALIDATION_ERROR', 'A reason is required.', { fieldErrors: { reason: r.error.issues[0].message } });
    };
    const ev = (eventType: string, title: string, extra: Partial<Parameters<MockEngine['addEvent']>[2]> = {}) =>
      this.addEvent(c, ctx, { eventType, title, from, to, reason, ruleIds, ...extra });

    switch (action) {
      case 'AUTO_MATCH':
        this.setStatus(c, to);
        ev('match.auto', 'Patient matched automatically');
        this.runTriageAndRoute(c);
        return c;

      case 'MATCH_UNCERTAIN':
        this.setStatus(c, to);
        ev('match.uncertain', 'Patient identity needs confirmation');
        this.addTask(c, { type: 'confirm_patient', title: 'Confirm which patient this is', assigneeRole: 'practice_staff', assigneeName: null, dueAt: c.dueAt ?? this.nowIso() });
        return c;

      case 'CONFIRM_PATIENT_MATCH': {
        const p = this.patient(String(payload.patientId ?? ''));
        if (!p || p.practiceOrgId !== c.practiceOrgId) throw new ApiError('VALIDATION_ERROR', 'Choose a patient from this practice.');
        c.patientId = p.id;
        c.blockers = c.blockers.filter((b) => b.code !== 'PATIENT_MATCH_UNCERTAIN');
        this.closeTasks(c, 'confirm_patient');
        this.setStatus(c, to);
        ev('match.confirmed', `Patient confirmed: ${p.firstName} ${p.lastName} (${p.chartNumber})`);
        this.runTriageAndRoute(c, ctx);
        return c;
      }

      case 'REJECT_PATIENT_MATCH':
        needReason();
        c.cancelReason = 'not_our_patient';
        this.closeTasks(c, 'confirm_patient');
        this.setStatus(c, to);
        ev('match.rejected', "The practice couldn't match this patient");
        this.enqueuePharmacy(c, 'not_our_patient');
        return c;

      case 'REQUEST_INFO': {
        const parsed = infoRequestSchema.safeParse(payload);
        if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message);
        const urgent = c.priority === 'URGENT';
        const ir: InfoRequestRow = {
          id: uid('ir'),
          caseId: c.id,
          requestedFrom: parsed.data.requestedFrom,
          questions: parsed.data.questions.map((q, i) => ({ id: `q${i + 1}`, text: q.text, answer: null })),
          status: 'open',
          dueAt: new Date(this.now().getTime() + (urgent ? 8 : 48) * 60 * MIN).toISOString(),
          createdAt: this.nowIso(),
          responseToken: randomToken(),
        };
        this.db.infoRequests.push(ir);
        this.setStatus(c, to);
        ev(
          ir.requestedFrom === 'pharmacy' ? 'info.requested_pharmacy' : 'info.requested',
          `Information requested from ${ir.requestedFrom === 'pharmacy' ? pharmacyName : ir.requestedFrom}`,
          { reason: ir.questions.map((q) => q.text).join(' · ') },
        );
        if (ir.requestedFrom === 'pharmacy') this.enqueuePharmacy(c, 'info_request');
        if (ir.requestedFrom === 'patient') this.enqueuePatientMessage(c, 'info_needed');
        return c;
      }

      case 'INFO_RECEIVED':
        this.setStatus(c, to);
        ev('info.received', 'All questions answered — re-running triage');
        this.runTriageAndRoute(c);
        return c;

      case 'ROUTE_TO_PROVIDER': {
        const hasClinical = c.blockers.some((b) => CLINICAL_BLOCKERS.includes(b.code));
        if (!hasClinical) {
          if (ctx.actor.kind === 'user' && reason) {
            c.blockers.push({ code: 'CLINICAL_REVIEW', source: 'staff', detail: reason });
          } else {
            throw new ApiError('VALIDATION_ERROR', 'This case has no clinical blocker. Add a reason for clinical review.');
          }
        }
        this.setStatus(c, to);
        ev('route.provider', ctx.actor.kind === 'system' ? 'Routed to provider automatically' : 'Routed to provider');
        this.enqueuePatientMessage(c, 'under_review');
        return c;
      }

      case 'ROUTE_TO_INSURANCE':
        if (!c.blockers.some((b) => INSURANCE_BLOCKERS.includes(b.code))) throw new ApiError('VALIDATION_ERROR', 'This case has no insurance blocker.');
        this.setStatus(c, to);
        ev('route.insurance', 'Routed to insurance work queue');
        this.addTask(c, { type: 'insurance', title: 'Work the insurance issue', assigneeRole: 'practice_staff', assigneeName: null, dueAt: c.dueAt ?? this.nowIso() });
        this.enqueuePatientMessage(c, 'delayed_insurance');
        return c;

      case 'INSURANCE_RESOLVED':
        needReason();
        c.blockers = c.blockers.filter((b) => !INSURANCE_BLOCKERS.includes(b.code));
        c.requestedPayload = { ...c.requestedPayload, insuranceFlag: undefined };
        this.closeTasks(c, 'insurance');
        this.setStatus(c, to);
        ev('insurance.resolved', 'Insurance issue resolved');
        this.runTriageAndRoute(c);
        return c;

      case 'INSURANCE_NEEDS_ALTERNATIVE':
        c.blockers.push({ code: 'CLINICAL_REVIEW', source: 'staff', detail: reason ?? 'Insurance denied — provider to choose an alternative.' });
        this.closeTasks(c, 'insurance');
        this.setStatus(c, to);
        ev('insurance.alternative', 'Insurance denied — provider to choose an alternative');
        this.enqueuePatientMessage(c, 'delayed_insurance');
        return c;

      case 'CLOSE_NOT_NEEDED':
        if (c.blockers.some((b) => CLINICAL_BLOCKERS.includes(b.code) || DATA_BLOCKERS.includes(b.code))) {
          throw new ApiError('VALIDATION_ERROR', 'This case still has blockers that need action.');
        }
        c.resolution = 'returned_to_pharmacy';
        this.setStatus(c, to);
        ev('case.closed', 'Returned to pharmacy — no provider action needed');
        this.enqueuePharmacy(c, 'return_to_pharmacy');
        return c;

      case 'MARK_DUPLICATE': {
        const linked = this.db.cases.find((x) => x.id === payload.linkedCaseId);
        if (!linked) throw new ApiError('VALIDATION_ERROR', 'Link the original case.');
        c.linkedCaseId = linked.id;
        c.resolution = 'duplicate';
        this.setStatus(c, to);
        ev('case.duplicate', `This request was added to case ${linked.caseNumber}`);
        this.enqueuePharmacy(c, 'duplicate');
        return c;
      }

      case 'DECIDE':
        return this.applyDecision(c, ctx, payload, from, to);

      case 'VISIT_COMPLETED':
      case 'VISIT_NO_SHOW': {
        if (action === 'VISIT_COMPLETED' && c.patientId) {
          this.db.encounters.push({ id: uid('enc'), patientId: c.patientId, providerId: 'u-rao', occurredAt: this.nowIso(), type: 'office' });
          c.blockers = c.blockers.filter((b) => b.code !== 'VISIT_REQUIRED');
          c.blockers.push({ code: 'CLINICAL_REVIEW', source: 'staff', detail: 'Visit completed — provider to re-decide.' });
        } else {
          c.blockers = c.blockers.filter((b) => b.code !== 'CLINICAL_REVIEW');
          c.blockers.push({ code: 'CLINICAL_REVIEW', source: 'staff', detail: 'Patient did not attend the visit.' });
        }
        this.closeTasks(c, 'book_visit');
        this.setStatus(c, to);
        ev(action === 'VISIT_COMPLETED' ? 'visit.completed' : 'visit.no_show', action === 'VISIT_COMPLETED' ? 'Visit completed — back to provider' : 'Patient did not attend — back to provider');
        return c;
      }

      case 'DISPATCH_SUCCEEDED':
        this.setStatus(c, to);
        ev('dispatch.sent', `Approval delivered to ${pharmacyName}`, { actorName: 'Outbox worker' });
        return c;

      case 'PHARMACY_ACKNOWLEDGED':
        this.closeTasks(c, 'call_pharmacy');
        this.setStatus(c, to);
        ev('pharmacy.acknowledged', `${pharmacyName} confirmed receipt`);
        return c;

      case 'START_FILLING':
        this.setStatus(c, to);
        ev('pharmacy.filling', 'Medication being filled');
        return c;

      case 'MARK_READY':
        this.setStatus(c, to);
        ev('pharmacy.ready', 'Ready for pickup');
        this.enqueuePatientMessage(c, 'ready_for_pickup');
        return c;

      case 'MARK_DISPENSED': {
        this.setStatus(c, to);
        ev('pharmacy.dispensed', 'Dispensed to patient');
        const rx = this.rx(c.prescriptionId);
        if (rx) {
          rx.lastFillAt = this.nowIso();
          rx.refillsRemaining = Math.max(0, rx.refillsRemaining - 1);
        }
        return this.apply(c, 'COMPLETE', SYSTEM, { reason: 'Pharmacy dispensed the medication.' });
      }

      case 'COMPLETE':
        c.resolution = 'completed';
        this.setStatus(c, to);
        ev('case.closed', 'Refill completed');
        return c;

      case 'FINALIZE_DENIAL':
        c.resolution = 'denied';
        this.setStatus(c, to);
        ev('case.closed', 'Closed — refill not approved; pharmacy and patient notified');
        return c;

      case 'WITHDRAW':
        needReason();
        c.resolution = 'withdrawn';
        this.cancelPendingOutbox(c);
        this.setStatus(c, to);
        ev('case.withdrawn', `Withdrawn by ${pharmacyName}`);
        return c;

      case 'CANCEL':
        needReason();
        c.cancelReason = String(payload.cancelReason ?? 'other');
        this.cancelPendingOutbox(c);
        this.setStatus(c, to);
        ev('case.cancelled', 'Case cancelled');
        this.enqueuePharmacy(c, 'cancelled');
        return c;

      case 'CANCEL_AFTER_SEND':
        needReason();
        c.cancelReason = 'other';
        this.setStatus(c, to);
        ev('case.cancelled', `Cancelled after sending — cancel message (CancelRx) sent to ${pharmacyName}`);
        this.enqueuePharmacy(c, 'cancel_rx');
        return c;
    }
  }

  private applyDecision(c: CaseRow, ctx: ActorCtx, payload: Record<string, unknown>, from: CaseStatus, to: CaseStatus): CaseRow {
    const parsed = decisionSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
      throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message, { fieldErrors });
    }
    const d = parsed.data;
    const policies = this.policiesFor(c.practiceOrgId);
    if (d.decision === 'APPROVE_BRIDGE_REQUIRE_VISIT' && (d.bridgeDays ?? 0) > policies.maxBridgeDays) {
      throw new ApiError('VALIDATION_ERROR', `The maximum bridge supply is ${policies.maxBridgeDays} days.`, { fieldErrors: { bridgeDays: `Maximum ${policies.maxBridgeDays} days` } });
    }
    const expected = orderConfirmationHash({
      caseId: c.id,
      patientId: c.patientId ?? '',
      decision: d.decision,
      medicationName: d.medicationName,
      strength: d.strength,
      quantity: d.quantity,
      daysSupply: d.daysSupply,
      refills: d.refills,
      bridgeDays: d.bridgeDays ?? null,
      pharmacyId: c.pharmacyOrgId,
    });
    if (payload.confirmationHash !== expected) {
      throw new ApiError('VALIDATION_ERROR', 'The order changed after you reviewed it. Please review and confirm again.');
    }
    const aal: Aal = ctx.actor.kind === 'user' ? ctx.actor.aal : 'aal1';
    const decision: ProviderDecision = {
      id: uid('dec'),
      caseId: c.id,
      providerName: ctx.name,
      decision: d.decision,
      medicationName: d.medicationName,
      strength: d.strength,
      quantity: d.quantity,
      daysSupply: d.daysSupply,
      refills: d.refills,
      bridgeDays: d.bridgeDays ?? null,
      reasonCode: d.reasonCode ?? null,
      patientNextStep: d.patientNextStep ?? null,
      note: d.note ?? null,
      aal,
      confirmationHash: expected,
      createdAt: this.nowIso(),
    };
    this.db.decisions.push(decision);
    const order = `${d.medicationName} ${d.strength}, qty ${d.quantity}, ${d.daysSupply}-day supply, ${d.refills} refill(s)`;
    const rx = this.rx(c.prescriptionId);

    if (d.decision === 'DENY') {
      c.blockers = [];
      this.setStatus(c, to);
      this.addEvent(c, ctx, { eventType: 'decision.denied', title: 'Provider did not approve the refill', from, to, reason: `${labelReason(d.reasonCode)}. Next step for patient: ${d.patientNextStep}` });
      this.enqueuePharmacy(c, 'denial');
      this.enqueuePatientMessage(c, 'not_approved', d.patientNextStep);
      return c;
    }
    if (d.decision === 'REQUIRE_VISIT') {
      c.blockers = [{ code: 'VISIT_REQUIRED', source: 'provider', detail: d.note || 'Provider requires a visit before refilling.' }];
      this.setStatus(c, to);
      this.addEvent(c, ctx, { eventType: 'decision.visit_required', title: 'Provider requires a visit first', from, to, reason: d.note ?? null });
      this.addTask(c, { type: 'book_visit', title: 'Book a visit with the patient', assigneeRole: 'practice_staff', assigneeName: null, dueAt: c.dueAt ?? this.nowIso() });
      this.enqueuePatientMessage(c, 'visit_needed');
      return c;
    }
    // APPROVE / APPROVE_MODIFIED / APPROVE_BRIDGE_REQUIRE_VISIT
    c.blockers = [];
    if (rx) {
      rx.medicationName = d.medicationName;
      rx.strength = d.strength;
      rx.quantity = d.quantity;
      rx.daysSupply = d.daysSupply;
      rx.refillsAuthorized = d.refills;
      rx.refillsRemaining = d.refills + 1; // new eRx: the first fill + refills
      rx.writtenAt = this.nowIso();
      rx.status = 'active';
      rx.checkInBeforeNextRefill = d.decision === 'APPROVE_BRIDGE_REQUIRE_VISIT';
    }
    this.setStatus(c, to);
    const title =
      d.decision === 'APPROVE_BRIDGE_REQUIRE_VISIT'
        ? `Provider approved a ${d.bridgeDays}-day bridge supply and requires a visit`
        : d.decision === 'APPROVE_MODIFIED'
          ? 'Provider approved with changes'
          : 'Provider approved the refill';
    this.addEvent(c, ctx, { eventType: 'decision.approved', title, from, to, reason: `${order}. Verified with MFA (aal2).${d.note ? ` Note: ${d.note}` : ''}` });
    if (d.decision === 'APPROVE_BRIDGE_REQUIRE_VISIT') {
      this.addTask(c, { type: 'book_visit', title: 'Book the follow-up visit', assigneeRole: 'practice_staff', assigneeName: null, dueAt: new Date(this.now().getTime() + 3 * DAY).toISOString() });
      const runout = new Date(this.now().getTime() + ((d.bridgeDays ?? 30) - 3) * DAY).toISOString();
      this.addTask(c, { type: 'bridge_runout', title: 'Bridge supply ends in 3 days — confirm visit is booked', assigneeRole: 'practice_staff', assigneeName: null, dueAt: runout });
    }
    this.enqueuePharmacy(c, 'approval');
    this.enqueuePatientMessage(c, 'approved_sent');
    return c;
  }

  closeTasks(c: CaseRow, type: CaseTask['type']) {
    for (const t of this.db.tasks) if (t.caseId === c.id && t.type === type && t.status === 'open') t.status = 'done';
  }

  private cancelPendingOutbox(c: CaseRow) {
    for (const m of this.db.outbox) if (m.caseId === c.id && (m.status === 'pending' || m.status === 'failed')) m.status = 'cancelled';
  }

  // ------------------------------------------------------------------ outbox (transactional)

  enqueuePharmacy(c: CaseRow, template: string) {
    const m: OutboxRow = {
      id: uid('ob'),
      caseId: c.id,
      channel: 'pharmacy',
      template,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: this.nowIso(),
      lastError: null,
      deliveredAt: null,
      createdAt: this.nowIso(),
      pharmacyOrgId: c.pharmacyOrgId,
      notificationId: null,
      idempotencyKey: `${c.id}:${template}:${c.version}`,
    };
    this.db.outbox.push(m);
  }

  enqueuePatientMessage(c: CaseRow, template: string, nextStep?: string, freeText?: string) {
    const patient = this.patient(c.patientId);
    if (!patient) return; // no confirmed patient yet — never message an unconfirmed person
    const channel: 'sms' | 'email' = patient.smsOptOut || patient.preferredChannel === 'email' ? 'email' : 'sms';
    const clinic = this.org(c.practiceOrgId).name;
    const text = freeText ?? patientTemplateText(template, clinic, nextStep);
    const n: PatientNotification = { id: uid('ntf'), caseId: c.id, channel, template, text, status: 'queued', createdAt: this.nowIso() };
    this.db.notifications.push(n);
    this.db.outbox.push({
      id: uid('ob'),
      caseId: c.id,
      channel,
      template,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: this.nowIso(),
      lastError: null,
      deliveredAt: null,
      createdAt: this.nowIso(),
      pharmacyOrgId: c.pharmacyOrgId,
      notificationId: n.id,
      idempotencyKey: `${c.id}:${template}:${n.id}`,
    });
  }

  createStatusToken(c: CaseRow) {
    this.db.statusTokens.push({ caseId: c.id, token: randomToken(), expiresAt: new Date(this.now().getTime() + 7 * DAY).toISOString(), failedAttempts: 0, lockedAt: null });
  }

  private isQuietHours(orgId: string): { quiet: boolean; resumeAt: string } {
    const tz = this.org(orgId).timezone;
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(this.now()));
    const quiet = hour >= 21 || hour < 8;
    const hoursUntil8 = hour >= 21 ? 24 - hour + 8 : 8 - hour;
    const resume = new Date(this.now().getTime() + hoursUntil8 * 60 * MIN);
    resume.setMinutes(0, 0, 0);
    return { quiet, resumeAt: resume.toISOString() };
  }

  /** Outbox worker: delivers pending messages with retry/backoff; dead-letters after 5 attempts. */
  processOutbox() {
    const now = this.now();
    const pharmacyDown = this.sim.pharmacyDownUntil !== null && new Date(this.sim.pharmacyDownUntil) > now;
    for (const m of this.db.outbox) {
      if (m.status !== 'pending' && m.status !== 'failed') continue;
      if (m.nextAttemptAt && new Date(m.nextAttemptAt) > now) continue;
      const c = this.db.cases.find((x) => x.id === m.caseId);
      if (!c) continue;
      if (m.channel === 'pharmacy') {
        if (pharmacyDown) {
          this.failDelivery(c, m, 'pharmacy system unreachable (connection timed out after 10 s)');
          continue;
        }
        this.markSent(m);
        if (m.template === 'approval' && c.status === 'APPROVED') {
          c.blockers = c.blockers.filter((b) => b.code !== 'DISPATCH_FAILED');
          this.apply(c, 'DISPATCH_SUCCEEDED', { ...SYSTEM, name: 'Outbox worker' });
        }
        continue;
      }
      // Patient channels
      const n = this.db.notifications.find((x) => x.id === m.notificationId);
      if (this.sim.quietHours) {
        const q = this.isQuietHours(c.practiceOrgId);
        if (q.quiet) {
          m.nextAttemptAt = q.resumeAt;
          if (n) n.status = 'quiet_hours';
          continue;
        }
      }
      if (m.channel === 'sms' && this.sim.smsDown) {
        m.status = 'dead';
        m.attempts += 1;
        m.lastError = 'SMS provider unavailable';
        if (n) n.status = 'failed';
        this.addEvent(c, SYSTEM, { eventType: 'notify.sms_failed', title: 'SMS failed — sending by email instead', reason: 'SMS provider unavailable.' });
        const p = this.patient(c.patientId);
        if (p?.email && n) {
          const emailN: PatientNotification = { ...n, id: uid('ntf'), channel: 'email', status: 'queued', createdAt: this.nowIso() };
          this.db.notifications.push(emailN);
          this.db.outbox.push({ ...m, id: uid('ob'), channel: 'email', status: 'pending', attempts: 0, lastError: null, notificationId: emailN.id, idempotencyKey: `${m.idempotencyKey}:email` });
        } else {
          this.addTask(c, { type: 'call_patient', title: 'Call the patient — message delivery failed', assigneeRole: 'practice_staff', assigneeName: null, dueAt: this.nowIso() });
        }
        continue;
      }
      this.markSent(m);
      if (n) n.status = 'delivered';
    }
    // T24: finalize denials once the pharmacy + patient have been told (or it's handed to a human).
    for (const c of this.db.cases) {
      if (c.status !== 'DENIED') continue;
      const msgs = this.db.outbox.filter((m) => m.caseId === c.id && ['denial', 'not_approved'].includes(m.template));
      const done = msgs.every((m) => m.status === 'sent' || m.status === 'dead' || m.status === 'cancelled');
      if (done) this.apply(c, 'FINALIZE_DENIAL', SYSTEM, { reason: 'Pharmacy and patient notified.' });
    }
    this.db.heartbeats['outbox-worker'] = this.nowIso();
  }

  private markSent(m: OutboxRow) {
    m.status = 'sent';
    m.attempts += 1;
    m.deliveredAt = this.nowIso();
    m.nextAttemptAt = null;
  }

  private failDelivery(c: CaseRow, m: OutboxRow, error: string) {
    m.attempts += 1;
    m.lastError = error;
    if (m.attempts >= MAX_ATTEMPTS) {
      m.status = 'dead';
      m.nextAttemptAt = null;
      if (!c.blockers.some((b) => b.code === 'DISPATCH_FAILED')) {
        c.blockers.push({ code: 'DISPATCH_FAILED', source: 'outbox', detail: `Pharmacy message failed ${m.attempts}× — ${error}.` });
      }
      const pharmacy = this.org(c.pharmacyOrgId);
      this.addTask(c, { type: 'call_pharmacy', title: `Pharmacy unreachable — call ${pharmacy.name} at ${pharmacy.phone}`, assigneeRole: 'practice_staff', assigneeName: null, dueAt: this.nowIso() });
      c.nextAction = `Call ${pharmacy.name} at ${pharmacy.phone}`;
      c.ownerRole = 'practice_staff';
      c.updatedAt = this.nowIso();
      this.addEvent(c, SYSTEM, { eventType: 'dispatch.dead_letter', title: `Delivery failed ${m.attempts}× — handed to staff`, reason: `${error}. Message parked in the dead-letter queue; task created to call the pharmacy.`, actorName: 'Outbox worker' });
    } else {
      m.status = 'failed';
      const wait = RETRY_BACKOFF_MIN[m.attempts - 1] ?? 120;
      m.nextAttemptAt = new Date(this.now().getTime() + wait * MIN).toISOString();
      this.addEvent(c, SYSTEM, { eventType: 'dispatch.retry', title: `Delivery attempt ${m.attempts} failed — retrying in ${wait} min`, reason: error, actorName: 'Outbox worker' });
    }
  }

  /** Manual retry of a dead-lettered pharmacy message (staff clicked "Retry now"). */
  retryDeadLetter(c: CaseRow, ctx: ActorCtx) {
    const m = [...this.db.outbox].reverse().find((x) => x.caseId === c.id && x.channel === 'pharmacy' && x.status === 'dead');
    if (!m) throw new ApiError('VALIDATION_ERROR', 'There is no failed pharmacy message to retry.');
    m.status = 'pending';
    m.attempts = 0;
    m.nextAttemptAt = this.nowIso();
    this.addEvent(c, ctx, { eventType: 'dispatch.manual_retry', title: 'Staff retried the pharmacy message' });
    this.processOutbox();
  }

  // ------------------------------------------------------------------ SLA worker

  escalationTarget(c: CaseRow, level: number): string | null {
    if (c.status === 'WAITING_ON_PROVIDER') {
      if (level === 0) {
        const covering = c.ownerUserId === 'u-chen' ? this.user('u-rao') : this.user('u-chen');
        return covering?.name ?? 'the covering provider';
      }
      return `${this.user('u-admin')?.name ?? 'the practice admin'} (practice admin)`;
    }
    if (c.status === 'SENT_TO_PHARMACY') return 'practice staff (call the pharmacy)';
    if (isTerminal(c.status) || !c.dueAt) return null;
    return `${this.user('u-admin')?.name ?? 'team lead'} (team lead)`;
  }

  processSla() {
    const now = this.now();
    for (const c of this.db.cases) {
      if (isTerminal(c.status) || !c.dueAt || c.escalationLevel >= 3) continue;
      const window = slaWindowFor(c.status, c.priority, this.policiesFor(c.practiceOrgId));
      if (!window) continue;
      const threshold = new Date(c.dueAt).getTime() + c.escalationLevel * window.minutes * MIN;
      if (now.getTime() < threshold) continue;
      const target = this.escalationTarget(c, c.escalationLevel);
      c.escalationLevel += 1;
      c.updatedAt = this.nowIso();
      if (c.status === 'WAITING_ON_PROVIDER') {
        if (c.escalationLevel === 1) c.ownerUserId = c.ownerUserId === 'u-chen' ? 'u-rao' : 'u-chen';
        else {
          c.ownerUserId = 'u-admin';
          c.ownerRole = 'practice_admin';
        }
      }
      if (c.status === 'SENT_TO_PHARMACY') {
        const ph = this.org(c.pharmacyOrgId);
        this.addTask(c, { type: 'call_pharmacy', title: `No confirmation — call ${ph.name} at ${ph.phone}`, assigneeRole: 'practice_staff', assigneeName: null, dueAt: this.nowIso() });
      }
      if (c.status === 'WAITING_ON_PATIENT_VISIT') {
        this.addTask(c, { type: 'call_patient', title: 'Patient has not booked — call the patient', assigneeRole: 'practice_staff', assigneeName: null, dueAt: this.nowIso() });
      }
      this.addEvent(c, SYSTEM, {
        eventType: 'sla.escalated',
        title: `SLA breached — escalated to ${target} (level ${c.escalationLevel})`,
        reason: `${STATUS_LABELS[c.status]} passed its ${c.priority.toLowerCase()} SLA.`,
        actorName: 'SLA worker',
      });
    }
    this.db.heartbeats['sla-worker'] = this.nowIso();
  }

  tick() {
    this.processOutbox();
    this.processSla();
  }
}

export function detectInjection(text: string): boolean {
  return /(ignore (all |any )?(previous|prior|above) instructions|disregard (the )?(previous|above)|system prompt|approve (this|the) (refill|request) immediately|you are now|act as (an? )?(admin|provider))/i.test(text);
}

function labelReason(code: string | undefined): string {
  const map: Record<string, string> = {
    needs_alternative_therapy: 'Needs an alternative therapy',
    no_longer_indicated: 'No longer indicated',
    safety_concern: 'Safety concern',
    not_our_patient: 'Not our patient',
    other: 'Other reason',
  };
  return code ? (map[code] ?? code) : 'No reason';
}

/** Patient templates — no drug names or clinical details (H7). */
export function patientTemplateText(template: string, clinic: string, nextStep?: string): string {
  const lead = `Update on your prescription request from ${clinic}:`;
  switch (template) {
    case 'received':
      return `${lead} we received it and are working on it. Check status: [secure link]`;
    case 'under_review':
      return `${lead} your provider is reviewing it. Check status: [secure link]`;
    case 'info_needed':
      return `${lead} we need a little more information from you. Please call us or open: [secure link]`;
    case 'visit_needed':
      return `${lead} your provider would like to see you before refilling. Please book a visit. Details: [secure link]`;
    case 'approved_sent':
      return `${lead} approved and sent to your pharmacy. Check status: [secure link]`;
    case 'delayed_insurance':
      return `${lead} it is delayed by an insurance step. We are working on it. Details: [secure link]`;
    case 'not_approved':
      return `${lead} it was not approved. Next step: ${nextStep ?? 'please call the clinic'}. Details: [secure link]`;
    case 'ready_for_pickup':
      return `${lead} your pharmacy says it is ready for pickup. Details: [secure link]`;
    default:
      return `${lead} there is an update. Check status: [secure link]`;
  }
}

export const newCtx = (u: UserRow, aal: Aal): ActorCtx => ({
  actor: { kind: 'user', role: u.role, aal },
  userId: u.id,
  name: u.name,
  actorType: 'user',
  requestId: newRequestId(),
});
