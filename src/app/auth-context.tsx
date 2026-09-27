import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogIn, ShieldCheck, TimerReset } from 'lucide-react';
import type { SessionUser } from '@shared/dto.ts';
import { ApiError, authService, friendlyMessage } from '@/services';
import { onBackendChange } from '@/services/mock/backend';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, sessionStore } from '@/services/session';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DEMO_MFA_CODE } from '@/mocks/data/fixtures';

interface AuthContextValue {
  user: SessionUser | null;
  refresh: () => void;
  signOut: (reason?: 'idle' | 'manual' | 'removed') => Promise<void>;
  /** Opens the step-up MFA modal; resolves true once the user verifies (aal2). */
  requireStepUp: () => Promise<boolean>;
  /** Runs fn; on 403 MFA_REQUIRED asks for step-up then retries once. */
  runWithStepUp: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Called by the query layer when the API says 401 while the UI still thinks we're signed in. */
  handleUnauthenticated: (err: ApiError) => void;
  simulateIdleWarning: () => void;
  simulateExpiry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => authService.currentUser());
  const [expired, setExpired] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const stepUpResolver = useRef<((ok: boolean) => void) | null>(null);
  const intentionalSignOut = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const refresh = useCallback(() => setUser(authService.currentUser()), []);

  useEffect(() => {
    const unsubSession = sessionStore.subscribe((s) => {
      if (!s && !intentionalSignOut.current && user) {
        setExpired(true); // keep the UI (and any half-filled form) mounted; re-auth in a modal
        return;
      }
      intentionalSignOut.current = false;
      setUser(authService.currentUser());
    });
    const unsubBackend = onBackendChange(() => {
      setUser((u) => (u ? authService.currentUser() ?? u : u));
      qc.invalidateQueries();
    });
    return () => {
      unsubSession();
      unsubBackend();
    };
  }, [user, qc]);

  const signOut = useCallback(
    async (reason: 'idle' | 'manual' | 'removed' = 'manual') => {
      intentionalSignOut.current = true;
      await authService.signOut();
      setUser(null);
      setExpired(false);
      setIdleWarning(false);
      qc.clear();
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(reason === 'manual' ? '/sign-in' : `/sign-in?reason=${reason}&next=${next}`, { replace: true });
    },
    [navigate, location.pathname, location.search, qc],
  );

  // ---- Idle timeout: warning at 14 min, sign-out at 15 min (H4)
  useEffect(() => {
    if (!user) return;
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last > 5000) {
        last = now;
        sessionStore.touch();
      }
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(() => {
      const s = sessionStore.get();
      if (!s) return;
      const idle = Date.now() - s.lastActivity;
      if (idle >= IDLE_TIMEOUT_MS) void signOut('idle');
      else if (idle >= IDLE_WARNING_MS) setIdleWarning(true);
    }, 10_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
  }, [user, signOut]);

  const requireStepUp = useCallback(() => {
    setStepUpOpen(true);
    return new Promise<boolean>((resolve) => {
      stepUpResolver.current = resolve;
    });
  }, []);

  const runWithStepUp = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'MFA_REQUIRED') {
          const ok = await requireStepUp();
          if (ok) return fn();
        }
        throw err;
      }
    },
    [requireStepUp],
  );

  const handleUnauthenticated = useCallback(
    (err: ApiError) => {
      if (!user) return;
      if (/removed/i.test(err.message)) void signOut('removed');
      else setExpired(true);
    },
    [user, signOut],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      refresh,
      signOut,
      requireStepUp,
      runWithStepUp,
      handleUnauthenticated,
      simulateIdleWarning: () => setIdleWarning(true),
      simulateExpiry: () => {
        sessionStore.clear();
      },
    }),
    [user, refresh, signOut, requireStepUp, runWithStepUp, handleUnauthenticated],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <IdleWarningModal
        open={idleWarning}
        onStay={() => {
          sessionStore.touch();
          setIdleWarning(false);
        }}
        onSignOut={() => void signOut('idle')}
      />
      <StepUpModal
        open={stepUpOpen}
        onDone={(ok) => {
          setStepUpOpen(false);
          stepUpResolver.current?.(ok);
          stepUpResolver.current = null;
          refresh();
        }}
      />
      {user && (
        <ReauthModal
          open={expired}
          email={user.email}
          onSignedIn={() => {
            setExpired(false);
            refresh();
            void qc.invalidateQueries();
          }}
          onGiveUp={() => void signOut('idle')}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

function IdleWarningModal({ open, onStay, onSignOut }: { open: boolean; onStay: () => void; onSignOut: () => void }) {
  const [left, setLeft] = useState(60);
  useEffect(() => {
    if (!open) return;
    setLeft(60);
    const t = setInterval(() => setLeft((l) => (l <= 1 ? 0 : l - 1)), 1000);
    return () => clearInterval(t);
  }, [open]);
  useEffect(() => {
    if (open && left === 0) onSignOut();
  }, [open, left, onSignOut]);
  return (
    <Modal
      open={open}
      onClose={onStay}
      title="Stay signed in?"
      description="For patient privacy, we sign you out after 15 minutes without activity."
      icon={<TimerReset className="size-5" />}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onSignOut}>
            Sign out
          </Button>
          <Button onClick={onStay} data-autofocus>
            Stay signed in
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-700">
        You'll be signed out in <span className="font-mono font-semibold text-brand-800">{left}s</span>.
      </p>
    </Modal>
  );
}

function StepUpModal({ open, onDone }: { open: boolean; onDone: (ok: boolean) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCode('');
      setError(undefined);
    }
  }, [open]);
  const submit = async () => {
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    setBusy(true);
    try {
      await authService.verifyMfa(code);
      onDone(true);
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => onDone(false)}
      title="Verify it's you"
      description="Clinical decisions and admin actions need a code from your authenticator app."
      icon={<ShieldCheck className="size-5" />}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Verify and continue
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          error={error}
          hint={`Demo code: ${DEMO_MFA_CODE}`}
          data-autofocus
          className="font-mono text-lg tracking-[0.4em]"
          leading={<KeyRound className="size-4" />}
        />
      </form>
    </Modal>
  );
}

function ReauthModal({ open, email, onSignedIn, onGiveUp }: { open: boolean; email: string; onSignedIn: () => void; onGiveUp: () => void }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'password' | 'mfa'>('password');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setPassword('');
      setCode('');
      setStage('password');
      setError(undefined);
    }
  }, [open]);
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (stage === 'password') {
        const r = await authService.signIn(email, password);
        if (r.status === 'mfa_required') setStage('mfa');
        else onSignedIn();
      } else {
        await authService.verifyMfa(code);
        onSignedIn();
      }
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => undefined}
      closeOnEscape={false}
      closeOnBackdrop={false}
      title="Your session expired"
      description="Sign in again to continue. Your unsaved work on this page is still here."
      icon={<LogIn className="size-5" />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onGiveUp}>
            Sign out instead
          </Button>
          <Button onClick={submit} loading={busy}>
            Continue
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-ink-600">
          Signed in as <span className="font-medium text-ink-900">{email}</span>
        </p>
        {stage === 'password' ? (
          <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} data-autofocus />
        ) : (
          <Input label="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={error} hint={`Demo code: ${DEMO_MFA_CODE}`} data-autofocus />
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
