import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowDownRight,
  Bell,
  BellRing,
  Bot,
  Building2,
  ClipboardCheck,
  EyeOff,
  FileLock2,
  FileText,
  Fingerprint,
  Gavel,
  Inbox,
  KeyRound,
  Layers,
  ScanText,
  ScrollText,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Layout';
import { HeroMock } from './HeroMock';
import { Reveal, RevealSection, RevealGroup, SectionHeading, Eyebrow, AnimatedNumber } from './landing-ui';
import { PilotForm } from './PilotForm';
import { RoiCalculator } from './RoiCalculator';
import { CapsuleAnimation } from '@/components/ui/CapsuleAnimation';

const NAV = [
  ['How it works', '#how-it-works'],
  ['Intelligence', '#intelligence'],
  ['Security', '#security'],
  ['ROI', '#roi'],
  ['Pricing', '#pricing'],
] as const;

const card = 'surface p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]';

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-ice-50">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="RefillBridge home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
            {NAV.map(([l, h]) => (
              <a key={h} href={h} className="text-sm text-ink-600 transition hover:text-brand-800">
                {l}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/sign-in" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/sign-in">
              <Button size="sm" iconRight={<ArrowRight className="size-4" />}>
                Try the live demo
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <RevealSection inViewOverride={true} className="hero-backdrop relative overflow-hidden">
          <div className="window-light pointer-events-none absolute inset-0 opacity-70" aria-hidden />
          <div className="animate-float-slow pointer-events-none absolute -right-32 top-10 size-[480px] rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
          <div className="relative mx-auto grid max-w-[1400px] items-center gap-8 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.1fr_minmax(280px,360px)_1.15fr] lg:gap-6 xl:gap-8 lg:pb-28 lg:pt-16">
            {/* Left Column: Text & Actions */}
            <RevealGroup inViewOverride={true}>
              <Reveal delay={0}>
                <Eyebrow>For physician practices &amp; their pharmacies</Eyebrow>
              </Reveal>
              <Reveal delay={80} as="h1" className="mt-4 text-[42px] leading-[1.06] text-brand-950 sm:text-[56px] xl:text-[62px]">
                <span className="font-bold tracking-tight text-ink-900">Stuck refill?</span>
                <br />
                <span className="font-extrabold text-brand-600">We move it forward.</span>
              </Reveal>
              <Reveal delay={160} as="p" className="mt-5 max-w-lg text-base leading-relaxed text-ink-600 sm:text-lg">
                RefillBridge turns scattered calls, messages, approvals and pharmacy requests into{' '}
                <strong className="font-semibold text-brand-900">one visible, trackable workflow</strong> — from the first request to pharmacy confirmation.
              </Reveal>
              <Reveal delay={240} className="mt-8 flex flex-wrap gap-3">
                <Link to="/sign-in">
                  <Button size="lg" iconRight={<ArrowRight className="size-4" />}>
                    Try the live demo
                  </Button>
                </Link>
                <a href="#pilot">
                  <Button size="lg" variant="secondary">
                    Request a pilot
                  </Button>
                </a>
              </Reveal>

              {/* 4 process steps from Reference 1 */}
              <Reveal delay={300} className="mt-8">
                <div className="flex items-center gap-2 sm:gap-3">
                  {[
                    { icon: FileText, label: 'IDENTIFY' },
                    { icon: Users, label: 'ROUTE' },
                    { icon: Settings, label: 'RESOLVE' },
                    { icon: Bell, label: 'INFORM' },
                  ].map((step, idx, arr) => (
                    <div key={step.label} className="flex items-center gap-2 sm:gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex size-8 sm:size-9 items-center justify-center rounded-full border border-brand-200/90 bg-white/90 text-brand-600 shadow-sm backdrop-blur-sm">
                          <step.icon className="size-3.5 sm:size-4" />
                        </div>
                        <span className="text-[9.5px] sm:text-[10.5px] font-semibold tracking-wider text-ink-500">
                          {step.label}
                        </span>
                      </div>
                      {idx < arr.length - 1 && (
                        <div className="h-px w-3 sm:w-6 bg-brand-200/80 -mt-4" />
                      )}
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={360} className="mt-6 flex items-start gap-3 text-sm text-ink-600">
                <ArrowDownRight className="mt-0.5 size-5 text-brand-500 shrink-0" aria-hidden />
                <p className="max-w-sm uppercase tracking-[0.12em] text-[12px] leading-relaxed">
                  With empathy and precision, <strong className="text-brand-800">we help patients</strong> get the medication they already take.
                </p>
              </Reveal>
            </RevealGroup>

            {/* Middle Column: 3D Animated Pharmaceutical Capsule in the MIDDLE of the page */}
            <div className="relative flex items-center justify-center py-6 lg:py-0 z-20">
              {/* Soft ambient radial aura */}
              <div className="pointer-events-none absolute size-72 sm:size-88 rounded-full bg-brand-300/35 blur-3xl" />

              <CapsuleAnimation
                scale={1.35}
                unit="clamp(2.4px, 0.28vw + 1.2px, 3.4px)"
                className="drop-shadow-[0_16px_48px_rgba(0,143,140,0.3)]"
              />

              {/* Floating glossy teal spheres matching reference visual */}
              {[
                { size: 22, top: '-6%', left: '-10%', delay: '0s', opacity: 0.8 },
                { size: 12, top: '14%', right: '-6%', delay: '-1.5s', opacity: 0.7 },
                { size: 16, bottom: '6%', left: '-8%', delay: '-3s', opacity: 0.75 },
                { size: 10, top: '4%', left: '44%', delay: '-4.2s', opacity: 0.6 },
                { size: 24, bottom: '-4%', right: '2%', delay: '-2.5s', opacity: 0.7 },
                { size: 14, top: '50%', right: '-12%', delay: '-5s', opacity: 0.65 },
              ].map((sphere, idx) => (
                <div
                  key={`center-sphere-${idx}`}
                  className="animate-float-slow pointer-events-none absolute z-10 rounded-full"
                  style={{
                    width: sphere.size,
                    height: sphere.size,
                    top: sphere.top,
                    bottom: sphere.bottom,
                    left: sphere.left,
                    right: sphere.right,
                    animationDelay: sphere.delay,
                    opacity: sphere.opacity,
                    background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.98), rgba(40,230,221,0.7) 48%, rgba(0,143,140,0.85) 100%)`,
                    boxShadow: `0 0 ${sphere.size * 0.8}px rgba(40,230,221,0.6), inset 0 -${sphere.size * 0.15}px ${sphere.size * 0.3}px rgba(0,0,0,0.2)`,
                  }}
                />
              ))}
            </div>

            {/* Right Column: Case Card Lifecycle */}
            <HeroMock />
          </div>
        </RevealSection>

        {/* Problem */}
        <RevealSection className="mx-auto max-w-7xl px-4 py-24 sm:px-6" aria-labelledby="problem">
          <SectionHeading
            id="problem"
            eyebrow="The problem"
            light="Where refills"
            bold="get stuck"
            lede="Everyone has software. Nobody owns the refill's state across organisations — so it bounces, and the patient hears nothing."
          />
          <RevealGroup as="ol" className="mt-12 flex flex-wrap items-center gap-2 sm:gap-3">
            {[
              [<UserRound key="p" className="size-4" />, 'Patient'],
              [<Building2 key="ph" className="size-4" />, 'Pharmacy'],
              [<Stethoscope key="pr" className="size-4" />, 'Provider'],
              [<Users key="s" className="size-4" />, 'Practice staff'],
              [<UserRound key="p2" className="size-4" />, 'Patient'],
              [<Stethoscope key="pr2" className="size-4" />, 'Provider'],
              [<Building2 key="ph2" className="size-4" />, 'Pharmacy'],
            ].map(([icon, label], i, arr) => (
              <Reveal as="li" key={i} delay={i * 80} className="flex items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-[var(--shadow-soft)]">
                  <span className="text-brand-600">{icon}</span>
                  {label}
                </span>
                {i < arr.length - 1 && <ArrowRight className="size-4 text-ink-400" aria-hidden />}
              </Reveal>
            ))}
          </RevealGroup>
          <Reveal delay={240} as="p" className="mt-4 text-sm text-ink-500">Phone calls, faxes, portals, EHRs — and the patient's row is empty from request to decision.</Reveal>
          <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { num: 5, prefix: '3–', suffix: ' days', label: 'a typical stall when a provider is needed' },
              { num: 6, suffix: '+ hand-offs', label: 'between four parties for one refill' },
              { num: 0, label: 'shared view of who acts next' },
            ].map((stat, i) => (
              <Reveal key={stat.label} delay={i * 100} variant="scale" className={card}>
                <p className="font-display text-4xl font-light text-brand-800">
                  {stat.prefix}<AnimatedNumber value={stat.num} delay={i * 100} format={(v) => Math.round(v).toString()} />{stat.suffix}
                </p>
                <p className="mt-2 text-sm text-ink-600">{stat.label}</p>
              </Reveal>
            ))}
          </RevealGroup>
          <Reveal delay={360} as="p" className="mt-3 text-[12px] text-ink-400">Illustrative figures.</Reveal>
        </RevealSection>

        {/* How it works */}
        <RevealSection id="how-it-works" className="border-y border-line bg-white py-24" aria-labelledby="how">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading id="how" eyebrow="How it works" light="From stuck" bold="to solved" lede="Every open case always has exactly one owner, one next action and one due time." />
            <RevealGroup as="ol" className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: <ScanText className="size-5" />, t: 'Intake', d: 'Fax, portal, eRx or phone. AI reads messy faxes; staff confirm low-confidence fields.' },
                { icon: <Workflow className="size-5" />, t: 'Triage', d: 'Deterministic rules R1–R10 find the blocker on arrival — no refills, visit due, A1c overdue, insurance.' },
                { icon: <Gavel className="size-5" />, t: 'Decide', d: 'The provider sees a sourced summary and decides. MFA + an order-restating confirmation. Never automatic.' },
                { icon: <ClipboardCheck className="size-5" />, t: 'Close the loop', d: 'The case closes only when the pharmacy confirms. Silence escalates. The patient gets plain-language updates.' },
              ].map((s, i) => (
                <Reveal as="li" key={s.t} delay={i * 100} className={`${card} relative`}>
                  <span className="absolute right-5 top-5 font-mono text-xs text-ink-400">0{i + 1}</span>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{s.icon}</span>
                  <h3 className="mt-4 text-lg font-semibold text-ink-900">{s.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.d}</p>
                </Reveal>
              ))}
            </RevealGroup>
          </div>
        </RevealSection>

        {/* Intelligence */}
        <RevealSection id="intelligence" className="mx-auto max-w-7xl px-4 py-24 sm:px-6" aria-labelledby="intel">
          <SectionHeading id="intel" eyebrow="Intelligence" light="Responsible" bold="autonomy" lede="Deterministic orchestration first. AI is a tool for messy language. Clinical decisions stay with authorized professionals." />
          <RevealGroup className="mt-12 grid gap-5 lg:grid-cols-3">
            {[
              { icon: <Layers className="size-5" />, t: 'Rules decide', d: 'A state machine and rules engine own every transition. Predictable, testable, and every event records the rule ID that caused it.' },
              { icon: <Bot className="size-5" />, t: 'AI assists', d: 'Reads faxes, summarises cases with source links, drafts patient messages. It suggests — it never acts. Every call is logged.' },
              { icon: <Fingerprint className="size-5" />, t: 'Humans approve', d: 'Providers make every clinical decision with MFA. Staff confirm AI routing and review any free-text message before it goes out.' },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 100} className={card}>
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{c.icon}</span>
                <h3 className="mt-4 text-lg font-semibold">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{c.d}</p>
              </Reveal>
            ))}
          </RevealGroup>
          <Reveal delay={300} className="mt-6 rounded-2xl bg-gradient-to-br from-brand-800 to-brand-950 p-6 text-white sm:p-8">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-300">AI never</p>
            <ul className="mt-3 grid gap-2 text-[15px] sm:grid-cols-2">
              {['Approves, denies or changes an order', 'Touches controlled-substance cases', 'Decides patient identity matches', 'Grants permissions or builds queries'].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-brand-300" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          </Reveal>
        </RevealSection>

        {/* Security */}
        <RevealSection id="security" className="border-y border-line bg-white py-24" aria-labelledby="sec">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading id="sec" eyebrow="Security & trust" light="Built for" bold="health data" />
            <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [<KeyRound key="1" className="size-5" />, 'MFA on clinical decisions', 'Step-up verification for every decision and admin action.'],
                [<ShieldCheck key="2" className="size-5" />, 'Row-level multi-tenancy', 'Each practice and pharmacy sees only its own records.'],
                [<ScrollText key="3" className="size-5" />, 'Append-only audit log', 'Every view of patient data is recorded and immutable.'],
                [<FileLock2 key="4" className="size-5" />, 'Field-level encryption', 'AES-256-GCM for DOB, phone and email.'],
                [<EyeOff key="5" className="size-5" />, 'Minimum necessary', 'Pharmacies see initials, medication and status — nothing clinical.'],
                [<BellRing key="6" className="size-5" />, 'Safe patient messages', 'No drug names in SMS; status pages need DOB and lock after 5 tries.'],
                [<Inbox key="7" className="size-5" />, 'Reliable delivery', 'Transactional outbox, retries, dead letters handed to humans.'],
                [<Building2 key="8" className="size-5" />, 'BAA-ready roadmap', 'Synthetic data in the demo; HIPAA vendors in production.'],
              ].map(([icon, t, d], i) => (
                <Reveal key={t as string} delay={i * 60} className="rounded-xl border border-line bg-ice-50 p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white">
                  <span className="text-brand-600">{icon}</span>
                  <p className="mt-3 font-semibold text-ink-900">{t}</p>
                  <p className="mt-1 text-[13px] text-ink-600">{d}</p>
                </Reveal>
              ))}
            </RevealGroup>
          </div>
        </RevealSection>

        {/* ROI */}
        <RevealSection id="roi" className="mx-auto max-w-7xl px-4 py-24 sm:px-6" aria-labelledby="roi-h">
          <SectionHeading id="roi-h" eyebrow="Return on investment" light="The cost of" bold="stuck refills" lede="Plug in your numbers. Illustrative — we validate it against your own baseline in the pilot." />
          <div className="mt-12">
            <RoiCalculator />
          </div>
        </RevealSection>

        {/* Pricing */}
        <RevealSection id="pricing" className="border-y border-line bg-white py-24" aria-labelledby="price">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading id="price" eyebrow="Pricing" light="Simple," bold="per provider" align="center" />
            <RevealGroup className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-3">
              {[
                { n: 149, prefix: '$', u: 'per provider / month', d: 'Billed annually. Unlimited staff seats and refill cases.' },
                { n: 0, prefix: 'Free', hideValue: true, u: 'for pharmacies', d: 'Pharmacies join free to submit and track requests.' },
                { n: 30, suffix: ' days', u: 'pilot', d: 'We measure your baseline first, then prove the change.' },
              ].map((stat, i) => (
                <Reveal key={stat.u} delay={i * 100} variant="scale" className={`${card} text-center ${i === 0 ? 'ring-2 ring-brand-300' : ''}`}>
                  <p className="font-display text-4xl font-bold text-brand-900">
                    {stat.prefix}{!stat.hideValue && <AnimatedNumber value={stat.n} delay={i * 100} format={(v) => Math.round(v).toString()} />}{stat.suffix}
                  </p>
                  <p className="mt-1 text-sm font-medium text-brand-700">{stat.u}</p>
                  <p className="mt-3 text-sm text-ink-600">{stat.d}</p>
                </Reveal>
              ))}
            </RevealGroup>
          </div>
        </RevealSection>

        {/* Pilot */}
        <RevealSection id="pilot" className="hero-backdrop py-24" aria-labelledby="pilot-h">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
            <SectionHeading id="pilot-h" eyebrow="Get started" light="Request a" bold="pilot" lede="Kick-off on day 0, staff and pharmacy links on day 1, live in week 1. We send a weekly value report from then on." />
            <PilotForm />
          </div>
        </RevealSection>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo />
            <p className="mt-2 text-sm text-ink-500">One shared case. One owner. One next step. The patient always knows.</p>
          </div>
          <div className="text-[12.5px] text-ink-400 sm:text-right">
            <p>Synthetic demo data only. Not for clinical use.</p>
            <div className="mt-2 flex gap-4 sm:justify-end">
              <Link to="/sign-in" className="hover:text-brand-700">
                Sign in
              </Link>
              <a href="#security" className="hover:text-brand-700">
                Security
              </a>
              <a href="#pilot" className="hover:text-brand-700">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
