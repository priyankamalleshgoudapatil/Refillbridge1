// Shared domain types — imported by the front end (via @shared) and edge functions (Deno).

export const ROLES = [
  'practice_admin',
  'provider',
  'practice_staff',
  'pharmacy_admin',
  'pharmacy_staff',
] as const;
export type Role = (typeof ROLES)[number];

export const PRACTICE_ROLES: readonly Role[] = ['practice_admin', 'provider', 'practice_staff'];
export const PHARMACY_ROLES: readonly Role[] = ['pharmacy_admin', 'pharmacy_staff'];
export const MFA_REQUIRED_ROLES: readonly Role[] = ['provider', 'practice_admin', 'pharmacy_admin'];

export type OrgType = 'practice' | 'pharmacy';
export type Aal = 'aal1' | 'aal2';

export const CASE_STATUSES = [
  'RECEIVED',
  'NEEDS_PATIENT_MATCH',
  'TRIAGE',
  'WAITING_ON_INFO',
  'WAITING_ON_PROVIDER',
  'WAITING_ON_PATIENT_VISIT',
  'WAITING_ON_INSURANCE',
  'APPROVED',
  'DENIED',
  'SENT_TO_PHARMACY',
  'PHARMACY_CONFIRMED',
  'FILLING',
  'READY_FOR_PICKUP',
  'DISPENSED',
  'CLOSED',
  'CANCELLED',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const TERMINAL_STATUSES: readonly CaseStatus[] = ['CLOSED', 'CANCELLED'];

export const BLOCKER_CODES = [
  'NO_REFILLS_REMAINING',
  'NEW_RX_REQUIRED',
  'VISIT_REQUIRED',
  'MISSING_INFO',
  'CONFLICTING_INFO',
  'CLINICAL_REVIEW',
  'MED_DISCONTINUED',
  'CONTROLLED_SUBSTANCE',
  'INSURANCE_PA_REQUIRED',
  'INSURANCE_NOT_COVERED',
  'INSURANCE_TOO_EARLY',
  'INSURANCE_CHANGED',
  'PATIENT_MATCH_UNCERTAIN',
  'DISPATCH_FAILED',
] as const;
export type BlockerCode = (typeof BLOCKER_CODES)[number];

export const CLINICAL_BLOCKERS: readonly BlockerCode[] = [
  'NO_REFILLS_REMAINING',
  'NEW_RX_REQUIRED',
  'VISIT_REQUIRED',
  'CLINICAL_REVIEW',
  'MED_DISCONTINUED',
  'CONTROLLED_SUBSTANCE',
];
export const DATA_BLOCKERS: readonly BlockerCode[] = [
  'MISSING_INFO',
  'CONFLICTING_INFO',
  'PATIENT_MATCH_UNCERTAIN',
  'DISPATCH_FAILED',
];
export const INSURANCE_BLOCKERS: readonly BlockerCode[] = [
  'INSURANCE_PA_REQUIRED',
  'INSURANCE_NOT_COVERED',
  'INSURANCE_TOO_EARLY',
  'INSURANCE_CHANGED',
];

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10';

export interface CaseBlocker {
  code: BlockerCode;
  /** Rule ID (R1–R10), 'AI', 'provider', 'staff' or 'outbox' — the "why". */
  source: RuleId | 'AI' | 'provider' | 'staff' | 'outbox' | 'pharmacy';
  detail: string;
}

export type Priority = 'URGENT' | 'ROUTINE';
export type Resolution = 'completed' | 'denied' | 'returned_to_pharmacy' | 'duplicate' | 'withdrawn';
export type CancelReason = 'not_our_patient' | 'transferred_care' | 'deceased' | 'other';
export type CaseSource = 'portal' | 'electronic' | 'fax' | 'phone';
export type DrugClass =
  | 'blood_pressure'
  | 'diabetes'
  | 'antidepressant'
  | 'adhd'
  | 'controlled_other'
  | 'other';
export type ControlledSchedule = 'II' | 'III' | 'IV' | 'V';
export type ActorType = 'user' | 'system' | 'ai' | 'pharmacy_system';
export type InsuranceFlag = 'PA_REQUIRED' | 'NOT_COVERED' | 'INSURANCE_CHANGED';
export type SlaState = 'on_track' | 'at_risk' | 'breached' | 'none';

export type DecisionType =
  | 'APPROVE'
  | 'APPROVE_MODIFIED'
  | 'APPROVE_BRIDGE_REQUIRE_VISIT'
  | 'REQUIRE_VISIT'
  | 'DENY';

export const DENY_REASON_CODES = [
  'needs_alternative_therapy',
  'no_longer_indicated',
  'safety_concern',
  'not_our_patient',
  'other',
] as const;
export type DenyReasonCode = (typeof DENY_REASON_CODES)[number];

export type TransitionAction =
  | 'AUTO_MATCH'
  | 'MATCH_UNCERTAIN'
  | 'CONFIRM_PATIENT_MATCH'
  | 'REJECT_PATIENT_MATCH'
  | 'REQUEST_INFO'
  | 'INFO_RECEIVED'
  | 'ROUTE_TO_PROVIDER'
  | 'ROUTE_TO_INSURANCE'
  | 'INSURANCE_RESOLVED'
  | 'INSURANCE_NEEDS_ALTERNATIVE'
  | 'CLOSE_NOT_NEEDED'
  | 'MARK_DUPLICATE'
  | 'DECIDE'
  | 'VISIT_COMPLETED'
  | 'VISIT_NO_SHOW'
  | 'DISPATCH_SUCCEEDED'
  | 'PHARMACY_ACKNOWLEDGED'
  | 'START_FILLING'
  | 'MARK_READY'
  | 'MARK_DISPENSED'
  | 'COMPLETE'
  | 'FINALIZE_DENIAL'
  | 'WITHDRAW'
  | 'CANCEL'
  | 'CANCEL_AFTER_SEND';

export type Actor = { kind: 'system' } | { kind: 'user'; role: Role; aal: Aal };

/** What the pharmacy reported (or what was extracted from a fax). Validated by Zod. */
export interface RequestedPayload {
  patientFirstName: string;
  patientLastName: string;
  patientDob: string; // YYYY-MM-DD
  patientPhone?: string;
  chartNumber?: string;
  medicationName: string;
  strength: string;
  quantity: number | null;
  sig?: string;
  pharmacyName: string;
  prescriberName?: string;
  reportedRefillsRemaining?: number;
  reportedDaysSupplyLeft?: number;
  insuranceFlag?: InsuranceFlag;
  notes?: string;
}

export interface BusinessHours {
  days: number[]; // 0=Sun … 6=Sat
  startHour: number;
  endHour: number;
  holidays: string[]; // YYYY-MM-DD in the org timezone
}

export interface SlaWindow {
  minutes: number;
  business: boolean;
}

export interface VisitRules {
  bloodPressureVisitMonths: number;
  diabetesA1cMonths: number;
  diabetesVisitMonths: number;
  antidepressantVisitMonths: number;
  adhdVisitMonths: number;
  controlledOtherVisitMonths: number;
}

export interface PracticePolicies {
  sla: Partial<Record<CaseStatus, { routine: SlaWindow; urgent: SlaWindow }>>;
  visitRules: VisitRules;
  maxBridgeDays: number;
  rxValidityMonths: number;
  tooEarlyThreshold: number; // 0–1
}
