import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertTriangle, ArrowRight, Check, Clock, EyeOff, Lock, Phone, ShieldCheck, Store } from 'lucide-react';
import type { PatientStatusView } from '@shared/dto.ts';
import { dobVerifySchema } from '@shared/schemas/index.ts';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Logo } from '@/components/ui/Layout';
import { friendlyMessage, refillService } from '@/services';
import { cn, formatDateTime } from '@/lib/format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1899 }, (_, i) => String(THIS_YEAR - i));
const daysIn = (month: string, year: string) => (month ? new Date(Number(year) || 2000, Number(month), 0).getDate() : 31);
const pad = (n: string) => n.padStart(2, '0');

export default function PatientStatusPage() {
  const { token = '' } = useParams();
  const verify = useMutation({ mutationFn: (dob: string) => refillService.verifyPatientStatus(token, dob) });

  return (
    <div className="hero-backdrop relative min-h-screen overflow-x-hidden">
      <div className="window-light pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-24 size-72 rounded-full bg-brand-200/40 blur-3xl" aria-hidden />

      <header className="relative mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <Logo />
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600">
          <Lock className="size-3.5 text-brand-600" aria-hidden />
          Secure prescription update
        </p>
      </header>

      <main className="relative mx-auto max-w-3xl px-4 pb-10 pt-8 sm:px-6 sm:pt-12">
        {verify.data ? <StatusView view={verify.data} /> : <DobForm onVerify={(dob) => verify.mutate(dob)} busy={verify.isPending} error={verify.error ? friendlyMessage(verify.error) : null} />}

        <p className="mx-auto mt-10 flex max-w-xl items-start justify-center gap-2 text-center text-[13px] leading-relaxed text-ink-500">
          <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>For your privacy this page never shows medication names. This link expires 7 days after it was sent.</span>
        </p>
      </main>
    </div>
  );
}

