import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CheckCircle2, Circle, Clock, KeyRound, LogOut, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { z } from 'zod';
import { ROLE_LABELS } from '@shared/domain/permissions.ts';
import { PASSWORD_RULES, passwordIssues } from '@shared/schemas/index.ts';
import { MFA_REQUIRED_ROLES } from '@shared/types.ts';
import { useAuth } from '@/app/auth-context';
import { authService, friendlyMessage } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Card, CardHeader, KeyValue } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/format';
import { fadeUp, MfaBadge } from './components';

const changePasswordSchema = (ctx: { email: string; name: string }) =>
  z
    .object({
      current: z.string().min(1, 'Enter your current password'),
      password: z.string(),
      confirm: z.string().min(1, 'Confirm your new password'),
    })
    .superRefine((v, c) => {
      const issues = passwordIssues(v.password, ctx);
      if (issues.length) c.addIssue({ code: 'custom', path: ['password'], message: issues[0] });
      else if (v.password === v.current) c.addIssue({ code: 'custom', path: ['password'], message: 'Choose a password you have not used here' });
      if (v.confirm && v.password !== v.confirm) c.addIssue({ code: 'custom', path: ['confirm'], message: "Passwords don't match" });
    });
type ChangePasswordInput = z.infer<ReturnType<typeof changePasswordSchema>>;

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const required = MFA_REQUIRED_ROLES.includes(user.role);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <motion.div {...fadeUp(0)}>
          <Card>
            <CardHeader icon={<UserRound className="size-4" aria-hidden />} title="Your details" description="Ask your organisation's admin to change your role or email." />
            <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <KeyValue label="Name">{user.name}</KeyValue>
              <KeyValue label="Email">{user.email}</KeyValue>
              <KeyValue label="Role">{ROLE_LABELS[user.role]}</KeyValue>
              <KeyValue label="Title">{user.title || '—'}</KeyValue>
              <KeyValue label="Organisation">{user.orgName}</KeyValue>
              <KeyValue label="Organisation type">{user.orgType === 'practice' ? 'Physician practice' : 'Pharmacy'}</KeyValue>
            </dl>
          </Card>
        </motion.div>
        <motion.div {...fadeUp(1)}>
          <ChangePasswordCard email={user.email} name={user.name} />
        </motion.div>
      </div>

      <div className="space-y-5 lg:col-span-2">
        <motion.div {...fadeUp(2)}>
          <Card>
            <CardHeader icon={<ShieldCheck className="size-4" aria-hidden />} title="Two-factor authentication" description="A code from your authenticator app, on top of your password." />
            <div className="space-y-3 px-5 py-4">
              <MfaBadge enrolled={user.mfaEnrolled} verifiedNow={user.aal === 'aal2'} />
              {!user.mfaEnrolled && (
                <p className="text-sm text-ink-600">
                  {required
                    ? `Required for ${ROLE_LABELS[user.role].toLowerCase()}s. You'll be asked to set it up the next time you sign in.`
                    : 'Optional for your role, but recommended.'}
                </p>
              )}
              {user.mfaEnrolled && user.aal !== 'aal2' && <p className="text-sm text-ink-600">You'll be asked for a code before admin actions and clinical decisions.</p>}
            </div>
          </Card>
        </motion.div>
        <motion.div {...fadeUp(3)}>
          <Card>
            <CardHeader icon={<Clock className="size-4" aria-hidden />} title="Session" />
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-ink-600">Sessions end after 15 minutes idle or 12 hours total.</p>
              <Button variant="secondary" icon={<LogOut className="size-4" aria-hidden />} onClick={() => void signOut('manual')}>
                Sign out
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function ChangePasswordCard({ email, name }: { email: string; name: string }) {
  const toast = useToast();
  const schema = useMemo(() => changePasswordSchema({ email, name }), [email, name]);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: { current: '', password: '', confirm: '' } });
  const password = useWatch({ control, name: 'password' }) ?? '';
  const issues = passwordIssues(password, { email, name });
  const extraIssues = issues.filter((i) => !PASSWORD_RULES.some((r) => r.label === i));

  const mutation = useMutation({
    mutationFn: (v: ChangePasswordInput) => authService.changePassword(v.current, v.password),
    onSuccess: () => {
      toast.success("Password changed. You've been signed out on other devices.");
      reset();
    },
    onError: (err) => {
      const msg = friendlyMessage(err);
      if (/current password/i.test(msg)) setError('current', { message: msg });
      else toast.error("Couldn't change your password", msg);
    },
  });

  return (
    <Card>
      <CardHeader icon={<KeyRound className="size-4" aria-hidden />} title="Change password" description="Changing it signs you out everywhere else." />
      <form className="space-y-4 px-5 py-4" noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))}>
        {/* Hidden username helps password managers pair the new password with this account. */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <Input label="Current password" type="password" autoComplete="current-password" required error={errors.current?.message} {...register('current')} />
        <Input
          id="new-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.password?.message}
          {...register('password')}
          aria-describedby={errors.password ? 'new-password-error password-rules' : 'password-rules'}
        />
        <ul id="password-rules" className="grid gap-1.5 rounded-lg bg-ice-50 px-3 py-2.5 sm:grid-cols-2" aria-label="Password requirements">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(password);
            return (
              <li key={r.id} className={cn('flex items-center gap-1.5 text-[12.5px]', ok ? 'text-ok-700' : 'text-ink-500')}>
                {ok ? <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> : <Circle className="size-3.5 shrink-0" aria-hidden />}
                {r.label}
                <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
              </li>
            );
          })}
          {password.length > 0 &&
            extraIssues.map((i) => (
              <li key={i} className="flex items-center gap-1.5 text-[12.5px] text-bad-700 sm:col-span-2">
                <XCircle className="size-3.5 shrink-0" aria-hidden />
                {i}
              </li>
            ))}
        </ul>
        <Input label="Confirm new password" type="password" autoComplete="new-password" required error={errors.confirm?.message} {...register('confirm')} />
        <div className="flex justify-end">
          <Button type="submit" loading={mutation.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
