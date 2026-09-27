import { useState, type ReactNode } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRightCircle,
  Ban,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  FileQuestion,
  Package,
  PackageCheck,
  Pill,
  Plus,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import { infoRequestSchema, type InfoRequestInput } from '@shared/schemas/index.ts';
import type { TransitionAction } from '@shared/types.ts';
import { friendlyMessage } from '@/services';
import { ApiError } from '@/services/errors';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useIdempotencyKey } from '@/lib/hooks';

export interface ActionMeta {
  label: string;
  icon: ReactNode;
  variant: ButtonProps['variant'];
  description: string;
  needsReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  confirm?: string;
  cancelReasons?: boolean;
  danger?: boolean;
}

const ic = 'size-4';
export const ACTION_META: Partial<Record<TransitionAction, ActionMeta>> = {
  REQUEST_INFO: { label: 'Request information', icon: <FileQuestion className={ic} />, variant: 'secondary', description: 'Ask the pharmacy, the patient or a colleague structured questions.' },
  INFO_RECEIVED: { label: 'Mark info received', icon: <CheckCircle2 className={ic} />, variant: 'secondary', description: 'All questions are answered or marked unknown. Triage will run again.', confirm: 'Mark received' },
  ROUTE_TO_PROVIDER: { label: 'Send to provider', icon: <Stethoscope className={ic} />, variant: 'primary', description: 'Route this case to the provider inbox. The SLA timer starts now.', confirm: 'Send to provider' },
  ROUTE_TO_INSURANCE: { label: 'Work insurance issue', icon: <ShieldCheck className={ic} />, variant: 'secondary', description: 'Move to the insurance work queue and create a task.', confirm: 'Move to insurance' },
  INSURANCE_RESOLVED: { label: 'Insurance resolved', icon: <CheckCircle2 className={ic} />, variant: 'success', description: 'Record how it was resolved. Triage runs again.', needsReason: true, reasonLabel: 'Resolution note', reasonPlaceholder: 'e.g. PA approved, reference 88213' },
  INSURANCE_NEEDS_ALTERNATIVE: { label: 'Needs alternative', icon: <Pill className={ic} />, variant: 'secondary', description: 'Insurance denied — ask the provider to choose an alternative. The patient is told it is delayed.', needsReason: true, reasonLabel: 'What did the insurer say?' },
  CLOSE_NOT_NEEDED: { label: 'Return to pharmacy', icon: <Undo2 className={ic} />, variant: 'secondary', description: 'No provider action is needed — refills remain on file. The pharmacy is notified to process it normally.', confirm: 'Return to pharmacy' },
  REJECT_PATIENT_MATCH: { label: 'Not our patient', icon: <XCircle className={ic} />, variant: 'ghost', description: 'Close this request because the patient is not at this practice. The pharmacy is notified.', needsReason: true, reasonLabel: 'Reason', danger: true },
  VISIT_COMPLETED: { label: 'Visit completed', icon: <CalendarCheck className={ic} />, variant: 'primary', description: 'The patient was seen. The provider will re-decide with the visit on record.', confirm: 'Visit completed' },
  VISIT_NO_SHOW: { label: 'No-show', icon: <CalendarX className={ic} />, variant: 'ghost', description: 'The patient did not attend. The provider decides the next step.', confirm: 'Record no-show' },
  CANCEL: { label: 'Cancel case', icon: <Ban className={ic} />, variant: 'ghost', description: 'Cancel this refill case. The pharmacy (and patient, if relevant) are notified.', needsReason: true, reasonLabel: 'Reason', cancelReasons: true, danger: true },
  CANCEL_AFTER_SEND: { label: 'Cancel after sending', icon: <Trash2 className={ic} />, variant: 'danger', description: 'Sends a cancel message (CancelRx) to the pharmacy. Requires MFA.', needsReason: true, reasonLabel: 'Reason', danger: true },
  PHARMACY_ACKNOWLEDGED: { label: 'Confirm receipt', icon: <PackageCheck className={ic} />, variant: 'primary', description: 'Tell the practice you received the approval.' },
  START_FILLING: { label: 'Start filling', icon: <Pill className={ic} />, variant: 'primary', description: 'Mark the medication as being filled.' },
  MARK_READY: { label: 'Mark ready for pickup', icon: <Package className={ic} />, variant: 'primary', description: 'The patient will get a ready-for-pickup message.' },
  MARK_DISPENSED: { label: 'Mark dispensed', icon: <CheckCircle2 className={ic} />, variant: 'success', description: 'The patient picked up the medication. This completes the case.', confirm: 'Mark dispensed' },
  WITHDRAW: { label: 'Withdraw request', icon: <RotateCcw className={ic} />, variant: 'ghost', description: 'Withdraw this request before the practice approves it.', needsReason: true, reasonLabel: 'Reason', danger: true },
};

