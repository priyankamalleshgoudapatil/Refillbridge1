// Permission matrix (master prompt §4.2). The server enforces these; the UI only uses them to hide buttons.
import type { Role } from '../types.ts';

export type Permission =
  | 'queue.view'
  | 'case.viewFull'
  | 'case.viewPharmacy'
  | 'case.createPharmacy'
  | 'case.createPhone'
  | 'case.matchPatient'
  | 'case.requestInfo'
  | 'case.route'
  | 'case.decide'
  | 'case.draftMessage'
  | 'case.sendMessage'
  | 'case.pharmacyProgress'
  | 'case.withdraw'
  | 'case.cancel'
  | 'case.claim'
  | 'analytics.view'
  | 'team.manage'
  | 'pharmacies.link'
  | 'policies.edit'
  | 'audit.view'
  | 'simulator.use';

const MATRIX: Record<Permission, readonly Role[]> = {
  'queue.view': ['practice_admin', 'provider', 'practice_staff'],
  'case.viewFull': ['practice_admin', 'provider', 'practice_staff'],
  'case.viewPharmacy': ['pharmacy_admin', 'pharmacy_staff'],
  'case.createPharmacy': ['pharmacy_admin', 'pharmacy_staff'],
  'case.createPhone': ['practice_admin', 'provider', 'practice_staff'],
  'case.matchPatient': ['practice_admin', 'provider', 'practice_staff'],
  'case.requestInfo': ['practice_admin', 'provider', 'practice_staff'],
  'case.route': ['practice_admin', 'provider', 'practice_staff'],
  'case.decide': ['provider'],
  'case.draftMessage': ['practice_admin', 'provider', 'practice_staff'],
  'case.sendMessage': ['practice_admin', 'provider', 'practice_staff'],
  'case.pharmacyProgress': ['pharmacy_admin', 'pharmacy_staff'],
  'case.withdraw': ['pharmacy_admin', 'pharmacy_staff'],
  'case.cancel': ['practice_admin', 'provider', 'practice_staff'],
  'case.claim': ['practice_admin', 'provider', 'practice_staff'],
  'analytics.view': ['practice_admin', 'provider', 'pharmacy_admin'],
  'team.manage': ['practice_admin', 'pharmacy_admin'],
  'pharmacies.link': ['practice_admin'],
  'policies.edit': ['practice_admin'],
  'audit.view': ['practice_admin', 'pharmacy_admin'],
  'simulator.use': ['practice_admin'],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}

export function isPracticeRole(role: Role): boolean {
  return role === 'practice_admin' || role === 'provider' || role === 'practice_staff';
}

export function homeRouteFor(role: Role): string {
  if (role === 'provider') return '/provider/inbox';
  if (role === 'pharmacy_admin' || role === 'pharmacy_staff') return '/pharmacy/requests';
  return '/queue';
}

export const ROLE_LABELS: Record<Role, string> = {
  practice_admin: 'Practice admin',
  provider: 'Provider',
  practice_staff: 'Practice staff',
  pharmacy_admin: 'Pharmacy admin',
  pharmacy_staff: 'Pharmacy staff',
};
