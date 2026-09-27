# RefillBridge — Project README & Hand-off

> **If you are a new developer or AI picking this up, read this whole file first.**
> It explains what we are building, what is done, how it is built, what is missing, and exactly how to continue.
> Companion files: [FLOWS.md](FLOWS.md) (step-by-step click-through per login) and [TESTING.md](TESTING.md) (test guide).
> The original brief is `REFILLBRIDGE_MASTER_PROMPT.md`, owned by the team and **not stored in this repo**. Ask the team for it and add it to the repo root; it is the source of truth for every rule and design decision.

**Last updated:** 27 Sep 2026 · **Current phase:** Phase 4 complete (front end on mock data) · **Next phase:** Phase 5 (real back end) + GTM pack

---

## 1. What this project is

**Hackathon challenge:** "Closing the Prescription Refill Gap" (24-hour, B2B).
A patient needs a refill. When a **provider must intervene** (no refills left, visit needed, labs overdue, missing info, insurance block), the refill bounces between **pharmacy → provider → practice staff → patient** over phone, fax and portals. Nobody owns it, nobody sees its status, and the patient hears nothing.

**Our product: RefillBridge.** A B2B web app for **physician practices (buyer and main user)** and their **pharmacies (free users)**. Patients have no login; they get SMS/email plus a secure status page.

**Tagline:** *One shared case. One owner. One next step. The patient always knows.*

**The core idea:** every stuck refill becomes one **Refill Case** with exactly one owner, one next action and one due time. It moves through a strict **state machine**. **Deterministic rules** find the blockers, **AI only assists** (reads faxes, summarises, drafts), **only providers decide** (with MFA), and the case **only closes when the pharmacy confirms**. Silence triggers escalation.

The judges evaluate three parts: **01 Product** (engineering, security, reliability, observability), **02 Intelligence** (states, AI judgment, human-in-the-loop, guardrails, explainability) and **03 Go-to-market** (funnel, pricing, growth, metrics).

---

## 2. Current status at a glance

| Area | Status |
|---|---|
| Shared domain logic (state machine, triage rules R1–R10, SLA/business hours, permissions, Zod schemas, diagnosis) | ✅ Done and tested |
| Mock back end (in-memory DB, transitions, outbox, retries, dead letter, SLA escalation, MFA/aal2, tenant isolation, idempotency, audit log, mock AI) | ✅ Done and tested |
| All front-end pages (landing, auth, queue, case detail, provider inbox, pharmacy intake/requests, phone intake, patient status, analytics, settings, 404/error) | ✅ Done |
| Design system (ice-blue/teal medical theme, Manrope + Inter, motion animations) | ✅ Done (the user plans to refine the UI themselves) |
| Tests | ✅ **180 passing** (`npm test`); lint clean; typecheck clean; build OK (≈193 KB gzipped JS) |
| Docs | ✅ README.md (this file), FLOWS.md, TESTING.md |
| Git | ✅ 2 commits on `master` (app + docs) |
| **Real back end** (Supabase Postgres + RLS, Auth, Edge Functions API, pgmq, pg_cron, pgTAP) | ❌ Not started (Phase 5) |
| **Real AI** (Claude via server-side gateway) | ❌ Not started. The mock AI runs behind the same interface |
| **Real integrations** (pharmacy NCPDP, SMS/email, EHR) | ❌ Simulated inside the mock engine |
| **GTM pack** (GTM.md funnel, personas, pitch deck outline, 2-minute demo script) | ❌ Not written (Phase 6). Only the landing page has pricing, ROI and a pilot form |
| Playwright e2e, CI verified on GitHub | ❌ The CI file exists (`.github/workflows/ci.yml`) but has never been run on GitHub; no Playwright yet |
| Manual browser QA | ⚠️ Not done by the AI. The user is testing with FLOWS.md |

---

## 3. How to run

