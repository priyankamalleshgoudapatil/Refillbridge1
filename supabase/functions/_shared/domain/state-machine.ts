// The Refill Case state machine (master prompt §5.2). The ONE source of truth for which
// transitions exist. The server's transition_case() and the mock layer both call this.
import type { Actor, CaseStatus, DecisionType, Role, TransitionAction } from '../types.ts';
import { PHARMACY_ROLES, PRACTICE_ROLES, TERMINAL_STATUSES } from '../types.ts';

type ActorKey = 'system' | Role;

export interface TransitionRule {
  id: string; // T1 … T27
  action: TransitionAction;
  from: readonly CaseStatus[];
  /** Fixed target. DECIDE resolves its target from the decision type. */
  to: CaseStatus | 'BY_DECISION';
  actors: readonly ActorKey[];
  requiresAal2?: boolean;
  /** Only these roles may trigger it from these particular states (extra restriction). */
  restrictedFrom?: { states: readonly CaseStatus[]; roles: readonly Role[] };
}

const BEFORE_APPROVED: readonly CaseStatus[] = [
  'RECEIVED',
  'NEEDS_PATIENT_MATCH',
  'TRIAGE',
  'WAITING_ON_INFO',
  'WAITING_ON_PROVIDER',
  'WAITING_ON_PATIENT_VISIT',
  'WAITING_ON_INSURANCE',
];

const practice = PRACTICE_ROLES;
const pharmacy = PHARMACY_ROLES;

export const TRANSITIONS: readonly TransitionRule[] = [
  { id: 'T1', action: 'AUTO_MATCH', from: ['RECEIVED'], to: 'TRIAGE', actors: ['system'] },
  { id: 'T2', action: 'MATCH_UNCERTAIN', from: ['RECEIVED'], to: 'NEEDS_PATIENT_MATCH', actors: ['system'] },
  { id: 'T3', action: 'CONFIRM_PATIENT_MATCH', from: ['NEEDS_PATIENT_MATCH'], to: 'TRIAGE', actors: practice },
  { id: 'T4', action: 'REJECT_PATIENT_MATCH', from: ['NEEDS_PATIENT_MATCH'], to: 'CANCELLED', actors: practice },
  { id: 'T5', action: 'REQUEST_INFO', from: ['TRIAGE', 'WAITING_ON_PROVIDER'], to: 'WAITING_ON_INFO', actors: practice },
  { id: 'T6', action: 'INFO_RECEIVED', from: ['WAITING_ON_INFO'], to: 'TRIAGE', actors: ['system', ...practice] },
  { id: 'T7', action: 'ROUTE_TO_PROVIDER', from: ['TRIAGE'], to: 'WAITING_ON_PROVIDER', actors: ['system', ...practice] },
  { id: 'T8', action: 'ROUTE_TO_INSURANCE', from: ['TRIAGE'], to: 'WAITING_ON_INSURANCE', actors: practice },
  { id: 'T9', action: 'INSURANCE_RESOLVED', from: ['WAITING_ON_INSURANCE'], to: 'TRIAGE', actors: [...practice, ...pharmacy] },
  { id: 'T10', action: 'INSURANCE_NEEDS_ALTERNATIVE', from: ['WAITING_ON_INSURANCE'], to: 'WAITING_ON_PROVIDER', actors: practice },
  { id: 'T11', action: 'CLOSE_NOT_NEEDED', from: ['TRIAGE'], to: 'CLOSED', actors: practice },
  { id: 'T12', action: 'MARK_DUPLICATE', from: ['RECEIVED', 'TRIAGE'], to: 'CLOSED', actors: ['system', ...practice] },
  { id: 'T13', action: 'DECIDE', from: ['WAITING_ON_PROVIDER'], to: 'BY_DECISION', actors: ['provider'], requiresAal2: true },
  { id: 'T17a', action: 'VISIT_COMPLETED', from: ['WAITING_ON_PATIENT_VISIT'], to: 'WAITING_ON_PROVIDER', actors: practice },
  { id: 'T17b', action: 'VISIT_NO_SHOW', from: ['WAITING_ON_PATIENT_VISIT'], to: 'WAITING_ON_PROVIDER', actors: practice },
  { id: 'T18', action: 'DISPATCH_SUCCEEDED', from: ['APPROVED'], to: 'SENT_TO_PHARMACY', actors: ['system'] },
  { id: 'T19', action: 'PHARMACY_ACKNOWLEDGED', from: ['SENT_TO_PHARMACY'], to: 'PHARMACY_CONFIRMED', actors: ['system', ...pharmacy] },
  { id: 'T20', action: 'START_FILLING', from: ['PHARMACY_CONFIRMED'], to: 'FILLING', actors: pharmacy },
  { id: 'T21', action: 'MARK_READY', from: ['FILLING'], to: 'READY_FOR_PICKUP', actors: pharmacy },
  { id: 'T22', action: 'MARK_DISPENSED', from: ['READY_FOR_PICKUP'], to: 'DISPENSED', actors: pharmacy },
  { id: 'T23', action: 'COMPLETE', from: ['DISPENSED'], to: 'CLOSED', actors: ['system'] },
  { id: 'T24', action: 'FINALIZE_DENIAL', from: ['DENIED'], to: 'CLOSED', actors: ['system'] },
  { id: 'T25', action: 'WITHDRAW', from: BEFORE_APPROVED, to: 'CLOSED', actors: pharmacy },
  {
    id: 'T26',
    action: 'CANCEL',
    from: [...BEFORE_APPROVED, 'APPROVED'],
    to: 'CANCELLED',
    actors: practice,
    restrictedFrom: { states: ['APPROVED'], roles: ['provider'] },
  },
  {
    id: 'T27',
    action: 'CANCEL_AFTER_SEND',
    from: ['SENT_TO_PHARMACY', 'PHARMACY_CONFIRMED'],
    to: 'CANCELLED',
    actors: ['provider'],
    requiresAal2: true,
  },
];

