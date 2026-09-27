// Record shapes shared by the rules engine, the mock layer and (later) the database mappers.
import type { ControlledSchedule, DrugClass } from './types.ts';

export interface PatientRecord {
  id: string;
  practiceOrgId: string;
  firstName: string;
  lastName: string;
  dob: string; // YYYY-MM-DD
  phone: string | null;
  email: string | null;
  chartNumber: string;
  smsOptOut: boolean;
  preferredChannel: 'sms' | 'email';
}

export interface PrescriptionRecord {
  id: string;
  practiceOrgId: string;
  patientId: string;
  prescriberId: string;
  medicationName: string;
  strength: string;
  form: string;
  sig: string;
  quantity: number;
  daysSupply: number;
  refillsAuthorized: number;
  refillsRemaining: number;
  writtenAt: string; // ISO
  lastFillAt: string | null; // ISO
  drugClass: DrugClass;
  controlledSchedule: ControlledSchedule | null;
  status: 'active' | 'discontinued' | 'changed';
  statusChangedAt?: string | null;
  checkInBeforeNextRefill?: boolean;
}

export interface EncounterRecord {
  id: string;
  patientId: string;
  providerId: string;
  occurredAt: string;
  type: 'office' | 'telehealth';
}

export interface ObservationRecord {
  id: string;
  patientId: string;
  code: 'A1C' | 'BP' | 'LIPIDS';
  observedAt: string;
  value: string | null;
}