function DobForm({ onVerify, busy, error }: { onVerify: (dob: string) => void; busy: boolean; error: string | null }) {
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [company, setCompany] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const maxDay = daysIn(month, year);
  // Keep the chosen day valid when the month or year changes (e.g. 31 → February).
  const clampDay = (m: string, y: string) => {
    if (day && Number(day) > daysIn(m, y)) setDay('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!month || !day || !year) {
      setLocalError('Please choose your month, day and year of birth.');
      return;
    }
    const dob = `${year}-${pad(month)}-${pad(day)}`;
    const parsed = dobVerifySchema.safeParse({ dob, company });
    if (!parsed.success) {
      setLocalError('Please check the date and try again.');
      return;
    }
    setLocalError(null);
    onVerify(dob);
  };

  const shown = localError ?? error;

  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <div className="relative mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-[var(--shadow-soft)]">
          <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-brand-100" aria-hidden />
          <ShieldCheck className="relative size-7" aria-hidden />
        </div>
        <h1 className="text-[28px] leading-tight text-brand-900 sm:text-[32px]">
          <span className="font-light">Check your</span> <span className="font-bold">prescription update</span>
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-ink-600">To keep your information safe, please tell us your date of birth first.</p>
      </div>

      <form onSubmit={submit} noValidate className="glass relative rounded-2xl p-5 shadow-[var(--shadow-lift)] sm:p-7">
        <fieldset>
          <legend className="text-[15px] font-semibold text-ink-900">Your date of birth</legend>
          <div className="mt-3 grid grid-cols-[1.4fr_1fr_1.2fr] gap-2 sm:gap-3">
            <Select label="Month" value={month} onChange={(e) => {
                setMonth(e.target.value);
                clampDay(e.target.value, year);
              }} className="h-12 text-[15px]">
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {m}
                </option>
              ))}
            </Select>
            <Select
              label="Day"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-12 text-[15px]"
            >
              <option value="">Day</option>
              {Array.from({ length: maxDay }, (_, i) => String(i + 1)).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            <Select label="Year" value={year} onChange={(e) => {
                setYear(e.target.value);
                clampDay(month, e.target.value);
              }} className="h-12 text-[15px]">
              <option value="">Year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        </fieldset>

        {/* Honeypot: invisible to people and screen readers. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden opacity-0">
          <label>
            Company
            <input type="text" name="company" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
        </div>

        {shown && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-bad-600/25 bg-bad-50 px-3.5 py-3 text-[14px] leading-snug text-bad-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{shown}</span>
          </motion.p>
        )}

        <Button type="submit" size="lg" className="mt-5 w-full" loading={busy} iconRight={<ArrowRight className="size-4" aria-hidden />}>
          See my update
        </Button>
        <p className="mt-3 text-center text-[12.5px] text-ink-500">We only use this to confirm it's you.</p>
      </form>
    </motion.section>
  );
}

const STEP_LABELS = ['Request received', 'Being reviewed', 'Approved', 'At pharmacy', 'Ready'] as const;

function StatusView({ view }: { view: PatientStatusView }) {
  const labels = STEP_LABELS.map((l, i) => (i === 2 ? (view.step === 3 ? view.stepLabel : view.step < 3 ? 'Decision' : 'Approved') : l));
  const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09 } } }} className="space-y-6">
      <motion.div variants={item}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">Your prescription update</p>
        <h1 className="mt-2 text-[32px] leading-tight text-brand-900 sm:text-[40px]">
          <span className="font-bold">Hi {view.firstName}</span>
        </h1>
        <p className="mt-2 text-[17px] leading-relaxed text-ink-700 sm:text-lg">{view.headline}</p>
      </motion.div>

      <motion.section variants={item} aria-labelledby="progress-title" className="glass rounded-2xl p-5 shadow-[var(--shadow-soft)] sm:p-7">
        <h2 id="progress-title" className="sr-only">
          Progress
        </h2>
        <Tracker step={view.step} labels={labels} actionNeeded={view.actionNeeded} closed={view.closed} />
      </motion.section>

      {view.actionNeeded && (
        <motion.div variants={item} role="status" className="flex items-start gap-3 rounded-2xl border border-warn-600/30 bg-warn-50 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-warn-600 shadow-sm">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-warn-700">Action needed</p>
            <p className="mt-0.5 text-[15px] leading-relaxed text-ink-700">{view.nextStep}</p>
          </div>
        </motion.div>
      )}

      <motion.div variants={item} className="grid gap-4 sm:grid-cols-2">
        <section className="surface p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:col-span-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">What happens next</h2>
          <p className="mt-2 text-[16px] leading-relaxed text-ink-900">{view.nextStep}</p>
        </section>
        <section className="surface p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
          <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">
            <Phone className="size-3.5" aria-hidden />
            Questions?
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-700">
            Call {view.clinicName} at{' '}
            <a href={`tel:${view.clinicPhone.replace(/[^\d+]/g, '')}`} className="font-semibold text-brand-800 underline underline-offset-2 hover:text-brand-950">
              {view.clinicPhone}
            </a>
          </p>
        </section>
        <section className="surface p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
          <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">
            <Store className="size-3.5" aria-hidden />
            Your pharmacy
          </h2>
          <p className="mt-2 text-[15px] font-medium text-ink-900">{view.pharmacyName}</p>
        </section>
      </motion.div>

      <motion.p variants={item} className="flex items-center gap-1.5 text-[13px] text-ink-500">
        <Clock className="size-3.5" aria-hidden />
        Last updated {formatDateTime(view.updatedAt)}
      </motion.p>
    </motion.div>
  );
}

function Tracker({ step, labels, actionNeeded, closed }: { step: number; labels: readonly string[]; actionNeeded: boolean; closed: boolean }) {
  return (
    <ol aria-label="Progress" className="relative flex flex-col gap-0 sm:flex-row sm:gap-2">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step || (n === step && n === 5);
        const current = n === step && !done;
        const warn = current && actionNeeded;
        const state = done ? 'done' : current ? (warn ? 'needs your action' : 'in progress') : 'not started yet';
        return (
          <li key={label + n} aria-current={n === step ? 'step' : undefined} className="relative flex flex-1 items-start gap-3 pb-6 last:pb-0 sm:flex-col sm:items-center sm:gap-2.5 sm:pb-0 sm:text-center">
            {/* connector */}
            {n < labels.length && (
              <span aria-hidden className="absolute left-[17px] top-9 h-[calc(100%-36px)] w-0.5 overflow-hidden rounded-full bg-ice-300 sm:left-[calc(50%+22px)] sm:top-[17px] sm:h-0.5 sm:w-[calc(100%-44px+8px)]">
                <motion.span
                  className="block size-full origin-top bg-brand-500 sm:origin-left"
                  initial={{ scale: 0 }}
                  animate={{ scale: n < step ? 1 : 0 }}
                  transition={{ delay: 0.3 + i * 0.15, duration: 0.5, ease: 'easeOut' }}
                />
              </span>
            )}
            <span className="relative flex size-9 shrink-0 items-center justify-center">
              {current && <span className={cn('absolute inset-0 animate-pulse-ring rounded-full', warn ? 'bg-warn-600/30' : 'bg-brand-400/40')} aria-hidden />}
              <span
                className={cn(
                  'relative flex size-9 items-center justify-center rounded-full text-sm font-semibold ring-4 ring-white/80 transition-colors',
                  done && 'bg-brand-700 text-white',
                  current && !warn && 'bg-brand-600 text-white',
                  warn && 'bg-warn-600 text-white',
                  !done && !current && 'border-2 border-line-strong bg-white text-ink-500',
                )}
                aria-hidden
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : warn ? <AlertTriangle className="size-4" /> : n}
              </span>
            </span>
            <span className="min-w-0 pt-1.5 sm:pt-0">
              <span className={cn('block text-[15px] leading-snug sm:text-[13.5px]', done || current ? 'font-semibold text-ink-900' : 'text-ink-500')}>{label}</span>
              <span className={cn('block text-[12.5px]', warn ? 'font-medium text-warn-700' : current ? 'text-brand-700' : 'text-ink-500', !current && 'sm:sr-only')}>
                {closed && current ? 'Closed' : state.charAt(0).toUpperCase() + state.slice(1)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
