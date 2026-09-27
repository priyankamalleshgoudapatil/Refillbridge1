import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { ArrowLeft, ExternalLink, Mail, MailCheck } from 'lucide-react';
import { forgotPasswordSchema } from '@shared/schemas/index.ts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { authService, friendlyMessage } from '@/services';
import { AuthLayout } from './AuthLayout';
import { FormAlert, ResultPanel } from './auth-shared';

type FormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [done, setDone] = useState<{ message: string; demoResetToken?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(forgotPasswordSchema), mode: 'onBlur', defaultValues: { email: '' } });

  const onSubmit = async ({ email }: FormValues) => {
    setFormError(null);
    try {
      setDone(await authService.forgotPassword(email));
    } catch (e) {
      setFormError(friendlyMessage(e));
    }
  };

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title={
        <>
          <span className="font-light">Reset your</span> <span className="font-bold">password</span>
        </>
      }
      description={done ? undefined : "Enter your work email and we'll send you a secure link."}
      footer={
        <Link to="/sign-in" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 underline-offset-2 hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <ResultPanel icon={<MailCheck className="size-7" aria-hidden />} title="Check your inbox">
          <p>{done.message}</p>
          <p className="mt-1 text-[12.5px] text-ink-500">The link works once and expires in 30 minutes.</p>
          {done.demoResetToken && (
            <div className="mt-5 rounded-xl border border-dashed border-brand-300 bg-brand-50/70 p-3.5 text-left">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">Demo shortcut</p>
              <p className="mt-1 text-[13px] text-ink-600">No real email is sent in the demo.</p>
              <Link to={`/reset-password?token=${encodeURIComponent(done.demoResetToken)}`} className="mt-3 block">
                <Button variant="subtle" className="w-full" iconRight={<ExternalLink className="size-4" aria-hidden />}>
                  Demo: open reset link
                </Button>
              </Link>
            </div>
          )}
        </ResultPanel>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <FormAlert tone="error">{formError}</FormAlert>}
          <Input label="Email" type="email" autoComplete="email" inputMode="email" leading={<Mail className="size-4" />} error={errors.email?.message} {...register('email')} />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
