import { describe, expect, it } from 'vitest';
import { passwordIssues } from '../schemas/index.ts';
import { can, homeRouteFor } from './permissions.ts';
import { addBusinessMinutes, computeDueAt, DEFAULT_BUSINESS_HOURS, DEFAULT_POLICIES, formatDuration, slaState } from './sla.ts';

const TZ = 'America/Chicago';

describe('business hours', () => {
  it('adds minutes within the same business day', () => {
    // Tue 2026-09-15 10:00 CDT = 15:00Z
    const r = addBusinessMinutes(new Date('2026-09-15T15:00:00Z'), 120, DEFAULT_BUSINESS_HOURS, TZ);
    expect(r.toISOString()).toBe('2026-09-15T17:00:00.000Z');
  });
  it('pauses overnight', () => {
    // Tue 16:00 CDT + 2 business hours → Wed 09:00 CDT (14:00Z)
    const r = addBusinessMinutes(new Date('2026-09-15T21:00:00Z'), 120, DEFAULT_BUSINESS_HOURS, TZ);
    expect(r.toISOString()).toBe('2026-09-16T14:00:00.000Z');
  });
  it('pauses over the weekend', () => {
    // Fri 2026-09-18 16:00 CDT + 2h → Mon 09:00 CDT
    const r = addBusinessMinutes(new Date('2026-09-18T21:00:00Z'), 120, DEFAULT_BUSINESS_HOURS, TZ);
    expect(r.toISOString()).toBe('2026-09-21T14:00:00.000Z');
  });
  it('skips holidays', () => {
    const cal = { ...DEFAULT_BUSINESS_HOURS, holidays: ['2026-09-16'] };
    const r = addBusinessMinutes(new Date('2026-09-15T21:00:00Z'), 120, cal, TZ);
    expect(r.toISOString()).toBe('2026-09-17T14:00:00.000Z');
  });
});

describe('SLA', () => {
  it('urgent provider SLA is tighter than routine', () => {
    const from = new Date('2026-09-15T14:00:00Z');
    const base = { status: 'WAITING_ON_PROVIDER' as const, from, policies: DEFAULT_POLICIES, businessHours: DEFAULT_BUSINESS_HOURS, timeZone: TZ };
    const urgent = computeDueAt({ ...base, priority: 'URGENT' })!;
    const routine = computeDueAt({ ...base, priority: 'ROUTINE' })!;
    expect(urgent.getTime()).toBeLessThan(routine.getTime());
  });
  it('states with no SLA return null', () => {
    expect(computeDueAt({ status: 'CLOSED', priority: 'ROUTINE', from: new Date(), policies: DEFAULT_POLICIES, businessHours: DEFAULT_BUSINESS_HOURS, timeZone: TZ })).toBeNull();
  });
  it('computes on_track / at_risk / breached', () => {
    const statusSince = '2026-09-15T10:00:00Z';
    const dueAt = '2026-09-15T14:00:00Z';
    expect(slaState({ statusSince, dueAt, now: new Date('2026-09-15T11:00:00Z') })).toBe('on_track');
    expect(slaState({ statusSince, dueAt, now: new Date('2026-09-15T13:30:00Z') })).toBe('at_risk');
    expect(slaState({ statusSince, dueAt, now: new Date('2026-09-15T14:01:00Z') })).toBe('breached');
    expect(slaState({ statusSince, dueAt: null, now: new Date() })).toBe('none');
  });
  it('formats durations', () => {
    expect(formatDuration((6 * 60 + 12) * 60_000)).toBe('6 h 12 m');
    expect(formatDuration(50 * 60 * 60_000)).toBe('2 d 2 h');
  });
});

describe('permissions', () => {
  it('only providers can decide', () => {
    expect(can('provider', 'case.decide')).toBe(true);
    expect(can('practice_admin', 'case.decide')).toBe(false);
    expect(can('pharmacy_admin', 'case.decide')).toBe(false);
  });
  it('pharmacy never sees full clinical case detail', () => {
    expect(can('pharmacy_staff', 'case.viewFull')).toBe(false);
    expect(can('pharmacy_staff', 'case.viewPharmacy')).toBe(true);
  });
  it('routes each role home', () => {
    expect(homeRouteFor('provider')).toBe('/provider/inbox');
    expect(homeRouteFor('pharmacy_staff')).toBe('/pharmacy/requests');
    expect(homeRouteFor('practice_staff')).toBe('/queue');
  });
});

describe('password policy', () => {
  it('accepts a strong password', () => {
    expect(passwordIssues('Bridge!2026', { email: 'ana@example.com', name: 'Ana Ruiz' })).toEqual([]);
  });
  it('rejects weak passwords with each missing rule', () => {
    expect(passwordIssues('abc', {})).toEqual(expect.arrayContaining(['At least 8 characters', 'An uppercase letter', 'A number', 'A symbol']));
  });
  it('rejects passwords containing the email or name', () => {
    expect(passwordIssues('Priya!2026x', { email: 'priya@example.com' })).toContain('Must not contain your email');
    expect(passwordIssues('Rao!2026xyz', { name: 'Dev Rao' })).toContain('Must not contain your name');
  });
});
