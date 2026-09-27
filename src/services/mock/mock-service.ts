// Mock implementation of RefillService. Enforces the same auth, scoping (404 outside your org),
// role checks, aal2, idempotency, optimistic concurrency and minimum-necessary DTOs as the real API.
import type {
  AnalyticsSummary,
  CaseDetail,
  CaseEvent,
  CaseSummary,
  InfoRequest,
  PatientMatch,
  PatientStatusView,
  PharmacyCaseDetail,
  PracticeCaseDetail,
} from '@shared/dto.ts';
import { buildDiagnosis, STATUS_LABELS } from '@shared/domain/diagnosis.ts';
import { can, isPracticeRole, ROLE_LABELS } from '@shared/domain/permissions.ts';
import { allowedActionsFor, isTerminal } from '@shared/domain/state-machine.ts';
import { slaState } from '@shared/domain/sla.ts';
import { latest } from '@shared/domain/triage-rules.ts';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, noteSchema, patientMessageSchema, extractIntakeSchema, createCaseSchema, inviteSchema, policiesSchema } from '@shared/schemas/index.ts';
import type { Aal, BlockerCode, CaseStatus, Role, TransitionAction } from '@shared/types.ts';
import { CASE_STATUSES, CLINICAL_BLOCKERS, DATA_BLOCKERS, INSURANCE_BLOCKERS, PHARMACY_ROLES, PRACTICE_ROLES } from '@shared/types.ts';
import { ApiError, newRequestId } from '../errors';
import type { RefillService, SimulatorAction } from '../refill-service';
import { sessionStore } from '../session';
import { hashInput, LOW_CONFIDENCE, mockExtract, mockExtractFromFile, MOCK_MODEL, PROMPT_VERSIONS } from './ai-mock';
import { getEngine, notifyChange, resetEngine } from './backend';
import { newCtx, patientTemplateText, randomToken, uid, type AiSuggestionRow, type CaseRow, type MockEngine, type UserRow } from './engine';
import {
  persistCaseNote,
  persistCaseOwner,
  persistCaseTransition,
  persistNewCase,
  persistTaskCompletion,
} from '../real/supabase-sync';

const IS_TEST = import.meta.env.MODE === 'test';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AI_FUNCS = new Set(['extractIntake', 'getCaseSummary', 'suggestNextAction', 'draftPatientMessage']);

function params(): URLSearchParams {
  return new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
}

/** Simulated latency + ?mockError=<fn> / ?mockEmpty=<fn> switches. */
async function gate(fn: string, latency: [number, number] = [300, 800]) {
  if (!IS_TEST) await sleep(latency[0] + Math.random() * (latency[1] - latency[0]));
  const p = params();
  if (p.get('mockError') === fn) {
    if (AI_FUNCS.has(fn)) throw new ApiError('AI_UNAVAILABLE', 'AI assist is unavailable right now.');
    if (p.get('mockErrorType') === 'timeout') throw new ApiError('TIMEOUT', 'The request timed out.');
    throw new ApiError('INTERNAL_ERROR', 'Simulated server error (mockError).');
  }
}
const isEmpty = (fn: string) => params().get('mockEmpty') === fn;

interface Me {
  eng: MockEngine;
  user: UserRow;
  aal: Aal;
}

function me(): Me {
  const eng = getEngine();
  const s = sessionStore.get();
  if (!s) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue.');
  const user = eng.user(s.userId);
  if (!user || user.status === 'removed') {
    sessionStore.clear();
    throw new ApiError('UNAUTHENTICATED', 'Your access was removed. Contact your admin.');
  }
  sessionStore.touch();
  return { eng, user, aal: s.aal };
}

function requireRole(m: Me, roles: readonly Role[]) {
  if (!roles.includes(m.user.role)) throw new ApiError('FORBIDDEN', "You don't have access to this.");
}
function requireAal2(m: Me) {
  if (m.aal !== 'aal2') throw new ApiError('MFA_REQUIRED', 'Verify with your authenticator app to continue.');
}

/** Tenant scoping: records outside your organisation return 404, never 403 (no existence leak). */
function scopedCase(m: Me, caseId: string): CaseRow {
  const c = m.eng.db.cases.find((x) => x.id === caseId);
  if (!c) throw new ApiError('NOT_FOUND', "We couldn't find that case.");
  const ok = isPracticeRole(m.user.role) ? c.practiceOrgId === m.user.orgId : c.pharmacyOrgId === m.user.orgId;
  if (!ok) throw new ApiError('NOT_FOUND', "We couldn't find that case.");
  return c;
}

const initials = (first: string, last: string) => `${first.charAt(0)}.${last.charAt(0)}.`.toUpperCase();

function ageFrom(dob: string, now: Date): number {
  const d = new Date(dob);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function pharmacyNextStep(eng: MockEngine, c: CaseRow): string {
  const practice = eng.org(c.practiceOrgId).name;
  const openIr = eng.db.infoRequests.find((r) => r.caseId === c.id && r.requestedFrom === 'pharmacy' && r.status !== 'answered');
  if (openIr) return `${practice} asked you a question — please answer below.`;
  switch (c.status) {
    case 'RECEIVED':
    case 'TRIAGE':
      return `${practice} is reviewing this request.`;
    case 'NEEDS_PATIENT_MATCH':
      return `${practice} is confirming the patient.`;
    case 'WAITING_ON_INFO':
      return `${practice} is collecting more information.`;
    case 'WAITING_ON_PROVIDER':
      return 'Waiting for a provider decision.';
    case 'WAITING_ON_PATIENT_VISIT':
      return 'The provider requires a visit before refilling.';
    case 'WAITING_ON_INSURANCE':
      return `${practice} is working an insurance issue.`;
    case 'APPROVED':
      return 'Approved — the new prescription is on its way.';
    case 'DENIED':
      return 'Not approved — see the patient next step.';
    case 'SENT_TO_PHARMACY':
      return 'Please confirm you received the approval.';
    case 'PHARMACY_CONFIRMED':
      return 'Start filling when ready.';
    case 'FILLING':
      return 'Mark ready for pickup when done.';
    case 'READY_FOR_PICKUP':
      return 'Mark dispensed when the patient picks up.';
    case 'CLOSED':
      return c.resolution === 'returned_to_pharmacy'
        ? 'No provider action needed — refills remain on file. Please process normally.'
        : c.resolution === 'duplicate'
          ? `Duplicate — tracked on the original case.`
          : 'This request is closed.';
    default:
      return 'This request was cancelled.';
  }
}

export function toSummary(eng: MockEngine, c: CaseRow, viewerRole: Role): CaseSummary {
  const now = eng.now();
  const practiceView = isPracticeRole(viewerRole);
  const p = eng.patient(c.patientId);
  const req = c.requestedPayload;
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    patientName: practiceView ? (p ? `${p.firstName} ${p.lastName}` : `${req.patientFirstName} ${req.patientLastName}`.trim() || 'Unknown patient') : initials(req.patientFirstName, req.patientLastName),
    medication: `${req.medicationName} ${req.strength}`.trim() || 'Medication not specified',
    status: c.status,
    resolution: c.resolution,
    blockers: practiceView ? c.blockers.map((b) => b.code) : [],
    priority: c.priority,
    ownerName: practiceView ? (eng.user(c.ownerUserId)?.name ?? null) : null,
    ownerRole: c.ownerRole,
    ownerUserId: practiceView ? c.ownerUserId : null,
    nextAction: practiceView ? c.nextAction : pharmacyNextStep(eng, c),
    dueAt: c.dueAt,
    statusSince: c.statusSince,
    slaState: slaState({ statusSince: c.statusSince, dueAt: c.dueAt, now }),
    pharmacyName: eng.org(c.pharmacyOrgId).name,
    practiceName: eng.org(c.practiceOrgId).name,
    escalationLevel: practiceView ? c.escalationLevel : 0,
    source: c.source,
    updatedAt: c.updatedAt,
    createdAt: c.createdAt,
    injectionSuspected: practiceView ? c.injectionSuspected : false,
  };
}

