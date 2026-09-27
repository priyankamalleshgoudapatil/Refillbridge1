// Small building blocks shared by the auth pages.
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, Info, X } from 'lucide-react';
import { PASSWORD_RULES, passwordIssues } from '@shared/schemas/index.ts';
import { Input } from '@/components/ui/Field';
import { cn } from '@/lib/format';

/** Only allow same-origin relative paths as post-login redirects (no protocol-relative `//evil.com`). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

type Tone = 'error' | 'info' | 'success' | 'warning';
const toneStyles: Record<Tone, string> = {
  error: 'border-bad-600/25 bg-bad-50 text-bad-700',
  info: 'border-info-600/20 bg-info-50 text-info-700',
  success: 'border-ok-600/25 bg-ok-50 text-ok-700',
  warning: 'border-warn-600/25 bg-warn-50 text-warn-700',
};
const toneIcons: Record<Tone, ReactNode> = {
  error: <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />,
  info: <Info className="mt-0.5 size-4 shrink-0" aria-hidden />,
  success: <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />,
  warning: <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />,
};

/** Form-level message. Errors use role="alert", everything else role="status". */
export function FormAlert({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13.5px] leading-snug', toneStyles[tone], className)}
    >
      {toneIcons[tone]}
      <div className="min-w-0">{children}</div>
    </motion.div>
  );
}

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; error?: string; hint?: ReactNode; labelAction?: ReactNode };

/** Password field with an accessible show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput({ label, className, ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} label={label} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...rest} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1.5 top-[30px] flex size-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-brand-50 hover:text-brand-800"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
});

/** Live password policy checklist — every rule shows an icon AND text, never colour alone. */
export function PasswordChecklist({ password, email, name, id }: { password: string; email?: string; name?: string; id?: string }) {
  const issues = new Set(passwordIssues(password, { email, name }));
  const rules: { id: string; label: string; ok: boolean }[] = [
    ...PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) })),
    { id: 'personal', label: 'Must not contain your email or name', ok: password.length > 0 && !issues.has('Must not contain your email') && !issues.has('Must not contain your name') },
  ];
  return (
    <ul id={id} aria-label="Password requirements" className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-line bg-ice-50/80 p-3 sm:grid-cols-2">
      {rules.map((r) => (
        <li key={r.id} className={cn('flex items-center gap-1.5 text-[12.5px] transition-colors', r.ok ? 'text-ok-700' : 'text-ink-500')}>
          <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full transition-colors', r.ok ? 'bg-ok-600 text-white' : 'bg-ice-200 text-ink-500')} aria-hidden>
            {r.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={2.5} />}
          </span>
          <span>
            {r.label}
            <span className="sr-only">{r.ok ? ' — met' : ' — not met yet'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Visually hidden, screen-reader hidden, untabbable honeypot input. */
export const Honeypot = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { name: string }>(function Honeypot(props, ref) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] top-auto h-px w-px overflow-hidden opacity-0">
      <label>
        Leave this field empty
        <input ref={ref} type="text" tabIndex={-1} autoComplete="off" {...props} />
      </label>
    </div>
  );
});

/** Centered success / info panel used after a form completes. */
export function ResultPanel({ icon, title, children, tone = 'ok' }: { icon: ReactNode; title: string; children?: ReactNode; tone?: 'ok' | 'bad' | 'brand' }) {
  const ring = tone === 'ok' ? 'bg-ok-50 text-ok-600' : tone === 'bad' ? 'bg-bad-50 text-bad-600' : 'bg-brand-50 text-brand-600';
  const pulse = tone === 'ok' ? 'bg-ok-50' : tone === 'bad' ? 'bg-bad-50' : 'bg-brand-100';
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center" role="status">
      <div className={cn('relative mb-4 flex size-14 items-center justify-center rounded-2xl', ring)}>
        <span className={cn('absolute inset-0 animate-pulse-ring rounded-2xl', pulse)} aria-hidden />
        <span className="relative">{icon}</span>
      </div>
      <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      {children && <div className="mt-2 w-full text-sm leading-relaxed text-ink-600">{children}</div>}
    </motion.div>
  );
}
