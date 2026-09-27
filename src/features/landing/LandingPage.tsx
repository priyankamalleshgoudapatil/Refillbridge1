import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowDownRight,
  BellRing,
  Bot,
  Building2,
  ClipboardCheck,
  EyeOff,
  FileLock2,
  Fingerprint,
  Gavel,
  Inbox,
  KeyRound,
  Layers,
  ScanText,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Layout';
import { HeroMock } from './HeroMock';
import { fadeUp, RevealGroup, SectionHeading, stagger, Eyebrow } from './landing-ui';
import { PilotForm } from './PilotForm';
import { RoiCalculator } from './RoiCalculator';

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
        <section className="hero-backdrop relative overflow-hidden">
          <div className="window-light pointer-events-none absolute inset-0 opacity-70" aria-hidden />
          <div className="pointer-events-none absolute -right-32 top-10 size-[480px] rounded-full bg-brand-200/40 blur-3xl" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
            <motion.div initial="hidden" animate="show" variants={stagger(0.1, 0.05)}>
              <motion.div variants={fadeUp}>
                <Eyebrow>For physician practices &amp; their pharmacies</Eyebrow>
              </motion.div>
              <motion.h1 variants={fadeUp} className="mt-4 text-[44px] leading-[1.02] text-brand-900 sm:text-[64px]">
                <span className="font-light">Close the</span>
                <br />
                <span className="font-extrabold">refill gap.</span>
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-6 max-w-lg text-lg leading-relaxed text-ink-600">
                When a refill needs a provider, it bounces between phones, faxes and portals for days. RefillBridge turns it into{' '}
                <strong className="font-semibold text-brand-800">one shared case — one owner, one next step</strong> — and the patient always knows.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
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
              </motion.div>
              <motion.div variants={fadeUp} className="mt-10 flex items-start gap-3 text-sm text-ink-600">
                <ArrowDownRight className="mt-0.5 size-5 text-brand-500" aria-hidden />
                <p className="max-w-sm uppercase tracking-[0.12em] text-[12.5px] leading-relaxed">
                  With empathy and precision, <strong className="text-brand-800">we help patients</strong> get the medication they already take.
                </p>
              </motion.div>
            </motion.div>
            <HeroMock />
          </div>
        </section>

        {/* Problem */}
        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6" aria-labelledby="problem">
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
              <motion.li key={i} variants={fadeUp} className="flex items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-[var(--shadow-soft)]">
                  <span className="text-brand-600">{icon}</span>
                  {label}
                </span>
                {i < arr.length - 1 && <ArrowRight className="size-4 text-ink-400" aria-hidden />}
              </motion.li>
            ))}
          </RevealGroup>
          <p className="mt-4 text-sm text-ink-500">Phone calls, faxes, portals, EHRs — and the patient's row is empty from request to decision.</p>
          <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ['3–5 days', 'a typical stall when a provider is needed'],
              ['6+ hand-offs', 'between four parties for one refill'],
              ['0', 'shared view of who acts next'],
            ].map(([n, l]) => (
              <motion.div key={n} variants={fadeUp} className={card}>
                <p className="font-display text-4xl font-light text-brand-800">{n}</p>
                <p className="mt-2 text-sm text-ink-600">{l}</p>
              </motion.div>
            ))}
          </RevealGroup>
          <p className="mt-3 text-[12px] text-ink-400">Illustrative figures.</p>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y border-line bg-white py-24" aria-labelledby="how">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading id="how" eyebrow="How it works" light="From stuck" bold="to solved" lede="Every open case always has exactly one owner, one next action and one due time." />
            <RevealGroup as="ol" className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4" gap={0.1}>
              {[
                { icon: <ScanText className="size-5" />, t: 'Intake', d: 'Fax, portal, eRx or phone. AI reads messy faxes; staff confirm low-confidence fields.' },
                { icon: <Workflow className="size-5" />, t: 'Triage', d: 'Deterministic rules R1–R10 find the blocker on arrival — no refills, visit due, A1c overdue, insurance.' },
                { icon: <Gavel className="size-5" />, t: 'Decide', d: 'The provider sees a sourced summary and decides. MFA + an order-restating confirmation. Never automatic.' },
                { icon: <ClipboardCheck className="size-5" />, t: 'Close the loop', d: 'The case closes only when the pharmacy confirms. Silence escalates. The patient gets plain-language updates.' },
              ].map((s, i) => (
                <motion.li key={s.t} variants={fadeUp} className={`${card} relative`}>
                  <span className="absolute right-5 top-5 font-mono text-xs text-ink-400">0{i + 1}</span>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{s.icon}</span>
                  <h3 className="mt-4 text-lg font-semibold text-ink-900">{s.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.d}</p>
                </motion.li>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* Intelligence */}
        <section id="intelligence" className="mx-auto max-w-7xl px-4 py-24 sm:px-6" aria-labelledby="intel">
          <SectionHeading id="intel" eyebrow="Intelligence" light="Responsible" bold="autonomy" lede="Deterministic orchestration first. AI is a tool for messy language. Clinical decisions stay with authorized professionals." />
          <RevealGroup className="mt-12 grid gap-5 lg:grid-cols-3" gap={0.1}>
            {[
              { icon: <Layers className="size-5" />, t: 'Rules decide', d: 'A state machine and rules engine own every transition. Predictable, testable, and every event records the rule ID that caused it.' },
              { icon: <Bot className="size-5" />, t: 'AI assists', d: 'Reads faxes, summarises cases with source links, drafts patient messages. It suggests — it never acts. Every call is logged.' },
              { icon: <Fingerprint className="size-5" />, t: 'Humans approve', d: 'Providers make every clinical decision with MFA. Staff confirm AI routing and review any free-text message before it goes out.' },
            ].map((c) => (
              <motion.div key={c.t} variants={fadeUp} className={card}>
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">{c.icon}</span>
                <h3 className="mt-4 text-lg font-semibold">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{c.d}</p>
              </motion.div>
            ))}
          </RevealGroup>
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-6 rounded-2xl bg-gradient-to-br from-brand-800 to-brand-950 p-6 text-white sm:p-8">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-300">AI never</p>
            <ul className="mt-3 grid gap-2 text-[15px] sm:grid-cols-2">
              {['Approves, denies or changes an order', 'Touches controlled-substance cases', 'Decides patient identity matches', 'Grants permissions or builds queries'].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-brand-300" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          </motion.div>
        </section>

        {/* Security */}
        <section id="security" className="border-y border-line bg-white py-24" aria-labelledby="sec">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading id="sec" eyebrow="Security & trust" light="Built for" bold="health data" />
            <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.06}>
              {[
                [<KeyRound key="1" className="size-5" />, 'MFA on clinical decisions', 'Step-up verification for every decision and admin action.'],
                [<ShieldCheck key="2" className="size-5" />, 'Row-level multi-tenancy', 'Each practice and pharmacy sees only its own records.'],
                [<ScrollText key="3" className="size-5" />, 'Append-only audit log', 'Every view of patient data is recorded and immutable.'],
                [<FileLock2 key="4" className="size-5" />, 'Field-level encryption', 'AES-256-GCM for DOB, phone and email.'],
                [<EyeOff key="5" className="size-5" />, 'Minimum necessary', 'Pharmacies see initials, medication and status — nothing clinical.'],
                [<BellRing key="6" className="size-5" />, 'Safe patient messages', 'No drug names in SMS; status pages need DOB and lock after 5 tries.'],
                [<Inbox key="7" className="size-5" />, 'Reliable delivery', 'Transactional outbox, retries, dead letters handed to humans.'],
                [<Building2 key="8" className="size-5" />, 'BAA-ready roadmap', 'Synthetic data in the demo; HIPAA vendors in production.'],
              ].map(([icon, t, d]) => (
                <motion.div key={t as string} variants={fadeUp} className="rounded-xl border border-line bg-ice-50 p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white">
                  <span className="text-brand-600">{icon}</span>
                  <p className="mt-3 font-semibold text-ink-900">{t}</p>
                  <p className="mt-1 text-[13px] text-ink-600">{d}</p>
                </motion.div>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ROI */}
        <section id="roi" className="mx-auto max-w-7xl px-4 py-24 sm:px-6" aria-labelledby="roi-h">
          <SectionHeading id="roi-h" eyebrow="Return on investment" light="The cost of" bold="stuck refills" lede="Plug in your numbers. Illustrative — we validate it against your own baseline in the pilot." />
          <div className="mt-12">
            <RoiCalculator />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-y border-line bg-white py-24" aria-labelledby="price">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading id="price" eyebrow="Pricing" light="Simple," bold="per provider" align="center" />
            <RevealGroup className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-3">
              {[
                ['$149', 'per provider / month', 'Billed annually. Unlimited staff seats and refill cases.'],
                ['Free', 'for pharmacies', 'Pharmacies join free to submit and track requests.'],
                ['30 days', 'pilot', 'We measure your baseline first, then prove the change.'],
              ].map(([n, u, d], i) => (
                <motion.div key={u} variants={fadeUp} className={`${card} text-center ${i === 0 ? 'ring-2 ring-brand-300' : ''}`}>
                  <p className="font-display text-4xl font-bold text-brand-900">{n}</p>
                  <p className="mt-1 text-sm font-medium text-brand-700">{u}</p>
                  <p className="mt-3 text-sm text-ink-600">{d}</p>
                </motion.div>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* Pilot */}
        <section id="pilot" className="hero-backdrop py-24" aria-labelledby="pilot-h">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
            <SectionHeading id="pilot-h" eyebrow="Get started" light="Request a" bold="pilot" lede="Kick-off on day 0, staff and pharmacy links on day 1, live in week 1. We send a weekly value report from then on." />
            <PilotForm />
          </div>
        </section>
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
