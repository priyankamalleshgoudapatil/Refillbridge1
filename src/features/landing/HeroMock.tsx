import { useEffect, useState } from 'react';
import { CalendarClock, Check, CheckCircle2, Inbox, MessageSquareText, PackageCheck, RefreshCcw, Send, Stethoscope, Timer, UserRound } from 'lucide-react';
import { cn } from '@/lib/format';
import { Reveal } from './landing-ui';

const STATES = [
  { label: 'Received', icon: Inbox, owner: 'Practice staff', tone: 'bg-info-50 text-info-700 ring-info-600/25' },
  { label: 'Waiting on provider', icon: Stethoscope, owner: 'Dr. Rao', tone: 'bg-brand-50 text-brand-800 ring-brand-200' },
  { label: 'Approved', icon: CheckCircle2, owner: 'Dr. Rao', tone: 'bg-ok-50 text-ok-700 ring-ok-600/25' },
  { label: 'Sent to pharmacy', icon: Send, owner: 'CityCare Pharmacy', tone: 'bg-info-50 text-info-700 ring-info-600/25' },
  { label: 'Pharmacy confirmed', icon: PackageCheck, owner: 'CityCare Pharmacy', tone: 'bg-ok-50 text-ok-700 ring-ok-600/25' },
] as const;

const SMS = ['We got your refill request.', 'Your provider is reviewing it.', 'Approved — sending to your pharmacy.', 'Sent to CityCare Pharmacy.', 'CityCare has your prescription.'];

/** Illustrated product mock (pure HTML/CSS): a case card cycling through its lifecycle. Decorative. */
export function HeroMock() {
  const [reduce, setReduce] = useState(false);
  const [i, setI] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduce(isReduced);
    if (isReduced) {
      setI(STATES.length - 1);
      return;
    }
    
    const t = setInterval(() => setI((x) => (x + 1) % STATES.length), 2200);
    
    const handleScroll = () => {
      requestAnimationFrame(() => setScrollY(window.scrollY));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      clearInterval(t);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const s = STATES[i];
  const resolved = i >= 2;

  return (
    <div className="relative mx-auto w-full max-w-[460px] select-none pb-10 pt-6 sm:pb-14" style={!reduce ? { transform: `translateY(${scrollY * 0.1}px)` } : undefined} aria-hidden>
      {/* soft blobs */}
      <div className="animate-float-slow absolute -left-10 top-6 size-56 rounded-full bg-brand-300/40 blur-3xl" style={{ animationDelay: '-2s' }} />
      <div className="animate-float-slow absolute -right-6 bottom-0 size-64 rounded-full bg-brand-200/60 blur-3xl" style={{ animationDelay: '-5s' }} />
      <div className="absolute left-1/3 top-1/3 size-40 rounded-full bg-white/90 blur-2xl" />


      {/* case card */}
      <Reveal
        delay={200}
        inViewOverride={true}
        className="glass relative z-10 rounded-2xl p-5 shadow-[var(--shadow-lift)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11.5px] text-ink-500">RB-1042 · Portal intake</p>
            <p className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-ink-900">
              <span className="flex size-7 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800">ML</span>
              M.L. <span className="font-normal text-ink-400">·</span> <span className="truncate font-medium text-ink-700">Metformin 1000 mg</span>
            </p>
          </div>
          <div className="relative h-6 flex items-start">
            <span
              key={s.label}
              className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset animate-pop-in', s.tone)}
            >
              <s.icon className="size-3.5" />
              <span className="hidden min-[400px]:inline">{s.label}</span>
            </span>
          </div>
        </div>

        {/* blockers */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset transition-all duration-500', resolved ? 'bg-white text-ink-400 line-through ring-line' : 'bg-brand-50 text-brand-800 ring-brand-200')}>
            <RefreshCcw className="size-3" /> No refills remaining <span className="font-mono text-[10px] opacity-70">R6</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-[11.5px] font-medium text-warn-700 ring-1 ring-inset ring-warn-600/25">
            <CalendarClock className="size-3" /> A1c overdue <span className="font-mono text-[10px] opacity-70">R7</span>
          </span>
        </div>

        {/* timeline */}
        <ol className="mt-5 space-y-2.5">
          {STATES.map((st, idx) => {
            const done = idx < i;
            const now = idx === i;
            return (
              <li key={st.label} className="flex items-center gap-3">
                <span className="relative flex size-6 shrink-0 items-center justify-center">
                  {now && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-400/40" />}
                  <span className={cn('relative flex size-6 items-center justify-center rounded-full text-[10px] font-semibold transition-colors duration-500', done ? 'bg-brand-700 text-white' : now ? 'bg-brand-500 text-white' : 'border border-line-strong bg-white text-ink-400')}>
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : idx + 1}
                  </span>
                </span>
                <span className={cn('flex-1 text-[13px] transition-colors duration-500', done || now ? 'font-medium text-ink-900' : 'text-ink-400')}>{st.label}</span>
                {now && (
                  <span className="hidden items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-600 shadow-sm ring-1 ring-line min-[400px]:inline-flex animate-fade-in">
                    <UserRound className="size-3" /> {st.owner}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* progress */}
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-ice-200">
          <div
            className="h-full w-full rounded-full bg-gradient-to-r from-brand-400 to-brand-700 transition-transform duration-700 ease-out origin-left"
            style={{ transform: `scaleX(${(i + 1) / STATES.length})` }}
          />
        </div>
      </Reveal>

      {/* floating SMS bubble */}
      <Reveal
        delay={700}
        inViewOverride={true}
        className="absolute -bottom-1 right-0 w-[210px] sm:-right-6 sm:bottom-2 z-20"
      >
        <div className="glass animate-float rounded-2xl rounded-br-md p-3 shadow-[var(--shadow-lift)]">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brand-600">
            <MessageSquareText className="size-3.5" /> SMS to patient
          </p>
          <p key={i} className="mt-1 text-[12.5px] leading-snug text-ink-700 animate-fade-in">
            {SMS[i]}
          </p>
        </div>
      </Reveal>

      {/* floating stat pill */}
      <Reveal delay={900} inViewOverride={true} className="absolute -top-1 left-2 sm:-left-8 sm:top-0 z-20">
        <div className="glass flex animate-float items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 shadow-[var(--shadow-soft)] [animation-delay:-3s]">
          <span className="flex size-7 items-center justify-center rounded-full bg-ok-50 text-ok-600">
            <Timer className="size-4" />
          </span>
          <span className="text-[12px] text-ink-600">
            Resolved in <span className="font-semibold text-ink-900">3 h 12 m</span>
          </span>
        </div>
      </Reveal>
    </div>
  );
}
