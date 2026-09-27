// Small building blocks shared by the settings pages.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, CheckCircle2, Copy, Hourglass, MailCheck, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/Badges';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/format';

export const fadeUp = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay: 0.05 * i, ease: 'easeOut' as const },
});

/** Section heading used inside the settings layout (the layout owns the page <h1>). */
export function SectionHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div {...fadeUp(0)} className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-light text-brand-900">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </motion.div>
  );
}

export function Callout({ icon, tone = 'info', children, className }: { icon: ReactNode; tone?: 'info' | 'warn' | 'brand'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'border-info-600/20 bg-info-50 text-info-700',
    warn: 'border-warn-600/25 bg-warn-50 text-warn-700',
    brand: 'border-brand-200 bg-brand-50 text-brand-800',
  };
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function ConfirmModal({ open, onClose, onConfirm, title, description, confirmLabel, tone = 'default', loading, icon, children }: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title={title}
      description={description}
      size="sm"
      tone={tone === 'danger' ? 'danger' : 'default'}
      icon={icon}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? <p className="text-sm text-ink-600">You can change this again later.</p>}
    </Modal>
  );
}

/** Read-only value + copy button (falls back to selecting the text when the clipboard API is unavailable). */
export function CopyField({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      inputRef.current?.select();
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-700">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-input)] border border-line-strong bg-ice-50 px-3 font-mono text-[12.5px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
        <Button variant="secondary" onClick={() => void copy()} icon={copied ? <Check className="size-4 text-ok-600" aria-hidden /> : <Copy className="size-4" aria-hidden />} aria-live="polite">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-[12.5px] text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}

const ic = 'size-3.5 shrink-0';

export function MfaBadge({ enrolled, verifiedNow }: { enrolled: boolean; verifiedNow?: boolean }) {
  if (verifiedNow)
    return (
      <Badge tone="ok" icon={<ShieldCheck className={ic} aria-hidden />}>
        Enabled — verified this session
      </Badge>
    );
  if (enrolled)
    return (
      <Badge tone="ok" icon={<ShieldCheck className={ic} aria-hidden />}>
        Enabled
      </Badge>
    );
  return (
    <Badge tone="muted" icon={<ShieldOff className={ic} aria-hidden />}>
      Not set up
    </Badge>
  );
}

export function MfaShortBadge({ enrolled, required }: { enrolled: boolean; required: boolean }) {
  if (enrolled)
    return (
      <Badge tone="ok" icon={<ShieldCheck className={ic} aria-hidden />}>
        MFA on
      </Badge>
    );
  return (
    <Badge tone={required ? 'warn' : 'muted'} icon={required ? <ShieldAlert className={ic} aria-hidden /> : <ShieldOff className={ic} aria-hidden />} title={required ? 'Required for this role' : undefined}>
      {required ? 'MFA needed' : 'MFA off'}
    </Badge>
  );
}

export function MemberStatusBadge({ status }: { status: 'invited' | 'active' | 'removed' }) {
  if (status === 'invited')
    return (
      <Badge tone="info" icon={<MailCheck className={ic} aria-hidden />}>
        Invited
      </Badge>
    );
  if (status === 'active')
    return (
      <Badge tone="ok" icon={<CheckCircle2 className={ic} aria-hidden />}>
        Active
      </Badge>
    );
  return (
    <Badge tone="muted" icon={<Hourglass className={ic} aria-hidden />}>
      Removed
    </Badge>
  );
}
