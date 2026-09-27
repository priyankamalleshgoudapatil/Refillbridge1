// SLA windows, business-hours calendar and SLA state (master prompt §5.9). Pure functions.
import type { BusinessHours, CaseStatus, PracticePolicies, Priority, SlaState, SlaWindow } from '../types.ts';

const MIN_MS = 60_000;
const HOUR = 60;

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 17,
  holidays: [],
};

const bh = (hours: number): SlaWindow => ({ minutes: hours * HOUR, business: true });
const wall = (hours: number): SlaWindow => ({ minutes: hours * HOUR, business: false });

export const DEFAULT_POLICIES: PracticePolicies = {
  sla: {
    NEEDS_PATIENT_MATCH: { routine: bh(2), urgent: { minutes: 30, business: true } },
    TRIAGE: { routine: bh(2), urgent: { minutes: 30, business: true } },
    WAITING_ON_INFO: { routine: wall(48), urgent: wall(8) },
    WAITING_ON_PROVIDER: { routine: bh(9), urgent: bh(4) }, // 1 business day = 9 business hours
    WAITING_ON_PATIENT_VISIT: { routine: wall(72), urgent: wall(24) },
    WAITING_ON_INSURANCE: { routine: bh(18), urgent: bh(9) },
    SENT_TO_PHARMACY: { routine: bh(4), urgent: bh(1) },
  },
  visitRules: {
    bloodPressureVisitMonths: 12,
    diabetesA1cMonths: 6,
    diabetesVisitMonths: 12,
    antidepressantVisitMonths: 6,
    adhdVisitMonths: 3,
    controlledOtherVisitMonths: 3,
  },
  maxBridgeDays: 30,
  rxValidityMonths: 12,
  tooEarlyThreshold: 0.8,
};

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

interface ZonedParts {
  weekday: number;
  hour: number;
  minute: number;
  date: string; // YYYY-MM-DD
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function zonedParts(d: Date, timeZone: string): ZonedParts {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function isBusinessTime(d: Date, cal: BusinessHours, timeZone: string): boolean {
  const p = zonedParts(d, timeZone);
  return cal.days.includes(p.weekday) && !cal.holidays.includes(p.date) && p.hour >= cal.startHour && p.hour < cal.endHour;
}

/** Adds business minutes, pausing the clock outside business hours, weekends and holidays. */
export function addBusinessMinutes(start: Date, minutes: number, cal: BusinessHours, timeZone: string): Date {
  let t = start.getTime();
  let remaining = minutes;
  let guard = 0;
  while (remaining > 0 && guard < 5000) {
    guard++;
    const p = zonedParts(new Date(t), timeZone);
    const businessDay = cal.days.includes(p.weekday) && !cal.holidays.includes(p.date);
    const nowMin = p.hour * 60 + p.minute;
    if (businessDay && p.hour >= cal.startHour && p.hour < cal.endHour) {
      const left = cal.endHour * 60 - nowMin;
      const step = Math.min(remaining, left);
      t += step * MIN_MS;
      remaining -= step;
    } else if (businessDay && p.hour < cal.startHour) {
      t += (cal.startHour * 60 - nowMin) * MIN_MS;
    } else {
      t += (60 - p.minute) * MIN_MS; // hop to the next hour
    }
  }
  return new Date(t);
}

export function slaWindowFor(status: CaseStatus, priority: Priority, policies: PracticePolicies): SlaWindow | null {
  const entry = policies.sla[status] ?? DEFAULT_POLICIES.sla[status];
  if (!entry) return null;
  return priority === 'URGENT' ? entry.urgent : entry.routine;
}

export function computeDueAt(params: {
  status: CaseStatus;
  priority: Priority;
  from: Date;
  policies: PracticePolicies;
  businessHours: BusinessHours;
  timeZone: string;
}): Date | null {
  const w = slaWindowFor(params.status, params.priority, params.policies);
  if (!w) return null;
  return w.business
    ? addBusinessMinutes(params.from, w.minutes, params.businessHours, params.timeZone)
    : new Date(params.from.getTime() + w.minutes * MIN_MS);
}

/** at_risk once 75% of the window has elapsed; breached after due. */
export function slaState(params: { statusSince: string; dueAt: string | null; now: Date }): SlaState {
  if (!params.dueAt) return 'none';
  const start = new Date(params.statusSince).getTime();
  const due = new Date(params.dueAt).getTime();
  const now = params.now.getTime();
  if (now >= due) return 'breached';
  if (now >= start + (due - start) * 0.75) return 'at_risk';
  return 'on_track';
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const totalMin = Math.floor(abs / MIN_MS);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}
