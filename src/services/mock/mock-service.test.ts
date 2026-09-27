import { beforeEach, describe, expect, it } from 'vitest';
import { orderConfirmationHash } from '@shared/domain/confirmation.ts';
import type { PracticeCaseDetail } from '@shared/dto.ts';
import { SAMPLE_FAX } from '@/mocks/data/fixtures';
import { ApiError } from '../errors';
import { sessionStore } from '../session';
import { setEngine } from './backend';
import { mockAuthService as auth } from './mock-auth';
import { mockRefillService as svc } from './mock-service';
import { buildSeededEngine } from './seed';
import type { MockEngine } from './engine';

let eng: MockEngine;
const as = (key: string, aal: 'aal1' | 'aal2' = 'aal2') => auth.devSwitchUser(key, aal);
const caseId = (key: string) => eng.seedKeys[key];
const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(ApiError);
  await p.catch((e: ApiError) => expect(e.code).toBe(code));
};

async function approve(id: string, decision = 'APPROVE') {
  const d = (await svc.getCase(id)) as PracticeCaseDetail;
  const rx = d.prescription!;
  const order = { decision, medicationName: rx.medicationName, strength: rx.strength, quantity: rx.quantity, daysSupply: rx.daysSupply, refills: 3 };
  const confirmationHash = orderConfirmationHash({ caseId: id, patientId: d.patient!.id, pharmacyId: d.case.pharmacyOrgId, ...order, bridgeDays: null });
  return svc.transitionCase(id, { action: 'DECIDE', version: d.case.version, payload: { ...order, confirmationHash } }, `k-${Math.random()}`);
}

beforeEach(() => {
  const fixedNow = new Date('2026-09-16T16:00:00Z').getTime();
  eng = buildSeededEngine(fixedNow);
  eng.clockOffsetMin = (fixedNow - Date.now()) / 60_000; // engine clock = seed clock
  eng.sim.quietHours = false;
  setEngine(eng);
  sessionStore.clear();
});

describe('authentication & sessions', () => {
  it('rejects calls without a session (401)', async () => {
    await expectCode(svc.listCases({}), 'UNAUTHENTICATED');
  });
  it('generic message for wrong password', async () => {
    await expect(auth.signIn('admin@lakeside.example.com', 'nope')).rejects.toThrow('Invalid email or password.');
  });
  it('provider sign-in requires MFA, then aal2', async () => {
    const r = await auth.signIn('dr.rao@lakeside.example.com', 'Refill!2026');
    expect(r.status).toBe('mfa_required');
    await expect(auth.verifyMfa('000000')).rejects.toThrow("That code didn't work");
    await auth.verifyMfa('123456');
    expect(auth.currentUser()?.aal).toBe('aal2');
  });
  it('staff sign in without MFA', async () => {
    expect((await auth.signIn('staff@lakeside.example.com', 'Refill!2026')).status).toBe('signed_in');
  });
  it('sign-up honeypot returns the neutral message but creates nothing', async () => {
    const before = eng.db.users.length;
    const r = await auth.signUp({ orgName: 'Bot Clinic', orgType: 'practice', fullName: 'Bot', email: 'bot@example.com', password: 'Zz!12345', website: 'spam' });
    expect(r.message).toMatch(/If this email can be used/);
    expect(eng.db.users.length).toBe(before);
  });
});