export function ActionConfirmDialog({
  action,
  open,
  onClose,
  onConfirm,
  pending,
  requireReasonOverride,
  extraDescription,
}: {
  action: TransitionAction;
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: Record<string, unknown>, key: string) => Promise<unknown>;
  pending: boolean;
  requireReasonOverride?: { label: string; placeholder?: string };
  extraDescription?: ReactNode;
}) {
  const meta = ACTION_META[action]!;
  const [reason, setReason] = useState('');
  const [cancelReason, setCancelReason] = useState('other');
  const [error, setError] = useState<string | undefined>();
  const [key, renewKey] = useIdempotencyKey();
  const needsReason = meta.needsReason || Boolean(requireReasonOverride);
  const submit = async () => {
    if (needsReason && reason.trim().length < 3) return setError('Give a short reason');
    setError(undefined);
    try {
      await onConfirm(needsReason ? { reason: reason.trim(), ...(meta.cancelReasons ? { cancelReason } : {}) } : {}, key);
      renewKey();
      setReason('');
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') setError(e.fieldErrors?.reason ?? friendlyMessage(e));
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={meta.label}
      description={meta.description}
      icon={meta.icon}
      tone={meta.danger ? 'danger' : 'brand'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant={meta.danger ? 'danger' : meta.variant === 'success' ? 'success' : 'primary'} onClick={submit} loading={pending} data-autofocus={!needsReason || undefined}>
            {meta.confirm ?? meta.label}
          </Button>
        </>
      }
    >
      {extraDescription && <div className="mb-4 text-sm text-ink-600">{extraDescription}</div>}
      {needsReason ? (
        <div className="space-y-4">
          {meta.cancelReasons && (
            <Select label="Cancellation type" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
              <option value="not_our_patient">Not our patient</option>
              <option value="transferred_care">Transferred care</option>
              <option value="deceased">Deceased</option>
              <option value="other">Other</option>
            </Select>
          )}
          <Textarea
            label={requireReasonOverride?.label ?? meta.reasonLabel ?? 'Reason'}
            placeholder={requireReasonOverride?.placeholder ?? meta.reasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={error}
            required
            maxLength={500}
            data-autofocus
          />
        </div>
      ) : (
        error && <p className="text-sm text-bad-700">{error}</p>
      )}
    </Modal>
  );
}

export function RequestInfoDialog({
  open,
  onClose,
  onSubmit,
  pending,
  pharmacyName,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: InfoRequestInput, key: string) => Promise<unknown>;
  pending: boolean;
  pharmacyName: string;
  suggestions: string[];
}) {
  const [key, renewKey] = useIdempotencyKey();
  const form = useForm<InfoRequestInput>({
    resolver: zodResolver(infoRequestSchema),
    mode: 'onBlur',
    defaultValues: { requestedFrom: 'pharmacy', questions: suggestions.length ? suggestions.map((text) => ({ text })) : [{ text: '' }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'questions' });
  const submit = form.handleSubmit(async (v) => {
    try {
      await onSubmit(v, key);
      renewKey();
      form.reset();
      onClose();
    } catch {
      /* toast handled upstream */
    }
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request information"
      description="Structured questions only. Answers come back into this case — never as free text on the wrong case."
      icon={<FileQuestion className="size-5" />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} icon={<ArrowRightCircle className="size-4" />}>
            Send questions
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <Select label="Ask" {...form.register('requestedFrom')}>
          <option value="pharmacy">{pharmacyName} (pharmacy)</option>
          <option value="patient">The patient (plain-language message, no clinical details)</option>
          <option value="staff">A colleague</option>
        </Select>
        <fieldset className="space-y-3">
          <legend className="mb-1 text-[13px] font-medium text-ink-700">Questions</legend>
          {fields.map((f, i) => (
            <div key={f.id} className="flex items-start gap-2">
              <Input label={`Question ${i + 1}`} shellClassName="flex-1" {...form.register(`questions.${i}.text` as const)} error={form.formState.errors.questions?.[i]?.text?.message} />
              {fields.length > 1 && (
                <button type="button" onClick={() => remove(i)} className="mt-7 rounded-md p-2 text-ink-400 hover:bg-bad-50 hover:text-bad-600" aria-label={`Remove question ${i + 1}`}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          {fields.length < 5 && (
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => append({ text: '' })}>
              Add question
            </Button>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
