import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, FileText, FileUp, Keyboard, ScanText, ShieldAlert, Sparkles, UploadCloud, Wand2 } from 'lucide-react';
import type { CaseDetail, IntakeExtraction } from '@shared/dto.ts';
import { MAX_UPLOAD_BYTES } from '@shared/schemas/index.ts';
import { friendlyMessage, refillService } from '@/services';
import { ApiError } from '@/services/errors';
import { useAuth } from '@/app/auth-context';
import { StatusBadge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Card, PageHeader } from '@/components/ui/Layout';
import { ErrorState, SkeletonRows } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/format';
import { useIdempotencyKey } from '@/lib/hooks';
import { INJECTION_FAX, SAMPLE_FAX } from '@/mocks/data/fixtures';
import { RequestForm, type RequestFormValues } from './RequestForm';

type Stage = { kind: 'input' } | { kind: 'form'; extraction?: IntakeExtraction; faxText?: string; fileName?: string; notice?: string } | { kind: 'done'; detail: CaseDetail };

export default function NewRequestPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'fax' | 'manual'>('fax');
  const [stage, setStage] = useState<Stage>({ kind: 'input' });
  const [faxText, setFaxText] = useState('');
  const [key, renewKey] = useIdempotencyKey();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const orgs = useQuery({ queryKey: ['linked-orgs'], queryFn: () => refillService.listLinkedOrgs() });

  const extract = useMutation({
    mutationFn: (input: { text?: string; attachmentId?: string; fileName?: string }) => refillService.extractIntake({ text: input.text, attachmentId: input.attachmentId }),
    onSuccess: (ex, input) => {
      if (ex.unreadable) setStage({ kind: 'form', faxText: input.text, fileName: input.fileName, notice: "We couldn't read this fax. Please enter the details." });
      else setStage({ kind: 'form', extraction: ex, faxText: input.text, fileName: input.fileName });
    },
    onError: (e, input) => {
      setStage({ kind: 'form', faxText: input.text, fileName: input.fileName, notice: e instanceof ApiError && e.code === 'RATE_LIMITED' ? friendlyMessage(e) : 'Auto-fill unavailable; please type the details.' });
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => refillService.uploadAttachment(file),
    onSuccess: (att) => extract.mutate({ attachmentId: att.id, fileName: att.name }),
    onError: (e) => toast.error("Couldn't upload", friendlyMessage(e)),
  });
  const create = useMutation({
    mutationFn: (v: RequestFormValues) => {
      const { targetOrgId, ...payload } = v;
      const aiId = stage.kind === 'form' ? stage.extraction?.suggestionId : undefined;
      return refillService.createCase({ source: stage.kind === 'form' && (stage.faxText || stage.fileName) ? 'fax' : 'portal', practiceOrgId: targetOrgId, payload, aiSuggestionId: aiId }, key);
    },
    onSuccess: (d) => {
      renewKey();
      setStage({ kind: 'done', detail: d });
      if (stage.kind === 'form' && stage.extraction) void refillService.recordAiOutcome(stage.extraction.suggestionId, 'accepted');
    },
    onError: (e) => toast.error("Couldn't send the request", friendlyMessage(e), e instanceof ApiError ? e.requestId : undefined),
  });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) return toast.error('File too large', 'Upload a PDF, PNG or JPEG under 10 MB.');
    upload.mutate(file);
  };

  if (orgs.isLoading) return <SkeletonRows rows={3} />;
  if (orgs.isError) return <ErrorState error={orgs.error} onRetry={() => orgs.refetch()} />;

  const extraction = stage.kind === 'form' ? stage.extraction : undefined;
  const defaults: Partial<RequestFormValues> | undefined = extraction
    ? {
        patientFirstName: extraction.fields.patientFirstName?.value,
        patientLastName: extraction.fields.patientLastName?.value,
        patientDob: extraction.fields.patientDob?.value,
        patientPhone: extraction.fields.patientPhone?.value,
        medicationName: extraction.fields.medicationName?.value,
        strength: extraction.fields.strength?.value,
        quantity: extraction.fields.quantity ? Number(extraction.fields.quantity.value) : undefined,
        sig: extraction.fields.sig?.value,
        prescriberName: extraction.fields.prescriberName?.value,
        notes: extraction.fields.notes?.value,
        reportedDaysSupplyLeft: daysLeftFrom(extraction.fields.notes?.value),
      }
    : undefined;

  return (
    <div>
      <Link to="/pharmacy/requests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700">
        <ArrowLeft className="size-4" /> Back to requests
      </Link>
      <PageHeader
        eyebrow="New refill request"
        title={
          <>
            <span className="font-light">Send a</span> <span className="font-bold">refill request</span>
          </>
        }
        description="Paste or upload the fax you'd normally send — RefillBridge reads it, you check it, and the practice gets a case that's already triaged."
      />
      <AnimatePresence mode="wait">
        {stage.kind === 'input' && (
          <motion.div key="input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="mb-4 inline-flex rounded-xl bg-white p-1 ring-1 ring-line" role="tablist" aria-label="Input method">
              {[
                { v: 'fax' as const, l: 'Paste or upload a fax', i: <ScanText className="size-4" /> },
                { v: 'manual' as const, l: 'Type the details', i: <Keyboard className="size-4" /> },
              ].map((t) => (
                <button key={t.v} role="tab" type="button" aria-selected={tab === t.v} onClick={() => setTab(t.v)} className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition', tab === t.v ? 'bg-brand-700 text-white shadow-sm' : 'text-ink-600 hover:bg-ice-100')}>
                  {t.i} {t.l}
                </button>
              ))}
            </div>
            {tab === 'fax' ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <Card className="p-5">
                  <Textarea
                    label="Fax text"
                    value={faxText}
                    onChange={(e) => setFaxText(e.target.value)}
                    maxLength={8000}
                    className="min-h-72 font-mono text-[13px]"
                    placeholder="Paste the fax or e-fax text here…"
                    hint={`${faxText.length.toLocaleString()} / 8,000 characters · treated as untrusted data`}
                    labelAction={
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => setFaxText(SAMPLE_FAX)} className="rounded-md px-2 py-0.5 text-[12px] font-medium text-brand-700 hover:bg-brand-50">
                          Use sample fax
                        </button>
                        <button type="button" onClick={() => setFaxText(INJECTION_FAX)} className="rounded-md px-2 py-0.5 text-[12px] font-medium text-bad-700 hover:bg-bad-50">
                          Suspicious sample
                        </button>
                      </div>
                    }
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-400">
                      <Sparkles className="size-3.5" /> Demo AI (mock) · fields under 75% confidence need your confirmation
                    </span>
                    <Button size="lg" icon={<Wand2 className="size-4" />} loading={extract.isPending && !upload.isPending} disabled={!faxText.trim()} onClick={() => extract.mutate({ text: faxText })}>
                      Read fax with AI
                    </Button>
                  </div>
                </Card>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    onFile(e.dataTransfer.files[0]);
                  }}
                  className={cn('flex flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed p-8 text-center transition', dragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-white/70')}
                >
                  <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <UploadCloud className="size-7 animate-float" aria-hidden />
                  </div>
                  <p className="font-medium text-ink-900">Drop a fax file here</p>
                  <p className="mt-1 text-sm text-ink-500">PDF, PNG or JPEG · up to 10 MB · stored privately</p>
                  <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" id="fax-file" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
                  <Button variant="secondary" className="mt-4" icon={<FileUp className="size-4" />} loading={upload.isPending || (extract.isPending && Boolean(upload.data))} onClick={() => fileRef.current?.click()}>
                    Choose file
                  </Button>
                </div>
              </div>
            ) : (
              <RequestForm mode="pharmacy" orgs={orgs.data ?? []} lockedPharmacyName={user?.orgName} submitting={create.isPending} onSubmit={(v) => create.mutate(v)} />
            )}
          </motion.div>
        )}

        {stage.kind === 'form' && (
          <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            {stage.notice && (
              <p role="status" className="rounded-xl border border-warn-600/25 bg-warn-50 px-4 py-3 text-sm text-warn-700">
                {stage.notice}
              </p>
            )}
            {extraction?.injectionSuspected && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-bad-600/25 bg-bad-50 px-4 py-3 text-sm text-bad-700">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" /> This document contains unusual instructions. Review carefully — they were ignored and will be flagged for the practice.
              </p>
            )}
            {extraction && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
                <CheckCircle2 className="size-4 text-ok-600" /> Read {Object.keys(extraction.fields).length} fields in {(extraction.latencyMs / 1000).toFixed(1)} s ·{' '}
                <span className="rounded-full bg-info-50 px-2 py-0.5 text-[11.5px] font-medium text-info-700">Demo AI (mock)</span> Green = confident · Amber = please confirm
              </p>
            )}
            <RequestForm
              mode="pharmacy"
              orgs={orgs.data ?? []}
              lockedPharmacyName={user?.orgName}
              defaults={defaults}
              extraction={extraction?.fields}
              submitting={create.isPending}
              onSubmit={(v) => create.mutate(v)}
              aside={
                <Card className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line bg-ice-50 px-4 py-2.5">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="size-4 text-brand-600" /> {stage.fileName ?? 'Original fax'}
                    </p>
                    <button type="button" onClick={() => setStage({ kind: 'input' })} className="text-[12.5px] font-medium text-brand-700 hover:underline">
                      Start over
                    </button>
                  </div>
                  <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12.5px] leading-relaxed text-ink-700">{stage.faxText ?? `Uploaded file: ${stage.fileName}\n\n(The demo AI can't OCR images — it returns a labelled sample with lower confidence so you can practise confirming fields.)`}</pre>
                </Card>
              }
            />
          </motion.div>
        )}

        {stage.kind === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-xl">
            <Card className="p-8 text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }} className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-ok-50 text-ok-600">
                <CheckCircle2 className="size-9" />
              </motion.div>
              <h2 className="text-2xl font-light text-brand-900">
                Request <span className="font-bold">{stage.detail.case.caseNumber}</span> sent
              </h2>
              <div className="mt-3 flex justify-center">
                <StatusBadge status={stage.detail.case.status} />
              </div>
              <p className="mt-3 text-sm text-ink-600">{stage.detail.view === 'pharmacy' ? stage.detail.case.nextStep : ''}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link to={`/cases/${stage.detail.case.id}`}>
                  <Button>Track this request</Button>
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFaxText('');
                    setStage({ kind: 'input' });
                  }}
                >
                  Send another
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function daysLeftFrom(notes: string | undefined): number | undefined {
  const m = notes?.match(/(\d+)\s*days?\s*left/i);
  return m ? Number(m[1]) : undefined;
}
