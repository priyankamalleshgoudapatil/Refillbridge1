import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Copy, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { homeRouteFor } from '@shared/domain/permissions.ts';
import { useAuth } from '@/app/auth-context';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/States';
import { authService, friendlyMessage } from '@/services';
import { DEMO_MFA_CODE } from '@/mocks/data/fixtures';
import { cn } from '@/lib/format';
import { AuthLayout } from './AuthLayout';
import { CodeInput } from './CodeInput';
import { safeNext } from './auth-shared';

const CODE_ERROR = "That code didn't work. Try the newest code in your app.";

export default function MfaPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const next = safeNext(params.get('next'));

  if (!user) {
    const qs = next ? `?next=${encodeURIComponent(next)}` : '';
    return <Navigate to={`/sign-in${qs}`} replace />;
  }
  const target = next ?? homeRouteFor(user.role);
  if (user.aal === 'aal2') return <Navigate to={target} replace />;

  const enroll = params.get('mode') === 'enroll' || !user.mfaEnrolled;
  return enroll ? <EnrollFlow target={target} /> : <VerifyFlow target={target} />;
}

function useFinish(target: string) {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  return () => {
    refresh();
    navigate(target, { replace: true });
  };
}

function SwitchAccount() {
  const { signOut } = useAuth();
  // useAuth().signOut wraps authService.signOut(), clears caches and navigates to /sign-in without
  // triggering the "session expired" modal.
  return (
    <button type="button" onClick={() => void signOut('manual')} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
      Sign in as someone else
    </button>
  );
}

function useCodeSubmit(action: (code: string) => Promise<void>, onSuccess: () => void) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const submit = async (value = code) => {
    if (!/^\d{6}$/.test(value)) {
      setError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await action(value);
      onSuccess();
    } catch (e) {
      const msg = friendlyMessage(e);
      setError(/code/i.test(msg) ? CODE_ERROR : msg);
      setCode('');
      setBusy(false);
    }
  };
  const onChange = (v: string) => {
    setCode(v);
    if (error) setError(undefined);
  };
  return { code, error, busy, submit, onChange };
}

function VerifyFlow({ target }: { target: string }) {
  const finish = useFinish(target);
  const { user } = useAuth();
  const f = useCodeSubmit((c) => authService.verifyMfa(c), finish);
  return (
    <AuthLayout
      eyebrow="Two-step verification"
      title={
        <>
          <span className="font-light">Enter your</span> <span className="font-bold">code</span>
        </>
      }
      description={
        <>
          Open your authenticator app and enter the 6-digit code for <span className="font-medium text-ink-900">{user?.email}</span>.
        </>
      }
      footer={<SwitchAccount />}
    >
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit();
        }}
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <Smartphone className="size-7 animate-float" aria-hidden />
        </div>
        <CodeInput value={f.code} onChange={f.onChange} onComplete={(v) => void f.submit(v)} error={f.error} hint={`Demo code: ${DEMO_MFA_CODE}`} disabled={f.busy} autoFocus />
        <Button type="submit" size="lg" className="w-full" loading={f.busy} icon={<ShieldCheck className="size-4" aria-hidden />}>
          Verify
        </Button>
      </form>
    </AuthLayout>
  );
}