function practiceAllowedActions(c: CaseRow, role: Role, eng: MockEngine): TransitionAction[] {
  const codes = c.blockers.map((b) => b.code);
  const hasClinical = codes.some((x) => CLINICAL_BLOCKERS.includes(x));
  const hasData = codes.some((x) => DATA_BLOCKERS.includes(x));
  const hasInsurance = codes.some((x) => INSURANCE_BLOCKERS.includes(x));
  const openIr = eng.db.infoRequests.some((r) => r.caseId === c.id && r.status !== 'answered');
  return allowedActionsFor(c.status, role).filter((a) => {
    if (a === 'CLOSE_NOT_NEEDED') return !hasClinical && !hasData;
    if (a === 'ROUTE_TO_INSURANCE') return hasInsurance;
    if (a === 'INFO_RECEIVED') return !openIr;
    if (a === 'MARK_DUPLICATE') return false; // system-detected; manual linking is roadmap
    return true;
  });
}

function toPracticeDetail(m: Me, c: CaseRow): PracticeCaseDetail {
  const { eng } = m;
  const now = eng.now();
  const p = eng.patient(c.patientId) ?? null;
  const rx = eng.rx(c.prescriptionId) ?? null;
  const lastVisit = p ? latest(eng.db.encounters.filter((e) => e.patientId === p.id), (e) => e.occurredAt)?.occurredAt ?? null : null;
  const lastA1c = p ? latest(eng.db.observations.filter((o) => o.patientId === p.id && o.code === 'A1C'), (o) => o.observedAt)?.observedAt ?? null : null;
  const linked = c.linkedCaseId ? eng.db.cases.find((x) => x.id === c.linkedCaseId) : undefined;
  return {
    view: 'practice',
    case: {
      ...toSummary(eng, c, m.user.role),
      blockerDetails: c.blockers,
      requestedPayload: c.requestedPayload,
      linkedCaseId: c.linkedCaseId,
      linkedCaseNumber: linked?.caseNumber ?? null,
      version: c.version,
      practiceOrgId: c.practiceOrgId,
      pharmacyOrgId: c.pharmacyOrgId,
      cancelReason: c.cancelReason,
    },
    patient: p,
    patientAge: p ? ageFrom(p.dob, now) : null,
    prescription: rx,
    lastVisit,
    lastA1c,
    pharmacy: eng.org(c.pharmacyOrgId),
    priorCases: p
      ? eng.db.cases
          .filter((o) => o.id !== c.id && o.patientId === p.id && now.getTime() - new Date(o.createdAt).getTime() < 365 * 86_400_000)
          .map((o) => ({ id: o.id, caseNumber: o.caseNumber, status: o.status, createdAt: o.createdAt }))
      : [],
    matchCandidates: c.status === 'NEEDS_PATIENT_MATCH' ? c.matchCandidateIds.map((id) => toPatientMatch(eng, id)).filter((x): x is PatientMatch => x !== null) : [],
    conflicts: c.conflicts,
    notes: eng.db.notes.filter((n) => n.caseId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    tasks: eng.db.tasks.filter((t) => t.caseId === c.id).sort((a, b) => (a.status === b.status ? a.dueAt.localeCompare(b.dueAt) : a.status === 'open' ? -1 : 1)),
    infoRequests: eng.db.infoRequests.filter((r) => r.caseId === c.id).map(stripIr),
    decisions: eng.db.decisions.filter((d) => d.caseId === c.id),
    notifications: eng.db.notifications.filter((n) => n.caseId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    outbox: eng.db.outbox.filter((o) => o.caseId === c.id).map(({ pharmacyOrgId: _p, notificationId: _n, idempotencyKey: _k, ...rest }) => rest),
    allowedActions: practiceAllowedActions(c, m.user.role, eng),
    suggestedAction: c.status === 'TRIAGE' ? c.suggestedAction : null,
  };
}

function toPharmacyDetail(m: Me, c: CaseRow): PharmacyCaseDetail {
  const { eng } = m;
  const decision = [...eng.db.decisions].reverse().find((d) => d.caseId === c.id);
  const approved = decision && decision.decision.startsWith('APPROVE');
  const practice = eng.org(c.practiceOrgId);
  return {
    view: 'pharmacy',
    case: {
      id: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      resolution: c.resolution,
      patientInitials: initials(c.requestedPayload.patientFirstName, c.requestedPayload.patientLastName),
      dobYear: c.requestedPayload.patientDob.slice(0, 4),
      medication: `${c.requestedPayload.medicationName} ${c.requestedPayload.strength}`.trim(),
      quantity: c.requestedPayload.quantity,
      nextStep: pharmacyNextStep(eng, c),
      practiceName: practice.name,
      practicePhone: practice.phone,
      version: c.version,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
      approvedOrder: approved && decision ? { medicationName: decision.medicationName, strength: decision.strength, quantity: decision.quantity, daysSupply: decision.daysSupply, refills: decision.refills } : null,
      denialNextStep: decision?.decision === 'DENY' ? decision.patientNextStep : null,
    },
    infoRequests: eng.db.infoRequests.filter((r) => r.caseId === c.id && r.requestedFrom === 'pharmacy').map(stripIr),
    allowedActions: allowedActionsFor(c.status, m.user.role),
  };
}

function stripIr(r: InfoRequest & { responseToken?: string }): InfoRequest {
  const { responseToken: _t, ...rest } = r;
  return { ...rest, questions: rest.questions.map((q) => ({ ...q })) };
}

function toPatientMatch(eng: MockEngine, id: string): PatientMatch | null {
  const p = eng.patient(id);
  if (!p) return null;
  const lastVisit = latest(eng.db.encounters.filter((e) => e.patientId === id), (e) => e.occurredAt)?.occurredAt ?? null;
  return { id: p.id, name: `${p.firstName} ${p.lastName}`, dob: p.dob, chartNumber: p.chartNumber, phoneLast4: p.phone ? p.phone.slice(-4) : null, lastVisit };
}

function detailFor(m: Me, c: CaseRow): CaseDetail {
  return isPracticeRole(m.user.role) ? toPracticeDetail(m, c) : toPharmacyDetail(m, c);
}

// ------------------------------------------------------------------ idempotency & rate limits

const idempotency = new Map<string, { hash: string; result: unknown; expires: number }>();
function withIdempotency<T>(userId: string, key: string, body: unknown, run: () => T): T {
  if (!key) throw new ApiError('VALIDATION_ERROR', 'Idempotency-Key header is required.');
  const k = `${userId}:${key}`;
  const hash = JSON.stringify(body);
  const hit = idempotency.get(k);
  if (hit && hit.expires > Date.now()) {
    if (hit.hash !== hash) throw new ApiError('IDEMPOTENCY_KEY_REUSED', 'This request key was already used for a different request.');
    return hit.result as T;
  }
  const result = run();
  idempotency.set(k, { hash, result, expires: Date.now() + 24 * 3_600_000 });
  return result;
}

const aiCalls = new Map<string, number[]>();
function aiRateLimit(userId: string) {
  const now = Date.now();
  const calls = (aiCalls.get(userId) ?? []).filter((t) => now - t < 10 * 60_000);
  if (calls.length >= 30) throw new ApiError('RATE_LIMITED', "You're going a bit fast. Try again in a minute.");
  calls.push(now);
  aiCalls.set(userId, calls);
}
const statusAttemptsByClient: number[] = [];

function recordAi(eng: MockEngine, m: Me, row: Omit<AiSuggestionRow, 'id' | 'orgId' | 'model' | 'createdAt' | 'outcome' | 'valid'> & { valid?: boolean }): AiSuggestionRow {
  const full: AiSuggestionRow = { id: uid('ai'), orgId: m.user.orgId, model: MOCK_MODEL, createdAt: eng.nowIso(), outcome: null, valid: true, ...row };
  eng.db.ai.push(full);
  return full;
}

// ------------------------------------------------------------------ status page

function patientStatusView(eng: MockEngine, c: CaseRow): PatientStatusView {
  const clinic = eng.org(c.practiceOrgId);
  const pharmacy = eng.org(c.pharmacyOrgId);
  const first = eng.patient(c.patientId)?.firstName ?? c.requestedPayload.patientFirstName;
  const decision = [...eng.db.decisions].reverse().find((d) => d.caseId === c.id);
  const map: Partial<Record<CaseStatus, [PatientStatusView['step'], string, string, string, boolean]>> = {
    RECEIVED: [1, 'Request received', 'We received your refill request.', 'Our team is checking your request.', false],
    NEEDS_PATIENT_MATCH: [1, 'Request received', 'We received your refill request.', 'Our team is confirming your details.', false],
    TRIAGE: [1, 'Request received', 'We received your refill request.', 'Our team is checking what is needed.', false],
    WAITING_ON_INFO: [2, 'Being reviewed', 'We need a little more information.', `If we asked you a question, please call ${clinic.name} at ${clinic.phone}.`, true],
    WAITING_ON_PROVIDER: [2, 'Being reviewed', 'Your provider is reviewing your request.', 'You will get a message when there is a decision.', false],
    WAITING_ON_INSURANCE: [2, 'Being reviewed', 'Your request is delayed by an insurance step.', 'We are working on it with your insurance and pharmacy.', false],
    WAITING_ON_PATIENT_VISIT: [3, 'Action needed', 'Your provider would like to see you before refilling.', `Please book a visit: call ${clinic.name} at ${clinic.phone}.`, true],
    APPROVED: [3, 'Approved', 'Your refill was approved.', `We are sending it to ${pharmacy.name}.`, false],
    DENIED: [3, 'Action needed', 'Your refill was not approved.', decision?.patientNextStep ?? `Please call ${clinic.name} at ${clinic.phone}.`, true],
    SENT_TO_PHARMACY: [4, 'At pharmacy', `Your prescription was sent to ${pharmacy.name}.`, 'The pharmacy will prepare it. We will tell you when it is ready.', false],
    PHARMACY_CONFIRMED: [4, 'At pharmacy', `${pharmacy.name} has your prescription.`, 'The pharmacy will prepare it. We will tell you when it is ready.', false],
    FILLING: [4, 'At pharmacy', `${pharmacy.name} is preparing your medication.`, 'We will tell you when it is ready.', false],
    READY_FOR_PICKUP: [5, 'Ready', `Your medication is ready at ${pharmacy.name}.`, `Pick it up at ${pharmacy.name}, ${pharmacy.city}.`, false],
    DISPENSED: [5, 'Ready', 'You picked up your medication.', 'Nothing else to do.', false],
  };
  let row = map[c.status];
  if (c.status === 'CLOSED') {
    row =
      c.resolution === 'completed'
        ? [5, 'Ready', 'You picked up your medication.', 'Nothing else to do. Thank you!', false]
        : c.resolution === 'denied'
          ? [3, 'Action needed', 'Your refill was not approved.', decision?.patientNextStep ?? `Please call ${clinic.name} at ${clinic.phone}.`, true]
          : [4, 'At pharmacy', 'Your pharmacy can fill this refill.', `Contact ${pharmacy.name} at ${pharmacy.phone}.`, false];
  }
  if (c.status === 'CANCELLED') row = [1, 'Closed', 'This request was closed.', `Questions? Call ${clinic.name} at ${clinic.phone}.`, false];
  const [step, stepLabel, headline, nextStep, actionNeeded] = row ?? [1, 'Request received', 'We received your request.', 'We are working on it.', false];
  return { clinicName: clinic.name, clinicPhone: clinic.phone, pharmacyName: pharmacy.name, firstName: first, step, stepLabel, headline, nextStep, actionNeeded, updatedAt: c.updatedAt, closed: isTerminal(c.status) };
}

// ------------------------------------------------------------------ analytics

function weeklyHistory(eng: MockEngine): AnalyticsSummary['weekly'] {
  // metrics_daily rollup (synthetic history for the demo): turnaround improves after go-live.
  const base = [22, 25, 24, 28, 31, 30, 34];
  const pct = [0.41, 0.46, 0.55, 0.63, 0.7, 0.76, 0.81];
  const out = base.map((resolved, i) => {
    const d = new Date(eng.now().getTime() - (7 - i) * 7 * 86_400_000);
    return { week: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), resolved, within48h: Math.round(resolved * pct[i]) };
  });
  const closedThisWeek = eng.db.cases.filter((c) => c.resolution === 'completed' || c.status === 'PHARMACY_CONFIRMED' || c.status === 'FILLING' || c.status === 'READY_FOR_PICKUP');
  out.push({ week: 'This week', resolved: closedThisWeek.length, within48h: closedThisWeek.filter((c) => new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() < 48 * 3_600_000).length });
  return out;
}

// ------------------------------------------------------------------ the service

export const mockRefillService: RefillService = {
  async listCases(q) {
    await gate('listCases');
    const m = me();
    const { eng, user } = m;
    const practiceView = isPracticeRole(user.role);
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 100);
    const page = Math.max(q.page ?? 1, 1);
    if (isEmpty('listCases')) return { data: [], meta: { page, limit, total: 0 } };
    let rows = eng.db.cases.filter((c) => (practiceView ? c.practiceOrgId === user.orgId : c.pharmacyOrgId === user.orgId));
    const seenIds = new Set<string>();
    const seenCaseNums = new Set<string>();
    rows = rows.filter((c) => {
      if (seenIds.has(c.id) || seenCaseNums.has(c.caseNumber)) return false;
      seenIds.add(c.id);
      seenCaseNums.add(c.caseNumber);
      return true;
    });
    const status = q.status ?? 'OPEN';
    if (status === 'OPEN') rows = rows.filter((c) => !isTerminal(c.status));
    else if (status !== 'ALL' && CASE_STATUSES.includes(status)) rows = rows.filter((c) => c.status === status);
    if (q.blocker && practiceView) rows = rows.filter((c) => c.blockers.some((b) => b.code === q.blocker));
    if (q.priority) rows = rows.filter((c) => c.priority === q.priority);
    if (q.owner === 'me') rows = rows.filter((c) => c.ownerUserId === user.id);
    else if (q.owner === 'unassigned') rows = rows.filter((c) => !c.ownerUserId && c.ownerRole !== 'system');
    else if (q.owner) rows = rows.filter((c) => c.ownerUserId === q.owner);
    if (q.pharmacyId) rows = rows.filter((c) => c.pharmacyOrgId === q.pharmacyId);
    let summaries = rows.map((c) => toSummary(eng, c, user.role));
    if (q.sla) summaries = summaries.filter((s) => s.slaState === q.sla);
    if (q.search && q.search.trim()) {
      const s = q.search.trim().toLowerCase();
      summaries = summaries.filter((x) => {
        const c = eng.db.cases.find((cc) => cc.id === x.id)!;
        const chart = practiceView ? (eng.patient(c.patientId)?.chartNumber ?? '') : '';
        return [x.caseNumber, x.patientName, x.medication, chart].some((f) => f.toLowerCase().includes(s));
      });
    }
    const sort = q.sort ?? 'due';
    summaries.sort((a, b) => {
      if (sort === 'updated') return b.updatedAt.localeCompare(a.updatedAt);
      if (a.priority !== b.priority && sort !== 'due') return a.priority === 'URGENT' ? -1 : 1;
      if (sort === 'priority' && a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
      if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
      const ad = a.dueAt ?? '9999';
      const bd = b.dueAt ?? '9999';
      return ad.localeCompare(bd) || b.updatedAt.localeCompare(a.updatedAt);
    });
    const total = summaries.length;
    return { data: summaries.slice((page - 1) * limit, page * limit), meta: { page, limit, total } };
  },

  async getCase(caseId) {
    await gate('getCase');
    const m = me();
    const c = scopedCase(m, caseId);
    m.eng.audit(m.user.orgId, newCtx(m.user, m.aal), isPracticeRole(m.user.role) ? 'case.view' : 'case.view_pharmacy', 'refill_case', c.id);
    return detailFor(m, c);
  },

  async createCase(input, idempotencyKey) {
    await gate('createCase');
    const m = me();
    const parsed = createCaseSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
      throw new ApiError('VALIDATION_ERROR', 'Please fix the highlighted fields.', { fieldErrors });
    }
    const d = parsed.data;
    const practiceView = isPracticeRole(m.user.role);
    if (d.source === 'phone' ? !can(m.user.role, 'case.createPhone') : !can(m.user.role, 'case.createPharmacy')) {
      throw new ApiError('FORBIDDEN', "You don't have permission to create this kind of request.");
    }
    return withIdempotency(m.user.id, idempotencyKey, input, () => {
      const pharmacyOrgId = practiceView
        ? (m.eng.db.orgs.find((o) => o.type === 'pharmacy' && o.name === d.payload.pharmacyName)?.id ?? m.eng.db.links.find((l) => l.practiceOrgId === m.user.orgId && l.status === 'active')?.pharmacyOrgId ?? '')
        : m.user.orgId;
      const practiceOrgId = practiceView ? m.user.orgId : d.practiceOrgId;
      const ctx = newCtx(m.user, m.aal);
      const payload = {
        ...d.payload,
        patientPhone: d.payload.patientPhone || undefined,
        chartNumber: d.payload.chartNumber || undefined,
        sig: d.payload.sig || undefined,
        prescriberName: d.payload.prescriberName || undefined,
        notes: d.payload.notes || undefined,
      };
      const c = m.eng.createCase({ payload, source: d.source, practiceOrgId, pharmacyOrgId, ctx });
      if (d.aiSuggestionId) {
        const s = m.eng.db.ai.find((a) => a.id === d.aiSuggestionId);
        if (s) {
          s.caseId = c.id;
          if (s.output && typeof s.output === 'object' && 'injectionSuspected' in s.output && (s.output as { injectionSuspected: boolean }).injectionSuspected && !c.injectionSuspected) {
            c.injectionSuspected = true;
            m.eng.addEvent(c, ctx, { eventType: 'security.injection_suspected', title: 'Document contains unusual instructions', reason: 'Flagged during AI extraction. Treated as data only.' });
          }
          m.eng.addEvent(c, ctx, { eventType: 'ai.extraction_used', title: 'Fields extracted by AI and confirmed by staff', aiSuggestionId: s.id, promptVersion: s.promptVersion, actorType: 'ai', actorName: 'AI-1 intake extraction' });
        }
      }
      notifyChange();
      if (!IS_TEST) persistNewCase(c);
      return detailFor(m, c);
    });
  },

  async transitionCase(caseId, input, idempotencyKey) {
    await gate('transitionCase');
    const m = me();
    const c = scopedCase(m, caseId);
    return withIdempotency(m.user.id, idempotencyKey, { caseId, ...input }, () => {
      if (input.version !== c.version) {
        const last = [...m.eng.db.events].reverse().find((e) => e.caseId === c.id && e.actorType === 'user');
        const ago = last ? Math.max(1, Math.round((Date.now() - new Date(last.createdAt).getTime()) / 1000)) : null;
        throw new ApiError('CONFLICT', last ? `${last.actorName} updated this case${ago && ago < 3600 ? ` ${ago < 60 ? `${ago} s` : `${Math.round(ago / 60)} min`} ago` : ''}: "${last.title}". Review the latest version.` : 'This case was updated. Review the latest version.');
      }
      const ctx = newCtx(m.user, m.aal);
      m.eng.apply(c, input.action, ctx, input.payload ?? {});
      notifyChange();
      if (!IS_TEST) persistCaseTransition(c, input.action, { id: m.user.id, name: m.user.name, role: m.user.role });
      return detailFor(m, c);
    });
  },

  async getCaseEvents(caseId, page) {
    await gate('getCaseEvents');
    const m = me();
    const c = scopedCase(m, caseId);
    const practiceView = isPracticeRole(m.user.role);
    const limit = Math.min(page.limit ?? 100, 100);
    const p = page.page ?? 1;
    let events: CaseEvent[] = m.eng.db.events.filter((e) => e.caseId === c.id);
    if (!practiceView) events = events.filter((e) => e.public).map((e) => ({ ...e, reason: null, ruleIds: [], aiSuggestionId: null, promptVersion: null, actorName: e.actorType === 'user' && !m.eng.db.users.some((u) => u.name === e.actorName && u.orgId === m.user.orgId) ? m.eng.org(c.practiceOrgId).name : e.actorName }));
    events = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { data: events.slice((p - 1) * limit, p * limit), meta: { page: p, limit, total: events.length } };
  },

  async getCaseDiagnosis(caseId) {
    await gate('getCaseDiagnosis', [200, 500]);
    const m = me();
    const c = scopedCase(m, caseId);
    const owner = m.eng.user(c.ownerUserId);
    const ownerLabel = owner ? `${owner.name} (${ROLE_LABELS[owner.role]})` : c.ownerRole === 'system' ? 'RefillBridge (automatic)' : `${ROLE_LABELS[c.ownerRole]} team queue`;
    const diag = buildDiagnosis({
      status: c.status,
      statusSince: c.statusSince,
      blockers: c.blockers,
      ownerLabel,
      dueAt: c.dueAt,
      escalationLevel: c.escalationLevel,
      escalateToLabel: m.eng.escalationTarget(c, c.escalationLevel),
      outbox: m.eng.db.outbox.filter((o) => o.caseId === c.id),
      now: m.eng.now(),
      pharmacyName: m.eng.org(c.pharmacyOrgId).name,
    });
    if (!isPracticeRole(m.user.role)) return { ...diag, blockers: [], ownerLabel: m.eng.org(c.practiceOrgId).name, lastAttempt: null, nextAutomaticAction: null };
    return diag;
  },

  async claimCase(caseId) {
    await gate('claimCase', [150, 350]);
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    const c = scopedCase(m, caseId);
    c.ownerUserId = m.user.id;
    if (c.ownerRole !== 'provider' || m.user.role === 'provider') c.ownerRole = m.user.role;
    c.updatedAt = m.eng.nowIso();
    m.eng.addEvent(c, newCtx(m.user, m.aal), { eventType: 'case.claimed', title: `Claimed by ${m.user.name}` });
    notifyChange();
    if (!IS_TEST) persistCaseOwner(c.id, m.user.id);
    return detailFor(m, c);
  },

  async assignCase(caseId, userId) {
    await gate('assignCase');
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    const c = scopedCase(m, caseId);
    const target = m.eng.db.users.find((u) => u.id === userId && u.orgId === m.user.orgId && u.status === 'active');
    if (!target) throw new ApiError('VALIDATION_ERROR', 'Choose an active member of your practice.');
    if (c.status === 'WAITING_ON_PROVIDER' && target.role !== 'provider') throw new ApiError('VALIDATION_ERROR', 'Cases waiting on a provider can only be assigned to a provider.');
    c.ownerUserId = target.id;
    c.updatedAt = m.eng.nowIso();
    m.eng.addEvent(c, newCtx(m.user, m.aal), { eventType: 'case.assigned', title: `Assigned to ${target.name} by ${m.user.name}` });
    notifyChange();
    if (!IS_TEST) persistCaseOwner(c.id, target.id);
    return detailFor(m, c);
  },

  async searchPatients(query) {
    await gate('searchPatients', [150, 350]);
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    m.eng.audit(m.user.orgId, newCtx(m.user, m.aal), 'patient.search', 'patients', null);
    return m.eng.db.patients
      .filter((p) => p.practiceOrgId === m.user.orgId)
      .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || p.chartNumber.toLowerCase().includes(q) || p.dob.includes(q))
      .slice(0, 10)
      .map((p) => toPatientMatch(m.eng, p.id)!)
      .filter(Boolean);
  },

  async confirmPatientMatch(caseId, patientId, version) {
    return mockRefillService.transitionCase(caseId, { action: 'CONFIRM_PATIENT_MATCH', version, payload: { patientId } }, `match-${caseId}-${patientId}-${version}`);
  },

  async createInfoRequest(caseId, input) {
    await gate('createInfoRequest');
    const m = me();
    const c = scopedCase(m, caseId);
    m.eng.apply(c, 'REQUEST_INFO', newCtx(m.user, m.aal), { ...input });
    notifyChange();
    return stripIr([...m.eng.db.infoRequests].reverse().find((r) => r.caseId === c.id)!);
  },

  async answerInfoRequest(infoRequestId, answers) {
    await gate('answerInfoRequest');
    const m = me();
    const ir = m.eng.db.infoRequests.find((r) => r.id === infoRequestId);
    if (!ir) throw new ApiError('NOT_FOUND', "We couldn't find that request.");
    const c = scopedCase(m, ir.caseId);
    if (!isPracticeRole(m.user.role) && ir.requestedFrom !== 'pharmacy') throw new ApiError('NOT_FOUND', "We couldn't find that request.");
    if (ir.status === 'answered') throw new ApiError('CONFLICT', 'These questions were already answered.');
    for (const q of ir.questions) {
      const a = answers[q.id];
      if (typeof a === 'string' && a.trim()) q.answer = a.trim().slice(0, 500);
    }
    const answered = ir.questions.filter((q) => q.answer).length;
    ir.status = answered === ir.questions.length ? 'answered' : answered > 0 ? 'partial' : 'open';
    const ctx = newCtx(m.user, m.aal);
    m.eng.addEvent(c, ctx, { eventType: 'info.answered', title: ir.status === 'answered' ? 'All questions answered' : `${answered} of ${ir.questions.length} questions answered`, reason: ir.questions.filter((q) => q.answer).map((q) => `${q.text} → ${q.answer}`).join(' · ') });
    if (ir.status === 'answered' && c.status === 'WAITING_ON_INFO') {
      // Apply structured answers the rules can use (strength / quantity) — data only, never instructions.
      for (const q of ir.questions) {
        if (/strength/i.test(q.text) && q.answer && !c.requestedPayload.strength) c.requestedPayload = { ...c.requestedPayload, strength: q.answer };
        if (/quantity/i.test(q.text) && q.answer && !c.requestedPayload.quantity) {
          const n = parseInt(q.answer, 10);
          if (!Number.isNaN(n)) c.requestedPayload = { ...c.requestedPayload, quantity: n };
        }
      }
      m.eng.apply(c, 'INFO_RECEIVED', { ...ctx, actor: { kind: 'system' }, actorType: 'system', name: 'RefillBridge' }, { reason: 'All questions answered.' });
    }
    notifyChange();
    return stripIr(ir);
  },

  async addCaseNote(caseId, body) {
    await gate('addCaseNote', [150, 350]);
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    const c = scopedCase(m, caseId);
    const parsed = noteSchema.safeParse({ body });
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message);
    const note = { id: uid('note'), caseId: c.id, authorName: m.user.name, body: parsed.data.body, createdAt: m.eng.nowIso() };
    m.eng.db.notes.push(note);
    m.eng.addEvent(c, newCtx(m.user, m.aal), { eventType: 'note.added', title: 'Internal note added' });
    notifyChange();
    if (!IS_TEST) persistCaseNote(note);
    return note;
  },

  async sendPatientMessage(caseId, input) {
    await gate('sendPatientMessage');
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    const c = scopedCase(m, caseId);
    const parsed = patientMessageSchema.safeParse(input);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message);
    if (!c.patientId) throw new ApiError('VALIDATION_ERROR', 'Confirm the patient before messaging them.');
    if (parsed.data.template === 'free_text') {
      if (!parsed.data.text) throw new ApiError('VALIDATION_ERROR', 'Write the message.');
      if (!parsed.data.reviewed) throw new ApiError('VALIDATION_ERROR', 'Review the message before sending.');
    }
    const ctx = newCtx(m.user, m.aal);
    m.eng.enqueuePatientMessage(c, parsed.data.template, undefined, parsed.data.template === 'free_text' ? parsed.data.text : undefined);
    m.eng.addEvent(c, ctx, { eventType: 'notify.patient', title: parsed.data.template === 'free_text' ? 'Reviewed message sent to patient' : 'Patient update sent' });
    m.eng.processOutbox();
    notifyChange();
    return [...m.eng.db.notifications].reverse().find((n) => n.caseId === c.id)!;
  },

  async completeTask(caseId, taskId) {
    await gate('completeTask', [150, 300]);
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    const c = scopedCase(m, caseId);
    const t = m.eng.db.tasks.find((x) => x.id === taskId && x.caseId === c.id);
    if (!t) throw new ApiError('NOT_FOUND', 'Task not found.');
    t.status = 'done';
    m.eng.addEvent(c, newCtx(m.user, m.aal), { eventType: 'task.done', title: `Task done: ${t.title}` });
    notifyChange();
    if (!IS_TEST) persistTaskCompletion(t.id);
  },

  async retryDispatch(caseId) {
    await gate('retryDispatch');
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    const c = scopedCase(m, caseId);
    m.eng.retryDeadLetter(c, newCtx(m.user, m.aal));
    notifyChange();
    return detailFor(m, c);
  },

  async uploadAttachment(file) {
    await gate('uploadAttachment');
    const m = me();
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Upload a PDF, PNG or JPEG under 10 MB.');
    if (/\.(html?|svg|js|exe|php|bat|sh)$/i.test(file.name) || !ALLOWED_UPLOAD_TYPES.includes(file.type as (typeof ALLOWED_UPLOAD_TYPES)[number])) {
      throw new ApiError('UNSUPPORTED_FILE', 'Upload a PDF, PNG or JPEG under 10 MB.');
    }
    const head = new Uint8Array(await readHead(file));
    const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const okMagic = (file.type === 'application/pdf' && isPdf) || (file.type === 'image/png' && isPng) || (file.type === 'image/jpeg' && isJpg);
    if (!okMagic) throw new ApiError('UNSUPPORTED_FILE', "This file's contents don't match its type. Upload a real PDF, PNG or JPEG.");
    const att = { id: uid('att'), name: file.name, mime: file.type, sizeBytes: file.size };
    attachments.set(att.id, { ...att, orgId: m.user.orgId });
    return att;
  },

  async extractIntake(input) {
    await gate('extractIntake', [900, 1800]);
    const m = me();
    aiRateLimit(m.user.id);
    const parsed = extractIntakeSchema.safeParse(input);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message);
    const started = performance.now();
    let result;
    if (parsed.data.attachmentId) {
      const att = attachments.get(parsed.data.attachmentId);
      if (!att || att.orgId !== m.user.orgId) throw new ApiError('NOT_FOUND', 'Attachment not found.');
      result = mockExtractFromFile(att.name);
    } else {
      result = mockExtract(parsed.data.text ?? '');
    }
    const latencyMs = Math.round(performance.now() - started) + (IS_TEST ? 0 : 1200);
    const row = recordAi(m.eng, m, { caseId: null, feature: 'AI-1', promptVersion: PROMPT_VERSIONS['AI-1'], inputHash: hashInput(parsed.data.text ?? parsed.data.attachmentId ?? ''), output: result, latencyMs });
    return { ...result, suggestionId: row.id, latencyMs };
  },

  async getCaseSummary(caseId) {
    await gate('getCaseSummary', [700, 1400]);
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    aiRateLimit(m.user.id);
    const c = scopedCase(m, caseId);
    const d = toPracticeDetail(m, c);
    const bullets: { text: string; sourceRefs: { label: string; ref: string }[] }[] = [];
    const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'none on file');
    if (d.prescription) {
      const rx = d.prescription;
      const days = rx.lastFillAt ? Math.floor((m.eng.now().getTime() - new Date(rx.lastFillAt).getTime()) / 86_400_000) : null;
      bullets.push({ text: `${rx.medicationName} ${rx.strength}: ${rx.refillsRemaining} refill(s) left; last filled ${fmt(rx.lastFillAt)}${days !== null ? ` (${days} days ago, ${rx.daysSupply}-day supply)` : ''}.`, sourceRefs: [{ label: 'Prescription', ref: `prescription:${rx.id}` }] });
    } else {
      bullets.push({ text: 'No matching prescription on file.', sourceRefs: [{ label: 'Request', ref: `case:${c.id}` }] });
    }
    bullets.push({ text: `Last visit ${fmt(d.lastVisit)}${d.lastA1c ? `; last A1c ${fmt(d.lastA1c)}` : ''}. ${d.priorCases.length} other refill request(s) in the last 12 months.`, sourceRefs: [{ label: 'Encounters', ref: `patient:${c.patientId}:encounters` }, ...(d.lastA1c ? [{ label: 'Labs', ref: `patient:${c.patientId}:observations` }] : [])] });
    if (c.blockers.length) bullets.push({ text: `Needs attention: ${c.blockers.map((b) => b.detail).join(' ')}`, sourceRefs: c.blockers.map((b) => ({ label: `Rule ${b.source}`, ref: `rule:${b.source}` })) });
    else bullets.push({ text: 'No blockers found by the rules.', sourceRefs: [{ label: 'Rule R10', ref: 'rule:R10' }] });
    const row = recordAi(m.eng, m, { caseId: c.id, feature: 'AI-3', promptVersion: PROMPT_VERSIONS['AI-3'], inputHash: hashInput(c.id + c.version), output: bullets, latencyMs: 820 });
    return { suggestionId: row.id, mock: true, bullets: bullets.slice(0, 3), promptVersion: PROMPT_VERSIONS['AI-3'] };
  },

  async suggestNextAction(caseId) {
    await gate('suggestNextAction', [600, 1200]);
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    aiRateLimit(m.user.id);
    const c = scopedCase(m, caseId);
    const allowed = practiceAllowedActions(c, m.user.role, m.eng);
    let action: TransitionAction | null = null;
    let reason: string;
    if (c.blockers.some((b) => b.code === 'CONTROLLED_SUBSTANCE')) {
      reason = 'AI makes no suggestions on controlled-substance cases. A provider must review.';
    } else if (c.suggestedAction && allowed.includes(c.suggestedAction)) {
      action = c.suggestedAction;
      reason = { REQUEST_INFO: 'Required details are missing or conflicting; ask the pharmacy before routing.', ROUTE_TO_PROVIDER: 'A clinical blocker needs a provider decision.', ROUTE_TO_INSURANCE: 'Only an insurance blocker remains.', CLOSE_NOT_NEEDED: 'Refills remain and nothing blocks this refill; the pharmacy can process it.' }[c.suggestedAction as string] ?? 'Based on the current blockers.';
    } else {
      reason = allowed.length ? 'No confident suggestion — use your judgement.' : 'No actions are available to you in this state.';
    }
    const row = recordAi(m.eng, m, { caseId: c.id, feature: 'AI-4', promptVersion: PROMPT_VERSIONS['AI-4'], inputHash: hashInput(c.id + c.version), output: { action, reason }, latencyMs: 640 });
    return { suggestionId: row.id, mock: true, action, reason };
  },

  async draftPatientMessage(caseId) {
    await gate('draftPatientMessage', [600, 1200]);
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    aiRateLimit(m.user.id);
    const c = scopedCase(m, caseId);
    const clinic = m.eng.org(c.practiceOrgId).name;
    const status = STATUS_LABELS[c.status].toLowerCase();
    // Minimum necessary: status + clinic only. No drug name, no clinical data.
    const sms = `Hi, this is ${clinic}. Quick update on your prescription request: it is currently "${status}". We will text you when it changes. Questions? Call ${m.eng.org(c.practiceOrgId).phone}.`.slice(0, 300);
    const row = recordAi(m.eng, m, { caseId: c.id, feature: 'AI-5', promptVersion: PROMPT_VERSIONS['AI-5'], inputHash: hashInput(c.status), output: { sms }, latencyMs: 700 });
    return { suggestionId: row.id, mock: true, smsText: sms, emailText: `${patientTemplateText('default', clinic)}\n\n${sms}` };
  },

  async recordAiOutcome(suggestionId, outcome) {
    const m = me();
    const s = m.eng.db.ai.find((a) => a.id === suggestionId && a.orgId === m.user.orgId);
    if (!s) throw new ApiError('NOT_FOUND', 'Suggestion not found.');
    s.outcome = outcome;
  },

  async verifyPatientStatus(token, dob) {
    await gate('verifyPatientStatus');
    const eng = getEngine();
    const now = Date.now();
    while (statusAttemptsByClient.length && now - statusAttemptsByClient[0] > 3_600_000) statusAttemptsByClient.shift();
    if (statusAttemptsByClient.length >= 20) throw new ApiError('RATE_LIMITED', 'Too many attempts. Please try again later or call your clinic.');
    statusAttemptsByClient.push(now);
    const t = eng.db.statusTokens.find((x) => x.token === token);
    if (!t) throw new ApiError('NOT_FOUND', 'This link is not valid. Please call your clinic.');
    const c = eng.db.cases.find((x) => x.id === t.caseId)!;
    const clinic = eng.org(c.practiceOrgId);
    if (new Date(t.expiresAt).getTime() < eng.now().getTime()) throw new ApiError('NOT_FOUND', `This link has expired. Please call ${clinic.name} at ${clinic.phone}.`);
    if (t.lockedAt) throw new ApiError('FORBIDDEN', `This link is locked. Call ${clinic.name} at ${clinic.phone}.`);
    const expectedDob = eng.patient(c.patientId)?.dob ?? c.requestedPayload.patientDob;
    if (dob !== expectedDob) {
      t.failedAttempts += 1;
      if (t.failedAttempts >= 5) {
        t.lockedAt = eng.nowIso();
        throw new ApiError('FORBIDDEN', `This link is locked. Call ${clinic.name} at ${clinic.phone}.`);
      }
      const left = 5 - t.failedAttempts;
      throw new ApiError('VALIDATION_ERROR', `That date of birth doesn't match. ${left} attempt${left === 1 ? '' : 's'} left.`);
    }
    t.failedAttempts = 0;
    return patientStatusView(eng, c);
  },

  async getAnalyticsSummary(_range) {
    await gate('getAnalyticsSummary');
    const m = me();
    if (!can(m.user.role, 'analytics.view')) throw new ApiError('FORBIDDEN', "You don't have access to analytics.");
    const { eng, user } = m;
    const practiceView = isPracticeRole(user.role);
    const cases = eng.db.cases.filter((c) => (practiceView ? c.practiceOrgId === user.orgId : c.pharmacyOrgId === user.orgId));
    if (isEmpty('getAnalyticsSummary') || cases.length === 0) {
      return { northStarPct: 0, medianHoursToConfirm: 0, touchesPerRefill: 0, infoRoundTrips: 0, slaBreachRate: 0, aiAcceptanceRate: 0, openCases: 0, resolvedCases: 0, casesByStatus: [], topBlockers: [], weekly: [], byPharmacy: [] };
    }
    const confirmedAt = (c: CaseRow) => {
      const ev = eng.db.events.find((e) =>
        e.caseId === c.id &&
        (e.eventType === 'pharmacy.acknowledged' || e.toStatus === 'PHARMACY_CONFIRMED' || e.eventType === 'PHARMACY_ACKNOWLEDGED')
      );
      if (ev) return ev.createdAt;
      const isConfirmedState = ['PHARMACY_CONFIRMED', 'FILLING', 'READY_FOR_PICKUP', 'DISPENSED'].includes(c.status) || (c.status === 'CLOSED' && c.resolution === 'completed');
      if (isConfirmedState) return c.statusSince || c.updatedAt;
      return undefined;
    };
    const confirmed = cases.map((c) => ({ c, at: confirmedAt(c) })).filter((x): x is { c: CaseRow; at: string } => Boolean(x.at));
    const hours = confirmed.map((x) => (new Date(x.at).getTime() - new Date(x.c.createdAt).getTime()) / 3_600_000).sort((a, b) => a - b);
    const median = hours.length ? hours[Math.floor(hours.length / 2)] : 0;
    const within = hours.filter((h) => h <= 48).length;
    const touches = cases.map((c) => eng.db.events.filter((e) => e.caseId === c.id && e.actorType === 'user').length);
    const escalated = cases.filter((c) => eng.db.events.some((e) =>
      e.caseId === c.id &&
      (e.eventType === 'sla.escalated' || e.reason?.includes('SLA'))
    )).length;
    const ai = eng.db.ai.filter((a) => a.orgId === user.orgId && a.outcome);
    const blockerCounts = new Map<BlockerCode, number>();
    for (const c of cases) for (const b of c.blockers) blockerCounts.set(b.code, (blockerCounts.get(b.code) ?? 0) + 1);
    const statusCounts = new Map<CaseStatus, number>();
    for (const c of cases) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
    const byPharmacy = eng.db.orgs
      .filter((o) => o.type === 'pharmacy' && cases.some((c) => c.pharmacyOrgId === o.id))
      .map((o) => {
        const pc = confirmed.filter((x) => x.c.pharmacyOrgId === o.id);
        const acks = pc.map((x) => {
          const sent = eng.db.events.find((e) =>
            e.caseId === x.c.id &&
            (e.eventType === 'dispatch.sent' || e.toStatus === 'SENT_TO_PHARMACY' || e.eventType === 'DISPATCH_SUCCEEDED')
          )?.createdAt;
          return sent ? (new Date(x.at).getTime() - new Date(sent).getTime()) / 3_600_000 : 0;
        }).sort((a, b) => a - b);
        return { name: o.name, cases: cases.filter((c) => c.pharmacyOrgId === o.id).length, medianAckHours: acks.length ? Math.round(acks[Math.floor(acks.length / 2)] * 10) / 10 : 0 };
      });
    return {
      northStarPct: hours.length ? Math.round((within / hours.length) * 100) : 100,
      medianHoursToConfirm: Math.round(median * 10) / 10,
      touchesPerRefill: Math.round((touches.reduce((a, b) => a + b, 0) / cases.length) * 10) / 10,
      infoRoundTrips: Math.round((eng.db.infoRequests.filter((r) => cases.some((c) => c.id === r.caseId)).length / cases.length) * 100) / 100,
      slaBreachRate: Math.round((escalated / cases.length) * 100),
      aiAcceptanceRate: ai.length ? Math.round((ai.filter((a) => a.outcome === 'accepted').length / ai.length) * 100) : 82,
      openCases: cases.filter((c) => !isTerminal(c.status)).length,
      resolvedCases: cases.filter((c) => isTerminal(c.status)).length,
      casesByStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
      topBlockers: [...blockerCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 6),
      weekly: weeklyHistory(eng),
      byPharmacy,
    };
  },

  async listMembers() {
    await gate('listMembers');
    const m = me();
    if (isEmpty('listMembers')) return [];
    const members = m.eng.db.users
      .filter((u) => u.orgId === m.user.orgId && u.status !== 'removed')
      .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, mfaEnrolled: u.mfaEnrolled, lastActive: u.lastActive }));
    const invites = m.eng.db.invites
      .filter((i) => i.orgId === m.user.orgId && !i.usedAt)
      .map((i) => ({ id: i.id, name: '—', email: i.email, role: i.role, status: 'invited' as const, mfaEnrolled: false, lastActive: null }));
    return [...members, ...invites];
  },

  async inviteMember(input) {
    await gate('inviteMember');
    const m = me();
    if (!can(m.user.role, 'team.manage')) throw new ApiError('FORBIDDEN', 'Only admins can invite members.');
    requireAal2(m);
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message);
    const allowedRoles = m.user.role === 'practice_admin' ? PRACTICE_ROLES : PHARMACY_ROLES;
    if (!allowedRoles.includes(parsed.data.role)) throw new ApiError('VALIDATION_ERROR', 'That role is not available for your organisation.');
    if (m.eng.db.users.some((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase() && u.status !== 'removed')) {
      throw new ApiError('VALIDATION_ERROR', 'This person is already a member.');
    }
    const inv = { id: uid('inv'), orgId: m.user.orgId, email: parsed.data.email, role: parsed.data.role, token: randomToken(), expiresAt: new Date(Date.now() + 72 * 3_600_000).toISOString(), usedAt: null, invitedBy: m.user.id };
    m.eng.db.invites.push(inv);
    m.eng.audit(m.user.orgId, newCtx(m.user, m.aal), 'member.invite', 'invites', inv.id);
    return { id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt, token: inv.token };
  },

  async updateMemberRole(memberId, role) {
    await gate('updateMemberRole');
    const m = me();
    if (!can(m.user.role, 'team.manage')) throw new ApiError('FORBIDDEN', 'Only admins can change roles.');
    requireAal2(m);
    const target = m.eng.db.users.find((u) => u.id === memberId && u.orgId === m.user.orgId);
    if (!target) throw new ApiError('NOT_FOUND', 'Member not found.');
    const allowedRoles = m.user.role === 'practice_admin' ? PRACTICE_ROLES : PHARMACY_ROLES;
    if (!allowedRoles.includes(role)) throw new ApiError('VALIDATION_ERROR', 'That role is not available for your organisation.');
    const adminRole = m.user.role;
    const admins = m.eng.db.users.filter((u) => u.orgId === m.user.orgId && u.role === adminRole && u.status === 'active');
    if (target.role === adminRole && role !== adminRole && admins.length <= 1) throw new ApiError('VALIDATION_ERROR', 'Your organisation needs at least one admin.');
    target.role = role;
    m.eng.audit(m.user.orgId, newCtx(m.user, m.aal), 'member.role_change', 'memberships', target.id);
    return { id: target.id, name: target.name, email: target.email, role: target.role, status: target.status, mfaEnrolled: target.mfaEnrolled, lastActive: target.lastActive };
  },

  async removeMember(memberId) {
    await gate('removeMember');
    const m = me();
    if (!can(m.user.role, 'team.manage')) throw new ApiError('FORBIDDEN', 'Only admins can remove members.');
    requireAal2(m);
    const inv = m.eng.db.invites.find((i) => i.id === memberId && i.orgId === m.user.orgId);
    if (inv) {
      m.eng.db.invites = m.eng.db.invites.filter((i) => i.id !== memberId);
      return;
    }
    const target = m.eng.db.users.find((u) => u.id === memberId && u.orgId === m.user.orgId);
    if (!target) throw new ApiError('NOT_FOUND', 'Member not found.');
    const admins = m.eng.db.users.filter((u) => u.orgId === m.user.orgId && u.role === m.user.role && u.status === 'active');
    if (target.role === m.user.role && admins.length <= 1) throw new ApiError('VALIDATION_ERROR', 'Your organisation needs at least one admin.');
    target.status = 'removed';
    m.eng.audit(m.user.orgId, newCtx(m.user, m.aal), 'member.remove', 'memberships', target.id);
  },

  async getPolicies() {
    await gate('getPolicies');
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    return structuredClone(m.eng.policiesFor(m.user.orgId));
  },

  async updatePolicies(input) {
    await gate('updatePolicies');
    const m = me();
    if (!can(m.user.role, 'policies.edit')) throw new ApiError('FORBIDDEN', 'Only practice admins can edit policies.');
    requireAal2(m);
    const parsed = policiesSchema.safeParse(input);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message);
    const v = parsed.data;
    const current = structuredClone(m.eng.policiesFor(m.user.orgId));
    current.maxBridgeDays = v.maxBridgeDays;
    current.rxValidityMonths = v.rxValidityMonths;
    current.tooEarlyThreshold = v.tooEarlyThreshold;
    current.sla.WAITING_ON_PROVIDER = { routine: { minutes: v.providerSlaHours * 60, business: true }, urgent: { minutes: v.providerUrgentSlaHours * 60, business: true } };
    current.sla.SENT_TO_PHARMACY = { routine: { minutes: v.pharmacyAckHours * 60, business: true }, urgent: { minutes: Math.max(1, Math.round(v.pharmacyAckHours / 4)) * 60, business: true } };
    current.visitRules = { ...current.visitRules, bloodPressureVisitMonths: v.bloodPressureVisitMonths, diabetesA1cMonths: v.diabetesA1cMonths, diabetesVisitMonths: v.diabetesVisitMonths, antidepressantVisitMonths: v.antidepressantVisitMonths, adhdVisitMonths: v.adhdVisitMonths };
    m.eng.db.policies[m.user.orgId] = current;
    m.eng.audit(m.user.orgId, newCtx(m.user, m.aal), 'policies.update', 'practice_policies', m.user.orgId);
    return structuredClone(current);
  },

  async listLinkedOrgs() {
    await gate('listLinkedOrgs', [100, 250]);
    const m = me();
    const links = m.eng.db.links.filter((l) => l.status === 'active' && (l.practiceOrgId === m.user.orgId || l.pharmacyOrgId === m.user.orgId));
    return links.map((l) => m.eng.org(l.practiceOrgId === m.user.orgId ? l.pharmacyOrgId : l.practiceOrgId));
  },

  async listPharmacyLinks() {
    await gate('listPharmacyLinks');
    const m = me();
    if (isEmpty('listPharmacyLinks')) return [];
    return m.eng.db.links.filter((l) => l.practiceOrgId === m.user.orgId || l.pharmacyOrgId === m.user.orgId).map(({ practiceOrgId: _a, pharmacyOrgId: _b, ...rest }) => rest);
  },

  async invitePharmacy(name, email) {
    await gate('invitePharmacy');
    const m = me();
    if (!can(m.user.role, 'pharmacies.link')) throw new ApiError('FORBIDDEN', 'Only practice admins can link pharmacies.');
    requireAal2(m);
    if (name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('VALIDATION_ERROR', 'Enter the pharmacy name and a valid email.');
    const org = { id: uid('org'), name: name.trim(), type: 'pharmacy' as const, timezone: 'America/Chicago', phone: '—', city: '—' };
    m.eng.db.orgs.push(org);
    const link = { id: uid('lnk'), practiceOrgId: m.user.orgId, pharmacyOrgId: org.id, practiceName: m.user.orgId === 'org-lfm' ? 'Lakeside Family Medicine' : m.eng.org(m.user.orgId).name, pharmacyName: org.name, status: 'pending' as const, city: '—', casesLast30d: 0 };
    m.eng.db.links.push(link);
    m.eng.audit(m.user.orgId, newCtx(m.user, m.aal), 'pharmacy_link.invite', 'practice_pharmacy_links', link.id);
    const { practiceOrgId: _a, pharmacyOrgId: _b, ...rest } = link;
    return rest;
  },

  async updatePharmacyLink(linkId, status) {
    await gate('updatePharmacyLink');
    const m = me();
    const link = m.eng.db.links.find((l) => l.id === linkId && (l.practiceOrgId === m.user.orgId || l.pharmacyOrgId === m.user.orgId));
    if (!link) throw new ApiError('NOT_FOUND', 'Link not found.');
    if (status === 'active' && m.user.role !== 'pharmacy_admin' && link.status === 'pending') throw new ApiError('FORBIDDEN', 'The pharmacy admin accepts the link.');
    if (status === 'revoked' && m.user.role !== 'practice_admin') throw new ApiError('FORBIDDEN', 'Only practice admins can unlink pharmacies.');
    requireAal2(m);
    link.status = status;
    m.eng.audit(m.user.orgId, newCtx(m.user, m.aal), `pharmacy_link.${status}`, 'practice_pharmacy_links', link.id);
    const { practiceOrgId: _a, pharmacyOrgId: _b, ...rest } = link;
    return rest;
  },

  async listAssignableUsers() {
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    return m.eng.db.users.filter((u) => u.orgId === m.user.orgId && u.status === 'active').map((u) => ({ id: u.id, name: u.name, role: u.role }));
  },

  async listAuditLogs(page) {
    await gate('listAuditLogs');
    const m = me();
    if (!can(m.user.role, 'audit.view')) throw new ApiError('FORBIDDEN', 'Only admins can view the audit log.');
    requireAal2(m);
    const limit = Math.min(page.limit ?? 25, 100);
    const p = page.page ?? 1;
    const rows = m.eng.db.audit.filter((a) => a.orgId === m.user.orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ orgId: _o, ...rest }) => rest);
    return { data: rows.slice((p - 1) * limit, p * limit), meta: { page: p, limit, total: rows.length } };
  },

  async getHealth() {
    const eng = getEngine();
    const now = Date.now();
    const stale = Object.values(eng.db.heartbeats).some((t) => now - new Date(t).getTime() > 5 * 60_000 + eng.clockOffsetMin * 60_000);
    return { status: stale ? 'degraded' : 'ok', workers: { ...eng.db.heartbeats }, version: '0.1.0-mock' };
  },

  async getSimulator() {
    const m = me();
    if (!can(m.user.role, 'simulator.use')) throw new ApiError('FORBIDDEN', 'Simulator is for practice admins in demo mode.');
    return { pharmacyDownUntil: m.eng.sim.pharmacyDownUntil, smsDown: m.eng.sim.smsDown, quietHours: m.eng.sim.quietHours, clockOffsetMinutes: m.eng.clockOffsetMin };
  },

  async simulate(action: SimulatorAction) {
    if (import.meta.env.VITE_APP_ENV === 'production') throw new ApiError('FORBIDDEN', 'The simulator is disabled in production.');
    await gate('simulate', [100, 250]);
    const m = me();
    if (!can(m.user.role, 'simulator.use')) throw new ApiError('FORBIDDEN', 'Simulator is for practice admins in demo mode.');
    const { eng } = m;
    switch (action.type) {
      case 'pharmacy_down':
        eng.sim.pharmacyDownUntil = new Date(eng.now().getTime() + action.minutes * 60_000).toISOString();
        break;
      case 'pharmacy_up':
        eng.sim.pharmacyDownUntil = null;
        break;
      case 'sms_down':
        eng.sim.smsDown = action.down;
        break;
      case 'quiet_hours':
        eng.sim.quietHours = action.enabled;
        break;
      case 'skip_time':
        eng.clockOffsetMin += action.minutes;
        // Let the workers "catch up" in 5-minute steps so retries and escalations happen in order.
        for (let i = 0; i < Math.ceil(action.minutes / 5); i++) {
          eng.fixedNow = new Date(Date.now() + (eng.clockOffsetMin - action.minutes + (i + 1) * 5) * 60_000);
          eng.tick();
        }
        eng.fixedNow = null;
        break;
      case 'pharmacy_ack': {
        const c = eng.db.cases.find((x) => x.id === action.caseId && x.practiceOrgId === m.user.orgId);
        if (!c) throw new ApiError('NOT_FOUND', "We couldn't find that case.");
        eng.apply(c, 'PHARMACY_ACKNOWLEDGED', { actor: { kind: 'system' }, userId: null, name: `${eng.org(c.pharmacyOrgId).name} (signed webhook)`, actorType: 'pharmacy_system', requestId: newRequestId() }, {});
        break;
      }
      case 'reset':
        resetEngine();
        idempotency.clear();
        return;
    }
    eng.tick();
    notifyChange();
  },

  async getDemoStatusLink(caseId) {
    const m = me();
    requireRole(m, PRACTICE_ROLES);
    const c = scopedCase(m, caseId);
    const t = m.eng.db.statusTokens.find((x) => x.caseId === c.id);
    return t ? `/status/${t.token}` : null;
  },
};

const attachments = new Map<string, { id: string; name: string; mime: string; sizeBytes: number; orgId: string }>();

async function readHead(file: File): Promise<ArrayBuffer> {
  const blob = file.slice(0, 8);
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

export { LOW_CONFIDENCE };
