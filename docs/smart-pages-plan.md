# Smart-pages batch — execution brief

Goal: bring these **12 ops pages** to the depth of the already-done smart pages —
**Maintenance Plans (PPM), Inspections, Dashboard, Documents** — "smarter,
intuitive, more interactive, futuristic and delightful; add functionality the
client didn't think about." Requested by the user; to run when they send **"go"**.

Do them in the **priority order below**, one page at a time, and **commit each page
separately** after it's green. Confirm priority with the user first, then go.

---

## Standard to hit (study these before starting)

Exemplars already in the repo — match their depth and polish:
- `src/components/ppm/*` + `src/domain/ppm.ts` + `src/server/data/ppm-risk.ts` — a
  deterministic 6-signal risk engine, calendar/runtime/risk/list views, HITL
  approve/override, coverage-gap radar.
- `src/components/inspections/*` + `src/domain/inspections.ts` — RAG compliance
  register, audit-readiness score, run-drawer that auto-raises WOs, schedule dialog.
- `src/components/dashboard/*` — cross-domain **attention feed** (ranked triage),
  composite health dial, interactive estate filter, role-adaptive KPIs.
- `src/components/documents/*` + `src/domain/documents.ts` — semantic search over
  extracted fields, expiry radar, upload+OCR-preview, "view as resident" lens.
- `src/components/reports/ask-data.tsx` — **the Claude-style thinking+stream**
  pattern (intent-aware thought trace → word-by-word stream). Reuse it for every
  AI surface.

### Per-page recipe
1. Enrich the domain entity (`src/domain/entities.ts`) + add a **mutable store
   table** (`src/server/data/store.ts`, `db.*` cloned from seed) + richer seed
   (`src/server/data/seed/fixtures.ts`) with a deliberate spread of states.
2. If there's an AI/intelligence angle, write a **deterministic engine** computed
   only over scoped repos (never an LLM) — a pure core in `src/domain/*` + a
   scoped wrapper in `src/server/data/*` or an action. Add vitest for the engine
   (assert bands/ordering/tenant-B exclusion, like `tests/ppm/risk.test.ts`).
3. Scoped **server actions**, capability-gated (`assertCan(actor, cap, action)`),
   `recordHistory` when a §10 machine exists, idempotent, server-revalidated.
4. A **client workspace** — pick the fitting shape: master-detail explorer /
   board+tabs / calendar / attention feed / pipeline funnel. Reuse `KpiCard`,
   `StatusPill`, tones, drawers, filter chips, the thinking pattern.
5. **Role-adaptive + §8.2 scoped** — gate every section on the viewer's grants.
6. **Delight**: `animate-fade`, streaming carets, live-recomputing gauges, optimistic
   updates, skeletons, "view as <role>" lenses, ⌘K-friendly, subtle motion.
7. Gate every page: `npx tsc --noEmit` · `npx eslint src` · `npx vitest run` ·
   `npm run build`. Then commit with a detailed message.

### Repo invariants (do not break)
- Pinned `NOW = '2026-07-26'` in `src/domain/ppm.ts` — import it; never `new Date()`
  in engines/tests.
- The **§7 permission matrix is golden-snapshot-locked** (`src/lib/authz/matrix.ts`,
  `tests/authz/matrix.test.ts`) — never edit it.
- Next 16 + React 19 + Tailwind v4; `params`/`cookies` are async; consult
  `node_modules/next/dist/docs` per `AGENTS.md` before novel Next usage.
- Money is NGN integer minor units. Nigerian estate context (Lagos, PHCN grid,
  diesel gensets, rainy/harmattan seasons) — use it to make "smart" feel real.

---

## The 12 pages — priority order + what to build

### Batch 1 — biggest wins (currently basic)

**1. Billing (EM-01 / AI-E-03) — `src/app/(ops)/billing`**
- Engine: **defaulter-risk score** per unit (history of late/partial payments,
  arrears aging, balance vs charge, tenure) → risk band; **collections forecast**
  (expected inflow next cycle from paid-rate + risk); reminder-timing suggestions.
  HITL: manager approves reminder campaigns; **never auto-penalise** (AI-E-03 rule).
- Workspace: collections health dial + KPIs (rate, outstanding, at-risk ₦),
  arrears **aging waterfall** (current/30/60/90+), invoice board by status
  (draft→issued→partial→paid; overdue→arrears→escalated), defaulter watchlist,
  per-unit statement drawer, "run reminder campaign" (HITL preview).
- Delight: animated ₦ counters, aging waterfall bars, risk sparkline.

**2. Security & SOS (EM-06) — `src/app/(ops)/security`**
- Live console: **active SOS triage** with a live **acknowledge countdown vs the
  60s target**, responder assignment, status timeline (raised→ack→responding→
  resolved→reviewed), patrol log, incident register, **visitor-pass management**
  (issue/verify time-bound QR), an estate incident heatmap by area/time.
