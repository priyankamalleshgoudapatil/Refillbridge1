import { useEffect, type ReactNode } from 'react';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useBlocker } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Pill, Save, ShieldCheck, Timer, Undo2 } from 'lucide-react';
import { z } from 'zod';
import type { PracticePolicies } from '@shared/dto.ts';
import { policiesSchema, type PoliciesFormInput } from '@shared/schemas/index.ts';
import { useAuth } from '@/app/auth-context';
import { ApiError, friendlyMessage, refillService } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Card, CardHeader } from '@/components/ui/Layout';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { Callout, fadeUp, SectionHeader } from './components';

export function toPoliciesForm(p: PracticePolicies): PoliciesFormInput {
  const hours = (m: number | undefined, fallback: number) => (m === undefined ? fallback : Math.round(m / 60));
  return {
    maxBridgeDays: p.maxBridgeDays,
    rxValidityMonths: p.rxValidityMonths,
    tooEarlyThreshold: p.tooEarlyThreshold,
    providerSlaHours: hours(p.sla.WAITING_ON_PROVIDER?.routine.minutes, 24),
    providerUrgentSlaHours: hours(p.sla.WAITING_ON_PROVIDER?.urgent.minutes, 4),
    pharmacyAckHours: hours(p.sla.SENT_TO_PHARMACY?.routine.minutes, 4),
    bloodPressureVisitMonths: p.visitRules.bloodPressureVisitMonths,
    diabetesA1cMonths: p.visitRules.diabetesA1cMonths,
    diabetesVisitMonths: p.visitRules.diabetesVisitMonths,
    antidepressantVisitMonths: p.visitRules.antidepressantVisitMonths,
    adhdVisitMonths: p.visitRules.adhdVisitMonths,
  };
}

/** Friendlier messages than zod's defaults. */
const errorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.path[0] === 'tooEarlyThreshold') return { message: 'Enter a percentage between 50 and 100' };
  if (issue.code === 'invalid_type') return { message: issue.expected === 'integer' ? 'Use a whole number' : 'Enter a number' };
  if (issue.code === 'too_small') return { message: `Must be at least ${String(issue.minimum)}` };
  if (issue.code === 'too_big') return { message: `Must be at most ${String(issue.maximum)}` };
  return { message: ctx.defaultError };
};

export default function PoliciesPage() {
  const policies = useQuery({ queryKey: ['policies'], queryFn: () => refillService.getPolicies() });
  return (
    <div>
      <SectionHeader title="Practice policies" description="The limits RefillBridge applies to every refill at your practice — deadlines, bridge supplies and when a visit is due." />
      <motion.div {...fadeUp(1)}>
        <Callout icon={<AlertTriangle className="size-4" />} tone="warn" className="mb-5">
          <p className="font-semibold">These defaults are placeholders set by your practice, not clinical advice.</p>
          <p className="mt-0.5">Rules are enforced by code — AI never changes them.</p>
        </Callout>
      </motion.div>
      {policies.isPending ? (
        <PoliciesSkeleton />
      ) : policies.isError ? (
        <ErrorState title="Couldn't load your policies" error={policies.error} onRetry={() => void policies.refetch()} />
      ) : (
        <PoliciesForm initial={toPoliciesForm(policies.data)} />
      )}
    </div>
  );
}

type FieldDef = { name: FieldPath<PoliciesFormInput>; label: string; unit: string; hint: string; min: number; max: number };

const PRESCRIPTION_FIELDS: FieldDef[] = [
  { name: 'maxBridgeDays', label: 'Max bridge supply', unit: 'days', hint: 'Longest short supply a provider can approve while a visit is booked. 1–90.', min: 1, max: 90 },
  { name: 'rxValidityMonths', label: 'Prescription validity', unit: 'months', hint: 'After this, a new prescription is required. 1–24.', min: 1, max: 24 },
];
const SLA_FIELDS: FieldDef[] = [
  { name: 'providerSlaHours', label: 'Provider decision — routine', unit: 'business hours', hint: 'Time a provider has to decide a routine refill. 1–72.', min: 1, max: 72 },
  { name: 'providerUrgentSlaHours', label: 'Provider decision — urgent', unit: 'business hours', hint: 'For patients with 1 day of medication or less. 1–24.', min: 1, max: 24 },
  { name: 'pharmacyAckHours', label: 'Pharmacy acknowledgement', unit: 'business hours', hint: 'Time for the pharmacy to confirm it received the approval. 1–24.', min: 1, max: 24 },
];
const VISIT_FIELDS: FieldDef[] = [
  { name: 'bloodPressureVisitMonths', label: 'Blood pressure — visit', unit: 'months', hint: 'Months since last visit before one is required.', min: 1, max: 24 },
  { name: 'diabetesA1cMonths', label: 'Diabetes — A1c lab', unit: 'months', hint: 'Months since last A1c before a new lab is required.', min: 1, max: 24 },
  { name: 'diabetesVisitMonths', label: 'Diabetes — visit', unit: 'months', hint: 'Months since last visit before one is required.', min: 1, max: 24 },
  { name: 'antidepressantVisitMonths', label: 'Antidepressant — visit', unit: 'months', hint: 'Months since last visit before one is required.', min: 1, max: 24 },
  { name: 'adhdVisitMonths', label: 'ADHD medication — visit', unit: 'months', hint: 'Months since last visit before one is required.', min: 1, max: 24 },
];

