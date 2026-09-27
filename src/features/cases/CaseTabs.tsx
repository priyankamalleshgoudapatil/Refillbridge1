import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, CircleDashed, Mail, MessageSquare, MessageSquareText, Moon, RotateCcw, Send, Sparkles, StickyNote, WifiOff } from 'lucide-react';
import type { CaseNote, InfoRequest, PracticeCaseDetail } from '@shared/dto.ts';
import { friendlyMessage, refillService } from '@/services';
import { ApiError } from '@/services/errors';
import { Badge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import { KeyValue } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { cn, dueIn, formatDateTime, formatDob, timeAgo } from '@/lib/format';
import { caseKeys, useInvalidateCase } from './hooks';

// ------------------------------------------------------------------ Notes (optimistic — a safe action)

export function NotesTab({ detail }: { detail: PracticeCaseDetail }) {
  const [body, setBody] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const key = caseKeys.detail(detail.case.id);
  const add = useMutation({
    mutationFn: (text: string) => refillService.addCaseNote(detail.case.id, text),
    onMutate: async (text) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PracticeCaseDetail>(key);
      const optimistic: CaseNote = { id: `tmp-${Date.now()}`, caseId: detail.case.id, authorName: 'You', body: text, createdAt: new Date().toISOString() };
      if (prev) qc.setQueryData(key, { ...prev, notes: [optimistic, ...prev.notes] });
      setBody('');
      return { prev };
    },
    onError: (err, text, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      setBody(text);
      toast.error("Couldn't save the note", friendlyMessage(err));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate(body.trim());
        }}
        className="space-y-2"
      >
        <Textarea label="Internal note" hint="Visible to your practice only — never to the pharmacy or patient." value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="e.g. Called patient, voicemail left." />
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink-400">{body.length}/2000</span>
          <Button type="submit" size="sm" disabled={!body.trim()} icon={<StickyNote className="size-4" />}>
            Add note
          </Button>
        </div>
      </form>
      {detail.notes.length === 0 ? (
        <EmptyState icon={<StickyNote className="size-6" />} title="No notes yet" description="Notes help the next person pick this case up cold." />
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {detail.notes.map((n) => (
              <motion.li key={n.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-xl border border-line bg-white p-3.5', n.id.startsWith('tmp-') && 'opacity-60')}>
                <p className="whitespace-pre-wrap text-sm text-ink-800">{n.body}</p>
                <p className="mt-1.5 text-[12px] text-ink-400">
                  {n.authorName} · {timeAgo(n.createdAt)}
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Tasks

export function TasksTab({ detail }: { detail: PracticeCaseDetail }) {
  const invalidate = useInvalidateCase();
  const toast = useToast();
  const done = useMutation({
    mutationFn: (taskId: string) => refillService.completeTask(detail.case.id, taskId),
    onSuccess: () => invalidate(detail.case.id),
    onError: (e) => toast.error("Couldn't update the task", friendlyMessage(e)),
  });
  if (detail.tasks.length === 0) return <EmptyState icon={<CheckCircle2 className="size-6" />} title="No tasks" description="Human work items (call the pharmacy, book a visit…) appear here." />;
  return (
    <ul className="space-y-2">
      {detail.tasks.map((t) => (
        <li key={t.id} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3.5', t.status === 'open' ? 'border-line' : 'border-line opacity-60')}>
          <div className="flex min-w-0 items-start gap-2.5">
            {t.status === 'open' ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-warn-600" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok-600" aria-hidden />}
            <div className="min-w-0">
              <p className={cn('text-sm font-medium', t.status !== 'open' && 'line-through')}>{t.title}</p>
              <p className="text-[12px] text-ink-500">
                {t.status === 'open' ? `Due ${dueIn(t.dueAt)}` : 'Done'} · {t.assigneeName ?? 'Team queue'}
              </p>
            </div>
          </div>
          {t.status === 'open' && (
            <Button size="sm" variant="secondary" loading={done.isPending && done.variables === t.id} onClick={() => done.mutate(t.id)}>
              Mark done
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ Patient messages

const TEMPLATES: { value: string; label: string }[] = [
  { value: 'under_review', label: 'Under review' },
  { value: 'info_needed', label: 'Info needed from you' },
  { value: 'visit_needed', label: 'Visit needed' },
  { value: 'approved_sent', label: 'Approved & sent to pharmacy' },
  { value: 'delayed_insurance', label: 'Delayed (insurance)' },
  { value: 'ready_for_pickup', label: 'Ready for pickup' },
];

const NOTIF_STATUS = {
  delivered: { tone: 'ok' as const, icon: <CheckCircle2 className="size-3.5" />, label: 'Delivered' },
  sent: { tone: 'ok' as const, icon: <CheckCircle2 className="size-3.5" />, label: 'Sent' },
  queued: { tone: 'info' as const, icon: <CircleDashed className="size-3.5" />, label: 'Queued' },
  quiet_hours: { tone: 'neutral' as const, icon: <Moon className="size-3.5" />, label: 'Held — quiet hours' },
  failed: { tone: 'bad' as const, icon: <WifiOff className="size-3.5" />, label: 'Failed' },
};

export function MessagesTab({ detail }: { detail: PracticeCaseDetail }) {
  const [mode, setMode] = useState<'template' | 'free'>('template');
  const [template, setTemplate] = useState('under_review');
  const [text, setText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [aiId, setAiId] = useState<string | null>(null);
  const [aiText, setAiText] = useState<string | null>(null);
  const invalidate = useInvalidateCase();
  const toast = useToast();
  const patient = detail.patient;
  const draft = useMutation({
    mutationFn: () => refillService.draftPatientMessage(detail.case.id),
    onSuccess: (d) => {
      setMode('free');
      setText(d.smsText);
      setAiText(d.smsText);
      setAiId(d.suggestionId);
      setReviewed(false);
    },
    onError: (e) => toast.warning('AI draft unavailable', e instanceof ApiError && e.code === 'AI_UNAVAILABLE' ? 'Use a template instead — they always work.' : friendlyMessage(e)),
  });
  const send = useMutation({
    mutationFn: () => refillService.sendPatientMessage(detail.case.id, mode === 'template' ? { template: template as never } : { template: 'free_text', text, reviewed }),
    onSuccess: () => {
      if (aiId) void refillService.recordAiOutcome(aiId, aiText === text ? 'accepted' : 'edited');
      toast.success('Message queued for the patient', patient?.smsOptOut ? 'Sent by email (patient opted out of SMS).' : undefined);
      setText('');
      setAiId(null);
      setReviewed(false);
      invalidate(detail.case.id);
    },
    onError: (e) => toast.error("Couldn't send", friendlyMessage(e)),
  });
  if (!patient) return <EmptyState icon={<MessageSquare className="size-6" />} title="Confirm the patient first" description="We never message someone until their identity is confirmed." />;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-ice-50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink-900">Send an update</p>
          <div className="flex flex-wrap items-center gap-2">
            {patient.smsOptOut && <Badge tone="warn" icon={<AlertTriangle className="size-3.5" />}>SMS opted out — email only</Badge>}
            <Button size="sm" variant="subtle" icon={<Sparkles className="size-4" />} loading={draft.isPending} onClick={() => draft.mutate()}>
              Draft with AI
            </Button>
          </div>
        </div>
        <div className="mb-3 flex gap-1 rounded-lg bg-white p-1 ring-1 ring-line" role="radiogroup" aria-label="Message type">
          {(['template', 'free'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn('flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition', mode === m ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ice-100')}>
              {m === 'template' ? 'Template (sends automatically)' : 'Free text (needs review)'}
            </button>
          ))}
        </div>
        {mode === 'template' ? (
          <Select label="Template" value={template} onChange={(e) => setTemplate(e.target.value)}>
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        ) : (
          <div className="space-y-3">
            <Textarea label="Message" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} hint={`${text.length}/300 · No drug names or clinical details in SMS.`} />
            {aiId && <p className="text-[12px] text-info-700">Drafted by Demo AI (mock) from status + clinic name only. Edit freely.</p>}
            <Checkbox label="I reviewed this message" description="Free-text and AI-drafted messages always need a person to approve them." checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button size="sm" icon={<Send className="size-4" />} loading={send.isPending} disabled={mode === 'free' && (!text.trim() || !reviewed)} onClick={() => send.mutate()}>
            Send to patient
          </Button>
        </div>
      </div>
      {detail.notifications.length === 0 ? (
        <EmptyState icon={<MessageSquareText className="size-6" />} title="No messages yet" />
      ) : (
        <ul className="space-y-2">
          {detail.notifications.map((n) => {
            const s = NOTIF_STATUS[n.status];
            return (
              <li key={n.id} className="rounded-xl border border-line bg-white p-3.5">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-700">
                    {n.channel === 'sms' ? <MessageSquare className="size-3.5" /> : <Mail className="size-3.5" />}
                    {n.channel.toUpperCase()} · {n.template.replace(/_/g, ' ')}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={s.tone} icon={s.icon}>
                      {s.label}
                    </Badge>
                    <span className="text-[12px] text-ink-400">{timeAgo(n.createdAt)}</span>
                  </span>
                </div>
                <p className="text-[13.5px] text-ink-700">{n.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Original request

export function RequestTab({ detail }: { detail: PracticeCaseDetail }) {
  const r = detail.case.requestedPayload;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">
        Exactly what {detail.pharmacy.name} sent via <strong>{detail.case.source}</strong> on {formatDateTime(detail.case.createdAt)}. Treated as data only.
      </p>
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-white p-4 sm:grid-cols-3">
        <KeyValue label="Patient">{`${r.patientFirstName} ${r.patientLastName}`.trim() || '—'}</KeyValue>
        <KeyValue label="DOB">{r.patientDob ? formatDob(r.patientDob) : '—'}</KeyValue>
        <KeyValue label="Phone">{r.patientPhone || '—'}</KeyValue>
        <KeyValue label="Medication">{r.medicationName || '—'}</KeyValue>
        <KeyValue label="Strength">{r.strength || <span className="text-warn-700">Missing</span>}</KeyValue>
        <KeyValue label="Quantity">{r.quantity ?? <span className="text-warn-700">Missing</span>}</KeyValue>
        <KeyValue label="Sig">{r.sig || '—'}</KeyValue>
        <KeyValue label="Prescriber">{r.prescriberName || '—'}</KeyValue>
        <KeyValue label="Pharmacy">{r.pharmacyName}</KeyValue>
        {r.reportedRefillsRemaining !== undefined && <KeyValue label="Pharmacy says refills left">{r.reportedRefillsRemaining}</KeyValue>}
        {r.reportedDaysSupplyLeft !== undefined && <KeyValue label="Days of supply left">{r.reportedDaysSupplyLeft}</KeyValue>}
        {r.insuranceFlag && <KeyValue label="Insurance flag">{r.insuranceFlag.replace(/_/g, ' ').toLowerCase()}</KeyValue>}
      </dl>
      {r.notes && (
        <div className={cn('rounded-xl border p-4', detail.case.injectionSuspected ? 'border-bad-600/30 bg-bad-50/50' : 'border-line bg-white')}>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-400">Pharmacy notes (untrusted text)</p>
          <p className="whitespace-pre-wrap font-mono text-[13px] text-ink-800">{r.notes}</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Deliveries (outbox)

const OUTBOX = {
  sent: { tone: 'ok' as const, label: 'Delivered' },
  pending: { tone: 'info' as const, label: 'Pending' },
  failed: { tone: 'warn' as const, label: 'Retrying' },
  dead: { tone: 'bad' as const, label: 'Dead letter' },
  cancelled: { tone: 'muted' as const, label: 'Cancelled' },
};

export function DeliveriesTab({ detail }: { detail: PracticeCaseDetail }) {
  const invalidate = useInvalidateCase();
  const toast = useToast();
  const retry = useMutation({
    mutationFn: () => refillService.retryDispatch(detail.case.id),
    onSuccess: (d) => {
      invalidate(detail.case.id, d);
      toast.success('Retry sent');
    },
    onError: (e) => toast.error('Retry failed', friendlyMessage(e)),
  });
  if (detail.outbox.length === 0) return <EmptyState icon={<Send className="size-6" />} title="Nothing sent yet" description="Pharmacy messages and patient notifications appear here with every attempt." />;
  const hasDead = detail.outbox.some((o) => o.status === 'dead' && o.channel === 'pharmacy');
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Transactional outbox: each message was saved in the same transaction as the change that caused it, then delivered by a worker. Retries: 1 → 5 → 30 → 120 min; dead letter after 5 attempts.</p>
      {hasDead && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad-600/30 bg-bad-50 p-3.5">
          <p className="flex items-center gap-2 text-sm text-bad-700">
            <WifiOff className="size-4" /> Pharmacy unreachable — call {detail.pharmacy.name} at {detail.pharmacy.phone}, or retry.
          </p>
          <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} loading={retry.isPending} onClick={() => retry.mutate()}>
            Retry now
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-ice-50 text-[11.5px] uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-3 py-2 font-semibold">Message</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="hidden px-3 py-2 font-semibold sm:table-cell">Attempts</th>
              <th className="hidden px-3 py-2 font-semibold md:table-cell">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {detail.outbox.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2.5">
                  <span className="font-medium capitalize">{o.channel}</span> · {o.template.replace(/_/g, ' ')}
                  <div className="text-[11.5px] text-ink-400">{formatDateTime(o.createdAt)}</div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={OUTBOX[o.status].tone}>{OUTBOX[o.status].label}</Badge>
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">{o.attempts}</td>
                <td className="hidden px-3 py-2.5 text-ink-500 md:table-cell">{o.lastError ? `${o.lastError}${o.nextAttemptAt && o.status === 'failed' ? ` · next ${dueIn(o.nextAttemptAt)}` : ''}` : o.deliveredAt ? `Delivered ${formatDateTime(o.deliveredAt)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Info requests (answerable)

export function InfoRequestsPanel({ caseId, requests, canAnswer }: { caseId: string; requests: InfoRequest[]; canAnswer: boolean }) {
  if (requests.length === 0) return null;
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <InfoRequestCard key={r.id} caseId={caseId} request={r} canAnswer={canAnswer} />
      ))}
    </div>
  );
}

function InfoRequestCard({ caseId, request: r, canAnswer }: { caseId: string; request: InfoRequest; canAnswer: boolean }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const invalidate = useInvalidateCase();
  const toast = useToast();
  const submit = useMutation({
    mutationFn: () => refillService.answerInfoRequest(r.id, answers),
    onSuccess: (ir) => {
      toast.success(ir.status === 'answered' ? 'Answers sent — the practice will continue' : `${ir.questions.filter((q) => q.answer).length} of ${ir.questions.length} answered`);
      setAnswers({});
      invalidate(caseId);
    },
    onError: (e) => toast.error("Couldn't send answers", friendlyMessage(e)),
  });
  const answered = r.questions.filter((q) => q.answer).length;
  return (
    <section className={cn('rounded-xl border p-4', r.status === 'answered' ? 'border-line bg-white' : 'border-warn-600/30 bg-warn-50/50')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Questions for {r.requestedFrom}</h3>
        <Badge tone={r.status === 'answered' ? 'ok' : 'warn'}>{r.status === 'answered' ? 'Answered' : `${answered} of ${r.questions.length} answered · due ${dueIn(r.dueAt)}`}</Badge>
      </div>
      <ol className="space-y-3">
        {r.questions.map((q, i) => (
          <li key={q.id} className="text-sm">
            {q.answer || !canAnswer || r.status === 'answered' ? (
              <>
                <p className="text-ink-700">
                  {i + 1}. {q.text}
                </p>
                <p className={cn('mt-0.5 pl-4', q.answer ? 'font-medium text-ink-900' : 'text-ink-400')}>{q.answer ?? 'Not answered yet'}</p>
              </>
            ) : (
              <Input label={`${i + 1}. ${q.text}`} value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="Type the answer, or 'unknown'" maxLength={500} />
            )}
          </li>
        ))}
      </ol>
      {canAnswer && r.status !== 'answered' && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => submit.mutate()} loading={submit.isPending} disabled={Object.values(answers).every((a) => !a.trim())}>
            Send answers
          </Button>
        </div>
      )}
    </section>
  );
}
