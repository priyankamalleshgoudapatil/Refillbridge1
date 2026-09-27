// Deterministic triage rules engine (master prompt §5.4). Pure: no I/O, no AI.
// Every blocker carries the rule ID that raised it, which becomes the "why" in the event log.
import type {
  EncounterRecord,
  ObservationRecord,
  PatientRecord,
  PrescriptionRecord,
} from '../records.ts';
import type {
  BlockerCode,
  CaseBlocker,
  PracticePolicies,
  Priority,
  RequestedPayload,
  RuleId,
  TransitionAction,
} from '../types.ts';
import { CLINICAL_BLOCKERS, DATA_BLOCKERS, INSURANCE_BLOCKERS } from '../types.ts';

const DAY_MS = 86_400_000;

export function addMonths(iso: string | Date, months: number): Date {
  const d = new Date(iso);
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const norm = (s: string | undefined | null) => (s ?? '').trim().toLowerCase();
const digits = (s: string | undefined | null) => (s ?? '').replace(/\D/g, '');
const normStrength = (s: string | undefined | null) => norm(s).replace(/\s+/g, '');

// ---------------------------------------------------------------------------------------------
// R1 — Patient match
// ---------------------------------------------------------------------------------------------

export type MatchResult =
  | { kind: 'exact'; patient: PatientRecord }
  | { kind: 'uncertain'; candidates: PatientRecord[]; reason: string };

/** Exact match needs first + last name + DOB + one of (phone, chart number). Never auto-merges. */
export function matchPatient(req: RequestedPayload, patients: PatientRecord[]): MatchResult {
  const first = norm(req.patientFirstName);
  const last = norm(req.patientLastName);
  const exact = patients.filter(
    (p) =>
      norm(p.firstName) === first &&
      norm(p.lastName) === last &&
      p.dob === req.patientDob &&
      ((req.patientPhone && digits(p.phone) !== '' && digits(p.phone) === digits(req.patientPhone)) ||
        (req.chartNumber && norm(p.chartNumber) === norm(req.chartNumber))),
  );
  if (exact.length === 1) return { kind: 'exact', patient: exact[0] };

  const candidates = patients.filter(
    (p) =>
      (norm(p.lastName) === last && (p.dob === req.patientDob || norm(p.firstName) === first)) ||
      (p.dob === req.patientDob && norm(p.firstName) === first),
  );
  const reason =
    exact.length > 1
      ? 'Several patients match every identifier.'
      : candidates.length === 0
        ? 'No patient at this practice matches the name and date of birth.'
        : 'Name and date of birth are not confirmed by a phone number or chart number.';
  return { kind: 'uncertain', candidates, reason };
}

// ---------------------------------------------------------------------------------------------
// R2–R10 — Triage
// ---------------------------------------------------------------------------------------------

export interface TriageInput {
  now: Date;
  request: RequestedPayload;
  patient: PatientRecord;
  prescriptions: PrescriptionRecord[]; // this patient's prescriptions
  encounters: EncounterRecord[]; // this patient's encounters
  observations: ObservationRecord[]; // this patient's observations
  policies: PracticePolicies;
}

export type TriageRoute = 'staff' | 'provider' | 'insurance' | 'none';

export interface TriageResult {
  blockers: CaseBlocker[];
  ruleIds: RuleId[];
  prescription: PrescriptionRecord | null;
  missingFields: string[];
  conflicts: { field: string; reported: string; chart: string }[];
  priority: Priority;
  daysSupplyLeft: number | null;
  route: TriageRoute;
  /** True only when the rules alone are certain (T7 by system). AI never sets this. */
  autoRoute: boolean;
  suggestedAction: TransitionAction;
  nextAction: string;
}

export const REQUIRED_FIELDS: { key: keyof RequestedPayload; label: string }[] = [
  { key: 'patientFirstName', label: 'patient first name' },
  { key: 'patientLastName', label: 'patient last name' },
  { key: 'medicationName', label: 'drug name' },
  { key: 'strength', label: 'strength' },
  { key: 'quantity', label: 'quantity' },
  { key: 'pharmacyName', label: 'pharmacy' },
];

export function findPrescription(
  req: RequestedPayload,
  prescriptions: PrescriptionRecord[],
): { match: PrescriptionRecord | null; candidates: PrescriptionRecord[] } {
  const token = norm(req.medicationName).split(/\s+/)[0] ?? '';
  if (!token) return { match: null, candidates: [] };
  const byName = prescriptions.filter((rx) => {
    const name = norm(rx.medicationName);
    return name.includes(token) || token.includes(name.split(/\s+/)[0] ?? '');
  });
  if (byName.length <= 1) return { match: byName[0] ?? null, candidates: byName };
  const byStrength = byName.filter((rx) => normStrength(rx.strength) === normStrength(req.strength));
  if (byStrength.length === 1) return { match: byStrength[0], candidates: byName };
  const active = byName.filter((rx) => rx.status === 'active');
  if (active.length === 1 && byStrength.length === 0 && !req.strength) {
    return { match: active[0], candidates: byName };
  }
  return { match: null, candidates: byName };
}

export function latest<T>(items: T[], key: (t: T) => string): T | null {
  return items.reduce<T | null>((acc, it) => (acc === null || key(it) > key(acc) ? it : acc), null);
}

export function runTriage(input: TriageInput): TriageResult {
  const { now, request: req, prescriptions, encounters, observations, policies } = input;
  const blockers: CaseBlocker[] = [];
  const fired = new Set<RuleId>();
  const add = (code: BlockerCode, source: RuleId, detail: string) => {
    fired.add(source);
    if (!blockers.some((b) => b.code === code)) blockers.push({ code, source, detail });
  };

  // R3 — required fields present
  const missingFields = REQUIRED_FIELDS.filter(({ key }) => {
    const v = req[key];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (key === 'quantity' && typeof v === 'number' && v <= 0);
  }).map((f) => f.label);
  if (missingFields.length > 0) {
    add('MISSING_INFO', 'R3', `Missing: ${missingFields.join(', ')}.`);
  }

  // R2 — prescription found
  const { match: rx, candidates } = findPrescription(req, prescriptions);
  if (!rx && candidates.length === 0 && req.medicationName.trim()) {
    add('NEW_RX_REQUIRED', 'R2', `No prescription for ${req.medicationName} is on file.`);
  } else if (!rx && candidates.length > 1) {
    add(
      'CONFLICTING_INFO',
      'R2',
      `Several prescriptions match: ${candidates.map((c) => `${c.medicationName} ${c.strength}`).join(' · ')}.`,
    );
  }

  const conflicts: TriageResult['conflicts'] = [];
  if (rx) {
    // R4 — prescription active
    if (rx.status !== 'active') {
      const when = rx.statusChangedAt ? ` on ${fmtDate(rx.statusChangedAt)}` : '';
      add('MED_DISCONTINUED', 'R4', `Chart shows this medication was ${rx.status}${when}.`);
    }

    // R5 — controlled substance (AI makes no suggestions on these cases)
    if (rx.controlledSchedule) {
      add('CONTROLLED_SUBSTANCE', 'R5', `Schedule ${rx.controlledSchedule} controlled substance: provider must review.`);
      if (rx.controlledSchedule === 'II') {
        add('NEW_RX_REQUIRED', 'R5', 'Schedule II cannot be refilled. A new prescription is needed.');
      } else if (rx.controlledSchedule === 'III' || rx.controlledSchedule === 'IV') {
        const refillsUsed = rx.refillsAuthorized - rx.refillsRemaining;
        const pastSixMonths = now > addMonths(rx.writtenAt, 6);
        if (pastSixMonths || refillsUsed >= 5) {
          add(
            'NEW_RX_REQUIRED',
            'R5',
            pastSixMonths
              ? `Schedule ${rx.controlledSchedule}: more than 6 months since written. A new prescription is needed.`
              : `Schedule ${rx.controlledSchedule}: 5 refills already used. A new prescription is needed.`,
          );
        }
      }
    }

    // R6 — refills and validity
    const expired = now > addMonths(rx.writtenAt, policies.rxValidityMonths);
    if (rx.refillsRemaining <= 0) {
      add('NO_REFILLS_REMAINING', 'R6', 'No refills remain on this prescription.');
    } else if (expired) {
      add('NO_REFILLS_REMAINING', 'R6', `Prescription is older than ${policies.rxValidityMonths} months.`);
    }

    // R7 — visit / monitoring rules by drug class (practice-configurable, not clinical advice)
    const lastVisit = latest(encounters, (e) => e.occurredAt);
    const lastA1c = latest(observations.filter((o) => o.code === 'A1C'), (o) => o.observedAt);
    const visitOlderThan = (months: number) => !lastVisit || now > addMonths(lastVisit.occurredAt, months);
    const lastVisitText = lastVisit ? `last visit ${fmtDate(lastVisit.occurredAt)}` : 'no visit on file';
    const vr = policies.visitRules;
    switch (rx.drugClass) {
      case 'blood_pressure':
        if (visitOlderThan(vr.bloodPressureVisitMonths))
          add('VISIT_REQUIRED', 'R7', `Blood pressure medication: ${lastVisitText} (policy: every ${vr.bloodPressureVisitMonths} months).`);
        break;
      case 'diabetes':
        if (!lastA1c || now > addMonths(lastA1c.observedAt, vr.diabetesA1cMonths))
          add('CLINICAL_REVIEW', 'R7', `A1c overdue: ${lastA1c ? `last A1c ${fmtDate(lastA1c.observedAt)}` : 'no A1c on file'} (policy: every ${vr.diabetesA1cMonths} months).`);
        if (visitOlderThan(vr.diabetesVisitMonths))
          add('VISIT_REQUIRED', 'R7', `Diabetes medication: ${lastVisitText} (policy: every ${vr.diabetesVisitMonths} months).`);
        break;
      case 'antidepressant':
        if (visitOlderThan(vr.antidepressantVisitMonths))
          add('VISIT_REQUIRED', 'R7', `Antidepressant: ${lastVisitText} (policy: every ${vr.antidepressantVisitMonths} months).`);
        break;
      case 'adhd':
        if (visitOlderThan(vr.adhdVisitMonths))
          add('VISIT_REQUIRED', 'R7', `ADHD medication: ${lastVisitText} (policy: every ${vr.adhdVisitMonths} months).`);
        break;
      case 'controlled_other':
        if (visitOlderThan(vr.controlledOtherVisitMonths))
          add('VISIT_REQUIRED', 'R7', `Controlled medication: ${lastVisitText} (policy: every ${vr.controlledOtherVisitMonths} months).`);
        break;
      default:
        break;
    }
    if (rx.checkInBeforeNextRefill) {
      add('VISIT_REQUIRED', 'R7', 'Provider asked to check in before the next refill.');
    }

    // R8 — conflicts between pharmacy-reported and chart data
    if (req.reportedRefillsRemaining !== undefined && req.reportedRefillsRemaining !== rx.refillsRemaining) {
      conflicts.push({ field: 'Refills remaining', reported: String(req.reportedRefillsRemaining), chart: String(rx.refillsRemaining) });
    }
    if (req.strength && normStrength(req.strength) !== normStrength(rx.strength)) {
      conflicts.push({ field: 'Strength', reported: req.strength, chart: rx.strength });
    }
    if (conflicts.length > 0) {
      add(
        'CONFLICTING_INFO',
        'R8',
        conflicts.map((c) => `${c.field}: pharmacy says ${c.reported}, chart says ${c.chart}`).join('; ') + '.',
      );
    }
  }

  // R9 — insurance flags
  if (req.insuranceFlag === 'PA_REQUIRED') add('INSURANCE_PA_REQUIRED', 'R9', 'Pharmacy reports a new prior authorization is needed.');
  if (req.insuranceFlag === 'NOT_COVERED') add('INSURANCE_NOT_COVERED', 'R9', 'Pharmacy reports this medication is not covered.');
  if (req.insuranceFlag === 'INSURANCE_CHANGED') add('INSURANCE_CHANGED', 'R9', "Pharmacy reports the patient's insurance changed.");
  if (rx?.lastFillAt) {
    const earliest = new Date(new Date(rx.lastFillAt).getTime() + rx.daysSupply * policies.tooEarlyThreshold * DAY_MS);
    if (now < earliest) add('INSURANCE_TOO_EARLY', 'R9', `Too early to refill. Earliest fill: ${fmtDate(earliest)}.`);
  }

  // Priority — URGENT when ≤ 2 days of supply left
  let daysSupplyLeft: number | null = null;
  if (req.reportedDaysSupplyLeft !== undefined) daysSupplyLeft = req.reportedDaysSupplyLeft;
  else if (rx?.lastFillAt) {
    daysSupplyLeft = Math.floor((new Date(rx.lastFillAt).getTime() + rx.daysSupply * DAY_MS - now.getTime()) / DAY_MS);
  }
  const priority: Priority = daysSupplyLeft !== null && daysSupplyLeft <= 2 ? 'URGENT' : 'ROUTINE';

  // Routing — data blockers first (staff), then clinical (provider), then insurance.
  const codes = blockers.map((b) => b.code);
  const has = (group: readonly BlockerCode[]) => codes.some((c) => group.includes(c));
  let route: TriageRoute;
  let suggestedAction: TransitionAction;
  let nextAction: string;
  if (has(DATA_BLOCKERS)) {
    route = 'staff';
    suggestedAction = 'REQUEST_INFO';
    nextAction = codes.includes('MISSING_INFO') ? 'Request the missing details' : 'Resolve the conflicting information';
  } else if (has(CLINICAL_BLOCKERS)) {
    route = 'provider';
    suggestedAction = 'ROUTE_TO_PROVIDER';
    nextAction = 'Provider to review and decide';
  } else if (has(INSURANCE_BLOCKERS)) {
    route = 'insurance';
    suggestedAction = codes.includes('INSURANCE_TOO_EARLY') ? 'CLOSE_NOT_NEEDED' : 'ROUTE_TO_INSURANCE';
    nextAction = codes.includes('INSURANCE_TOO_EARLY') ? 'Return to pharmacy with earliest fill date' : 'Work the insurance issue';
  } else {
    fired.add('R10');
    route = 'none';
    suggestedAction = 'CLOSE_NOT_NEEDED';
    nextAction = 'No provider action needed. Return to pharmacy?';
  }

  const ruleIds = (['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'] as RuleId[]).filter(
    (r) => r === 'R1' || fired.has(r),
  );

  return {
    blockers,
    ruleIds,
    prescription: rx,
    missingFields,
    conflicts,
    priority,
    daysSupplyLeft,
    route,
    autoRoute: route === 'provider',
    suggestedAction,
    nextAction,
  };
}
