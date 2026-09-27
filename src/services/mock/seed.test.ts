import { describe, expect, it } from 'vitest';
import { BLOCKER_CODES } from '@shared/types.ts';
import { buildSeededEngine } from './seed';

// Fixed "now": a Wednesday 11:00 America/Chicago so business-hours SLAs are deterministic.
const NOW = new Date('2026-09-16T16:00:00Z').getTime();

describe('seeded demo data', () => {
  const eng = buildSeededEngine(NOW);
  const statusOf = (key: string) => eng.db.cases.find((c) => c.id === eng.seedKeys[key])?.status;

  it('creates 30 cases', () => {
    expect(eng.db.cases).toHaveLength(30);
  });

  it.each([
    ['c1', 'WAITING_ON_PROVIDER'],
    ['c2', 'WAITING_ON_PROVIDER'],
    ['c3', 'WAITING_ON_PROVIDER'],
    ['c4', 'WAITING_ON_PROVIDER'],
    ['c5', 'WAITING_ON_PROVIDER'],
    ['c6', 'NEEDS_PATIENT_MATCH'],
    ['c7', 'NEEDS_PATIENT_MATCH'],
    ['c8', 'TRIAGE'],
    ['c9', 'TRIAGE'],
    ['c10', 'WAITING_ON_INFO'],
    ['c11', 'TRIAGE'],
    ['c12', 'WAITING_ON_PATIENT_VISIT'],
    ['c13', 'WAITING_ON_INSURANCE'],
    ['c14', 'APPROVED'],
    ['c15', 'DENIED'],
    ['c16', 'SENT_TO_PHARMACY'],
    ['c17', 'SENT_TO_PHARMACY'],
    ['c18', 'PHARMACY_CONFIRMED'],
    ['c19', 'FILLING'],
    ['c20', 'READY_FOR_PICKUP'],
    ['c21', 'CLOSED'],
    ['c22', 'CLOSED'],
    ['c23', 'CLOSED'],
    ['c24', 'CLOSED'],
    ['c25', 'CLOSED'],
    ['c26', 'CLOSED'],
    ['c27', 'CANCELLED'],
    ['c28', 'WAITING_ON_PROVIDER'],
    ['c29', 'WAITING_ON_PROVIDER'],
    ['c30', 'TRIAGE'],
  ])('%s ends in %s', (key, status) => {
    expect(statusOf(key)).toBe(status);
  });

  it('covers every blocker code at least once (current or historical)', () => {
    const seen = new Set<string>();
    for (const c of eng.db.cases) for (const b of c.blockers) seen.add(b.code);
    for (const e of eng.db.events) for (const code of BLOCKER_CODES) if (e.reason?.includes(code) || e.title.includes(code)) seen.add(code);
    // triage events carry rule details; also check the rule-raised blockers recorded on cases
    const missing = BLOCKER_CODES.filter((c) => !seen.has(c));
    expect(missing).toEqual([]);
  });

  it('has the dead-letter dispatch, duplicate and injection cases', () => {
    expect(eng.db.outbox.some((m) => m.status === 'dead' && m.channel === 'pharmacy')).toBe(true);
    expect(eng.db.cases.some((c) => c.resolution === 'duplicate' && c.linkedCaseId)).toBe(true);
    expect(eng.db.cases.some((c) => c.injectionSuspected)).toBe(true);
  });

  it('has at least 3 urgent and 2 SLA-breached open cases', () => {
    const open = eng.db.cases.filter((c) => !['CLOSED', 'CANCELLED'].includes(c.status));
    expect(open.filter((c) => c.priority === 'URGENT').length).toBeGreaterThanOrEqual(3);
    expect(open.filter((c) => c.dueAt && new Date(c.dueAt).getTime() < NOW).length).toBeGreaterThanOrEqual(2);
  });

  it('every case has a real timeline (2+ events)', () => {
    for (const c of eng.db.cases) {
      expect(eng.db.events.filter((e) => e.caseId === c.id).length).toBeGreaterThanOrEqual(2);
    }
  });
});