function EnrollFlow({ target }: { target: string }) {
  const finish = useFinish(target);
  const [step, setStep] = useState<1 | 2>(1);
  const [copied, setCopied] = useState(false);
  const secret = useQuery({ queryKey: ['auth', 'mfa-enroll'], queryFn: () => authService.startMfaEnrollment(), staleTime: Infinity, retry: false });
  const f = useCodeSubmit((c) => authService.confirmMfaEnrollment(c), finish);
  const grouped = secret.data?.secret.match(/.{1,4}/g)?.join(' ') ?? '';

  const copy = async () => {
    if (!secret.data) return;
    try {
      await navigator.clipboard.writeText(secret.data.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the key is visible to copy manually */
    }
  };

  return (
    <AuthLayout
      eyebrow={`Set up two-step verification · Step ${step} of 2`}
      title={
        step === 1 ? (
          <>
            <span className="font-light">Connect your</span> <span className="font-bold">authenticator</span>
          </>
        ) : (
          <>
            <span className="font-light">Confirm your</span> <span className="font-bold">code</span>
          </>
        )
      }
      description={
        step === 1
          ? 'Your role approves clinical or admin actions, so we protect it with a code from an app like Google Authenticator or 1Password.'
          : 'Enter the 6-digit code your app shows for RefillBridge.'
      }
      footer={<SwitchAccount />}
    >
      <ol className="mb-6 flex items-center gap-2" aria-label="Setup progress">
        {[1, 2].map((s) => (
          <li key={s} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-500', s <= step ? 'bg-brand-600' : 'bg-ice-300')}>
            <span className="sr-only">
              Step {s} {s < step ? 'done' : s === step ? 'current' : 'upcoming'}
            </span>
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait" initial={false}>
        {step === 1 ? (
          <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">
            {secret.isPending ? (
              <div className="flex flex-col items-center gap-3" role="status" aria-label="Preparing your key">
                <Skeleton className="size-40 rounded-xl" />
                <Skeleton className="h-5 w-48" />
              </div>
            ) : secret.isError ? (
              <p role="alert" className="text-sm text-bad-700">
                {friendlyMessage(secret.error)}
              </p>
            ) : (
              <>
                <figure className="flex flex-col items-center">
                  <FauxQr seed={secret.data.secret} />
                  <figcaption className="mt-3 text-[13px] font-medium text-ink-700">Scan with your authenticator app</figcaption>
                </figure>
                <div className="rounded-xl border border-line bg-ice-50 p-3.5">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-ink-500">Or enter this key</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <code className="break-all font-mono text-[15px] font-semibold tracking-[0.12em] text-brand-900" aria-label={`Setup key ${secret.data.secret.split('').join(' ')}`}>
                      {grouped}
                    </code>
                    <Button variant="ghost" size="sm" onClick={() => void copy()} icon={<Copy className="size-3.5" aria-hidden />}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
                <Button size="lg" className="w-full" onClick={() => setStep(2)} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  I've added it
                </Button>
              </>
            )}
          </motion.div>
        ) : (
          <motion.form
            key="s2"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            noValidate
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void f.submit();
            }}
          >
            <CodeInput value={f.code} onChange={f.onChange} onComplete={(v) => void f.submit(v)} error={f.error} hint={`Demo code: ${DEMO_MFA_CODE}`} disabled={f.busy} autoFocus />
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" size="lg" className="flex-1" loading={f.busy} icon={<KeyRound className="size-4" aria-hidden />}>
                Turn on verification
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}

/** Decorative QR-like grid generated deterministically from the secret (NOT a scannable code). */
function FauxQr({ seed }: { seed: string }) {
  const SIZE = 21;
  const cells = useMemo(() => {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rand = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };
    const inFinder = (r: number, c: number) => {
      const corners: [number, number][] = [
        [0, 0],
        [0, SIZE - 7],
        [SIZE - 7, 0],
      ];
      for (const [r0, c0] of corners) {
        if (r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7) {
          const rr = r - r0;
          const cc = c - c0;
          const ring = rr === 0 || rr === 6 || cc === 0 || cc === 6;
          const core = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
          return ring || core ? 1 : 0;
        }
        if (r >= r0 - 1 && r <= r0 + 7 && c >= c0 - 1 && c <= c0 + 7) return 0; // quiet separator
      }
      return -1;
    };
    return Array.from({ length: SIZE * SIZE }, (_, i) => {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      const f = inFinder(r, c);
      return f === -1 ? rand() > 0.52 : f === 1;
    });
  }, [seed]);
  return (
    <div className="rounded-2xl border border-line bg-white p-3 shadow-[var(--shadow-soft)]" aria-hidden>
      <div className="grid size-40 gap-px" style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}>
        {cells.map((on, i) => (
          <span key={i} className={cn('rounded-[1px]', on ? 'bg-brand-950' : 'bg-transparent')} />
        ))}
      </div>
    </div>
  );
}
