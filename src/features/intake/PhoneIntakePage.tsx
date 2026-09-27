import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { friendlyMessage, refillService } from '@/services';
import { ApiError } from '@/services/errors';
import { useAuth } from '@/app/auth-context';
import { PageHeader } from '@/components/ui/Layout';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { useIdempotencyKey } from '@/lib/hooks';
import { RequestForm, type RequestFormValues } from './RequestForm';
import { Building2 } from 'lucide-react';

/** Practice phone intake: staff log a patient's phone request as a case (§4.3 channel 4). */
export default function PhoneIntakePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [key, renewKey] = useIdempotencyKey();
  const orgs = useQuery({ queryKey: ['linked-orgs'], queryFn: () => refillService.listLinkedOrgs() });
  const create = useMutation({
    mutationFn: (v: RequestFormValues) => {
      const { targetOrgId: _t, ...payload } = v;
      return refillService.createCase({ source: 'phone', practiceOrgId: user!.orgId, payload }, key);
    },
    onSuccess: (d) => {
      renewKey();
      toast.success(`Case ${d.case.caseNumber} created`, 'Triage ran automatically.');
      navigate(`/cases/${d.case.id}`);
    },
    onError: (e) => toast.error("Couldn't create the case", friendlyMessage(e), e instanceof ApiError ? e.requestId : undefined),
  });

  return (
    <div>
      <Link to="/queue" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700">
        <ArrowLeft className="size-4" /> Back to queue
      </Link>
      <PageHeader
        eyebrow="Phone intake"
        title={
          <>
            <span className="font-light">Log a</span> <span className="font-bold">phone request</span>
          </>
        }
        description="A patient called asking for a refill. Capture it once — RefillBridge matches the patient, runs the rules and routes it."
      />
      {orgs.isLoading ? (
        <SkeletonRows rows={3} />
      ) : orgs.isError ? (
        <ErrorState error={orgs.error} onRetry={() => orgs.refetch()} />
      ) : (orgs.data ?? []).length === 0 ? (
        <EmptyState icon={<Building2 className="size-6" />} title="No linked pharmacies yet" description="Link the patient's pharmacy first so the approval has somewhere to go." action={<Link to="/settings/pharmacies"><Button>Invite your pharmacy</Button></Link>} />
      ) : (
        <div className="max-w-3xl">
          <RequestForm mode="phone" orgs={orgs.data!} submitting={create.isPending} onSubmit={(v) => create.mutate(v)} />
        </div>
      )}
    </div>
  );
}
