import fs from 'fs';
import path from 'path';
import { buildSeededEngine } from '../src/services/mock/seed';

const eng = buildSeededEngine(Date.now());
const db = eng.db;

function esc(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escArray(arr: string[]): string {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  return `ARRAY[${arr.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')}]::text[]`;
}

let sql = `-- ==============================================================================
-- MedFlow Database Schema & Complete Seed Migration
-- Generated for Supabase PostgreSQL
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. DROP TABLES IN REVERSE DEPENDENCY ORDER
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS case_tasks CASCADE;
DROP TABLE IF EXISTS case_notes CASCADE;
DROP TABLE IF EXISTS case_events CASCADE;
DROP TABLE IF EXISTS cases CASCADE;
DROP TABLE IF EXISTS pharmacy_links CASCADE;
DROP TABLE IF EXISTS practice_policies CASCADE;
DROP TABLE IF EXISTS observations CASCADE;
DROP TABLE IF EXISTS encounters CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- 3. SCHEMA DEFINITIONS

-- Organizations
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('practice', 'pharmacy')),
  timezone TEXT DEFAULT 'America/Chicago',
  phone TEXT,
  fax TEXT,
  address TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  mfa_enrolled BOOLEAN DEFAULT FALSE NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Patients
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  practice_org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob DATE NOT NULL,
  phone TEXT,
  email TEXT,
  chart_number TEXT NOT NULL,
  sms_opt_out BOOLEAN DEFAULT FALSE NOT NULL,
  preferred_channel TEXT DEFAULT 'sms' CHECK (preferred_channel IN ('sms', 'email')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Prescriptions
CREATE TABLE prescriptions (
  id TEXT PRIMARY KEY,
  practice_org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  prescriber_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  medication_name TEXT NOT NULL,
  strength TEXT NOT NULL,
  form TEXT NOT NULL,
  sig TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  days_supply INTEGER NOT NULL,
  refills_authorized INTEGER NOT NULL,
  refills_remaining INTEGER NOT NULL,
  written_at TIMESTAMPTZ NOT NULL,
  last_fill_at TIMESTAMPTZ,
  drug_class TEXT NOT NULL,
  controlled_schedule TEXT CHECK (controlled_schedule IN ('II', 'III', 'IV', 'V', 'C2', 'C3', 'C4', 'C5')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'discontinued', 'changed')) NOT NULL,
  status_changed_at TIMESTAMPTZ,
  check_in_before_next_refill BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Encounters
CREATE TABLE encounters (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  provider_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('office', 'telehealth')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Observations (Labs/Vitals)
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('A1C', 'BP', 'LIPIDS')),
  observed_at TIMESTAMPTZ NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Practice Policies
CREATE TABLE practice_policies (
  practice_org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  policies JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Pharmacy Links
CREATE TABLE pharmacy_links (
  id TEXT PRIMARY KEY,
  practice_org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  pharmacy_org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'rejected', 'paused')) NOT NULL,
  pharmacy_name TEXT NOT NULL,
  pharmacy_phone TEXT,
  pharmacy_fax TEXT,
  cases_last_30d INTEGER DEFAULT 0 NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refill Cases
CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  practice_org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  pharmacy_org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  prescription_id TEXT REFERENCES prescriptions(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('portal', 'electronic', 'fax', 'phone', 'pharmacy_portal', 'pharmacy_integration', 'patient_request')),
  status TEXT NOT NULL,
  priority TEXT DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'URGENT', 'ROUTINE')) NOT NULL,
  owner_role TEXT,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  status_since TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  requested_payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  blockers JSONB DEFAULT '[]'::jsonb NOT NULL,
  patient_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Case Events (Audit Trail)
CREATE TABLE case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  actor JSONB,
  from_status TEXT,
  to_status TEXT,
  action TEXT,
  reason TEXT,
  rule_ids TEXT[] DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Case Notes
CREATE TABLE case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Case Tasks
CREATE TABLE case_tasks (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE NOT NULL,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT,
  title TEXT NOT NULL,
  assignee_role TEXT,
  assignee_name TEXT,
  status TEXT DEFAULT 'open' NOT NULL,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Audit Logs
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. INDEXES
CREATE INDEX idx_cases_practice ON cases(practice_org_id);
CREATE INDEX idx_cases_pharmacy ON cases(pharmacy_org_id);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_priority ON cases(priority);
CREATE INDEX idx_cases_patient ON cases(patient_id);
CREATE INDEX idx_case_events_case ON case_events(case_id);
CREATE INDEX idx_case_notes_case ON case_notes(case_id);
CREATE INDEX idx_case_tasks_case ON case_tasks(case_id);
CREATE INDEX idx_patients_practice ON patients(practice_org_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for development / service_role
CREATE POLICY "Public full access to organizations" ON organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to patients" ON patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to prescriptions" ON prescriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to encounters" ON encounters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to observations" ON observations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to practice_policies" ON practice_policies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to pharmacy_links" ON pharmacy_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to cases" ON cases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to case_events" ON case_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to case_notes" ON case_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to case_tasks" ON case_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 6. DATA SEEDING (FROM FIXTURES & SEED CASES)
-- ==============================================================================
`;

// Organizations
sql += `\n-- Seeding Organizations\nINSERT INTO organizations (id, name, type, timezone, phone, city) VALUES\n`;
sql += db.orgs.map((o) => `  (${esc(o.id)}, ${esc(o.name)}, ${esc(o.type)}, ${esc(o.timezone)}, ${esc(o.phone)}, ${esc(o.city)})`).join(',\n') + ';\n';

// Users
sql += `\n-- Seeding Users\nINSERT INTO users (id, key, name, email, role, org_id, title, mfa_enrolled, password_hash) VALUES\n`;
sql += db.users.map((u) => `  (${esc(u.id)}, ${esc(u.key)}, ${esc(u.name)}, ${esc(u.email)}, ${esc(u.role)}, ${esc(u.orgId)}, ${esc(u.title)}, ${esc(u.mfaEnrolled)}, ${esc(u.password)})`).join(',\n') + ';\n';

// Patients
sql += `\n-- Seeding Patients\nINSERT INTO patients (id, practice_org_id, first_name, last_name, dob, phone, email, chart_number, sms_opt_out, preferred_channel) VALUES\n`;
sql += db.patients.map((p) => `  (${esc(p.id)}, ${esc(p.practiceOrgId)}, ${esc(p.firstName)}, ${esc(p.lastName)}, ${esc(p.dob)}, ${esc(p.phone)}, ${esc(p.email)}, ${esc(p.chartNumber)}, ${esc(p.smsOptOut)}, ${esc(p.preferredChannel)})`).join(',\n') + ';\n';

// Prescriptions
sql += `\n-- Seeding Prescriptions\nINSERT INTO prescriptions (id, practice_org_id, patient_id, prescriber_id, medication_name, strength, form, sig, quantity, days_supply, refills_authorized, refills_remaining, written_at, last_fill_at, drug_class, controlled_schedule, status, status_changed_at, check_in_before_next_refill) VALUES\n`;
sql += db.prescriptions.map((r) => `  (${esc(r.id)}, ${esc(r.practiceOrgId)}, ${esc(r.patientId)}, ${esc(r.prescriberId)}, ${esc(r.medicationName)}, ${esc(r.strength)}, ${esc(r.form)}, ${esc(r.sig)}, ${esc(r.quantity)}, ${esc(r.daysSupply)}, ${esc(r.refillsAuthorized)}, ${esc(r.refillsRemaining)}, ${esc(r.writtenAt)}, ${esc(r.lastFillAt)}, ${esc(r.drugClass)}, ${esc(r.controlledSchedule)}, ${esc(r.status)}, ${esc(r.statusChangedAt)}, ${esc(r.checkInBeforeNextRefill)})`).join(',\n') + ';\n';

// Encounters
sql += `\n-- Seeding Encounters\nINSERT INTO encounters (id, patient_id, provider_id, occurred_at, type) VALUES\n`;
sql += db.encounters.map((e) => `  (${esc(e.id)}, ${esc(e.patientId)}, ${esc(e.providerId)}, ${esc(e.occurredAt)}, ${esc(e.type)})`).join(',\n') + ';\n';

// Observations
sql += `\n-- Seeding Observations\nINSERT INTO observations (id, patient_id, code, observed_at, value) VALUES\n`;
sql += db.observations.map((o) => `  (${esc(o.id)}, ${esc(o.patientId)}, ${esc(o.code)}, ${esc(o.observedAt)}, ${esc(o.value)})`).join(',\n') + ';\n';

// Policies
sql += `\n-- Seeding Policies\nINSERT INTO practice_policies (practice_org_id, policies) VALUES ('org-lfm', ${esc(db.policies)});\n`;

// Pharmacy Links
sql += `\n-- Seeding Pharmacy Links\nINSERT INTO pharmacy_links (id, practice_org_id, pharmacy_org_id, status, pharmacy_name, pharmacy_phone, pharmacy_fax, cases_last_30d, requested_at, responded_at) VALUES\n`;
sql += db.links.map((l) => `  (${esc(l.id)}, ${esc(l.practiceOrgId)}, ${esc(l.pharmacyOrgId)}, ${esc(l.status)}, ${esc(l.pharmacyName)}, ${esc(l.pharmacyPhone)}, ${esc(l.pharmacyFax)}, ${esc(l.casesLast30d)}, ${esc(l.requestedAt)}, ${esc(l.respondedAt)})`).join(',\n') + ';\n';

// Cases
if (db.cases.length > 0) {
  sql += `\n-- Seeding Cases\nINSERT INTO cases (id, case_number, practice_org_id, pharmacy_org_id, patient_id, prescription_id, source, status, priority, owner_role, owner_user_id, due_at, status_since, version, requested_payload, blockers, patient_token, created_at, updated_at) VALUES\n`;
  sql += db.cases.map((c) => {
    const token = db.statusTokens.find((st) => st.caseId === c.id)?.token ?? null;
    return `  (${esc(c.id)}, ${esc(c.caseNumber)}, ${esc(c.practiceOrgId)}, ${esc(c.pharmacyOrgId)}, ${esc(c.patientId)}, ${esc(c.prescriptionId)}, ${esc(c.source)}, ${esc(c.status)}, ${esc(c.priority)}, ${esc(c.ownerRole)}, ${esc(c.ownerUserId)}, ${esc(c.dueAt)}, ${esc(c.statusSince)}, ${esc(c.version)}, ${esc(c.requestedPayload)}, ${esc(c.blockers)}, ${esc(token)}, ${esc(c.createdAt)}, ${esc(c.updatedAt)})`;
  }).join(',\n') + ';\n';
}

// Case Events
if (db.events.length > 0) {
  sql += `\n-- Seeding Case Events\nINSERT INTO case_events (id, case_id, actor, from_status, to_status, action, reason, rule_ids, created_at) VALUES\n`;
  sql += db.events.map((e) => `  (${esc(e.id)}, ${esc(e.caseId)}, ${esc({ kind: e.actorType, name: e.actorName, role: e.actorRole })}, ${esc(e.fromStatus)}, ${esc(e.toStatus)}, ${esc(e.eventType)}, ${esc(e.reason)}, ${escArray(e.ruleIds)}, ${esc(e.createdAt)})`).join(',\n') + ';\n';
}

// Case Notes
if (db.notes.length > 0) {
  sql += `\n-- Seeding Case Notes\nINSERT INTO case_notes (id, case_id, author_name, body, created_at) VALUES\n`;
  sql += db.notes.map((n) => `  (${esc(n.id)}, ${esc(n.caseId)}, ${esc(n.authorName)}, ${esc(n.body)}, ${esc(n.createdAt)})`).join(',\n') + ';\n';
}

// Case Tasks
if (db.tasks.length > 0) {
  sql += `\n-- Seeding Case Tasks\nINSERT INTO case_tasks (id, case_id, org_id, type, title, assignee_role, assignee_name, status, due_at, created_at) VALUES\n`;
  sql += db.tasks.map((t) => `  (${esc(t.id)}, ${esc(t.caseId)}, ${esc(t.orgId)}, ${esc(t.type)}, ${esc(t.title)}, ${esc(t.assigneeRole)}, ${esc(t.assigneeName)}, ${esc(t.status)}, ${esc(t.dueAt)}, ${esc(t.dueAt || now)})`).join(',\n') + ';\n';
}

// Audit Logs
if (db.audit.length > 0) {
  sql += `\n-- Seeding Audit Logs\nINSERT INTO audit_logs (id, org_id, action, actor_name, entity, entity_id, request_id, created_at) VALUES\n`;
  sql += db.audit.map((a) => `  (${esc(a.id)}, ${esc(a.orgId)}, ${esc(a.action)}, ${esc(a.actorName)}, ${esc(a.entity)}, ${esc(a.entityId)}, ${esc(a.requestId)}, ${esc(a.createdAt)})`).join(',\n') + ';\n';
}

fs.mkdirSync(path.resolve('supabase'), { recursive: true });
fs.writeFileSync(path.resolve('supabase/schema.sql'), sql, 'utf8');

console.log('Successfully generated supabase/schema.sql!');
console.log(`Summary:
- ${db.orgs.length} Organizations
- ${db.users.length} Users
- ${db.patients.length} Patients
- ${db.prescriptions.length} Prescriptions
- ${db.encounters.length} Encounters
- ${db.observations.length} Observations
- ${db.links.length} Pharmacy Links
- ${db.cases.length} Cases
- ${db.events.length} Case Events
- ${db.notes.length} Case Notes
- ${db.tasks.length} Case Tasks
- ${db.audit.length} Audit Logs
`);
