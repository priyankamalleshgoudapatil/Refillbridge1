import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, CheckCircle2, FilePenLine, Lock, ShieldAlert, ShieldCheck, Signature, XCircle } from 'lucide-react';
import type { PracticeCaseDetail } from '@shared/dto.ts';
import { orderConfirmationHash } from '@shared/domain/confirmation.ts';
import { decisionSchema, type DecisionInput } from '@shared/schemas/index.ts';
import type { DecisionType } from '@shared/types.ts';
import { ApiError } from '@/services/errors';
import { friendlyMessage } from '@/services';
import { useAuth } from '@/app/auth-context';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { cn, formatDob } from '@/lib/format';
import { useIdempotencyKey } from '@/lib/hooks';
import { useTransition } from '@/features/cases/hooks';

const DECISIONS: { value: DecisionType; label: string; description: string; icon: React.ReactNode; tone: string }[] = [
  { value: 'APPROVE', label: 'Approve', description: 'Renew as prescribed.', icon: <CheckCircle2 className="size-5" />, tone: 'text-ok-600' },
  { value: 'APPROVE_MODIFIED', label: 'Approve with changes', description: 'Change strength, quantity or refills.', icon: <FilePenLine className="size-5" />, tone: 'text-brand-600' },
  { value: 'APPROVE_BRIDGE_REQUIRE_VISIT', label: 'Bridge supply + visit', description: 'Short supply now, visit before the next refill.', icon: <CalendarClock className="size-5" />, tone: 'text-info-600' },
  { value: 'REQUIRE_VISIT', label: 'Require a visit first', description: 'No refill until the patient is seen.', icon: <CalendarClock className="size-5" />, tone: 'text-warn-600' },
  { value: 'DENY', label: 'Do not approve', description: 'Reason and patient next step required.', icon: <XCircle className="size-5" />, tone: 'text-bad-600' },
];

const DENY_REASONS = [
  ['needs_alternative_therapy', 'Needs an alternative therapy'],
  ['no_longer_indicated', 'No longer indicated'],
  ['safety_concern', 'Safety concern'],
  ['not_our_patient', 'Not our patient'],
  ['other', 'Other'],
] as const;

