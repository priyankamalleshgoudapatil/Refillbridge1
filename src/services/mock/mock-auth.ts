// Mock of Supabase Auth + our /auth endpoints. Same rules: generic errors, progressive delay (never a
// hard lockout), rate limits, honeypot, hashed single-use invites, MFA (TOTP) → aal2.
import type { SessionUser } from '@shared/dto.ts';
import { passwordIssues, signUpSchema } from '@shared/schemas/index.ts';
import { MFA_REQUIRED_ROLES, type Aal } from '@shared/types.ts';
import { DEMO_MFA_CODE } from '@/mocks/data/fixtures';
import { ApiError } from '../errors';
import type { AuthService, SignInResult } from '../refill-service';
import { sessionStore } from '../session';
import { getEngine, notifyChange } from './backend';
import { newCtx, randomToken, uid, type UserRow } from './engine';

const IS_TEST = import.meta.env.MODE === 'test';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const failures = new Map<string, { count: number; times: number[] }>();
const resetTokens = new Map<string, { email: string; expires: number }>();
let pendingUserId: string | null = null; // password verified, MFA not yet

function audit(u: UserRow | undefined, action: string, orgId?: string) {
  const eng = getEngine();
  const org = u?.orgId ?? orgId;
  if (!org) return;
  eng.db.audit.push({ id: uid('aud'), orgId: org, actorName: u?.name ?? 'Unknown', action, entity: 'auth', entityId: u?.id ?? null, requestId: uid('req'), createdAt: new Date().toISOString() });
}

function startSession(u: UserRow, aal: Aal, extra: { devBypassMfaGate?: boolean } = {}) {
  const now = Date.now();
  u.lastActive = new Date().toISOString();
  sessionStore.set({ userId: u.id, aal, issuedAt: now, lastActivity: now, ...extra });
}