```bash
npm install          # first time
npm run dev          # http://localhost:5173  (start at /sign-in or /)
npm test             # 180 unit/component tests (Vitest + RTL)
npm run lint         # ESLint
npm run typecheck    # tsc
npm run build        # production build to dist/
```
- Requires Node 20+ (developed on Node 26, Windows 11).
- **Demo password for all users:** `Refill!2026` · **MFA code:** `123456`
- **Dev role switcher:** the "Demo: …" pill at the bottom-left inside the app switches user instantly. It can also switch at aal1 (to test step-up MFA), trigger the idle warning, or expire the session.
- **Refreshing the browser resets all demo data.** The mock DB lives in memory only; by design, no patient data is kept in browser storage (rule H7). Only the session (user id + aal) is in `sessionStorage`.
- **Mock switches** (any page URL): `?mockError=<serviceFunction>` shows the error state and `?mockEmpty=<serviceFunction>` shows the empty state. Examples: `?mockError=getCase`, `?mockEmpty=listCases`, `?mockError=extractIntake` (AI down fallback). Add `&mockErrorType=timeout` for a timeout error.

### Demo users (synthetic)
| Key | Name | Email | Role | Org |
|---|---|---|---|---|
| admin | Priya Shah | admin@lakeside.example.com | practice_admin (MFA) | Lakeside Family Medicine |
| rao | Dr. Anika Rao | dr.rao@lakeside.example.com | provider (MFA) | Lakeside |
| chen | Marcus Chen, NP | np.chen@lakeside.example.com | provider (covering) | Lakeside |
| jordan | Jordan Ellis | staff@lakeside.example.com | practice_staff | Lakeside |
| sam | Sam Okafor | ma@lakeside.example.com | practice_staff | Lakeside |
| lena | Lena Novak | admin@citycare.example.com | pharmacy_admin (MFA) | CityCare Pharmacy |
| omar | Omar Haddad | tech@citycare.example.com | pharmacy_staff | CityCare |
| grace | Grace Kim, PharmD | rph@greenleaf.example.com | pharmacy_staff | GreenLeaf Pharmacy |

Home routes: provider → `/provider/inbox`; practice staff/admin → `/queue`; pharmacy → `/pharmacy/requests`.

---

## 4. Tech stack (locked by the brief — do not switch)

- **Front end:** React 18 + TypeScript (strict, no `any`) + Vite 6 + Tailwind CSS v4 (`@tailwindcss/vite`, tokens in `@theme`), React Router v6 **data router** (`createBrowserRouter`, needed for `useBlocker`), TanStack Query v5, React Hook Form + Zod v3 (`@hookform/resolvers`), `motion` (`import { motion } from 'motion/react'`), lucide-react icons (never emojis in the product UI), clsx.
- **Tests:** Vitest 3 + React Testing Library + user-event + jsdom. Setup in `src/test/setup.ts` (jest-dom and a matchMedia polyfill).
- **Planned back end (Phase 5):** Supabase: Postgres 15 with RLS on every table, Auth (email+password, TOTP MFA, Custom Access Token Hook adding org_id/role), Edge Functions (Deno) with one Hono router at `/api/v1`, Supabase Queues (pgmq) for the outbox, pg_cron workers, private Storage for faxes, pgTAP tests. AI: Anthropic Claude from the edge function only; model id from the `ANTHROPIC_MODEL` env var.
- **Hosting:** Vercel assumed (`vercel.json` has SPA rewrites and security headers: CSP, HSTS, nosniff, frame-ancestors none, and so on).

---

## 5. Architecture

### 5.1 Today (Phase 4): front end + in-browser mock back end
```
 React pages (src/features/*)
    │  TanStack Query hooks (useCases, useCase, useTransition…)
    ▼
 src/services/index.ts  ── picks implementation (today: mock) ──►  RefillService / AuthService interfaces
    │                                                          (src/services/refill-service.ts)
    ▼
 src/services/mock/mock-service.ts   ← auth check, org scoping (404 outside org), role checks, aal2,
 src/services/mock/mock-auth.ts        idempotency, version conflicts, min-necessary DTOs, audit
    │
    ▼
 src/services/mock/engine.ts (MockEngine)  ← the "database + transition_case() + workers"
    │   uses the SAME shared domain code the real server will use:
    ▼
 supabase/functions/_shared/  (alias @shared)
   types.ts, records.ts, dto.ts (API contract), schemas/ (Zod),
   domain/state-machine.ts, triage-rules.ts, sla.ts, permissions.ts, diagnosis.ts, confirmation.ts
```
- `src/services/mock/backend.ts` holds the singleton engine and **starts the workers** (outbox + SLA) every 4 s in the browser, standing in for pg_cron. `notifyChange()` makes React Query refetch (see `BackendBridge` in `src/app/router.tsx`).
- `src/services/mock/seed.ts` **replays 30 scripted cases through the real engine** on a simulated clock (workers tick every 5 simulated minutes). Timelines, retries, dead letters and escalations are therefore genuine, not hand-written. `eng.seedKeys` maps script keys (c1…c30) to case ids and is used in tests.
- `src/services/api-client.ts` is the real HTTP client for Phase 5 (Bearer token, `x-request-id`, 10 s timeout, error envelope → `ApiError`). It is **not used yet**.

