import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Mail, MailX, ShieldCheck, UserRound } from 'lucide-react';
import { ROLE_LABELS } from '@shared/domain/permissions.ts';
import { passwordIssues } from '@shared/schemas/index.ts';
import { MFA_REQUIRED_ROLES, type Role } from '@shared/types.ts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { authService, friendlyMessage } from '@/services';
import { AuthLayout } from './AuthLayout';
import { FormAlert, PasswordChecklist, PasswordInput, ResultPanel } from './auth-shared';

const EXPIRED = 'This invite has expired. Ask your admin to send a new one.';

const makeSchema = (email: string) =>
  z
    .object({ name: z.string().trim().min(2, 'Enter your full name').max(120), password: z.string(), confirm: z.string() })
    .superRefine((v, c) => {
      const issues = passwordIssues(v.password, { email, name: v.name });
      if (issues.length) c.addIssue({ code: 'custom', path: ['password'], message: issues[0] });
      if (v.password !== v.confirm) c.addIssue({ code: 'custom', path: ['confirm'], message: "Passwords don't match" });
    });
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const invite = useQuery({
    queryKey: ['auth', 'invite', token],
    queryFn: () => authService.getInvite(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });

  let body;
  if (!token || invite.isError) {
    body = (
      <ResultPanel tone="bad" icon={<MailX className="size-7" aria-hidden />} title="Invite not available">
        <p>{invite.isError ? friendlyMessage(invite.error) : EXPIRED}</p>
        <Link to="/sign-in" className="mt-5 block">
          <Button variant="secondary" className="w-full">
            Go to sign in
          </Button>
        </Link>
      </ResultPanel>
    );
  } else if (invite.isPending) {
    body = (
      <div className="space-y-4" role="status" aria-label="Loading invite">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <span className="sr-only">Loading invite…</span>
      </div>
    );
  } else {
    body = <InviteForm token={token} {...invite.data} />;
  }

  return (
    <AuthLayout
      eyebrow="You're invited"
      title={
        <>
          <span className="font-light">Join your</span> <span className="font-bold">team</span>
        </>
      }
    >
      {body}
    </AuthLayout>
  );
}

function InviteForm({ token, email, role, orgName }: { token: string; email: string; role: Role; orgName: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const schema = useMemo(() => makeSchema(email), [email]);
  const needsMfa = MFA_REQUIRED_ROLES.includes(role);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: { name: '', password: '', confirm: '' } });
  const [password, name] = watch(['password', 'name']);

  const onSubmit = async (v: FormValues) => {
    setFormError(null);
    try {
      await authService.acceptInvite(token, v.name.trim(), v.password);
      toast.success('Account created — sign in to continue', needsMfa ? "After signing in you'll set up an authenticator app." : undefined);
      navigate('/sign-in', { replace: true });
    } catch (e) {
      setFormError(friendlyMessage(e));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/70 p-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm">
          <Building2 className="size-[18px]" aria-hidden />
        </span>
        <p className="text-[14px] text-ink-700">
          Join <span className="font-semibold text-brand-900">{orgName}</span> as <span className="font-semibold text-brand-900">{ROLE_LABELS[role]}</span>
        </p>
      </div>
      {formError && <FormAlert tone="error">{formError}</FormAlert>}
      <Input label="Email" value={email} readOnly aria-readonly="true" leading={<Mail className="size-4" />} className="bg-ice-50 text-ink-600" hint="Invites are tied to this address." />
      <Input label="Full name" autoComplete="name" leading={<UserRound className="size-4" />} error={errors.name?.message} {...register('name')} />
      <PasswordInput label="Password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
      <PasswordChecklist password={password} email={email} name={name} />
      <PasswordInput label="Confirm password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
      {needsMfa && (
        <p className="flex items-start gap-2 text-[12.5px] text-ink-600">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          Your role makes clinical or admin decisions, so you'll set up an authenticator app after your first sign-in.
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Create my account
      </Button>
    </form>
  );
}