describe('tenant isolation & minimum necessary', () => {
  it('GreenLeaf pharmacy gets 404 for a CityCare case', async () => {
    as('grace');
    await expectCode(svc.getCase(caseId('c1')), 'NOT_FOUND');
  });
  it('pharmacy view hides clinical data, notes and AI output', async () => {
    as('omar');
    const d = await svc.getCase(caseId('c1'));
    expect(d.view).toBe('pharmacy');
    const json = JSON.stringify(d);
    expect(json).not.toContain('Patient called asking'); // internal note
    expect(json).not.toContain('James'); // full name
    expect(json).not.toContain('blockerDetails');
    const events = await svc.getCaseEvents(caseId('c1'), {});
    expect(events.data.every((e) => e.public && e.ruleIds.length === 0 && e.reason === null)).toBe(true);
  });
  it('pharmacy cannot call practice-only endpoints', async () => {
    as('omar');
    await expectCode(svc.addCaseNote(caseId('c1'), 'hi'), 'FORBIDDEN');
    await expectCode(svc.getCaseSummary(caseId('c1')), 'FORBIDDEN');
  });
  it('lists only own-org cases', async () => {
    as('grace');
    const res = await svc.listCases({ status: 'ALL', limit: 100 });
    expect(res.data.every((c) => c.pharmacyName === 'GreenLeaf Pharmacy')).toBe(true);
  });
  it('caps page size at 100', async () => {
    as('admin');
    const res = await svc.listCases({ status: 'ALL', limit: 500 });
    expect(res.meta.limit).toBe(100);
  });
});

describe('clinical decision guardrails', () => {
  it('provider at aal1 gets MFA_REQUIRED', async () => {
    as('rao', 'aal1');
    await expectCode(approve(caseId('c1')), 'MFA_REQUIRED');
  });
  it('staff get FORBIDDEN', async () => {
    as('jordan');
    const d = (await svc.getCase(caseId('c1'))) as PracticeCaseDetail;
    await expectCode(svc.transitionCase(caseId('c1'), { action: 'DECIDE', version: d.case.version, payload: {} }, 'k1'), 'FORBIDDEN');
  });
  it('a tampered order (hash mismatch) is rejected', async () => {
    as('rao');
    const d = (await svc.getCase(caseId('c1'))) as PracticeCaseDetail;
    const payload = { decision: 'APPROVE', medicationName: 'Lisinopril', strength: '40 mg', quantity: 30, daysSupply: 30, refills: 3, confirmationHash: 'deadbeef' };
    await expectCode(svc.transitionCase(caseId('c1'), { action: 'DECIDE', version: d.case.version, payload }, 'k2'), 'VALIDATION_ERROR');
  });
  it('deny requires a reason and a patient next step', async () => {
    as('rao');
    const d = (await svc.getCase(caseId('c1'))) as PracticeCaseDetail;
    await expectCode(svc.transitionCase(caseId('c1'), { action: 'DECIDE', version: d.case.version, payload: { decision: 'DENY', medicationName: 'x', strength: 'y', quantity: 1, daysSupply: 1, refills: 0 } }, 'k3'), 'VALIDATION_ERROR');
  });
  it('stale version → CONFLICT; two simultaneous decisions → exactly one', async () => {
    as('rao');
    await approve(caseId('c2'));
    await expectCode(approve(caseId('c2')), 'INVALID_TRANSITION');
    expect(eng.db.decisions.filter((d) => d.caseId === caseId('c2'))).toHaveLength(1);
    as('jordan');
    await expectCode(svc.transitionCase(caseId('c8'), { action: 'CLOSE_NOT_NEEDED', version: 1, payload: {} }, 'k4'), 'CONFLICT');
  });
});

describe('idempotency', () => {
  it('same key replays; same key + different body → IDEMPOTENCY_KEY_REUSED', async () => {
    as('jordan');
    const d = (await svc.getCase(caseId('c8'))) as PracticeCaseDetail;
    const a = await svc.transitionCase(caseId('c8'), { action: 'CLOSE_NOT_NEEDED', version: d.case.version }, 'same');
    const b = await svc.transitionCase(caseId('c8'), { action: 'CLOSE_NOT_NEEDED', version: d.case.version }, 'same');
    expect(b).toEqual(a);
    await expectCode(svc.transitionCase(caseId('c8'), { action: 'CANCEL', version: d.case.version, payload: { reason: 'x y z' } }, 'same'), 'IDEMPOTENCY_KEY_REUSED');
  });
});