export function DecisionPanel({ detail, maxBridgeDays = 30, onDecided }: { detail: PracticeCaseDetail; maxBridgeDays?: number; onDecided?: () => void }) {
  const rx = detail.prescription;
  const req = detail.case.requestedPayload;
  const { user } = useAuth();
  const toast = useToast();
  const transition = useTransition(detail.case.id);
  const [key, renewKey] = useIdempotencyKey();
  const [review, setReview] = useState<DecisionInput | null>(null);

  const defaults: DecisionInput = useMemo(
    () => ({
      decision: 'APPROVE',
      medicationName: rx?.medicationName ?? req.medicationName,
      strength: rx?.strength ?? req.strength,
      quantity: rx?.quantity ?? req.quantity ?? 30,
      daysSupply: rx?.daysSupply ?? 30,
      refills: rx?.controlledSchedule === 'II' ? 0 : 3,
      bridgeDays: Math.min(30, maxBridgeDays),
      reasonCode: undefined,
      patientNextStep: '',
      note: '',
    }),
    [rx, req, maxBridgeDays],
  );
  const form = useForm<DecisionInput>({ resolver: zodResolver(decisionSchema), mode: 'onBlur', defaultValues: defaults });
  useEffect(() => form.reset(defaults), [defaults, form]);
  const decision = useWatch({ control: form.control, name: 'decision' });
  const bridgeDays = useWatch({ control: form.control, name: 'bridgeDays' });
  const errors = form.formState.errors;
  const editable = decision === 'APPROVE_MODIFIED';
  const showOrder = decision === 'APPROVE' || decision === 'APPROVE_MODIFIED' || decision === 'APPROVE_BRIDGE_REQUIRE_VISIT';

  // Bridge: derive quantity/days from the bridge length.
  useEffect(() => {
    if (decision === 'APPROVE_BRIDGE_REQUIRE_VISIT' && rx) {
      const days = Number(bridgeDays) || 0;
      form.setValue('daysSupply', days || 1);
      form.setValue('quantity', Math.max(1, Math.round((rx.quantity / rx.daysSupply) * days)));
      form.setValue('refills', 0);
    } else if (decision === 'APPROVE' && rx) {
      form.setValue('medicationName', rx.medicationName);
      form.setValue('strength', rx.strength);
      form.setValue('quantity', rx.quantity);
      form.setValue('daysSupply', rx.daysSupply);
    }
  }, [decision, bridgeDays, rx, form]);

  const openReview = form.handleSubmit((v) => {
    if (v.decision === 'APPROVE_BRIDGE_REQUIRE_VISIT' && (v.bridgeDays ?? 0) > maxBridgeDays) {
      form.setError('bridgeDays', { message: `The maximum bridge supply is ${maxBridgeDays} days.` });
      return;
    }
    setReview(v);
  });

  const confirm = async () => {
    if (!review) return;
    const bridge = review.decision === 'APPROVE_BRIDGE_REQUIRE_VISIT' ? (review.bridgeDays ?? null) : null;
    const confirmationHash = orderConfirmationHash({
      caseId: detail.case.id,
      patientId: detail.patient?.id ?? '',
      decision: review.decision,
      medicationName: review.medicationName,
      strength: review.strength,
      quantity: review.quantity,
      daysSupply: review.daysSupply,
      refills: review.refills,
      bridgeDays: bridge,
      pharmacyId: detail.case.pharmacyOrgId,
    });
    const payload = { ...review, bridgeDays: bridge ?? undefined, confirmationHash };
    try {
      await transition.mutateAsync({ input: { action: 'DECIDE', version: detail.case.version, payload }, key });
      renewKey();
      setReview(null);
      const msg: Record<DecisionType, string> = {
        APPROVE: `Approved — sending to ${detail.pharmacy.name}`,
        APPROVE_MODIFIED: `Approved with changes — sending to ${detail.pharmacy.name}`,
        APPROVE_BRIDGE_REQUIRE_VISIT: 'Bridge approved — visit task created for staff',
        REQUIRE_VISIT: 'Visit required — the patient will be asked to book',
        DENY: 'Not approved — pharmacy and patient will be told the next step',
      };
      toast.success(msg[review.decision], 'The patient gets a plain-language update automatically.');
      onDecided?.();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') {
        toast.error('Please review the order', friendlyMessage(e));
        setReview(null);
      } else if (e instanceof ApiError && (e.code === 'CONFLICT' || e.code === 'INVALID_TRANSITION')) {
        setReview(null);
      }
    }
  };

  if (user?.role !== 'provider') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-ice-50 p-4 text-sm text-ink-600">
        <Lock className="size-4" /> Only providers can make clinical decisions.
      </div>
    );
  }
  const controlled = rx?.controlledSchedule;
  return (
    <section aria-labelledby="decide" className="surface overflow-hidden">
      <div className="border-b border-line bg-gradient-to-r from-brand-50 to-white px-5 py-4">
        <h2 id="decide" className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
          <Signature className="size-4 text-brand-600" /> Your decision
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-500">You'll review the full order before it's signed. MFA is required.</p>
      </div>
      <form onSubmit={openReview} className="space-y-5 p-5" noValidate>
        {controlled && (
          <div role="alert" className="flex gap-2.5 rounded-lg border border-bad-600/25 bg-bad-50 p-3 text-[13px] text-bad-700">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Schedule {controlled} controlled substance. No AI suggestions.{' '}
              {controlled === 'II' ? 'Schedule II cannot be refilled — approving issues a new prescription with 0 refills.' : 'Check your state PDMP before approving.'}
            </p>
          </div>
        )}
        <fieldset>
          <legend className="sr-only">Decision</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DECISIONS.map((d) => {
              const active = decision === d.value;
              return (
                <label
                  key={d.value}
                  className={cn(
                    'relative flex cursor-pointer gap-3 rounded-xl border bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]',
                    active ? 'border-brand-500 ring-2 ring-brand-200' : 'border-line hover:border-brand-300',
                    d.value === 'DENY' && 'sm:col-span-2',
                  )}
                >
                  <input type="radio" value={d.value} {...form.register('decision')} className="sr-only" />
                  <span className={cn('mt-0.5', d.tone)}>{d.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-900">{d.label}</span>
                    <span className="block text-[12.5px] text-ink-500">{d.description}</span>
                  </span>
                  {active && <motion.span layoutId="decision-dot" className="absolute right-3 top-3 size-2.5 rounded-full bg-brand-600" />}
                </label>
              );
            })}
          </div>
        </fieldset>

        <AnimatePresence mode="wait">
          <motion.div key={decision} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-4">
            {showOrder && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Medication" readOnly={!editable} {...form.register('medicationName')} error={errors.medicationName?.message} />
                <Input label="Strength" readOnly={!editable} {...form.register('strength')} error={errors.strength?.message} />
                {decision === 'APPROVE_BRIDGE_REQUIRE_VISIT' && (
                  <Input label="Bridge supply (days)" type="number" min={1} max={maxBridgeDays} {...form.register('bridgeDays')} error={errors.bridgeDays?.message} hint={`Practice maximum: ${maxBridgeDays} days`} />
                )}
                <Input label="Quantity" type="number" readOnly={decision !== 'APPROVE_MODIFIED'} {...form.register('quantity')} error={errors.quantity?.message} />
                <Input label="Days supply" type="number" readOnly={decision !== 'APPROVE_MODIFIED'} {...form.register('daysSupply')} error={errors.daysSupply?.message} />
                <Input
                  label="Refills"
                  type="number"
                  min={0}
                  max={controlled === 'II' ? 0 : 11}
                  readOnly={decision === 'APPROVE_BRIDGE_REQUIRE_VISIT' || controlled === 'II'}
                  {...form.register('refills')}
                  error={errors.refills?.message}
                />
              </div>
            )}
            {decision === 'DENY' && (
              <div className="grid gap-3">
                <Select label="Reason" required {...form.register('reasonCode')} error={errors.reasonCode?.message} defaultValue="">
                  <option value="" disabled>
                    Choose a reason…
                  </option>
                  {DENY_REASONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
                <Textarea label="Next step for the patient" required placeholder="e.g. Please book a visit so we can discuss a safer alternative. Call 312-555-0100." {...form.register('patientNextStep')} error={errors.patientNextStep?.message} hint="Plain language — this is sent to the patient. No one is left without a next step." />
              </div>
            )}
            <Textarea label="Note (optional)" placeholder={decision === 'REQUIRE_VISIT' ? 'e.g. Blood pressure not checked in over a year.' : 'Visible to your practice'} {...form.register('note')} className="min-h-16" />
          </motion.div>
        </AnimatePresence>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[12px] text-ink-400">
            <ShieldCheck className="size-3.5" /> {user.aal === 'aal2' ? 'MFA verified this session' : 'MFA will be requested'}
          </p>
          <Button type="submit" size="lg" variant={decision === 'DENY' ? 'danger' : 'primary'}>
            Review order
          </Button>
        </div>
      </form>

      <OrderConfirmDialog review={review} detail={detail} onCancel={() => setReview(null)} onConfirm={confirm} pending={transition.isPending} />
    </section>
  );
}

