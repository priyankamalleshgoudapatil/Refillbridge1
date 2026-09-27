import { describe, expect, it } from 'vitest';
import type { EncounterRecord, ObservationRecord, PatientRecord, PrescriptionRecord } from '../records.ts';
import type { RequestedPayload } from '../types.ts';
import { DEFAULT_POLICIES } from './sla.ts';
import { matchPatient, runTriage, type TriageInput } from './triage-rules.ts';

const NOW = new Date('2026-09-15T15:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const patient: PatientRecord = {
  id: 'p1',
  practiceOrgId: 'org',
  firstName: 'Maria',
  lastName: 'Lopez',
  dob: '1961-04-12',
  phone: '312-555-0101',
  email: 'maria@example.com',
  chartNumber: 'LFM-1001',
  smsOptOut: false,
  preferredChannel: 'sms',
};

const baseRx: PrescriptionRecord = {
  id: 'rx1',
  practiceOrgId: 'org',
  patientId: 'p1',
  prescriberId: 'u-prov',
  medicationName: 'Lisinopril',
  strength: '10 mg',
  form: 'tablet',
  sig: 'Take 1 tablet daily',
  quantity: 30,
  daysSupply: 30,
  refillsAuthorized: 5,
  refillsRemaining: 2,
  writtenAt: daysAgo(90),
  lastFillAt: daysAgo(29),
  drugClass: 'other',
  controlledSchedule: null,
  status: 'active',
};

const baseReq: RequestedPayload = {
  patientFirstName: 'Maria',
  patientLastName: 'Lopez',
  patientDob: '1961-04-12',
  patientPhone: '(312) 555-0101',
  medicationName: 'Lisinopril',
  strength: '10 mg',
  quantity: 30,
  pharmacyName: 'CityCare Pharmacy',
};

const recentVisit: EncounterRecord = { id: 'e1', patientId: 'p1', providerId: 'u', occurredAt: daysAgo(30), type: 'office' };

function input(over: Partial<TriageInput> = {}, rx: Partial<PrescriptionRecord> = {}, req: Partial<RequestedPayload> = {}): TriageInput {
  return {
    now: NOW,
    request: { ...baseReq, ...req },
    patient,
    prescriptions: [{ ...baseRx, ...rx }],
    encounters: [recentVisit],
    observations: [],
    policies: DEFAULT_POLICIES,
    ...over,
  };
}
const codes = (i: TriageInput) => runTriage(i).blockers.map((b) => b.code);

describe('R1 patient match', () => {
  it('exact match needs name + DOB + phone', () => {
    expect(matchPatient(baseReq, [patient]).kind).toBe('exact');
  });
  it('exact match works with chart number instead of phone', () => {
    expect(matchPatient({ ...baseReq, patientPhone: undefined, chartNumber: 'lfm-1001' }, [patient]).kind).toBe('exact');
  });
  it('name + DOB alone is uncertain', () => {
    const r = matchPatient({ ...baseReq, patientPhone: undefined }, [patient]);
    expect(r.kind).toBe('uncertain');
    if (r.kind === 'uncertain') expect(r.candidates).toHaveLength(1);
  });
  it('wrong DOB is uncertain', () => {
    expect(matchPatient({ ...baseReq, patientDob: '1961-04-13' }, [patient]).kind).toBe('uncertain');
  });
  it('two identical patients are never auto-merged', () => {
    expect(matchPatient(baseReq, [patient, { ...patient, id: 'p2' }]).kind).toBe('uncertain');
  });
});

describe('R2 prescription found', () => {
  it('no prescription on file → NEW_RX_REQUIRED', () => {
    expect(codes(input({ prescriptions: [] }))).toContain('NEW_RX_REQUIRED');
  });
  it('several candidates with no strength match → CONFLICTING_INFO', () => {
    const i = input({ prescriptions: [{ ...baseRx, strength: '5 mg' }, { ...baseRx, id: 'rx2', strength: '20 mg' }] });
    expect(codes(i)).toContain('CONFLICTING_INFO');
  });
  it('one prescription → no R2 blocker', () => {
    expect(codes(input())).not.toContain('NEW_RX_REQUIRED');
  });
});

describe('R3 required fields', () => {
  it('missing strength and quantity → MISSING_INFO listing the fields', () => {
    const r = runTriage(input({}, {}, { strength: '', quantity: null }));
    expect(r.blockers.map((b) => b.code)).toContain('MISSING_INFO');
    expect(r.missingFields).toEqual(['strength', 'quantity']);
    expect(r.route).toBe('staff');
  });
  it('complete request → no MISSING_INFO', () => {
    expect(codes(input())).not.toContain('MISSING_INFO');
  });
});

describe('R4 prescription active', () => {
  it('discontinued → MED_DISCONTINUED', () => {
    expect(codes(input({}, { status: 'discontinued' }))).toContain('MED_DISCONTINUED');
  });
  it('active → none', () => {
    expect(codes(input())).not.toContain('MED_DISCONTINUED');
  });
});

