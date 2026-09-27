import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Ban, Building2, CheckCircle2, Handshake, Hourglass, Info, Link2Off, MapPin, Plus, Stethoscope } from 'lucide-react';
import { z } from 'zod';
import type { PharmacyLink } from '@shared/dto.ts';
import { useAuth } from '@/app/auth-context';
import { ApiError, friendlyMessage, refillService } from '@/services';
import { Badge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { Callout, ConfirmModal, fadeUp, SectionHeader } from './components';

const invitePharmacySchema = z.object({
  name: z.string().trim().min(2, 'Enter the pharmacy name').max(120),
  email: z.string().trim().min(1, "Enter the pharmacy's email").email('Enter a valid email'),
});
type InvitePharmacyInput = z.infer<typeof invitePharmacySchema>;

const ic = 'size-3.5 shrink-0';
export function LinkStatusBadge({ status }: { status: PharmacyLink['status'] }) {
  if (status === 'active')
    return (
      <Badge tone="ok" icon={<CheckCircle2 className={ic} aria-hidden />}>
        Active
      </Badge>
    );
  if (status === 'pending')
    return (
      <Badge tone="warn" icon={<Hourglass className={ic} aria-hidden />}>
        Pending
      </Badge>
    );
  return (
    <Badge tone="muted" icon={<Ban className={ic} aria-hidden />}>
      Revoked
    </Badge>
  );
}

export default function PharmaciesPage() {
  const { user, runWithStepUp } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const isPractice = user?.role === 'practice_admin';
  const [inviteOpen, setInviteOpen] = useState(false);
  const [unlinking, setUnlinking] = useState<PharmacyLink | null>(null);

  const links = useQuery({ queryKey: ['pharmacy-links'], queryFn: () => refillService.listPharmacyLinks() });

  const onError = (title: string) => (err: unknown) => toast.error(title, friendlyMessage(err), err instanceof ApiError ? err.requestId : undefined);

  const update = useMutation({
    mutationFn: ({ link, status }: { link: PharmacyLink; status: PharmacyLink['status'] }) => runWithStepUp(() => refillService.updatePharmacyLink(link.id, status)),
    onSuccess: (l) => {
      if (l.status === 'active') toast.success('Link accepted', `You can now send refill requests to ${l.practiceName}.`);
      else toast.success('Pharmacy unlinked', `${l.pharmacyName} can no longer send new requests.`);
      void qc.invalidateQueries({ queryKey: ['pharmacy-links'] });
    },
    onError: onError("Couldn't update the link"),
    onSettled: () => setUnlinking(null),
  });

  const counterpart = (l: PharmacyLink) => (isPractice ? l.pharmacyName : l.practiceName);
  const list = [...(links.data ?? [])].sort((a, b) => order(a.status) - order(b.status));

  const inviteButton = isPractice ? (
    <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setInviteOpen(true)}>
      Invite a pharmacy
    </Button>
  ) : null;

  return (
    <div>
      <SectionHeader
        title={isPractice ? 'Linked pharmacies' : 'Linked practices'}
        description={isPractice ? 'Pharmacies that can send your practice refill requests.' : 'Practices your pharmacy can send refill requests to.'}
        action={inviteButton}
      />
      <Callout icon={<Info className="size-4" />} tone="brand" className="mb-5">
        Pharmacies join free and can only send requests to practices they're linked with.
        {!isPractice && ' A practice admin sends the invite; you accept it here.'}
      </Callout>

      {links.isPending ? (
        <SkeletonRows rows={3} />
      ) : links.isError ? (
        <ErrorState title={isPractice ? "Couldn't load your pharmacies" : "Couldn't load your practices"} error={links.error} onRetry={() => void links.refetch()} />
      ) : list.length === 0 ? (
        isPractice ? (
          <EmptyState icon={<Building2 className="size-6" aria-hidden />} title="No linked pharmacies yet" description="Invite the pharmacies you work with most. They'll appear here as pending until they accept." action={inviteButton} />
        ) : (
          <EmptyState icon={<Stethoscope className="size-6" aria-hidden />} title="No practices linked yet" description="Ask the practices you work with to invite your pharmacy from their RefillBridge settings." />
        )
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={isPractice ? 'Linked pharmacies' : 'Linked practices'}>
          {list.map((l, i) => (
            <motion.li key={l.id} {...fadeUp(i + 1)} className="surface flex flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-hidden>
                    {isPractice ? <Building2 className="size-5" /> : <Stethoscope className="size-5" />}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold text-ink-900">{counterpart(l)}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-500">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {l.city && l.city !== '—' ? l.city : 'Location not set yet'}
                    </p>
                  </div>
                </div>
                <LinkStatusBadge status={l.status} />
              </div>
              <dl className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px]">
                <div>
                  <dt className="text-ink-500">Cases, last 30 days</dt>
                  <dd className="text-lg font-semibold tabular-nums text-ink-900">{l.casesLast30d}</dd>
                </div>
                {isPractice && l.status !== 'revoked' && (
                  <Button variant="ghost" size="sm" icon={<Link2Off className="size-4" aria-hidden />} aria-label={`Unlink ${l.pharmacyName}`} onClick={() => setUnlinking(l)}>
                    Unlink
                  </Button>
                )}
                {!isPractice && l.status === 'pending' && (
                  <Button
                    variant="success"
                    size="sm"
                    icon={<Handshake className="size-4" aria-hidden />}
                    aria-label={`Accept link with ${l.practiceName}`}
                    loading={update.isPending && update.variables?.link.id === l.id}
                    onClick={() => update.mutate({ link: l, status: 'active' })}
                  >
                    Accept
                  </Button>
                )}
              </dl>
              {isPractice && l.status === 'pending' && <p className="mt-2 text-[12.5px] text-ink-500">Waiting for the pharmacy admin to accept.</p>}
            </motion.li>
          ))}
        </ul>
      )}

      {isPractice && <InvitePharmacyModal open={inviteOpen} onClose={() => setInviteOpen(false)} />}

      <ConfirmModal
        open={unlinking !== null}
        onClose={() => setUnlinking(null)}
        onConfirm={() => unlinking && update.mutate({ link: unlinking, status: 'revoked' })}
        loading={update.isPending}
        tone="danger"
        icon={<Link2Off className="size-5" aria-hidden />}
        title={unlinking ? `Unlink ${unlinking.pharmacyName}?` : 'Unlink pharmacy?'}
        confirmLabel="Unlink"
      >
        <p className="text-sm text-ink-600">They can't send new refill requests to your practice. Open cases stay visible and keep their history.</p>
      </ConfirmModal>
    </div>
  );
}

