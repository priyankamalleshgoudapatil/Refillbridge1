import { describe, expect, it } from 'vitest';
import { CASE_STATUSES, ROLES, type Actor, type TransitionAction } from '../types.ts';
import { allowedActionsFor, checkTransition, TRANSITIONS } from './state-machine.ts';

const ALL_ACTIONS = Array.from(new Set(TRANSITIONS.map((t) => t.action))) as TransitionAction[];
const aal2 = (role: (typeof ROLES)[number]): Actor => ({ kind: 'user', role, aal: 'aal2' });

describe('state machine — table driven', () => {
  it('every listed transition succeeds for each allowed actor', () => {
    for (const rule of TRANSITIONS) {
      for (const from of rule.from) {
        for (const actorKey of rule.actors) {
          if (rule.restrictedFrom?.states.includes(from) && actorKey !== 'system' && !rule.restrictedFrom.roles.includes(actorKey)) continue;
          const actor: Actor = actorKey === 'system' ? { kind: 'system' } : aal2(actorKey);
          const res = checkTransition({ action: rule.action, from, actor, decision: 'APPROVE' });
          expect(res.ok, `${rule.id} ${rule.action} from ${from} by ${actorKey}`).toBe(true);
        }
      }
    }
  });

  it('every disallowed from→action pair is rejected with INVALID_TRANSITION', () => {
    for (const from of CASE_STATUSES) {
      for (const action of ALL_ACTIONS) {
        const listed = TRANSITIONS.some((t) => t.action === action && t.from.includes(from));
        if (listed) continue;
        for (const actor of [{ kind: 'system' } as Actor, ...ROLES.map(aal2)]) {
          const res = checkTransition({ action, from, actor, decision: 'APPROVE' });
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.code).toBe('INVALID_TRANSITION');
        }
      }
    }
  });

  it('every wrong role is rejected with FORBIDDEN', () => {
    for (const rule of TRANSITIONS) {
      for (const role of ROLES) {
        if (rule.actors.includes(role)) continue;
        const res = checkTransition({ action: rule.action, from: rule.from[0], actor: aal2(role), decision: 'APPROVE' });
        expect(res.ok, `${rule.id} by ${role}`).toBe(false);
        if (!res.ok) expect(res.code).toBe('FORBIDDEN');
      }
    }
  });

  it('terminal cases are never reopened', () => {
    for (const action of ALL_ACTIONS) {
      for (const from of ['CLOSED', 'CANCELLED'] as const) {
        expect(checkTransition({ action, from, actor: { kind: 'system' } }).ok).toBe(false);
      }
    }
  });
});

describe('clinical decision guardrails', () => {
  it('a provider decision at aal1 returns MFA_REQUIRED', () => {
    const res = checkTransition({
      action: 'DECIDE',
      from: 'WAITING_ON_PROVIDER',
      actor: { kind: 'user', role: 'provider', aal: 'aal1' },
      decision: 'APPROVE',
    });
    expect(res).toMatchObject({ ok: false, code: 'MFA_REQUIRED' });
  });

  it('staff cannot decide, even with MFA', () => {
    const res = checkTransition({ action: 'DECIDE', from: 'WAITING_ON_PROVIDER', actor: aal2('practice_staff'), decision: 'APPROVE' });
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN', message: 'Only providers can make clinical decisions.' });
  });

  it('the system can never decide', () => {
    expect(checkTransition({ action: 'DECIDE', from: 'WAITING_ON_PROVIDER', actor: { kind: 'system' }, decision: 'APPROVE' }).ok).toBe(false);
  });

  it.each([
    ['APPROVE', 'APPROVED'],
    ['APPROVE_MODIFIED', 'APPROVED'],
    ['APPROVE_BRIDGE_REQUIRE_VISIT', 'APPROVED'],
    ['REQUIRE_VISIT', 'WAITING_ON_PATIENT_VISIT'],
    ['DENY', 'DENIED'],
  ] as const)('decision %s moves the case to %s', (decision, to) => {
    const res = checkTransition({ action: 'DECIDE', from: 'WAITING_ON_PROVIDER', actor: aal2('provider'), decision });
    expect(res).toMatchObject({ ok: true, to });
  });

  it('only a provider can cancel an approved refill', () => {
    expect(checkTransition({ action: 'CANCEL', from: 'APPROVED', actor: aal2('practice_staff') })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(checkTransition({ action: 'CANCEL', from: 'APPROVED', actor: aal2('provider') }).ok).toBe(true);
    expect(checkTransition({ action: 'CANCEL', from: 'TRIAGE', actor: aal2('practice_staff') }).ok).toBe(true);
  });

  it('dispatch success is system-only', () => {
    expect(checkTransition({ action: 'DISPATCH_SUCCEEDED', from: 'APPROVED', actor: aal2('practice_admin') }).ok).toBe(false);
    expect(checkTransition({ action: 'DISPATCH_SUCCEEDED', from: 'APPROVED', actor: { kind: 'system' } }).ok).toBe(true);
  });
});

describe('allowedActionsFor', () => {
  it('gives the provider DECIDE in WAITING_ON_PROVIDER, staff do not get it', () => {
    expect(allowedActionsFor('WAITING_ON_PROVIDER', 'provider')).toContain('DECIDE');
    expect(allowedActionsFor('WAITING_ON_PROVIDER', 'practice_staff')).not.toContain('DECIDE');
  });
  it('gives pharmacy staff the fill actions only in the right states', () => {
    expect(allowedActionsFor('SENT_TO_PHARMACY', 'pharmacy_staff')).toContain('PHARMACY_ACKNOWLEDGED');
    expect(allowedActionsFor('FILLING', 'pharmacy_staff')).toEqual(['MARK_READY']);
    expect(allowedActionsFor('CLOSED', 'practice_admin')).toEqual([]);
  });
  it('excludes system-only actions', () => {
    expect(allowedActionsFor('RECEIVED', 'practice_admin')).not.toContain('AUTO_MATCH');
  });
});