describe('R5 controlled substances', () => {
  it('Schedule II always needs a new prescription', () => {
    const c = codes(input({}, { controlledSchedule: 'II', drugClass: 'adhd' }));
    expect(c).toEqual(expect.arrayContaining(['CONTROLLED_SUBSTANCE', 'NEW_RX_REQUIRED']));
  });
  it('Schedule IV within 6 months and < 5 refills used → controlled but no new Rx', () => {
    const c = codes(input({}, { controlledSchedule: 'IV', writtenAt: daysAgo(60), refillsAuthorized: 5, refillsRemaining: 3 }));
    expect(c).toContain('CONTROLLED_SUBSTANCE');
    expect(c).not.toContain('NEW_RX_REQUIRED');
  });
  it('Schedule IV older than 6 months → NEW_RX_REQUIRED', () => {
    expect(codes(input({}, { controlledSchedule: 'IV', writtenAt: daysAgo(200) }))).toContain('NEW_RX_REQUIRED');
  });
  it('Schedule III with 5 refills used → NEW_RX_REQUIRED', () => {
    expect(codes(input({}, { controlledSchedule: 'III', refillsAuthorized: 6, refillsRemaining: 1 }))).toContain('NEW_RX_REQUIRED');
  });
  it('non-controlled → no CONTROLLED_SUBSTANCE', () => {
    expect(codes(input())).not.toContain('CONTROLLED_SUBSTANCE');
  });
});

describe('R6 refills and validity', () => {
  it('zero refills → NO_REFILLS_REMAINING and auto-routes to provider', () => {
    const r = runTriage(input({}, { refillsRemaining: 0 }));
    expect(r.blockers.map((b) => b.code)).toContain('NO_REFILLS_REMAINING');
    expect(r.route).toBe('provider');
    expect(r.autoRoute).toBe(true);
  });
  it('older than validity window → NO_REFILLS_REMAINING', () => {
    expect(codes(input({}, { writtenAt: daysAgo(400) }))).toContain('NO_REFILLS_REMAINING');
  });
  it('refills left and valid → none', () => {
    expect(codes(input())).not.toContain('NO_REFILLS_REMAINING');
  });
});

describe('R7 visit / monitoring rules', () => {
  it('diabetes with A1c older than 6 months → CLINICAL_REVIEW', () => {
    const obs: ObservationRecord[] = [{ id: 'o', patientId: 'p1', code: 'A1C', observedAt: daysAgo(250), value: '7.1' }];
    expect(codes(input({ observations: obs }, { drugClass: 'diabetes' }))).toContain('CLINICAL_REVIEW');
  });
  it('diabetes with recent A1c → no CLINICAL_REVIEW', () => {
    const obs: ObservationRecord[] = [{ id: 'o', patientId: 'p1', code: 'A1C', observedAt: daysAgo(40), value: '6.8' }];
    expect(codes(input({ observations: obs }, { drugClass: 'diabetes' }))).not.toContain('CLINICAL_REVIEW');
  });
  it('blood pressure with last visit > 12 months → VISIT_REQUIRED', () => {
    const enc = [{ ...recentVisit, occurredAt: daysAgo(400) }];
    expect(codes(input({ encounters: enc }, { drugClass: 'blood_pressure' }))).toContain('VISIT_REQUIRED');
  });
  it('antidepressant with visit 30 days ago → no VISIT_REQUIRED', () => {
    expect(codes(input({}, { drugClass: 'antidepressant' }))).not.toContain('VISIT_REQUIRED');
  });
  it('ADHD with visit 4 months ago → VISIT_REQUIRED', () => {
    const enc = [{ ...recentVisit, occurredAt: daysAgo(125) }];
    expect(codes(input({ encounters: enc }, { drugClass: 'adhd' }))).toContain('VISIT_REQUIRED');
  });
  it('provider check-in flag → VISIT_REQUIRED', () => {
    expect(codes(input({}, { checkInBeforeNextRefill: true }))).toContain('VISIT_REQUIRED');
  });
});

describe('R8 conflicts', () => {
  it('pharmacy says 2 refills, chart says 0 → CONFLICTING_INFO with both values', () => {
    const r = runTriage(input({}, { refillsRemaining: 0 }, { reportedRefillsRemaining: 2 }));
    expect(r.blockers.map((b) => b.code)).toContain('CONFLICTING_INFO');
    expect(r.conflicts).toEqual([{ field: 'Refills remaining', reported: '2', chart: '0' }]);
  });
  it('matching data → no conflict', () => {
    expect(runTriage(input({}, {}, { reportedRefillsRemaining: 2 })).conflicts).toEqual([]);
  });
});

describe('R9 insurance', () => {
  it('pharmacy PA flag → INSURANCE_PA_REQUIRED', () => {
    expect(codes(input({}, {}, { insuranceFlag: 'PA_REQUIRED' }))).toContain('INSURANCE_PA_REQUIRED');
  });
  it('too early: filled 10 days ago on a 30-day supply (80% threshold) → INSURANCE_TOO_EARLY', () => {
    expect(codes(input({}, { lastFillAt: daysAgo(10) }))).toContain('INSURANCE_TOO_EARLY');
  });
  it('not too early: filled 25 days ago (≥ 24 days) → none', () => {
    expect(codes(input({}, { lastFillAt: daysAgo(25) }))).not.toContain('INSURANCE_TOO_EARLY');
  });
});

describe('R10 nothing blocks + priority', () => {
  it('refills remain and no blockers → suggest CLOSE_NOT_NEEDED, never auto', () => {
    const r = runTriage(input());
    expect(r.blockers).toEqual([]);
    expect(r.suggestedAction).toBe('CLOSE_NOT_NEEDED');
    expect(r.autoRoute).toBe(false);
    expect(r.ruleIds).toContain('R10');
  });
  it('≤ 2 days of supply left → URGENT', () => {
    expect(runTriage(input({}, { lastFillAt: daysAgo(29) })).priority).toBe('URGENT');
    expect(runTriage(input({}, { lastFillAt: daysAgo(25) })).priority).toBe('ROUTINE');
    expect(runTriage(input({}, {}, { reportedDaysSupplyLeft: 1 })).priority).toBe('URGENT');
  });
});