describe('North Star: stuck → solved', () => {
  it('fax → extraction → auto-triage → provider approves → dispatched → pharmacy confirms → dispensed', async () => {
    as('omar');
    const ext = await svc.extractIntake({ text: SAMPLE_FAX });
    expect(ext.fields.patientFirstName?.value).toBe('Maria');
    expect(ext.fields.patientDob?.value).toBe('1961-04-12');
    expect(ext.fields.strength?.value).toBe('1000 mg');
    expect(Object.values(ext.fields).every((f) => f?.sourceSpan)).toBe(true);
    const f = ext.fields;
    const created = await svc.createCase(
      {
        source: 'fax',
        practiceOrgId: 'org-lfm',
        aiSuggestionId: ext.suggestionId,
        payload: { patientFirstName: f.patientFirstName!.value, patientLastName: f.patientLastName!.value, patientDob: f.patientDob!.value, patientPhone: f.patientPhone!.value, medicationName: f.medicationName!.value, strength: f.strength!.value, quantity: Number(f.quantity!.value), pharmacyName: 'CityCare Pharmacy' },
      },
      'create-1',
    );
    const id = created.case.id;

    as('rao');
    let d = (await svc.getCase(id)) as PracticeCaseDetail;
    expect(d.case.status).toBe('WAITING_ON_PROVIDER');
    expect(d.case.blockers).toEqual(expect.arrayContaining(['NO_REFILLS_REMAINING', 'CLINICAL_REVIEW']));
    expect(d.case.blockerDetails.map((b) => b.source)).toEqual(expect.arrayContaining(['R6', 'R7']));
    expect(d.case.priority).toBe('URGENT');

    const summary = await svc.getCaseSummary(id);
    expect(summary.bullets.length).toBeLessThanOrEqual(3);
    expect(summary.bullets.every((b) => b.sourceRefs.length > 0)).toBe(true);

    await approve(id, 'APPROVE');
    d = (await svc.getCase(id)) as PracticeCaseDetail;
    expect(d.case.status).toBe('APPROVED');
    eng.tick(); // outbox worker
    d = (await svc.getCase(id)) as PracticeCaseDetail;
    expect(d.case.status).toBe('SENT_TO_PHARMACY');
    expect(d.notifications.some((n) => n.template === 'approved_sent' && !/metformin/i.test(n.text))).toBe(true);

    as('omar');
    const ph = await svc.getCase(id);
    for (const action of ['PHARMACY_ACKNOWLEDGED', 'START_FILLING', 'MARK_READY', 'MARK_DISPENSED'] as const) {
      const cur = await svc.getCase(id);
      await svc.transitionCase(id, { action, version: cur.case.version }, `ph-${action}`);
    }
    expect(ph.view).toBe('pharmacy');
    const final = await svc.getCase(id);
    expect(final.case.status).toBe('CLOSED');
    expect(final.case.resolution).toBe('completed');
  });

  it('pharmacy down → retries with backoff → dead letter → DISPATCH_FAILED + call task', async () => {
    as('admin');
    await svc.simulate({ type: 'pharmacy_down', minutes: 600 });
    as('rao');
    await approve(caseId('c1'));
    as('admin');
    await svc.simulate({ type: 'skip_time', minutes: 200 });
    const d = (await svc.getCase(caseId('c1'))) as PracticeCaseDetail;
    expect(d.case.status).toBe('APPROVED');
    expect(d.case.blockers).toContain('DISPATCH_FAILED');
    expect(d.outbox.find((o) => o.channel === 'pharmacy')?.status).toBe('dead');
    expect(d.outbox.find((o) => o.channel === 'pharmacy')?.attempts).toBe(5);
    expect(d.tasks.some((t) => t.type === 'call_pharmacy' && t.status === 'open')).toBe(true);
    const diag = await svc.getCaseDiagnosis(caseId('c1'));
    expect(diag.lastAttempt).toMatch(/failed 5×/);
    // pharmacy recovers; staff retry
    await svc.simulate({ type: 'pharmacy_up' });
    await svc.retryDispatch(caseId('c1'));
    expect((await svc.getCase(caseId('c1'))).case.status).toBe('SENT_TO_PHARMACY');
  });

  it('missing info → pharmacy answers → back to triage', async () => {
    as('grace');
    const d = await svc.getCase(caseId('c10'));
    const ir = d.infoRequests[0];
    await svc.answerInfoRequest(ir.id, { q1: '75 mcg', q2: '30' });
    as('jordan');
    const after = (await svc.getCase(caseId('c10'))) as PracticeCaseDetail;
    expect(after.case.status).not.toBe('WAITING_ON_INFO');
    expect(after.case.blockers).not.toContain('MISSING_INFO');
  });

  it('patient match: staff confirm a candidate → triage runs', async () => {
    as('jordan');
    const d = (await svc.getCase(caseId('c6'))) as PracticeCaseDetail;
    expect(d.matchCandidates.length).toBeGreaterThan(0);
    const after = await svc.confirmPatientMatch(caseId('c6'), d.matchCandidates[0].id, d.case.version);
    expect(after.case.status).not.toBe('NEEDS_PATIENT_MATCH');
  });

  it('AI never suggests on controlled substances', async () => {
    as('jordan');
    const s = await svc.suggestNextAction(caseId('c4'));
    expect(s.action).toBeNull();
    expect(s.reason).toMatch(/controlled/i);
  });
});