export const DECISION_TARGETS: Record<DecisionType, CaseStatus> = {
  APPROVE: 'APPROVED',
  APPROVE_MODIFIED: 'APPROVED',
  APPROVE_BRIDGE_REQUIRE_VISIT: 'APPROVED',
  REQUIRE_VISIT: 'WAITING_ON_PATIENT_VISIT',
  DENY: 'DENIED',
};

export type TransitionErrorCode = 'INVALID_TRANSITION' | 'FORBIDDEN' | 'MFA_REQUIRED';

export type TransitionCheck =
  | { ok: true; to: CaseStatus; rule: TransitionRule }
  | { ok: false; code: TransitionErrorCode; message: string };

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function actorKey(actor: Actor): ActorKey {
  return actor.kind === 'system' ? 'system' : actor.role;
}

export function checkTransition(params: {
  action: TransitionAction;
  from: CaseStatus;
  actor: Actor;
  decision?: DecisionType;
}): TransitionCheck {
  const { action, from, actor, decision } = params;
  const rule = TRANSITIONS.find((t) => t.action === action && t.from.includes(from));
  if (!rule || isTerminal(from)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `"${action}" is not allowed while the case is ${from}.`,
    };
  }
  const key = actorKey(actor);
  if (!rule.actors.includes(key)) {
    return { ok: false, code: 'FORBIDDEN', message: forbiddenMessage(action) };
  }
  if (rule.restrictedFrom && rule.restrictedFrom.states.includes(from) && key !== 'system') {
    if (!rule.restrictedFrom.roles.includes(key)) {
      return { ok: false, code: 'FORBIDDEN', message: 'Only a provider can cancel an approved refill.' };
    }
  }
  if (rule.requiresAal2 && actor.kind === 'user' && actor.aal !== 'aal2') {
    return {
      ok: false,
      code: 'MFA_REQUIRED',
      message: 'Verify with your authenticator app to make this decision.',
    };
  }
  let to: CaseStatus;
  if (rule.to === 'BY_DECISION') {
    if (!decision) {
      return { ok: false, code: 'INVALID_TRANSITION', message: 'A decision type is required.' };
    }
    to = DECISION_TARGETS[decision];
  } else {
    to = rule.to;
  }
  return { ok: true, to, rule };
}

function forbiddenMessage(action: TransitionAction): string {
  if (action === 'DECIDE' || action === 'CANCEL_AFTER_SEND') {
    return 'Only providers can make clinical decisions.';
  }
  return "You don't have permission to do that.";
}

/** Human-triggerable actions for a role in a given state (system-only actions are excluded). */
export function allowedActionsFor(status: CaseStatus, role: Role): TransitionAction[] {
  if (isTerminal(status)) return [];
  return TRANSITIONS.filter((t) => {
    if (!t.from.includes(status) || !t.actors.includes(role)) return false;
    if (t.restrictedFrom && t.restrictedFrom.states.includes(status)) {
      return t.restrictedFrom.roles.includes(role);
    }
    return true;
  }).map((t) => t.action);
}