### 5.2 Target (Phase 5): the real system
```
 React SPA ──HTTPS (Bearer JWT, x-request-id, Idempotency-Key)──► Edge Function /api/v1 (Hono)
                                                                    │ Zod validation, authz, rate limit, idempotency
                                                                    ├─► Postgres (RLS) ── transition_case() ── case_events (append-only)
                                                                    │                                     └─ outbox_messages ─► pgmq ─► outbox-worker ─► pharmacy/SMS/email adapters
                                                                    ├─► AI gateway ─► Anthropic (server only, Zod-validated, logged in ai_suggestions)
 Patient ─► /status/:token (DOB check) ────────────────────────────┘   pg_cron: sla-worker (60 s), outbox sweep (60 s), metrics rollup (nightly)
```
**Switching to it means writing `src/services/real/*` implementing the same `RefillService`/`AuthService` interfaces and changing `src/services/index.ts`.** Pages must not change. The shared domain code in `supabase/functions/_shared/` is imported by both sides (Deno needs the `.ts` import extensions, which is why every shared import ends in `.ts`).

### 5.3 Key domain rules (implemented in `_shared/domain`)
- **16 states:** RECEIVED, NEEDS_PATIENT_MATCH, TRIAGE, WAITING_ON_INFO, WAITING_ON_PROVIDER, WAITING_ON_PATIENT_VISIT, WAITING_ON_INSURANCE, APPROVED, DENIED, SENT_TO_PHARMACY, PHARMACY_CONFIRMED, FILLING, READY_FOR_PICKUP, DISPENSED, CLOSED (resolution: completed / denied / returned_to_pharmacy / duplicate / withdrawn), CANCELLED.
- **Transitions T1–T27** are listed in `state-machine.ts` (`TRANSITIONS`). `checkTransition()` returns INVALID_TRANSITION, FORBIDDEN or MFA_REQUIRED. DECIDE requires the provider role and aal2. DISPATCH_SUCCEEDED is system-only. Terminal states are never reopened.
- **Every transition** checks `version` (409 CONFLICT), needs an idempotency key, appends a `case_events` row (reason, rule IDs, request ID) and enqueues outbox messages in the same step.
- **14 blocker codes.** **Triage rules R1–R10** (`triage-rules.ts`):
  - R1 patient match: name + DOB + phone or chart number, never auto-merged.
  - R2 prescription found.
  - R3 required fields.
  - R4 discontinued.
  - R5 controlled substance: Schedule II always needs a new Rx; Schedule III–IV has the 6-month / 5-refill limit; AI makes no suggestion.
  - R6 no refills or expired.
  - R7 visit/lab rules by drug class (practice-configurable).
  - R8 pharmacy-vs-chart conflicts.
  - R9 insurance flags and too-early fills (80% threshold).
  - R10 nothing blocks → suggest "return to pharmacy", which staff must confirm.

  Priority is URGENT when 2 or fewer days of supply remain. Routing checks data blockers first (staff), then clinical (provider; auto-routed only when the rules alone are certain), then insurance.