/** Order-restating confirmation (§9 F4): restates patient + every order field; explicit click; hash-bound. */
function OrderConfirmDialog({ review, detail, onCancel, onConfirm, pending }: { review: DecisionInput | null; detail: PracticeCaseDetail; onCancel: () => void; onConfirm: () => void; pending: boolean }) {
  const p = detail.patient;
  const meta = review ? DECISIONS.find((d) => d.value === review.decision)! : null;
  const showOrder = review && ['APPROVE', 'APPROVE_MODIFIED', 'APPROVE_BRIDGE_REQUIRE_VISIT'].includes(review.decision);
  return (
    <Modal
      open={Boolean(review)}
      onClose={onCancel}
      title="Confirm your decision"
      description="Check every line. This is the legal record of the decision."
      icon={<Signature className="size-5" />}
      tone={review?.decision === 'DENY' ? 'danger' : 'brand'}
      size="md"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} data-autofocus>
            Go back and edit
          </Button>
          <Button variant={review?.decision === 'DENY' ? 'danger' : 'primary'} loading={pending} onClick={onConfirm} icon={<ShieldCheck className="size-4" />}>
            Confirm &amp; sign
          </Button>
        </>
      }
    >
      {review && meta && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3.5">
            <span className={meta.tone}>{meta.icon}</span>
            <p className="text-[15px] font-semibold text-brand-900">{meta.label}</p>
          </div>
          <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
            <Row label="Patient">
              {p ? `${p.firstName} ${p.lastName}` : detail.case.patientName}
              {detail.patientAge !== null && `, ${detail.patientAge}`}
            </Row>
            {p && (
              <Row label="DOB / Chart">
                {formatDob(p.dob)} · <span className="font-mono">{p.chartNumber}</span>
              </Row>
            )}
            {showOrder && (
              <>
                <Row label="Drug">
                  <strong>
                    {review.medicationName} {review.strength}
                  </strong>
                </Row>
                <Row label="Quantity">{review.quantity}</Row>
                <Row label="Days supply">{review.daysSupply}</Row>
                <Row label="Refills">{review.refills}</Row>
                {review.decision === 'APPROVE_BRIDGE_REQUIRE_VISIT' && <Row label="Bridge">{review.bridgeDays} days, then a visit is required</Row>}
              </>
            )}
            {review.decision === 'DENY' && (
              <>
                <Row label="Reason">{DENY_REASONS.find(([v]) => v === review.reasonCode)?.[1]}</Row>
                <Row label="Patient next step">{review.patientNextStep}</Row>
              </>
            )}
            {review.note && <Row label="Note">{review.note}</Row>}
            <Row label="Pharmacy">{detail.pharmacy.name}</Row>
          </dl>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 bg-white px-3.5 py-2.5">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-900">{children}</dd>
    </div>
  );
}