function order(s: PharmacyLink['status']) {
  return s === 'pending' ? 0 : s === 'active' ? 1 : 2;
}

function InvitePharmacyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { runWithStepUp } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InvitePharmacyInput>({ resolver: zodResolver(invitePharmacySchema), mode: 'onTouched', defaultValues: { name: '', email: '' } });

  const mutation = useMutation({
    mutationFn: (v: InvitePharmacyInput) => runWithStepUp(() => refillService.invitePharmacy(v.name, v.email)),
    onSuccess: (l) => {
      toast.success('Invite sent', `${l.pharmacyName} shows as pending until they accept.`);
      void qc.invalidateQueries({ queryKey: ['pharmacy-links'] });
      reset();
      onClose();
    },
    onError: (err) => toast.error("Couldn't invite the pharmacy", friendlyMessage(err), err instanceof ApiError ? err.requestId : undefined),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a pharmacy"
      description="We'll invite their admin to join RefillBridge free and link with your practice."
      icon={<Building2 className="size-5" aria-hidden />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite-pharmacy-form" loading={mutation.isPending}>
            Send invite
          </Button>
        </>
      }
    >
      <form id="invite-pharmacy-form" className="space-y-4" noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))}>
        <Input label="Pharmacy name" required autoComplete="organization" data-autofocus error={errors.name?.message} {...register('name')} />
        <Input label="Pharmacy admin email" type="email" required autoComplete="off" placeholder="manager@pharmacy.example.com" error={errors.email?.message} {...register('email')} />
      </form>
    </Modal>
  );
}
