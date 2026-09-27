import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MailCheck, MailX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/States';
import { authService, friendlyMessage } from '@/services';
import { AuthLayout } from './AuthLayout';
import { ResultPanel } from './auth-shared';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const email = params.get('email')?.trim() ?? '';

  const verify = useQuery({
    queryKey: ['auth', 'verify-email', email],
    queryFn: async () => {
      await authService.verifyEmail(email);
      return true;
    },
    enabled: email.length > 0,
    retry: false,
    staleTime: Infinity,
  });

  return (
    <AuthLayout
      eyebrow="Email verification"
      title={
        <>
          <span className="font-light">Verify your</span> <span className="font-bold">email</span>
        </>
      }
    >
      {!email ? (
        <ResultPanel tone="bad" icon={<MailX className="size-7" aria-hidden />} title="This link is incomplete">
          <p>We couldn't find an email address in this link. Open the newest link from your inbox, or sign up again.</p>
          <Link to="/sign-up" className="mt-5 block">
            <Button variant="secondary" className="w-full">
              Back to sign up
            </Button>
          </Link>
        </ResultPanel>
      ) : verify.isPending ? (
        <div className="flex flex-col items-center gap-3 py-8 text-sm text-ink-600">
          <Spinner className="size-6" />
          Verifying {email}…
        </div>
      ) : verify.isError ? (
        <ResultPanel tone="bad" icon={<MailX className="size-7" aria-hidden />} title="We couldn't verify this email">
          <p>{friendlyMessage(verify.error)}</p>
          <Button variant="secondary" className="mt-5 w-full" onClick={() => void verify.refetch()}>
            Try again
          </Button>
        </ResultPanel>
      ) : (
        <ResultPanel icon={<MailCheck className="size-7" aria-hidden />} title="Email verified">
          <p>
            Thanks — <span className="font-medium text-ink-900">{email}</span> is confirmed. You can sign in now.
          </p>
          <Link to="/sign-in?verified=1" className="mt-5 block">
            <Button size="lg" className="w-full" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Continue to sign in
            </Button>
          </Link>
        </ResultPanel>
      )}
    </AuthLayout>
  );
}