- Actions already exist (`transitions.ts` sos-event) — build the console around
  the machine. Guard: no AI may drive SOS; quiet-hours must not suppress SOS.
- Delight: pulsing active-alert card, 60s ring countdown, QR render.

**3. Investors (SC-08 / AI-S-04) — `src/app/(ops)/investors` + `/admin/investors`
   + `/portal/projects`**
- Engine: **sales-pace forecast** (units/mo → projected sell-out date),
  **occupancy forecast**, **ROI projection**, **lead scoring** — all deterministic,
  **labelled "estimate · assumptions shown"** (SC-08/AI-S-04, never financial advice).
- Workspace: project cards → detail with a **sales pipeline funnel** (lead→reserved
  →sold), an off-plan **units grid** (available/reserved/sold), a milestone/
  construction timeline, a forecast chart, a lead table with scores.
- Reuse the shared `InvestorProjectsView`; deepen it. Investor portal sees only
  their own projects (§7 O). Delight: funnel + units-grid heatmap.

**4. Announcements (EM-04 / AI-E-04) — `src/app/(ops)/announcements` +
   `/portal/announcements`**
- **AI draft composer** (reuse thinking pattern) + **translation** to configured
  languages; **manager approval required before any send** (AI-E-04 hard rule).
- Targeting: broadcast / estate / building / audience; channels push/SMS/email/
  in-app per preference (SC-09); **delivery + read analytics**; scheduled sends;
  a send-state machine (draft→pending-approval→scheduled→sent).
- Delight: composer with live audience-size estimate, read-rate bars, channel
  toggles, AI "improve/translate" chips with the thinking trace.

### Batch 2 — commerce + reporting

**5. Marketplace (EM-09 / AI-E-05) — `src/app/(ops)/marketplace` + portal**
- Order **pipeline board** (placed→accepted→fulfilled→closed; declined/refunded/
  expired) with the existing machine; vendor **performance scorecard**; listing
  management; **fraud flags** to a human review queue (**never auto-block**,
  AI-E-05); recommendations; commission/payout note (Q3-blocked — label it).
- Delight: pipeline board, GMV counter, fraud-review queue.

**6. Reports (FM-07 / AI-S-02) — `src/app/(ops)/reports`**
- `ask-data` is already embedded — go deeper: a **metrics explorer** (pick metric ×
  dimension × date), **saved views**, **CSV/PDF export**, trend mini-charts, a KPI
  gallery driven by the §14 traceability (each metric → its requirement ids).
- Delight: drag-free query builder, sparkline gallery, export toast.

### Batch 3 — deepen the existing explorers (already interactive → smarter pass)

**7. Work Orders — `src/app/(ops)/work-orders`** — board+tabs exists. Add: live
   **SLA countdown** timers, **AI triage suggestion (AI-F-02)** on the detail (HITL),
   assignee **workload balancer**, bulk assign/generate, saved filters, a map/board
   toggle, cost roll-ups.

**8. Assets — `src/app/(ops)/assets`** — explorer exists. Add: **asset-health**
   from the PPM risk engine on each card, lifecycle/warranty timeline, depreciation,
   criticality, QR labels, downtime cost.

**9. Spaces — `src/app/(ops)/spaces`** — explorer exists. Add: occupancy analytics,
   vacancy trend, allocation view, a simple floor/stack visualization, revenue-per-
   unit.

**10. Vendors — `src/app/(ops)/vendors`** — explorer exists. Add: a **scorecard/
   ranking** (SLA × rating × responsiveness), spend-to-date, **compliance-expiry
   alerts** (link to documents), SLA trend, AI auto-suggest best vendor per job.

**11. Residents — `src/app/(ops)/people`** — 360 profile exists (bills/requests/
   bookings). Add: **engagement score**, tenure, payment-reliability, comms history,
   household members, move-in/out lifecycle, at-a-glance risk flags.

**12. Bookings (EM-05) — `src/app/(ops)/bookings` + `/portal/bookings`** — inline
   actions exist. Add: an **availability calendar** per amenity, utilisation
   analytics, conflict detection, auto-approval rules, fee/payment link (SC-02),
   waitlist. Delight: calendar heatmap of amenity usage.

---

## Notes for the executor
- Confirm the priority order / batch cadence with the user before starting, then
  work top-down, committing each page.
- Keep the whole suite green after every page (91+ tests currently pass).
- The browser test harness in this environment drops element refs and drifts
  between pages mid-interaction — verify rendering via screenshots, don't rely on
  long multi-click flows; the underlying actions are typechecked and follow proven
  patterns.
- See memory `vesta-smart-pages-backlog.md` for the same plan in brief.