function PoliciesForm({ initial }: { initial: PoliciesFormInput }) {
  const { runWithStepUp } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid, isSubmitting },
  } = useForm<PoliciesFormInput>({ resolver: zodResolver(policiesSchema, { errorMap }), mode: 'onBlur', defaultValues: initial });

  const save = useMutation({
    mutationFn: (v: PoliciesFormInput) => runWithStepUp(() => refillService.updatePolicies(v)),
    onSuccess: (saved) => {
      qc.setQueryData(['policies'], saved);
      reset(toPoliciesForm(saved));
      toast.success('Policies saved', 'New cases use these limits straight away.');
    },
    onError: (err) => toast.error("Couldn't save policies", friendlyMessage(err), err instanceof ApiError ? err.requestId : undefined),
  });

  const saving = save.isPending || isSubmitting;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  // Browser-level guard (refresh / close tab) while there are unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const numberField = (f: FieldDef) => (
    <Input
      key={f.name}
      label={`${f.label} (${f.unit})`}
      type="number"
      inputMode="numeric"
      min={f.min}
      max={f.max}
      step={1}
      required
      hint={f.hint}
      error={errors[f.name]?.message}
      {...register(f.name, { valueAsNumber: true })}
    />
  );

  return (
    <form noValidate onSubmit={handleSubmit((v) => save.mutateAsync(v).catch(() => undefined))} className="space-y-5 pb-24" aria-label="Practice policies">
      <PolicySection i={2} icon={<Pill className="size-4" aria-hidden />} title="Prescriptions" description="Bridge supplies, prescription age and the too-early refill check.">
        {PRESCRIPTION_FIELDS.map(numberField)}
        <Controller
          control={control}
          name="tooEarlyThreshold"
          render={({ field, fieldState }) => {
            const n = Number(field.value);
            const shown = field.value === undefined || Number.isNaN(n) ? '' : String(Math.round(n * 100));
            return (
              <Input
                label="Too-early threshold (% of supply used)"
                type="number"
                inputMode="numeric"
                min={50}
                max={100}
                step={1}
                required
                name={field.name}
                ref={field.ref}
                value={shown}
                onBlur={field.onBlur}
                onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : Number(e.target.value) / 100)}
                error={fieldState.error?.message}
                hint="Refills requested before this share of the last fill is used are flagged as too early. 50–100%."
              />
            );
          }}
        />
      </PolicySection>

      <PolicySection i={3} icon={<Timer className="size-4" aria-hidden />} title="Response times (SLA)" description="Counted in business hours. Cases that run over are escalated automatically.">
        {SLA_FIELDS.map(numberField)}
      </PolicySection>

      <PolicySection i={4} icon={<CalendarClock className="size-4" aria-hidden />} title="Visit rules" description="How recently a patient must have been seen before a refill can be approved without a visit.">
        {VISIT_FIELDS.map(numberField)}
      </PolicySection>

      <div className="sticky bottom-20 z-20 lg:bottom-4">
        <div className="glass flex flex-col gap-3 rounded-xl px-4 py-3 shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-[13px] text-ink-600" aria-live="polite">
            <ShieldCheck className="size-4 shrink-0 text-brand-600" aria-hidden />
            {isDirty ? (isValid ? 'You have unsaved changes. Saving asks for your authenticator code.' : 'Fix the highlighted fields to save.') : 'All changes saved.'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Undo2 className="size-4" aria-hidden />} disabled={!isDirty || saving} onClick={() => reset(initialOrCurrent(qc, initial))}>
              Discard
            </Button>
            <Button type="submit" icon={<Save className="size-4" aria-hidden />} loading={saving} disabled={!isDirty || !isValid}>
              Save policies
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Discard changes?"
        description="Your policy edits haven't been saved."
        tone="danger"
        size="sm"
        icon={<AlertTriangle className="size-5" aria-hidden />}
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()} data-autofocus>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">If you leave now, the practice keeps its current policies.</p>
      </Modal>
    </form>
  );
}

function initialOrCurrent(qc: ReturnType<typeof useQueryClient>, fallback: PoliciesFormInput): PoliciesFormInput {
  const cached = qc.getQueryData<PracticePolicies>(['policies']);
  return cached ? toPoliciesForm(cached) : fallback;
}

function PolicySection({ i, icon, title, description, children }: { i: number; icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <motion.div {...fadeUp(i)}>
      <Card as="section">
        <CardHeader icon={icon} title={title} description={description} />
        <div className="grid gap-x-5 gap-y-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      </Card>
    </motion.div>
  );
}

function PoliciesSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading policies">
      {[3, 3, 5].map((n, s) => (
        <div key={s} className="surface p-5">
          <Skeleton className="mb-5 h-4 w-40" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