- **SLA** (`sla.ts`): business-hours calendar (America/Chicago, Mon–Fri 8–17, holidays), routine/urgent windows per state, on_track/at_risk (75% elapsed)/breached. Escalation levels 0–3: provider → covering provider → practice admin.
- **Outbox:** retries at 1 → 5 → 30 → 120 min; after 5 attempts the message is dead-lettered, which adds the DISPATCH_FAILED blocker and a "call the pharmacy" task. SMS falls back to email, then to a staff call task. Quiet hours are 9 PM–8 AM patient time (on by default; toggle in the simulator).
- **Decision safety:** order-restating confirmation dialog; `orderConfirmationHash()` binds what was shown to what is saved; deny requires a reason code and a patient next step; bridge days ≤ practice max (30).
- **Patient status token:** 32-byte random, 7-day expiry, DOB check, locks after 5 wrong tries, IP-style rate limit. No drug names on the page or in SMS.
- **Pharmacy view:** initials + DOB year, medication, next step, public events only (no notes, clinical data or AI output). Records outside your org return **404**.

### 5.4 AI (mock today): `src/services/mock/ai-mock.ts`
AI-1 fax extraction (regex-based; every field has a confidence and a source span; fields without a span are dropped; below 0.75 needs confirmation), AI-3 summary (≤ 3 bullets with source refs), AI-4 next-action (only from allowed actions; refuses on controlled substances), AI-5 patient message draft (no drug names; staff must review). Injection detection sets `injectionSuspected`. Every call is logged to `db.ai` with its prompt version. The UI labels all of it "Demo AI (mock)".

---

## 6. Folder map

```
supabase/functions/_shared/     SHARED domain (front end + future edge functions). Import via @shared/… with .ts extension
  types.ts                      roles, statuses, blockers, actions, policies
  records.ts                    Patient/Prescription/Encounter/Observation shapes
  dto.ts                        API contract (CaseSummary, PracticeCaseDetail, PharmacyCaseDetail, …)
  schemas/index.ts              all Zod schemas + password policy
  domain/*.ts (+ *.test.ts)     state machine, triage rules, SLA, permissions, diagnosis, confirmation hash
src/
  main.tsx                      providers + startWorkers()
  index.css                     design tokens (colors brand/ice/ink/ok/warn/bad/info, fonts, shadows, animations)
  app/                          router.tsx (all routes, lazy pages), auth-context.tsx (session, idle timeout,
                                step-up MFA modal, re-auth modal), guards.tsx, AppShell.tsx (sidebar/bottom tabs),
                                DevRoleSwitcher.tsx, SimulatorDrawer.tsx, ErrorBoundary.tsx, query-client.ts
  components/ui/                Button, Field (Input/Select/Textarea/Checkbox), Modal/Drawer (focus trap),
                                Toast, Badges (Status/Blocker/Priority/SLA), States (Skeleton/Empty/Error), Layout
  features/                     one folder per page (see §7)
  services/                     index.ts (switch), refill-service.ts (interfaces), errors.ts, session.ts,
                                api-client.ts (Phase 5), mock/ (engine, seed, mock-service, mock-auth, ai-mock, backend)
  mocks/data/fixtures.ts        orgs, 8 users, 25 patients, 40 prescriptions, encounters, A1c, SAMPLE_FAX, INJECTION_FAX
  lib/                          format.ts (cn, dates), hooks.ts (useOnline, useDebounced, useNow, useIdempotencyKey)
  test/                         setup.ts, render.tsx (setupDemo + renderRoutes test harness)
.github/workflows/ci.yml        lint, typecheck, test, npm audit
vercel.json                     SPA rewrite + security headers
.env.example                    every env var (front-end VITE_* public-safe; server-only secrets)
```

---

## 7. Pages (routes) and what each one solves