export const mockAuthService: AuthService = {
  async signIn(email, password) {
    const key = email.trim().toLowerCase();
    const f = failures.get(key) ?? { count: 0, times: [] };
    const now = Date.now();
    f.times = f.times.filter((t) => now - t < 15 * 60_000);
    if (f.times.length >= 10) throw new ApiError('RATE_LIMITED', "You're going a bit fast. Try again in a few minutes.");
    // Progressive delay after 5 failures: 1 s, 2 s, 4 s … max 30 s. Never a hard lockout.
    const delay = f.count >= 5 ? Math.min(30_000, 1000 * 2 ** (f.count - 5)) : 0;
    if (!IS_TEST) await sleep(400 + delay);
    const eng = getEngine();
    const u = eng.db.users.find((x) => x.email.toLowerCase() === key);
    if (!u || u.password !== password || u.status !== 'active') {
      f.count += 1;
      f.times.push(now);
      failures.set(key, f);
      audit(u, 'auth.signin_failed', 'org-lfm');
      throw new ApiError('UNAUTHENTICATED', 'Invalid email or password.');
    }
    failures.delete(key);
    audit(u, 'auth.signin');
    if (MFA_REQUIRED_ROLES.includes(u.role)) {
      pendingUserId = u.id;
      startSession(u, 'aal1');
      return { status: u.mfaEnrolled ? 'mfa_required' : 'mfa_enroll' } satisfies SignInResult;
    }
    startSession(u, 'aal1');
    return { status: 'signed_in' };
  },

  async verifyMfa(code) {
    if (!IS_TEST) await sleep(350);
    const s = sessionStore.get();
    const u = getEngine().user(s?.userId ?? pendingUserId);
    if (!u) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
    if (code !== DEMO_MFA_CODE) {
      audit(u, 'auth.mfa_failed');
      throw new ApiError('VALIDATION_ERROR', "That code didn't work. Try the newest code in your app.");
    }
    pendingUserId = null;
    sessionStore.update({ aal: 'aal2', lastActivity: Date.now() });
    audit(u, 'auth.mfa_verified');
    notifyChange();
  },

  async startMfaEnrollment() {
    if (!IS_TEST) await sleep(300);
    const secret = 'JBSWY3DPEHPK3PXP';
    return { secret, otpauthUri: `otpauth://totp/RefillBridge?secret=${secret}&issuer=RefillBridge` };
  },

  async confirmMfaEnrollment(code) {
    if (!IS_TEST) await sleep(350);
    const s = sessionStore.get();
    const u = getEngine().user(s?.userId ?? null);
    if (!u) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
    if (code !== DEMO_MFA_CODE) throw new ApiError('VALIDATION_ERROR', "That code didn't work. Try the newest code in your app.");
    u.mfaEnrolled = true;
    sessionStore.update({ aal: 'aal2' });
    audit(u, 'auth.mfa_enrolled');
    notifyChange();
  },

  async signUp(input) {
    if (!IS_TEST) await sleep(600);
    const neutral = { message: 'If this email can be used, we sent a verification link. Check your inbox.' };
    if (input.website) return neutral; // honeypot filled → silent reject
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', parsed.error.issues[0].message);
    const eng = getEngine();
    if (eng.db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) return neutral; // no enumeration
    const orgId = uid('org');
    eng.db.orgs.push({ id: orgId, name: input.orgName, type: input.orgType, timezone: 'America/Chicago', phone: '—', city: '—' });
    if (input.orgType === 'practice') eng.db.policies[orgId] = structuredClone(eng.policiesFor('org-lfm'));
    eng.db.users.push({
      id: uid('u'),
      key: uid('k'),
      name: input.fullName,
      email: input.email,
      role: input.orgType === 'practice' ? 'practice_admin' : 'pharmacy_admin',
      orgId,
      title: 'Administrator',
      mfaEnrolled: false,
      password: input.password,
      status: 'invited', // until the email is verified
      lastActive: null,
    });
    return { ...neutral, demoVerifyEmail: input.email };
  },

  async verifyEmail(email) {
    const u = getEngine().db.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (u && u.status === 'invited') u.status = 'active';
  },

  async forgotPassword(email) {
    if (!IS_TEST) await sleep(500);
    const u = getEngine().db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    const message = 'If an account exists for this email, we sent a reset link.';
    if (!u) return { message };
    const token = randomToken();
    resetTokens.set(token, { email: u.email, expires: Date.now() + 30 * 60_000 });
    return { message, demoResetToken: token };
  },

  async resetPassword(token, password) {
    if (!IS_TEST) await sleep(500);
    const t = resetTokens.get(token);
    if (!t || t.expires < Date.now()) throw new ApiError('VALIDATION_ERROR', 'This reset link has expired. Request a new one.');
    const u = getEngine().db.users.find((x) => x.email === t.email)!;
    const issues = passwordIssues(password, { email: u.email, name: u.name });
    if (issues.length) throw new ApiError('VALIDATION_ERROR', issues[0]);
    u.password = password;
    resetTokens.delete(token);
    audit(u, 'auth.password_reset');
    sessionStore.clear(); // global sign-out
  },

  async getInvite(token) {
    if (!IS_TEST) await sleep(300);
    const eng = getEngine();
    const inv = eng.db.invites.find((i) => i.token === token);
    if (!inv || inv.usedAt || new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new ApiError('NOT_FOUND', 'This invite has expired. Ask your admin to send a new one.');
    }
    return { email: inv.email, role: inv.role, orgName: eng.org(inv.orgId).name };
  },

  async acceptInvite(token, name, password) {
    if (!IS_TEST) await sleep(500);
    const eng = getEngine();
    const inv = eng.db.invites.find((i) => i.token === token);
    if (!inv || inv.usedAt || new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new ApiError('NOT_FOUND', 'This invite has expired. Ask your admin to send a new one.');
    }
    const issues = passwordIssues(password, { email: inv.email, name });
    if (issues.length) throw new ApiError('VALIDATION_ERROR', issues[0]);
    inv.usedAt = new Date().toISOString();
    const u: UserRow = { id: uid('u'), key: uid('k'), name, email: inv.email, role: inv.role, orgId: inv.orgId, title: '', mfaEnrolled: false, password, status: 'active', lastActive: null };
    eng.db.users.push(u);
    audit(u, 'member.invite_accepted');
  },

  async changePassword(current, next) {
    if (!IS_TEST) await sleep(500);
    const s = sessionStore.get();
    const u = getEngine().user(s?.userId ?? null);
    if (!u) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
    if (u.password !== current) throw new ApiError('VALIDATION_ERROR', 'Your current password is incorrect.');
    const issues = passwordIssues(next, { email: u.email, name: u.name });
    if (issues.length) throw new ApiError('VALIDATION_ERROR', issues[0]);
    u.password = next;
    audit(u, 'auth.password_changed');
  },

  async signOut() {
    const s = sessionStore.get();
    const u = getEngine().user(s?.userId ?? null);
    if (u) audit(u, 'auth.signout');
    pendingUserId = null;
    sessionStore.clear();
  },

  currentUser(): SessionUser | null {
    const s = sessionStore.get();
    if (!s) return null;
    const eng = getEngine();
    const u = eng.user(s.userId);
    if (!u || u.status === 'removed') return null;
    const org = eng.db.orgs.find((o) => o.id === u.orgId);
    return { id: u.id, name: u.name, email: u.email, role: u.role, orgId: u.orgId, orgName: org?.name ?? '', orgType: org?.type ?? 'practice', title: u.title, mfaEnrolled: u.mfaEnrolled, aal: s.aal };
  },

  devSwitchUser(userKey, aal) {
    if (import.meta.env.VITE_APP_ENV === 'production') return;
    const u = getEngine().db.users.find((x) => x.key === userKey);
    if (!u) return;
    startSession(u, aal, { devBypassMfaGate: aal === 'aal1' });
    getEngine().audit(u.orgId, newCtx(u, aal), 'auth.dev_switch', 'auth', u.id);
  },
};
