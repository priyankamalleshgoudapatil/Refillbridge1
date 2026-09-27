import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LinkIcon } from 'lucide-react';
import { setPasswordSchema } from '@shared/schemas/index.ts';
import { Button } from '@/components/ui/Button';
import { ApiError, authService, friendlyMessage } from '@/services';
import { AuthLayout } from './AuthLayout';
import { FormAlert, PasswordChecklist, PasswordInput, ResultPanel } from './auth-shared';

interface FormValues {
  password: string;
  confirm: string;
}

function InvalidLink({ message }: { message: string }) {
  return (
    <ResultPanel tone="bad" icon={<LinkIcon className="size-7" aria-hidden />} title="This reset link can't be used">
      <p>{message}</p>
      <Link to="/forgot-password" className="mt-5 block">
        <Button className="w-full">Request a new link</Button>
      </Link>
    </ResultPanel>
  );
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [linkError, setLinkError] = useState<string | null>(token ? null : 'This link is missing its security code. Request a new one.');
  const [formError, setFormError] = useState<string | null>(null);
  const schema = useMemo(() => setPasswordSchema({}), []);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: { password: '', confirm: '' } });
  const password = watch('password');

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await authService.resetPassword(token, values.password);
      navigate('/sign-in?reset=1', { replace: true });
    } catch (e) {
      const msg = friendlyMessage(e);
      if (e instanceof ApiError && /expired|invalid/i.test(e.message)) setLinkError(msg);
      else setFormError(msg);
    }
  };

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title={
        <>
          <span className="font-light">Choose a new</span> <span className="font-bold">password</span>
        </>
      }
      description={linkError ? undefined : 'Signing in again will be required on all your devices.'}
    >
      {linkError ? (
        <InvalidLink message={linkError} />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <FormAlert tone="error">{formError}</FormAlert>}
          <PasswordInput label="New password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
          <PasswordChecklist password={password} />
          <PasswordInput label="Confirm new password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