describe('patient status page', () => {
  it('wrong DOB counts attempts and locks after 5', async () => {
    as('admin');
    const link = (await svc.getDemoStatusLink(caseId('c16')))!;
    const token = link.split('/').pop()!;
    sessionStore.clear();
    for (let i = 0; i < 4; i++) await expect(svc.verifyPatientStatus(token, '2000-01-01')).rejects.toThrow(/attempt/);
    await expect(svc.verifyPatientStatus(token, '2000-01-01')).rejects.toThrow(/locked/);
    await expect(svc.verifyPatientStatus(token, '1990-02-20')).rejects.toThrow(/locked/);
  });
  it('correct DOB shows a patient-friendly status without drug names', async () => {
    as('admin');
    const token = (await svc.getDemoStatusLink(caseId('c16')))!.split('/').pop()!;
    const v = await svc.verifyPatientStatus(token, '1990-02-20');
    expect(v.step).toBe(4);
    expect(JSON.stringify(v)).not.toMatch(/sertraline/i);
  });
  it('invalid token → friendly error', async () => {
    await expect(svc.verifyPatientStatus('nope', '1990-02-20')).rejects.toThrow(/not valid/);
  });
});

describe('uploads', () => {
  it('rejects wrong type and fake magic bytes', async () => {
    as('omar');
    await expectCode(svc.uploadAttachment(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })), 'UNSUPPORTED_FILE');
    await expectCode(svc.uploadAttachment(new File(['not a pdf'], 'x.pdf', { type: 'application/pdf' })), 'UNSUPPORTED_FILE');
    const ok = await svc.uploadAttachment(new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'fax.pdf', { type: 'application/pdf' }));
    expect(ok.name).toBe('fax.pdf');
  });
});

describe('team management', () => {
  it('last admin cannot demote themselves; aal2 required', async () => {
    as('admin', 'aal1');
    await expectCode(svc.updateMemberRole('u-admin', 'practice_staff'), 'MFA_REQUIRED');
    as('admin');
    await expectCode(svc.updateMemberRole('u-admin', 'practice_staff'), 'VALIDATION_ERROR');
  });
  it('removed user loses access on next request', async () => {
    as('admin');
    await svc.removeMember('u-sam');
    as('sam');
    await expectCode(svc.listCases({}), 'UNAUTHENTICATED');
  });
});
