import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useBlocker } from 'react-router-dom';
import { z } from 'zod';
import { AlertTriangle, Quote, Send } from 'lucide-react';
import type { FieldExtraction, Organization } from '@shared/dto.ts';
import { requestedPayloadSchema } from '@shared/schemas/index.ts';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/format';
import { LOW_CONFIDENCE } from '@/services/mock/ai-mock';

export const requestFormSchema = requestedPayloadSchema.extend({ targetOrgId: z.string().min(1, 'Choose where to send this') });
export type RequestFormValues = z.infer<typeof requestFormSchema>;

type FieldKey = keyof RequestFormValues;
const optionalNumber = { setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)) };
const optionalString = { setValueAs: (v: unknown) => (v === '' ? undefined : v) };

interface Props {
  mode: 'pharmacy' | 'phone';
  orgs: Organization[];
  defaults?: Partial<RequestFormValues>;
  extraction?: Partial<Record<string, FieldExtraction>>;
  submitting: boolean;
  onSubmit: (values: RequestFormValues) => void;
  aside?: ReactNode;
  lockedPharmacyName?: string;
}

export function RequestForm({ mode, orgs, defaults, extraction, submitting, onSubmit, aside, lockedPharmacyName }: Props) {
  const initial = useMemo<Partial<RequestFormValues>>(
    () => ({ targetOrgId: orgs.length === 1 ? orgs[0].id : '', pharmacyName: lockedPharmacyName ?? '', ...defaults }),
    [defaults, orgs, lockedPharmacyName],
  );
  const form = useForm<RequestFormValues>({ resolver: zodResolver(requestFormSchema), mode: 'onBlur', defaultValues: initial as RequestFormValues });
  useEffect(() => form.reset(initial as RequestFormValues), [initial, form]);
  const [submitted, setSubmitted] = useState(false);
  const e = form.formState.errors;

  // Low-confidence fields (< 0.75) must be confirmed one by one (§5.5 AI-1).
  const lowFields = useMemo(() => Object.entries(extraction ?? {}).filter(([, f]) => f && f.confidence < LOW_CONFIDENCE).map(([k]) => k), [extraction]);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const unconfirmed = lowFields.filter((k) => !confirmed[k]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => form.formState.isDirty && !submitted && currentLocation.pathname !== nextLocation.pathname);

  const submit = form.handleSubmit((v) => {
    setSubmitted(true);
    onSubmit(v);
  });

  const fieldProps = (key: FieldKey) => {
    const ex = extraction?.[key as string];
    const low = ex && ex.confidence < LOW_CONFIDENCE;
    return {
      className: cn(low && !confirmed[key as string] && 'border-warn-600 bg-warn-50/60', ex && !low && 'bg-ok-50/40'),
      hint: ex ? <SourceHint ex={ex} /> : undefined,
    };
  };
  const confirmBox = (key: string) =>
    lowFields.includes(key) ? (
      <Checkbox className="mt-1.5" label={<span className="text-[12.5px] font-medium text-warn-700">Please confirm this field</span>} checked={Boolean(confirmed[key])} onChange={(ev) => setConfirmed((c) => ({ ...c, [key]: ev.target.checked }))} />
    ) : null;

  return (
    <div className={cn('grid gap-5', aside && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]')}>
      {aside && <div className="lg:sticky lg:top-6 lg:self-start">{aside}</div>}
      <form onSubmit={submit} noValidate className="surface space-y-6 p-5 sm:p-6">
        {mode === 'pharmacy' ? (
          <Select label="Send to practice" required {...form.register('targetOrgId')} error={e.targetOrgId?.message} hint="You can only send to practices you're linked with.">
            <option value="">Choose a practice…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        ) : (
          <Select
            label="Patient's pharmacy"
            required
            {...form.register('targetOrgId', {
              onChange: (ev) => form.setValue('pharmacyName', orgs.find((o) => o.id === ev.target.value)?.name ?? '', { shouldDirty: true }),
            })}
            error={e.targetOrgId?.message}
          >
            <option value="">Choose a linked pharmacy…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        )}

        <fieldset className="space-y-4">
          <legend className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Patient</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input label="First name" required autoComplete="off" {...form.register('patientFirstName')} error={e.patientFirstName?.message} {...fieldProps('patientFirstName')} />
              {confirmBox('patientFirstName')}
            </div>
            <div>
              <Input label="Last name" required autoComplete="off" {...form.register('patientLastName')} error={e.patientLastName?.message} {...fieldProps('patientLastName')} />
              {confirmBox('patientLastName')}
            </div>
            <div>
              <Input label="Date of birth" type="date" required {...form.register('patientDob')} error={e.patientDob?.message} {...fieldProps('patientDob')} />
              {confirmBox('patientDob')}
            </div>
            <div>
              <Input label="Phone" type="tel" autoComplete="off" {...form.register('patientPhone', optionalString)} error={e.patientPhone?.message} {...fieldProps('patientPhone')} />
              {confirmBox('patientPhone')}
            </div>
            {mode === 'phone' && <Input label="Chart number" {...form.register('chartNumber', optionalString)} hint="Name + DOB + phone or chart number gives an exact match." />}
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Medication</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input label="Drug name" required {...form.register('medicationName')} error={e.medicationName?.message} {...fieldProps('medicationName')} />
              {confirmBox('medicationName')}
            </div>
            <div>
              <Input label="Strength" required placeholder="e.g. 10 mg" {...form.register('strength')} error={e.strength?.message} {...fieldProps('strength')} />
              {confirmBox('strength')}
            </div>
            <div>
              <Input label="Quantity" type="number" required min={1} {...form.register('quantity')} error={e.quantity?.message} {...fieldProps('quantity')} />
              {confirmBox('quantity')}
            </div>
            <div>
              <Input label="Sig (directions)" {...form.register('sig', optionalString)} {...fieldProps('sig')} />
              {confirmBox('sig')}
            </div>
            <div>
              <Input label="Prescriber" {...form.register('prescriberName', optionalString)} {...fieldProps('prescriberName')} />
              {confirmBox('prescriberName')}
            </div>
            {mode === 'pharmacy' && <Input label="Pharmacy" readOnly {...form.register('pharmacyName')} />}
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Helps the practice decide faster (optional)</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Days of supply left" type="number" min={0} {...form.register('reportedDaysSupplyLeft', optionalNumber)} hint="≤ 2 days makes it urgent." />
            {mode === 'pharmacy' && <Input label="Refills you see on file" type="number" min={0} {...form.register('reportedRefillsRemaining', optionalNumber)} />}
            <Select label="Insurance issue" {...form.register('insuranceFlag', optionalString)}>
              <option value="">None</option>
              <option value="PA_REQUIRED">Prior authorization needed</option>
              <option value="NOT_COVERED">Not covered</option>
              <option value="INSURANCE_CHANGED">Insurance changed</option>
            </Select>
          </div>
          <div>
            <Textarea label="Notes" maxLength={2000} {...form.register('notes', optionalString)} {...fieldProps('notes')} />
            {confirmBox('notes')}
          </div>
        </fieldset>

        {unconfirmed.length > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-warn-50 px-3 py-2 text-[13px] text-warn-700">
            <AlertTriangle className="size-4 shrink-0" /> Confirm {unconfirmed.length} highlighted field{unconfirmed.length > 1 ? 's' : ''} before sending.
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={submitting} disabled={unconfirmed.length > 0} icon={<Send className="size-4" />}>
            {mode === 'pharmacy' ? 'Send request' : 'Create case'}
          </Button>
        </div>
      </form>

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Discard this request?"
        description="You have unsaved details. If you leave now, they'll be lost."
        icon={<AlertTriangle className="size-5" />}
        tone="danger"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()} data-autofocus>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">Nothing is saved until you send it.</p>
      </Modal>
    </div>
  );
}

function SourceHint({ ex }: { ex: FieldExtraction }) {
  const pct = Math.round(ex.confidence * 100);
  const low = ex.confidence < LOW_CONFIDENCE;
  return (
    <span className="flex items-start gap-1">
      <Quote className="mt-0.5 size-3 shrink-0 text-ink-400" aria-hidden />
      <span className="min-w-0 truncate">
        <span className={cn('font-medium', low ? 'text-warn-700' : 'text-ok-700')}>{pct}% confident</span>
        {ex.sourceSpan && <span className="font-mono text-[11.5px]"> · “{ex.sourceSpan.slice(0, 48)}{ex.sourceSpan.length > 48 ? '…' : ''}”</span>}
      </span>
    </span>
  );
}
