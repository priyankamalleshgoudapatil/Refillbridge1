import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'motion/react';
import { ArrowRight, KeyRound, LogIn, Mail, UserRound } from 'lucide-react';
import { homeRouteFor, ROLE_LABELS } from '@shared/domain/permissions.ts';
import { signInSchema, type SignInInput } from '@shared/schemas/index.ts';
import { MFA_REQUIRED_ROLES } from '@shared/types.ts';
import { useAuth } from '@/app/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ApiError, authService, friendlyMessage } from '@/services';
import { DEMO_MFA_CODE, DEMO_PASSWORD, ORGS, USERS, type UserFixture } from '@/mocks/data/fixtures';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from './AuthLayout';
import { FormAlert, PasswordInput, safeNext } from './auth-shared';

const BANNERS: { param: string; value: string; tone: 'info' | 'success' | 'warning'; text: string }[] = [
  { param: 'reason', value: 'idle', tone: 'info', text: 'You were signed out after 15 minutes of inactivity.' },
  { param: 'reason', value: 'removed', tone: 'warning', text: 'Your access was removed. Contact your admin.' },
  { param: 'verified', value: '1', tone: 'success', text: 'Email verified — you can sign in now.' },
  { param: 'reset', value: '1', tone: 'success', text: 'Password updated. Sign in with your new password.' },
];

const orgName = (id: string) => ORGS.find((o) => o.id === id)?.name ?? '';
const initials = (name: string) =>
  name
    .replace(/^Dr\.\s*/, '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

export default function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const next = safeNext(params.get('next'));

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), mode: 'onBlur', defaultValues: { email: '', password: '' } });

  const fillDemo = (email: string) => {
    setFormError(null);
    setValue('email', email, { shouldValidate: true, shouldDirty: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true, shouldDirty: true });
  };

  useEffect(() => {
    const prefill = sessionStorage.getItem('prefill_email');
    if (prefill) {
      sessionStorage.removeItem('prefill_email');
      fillDemo(prefill);
    }
  }, []);

  // Already signed in (and past any required MFA) → go straight to work.
  if (user && (!MFA_REQUIRED_ROLES.includes(user.role) || user.aal === 'aal2')) {
    return <Navigate to={next ?? homeRouteFor(user.role)} replace />;
  }

  const onSubmit = async (values: SignInInput) => {
    setFormError(null);
    try {
      const result = await authService.signIn(values.email, values.password);
      if (result.status === 'signed_in') {
        refresh();
        const me = authService.currentUser();
        navigate(next ?? (me ? homeRouteFor(me.role) : '/'), { replace: true });
        return;
      }
      const mode = result.status === 'mfa_enroll' ? 'enroll' : 'verify';
      const qs = new URLSearchParams();
      if (next) qs.set('next', next);
      qs.set('mode', mode);
      navigate(`/mfa?${qs.toString()}`, { replace: true });
    } catch (e) {
      setFormError(e instanceof ApiError && e.code === 'UNAUTHENTICATED' ? 'Invalid email or password.' : friendlyMessage(e));
    }
  };

  const banners = BANNERS.filter((b) => params.get(b.param) === b.value);

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title={
        <>
          <span className="font-light">Sign</span> <span className="font-bold">in</span>
        </>
      }
      description="Pick up exactly where your team left off."
      footer={
        <>
          New organisation?{' '}
          <Link to="/sign-up" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Create an account
          </Link>
        </>
      }
      below={<DemoAccounts onPick={fillDemo} />}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {banners.map((b) => (
          <FormAlert key={b.text} tone={b.tone}>
            {b.text}
          </FormAlert>
        ))}
        {formError && <FormAlert tone="error">{formError}</FormAlert>}
        <Input label="Email" type="email" autoComplete="email" inputMode="email" leading={<Mail className="size-4" />} error={errors.email?.message} {...register('email')} />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          labelAction={
            <Link to="/forgot-password" className="text-[12.5px] font-medium text-brand-700 underline-offset-2 hover:underline">
              Forgot password?
            </Link>
          }
          {...register('password')}
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} icon={<LogIn className="size-4" aria-hidden />}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

const ROLE_GROUPS = [
  {
    id: 'practice',
    title: 'Practice Team',
    badge: 'Admin & Staff',
    roles: ['practice_admin', 'practice_staff'],
  },
  {
    id: 'providers',
    title: 'Providers',
    badge: 'Prescribers',
    roles: ['provider'],
  },
  {
    id: 'pharmacy',
    title: 'Pharmacy',
    badge: 'Dispense & Staff',
    roles: ['pharmacy_admin', 'pharmacy_staff'],
  },
] as const;

function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const [users, setUsers] = useState<UserFixture[]>(USERS);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    let active = true;
    supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data && data.length > 0 && active) {
          setUsers(
            data.map((u) => ({
              id: u.id,
              key: u.key,
              name: u.name,
              email: u.email,
              role: u.role,
              orgId: u.org_id,
              title: u.title,
              mfaEnrolled: Boolean(u.mfa_enrolled),
            }))
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section aria-labelledby="demo-accounts" className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-[var(--shadow-lift)] backdrop-blur-md sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/70 pb-3">
        <div>
          <h2 id="demo-accounts" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-700">
            Demo accounts
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Click an account to fill the form. Password: <span className="font-mono font-medium text-ink-700">{DEMO_PASSWORD}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-white/90 px-2.5 py-1 text-[12px] text-ink-600 shadow-xs">
          <KeyRound className="size-3.5 text-brand-600" aria-hidden />
          <span>MFA code:</span> <span className="font-mono font-bold text-brand-800">{DEMO_MFA_CODE}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-3">
        {ROLE_GROUPS.map((group) => {
          const groupUsers = users.filter((u) => (group.roles as readonly string[]).includes(u.role));
          return (
            <div key={group.id} className="flex flex-col rounded-xl border border-line/80 bg-white/60 p-2.5 sm:p-3 shadow-xs">
              <div className="mb-2 flex items-center justify-between border-b border-line/60 pb-1.5 px-0.5">
                <h3 className="text-[12px] font-bold text-brand-900 tracking-wide">{group.title}</h3>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                  {group.badge}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {groupUsers.map((u, i) => (
                  <motion.li
                    key={u.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + i * 0.03 }}
                  >
                    <button
                      type="button"
                      onClick={() => onPick(u.email)}
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent bg-white/80 p-2 text-left transition-all hover:-translate-y-px hover:border-brand-200 hover:bg-white hover:shadow-[var(--shadow-soft)] focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                    >
                      <span
                        className="flex size-7.5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800 ring-1 ring-brand-200/60"
                        aria-hidden
                      >
                        {initials(u.name) || <UserRound className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink-900 group-hover:text-brand-800">
                          {u.name}
                        </span>
                        <span className="block truncate text-[11px] text-ink-500">
                          {ROLE_LABELS[u.role]} · {orgName(u.orgId)}
                        </span>
                      </span>
                      <ArrowRight
                        className="size-3.5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                        aria-hidden
                      />
                    </button>
                  </motion.li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
