import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, FileLock2, ShieldCheck, Users } from 'lucide-react';
import { Logo } from '@/components/ui/Layout';

const TRUST_POINTS = [
  { icon: ShieldCheck, title: 'MFA on every clinical decision', text: 'Providers confirm the exact order before it is sent.' },
  { icon: FileLock2, title: 'Append-only audit trail', text: 'Every change is recorded with who, what and when.' },
  { icon: Users, title: 'Minimum-necessary sharing', text: 'Pharmacies see only what they need to fill.' },
];

interface AuthLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  /** Rendered under the form card (e.g. demo accounts). */
  below?: ReactNode;
  footer?: ReactNode;
}

/** Split-screen auth shell: brand panel (desktop) + form card. Mobile shows only the form with the logo on top. */
export function AuthLayout({ title, description, eyebrow, children, below, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 to-brand-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <div className="window-light pointer-events-none absolute inset-0 opacity-20" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-brand-400/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-[360px] rounded-full bg-brand-300/15 blur-3xl" aria-hidden />

        <Link to="/" className="relative w-fit rounded-lg [&_span.font-display]:text-brand-50">
          <Logo />
        </Link>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} className="relative max-w-md">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-200">Refill coordination</p>
          <blockquote className="mt-4 font-display text-[34px] leading-[1.15] tracking-tight text-white xl:text-[40px]">
            <span className="font-light">One shared case.</span> <span className="font-bold">One owner.</span> <span className="font-light">One next step.</span>
          </blockquote>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-100/85">The practice, the pharmacy and the patient finally look at the same thing — and nobody has to chase.</p>
        </motion.div>

        <ul className="relative space-y-4">
          {TRUST_POINTS.map((p, i) => (
            <motion.li
              key={p.title}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.1, duration: 0.45 }}
              className="flex items-start gap-3"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                <p.icon className="size-[18px] text-brand-100" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{p.title}</span>
                <span className="block text-[13px] text-brand-100/75">{p.text}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      </aside>

      <main className="hero-backdrop relative flex min-h-screen flex-col overflow-hidden px-4 py-6 sm:px-8 lg:py-10">
        <div className="window-light pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <div className="relative flex items-center justify-between gap-4">
          <Link to="/" className="rounded-lg lg:hidden">
            <Logo />
          </Link>
          <Link to="/" className="ml-auto inline-flex items-center gap-1.5 rounded-md px-1 text-[13px] font-medium text-ink-600 transition-colors hover:text-brand-800">
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to home
          </Link>
        </div>

        <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-8">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="glass rounded-2xl p-6 shadow-[var(--shadow-lift)] sm:p-8">
            {eyebrow && <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>}
            <h1 className="mt-1.5 text-[26px] leading-tight text-brand-900 sm:text-[28px]">{title}</h1>
            {description && <p className="mt-2 text-sm leading-relaxed text-ink-600">{description}</p>}
            <div className="mt-6">{children}</div>
          </motion.div>
          {footer && <div className="mt-5 text-center text-sm text-ink-600">{footer}</div>}
          {below && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45 }} className="mt-6">
              {below}
            </motion.div>
          )}
        </div>
        <p className="relative text-center text-[12px] text-ink-500">Synthetic demo data only. Not for clinical use.</p>
      </main>
    </div>
  );
}