| Route | Page | Who | Problem it solves |
|---|---|---|---|
| `/` | Landing | public | The GTM asset: problem, how it works, intelligence, security, ROI calculator, pricing, pilot form |
| `/sign-in`, `/sign-up`, `/verify-email`, `/accept-invite`, `/forgot-password`, `/reset-password`, `/mfa` | Auth | public | Protecting health data: MFA for providers and admins, generic errors, honeypot, password policy |
| `/queue` | Refill queue | practice roles | "I can't see where refills are stuck": KPIs, filters in the URL, SLA countdown, claim |
| `/cases/:id` | **Case detail (North Star)** | practice (full) / pharmacy (reduced) | "Why is it stuck, who acts next?": diagnosis panel, actions, AI summary, timeline with "Why?", notes/tasks/messages/request/deliveries tabs |
| `/provider/inbox[/:id]` | Provider inbox + decision panel | provider | The provider bottleneck: 5 decision types, order confirmation, MFA |
| `/pharmacy/requests` | Pharmacy requests | pharmacy roles | Pharmacies see status without phoning |
| `/pharmacy/requests/new` | Pharmacy intake | pharmacy roles | Messy faxes: AI extraction with confidence and source spans, confirm, send |
| `/cases/new` | Phone intake | practice roles | Capture patient phone requests as cases |
| `/status/:token` | Patient status | public (DOB) | The silent patient: 5-step tracker, plain language, no drug names |
| `/analytics` | Analytics | practice_admin, provider, pharmacy_admin | Measurable value: North Star = % pharmacy-confirmed within 48 business hours |
| `/settings/profile, team, pharmacies, policies, audit` | Settings | profile: all; others: admins | Team invites and roles, pharmacy links, SLA/visit policies, audit log (aal2) |
| `*`, `/error` | 404 / crash | all | Never a blank screen; shows a reference ID |

The seeded demo cases cover every state and every blocker. See FLOWS.md §4C for which patient demonstrates what (Robert Nguyen = match needed, Lucas Lewis = conflict, Zoe Robinson = prompt injection, Emily Johnson = Schedule II, Henry Taylor = pharmacy dead letter, William Wilson / Linda Brown = SLA breached, and so on). **Maria Lopez** has no seeded case: she is reserved for the live "magic moment" (the sample fax).

---

## 8. What was done differently from the brief (important for whoever continues)

- **Phases were compressed at the team's request.** The brief asks for Phase 1 (MVP), Phase 2 (PRD), Phase 3 (Knowledge Base) and a STOP after every page. The team was short on time and asked for everything at once, so **no separate PRD or Knowledge Base documents exist**. This README plus the master prompt stand in for them. If needed, generate the PRD and `CLAUDE.md` Knowledge Base from the master prompt.
- **The mock DB is in memory, not in localStorage.** It resets on refresh (privacy rule H7).
- The **mock AI cannot OCR images**. An uploaded PDF/PNG/JPEG returns a labelled sample extraction with lower confidence.
- The **analytics weekly history** is synthetic "metrics_daily rollup" data plus live data for the current week.
- Some UI pages (landing sub-components, auth, patient status, analytics, settings) were written by parallel helper agents against the same design system. They are consistent but not reviewed line by line.
- The dev role switcher can bypass the "MFA-required roles must be at aal2" gate **only in dev**, so step-up MFA can be demonstrated.

---

## 9. What is pending: next steps in order

### A. Quick wins (do first, cheap, high judging value)
1. Keep committing after each step (docs are already committed).
2. **Write `GTM.md`** (brief §10 and Phase 6):
   - the 8-stage funnel table (Nothing → Prospect → Data analysis → TOFU → MOFU → BOFU → Close → Customer success) with what we do, signals and metric for each stage
   - the ICP (US primary- and chronic-care groups, 5–50 providers) and who feels, uses, buys, influences and pays
   - positioning and pricing ($149/provider/month; pharmacies free; 30-day pilot) and the ROI formula
   - the network growth loop (pharmacies invite other practices) and the retention loop (weekly value report)
   - metrics: time-to-first-value, pilot→paid, NRR > 110%, churn, pharmacy referral rate, CAC payback
3. **Demo pack:** a 2-minute demo script (problem → magic moment → pharmacy-down failure demo → MFA/security moment → analytics → growth loop), 5 pitch points, and an 8–10 slide outline following **Product → Intelligence → Market**.
4. Add the missing items to FLOWS.md: the Lena (pharmacy admin) flow, Marcus Chen as covering provider, Assign, Cancel/Withdraw, Tasks → mark done, the SMS opt-out patient (Mia Clark), Profile → change password, and pharmacy sign-up.
5. Manual browser QA with FLOWS.md; fix anything found.

### B. Phase 5: real back end (one module at a time, TDD, per brief §12)
- **M1 Database:** Supabase migrations for all tables in brief §7:
  - organizations, memberships, invites, practice_pharmacy_links, patients (AES-GCM encrypted DOB/phone/email + HMAC blind index), prescriptions, encounters, observations
  - refill_cases, case_events (append-only trigger), case_notes, tasks, info_requests, provider_decisions (immutable), outbox_messages, notifications, patient_status_tokens (hashed), ai_suggestions, attachments, practice_policies, audit_logs, idempotency_keys, rate_limits, worker_heartbeats, metrics_daily
  - RLS on every table plus the `pharmacy_cases_v` security-invoker view; a `transition_case()` SQL function mirroring `state-machine.ts`
  - pgTAP tests (cross-tenant negatives; no UPDATE/DELETE on append-only tables)
  - `seed.sql` identical to `src/mocks/data/fixtures.ts` + `seed.ts`
- **M2 Auth:** Supabase Auth, Custom Access Token Hook (org_id, role), sign-up, invites, TOTP MFA with aal2 checks in the function AND RLS, session limits, auth audit.
- **M3 API foundation:** Hono router under `/api/v1`, request ID, PHI-scrubbing structured logger, error envelope, CORS allowlist, security headers, Postgres rate limiter, idempotency middleware, Zod middleware, `/health`, `API.md`.
- **M4–M8:** cases core, triage + diagnosis, provider decisions + info requests, SLA worker, analytics + audit endpoints. Port the logic from `engine.ts` / `mock-service.ts`; they are the reference implementation.
- **M9:** create `src/services/real/` implementing `RefillService`/`AuthService` with `api-client.ts` and the Supabase JS client, then switch `src/services/index.ts` using `VITE_USE_MOCKS`, page by page.
- **M10–M13:** pgmq outbox worker + simulated NCPDP pharmacy adapter + HMAC-signed webhooks; SMS/email adapters (simulated), templates, quiet hours, opt-out, status tokens; **AI gateway** (Claude, prompts versioned in `supabase/functions/_shared/ai/prompts/`, Zod-validated output, 15 s timeout, fallbacks, per-user rate limit, mock mode without a key); demo simulator endpoints (non-production only).

### C. Phase 6: hardening
Security audit against brief §15 (report each rule as done / partial / not applicable), Playwright e2e (the North Star flow, sign-in, pharmacy-down → escalation), running CI on GitHub, and deploying to Vercel. Also write a README "Production Roadmap": HIPAA program + BAAs, Surescripts certification, EHR approvals, ePA, EPCS, SOC 2, pen test, load testing, Redis rate limiting, and so on.

### D. UI polish (the user is doing this themselves)
Tokens live in `src/index.css`. Change colours and fonts there, not in the components. Keep the rules: status is never shown by colour alone, it must work at 375 px width, keyboard and focus must work, and no emojis.

---

## 10. Conventions (keep these)
- **Never trust the client:** every rule is enforced in the service/engine (the future server); UI checks only hide buttons.
- Status changes go **only** through `MockEngine.apply()` (future `transition_case()`). Never set `status` directly.
- **State transitions are never optimistic.** Only safe actions (claim, add note) use optimistic updates with rollback.
- Every mutating call needs an idempotency key (`useIdempotencyKey`), sends the case `version`, and is wrapped in `runWithStepUp()` so MFA_REQUIRED opens the step-up modal.
- Every page has Loading / Empty / Error / Success states; toasts appear bottom-right on desktop and at the top on mobile.
- **Synthetic data only** (555-01xx phones, example.com emails). **No real patient data anywhere.**
- Tests sit next to their source files. Use `setupDemo(userKey)` + `renderRoutes(routes, path)` from `src/test/render.tsx`. All tests must pass before each commit.
- Commit messages follow `feat(scope): …` and end with the co-author line required by the team's tooling.

---

## 11. Known issues / caveats
- Not manually tested in a browser by the AI; button labels in FLOWS.md may differ slightly from the UI.
- Quiet hours are on by default. During Chicago night-time (daytime in India) patient messages show "Held — quiet hours". Turn this off in the Failure simulator for demos.
- The business-hours SLA pauses on weekends, so on a weekend fewer cases look "breached". Use the simulator's "+1 day" to demonstrate escalation.
- The CI workflow has never run on GitHub. `npm audit` results are unknown.
- The `dist/` folder exists locally from a build; it is git-ignored.
