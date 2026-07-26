# Complete requirements catalog — every requirement ID in PRD v2.0 (FM-01..08, EM-01..09, SC-01..11, AI-F-01..05, AI-E-01..06, AI-S-01..06), with MoSCoW priority, user story, full acceptance criteria, AI spec columns (inputs→outputs / HITL / fallback / benchmark), §16 phase placement, and §17 open-question blockers.

## Summary
The PRD defines exactly 45 requirement IDs across four families: 8 Facility Management (FM), 9 Estate Management (EM), 11 Shared Core (SC), and 17 AI (5 AI-F, 6 AI-E, 6 AI-S). Priority split is 22 Must / 20 Should / 3 Could — every Could item is an AI feature (AI-E-05, AI-E-06, AI-S-05), meaning the PRD's stated descope lever (§6.2 "Could = first to reflow") only reaches AI scope, never FM/EM/SC. Phase mapping per §16 is exact and covers all 45 IDs with no gaps or duplicates: Phase 1 (weeks 1–12) = 20 IDs (SC-01/02/03/05/06/07/09/10, FM-01/02/03/05/07/08, EM-01/02/03/04/06, AI-S-06), Phase 2 (weeks 10–20) = 22 IDs (FM-04/06, EM-05/07/08/09, SC-04/08/11, AI-F-01..05, AI-E-01..04, AI-S-01..04), Phase 3 (weeks 18–26) = 3 IDs (AI-E-05, AI-E-06 conditional on Q5, AI-S-05) plus NFR verification and handover docs. Twelve requirements are directly blocked or materially shaped by open questions Q1–Q12: EM-09 and SC-04 by Q3 (payouts, explicitly "blocks EM-09 payout build"), EM-06 by Q4, AI-E-06 by Q5 (build proceeds only after DPIA sign-off), EM-01 and SC-02 by Q10 plus the kickoff gateway decision (§13.2 states the payments decision "blocks EM-01"), SC-05 by Q11, SC-07 by Q1/Q2/Q7/Q8/Q12, AI-S-06 by Q2/Q7/Q12, AI-E-04 by Q6, and FM-01/EM-02 by Q9. Every AI feature carries a four-column contract (inputs→outputs, human-in-the-loop, fallback, proposed benchmark) plus six release-blocking guardrails in §11.4 that AI-S-06 (the only Must-priority AI requirement, Phase 1) must implement — tenant-scoped retrieval with CI leakage tests, provider abstraction with health-check degradation, per-tenant/per-feature caps with kill-switch, prompt-injection defence, PII-redacted interaction logging, and mandatory loading/confidence/sources/error UX states on every AI surface.

### FM-01 — Asset management & register (Must, Phase 1)
*Requirements: FM-01, FM-04, SC-10, AI-F-01, AI-S-03*

Module 01 Facility Management. Priority: Must (MVP; platform does not go live without it). Phase 1 Foundations & MVP, weeks 1–12.

User story: "As a Facility Manager, I maintain a register of every asset so identity, location and history are trackable."

Acceptance criteria (complete):
1. Asset CRUD with fields: name, category, serial/tag, location (estate→building→unit/zone), status, purchase date, warranty date, photos, documents.
2. Assets link to work orders and inspections; service history viewable per asset.
3. Archive only — no hard delete. All changes audit-logged (PRD cites "SC-11" here; audit logging is SC-10 — see open issues).
4. Bulk import via CSV template.

Dependencies: location hierarchy is the same hierarchy owned by FM-04 (space management) and shared with the Estate module. Asset documents feed AI-S-03 document intelligence. Asset attributes + WO/failure history are the input to AI-F-01 predictive maintenance. Domain model §8.1: Asset belongs to unit/space; has PPM plans, work orders, documents.

Web/admin implication (SC-06): asset register table with hierarchy filter, asset detail with service-history timeline, archive (not delete) affordance, CSV import wizard.

Open-question exposure: Q9 (legacy asset registers to migrate — migration is unscoped and may need a Change Request; the boundary between the contracted "CSV bulk import" and unscoped "migration" is undefined).

### FM-02 — Preventive maintenance & scheduling (Must, Phase 1)
*Requirements: FM-02, FM-03, FM-07, AI-F-01*

Module 01 Facility Management. Priority: Must. Phase 1, weeks 1–12.

User story: "As a Facility Manager, I define recurring PPM plans so work is scheduled before failure."

Acceptance criteria (complete):
1. PPM plans configurable with: frequency, checklist, assignee rules, lead time; definable per asset or per category.
2. Scheduler auto-generates work orders ahead of the due date; calendar view provided; overdue items flagged.
3. Completion requires checklist completion + evidence photo (configurable).

Domain model §8.1: PPM plan = recurring maintenance definition (frequency, checklist, lead time) that generates work orders for an asset/category.

Dependencies: generates FM-03 work orders. AI-F-01 writes suggested PPM dates as *draft schedule entries* into this scheduler and requires FM approval before any schedule change; AI-F-01 fallback is explicitly "standard PPM calendar unaffected", so FM-02 must function standalone. Drives KPI "% preventive vs reactive work" (§14, driven by FM-02, FM-03, AI-F-01/02) and the "PPM compliance %" dashboard tile in FM-07.

Web/admin implication: PPM plan builder, calendar view with overdue flagging, checklist template editor.

### FM-03 — Work-order management (Must, NEW IN v2.0, Phase 1)
*Requirements: FM-03, FM-02, FM-06, EM-03, SC-09, SC-10, AI-F-02, AI-E-02*

Module 01 Facility Management. Priority: Must — explicitly marked "(new in v2.0)", i.e. implicit in v1.0 and now made explicit; adds no scope beyond what v1.0 features already required to function. Phase 1, weeks 1–12. This is the single most-referenced requirement in the PRD (6 citations).

User story: "As a Technician, I receive, update and close work orders on mobile so nothing gets lost."

Acceptance criteria (complete):
1. Lifecycle states and transitions EXACTLY per §10, with per-priority SLA timers.
2. Assign to internal technician or vendor; reassignment and every state change tracked and notified.
3. Capture photos, notes, parts and costs; requester notified on state changes.
4. Offline updates supported per §12.1.

State machine (§10, contract between backend, mobile and QA — only listed transitions are legal; every transition timestamped, actor-attributed and notified via SC-09):
New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed; branches: Rejected, Cancelled.
Rules & SLAs (proposed defaults, configurable per tenant): AI triage suggests category/priority/assignee, human confirms (AI-F-02 / AI-E-02). SLA timers per priority, e.g. Emergency: respond 2h / resolve 24h; Routine: 72h. Resolved → Verified by requester or manager; auto-close after 5 days (proposed).

Offline behaviour (§12.1): read caching for work-order lists; queued writes for work-order updates with visible sync status; conflict resolution is server-authoritative, overwritten offline edits surfaced to the user and audit-logged.

Upstream feeds: EM-03 resident requests feed this shared pipeline with estate routing; FM-06 failed inspection items auto-raise work orders here; FM-02 PPM scheduler auto-generates them.

KPIs driven (§14): mean time to resolve, asset downtime reduction, request resolution time, resident satisfaction score.

### FM-04 — Space management (Should, Phase 2)
*Requirements: FM-04, FM-01, EM-01, EM-02, EM-05*

Module 01 Facility Management. Priority: Should (committed scope; follows MVP within the timeline). Phase 2 Committed scope, weeks 10–20, built behind flags.

User story: "As a Facility Manager, I manage the space hierarchy so occupancy and allocation are always current."

Acceptance criteria (complete):
1. estate→building→floor→unit/zone hierarchy maintained ONCE and shared with the Estate module.
2. Occupancy/allocation status per space; spaces link to assets, bookings and residents.

Architectural note: this is a Should-priority requirement that owns a hierarchy which four Must-priority Phase 1 requirements already depend on (FM-01 asset location, EM-01 charge setup per unit type/size, EM-02 resident-to-unit linkage, EM-05 amenity/space linkage). The hierarchy itself must therefore exist in Phase 1 even though the *management UI* is Phase 2. Domain model §8.1 confirms: Unit/Space is an addressable space in the hierarchy estate → building → floor → unit/zone, linking residents, assets, charges and bookings. §8.2 tenancy hierarchy: Platform → Tenant → Estates/Facilities → Buildings → Units → Residents/Assets.

Open-question exposure: Q9 (unit/resident lists may need migration).

### FM-05 — Vendor management (Must, Phase 1)
*Requirements: FM-05, EM-07, EM-09, SC-09, SC-01, AI-S-03*

Module 01 Facility Management. Priority: Must. Phase 1, weeks 1–12.

User story: "As a Facility Manager, I onboard vendors and route jobs to them so external work is controlled."

Acceptance criteria (complete):
1. Vendor profiles: services, coverage, documents (insurance/certifications) with expiry alerts.
2. Vendors receive assignments and submit updates AND invoices via the vendor portal.
3. Performance metrics: jobs completed, SLA hit rate, rating.

Domain model §8.1: Vendor = external contractor organisation; receives work orders; has documents, invoices, ratings, listings. User+Role: vendor links user → vendor org.

Cross-module: the same vendor entity carries marketplace listings (EM-09) and appears in the resident-facing directory (EM-07). Vendor is one of the 9 roles (§7) with O = own records only on Users & roles, Work orders and Marketplace.

Expiry alerts route through SC-09 notifications. Vendor documents are indexed by AI-S-03.

Gap to flag: FM-05 requires vendors to submit invoices, but the §7 permissions matrix gives Vendor "—" (no access) on the "Charges & invoicing" row. The vendor-invoice capability has no row in the authoritative matrix.

### FM-06 — Inspection & compliance tracking (Should, Phase 2)
*Requirements: FM-06, FM-03, AI-F-03*

Module 01 Facility Management. Priority: Should. Phase 2, weeks 10–20.

User story: "As a Facility Manager, I schedule inspections so compliance is evidenced, not assumed."

Acceptance criteria (complete):
1. Inspection templates with checklist items carrying pass/fail/severity; scheduled AND ad-hoc runs on mobile with photo capture.
2. Failed items auto-raise work orders (FM-03).
3. Compliance register shows status and expiry per obligation.

Domain model §8.1: Inspection = checklist run with pass/fail items and evidence; failed items raise work orders; feeds compliance register.

Offline (§12.1): inspection logs are named as queued writes with visible sync status.

AI pairing: AI-F-03 vision-based inspections consumes inspection photos and produces detected defects with severity plus an auto-drafted report; the inspector edits and approves every report; AI-F-03 fallback is "manual checklist flow", so FM-06 must be complete without AI.

§7 matrix: Inspections & compliance — Plat V, Exec V, EstM V, FacM M, Tech O (own records only), Res/Sec/Ven/Inv —.

### FM-07 — Reporting & analytics (Must, Phase 1)
*Requirements: FM-07, AI-F-04, AI-S-02, SC-08*

Module 01 Facility Management. Priority: Must. Phase 1, weeks 1–12.

User story: "As an Executive, I see portfolio performance so decisions stop being guesswork."

Acceptance criteria (complete):
1. Dashboards showing: open/overdue work orders, PPM compliance %, downtime, cost by category/estate.
2. Filters by estate and date; export CSV/PDF; role-scoped visibility per §7.

Traceability obligation (§14): "every metric below must be reportable from the product itself (FM-07 / AI-S-02)". FM-07 is therefore the non-AI guarantor of ALL six KPI categories: Maintenance (% preventive vs reactive, MTTR, downtime reduction), Estate finance (collection rate, on-time payment %, arrears reduction), Service quality (resolution time, satisfaction), Engagement (app adoption, chatbot deflection, marketplace transactions), AI performance (triage accuracy, prediction precision, % queries resolved by AI), Commercial (investor-dashboard usage, off-plan sales/occupancy).

§7 matrix: Reports & analytics — Plat F, Exec V, EstM M, FacM M, Tech —, Res —, Sec —, Ven —, Inv V. Note Investor gets V, so a role-scoped investor report view is in scope.

AI pairing: AI-F-04 anomaly cards drill down into these series; AI-S-02 NL reporting is the natural-language layer over the same data and its stated fallback is "standard reports (FM-07)".

### FM-08 — Full mobile access (Must, Phase 1)
*Requirements: FM-08, SC-05, FM-03, FM-06, SC-09*

Module 01 Facility Management. Priority: Must. Phase 1, weeks 1–12.

User story: "As a Technician, I do my whole job from my phone, including in poor-connectivity areas."

Acceptance criteria (complete):
1. ALL technician and Facility Manager day-to-day flows usable on Android/iOS.
2. Push notifications for assignments and escalations; camera-first capture.

Relationship to SC-05: FM-08 is the Facility-module functional coverage requirement; SC-05 is the platform/build/distribution requirement (cross-platform codebase, AAB + iOS builds, FCM/APNs, crash reporting). Both are Must and both Phase 1.

Connectivity obligations flow from §12.1: read caching for work-order lists, queued writes for work-order updates and inspection logs, visible sync status, server-authoritative conflict resolution with overwritten edits surfaced and audit-logged.

NFR ties (§12): key screens interactive < 3 s on 4G and usable on 3G.

Open-question exposure: Q11 (iOS distribution — v1.0 lists TestFlight/IPA; whether a production App Store release is in scope is unresolved, owner Client + Unrealabs, needed by Phase 1). Assumption §15: App Store/Play Store publishing requires Client-owned developer accounts.

### EM-01 — Service charge & billing (Must, Phase 1)
*Requirements: EM-01, SC-02, SC-09, AI-E-03, FM-07*

Module 02 Estate Management. Priority: Must. Phase 1, weeks 1–12.

User story: "As an Estate Manager, I issue charges and track collection so cash flow is predictable."

Acceptance criteria (complete):
1. Charge setup per unit type/size: recurring cycles, one-off levies, penalties/discounts (configurable).
2. Invoices generated and delivered in-app + email/SMS; residents pay in-app via gateway (SC-02).
3. Payments auto-reconcile to invoices; partial payments, receipts and arrears aging supported.
4. Statements per unit/resident; accounting export.

State machine (§10): Draft → Issued → Partially paid → Paid; and Issued → Overdue → In arrears → Escalated. Reminder schedule (proposed): −3d, due, +7d, +21d, delivered via SC-09. AI timing suggestions (AI-E-03) require manager approval. Escalation policy is per tenant.

Domain model §8.1: Charge/Invoice = billable item per unit/resident with due date; has payments (possibly partial); drives arrears aging. Payment = gateway transaction reconciled to invoices/orders; webhook-confirmed; idempotent; per-tenant settlement account.

§7 matrix: Charges & invoicing — Plat V, Exec V, EstM M, FacM —, Tech —, Res O, Sec —, Ven —, Inv —. Payments (pay in-app) — only Res O; every other role "—".

BLOCKED: Q10 (payment reconciliation source of truth — gateway settlement vs bank statements; "Defines EM-01 reconciliation rules"; owner Client, needed by Phase 1 — i.e. inside the phase EM-01 is built in). Also gated by the §13.2 kickoff decision on the payments provider (Paystack vs Flutterwave), which the integration table marks "Kickoff (blocks EM-01)".

KPIs driven: service-charge collection rate, on-time payment %, arrears reduction (EM-01, SC-02, AI-E-03).

### EM-02 — Residents & visitor management (Must, Phase 1)
*Requirements: EM-02, SC-01, SC-10, EM-06*

Module 02 Estate Management. Priority: Must. Phase 1, weeks 1–12.

User story: "As an Estate Manager, I onboard residents and control guest access so I know who is on the estate."

Acceptance criteria (complete):
1. Resident onboarding (invite + profile) linked to unit(s); move-in/move-out supported; household members supported.
2. Visitor invites generate time-bound codes/QR verified by Security at the gate; visitor log retained per NDPA retention policy (§12).

Domain model §8.1: Visitor pass = time-bound access code/QR for a guest; issued by resident; verified by security; logged. User+Role: Resident links user → unit(s).

NDPA/privacy (§12): consent records + processing register; per-entity retention schedule; data residency per Q7. The visitor log is explicitly named as subject to the retention policy.

§7 matrix: Security & SOS — Plat V, Exec V, EstM M, FacM —, Tech —, Res O, Sec M, Ven —, Inv —.

Open-question exposure: Q7 (hosting/data residency — Nigeria vs regional cloud, drives NDPA posture for the visitor log), Q9 (legacy resident lists to migrate — unscoped).

KPI driven: resident app adoption (EM-02/04/09, AI-E-01).

### EM-03 — Maintenance request portal (Must, Phase 1)
*Requirements: EM-03, FM-03, AI-E-01, AI-E-02, SC-09*

Module 02 Estate Management. Priority: Must. Phase 1, weeks 1–12.

User story: "As a Resident, I raise a request with photos and track it to resolution without chasing anyone."

Acceptance criteria (complete):
1. Request captures category, description, photos → produces a ticket ID with visible status.
2. Requests feed the SHARED work-order pipeline (FM-03) with estate routing.
3. Resident notified on each state change and can rate the resolution.

Cross-module contract: EM-03 is the resident-facing front door onto the FM-03 state machine. The rating captured here drives the §14 "resident satisfaction score" KPI.

AI pairing: AI-E-01 resident chatbot MUST escalate to a ticket here when it has no grounded source; AI-E-02 smart request triage does photo-based classification and auto-routing of these requests (a shared service with AI-F-02) — dispatcher confirms or overrides.

§7 matrix: Work orders — Res O (own records only), so residents see their own tickets. Whether the resident sees the underlying WO entity or only a request projection is not specified.

KPIs driven: request resolution time, resident satisfaction score (EM-03, FM-03, AI-E-02).

### EM-04 — Announcements & communication (Must, Phase 1)
*Requirements: EM-04, SC-09, AI-E-04, SC-03*

Module 02 Estate Management. Priority: Must. Phase 1, weeks 1–12.

User story: "As an Estate Manager, I reach the right residents on the channels they actually read."

Acceptance criteria (complete):
1. Broadcast AND targeted sends (targeting by estate / building / audience) via in-app, push, SMS and email, respecting per-user preference (SC-09).
2. Delivery and read statistics visible to managers.
3. AI drafting/translation (AI-E-04) ALWAYS requires manager approval before send.

Domain model §8.1: Announcement = broadcast or targeted message; delivered via notifications engine; tracks delivery/read.

§7 matrix: Announcements — Plat V, Exec V, EstM M, FacM M, Tech —, Res V, Sec V, Ven —, Inv —. Note both Estate Manager and Facility Manager can manage announcements.

Hard HITL constraint: no auto-send path may exist for AI-drafted content; the approval gate is an acceptance criterion of EM-04 itself, not only of AI-E-04.

Open-question exposure: Q6 (language list for localization at launch — sizes translation and QA effort; owner Client, needed by Design phase) since AI-E-04 translates "into configured languages".

KPI driven: resident app adoption / engagement.

### EM-05 — Facility booking (Should, Phase 2)
*Requirements: EM-05, SC-04, SC-02, AI-S-05*

Module 02 Estate Management. Priority: Should. Phase 2, weeks 10–20.

User story: "As a Resident, I book shared amenities without a WhatsApp back-and-forth."

Acceptance criteria (complete):
1. Amenity setup: capacity, hours, rules, optional fees.
2. Availability calendar; auto-approval or manager-approval per amenity; fees paid via gateway; cancellation per policy.

State machine (§10): Requested → Approved / Auto-approved → Confirmed → Completed; branches: Declined, Cancelled. Rules: auto-approval per amenity rules; payment (if fees) required to confirm; cancellation window per policy.

Domain model §8.1: Booking = reservation of an amenity; links resident, amenity, optional payment; approval per amenity rules. Per-tenant configuration (§8.2) explicitly includes "amenity rules".

Shared infrastructure: SC-04 provides the catalog/cart/order/payment services shared between the marketplace and PAID BOOKINGS — so EM-05's fee path depends on SC-04 (also Should, also Phase 2). AI-S-05 recommendation/fraud engine sits behind AI-E-05 "and bookings".

§7 matrix: Bookings & amenities — Plat V, Exec V, EstM M, FacM —, Tech —, Res O, Sec V, Ven —, Inv —.

### EM-06 — Security & SOS alerts (Must, Phase 1)
*Requirements: EM-06, SC-09, SC-10, AI-E-06, EM-02*

Module 02 Estate Management. Priority: Must. Phase 1, weeks 1–12. Safety-critical.

User story: "As a Resident, I trigger an SOS and know security has seen it."

Acceptance criteria (complete):
1. SOS alerts the security desk and designated responders with unit/location; acknowledge → responding → resolved with timestamps (§10).
2. Patrol and incident logging for security staff; ALL security events audit-logged (SC-10).
3. SOS submission works on poor connectivity with SMS fallback (proposed).

State machine (§10): Raised → Acknowledged → Responding → Resolved → Reviewed. Rules: acknowledge target < 60s during manned hours (proposed); unacknowledged alerts escalate to backup responders; full timeline retained for review.

Domain model §8.1: SOS event = panic alert with acknowledge/resolve trail; links resident/unit, responders, timestamps.

Offline (§12.1): SOS is explicitly named among queued writes, with SMS fallback (proposed).

BLOCKED: Q4 — "SOS operating model: who responds, escalation chain, liability and manned hours"; why it matters: "Safety-critical flow; drives EM-06 SLAs and staffing"; owner Client; needed by Phase 1. Until answered, the <60s ack target, the escalation chain and the manned-hours definition are all unconfirmed proposals, yet EM-06 is a Phase 1 Must.

Optional AI extension: AI-E-06 (CCTV anomaly / face-plate recognition) is Could/optional and NDPA-contingent on Q5 — EM-06 must be complete and shippable without it.

### EM-07 — Vendor / staff directory (Should, Phase 2)
*Requirements: EM-07, FM-05, SC-01*

Module 02 Estate Management. Priority: Should. Phase 2, weeks 10–20.

User story: "As a Resident, I find approved vendors and estate staff without asking around."

Acceptance criteria (complete):
1. Searchable directory with services and contact routes; visibility rules per role (§7).

This is the shortest requirement in the PRD — a single acceptance criterion. It consumes the vendor profiles created in FM-05 (services, coverage) and the user/role directory from SC-01. Visibility is governed by the §7 matrix rather than by directory-specific rules, so the directory has no independent permission model.

Note: "approved" vendors implies a vendor approval state that FM-05's acceptance criteria do not explicitly define (FM-05 defines profiles, documents with expiry alerts, assignments and performance metrics — no approval status field is named).

### EM-08 — Document management (Should, Phase 2)
*Requirements: EM-08, AI-S-03, AI-E-01, SC-07*

Module 02 Estate Management. Priority: Should. Phase 2, weeks 10–20.

User story: "As an Estate Manager, I publish estate documents once and the right people can always find them."

Acceptance criteria (complete):
1. Upload/organise with folder and permission control; residents see documents shared to their audience.
2. ALL stored documents indexed for AI document intelligence (AI-S-03).

Domain model §8.1: Document = stored file with permissions; indexed by document intelligence (AI-S-03).

Isolation constraint (§8.2 + §11.4): document storage is tenant-scoped object storage; the search/vector index must be a per-tenant namespace; "no query, file, search index, AI retrieval or report may cross tenants below Platform Admin", verified by automated cross-tenant access tests in CI (release-blocking).

Sequencing risk: EM-08 (Should, Phase 2) is the requirement that populates the corpus AI-S-03 and AI-E-01 (resident RAG corpus, "curated by the Estate Manager") depend on — all three are Phase 2, so the corpus and its consumers are built in the same window.

Other document sources exist outside EM-08: FM-01 asset documents, FM-05 vendor insurance/certifications. Whether AI-S-03 indexes those too is implied by "across document management" but not stated per-source.

### EM-09 — Marketplace (Should, Phase 2) — payouts BLOCKED by Q3
*Requirements: EM-09, SC-04, SC-02, AI-E-05, AI-S-05*

Module 02 Estate Management. Priority: Should. Phase 2, weeks 10–20.

User story: "As a Resident, I buy services from approved vendors inside the app."

Acceptance criteria (complete):
1. Vendors list products/services; residents browse, order and pay via gateway.
2. Order lifecycle (placed → accepted → fulfilled → closed) with notifications.
3. Commission/payout model per commercial decision — open question Q3 BLOCKS BUILD OF PAYOUTS.

State machine (§10): Placed → Accepted → Fulfilled → Closed; branches: Declined, Refunded. Rules: vendor must accept within SLA or the order auto-expires; refunds via gateway; payout model pending Q3.

Domain model §8.1: Listing/Order = marketplace product/service and purchase; flow is Vendor listing → resident order → payment → fulfilment.

BLOCKED: Q3 — "Marketplace commercial model: commission %, escrow, vendor payout rails and KYC"; why it matters: "Payouts have regulatory and gateway implications; blocks EM-09 payout build"; owner Client; needed by Phase 2 start. This is the ONLY open question in §17 that uses the word "blocks" against a specific requirement's build.

Dependencies: SC-04 supplies catalog/cart/order/payment infrastructure; SC-02 supplies the gateway; AI-E-05 (Could, Phase 3) adds listing auto-generation, recommendations and fraud flags on top.

§7 matrix: Marketplace — Plat V, Exec V, EstM M, FacM —, Tech —, Res O, Sec —, Ven O, Inv —.

KPI driven: marketplace transactions (engagement).

### SC-01 — Multi-user profiles & RBAC (Must, Phase 1)
*Requirements: SC-01, SC-07, SC-10, AI-S-06*

Shared core. Priority: Must. Phase 1, weeks 1–12.

User story: "As any user, I see and do only what my role allows — enforced by the server, not the UI."

Acceptance criteria (complete):
1. Roles and access per §7, tenant- AND estate-scoped; DENY-BY-DEFAULT on every API.
2. Session and password policy; MFA for admin roles (proposed).

The §7 matrix is declared the "authoritative baseline", with fine-grained per-endpoint permissions finalised at design. Legend: F full control · M manage (create/edit within own tenant/estate) · V view · O own records only · — no access. Nine role columns: Plat (Platform Admin, 7 Fifteen Capital HQ), Exec (Owner/Executive), EstM, FacM, Tech, Res, Sec, Ven, Inv.

Security NFR (§12): OWASP ASVS L2; TLS 1.2+ in transit; AES-256 at rest; MFA for admin roles; audit log per SC-10; cross-tenant tests release-blocking. Note §12 states MFA for admin roles as a firm measurable target while SC-01 marks it "(proposed)" — see open issues.

AI interaction: §11.4 prompt-injection defence requires that user- and document-supplied content is treated as data and cannot instruct the assistant to exceed the user's permissions per §7 — so SC-01's authorisation layer is the enforcement point for AI actions too.

Open-question exposure: Q1 (who exactly is a "tenant" — shapes onboarding, branding and commercial model), Q2 (isolation strategy, since scoping is enforced at application AND database layer).

### SC-02 — Payments integration (Must, Phase 1)
*Requirements: SC-02, EM-01, EM-05, EM-09, SC-04*

Shared core. Priority: Must. Phase 1, weeks 1–12.

User story: "As a Resident, I pay any charge in-app and it reconciles itself."

Acceptance criteria (complete):
1. Gateway abstraction (provider per §13) supporting cards, transfers and USSD where available.
2. Webhook-confirmed payments with idempotency and retries; refund/void; per-tenant reconciliation report.

Domain model §8.1: Payment = gateway transaction reconciled to invoices/orders; webhook-confirmed; idempotent; per-tenant settlement account. Tenant onboarding (§8.2) includes configuring the payment settlement account per tenant.

Integration decision (§13.2): Payments — need is "Cards, transfers, USSD; webhooks; per-tenant settlement"; candidates Paystack · Flutterwave; decide by Kickoff; the table annotates this decision as "(blocks EM-01)".

Consumers: EM-01 service charges, EM-05 booking fees, EM-09 marketplace orders, SC-04 shared payment service.

Open-question exposure: Q10 (reconciliation source of truth — gateway settlement vs bank statements; needed by Phase 1) directly determines the semantics of the "per-tenant reconciliation report" AC. Q3 (escrow / payout rails / KYC) determines whether the gateway abstraction must also support split payments and vendor payouts.

§7 matrix: Payments (pay in-app) — Res O only; all other roles "—", including Platform Admin.

### SC-03 — Core integrations (Must, Phase 1)
*Requirements: SC-03, SC-09, SC-07, EM-06, EM-01*

Shared core. Priority: Must. Phase 1, weeks 1–12.

User story: "As the platform, I send SMS/email and render maps through swappable providers."

Acceptance criteria (complete):
1. SMS/email behind an abstraction with template management and delivery-failure handling/logs; maps for locations.

Integration decisions (§13.2): SMS — transactional + OTP delivery in Nigeria; candidates Termii · Twilio; decide by Kickoff. Email — transactional email at volume; candidates AWS SES · SendGrid · Mailgun; decide by Kickoff. Maps — location display and geocoding; candidate Google Maps Platform; decide by Design phase.

Relationship to SC-09: SC-03 is the provider/transport abstraction; SC-09 is the unified notification service and event bus that consumes it. Both Must, both Phase 1. Template management appears in both (SC-03 "template management", SC-09 "per-tenant templates") — ownership boundary needs a design decision.

Cost metering: §8.2 requires SMS and email usage metered per tenant; §15 assumption places third-party fees (SMS, email, hosting, maps, payment gateway) on the Client.

Open-question exposure: Q12 (per-tenant AI/SMS budget caps and alert thresholds; owner Client; needed by Phase 2) — the caps/alerts are implemented against SC-03/SC-07 metering.

Safety-critical consumer: EM-06 SOS SMS fallback (proposed) rides on this SMS abstraction.

### SC-04 — E-commerce / marketplace infrastructure (Should, Phase 2)
*Requirements: SC-04, EM-09, EM-05, SC-02, AI-S-05*

Shared core. Priority: Should. Phase 2, weeks 10–20.

User story: "As the platform, I provide shared catalog/order/payment services that EM-09 consumes."

Acceptance criteria (complete):
1. Catalog, cart/order and payment services shared between the marketplace and PAID BOOKINGS.

This is the shared substrate for two features: EM-09 marketplace and EM-05 booking fees. All three (SC-04, EM-05, EM-09) are Should-priority and Phase 2, so the substrate and both consumers land in the same 10-week window.

Open-question exposure: Q3 (commission %, escrow, vendor payout rails and KYC) — the payout side of the payment service cannot be built until answered; Q3 is owned by the Client and "needed by Phase 2 start", i.e. exactly when SC-04 begins.

AI overlay: AI-S-05 recommendation & fraud engine is the shared personalisation/anomaly service behind AI-E-05 and bookings — Could, Phase 3.

### SC-05 — Mobile apps (Android, iOS) (Must, Phase 1)
*Requirements: SC-05, FM-08, SC-09, SC-06*

Shared core. Priority: Must. Phase 1, weeks 1–12.

User story: "As a user, I get the same product on Android and iOS."

Acceptance criteria (complete):
1. Single cross-platform codebase (framework decision at kickoff); Android AAB + iOS builds.
2. Distribution: Play Store + TestFlight/IPA per v1.0 — production App Store release is open question Q11.
3. Push via FCM/APNs; crash and performance reporting wired in.

Footprint (§13.1): Mobile — Android (APK/AAB) and iOS (TestFlight/IPA); store release plan per Q11.

BLOCKED/shaped: Q11 — "iOS distribution: v1.0 lists TestFlight/IPA — is a production App Store release in scope?"; why: "Affects review lead times and release plan"; owners Client + Unrealabs; needed by Phase 1. AC #2 explicitly names Q11 inside the acceptance criteria, making SC-05 the only shared-core requirement whose ACs are self-declaredly incomplete.

Assumption §15: App Store / Play Store publishing requires Client-owned developer accounts.

Unassigned obligation: §12.1 offline behaviour (read caching, queued writes, visible sync status, server-authoritative conflict resolution) is required by FM-03/FM-06/FM-08/EM-06 but SC-05 carries no offline acceptance criterion — the sync/conflict layer has no owning requirement ID.

Note this is a SEPARATE TRACK from the target Next.js codebase, which implements SC-06.

### SC-06 — Web app & admin dashboard (Must, Phase 1) — THE TARGET CODEBASE
*Requirements: SC-06, SC-01, SC-07, SC-10, SC-08, FM-07*

Shared core. Priority: Must. Phase 1, weeks 1–12. This is the requirement the Next.js 16 / React 19 / Tailwind v4 scaffold at /Users/samuelomosehin/developer/cargoflow-next implements.

User story: "As an operator, I run everything from a browser."

Acceptance criteria (complete):
1. Responsive web app for residents AND managers.
2. Platform admin console for tenant management, configuration and audit views.

So SC-06 is TWO surfaces in one requirement: (a) the operator/resident product web app, (b) the Platform Admin console. The admin console's three named jobs map to: tenant management (SC-07 onboarding: create organisation, configure estates/units via bulk import, branding, payment settlement account, languages, enabled features), configuration (§8.2 per-tenant config: branding, notification templates, amenity rules, charge structures, AI feature flags and usage caps), and audit views (SC-10: queryable from the admin console).

NFRs binding on SC-06 specifically (§12): WCAG 2.1 AA for web (Accessibility); key screens interactive < 3 s on 4G and usable on 3G; API P95 < 500 ms; all UI strings externalised (Localization, English at launch, additional languages per Q6); role-scoped visibility per §7 enforced server-side (SC-01) — the UI must not be the enforcement point.

AI UX obligations (§11.4) apply to every AI surface rendered here: loading, confidence, sources and error states; every suggestion is review/approve/override.

Role coverage the web app must serve (§7): all 9 roles have at least one non-"—" capability, so the web app needs distinct experiences for Platform Admin, Executive, Estate Manager, Facility Manager, Technician, Resident, Security, Vendor (portal per FM-05) and Investor (SC-08).

### SC-07 — Multi-tenant deployment (Must, Phase 1)
*Requirements: SC-07, SC-01, SC-03, SC-06, AI-S-06*

Shared core. Priority: Must. Phase 1, weeks 1–12.

User story: "As Platform Admin, I onboard a new organisation without touching code, and tenants can never see each other."

Acceptance criteria (complete):
1. ALL §8.2 isolation requirements met; cross-tenant access tests pass in CI (RELEASE-BLOCKING).
2. Tenant onboarding, configuration and per-tenant usage metering implemented.

§8.2 requirements pulled in by AC #1:
- Hierarchy: Platform → Tenant (organisation) → Estates/Facilities → Buildings → Units → Residents/Assets. Every domain record carries its tenant scope.
- Hard isolation: no query, file, search index, AI retrieval or report may cross tenants below Platform Admin. Verified by automated cross-tenant access tests in CI (release-blocking).
- Isolation strategy: shared database with tenant-scoped rows enforced at application AND database layer (e.g. row-level security), tenant-scoped object storage, per-tenant vector-store namespaces — marked (proposed), to be confirmed as ADR-01 / Q2.
- Tenant onboarding: Platform Admin creates the organisation, then configures estates/units (bulk import), branding, payment settlement account, languages and enabled features.
- Per-tenant configuration: branding, notification templates, amenity rules, charge structures, AI feature flags and usage caps.
- Cost metering: AI, SMS and email usage metered per tenant (§15 assumption: usage costs billed to the Client).

BLOCKED by four open questions: Q1 (who is a tenant — estates operated by 7 Fifteen Capital, or third-party operators too; shapes onboarding, branding and commercial model; Client, Kickoff), Q2 (confirm data-isolation strategy ADR-01: shared DB + RLS vs schema-per-tenant; "Foundational architecture; expensive to change later"; Unrealabs, Kickoff), Q7 (hosting provider and data residency — Nigeria vs regional cloud; Client, Kickoff), Q8 (launch sizing: tenants, units, users, expected concurrency; Client, Design phase), Q12 (per-tenant AI/SMS budget caps and alert thresholds; Client, Phase 2).

Scalability design target (§12, pending Q8): 20 tenants / 10,000 units / 50,000 users / 1,000 concurrent; documented horizontal scale path.

### SC-08 — Investor off-plan dashboard (Should, Phase 2)
*Requirements: SC-08, AI-S-04, SC-11, SC-01, FM-07*

Shared core. Priority: Should. Phase 2, weeks 10–20.

User story: "As an Investor, I track my projects' sales, occupancy and returns."

Acceptance criteria (complete):
1. Off-plan projects with sales pipeline, occupancy and returns; investors see ONLY their projects.
2. AI projections (AI-S-04) always labelled as estimates with assumptions shown.

Domain model §8.1: Investor project / Lead = off-plan project with sales pipeline; drives investor dashboard and AI projections. Glossary: Off-plan = property sold before/during construction; tracked on the investor dashboard.

§7 matrix: Investor projects — Plat F, Exec V, EstM —, FacM —, Tech —, Res —, Sec —, Ven —, Inv O (own records only). Reports & analytics gives Inv V.

Isolation nuance: "investors see only their projects" is a SECOND isolation axis on top of tenant isolation — an owner-scoped filter within a tenant, distinct from the §8.2 tenant boundary.

AI pairing: AI-S-04 investor-dashboard AI (sales/occupancy forecasting, lead scoring, ROI projections) — all outputs labelled as estimates with assumptions shown; explicitly "not presented as financial advice"; benchmark = forecast error (MAPE) reviewed quarterly vs actuals.

Lead capture into this pipeline comes from SC-11 (landing page, proposed).

Sequencing note: Investor is one of the 9 roles in the MVP permissions matrix, but the only functionality that role has (SC-08) is Phase 2 — the Investor role has no product surface during Phase 1.

KPI driven: investor-dashboard usage, off-plan sales and occupancy (SC-08, AI-S-04, SC-11).

### SC-09 — Notifications engine (Must, NEW IN v2.0, Phase 1)
*Requirements: SC-09, SC-03, SC-05, FM-03, EM-01, EM-04, EM-06, EM-09*

Shared core. Priority: Must — explicitly "(new in v2.0)". Phase 1, weeks 1–12. Second-most-referenced requirement (5 citations).

User story: "As a user, I get the right alerts on the right channel — and can control them."

Acceptance criteria (complete):
1. Unified service for push/SMS/email/in-app used by ALL modules (single event bus).
2. Per-user channel preferences and quiet hours; per-tenant templates; delivery logging.

Mandated consumers across the PRD:
- §10: "every transition is timestamped, actor-attributed and notified via SC-09" — for all five state machines (work order, service charge, booking, SOS event, marketplace order).
- FM-03: reassignment and every state change tracked and notified; requester notified on state changes.
- FM-05: vendor document expiry alerts.
- FM-08: push notifications for assignments and escalations.
- EM-01: reminder schedule (−3d, due, +7d, +21d) via SC-09.
- EM-03: resident notified on each state change.
- EM-04: broadcast/targeted sends via in-app, push, SMS, email per user preference.
- EM-06: SOS escalation to backup responders when unacknowledged.
- EM-09: order lifecycle notifications.

Tension to resolve at design: "quiet hours" as a per-user preference vs safety-critical SOS escalation (EM-06) — the PRD does not define an override for emergency notifications.

Transport comes from SC-03 (SMS/email abstraction) and SC-05 (FCM/APNs push). Template management is claimed by both SC-03 and SC-09.

### SC-10 — Audit logging (Must, NEW IN v2.0, Phase 1)
*Requirements: SC-10, SC-06, SC-01, EM-06, AI-S-06*

Shared core. Priority: Must — explicitly "(new in v2.0)". Phase 1, weeks 1–12.

User story: "As a compliance owner, I can reconstruct who did what, when."

Acceptance criteria (complete):
1. IMMUTABLE log of: auth events, permission changes, financial actions, security events, and AI overrides — each carrying actor, tenant, timestamp.
2. 12-month retention (proposed); queryable from the admin console.

Explicit callers elsewhere in the PRD:
- FM-01: "all changes audit-logged" (PRD text cites SC-11 — believed to be a typo for SC-10).
- EM-06: "all security events audit-logged".
- §12.1: overwritten offline edits are surfaced to the user AND audit-logged.
- §11.4 / AI-F-02: AI overrides logged for tuning; all AI interactions logged (AI interaction log, §8.1) with PII minimised/redacted in logs.

Domain model §8.1: AI interaction log = every AI request/response, confidence, override; per tenant; powers audit, tuning and cost metering. This is a distinct entity from the SC-10 audit log, though "AI overrides" appear in both.

NFR (§12 Security): audit log per SC-10 is a named security target alongside OWASP ASVS L2, TLS 1.2+, AES-256 at rest and MFA for admin roles.

Admin console surface (SC-06 AC #2: "audit views") is where SC-10 is consumed.

Open-question exposure: Q7 (data residency affects where immutable logs may be stored under NDPA); the 12-month retention is "(proposed)" and must reconcile with the "per-entity retention schedule" required in §12.

### SC-11 — Landing page (Should, Phase 2)
*Requirements: SC-11, SC-08, SC-10, AI-S-04*

Shared core. Priority: Should. Phase 2, weeks 10–20.

User story: "As a prospect or investor, I learn about the platform and register interest."

Acceptance criteria (complete):
1. Public marketing page with lead capture into the investor pipeline (proposed).

This is the only requirement whose sole acceptance criterion is itself marked "(proposed)" — the lead-capture-into-investor-pipeline behaviour is a baseline for estimation, not a confirmed contract term (§1: items marked (proposed)/(TBC) are confirmed at discovery and do not silently become contract terms).

Downstream: leads land in the Investor project / Lead entity (§8.1) that drives SC-08 and AI-S-04 lead scoring.

KPI (§14 Commercial): investor-dashboard usage, off-plan sales and occupancy — driven by SC-08, AI-S-04, SC-11.

CITATION COLLISION: FM-01's third acceptance criterion reads "all changes audit-logged (SC-11)", but SC-11 is the landing page and audit logging is SC-10. This is almost certainly an off-by-one citation error introduced when SC-09/SC-10 were inserted as new v2.0 requirements. Must be confirmed with the client rather than silently corrected.

Build note for the target codebase: SC-11 is public/unauthenticated and sits outside the app shell — a different layout tier from the rest of SC-06.

### AI-F-01 — Predictive maintenance (Should, Phase 2)
*Requirements: AI-F-01, FM-01, FM-02, FM-03, AI-S-06*

Module 01 Facility Management AI. Priority: Should. Phase 2 (weeks 10–20), listed in §16 as part of "AI-F-01…05".

Inputs → outputs: asset attributes, work-order/failure history, and sensor feeds where available → a ranked failure-risk list PLUS suggested PPM dates written as DRAFT SCHEDULE ENTRIES.

Human-in-the-loop: the Facility Manager approves before any schedule changes. Runs in SHADOW MODE until data volume is sufficient (§15.2: data-hungry features AI-F-01 and AI-E-03 launch in shadow/tuning mode).

Fallback when AI is unavailable: the standard PPM calendar is unaffected — FM-02 continues to operate untouched.

Proposed benchmark (TBC): after 3–6 months of data, precision ≥ 70% on a 30-day failure window.

Dependencies: FM-01 (asset register + service history), FM-02 (PPM scheduler receives the draft entries), FM-03 (WO/failure history). Sensor feeds are conditional — §6.3 puts hardware procurement (CCTV, IoT devices) out of scope, software integration only.

Benchmark timing risk: a 3–6 month data-accumulation requirement cannot be satisfied inside a July–December 2026 build; acceptance per §15.2 is against agreed benchmarks, and this one is measurable only post-handover.

KPI driven: % preventive vs reactive work, asset downtime reduction.

### AI-F-02 — Smart work-order triage (Should, Phase 2)
*Requirements: AI-F-02, AI-E-02, FM-03, EM-03, SC-10, AI-S-06*

Module 01 Facility Management AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: request text, photos and category → suggested category, suggested priority, and best-fit assignee/vendor, each WITH A CONFIDENCE value.

Human-in-the-loop: the dispatcher confirms or overrides; overrides are logged for tuning (and are among the events SC-10 must capture as "AI overrides").

Fallback when AI is unavailable: manual triage queue.

Proposed benchmark (TBC): top-1 category accuracy ≥ 85%; assignee suggestion acceptance ≥ 70%.

State-machine binding (§10 work order): "AI triage suggests category/priority/assignee; human confirms" — the suggestion sits on the New → Triaged transition, so the Triaged state exists specifically to hold the human confirmation step.

Shared service: AI-E-02 is explicitly "a shared service with AI-F-02" with the same HITL, the same fallback and a shared benchmark. Build once, surface twice (facility dispatcher + estate request routing).

UX obligation (§11.4): confidence must be displayed; loading, sources and error states required; suggestion is review/approve/override.

KPI driven: triage accuracy (§14 AI performance), request resolution time.

### AI-F-03 — Vision-based inspections (Should, Phase 2)
*Requirements: AI-F-03, FM-06, FM-03, AI-S-06*

Module 01 Facility Management AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: inspection photos → detected defects with severity + an auto-drafted report.

Human-in-the-loop: the inspector EDITS AND APPROVES EVERY REPORT — no report is emitted without human approval.

Fallback when AI is unavailable: manual checklist flow (FM-06 unchanged).

Proposed benchmark (TBC): defect recall ≥ 80% on agreed defect classes (pilot set). Note the benchmark is recall-based and scoped to an agreed defect-class list that does not yet exist — the pilot set must be built with 7 Fifteen Capital (§11: benchmarks measured on an eval set built with the client).

Dependencies: FM-06 (inspection templates, checklist items with pass/fail/severity, mobile photo capture) supplies the input; detected defects should be capable of raising work orders via the FM-06 → FM-03 auto-raise path.

Provider: OCR/vision — "Cloud vision API or equivalent", decided at Design phase (§13.2), behind the AI-S-06 provider abstraction with health checks.

Sequencing: FM-06 is Should/Phase 2 and AI-F-03 is Should/Phase 2 — the checklist substrate and its AI layer are concurrent.

### AI-F-04 — Analytics & anomaly alerts (Should, Phase 2)
*Requirements: AI-F-04, FM-07, SC-09, AI-S-02*

Module 01 Facility Management AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: cost / energy / usage series → plain-language anomaly cards with drill-down.

Human-in-the-loop: a confirm/dismiss feedback loop tunes sensitivity — the human signal is the tuning mechanism, not just an approval gate.

Fallback when AI is unavailable: static threshold alerts (a non-AI alerting path must therefore be built).

Proposed benchmark (TBC): false-positive rate ≤ 30% after the tuning period.

Dependencies: FM-07 supplies the underlying series (cost by category/estate, downtime); drill-down must land on the same role-scoped views per §7. Energy series has no named source requirement in the PRD — no requirement defines energy/utility data capture, so its provenance is undefined (likely meter or IoT data, which §6.3 places out of scope for hardware).

UX obligation (§11.4): anomaly cards are an AI surface and must show loading, confidence, sources and error states.

Notification path: anomaly alerts should route via SC-09, though AI-F-04 does not name it explicitly.

### AI-F-05 — Facility-manager copilot (Should, Phase 2)
*Requirements: AI-F-05, AI-S-01, AI-S-06, SC-01, FM-03*

Module 01 Facility Management AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: natural-language queries over TENANT-SCOPED data → answers with sources; plus drafted actions (e.g. raise a work order).

Human-in-the-loop: EVERY drafted action requires explicit user confirmation. Nothing executes autonomously.

Fallback when AI is unavailable: normal navigation and search.

Proposed benchmark (TBC): grounded-answer accuracy ≥ 90% on the eval set.

Relationship to AI-S-01: AI-S-01 (platform-wide copilot) EXTENDS AI-F-05 across both modules and admin, with the same action-confirmation HITL and "standard UI" fallback, and shares AI-F-05's benchmark. The two are one build with a widened scope, not two independent copilots.

Guardrails that bind hardest here (§11.4): tenant-hard-scoped retrieval/embeddings/context with CI leakage tests; prompt-injection defence — user- and document-supplied content is data and cannot instruct the assistant to exceed the user's §7 permissions; every AI surface shows loading, confidence, sources and error states.

Drafted actions must obey SC-01 deny-by-default server-side authorisation — the copilot cannot be a privilege-escalation path.

KPI driven: % queries resolved by AI (§14 AI performance).

### AI-E-01 — Resident support chatbot (Should, Phase 2)
*Requirements: AI-E-01, EM-08, EM-03, AI-S-03, AI-S-06*

Module 02 Estate Management AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: resident question + the estate RAG corpus → a grounded answer WITH SOURCE, or an escalation.

Human-in-the-loop: if there is NO SOURCE, the chatbot MUST refuse and escalate to a ticket (EM-03). The corpus is curated by the Estate Manager — curation is the human control point.

Fallback when AI is unavailable: FAQ + ticket.

Proposed benchmark (TBC): routine-query deflection ≥ 60%; grounded-answer accuracy ≥ 90%.

Glossary: RAG = retrieval-augmented generation, AI answers grounded in the tenant's OWN documents.

Dependencies: EM-08 document management supplies and permissions the corpus ("all stored documents indexed for AI document intelligence"); AI-S-03 provides the indexing/semantic search; AI-S-06 provides the per-tenant vector-store namespace and the isolation tests; EM-03 receives escalated tickets.

Corpus curation is a product surface with no explicit requirement ID of its own — "corpus curated by the Estate Manager" implies an inclusion/exclusion UI beyond EM-08's folder + permission controls.

KPI driven: chatbot deflection rate (§14 Engagement, EM-02/04/09 + AI-E-01).

### AI-E-02 — Smart request triage (Should, Phase 2)
*Requirements: AI-E-02, AI-F-02, EM-03, FM-03, AI-S-06*

Module 02 Estate Management AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: photo-based classification and auto-routing of resident requests. Explicitly "a shared service with AI-F-02".

Human-in-the-loop: "Same HITL and fallback as AI-F-02" — i.e. the dispatcher/manager confirms or overrides; overrides logged for tuning.

Fallback when AI is unavailable: same as AI-F-02 — manual triage queue.

Proposed benchmark (TBC): "Shared benchmark with AI-F-02" — top-1 category accuracy ≥ 85%; assignee suggestion acceptance ≥ 70%.

Build implication: AI-E-02 is NOT an independent deliverable. It is the estate-side surface of the AI-F-02 triage service, with estate routing rules (per EM-03 AC #2: "Requests feed the shared work-order pipeline (FM-03) with estate routing"). Treating AI-F-02 and AI-E-02 as two separate builds would double-count effort; treating them as one build must still satisfy two acceptance surfaces.

Distinguishing detail: AI-E-02's stated input emphasis is PHOTO-BASED classification, whereas AI-F-02 takes "request text/photos/category" — the estate path may lean more on vision.

KPI driven: request resolution time, resident satisfaction (§14 Service quality: EM-03, FM-03, AI-E-02).

### AI-E-03 — Billing & arrears intelligence (Should, Phase 2)
*Requirements: AI-E-03, EM-01, SC-09, SC-02, AI-S-06*

Module 02 Estate Management AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: billing and payment history → anomaly flags, defaulter-risk scores, and reminder-timing suggestions.

Human-in-the-loop: managers APPROVE reminder campaigns; and the hard constraint — "no automated penalties EVER". This is the strongest prohibition in the AI section.

Fallback when AI is unavailable: fixed reminder schedule (the EM-01 proposed schedule: −3d, due, +7d, +21d).

Proposed benchmark (TBC): risk model AUC ≥ 0.75 after two billing cycles.

Data dependency (§15.2): AI-E-03 is named alongside AI-F-01 as a data-hungry feature that launches in shadow/tuning mode. "After two billing cycles" means the benchmark is not measurable within the build window if cycles are monthly and the feature ships in Phase 2.

Binding on the service-charge state machine (§10): "AI timing suggestions (AI-E-03) require manager approval"; escalation policy is per tenant. The Issued → Overdue → In arrears → Escalated branch must remain fully manual/rule-driven when AI is unavailable.

Ethical/NDPA note: defaulter-risk scores are profiling of identified residents — consent records and the processing register (§12) apply.

KPI driven: collection rate, on-time payment %, arrears reduction (EM-01, SC-02, AI-E-03).

### AI-E-04 — Communication assistant (Should, Phase 2)
*Requirements: AI-E-04, EM-04, SC-09, SC-03, AI-S-06*

Module 02 Estate Management AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: drafts announcements and translates them into the CONFIGURED languages.

Human-in-the-loop: manager approval required before ANY send. This same gate is restated as an acceptance criterion of EM-04 ("AI drafting/translation (AI-E-04) always requires manager approval before send"), so it is doubly binding.

Fallback when AI is unavailable: manual compose.

Proposed benchmark (TBC): human review pass rate ≥ 90%.

Dependencies: EM-04 (broadcast/targeted send, audience targeting, delivery/read stats), SC-09 (channels and templates), SC-03 (SMS/email providers).

BLOCKED/shaped by Q6: "Language list for localization at launch" — sizes translation and QA effort; owner Client; needed by Design phase. §12 Localization: "English at launch; additional languages per Q6; all UI strings externalised; AI translation for communications (AI-E-04)". Until Q6 is answered, the set of target languages — and therefore the translation eval set — is undefined.

Provider: translation sits behind the AI-S-06 provider abstraction (§11.4) with health checks and degradation to the manual-compose fallback.

### AI-E-05 — Marketplace intelligence (Could, Phase 3)
*Requirements: AI-E-05, AI-S-05, EM-09, SC-04, SC-06*

Module 02 Estate Management AI. Priority: COULD — "built last; first to reflow if the timeline is squeezed (any descope via Change Request)" (§6.2). Phase 3 Complete & harden, weeks 18–26.

Inputs → outputs: listing auto-generation, personalised recommendations, and fraud flags.

Human-in-the-loop: fraud flags go to a HUMAN REVIEW QUEUE — never auto-block. A vendor or listing is never suspended by the model alone.

Fallback when AI is unavailable: manual listings, no recommendations.

Proposed benchmark (TBC): fraud-flag precision ≥ 60% at review (pilot).

Dependencies: EM-09 marketplace (Should, Phase 2) and SC-04 infrastructure (Should, Phase 2) must exist first; AI-S-05 is the shared personalisation and anomaly service that sits behind AI-E-05 and bookings, carries "As AI-E-05" for both HITL and benchmark, and is also Could/Phase 3.

Cascade risk: AI-E-05 sits behind Q3 indirectly — if the marketplace commercial model (commission, escrow, payout rails, KYC) is unresolved, EM-09 payouts do not ship, which weakens the fraud-detection use case (fraud matters most where money moves).

The human review queue is an operator surface (SC-06) with no separate requirement ID.

### AI-E-06 — AI security & access (Could/optional, Phase 3) — BLOCKED by Q5
*Requirements: AI-E-06, EM-06, SC-10, AI-S-06*

Module 02 Estate Management AI. Priority: COULD (optional). Phase 3 Complete & harden, weeks 18–26 — and §16 conditions it explicitly: "AI-E-05/06 (if Q5 signed off)".

Inputs → outputs: CCTV anomaly detection and face/plate recognition.

Human-in-the-loop & prerequisites (the PRD substitutes prerequisites for a HITL description): NDPA compliance, EXPLICIT CONSENT, and DPIA SIGN-OFF (Q5). "Builds only after sign-off; integrates with client hardware (hardware out of scope)."

Fallback: not stated — the feature simply does not build.

Proposed benchmark: "Defined during DPIA; not in default acceptance." This is the only AI requirement with NO benchmark in the contracted acceptance set.

BLOCKED: Q5 — "Proceed with AI security & access (AI-E-06)? Requires consent framework + DPIA"; why: "NDPA-contingent; long lead time"; owners Client + Unrealabs; needed by Phase 2 (note: needed by Phase 2 but scheduled in Phase 3).

NFR binding (§12 Privacy & compliance): "DPIA before any AI-E-06 work" — this is a hard gate, not a recommendation. Consent records + processing register required; data residency per Q7.

Scope boundary (§6.3): hardware procurement (CCTV, IoT devices) is out of scope — software integration only, against client-owned hardware. §15.2: biometric/CCTV features are optional and NDPA-contingent.

Commercial note: AI capabilities are priced as a single USD 150,000 bundle (§18); the PRD defines no credit or substitution path if Q5 is declined.

### AI-S-01 — Platform-wide copilot (Should, Phase 2)
*Requirements: AI-S-01, AI-F-05, SC-06, SC-01, AI-S-06*

Shared platform AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: one conversational assistant across BOTH modules and admin — explicitly "extends AI-F-05".

Human-in-the-loop: "Action confirmation as AI-F-05" — every drafted action requires explicit user confirmation.

Fallback when AI is unavailable: standard UI.

Proposed benchmark (TBC): "Shared benchmark with AI-F-05" — grounded-answer accuracy ≥ 90% on the eval set.

Build implication: AI-S-01 and AI-F-05 are one copilot with two scopes. AI-F-05 is the facility-manager scope; AI-S-01 widens retrieval and action surfaces to the Estate module and the admin console (SC-06). Scoping must be per-role and per-tenant: the copilot's answers and actions are bounded by §7 permissions and the §8.2 tenant boundary.

Critical guardrail interaction (§11.4): because AI-S-01 spans admin, the prompt-injection defence matters most here — document- and user-supplied content must never be able to instruct the assistant to exceed the invoking user's permissions. Platform Admin has F (full control) on Tenant onboarding, Users & roles, Investor projects and Reports, so an injection that reached an admin session would be maximally damaging.

UX (§11.4): loading, confidence, sources and error states on every surface; assistive not autonomous.

### AI-S-02 — NL search & reporting (Should, Phase 2)
*Requirements: AI-S-02, FM-07, AI-F-04, SC-07, AI-S-06*

Shared platform AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: questions across data → answers AND reports in plain language, with the UNDERLYING RECORDS VIEWABLE.

Human-in-the-loop: "Every figure traceable to source records" — traceability is the human control; the user verifies against records rather than approving an action.

Fallback when AI is unavailable: standard reports (FM-07).

Proposed benchmark (TBC): query success rate ≥ 80% on the agreed test set.

Traceability obligation (§14): "every metric below must be reportable from the product itself (FM-07 / AI-S-02)" — AI-S-02 is one of the two named guarantors of KPI reportability. Since AI-S-02 is Should/Phase 2 and FM-07 is Must/Phase 1, FM-07 alone must satisfy the obligation if AI-S-02 slips.

Isolation: queries must be tenant-hard-scoped per §8.2 ("no query, file, search index, AI retrieval or report may cross tenants below Platform Admin") — report generation is explicitly named in the isolation rule.

Role scoping: answers must respect §7 role-scoped visibility, mirroring FM-07 AC #2.

Relationship to AI-F-04: anomaly cards with drill-down (AI-F-04) and NL reporting overlap on the same analytical substrate.

### AI-S-03 — Document intelligence (Should, Phase 2)
*Requirements: AI-S-03, EM-08, FM-01, FM-05, AI-S-06*

Shared platform AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: OCR + field extraction + semantic search across document management.

Human-in-the-loop: extracted fields are EDITABLE BEFORE SAVE — nothing is persisted from extraction without a human pass.

Fallback when AI is unavailable: manual entry and keyword search (so a non-semantic keyword search must exist independently).

Proposed benchmark (TBC): field extraction ≥ 95% on printed documents / ≥ 85% on scanned documents.

Dependencies: EM-08 document management is the named source ("All stored documents indexed for AI document intelligence (AI-S-03)"). §8.1: Document = stored file with permissions, indexed by document intelligence (AI-S-03). Other document sources exist that EM-08 does not own: FM-01 asset photos/documents, FM-05 vendor insurance/certification documents with expiry alerts — vendor certificate expiry dates are a natural field-extraction target but are not named as an AI-S-03 input.

Isolation (§11.4 + §8.2): the search index and embeddings are tenant-scoped; "no ... search index ... may cross tenants below Platform Admin"; per-tenant vector-store namespaces (proposed, ADR-01 / Q2).

Provider: OCR/vision — cloud vision API or equivalent, decided at Design phase, behind the AI-S-06 abstraction with health checks.

Permissions: extraction and retrieval must honour EM-08's folder and permission controls — a document a user cannot open must not surface via semantic search.

### AI-S-04 — Investor-dashboard AI (Should, Phase 2)
*Requirements: AI-S-04, SC-08, SC-11, AI-S-06*

Shared platform AI. Priority: Should. Phase 2, weeks 10–20.

Inputs → outputs: sales/occupancy forecasting, lead scoring, and ROI projections.

Human-in-the-loop: all outputs LABELLED AS ESTIMATES with assumptions shown; explicitly "not presented as financial advice". This is a disclosure/labelling control rather than an approval gate — there is no approve step, so the labelling IS the control and must be non-dismissable UI.

Fallback when AI is unavailable: not stated explicitly — by §11.4 the feature degrades and "core flows never block on AI", so SC-08 must render sales pipeline, occupancy and returns without projections.

Proposed benchmark (TBC): forecast error (MAPE) reviewed quarterly vs actuals — a post-launch, ongoing review measure rather than a build-acceptance threshold.

Binding restatement in SC-08: "AI projections (AI-S-04) always labelled as estimates with assumptions shown" is an acceptance criterion of SC-08 itself.

Dependencies: SC-08 (off-plan projects, sales pipeline, occupancy, returns), SC-11 (lead capture feeding the pipeline that lead scoring consumes), §8.1 Investor project / Lead entity.

Isolation: "investors see only their projects" (SC-08) applies to AI outputs too — projections must be owner-scoped within the tenant.

KPI driven: investor-dashboard usage, off-plan sales and occupancy.

### AI-S-05 — Recommendation & fraud engine (Could, Phase 3)
*Requirements: AI-S-05, AI-E-05, EM-09, EM-05, SC-04*

Shared platform AI. Priority: COULD. Phase 3 Complete & harden, weeks 18–26.

Inputs → outputs: shared personalisation and anomaly service sitting BEHIND AI-E-05 and bookings.

Human-in-the-loop: "As AI-E-05" — fraud flags go to a human review queue, never auto-block.

Fallback when AI is unavailable: "As AI-E-05" — manual listings, no recommendations.

Proposed benchmark (TBC): "As AI-E-05" — fraud-flag precision ≥ 60% at review (pilot).

Build implication: AI-S-05 is the shared service layer and AI-E-05 is its marketplace-facing surface; the second named consumer is BOOKINGS (EM-05) — meaning EM-05 gets personalisation/anomaly detection that EM-05's own acceptance criteria never mention. This is the only place bookings-side AI appears in the PRD.

Dependencies: SC-04 (shared catalog/order/payment services span marketplace and paid bookings), EM-09, EM-05.

Descope exposure (§6.2): Could items are "first to reflow if the timeline is squeezed", and Phase 3 (weeks 18–26) also carries NFR verification, performance/security hardening, UAT, deployment, go-live, integration and handover — AI-S-05 and AI-E-05/06 compete directly with go-live activities in the same window.

### AI-S-06 — AI architecture & guardrails (MUST, Phase 1) — the only Must-priority AI requirement
*Requirements: AI-S-06, SC-06, SC-07, SC-10, SC-01*

Shared platform AI. Priority: MUST — the only AI requirement that is Must, and the only AI requirement in Phase 1 (weeks 1–12, "AI guardrails scaffolding").

Inputs → outputs: LLM + RAG vector store, prompt/cost controls, logging — "the platform every AI feature runs on".

Human-in-the-loop & fallback: "See §11.4 — release-blocking requirements."

Proposed benchmark: ZERO cross-tenant retrieval in isolation tests — and uniquely marked "(hard requirement)", not TBC. Every other AI benchmark is a proposed baseline; this one is absolute.

§11.4 AI guardrails & design requirements (all release-blocking):
1. Tenant isolation — retrieval, embeddings and context are HARD-SCOPED to the tenant; automated cross-tenant leakage tests run in CI.
2. Provider abstraction — LLM/OCR/translation behind an abstraction WITH HEALTH CHECKS; on provider failure, features degrade to their listed fallback; core flows NEVER block on AI.
3. Cost controls — per-tenant AND per-feature usage caps with alerts and a KILL-SWITCH PER FEATURE (usage billed to Client per §15).
4. Prompt-injection defence — user- and document-supplied content is treated as DATA; the assistant cannot be instructed by it to exceed the user's permissions (§7).
5. Logging & privacy — all AI interactions logged (AI interaction log, §8.1: every AI request/response, confidence, override; per tenant; powers audit, tuning and cost metering) with PII minimised/redacted in logs.
6. UX states — every AI surface shows LOADING, CONFIDENCE, SOURCES and ERROR states; every suggestion is review/approve/override — AI is assistive, not autonomous.

Configuration surface: §8.2 per-tenant configuration includes AI feature flags and usage caps; the kill-switch and caps are admin-console (SC-06) features.

BLOCKED/shaped by: Q2 (isolation strategy determines per-tenant vector-store namespacing), Q7 (hosting/data residency for the vector store and AI logs under NDPA), Q12 (per-tenant AI budget caps and alert thresholds — the concrete numbers behind guardrail #3; owner Client, needed by Phase 2, while AI-S-06 builds in Phase 1).

Provider decision (§13.2): LLM/AI is provider-agnostic (e.g. Anthropic, OpenAI) behind AI-S-06; decided at Design phase.

KPI: §14 AI performance metrics are measured from AI-S-06 logs.

### Phase mapping (§16) — verbatim allocation of all 45 requirement IDs
*Requirements: SC-01, SC-02, SC-03, SC-05, SC-06, SC-07, SC-09, SC-10, FM-01, FM-02, FM-03, FM-05, FM-07, FM-08, EM-01, EM-02, EM-03, EM-04, EM-06, AI-S-06, FM-04, FM-06, EM-05, EM-07, EM-08, EM-09, SC-04, SC-08, SC-11, AI-F-01, AI-F-02, AI-F-03, AI-F-04, AI-F-05, AI-E-01, AI-E-02, AI-E-03, AI-E-04, AI-S-01, AI-S-02, AI-S-03, AI-S-04, AI-E-05, AI-E-06, AI-S-05*

Indicative 6-month plan, July–December 2026; detailed roadmap confirmed at kickoff. Phase weeks OVERLAP, so a requirement's phase does not pin a delivery week.

PHASE 1 — Foundations & MVP, weeks 1–12 (indicative). Focus: discovery, brand, UX/UI; shared core; Must-priority features; AI guardrails scaffolding.
Requirement IDs: SC-01, SC-02, SC-03, SC-05, SC-06, SC-07, SC-09, SC-10 · FM-01, FM-02, FM-03, FM-05, FM-07, FM-08 · EM-01, EM-02, EM-03, EM-04, EM-06 · AI-S-06. (20 IDs)

PHASE 2 — Committed scope, weeks 10–20. Focus: Should-priority features BEHIND FLAGS; AI feature set on the guardrails platform.
Requirement IDs: FM-04, FM-06 · EM-05, EM-07, EM-08, EM-09 · SC-04, SC-08, SC-11 · AI-F-01…05 · AI-E-01…04 · AI-S-01…04. (22 IDs)

PHASE 3 — Complete & harden, weeks 18–26. Focus: Could items; performance/security hardening; UAT; deployment, go-live, integration & handover.
Requirement IDs: AI-E-05, AI-E-06 (IF Q5 SIGNED OFF) · AI-S-05 · plus NFR verification · docs & runbooks. (3 requirement IDs)

Coverage check: 20 + 22 + 3 = 45 = every ID in the PRD. No requirement is unphased and none is double-phased.

Priority-to-phase correlation is exact: every Must is Phase 1 (22 Musts: 14 non-AI Phase 1 + ... precisely SC-01/02/03/05/06/07/09/10, FM-01/02/03/05/07/08, EM-01/02/03/04/06, AI-S-06 = 20 — note SC-09 and SC-10 are Must and Phase 1, and AI-S-06 is the only Must AI item); every Should is Phase 2 (20 items); every Could is Phase 3 (3 items: AI-E-05, AI-E-06, AI-S-05).

Process (§16): Discovery → design (up to 3 revision rounds) → build → QA → client review (5 business days; DEEMED ACCEPTANCE IF NO RESPONSE) → deployment — with a 30-day post-deployment warranty on reproducible bugs.
Milestones: (1) discovery, brand & UX/UI kickoff · (2) core development · (3) testing & QA · (4) deployment · (5) go-live · (6) third-party integration & handover.

### Open questions Q1–Q12 (§17) → requirements they block, with owner and deadline
*Requirements: SC-07, SC-01, SC-06, SC-11, AI-S-06, EM-09, SC-04, SC-02, EM-06, SC-09, AI-E-06, AI-E-04, SC-05, SC-10, EM-02, EM-01, FM-01, FM-08, SC-03, FM-04, AI-E-05, AI-S-05*

"These block or shape build work. Each needs an owner and an answer by the phase shown; unresolved items default to the (proposed) baseline in this document."

Q1 — Who exactly is a "tenant" — estates operated by 7 Fifteen Capital, or third-party operators too? Matters: shapes onboarding, branding and commercial model. Owner: Client. Needed by: Kickoff. BLOCKS/SHAPES: SC-07 (tenant onboarding + branding config), SC-01 (role scoping semantics), SC-06 (admin console tenant management), SC-11 (branding/positioning of the public page).

Q2 — Confirm data-isolation strategy (ADR-01: shared DB + row-level security vs schema-per-tenant). Matters: "Foundational architecture; expensive to change later." Owner: UNREALABS (the only Unrealabs-solo question). Needed by: Kickoff. BLOCKS: SC-07 (§8.2 isolation strategy is marked proposed pending this), AI-S-06 (per-tenant vector-store namespaces), SC-01 (DB-layer enforcement), and transitively every data-touching requirement.

Q3 — Marketplace commercial model: commission %, escrow, vendor payout rails and KYC. Matters: "Payouts have regulatory and gateway implications; BLOCKS EM-09 PAYOUT BUILD." Owner: Client. Needed by: Phase 2 start. BLOCKS: EM-09 (named), SC-04 (shared payment service payout side), SC-02 (split payments/payouts in the gateway abstraction), AI-E-05/AI-S-05 (fraud use case).

Q4 — SOS operating model: who responds, escalation chain, liability and manned hours. Matters: "Safety-critical flow; drives EM-06 SLAs and staffing." Owner: Client. Needed by: Phase 1. BLOCKS/SHAPES: EM-06 (a Phase 1 Must — the question is due in the same phase the feature is built), SC-09 (escalation routing to backup responders).

Q5 — Proceed with AI security & access (AI-E-06)? Requires consent framework + DPIA. Matters: NDPA-contingent; long lead time. Owners: Client + Unrealabs. Needed by: Phase 2. BLOCKS: AI-E-06 absolutely — §16 conditions Phase 3 delivery on "if Q5 signed off" and §12 requires "DPIA before any AI-E-06 work".

Q6 — Language list for localization at launch. Matters: sizes translation and QA effort. Owner: Client. Needed by: Design phase. BLOCKS/SHAPES: AI-E-04 (translation target languages and eval set), SC-06/SC-05 (all UI strings externalised), EM-04, SC-09 (per-tenant templates per language), §8.2 tenant config (languages).

Q7 — Hosting provider and data-residency requirement (Nigeria vs regional cloud). Matters: NDPA posture, latency and cost. Owner: Client. Needed by: Kickoff. BLOCKS/SHAPES: SC-07, AI-S-06 (where the vector store and AI logs live), SC-10 (immutable log residency), EM-02 (visitor-log retention), AI-E-06, all §12 privacy targets.

Q8 — Launch sizing: tenants, units, users, expected concurrency. Matters: validates §12 scalability targets and load tests. Owner: Client. Needed by: Design phase. SHAPES: SC-07 and the §12 design target (20 tenants / 10,000 units / 50,000 users / 1,000 concurrent) plus the documented horizontal scale path; gates Phase 3 NFR verification.

Q9 — Any legacy data to migrate (spreadsheets, resident lists, asset registers)? Matters: "Migration is UNSCOPED; may need a Change Request." Owner: Client. Needed by: Kickoff. SHAPES: FM-01 (CSV bulk import), EM-02 (resident onboarding), SC-07 (bulk import of estates/units), FM-04. No requirement ID covers migration.

Q10 — Payment reconciliation source of truth (gateway settlement vs bank statements). Matters: "Defines EM-01 reconciliation rules." Owner: Client. Needed by: Phase 1. BLOCKS/SHAPES: EM-01 (auto-reconcile AC), SC-02 (per-tenant reconciliation report).

Q11 — iOS distribution: v1.0 lists TestFlight/IPA — is a production App Store release in scope? Matters: affects review lead times and release plan. Owners: Client + Unrealabs. Needed by: Phase 1. BLOCKS/SHAPES: SC-05 (named inside its acceptance criteria), FM-08, §13.1 footprint.

Q12 — Per-tenant AI/SMS budget caps and alert thresholds. Matters: "Client pays usage; caps prevent surprises." Owner: Client. Needed by: Phase 2. BLOCKS/SHAPES: AI-S-06 (guardrail #3 cost controls, caps + alerts + kill-switch), SC-03 (SMS metering), SC-07 (per-tenant usage metering), §8.2 per-tenant usage caps config.

Timing hazard: Q4 and Q10 are due "Phase 1" while EM-06 and EM-01 are Phase 1 Must features; Q3 is due "Phase 2 start" while EM-09/SC-04 build in Phase 2; Q12 is due Phase 2 while AI-S-06 builds in Phase 1. Four questions land no earlier than the work they gate.

### §10 workflow state machines — the QA/backend/mobile contract binding FM-03, EM-01, EM-05, EM-06, EM-09
*Requirements: FM-03, EM-01, EM-05, EM-06, EM-09, SC-09, SC-10, AI-F-02, AI-E-02, AI-E-03*

"State machines below are the contract between backend, mobile and QA. ONLY THE LISTED TRANSITIONS ARE LEGAL; every transition is timestamped, actor-attributed and notified via SC-09. SLA values are proposed defaults, CONFIGURABLE PER TENANT."

1) WORK ORDER (FM-03, consumed by EM-03, FM-02, FM-06)
States: New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed. Branches: Rejected, Cancelled.
Rules/SLAs (proposed): AI triage suggests category/priority/assignee, human confirms (AI-F-02 / AI-E-02). SLA timers per priority — Emergency: respond 2h / resolve 24h; Routine: 72h. Resolved → Verified by requester OR manager; auto-close after 5 days.

2) SERVICE CHARGE (EM-01)
States: Draft → Issued → Partially paid → Paid; and Issued → Overdue → In arrears → Escalated.
Rules: reminder schedule (−3d, due, +7d, +21d) via SC-09; AI timing suggestions (AI-E-03) require manager approval; escalation policy per tenant.

3) BOOKING (EM-05)
States: Requested → Approved / Auto-approved → Confirmed → Completed. Branches: Declined, Cancelled.
Rules: auto-approval per amenity rules; payment (if fees) required to confirm; cancellation window per policy.

4) SOS EVENT (EM-06)
States: Raised → Acknowledged → Responding → Resolved → Reviewed.
Rules: acknowledge target < 60s during manned hours (proposed); unacknowledged alerts escalate to backup responders; full timeline retained for review.

5) MARKETPLACE ORDER (EM-09)
States: Placed → Accepted → Fulfilled → Closed. Branches: Declined, Refunded.
Rules: vendor must accept within SLA or order auto-expires; refunds via gateway; payout model pending Q3.

Build implications: (a) the "only listed transitions are legal" clause makes an explicit transition-guard implementation mandatory, not a UI convention; (b) every transition emits an SC-09 event and an SC-10-eligible audit entry with actor + tenant + timestamp; (c) all SLA/timing values are per-tenant configuration, so they belong in the §8.2 tenant config surface, not in code constants; (d) the work-order machine must be drivable offline (§12.1 queued writes, server-authoritative conflict resolution).

### §7 permissions matrix — the authoritative role/capability baseline every requirement's UI must obey
*Requirements: SC-01, SC-06, FM-05, FM-07, EM-01, EM-06, SC-08, SC-07*

"Server-side, DENY-BY-DEFAULT enforcement on every API (SC-01)." Legend: F full control · M manage (create/edit within own tenant/estate) · V view · O own records only · — no access. Roles: Plat = Platform Admin (7 Fifteen Capital HQ), Exec = Owner/Executive, EstM = Estate Manager, FacM = Facility Manager, Tech = Technician, Res = Resident, Sec = Security, Ven = Vendor, Inv = Investor.

Capability rows (Plat / Exec / EstM / FacM / Tech / Res / Sec / Ven / Inv):
- Tenant onboarding & config: F / — / V / — / — / — / — / — / —
- Users & roles: F / V / M / M / — / O / — / O / O
- Assets & PPM plans: V / V / V / M / V / — / — / — / —
- Work orders: V / V / M / M / O / O / — / O / —
- Inspections & compliance: V / V / V / M / O / — / — / — / —
- Charges & invoicing: V / V / M / — / — / O / — / — / —
- Payments (pay in-app): — / — / — / — / — / O / — / — / —
- Announcements: V / V / M / M / — / V / V / — / —
- Bookings & amenities: V / V / M / — / — / O / V / — / —
- Security & SOS: V / V / M / — / — / O / M / — / —
- Marketplace: V / V / M / — / — / O / — / O / —
- Investor projects: F / V / — / — / — / — / — / — / O
- Reports & analytics: F / V / M / M / — / — / — / — / V

"Fine-grained permissions per endpoint are finalised at design; THIS MATRIX IS THE AUTHORITATIVE BASELINE."

Notable consequences for the web app (SC-06): Platform Admin has only V (not F) on all operational capabilities — F only on tenant onboarding, users & roles, investor projects and reports; Executive is view-only everywhere except no access to tenant config and payments; Facility Manager has NO access to charges, bookings, security/SOS, marketplace or tenant config; Estate Manager is the broadest operational role (M on 8 rows); Security has M only on Security & SOS, V on announcements and bookings; Technician has V on assets/PPM and O on work orders and inspections only; Investor sees only investor projects (O) and reports (V).

Mismatch to resolve: §5 target users lists "Worker / Security" as one Estate persona, but §7 has only a Sec column — no separate Worker role exists in the matrix, giving 9 roles. Also, FM-05 requires vendors to submit invoices via the vendor portal, yet Vendor is "—" on Charges & invoicing.

### AI requirement summary matrix — priority, phase, HITL strength and fallback for all 17 AI IDs
*Requirements: AI-F-01, AI-F-02, AI-F-03, AI-F-04, AI-F-05, AI-E-01, AI-E-02, AI-E-03, AI-E-04, AI-E-05, AI-E-06, AI-S-01, AI-S-02, AI-S-03, AI-S-04, AI-S-05, AI-S-06*

All 17 AI requirements at a glance. Priority / Phase / HITL control type / fallback / benchmark:

AI-F-01 Predictive maintenance — Should / P2 / FM approves before schedule change + shadow mode / standard PPM calendar unaffected / precision ≥ 70% on 30-day window after 3–6 months data.
AI-F-02 Smart WO triage — Should / P2 / dispatcher confirms or overrides, overrides logged / manual triage queue / top-1 category ≥ 85%, assignee acceptance ≥ 70%.
AI-F-03 Vision inspections — Should / P2 / inspector edits and approves every report / manual checklist flow / defect recall ≥ 80% on agreed classes (pilot).
AI-F-04 Analytics & anomaly alerts — Should / P2 / confirm/dismiss feedback tunes sensitivity / static threshold alerts / false-positive rate ≤ 30% after tuning.
AI-F-05 FM copilot — Should / P2 / every drafted action needs explicit confirmation / normal navigation and search / grounded-answer accuracy ≥ 90%.
AI-E-01 Resident chatbot — Should / P2 / no source ⇒ must refuse and escalate to ticket; EM curates corpus / FAQ + ticket / deflection ≥ 60%, grounded accuracy ≥ 90%.
AI-E-02 Smart request triage — Should / P2 / same as AI-F-02 / same as AI-F-02 / shared with AI-F-02.
AI-E-03 Billing & arrears intelligence — Should / P2 / managers approve reminder campaigns; NO AUTOMATED PENALTIES EVER / fixed reminder schedule / risk model AUC ≥ 0.75 after two billing cycles.
AI-E-04 Communication assistant — Should / P2 / manager approval before any send / manual compose / human review pass rate ≥ 90%.
AI-E-05 Marketplace intelligence — Could / P3 / fraud flags to human review queue, never auto-block / manual listings, no recommendations / fraud-flag precision ≥ 60% (pilot).
AI-E-06 AI security & access — Could (optional) / P3 if Q5 signed off / prerequisites: NDPA compliance, explicit consent, DPIA sign-off / n/a — does not build / defined during DPIA, NOT in default acceptance.
AI-S-01 Platform-wide copilot — Should / P2 / action confirmation as AI-F-05 / standard UI / shared with AI-F-05.
AI-S-02 NL search & reporting — Should / P2 / every figure traceable to source records / standard reports (FM-07) / query success ≥ 80%.
AI-S-03 Document intelligence — Should / P2 / extracted fields editable before save / manual entry + keyword search / extraction ≥ 95% printed, ≥ 85% scanned.
AI-S-04 Investor-dashboard AI — Should / P2 / labelled estimates with assumptions shown; not financial advice / (implicit: SC-08 without projections) / MAPE reviewed quarterly vs actuals.
AI-S-05 Recommendation & fraud engine — Could / P3 / as AI-E-05 / as AI-E-05 / as AI-E-05.
AI-S-06 AI architecture & guardrails — MUST / P1 / §11.4 release-blocking / n/a (it IS the fallback machinery) / ZERO cross-tenant retrieval (hard requirement).

Pattern: 14 Should, 3 Could... precisely 1 Must (AI-S-06), 13 Should, 3 Could. Fourteen of 17 sit in Phase 2 or 3, while the platform they run on (AI-S-06) is Phase 1. Every single AI feature has a named non-AI fallback except AI-E-06 (which simply does not build) — consistent with §11.4 "core flows never block on AI" and §15.2 "assistive by design".

Commercial weight: AI capabilities are priced at USD 150,000 of the USD 300,000 total (§18) — half the contract value sits in requirements that are mostly Should/Could and mostly Phase 2/3.

### Cross-cutting NFRs (§12) that act as acceptance criteria on the web app (SC-06) and every other requirement
*Requirements: SC-06, SC-05, SC-07, SC-01, SC-10, AI-S-06, FM-03, FM-08, EM-06, EM-02, AI-E-04, AI-E-06*

"Targets marked (proposed) are engineering baselines to design and test against; confirm with 7 Fifteen Capital at discovery." These are not a separate requirement family — they are testable conditions layered on top of the 45 IDs, and §16 Phase 3 carries "NFR verification" as a deliverable.

- PERFORMANCE: fast load on mobile networks; smooth under concurrent load. Target: API P95 < 500 ms; key screens interactive < 3 s on 4G and usable on 3G. (Binds SC-05, SC-06, FM-08.)
- RELIABILITY: high availability; AI fails safely. Target: 99.5% monthly availability for core flows; AI outage NEVER blocks core; backups with RPO ≤ 24 h, RTO ≤ 4 h. (Binds AI-S-06, all AI IDs.)
- SECURITY: RBAC, encryption, certified gateway, audit logs, tenant isolation. Target: OWASP ASVS L2; TLS 1.2+ in transit, AES-256 at rest; MFA for admin roles; audit log per SC-10; cross-tenant tests RELEASE-BLOCKING. (Binds SC-01, SC-02, SC-07, SC-10, AI-S-06.)
- PRIVACY & COMPLIANCE: NDPA compliance; consent for biometric/CCTV. Target: consent records + processing register; DPIA before ANY AI-E-06 work; per-entity retention schedule; data residency per Q7. (Binds EM-02 visitor logs, SC-10 retention, AI-E-06, AI-E-03 profiling.)
- SCALABILITY: grows with tenants, units and users. Target: launch sizing to confirm (Q8) — design target 20 tenants / 10,000 units / 50,000 users / 1,000 concurrent; documented horizontal scale path. (Binds SC-07.)
- ACCESSIBILITY: mobile-first, responsive, connectivity-tolerant. Target: WCAG 2.1 AA FOR WEB; offline behaviour per §12.1. (Binds SC-06 directly — this is the accessibility bar for the Next.js app.)
- LOCALIZATION: multilingual for a diverse user base. Target: English at launch; additional languages per Q6; ALL UI STRINGS EXTERNALISED; AI translation for communications (AI-E-04). (Binds SC-05, SC-06, EM-04, SC-09 templates.)
- MAINTAINABILITY: modular, shared design system, documented handover. Target: modular services; CI/CD; UNIT-TEST COVERAGE ≥ 70% on core domains; runbooks + handover docs per §16.

§12.1 OFFLINE & POOR-CONNECTIVITY BEHAVIOUR (no owning requirement ID — see open issues):
- Read caching for dashboards, work-order lists and key resident screens.
- Queued writes for work-order updates, inspection logs and SOS (SMS fallback for SOS, proposed), with VISIBLE SYNC STATUS.
- Conflict resolution is SERVER-AUTHORITATIVE; overwritten offline edits are surfaced to the user AND audit-logged.

Environments (§13.1): dev, staging and production with CI/CD promotion; staging seeded with realistic MULTI-TENANT test data.

## Code-ready artifacts

### requirements-catalog.ts (`typescript`)

```typescript
// PRD v2.0 — Facility & Estate Management Platform (7 Fifteen Capital / Unrealabs)
// Complete requirements catalog: all 45 IDs, verbatim-faithful to the PRD.
// Suggested location: src/domain/requirements.ts

export type ModuleKey = "FM" | "EM" | "SC" | "AI-F" | "AI-E" | "AI-S";
export type Priority = "Must" | "Should" | "Could";
export type Phase = 1 | 2 | 3;
export type OpenQuestionId =
  | "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6"
  | "Q7" | "Q8" | "Q9" | "Q10" | "Q11" | "Q12";

export interface Requirement {
  id: string;
  title: string;
  module: ModuleKey;
  moduleLabel: string;
  priority: Priority;
  /** Marked "(new in v2.0)" in the PRD. */
  newInV2?: true;
  /** Marked "(optional)" in the PRD. */
  optional?: true;
  story: string;
  /** Acceptance criteria, condensed but complete. */
  ac: string[];
  phase: Phase;
  /** §17 questions that block or materially shape this requirement. */
  blockedBy: OpenQuestionId[];
  /** Requirement IDs this one depends on or is cited by. */
  relates: string[];
}

export const PHASE_WEEKS: Record<Phase, string> = {
  1: "weeks 1-12 — Foundations & MVP",
  2: "weeks 10-20 — Committed scope",
  3: "weeks 18-26 — Complete & harden",
};

export const REQUIREMENTS: Requirement[] = [
  // ── Module 01 — Facility Management ──────────────────────────────────────
  {
    id: "FM-01", title: "Asset management & register",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: ["Q9"],
    story: "As a Facility Manager, I maintain a register of every asset so identity, location and history are trackable.",
    ac: [
      "Asset CRUD: name, category, serial/tag, location (estate>building>unit/zone), status, purchase & warranty dates, photos, documents.",
      "Assets link to work orders and inspections; service history viewable per asset.",
      "Archive only (no hard delete); all changes audit-logged (PRD cites SC-11; believed to mean SC-10).",
      "Bulk import via CSV template.",
    ],
    relates: ["FM-03", "FM-04", "FM-06", "SC-10", "AI-F-01", "AI-S-03"],
  },
  {
    id: "FM-02", title: "Preventive maintenance & scheduling",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: [],
    story: "As a Facility Manager, I define recurring PPM plans so work is scheduled before failure.",
    ac: [
      "PPM plans: frequency, checklist, assignee rules, lead time; per asset or per category.",
      "Scheduler auto-generates work orders ahead of due date; calendar view; overdue flagged.",
      "Completion requires checklist + evidence photo (configurable).",
    ],
    relates: ["FM-01", "FM-03", "FM-07", "AI-F-01"],
  },
  {
    id: "FM-03", title: "Work-order management",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", newInV2: true, phase: 1, blockedBy: [],
    story: "As a Technician, I receive, update and close work orders on mobile so nothing gets lost.",
    ac: [
      "Lifecycle states and transitions exactly per §10, with per-priority SLA timers.",
      "Assign to internal technician or vendor; reassignment and every state change tracked and notified.",
      "Capture photos, notes, parts and costs; requester notified on state changes.",
      "Offline updates supported per §12.1 (queued writes, visible sync status, server-authoritative conflicts).",
    ],
    relates: ["FM-02", "FM-05", "FM-06", "EM-03", "SC-09", "SC-10", "AI-F-02", "AI-E-02"],
  },
  {
    id: "FM-04", title: "Space management",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Should", phase: 2, blockedBy: ["Q9"],
    story: "As a Facility Manager, I manage the space hierarchy so occupancy and allocation are always current.",
    ac: [
      "estate>building>floor>unit/zone hierarchy maintained once, shared with the Estate module.",
      "Occupancy/allocation status per space; spaces link to assets, bookings and residents.",
    ],
    relates: ["FM-01", "EM-01", "EM-02", "EM-05", "SC-07"],
  },
  {
    id: "FM-05", title: "Vendor management",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: [],
    story: "As a Facility Manager, I onboard vendors and route jobs to them so external work is controlled.",
    ac: [
      "Vendor profiles: services, coverage, documents (insurance/certifications) with expiry alerts.",
      "Vendors receive assignments and submit updates & invoices via the vendor portal.",
      "Performance metrics: jobs completed, SLA hit rate, rating.",
    ],
    relates: ["FM-03", "EM-07", "EM-09", "SC-01", "SC-09", "AI-S-03"],
  },
  {
    id: "FM-06", title: "Inspection & compliance tracking",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Should", phase: 2, blockedBy: [],
    story: "As a Facility Manager, I schedule inspections so compliance is evidenced, not assumed.",
    ac: [
      "Inspection templates with checklist items (pass/fail/severity); scheduled and ad-hoc runs on mobile with photo capture.",
      "Failed items auto-raise work orders (FM-03).",
      "Compliance register shows status and expiry per obligation.",
    ],
    relates: ["FM-01", "FM-03", "AI-F-03"],
  },
  {
    id: "FM-07", title: "Reporting & analytics",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: [],
    story: "As an Executive, I see portfolio performance so decisions stop being guesswork.",
    ac: [
      "Dashboards: open/overdue WOs, PPM compliance %, downtime, cost by category/estate.",
      "Filters by estate/date; export CSV/PDF; role-scoped visibility per §7.",
      "§14: every KPI must be reportable from the product itself (FM-07 / AI-S-02).",
    ],
    relates: ["FM-02", "FM-03", "AI-F-04", "AI-S-02", "SC-08"],
  },
  {
    id: "FM-08", title: "Full mobile access",
    module: "FM", moduleLabel: "Module 01 — Facility Management",
    priority: "Must", phase: 1, blockedBy: ["Q11"],
    story: "As a Technician, I do my whole job from my phone, including in poor-connectivity areas.",
    ac: [
      "All technician and FM day-to-day flows usable on Android/iOS.",
      "Push notifications for assignments and escalations; camera-first capture.",
    ],
    relates: ["SC-05", "SC-09", "FM-03", "FM-06"],
  },

  // ── Module 02 — Estate Management ────────────────────────────────────────
  {
    id: "EM-01", title: "Service charge & billing",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: ["Q10"],
    story: "As an Estate Manager, I issue charges and track collection so cash flow is predictable.",
    ac: [
      "Charge setup per unit type/size: recurring cycles, one-off levies, penalties/discounts (configurable).",
      "Invoices generated and delivered in-app + email/SMS; residents pay in-app via gateway (SC-02).",
      "Payments auto-reconcile to invoices; partial payments, receipts and arrears aging supported.",
      "Statements per unit/resident; accounting export.",
    ],
    relates: ["SC-02", "SC-09", "AI-E-03", "FM-07", "FM-04"],
  },
  {
    id: "EM-02", title: "Residents & visitor management",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: ["Q7", "Q9"],
    story: "As an Estate Manager, I onboard residents and control guest access so I know who is on the estate.",
    ac: [
      "Resident onboarding (invite + profile) linked to unit(s); move-in/move-out; household members supported.",
      "Visitor invites generate time-bound codes/QR verified by Security at the gate; visitor log retained per NDPA retention policy (§12).",
    ],
    relates: ["SC-01", "SC-10", "EM-06", "FM-04"],
  },
  {
    id: "EM-03", title: "Maintenance request portal",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: [],
    story: "As a Resident, I raise a request with photos and track it to resolution without chasing anyone.",
    ac: [
      "Request: category, description, photos -> ticket ID with visible status.",
      "Requests feed the shared work-order pipeline (FM-03) with estate routing.",
      "Resident notified on each state change and can rate the resolution.",
    ],
    relates: ["FM-03", "SC-09", "AI-E-01", "AI-E-02"],
  },
  {
    id: "EM-04", title: "Announcements & communication",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: ["Q6"],
    story: "As an Estate Manager, I reach the right residents on the channels they actually read.",
    ac: [
      "Broadcast and targeted (estate/building/audience) sends via in-app, push, SMS, email per user preference (SC-09).",
      "Delivery/read statistics visible to managers.",
      "AI drafting/translation (AI-E-04) ALWAYS requires manager approval before send.",
    ],
    relates: ["SC-09", "SC-03", "AI-E-04"],
  },
  {
    id: "EM-05", title: "Facility booking",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Should", phase: 2, blockedBy: [],
    story: "As a Resident, I book shared amenities without a WhatsApp back-and-forth.",
    ac: [
      "Amenity setup: capacity, hours, rules, optional fees.",
      "Availability calendar; auto- or manager-approval per amenity; fees paid via gateway; cancellation per policy.",
    ],
    relates: ["SC-04", "SC-02", "FM-04", "AI-S-05"],
  },
  {
    id: "EM-06", title: "Security & SOS alerts",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Must", phase: 1, blockedBy: ["Q4"],
    story: "As a Resident, I trigger an SOS and know security has seen it.",
    ac: [
      "SOS alerts security desk and designated responders with unit/location; acknowledge -> responding -> resolved with timestamps (§10).",
      "Patrol and incident logging for security staff; all security events audit-logged.",
      "SOS submission works on poor connectivity with SMS fallback (proposed).",
    ],
    relates: ["SC-09", "SC-10", "SC-03", "EM-02", "AI-E-06"],
  },
  {
    id: "EM-07", title: "Vendor / staff directory",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Should", phase: 2, blockedBy: [],
    story: "As a Resident, I find approved vendors and estate staff without asking around.",
    ac: ["Searchable directory with services and contact routes; visibility rules per role (§7)."],
    relates: ["FM-05", "SC-01"],
  },
  {
    id: "EM-08", title: "Document management",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Should", phase: 2, blockedBy: ["Q7"],
    story: "As an Estate Manager, I publish estate documents once and the right people can always find them.",
    ac: [
      "Upload/organise with folder and permission control; residents see documents shared to their audience.",
      "All stored documents indexed for AI document intelligence (AI-S-03).",
    ],
    relates: ["AI-S-03", "AI-E-01", "SC-07", "SC-01"],
  },
  {
    id: "EM-09", title: "Marketplace",
    module: "EM", moduleLabel: "Module 02 — Estate Management",
    priority: "Should", phase: 2, blockedBy: ["Q3"],
    story: "As a Resident, I buy services from approved vendors inside the app.",
    ac: [
      "Vendors list products/services; residents browse, order and pay via gateway.",
      "Order lifecycle (placed -> accepted -> fulfilled -> closed) with notifications.",
      "Commission/payout model per commercial decision — Q3 BLOCKS BUILD OF PAYOUTS.",
    ],
    relates: ["SC-04", "SC-02", "FM-05", "AI-E-05", "AI-S-05"],
  },

  // ── Shared core platform ─────────────────────────────────────────────────
  {
    id: "SC-01", title: "Multi-user profiles & RBAC",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q1", "Q2"],
    story: "As any user, I see and do only what my role allows — enforced by the server, not the UI.",
    ac: [
      "Roles and access per §7, tenant- and estate-scoped; deny-by-default on every API.",
      "Session and password policy; MFA for admin roles (proposed in SC-01, firm target in §12).",
    ],
    relates: ["SC-07", "SC-10", "AI-S-06", "SC-06"],
  },
  {
    id: "SC-02", title: "Payments integration",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q10", "Q3"],
    story: "As a Resident, I pay any charge in-app and it reconciles itself.",
    ac: [
      "Gateway abstraction (provider per §13: Paystack / Flutterwave, decided at kickoff) supporting cards, transfers and USSD where available.",
      "Webhook-confirmed payments with idempotency and retries; refund/void; per-tenant reconciliation report.",
    ],
    relates: ["EM-01", "EM-05", "EM-09", "SC-04"],
  },
  {
    id: "SC-03", title: "Core integrations",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q12"],
    story: "As the platform, I send SMS/email and render maps through swappable providers.",
    ac: [
      "SMS/email behind an abstraction with template management and delivery-failure handling/logs; maps for locations.",
      "Providers per §13.2: SMS Termii/Twilio (kickoff), Email SES/SendGrid/Mailgun (kickoff), Maps Google Maps Platform (design phase).",
    ],
    relates: ["SC-09", "SC-07", "EM-01", "EM-04", "EM-06"],
  },
  {
    id: "SC-04", title: "E-commerce / marketplace infrastructure",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Should", phase: 2, blockedBy: ["Q3"],
    story: "As the platform, I provide shared catalog/order/payment services that EM-09 consumes.",
    ac: ["Catalog, cart/order and payment services shared between marketplace and paid bookings."],
    relates: ["EM-09", "EM-05", "SC-02", "AI-S-05"],
  },
  {
    id: "SC-05", title: "Mobile apps (Android, iOS)",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q11", "Q6"],
    story: "As a user, I get the same product on Android and iOS.",
    ac: [
      "Single cross-platform codebase (framework decision at kickoff); Android AAB + iOS builds.",
      "Distribution: Play Store + TestFlight/IPA per v1.0 — production App Store release is open question Q11.",
      "Push via FCM/APNs; crash and performance reporting wired in.",
    ],
    relates: ["FM-08", "SC-09", "SC-06"],
  },
  {
    id: "SC-06", title: "Web app & admin dashboard",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q1", "Q6"],
    story: "As an operator, I run everything from a browser.",
    ac: [
      "Responsive web app for residents/managers.",
      "Platform admin console for tenant management, configuration and audit views.",
      "§12: WCAG 2.1 AA for web; key screens interactive <3s on 4G; all UI strings externalised.",
    ],
    relates: ["SC-01", "SC-07", "SC-08", "SC-10", "FM-07", "AI-S-01"],
  },
  {
    id: "SC-07", title: "Multi-tenant deployment",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", phase: 1, blockedBy: ["Q1", "Q2", "Q7", "Q8", "Q12"],
    story: "As Platform Admin, I onboard a new organisation without touching code, and tenants can never see each other.",
    ac: [
      "All §8.2 isolation requirements met; cross-tenant access tests pass in CI (release-blocking).",
      "Tenant onboarding (org > estates/units bulk import, branding, settlement account, languages, enabled features).",
      "Per-tenant configuration: branding, notification templates, amenity rules, charge structures, AI feature flags and usage caps.",
      "Per-tenant usage metering for AI, SMS and email.",
    ],
    relates: ["SC-01", "SC-03", "SC-06", "AI-S-06"],
  },
  {
    id: "SC-08", title: "Investor off-plan dashboard",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Should", phase: 2, blockedBy: [],
    story: "As an Investor, I track my projects' sales, occupancy and returns.",
    ac: [
      "Off-plan projects with sales pipeline, occupancy and returns; investors see only their projects.",
      "AI projections (AI-S-04) always labelled as estimates with assumptions shown.",
    ],
    relates: ["AI-S-04", "SC-11", "SC-01", "FM-07"],
  },
  {
    id: "SC-09", title: "Notifications engine",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", newInV2: true, phase: 1, blockedBy: ["Q6"],
    story: "As a user, I get the right alerts on the right channel — and can control them.",
    ac: [
      "Unified service for push/SMS/email/in-app used by all modules (single event bus).",
      "Per-user channel preferences and quiet hours; per-tenant templates; delivery logging.",
      "§10: every state transition in every workflow is notified via SC-09.",
    ],
    relates: ["SC-03", "SC-05", "FM-03", "FM-05", "EM-01", "EM-04", "EM-06", "EM-09"],
  },
  {
    id: "SC-10", title: "Audit logging",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Must", newInV2: true, phase: 1, blockedBy: ["Q7"],
    story: "As a compliance owner, I can reconstruct who did what, when.",
    ac: [
      "Immutable log of auth events, permission changes, financial actions, security events and AI overrides — actor, tenant, timestamp.",
      "12-month retention (proposed); queryable from the admin console.",
    ],
    relates: ["SC-06", "SC-01", "EM-06", "FM-01", "AI-S-06"],
  },
  {
    id: "SC-11", title: "Landing page",
    module: "SC", moduleLabel: "Shared core platform",
    priority: "Should", phase: 2, blockedBy: ["Q1"],
    story: "As a prospect or investor, I learn about the platform and register interest.",
    ac: ["Public marketing page with lead capture into the investor pipeline (proposed)."],
    relates: ["SC-08", "AI-S-04"],
  },
];

export const AI_REQUIREMENT_IDS = [
  "AI-F-01","AI-F-02","AI-F-03","AI-F-04","AI-F-05",
  "AI-E-01","AI-E-02","AI-E-03","AI-E-04","AI-E-05","AI-E-06",
  "AI-S-01","AI-S-02","AI-S-03","AI-S-04","AI-S-05","AI-S-06",
] as const;

/** Sanity: FM 8 + EM 9 + SC 11 = 28 non-AI, + 17 AI = 45 total. */
export const TOTAL_REQUIREMENT_COUNT = REQUIREMENTS.length + AI_REQUIREMENT_IDS.length; // 45

```

### ai-requirements.ts (`typescript`)

```typescript
// PRD v2.0 §11 — AI requirements with the mandated four columns:
// inputs->outputs, human-in-the-loop, fallback, proposed benchmark.
// Suggested location: src/domain/ai-requirements.ts

import type { Priority, Phase, OpenQuestionId } from "./requirements";

export interface AiRequirement {
  id: string;
  title: string;
  family: "Facility Management AI" | "Estate Management AI" | "Shared platform AI";
  priority: Priority;
  optional?: true;
  phase: Phase;
  /** "what goes in, what comes out" */
  inputsToOutputs: string;
  /** "where the human sits" */
  humanInTheLoop: string;
  /** "what happens when the AI is unavailable" */
  fallback: string;
  /** Proposed acceptance baseline (TBC unless noted). */
  benchmark: string;
  benchmarkIsHardRequirement?: true;
  blockedBy: OpenQuestionId[];
  relates: string[];
}

export const AI_REQUIREMENTS: AiRequirement[] = [
  {
    id: "AI-F-01", title: "Predictive maintenance", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Asset attributes, WO/failure history, sensor feeds where available -> ranked failure-risk list + suggested PPM dates as DRAFT schedule entries.",
    humanInTheLoop: "FM approves before any schedule changes. Runs in shadow mode until data volume is sufficient (§15.2).",
    fallback: "Standard PPM calendar unaffected (FM-02 operates untouched).",
    benchmark: "After 3-6 months of data: precision >= 70% on 30-day failure window.",
    relates: ["FM-01", "FM-02", "FM-03", "AI-S-06"],
  },
  {
    id: "AI-F-02", title: "Smart work-order triage", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Request text / photos / category -> suggested category, priority and best-fit assignee/vendor, each with confidence.",
    humanInTheLoop: "Dispatcher confirms or overrides; overrides logged for tuning (and for SC-10 'AI overrides').",
    fallback: "Manual triage queue.",
    benchmark: "Top-1 category accuracy >= 85%; assignee suggestion acceptance >= 70%.",
    relates: ["FM-03", "EM-03", "AI-E-02", "SC-10", "AI-S-06"],
  },
  {
    id: "AI-F-03", title: "Vision-based inspections", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Inspection photos -> detected defects with severity + auto-drafted report.",
    humanInTheLoop: "Inspector edits and approves EVERY report.",
    fallback: "Manual checklist flow (FM-06).",
    benchmark: "Defect recall >= 80% on agreed defect classes (pilot set).",
    relates: ["FM-06", "FM-03", "AI-S-06"],
  },
  {
    id: "AI-F-04", title: "Analytics & anomaly alerts", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Cost / energy / usage series -> plain-language anomaly cards with drill-down.",
    humanInTheLoop: "Confirm/dismiss feedback loop tunes sensitivity.",
    fallback: "Static threshold alerts.",
    benchmark: "False-positive rate <= 30% after tuning period.",
    relates: ["FM-07", "AI-S-02", "SC-09"],
  },
  {
    id: "AI-F-05", title: "Facility-manager copilot", family: "Facility Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Natural-language queries over tenant-scoped data -> answers with sources; drafted actions (e.g. raise WO).",
    humanInTheLoop: "Every drafted action requires explicit user confirmation.",
    fallback: "Normal navigation and search.",
    benchmark: "Grounded-answer accuracy >= 90% on eval set.",
    relates: ["AI-S-01", "AI-S-06", "SC-01", "FM-03"],
  },
  {
    id: "AI-E-01", title: "Resident support chatbot", family: "Estate Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Resident question + estate RAG corpus -> grounded answer with source, or escalation.",
    humanInTheLoop: "No source -> MUST refuse and escalate to a ticket (EM-03). Corpus curated by the Estate Manager.",
    fallback: "FAQ + ticket.",
    benchmark: "Routine-query deflection >= 60%; grounded-answer accuracy >= 90%.",
    relates: ["EM-08", "EM-03", "AI-S-03", "AI-S-06"],
  },
  {
    id: "AI-E-02", title: "Smart request triage", family: "Estate Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Photo-based classification and auto-routing of resident requests (SHARED SERVICE with AI-F-02).",
    humanInTheLoop: "Same HITL as AI-F-02 — confirm or override, overrides logged.",
    fallback: "Same as AI-F-02 — manual triage queue.",
    benchmark: "Shared benchmark with AI-F-02.",
    relates: ["AI-F-02", "EM-03", "FM-03", "AI-S-06"],
  },
  {
    id: "AI-E-03", title: "Billing & arrears intelligence", family: "Estate Management AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Billing/payment history -> anomaly flags, defaulter-risk scores, reminder-timing suggestions.",
    humanInTheLoop: "Managers approve reminder campaigns; NO AUTOMATED PENALTIES EVER.",
    fallback: "Fixed reminder schedule (-3d, due, +7d, +21d).",
    benchmark: "Risk model AUC >= 0.75 after two billing cycles.",
    relates: ["EM-01", "SC-09", "SC-02", "AI-S-06"],
  },
  {
    id: "AI-E-04", title: "Communication assistant", family: "Estate Management AI",
    priority: "Should", phase: 2, blockedBy: ["Q6"],
    inputsToOutputs: "Drafts announcements and translates into configured languages.",
    humanInTheLoop: "Manager approval required before ANY send (restated as an EM-04 acceptance criterion).",
    fallback: "Manual compose.",
    benchmark: "Human review pass rate >= 90%.",
    relates: ["EM-04", "SC-09", "SC-03", "AI-S-06"],
  },
  {
    id: "AI-E-05", title: "Marketplace intelligence", family: "Estate Management AI",
    priority: "Could", phase: 3, blockedBy: ["Q3"],
    inputsToOutputs: "Listing auto-generation, personalised recommendations, fraud flags.",
    humanInTheLoop: "Fraud flags go to a human review queue — NEVER auto-block.",
    fallback: "Manual listings, no recommendations.",
    benchmark: "Fraud-flag precision >= 60% at review (pilot).",
    relates: ["EM-09", "SC-04", "AI-S-05", "SC-06"],
  },
  {
    id: "AI-E-06", title: "AI security & access", family: "Estate Management AI",
    priority: "Could", optional: true, phase: 3, blockedBy: ["Q5", "Q7"],
    inputsToOutputs: "CCTV anomaly detection and face/plate recognition.",
    humanInTheLoop: "Prerequisites: NDPA compliance, explicit consent and DPIA sign-off (Q5). Builds ONLY after sign-off; integrates with client hardware (hardware out of scope, §6.3).",
    fallback: "Not stated — the feature simply does not build if Q5 is not signed off.",
    benchmark: "Defined during DPIA; NOT in default acceptance.",
    relates: ["EM-06", "SC-10", "AI-S-06"],
  },
  {
    id: "AI-S-01", title: "Platform-wide copilot", family: "Shared platform AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "One conversational assistant across both modules and admin (EXTENDS AI-F-05).",
    humanInTheLoop: "Action confirmation as AI-F-05.",
    fallback: "Standard UI.",
    benchmark: "Shared benchmark with AI-F-05.",
    relates: ["AI-F-05", "SC-06", "SC-01", "AI-S-06"],
  },
  {
    id: "AI-S-02", title: "NL search & reporting", family: "Shared platform AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Questions across data -> answers and reports in plain language with the underlying records viewable.",
    humanInTheLoop: "Every figure traceable to source records.",
    fallback: "Standard reports (FM-07).",
    benchmark: "Query success rate >= 80% on agreed test set.",
    relates: ["FM-07", "AI-F-04", "SC-07", "AI-S-06"],
  },
  {
    id: "AI-S-03", title: "Document intelligence", family: "Shared platform AI",
    priority: "Should", phase: 2, blockedBy: ["Q2", "Q7"],
    inputsToOutputs: "OCR + field extraction + semantic search across document management.",
    humanInTheLoop: "Extracted fields editable before save.",
    fallback: "Manual entry and keyword search.",
    benchmark: "Field extraction >= 95% printed / >= 85% scanned documents.",
    relates: ["EM-08", "FM-01", "FM-05", "AI-S-06"],
  },
  {
    id: "AI-S-04", title: "Investor-dashboard AI", family: "Shared platform AI",
    priority: "Should", phase: 2, blockedBy: [],
    inputsToOutputs: "Sales/occupancy forecasting, lead scoring, ROI projections.",
    humanInTheLoop: "All outputs labelled as ESTIMATES with assumptions shown; not presented as financial advice.",
    fallback: "Implicit per §11.4 — SC-08 renders pipeline/occupancy/returns without projections; core never blocks on AI.",
    benchmark: "Forecast error (MAPE) reviewed quarterly vs actuals.",
    relates: ["SC-08", "SC-11", "AI-S-06"],
  },
  {
    id: "AI-S-05", title: "Recommendation & fraud engine", family: "Shared platform AI",
    priority: "Could", phase: 3, blockedBy: ["Q3"],
    inputsToOutputs: "Shared personalisation and anomaly service behind AI-E-05 AND bookings (EM-05).",
    humanInTheLoop: "As AI-E-05 — human review queue, never auto-block.",
    fallback: "As AI-E-05 — manual listings, no recommendations.",
    benchmark: "As AI-E-05 — fraud-flag precision >= 60% at review (pilot).",
    relates: ["AI-E-05", "EM-09", "EM-05", "SC-04"],
  },
  {
    id: "AI-S-06", title: "AI architecture & guardrails", family: "Shared platform AI",
    priority: "Must", phase: 1, blockedBy: ["Q2", "Q7", "Q12"],
    inputsToOutputs: "LLM + RAG vector store, prompt/cost controls, logging — the platform every AI feature runs on.",
    humanInTheLoop: "See §11.4 — release-blocking requirements (AI_GUARDRAILS below).",
    fallback: "N/A — AI-S-06 IS the degradation machinery for every other AI feature.",
    benchmark: "Zero cross-tenant retrieval in isolation tests.",
    benchmarkIsHardRequirement: true,
    relates: ["SC-06", "SC-07", "SC-10", "SC-01"],
  },
];

/** §11.4 — AI guardrails & design requirements. ALL RELEASE-BLOCKING. Owned by AI-S-06. */
export const AI_GUARDRAILS = [
  {
    key: "tenantIsolation",
    rule: "Retrieval, embeddings and context are hard-scoped to the tenant; automated cross-tenant leakage tests run in CI.",
  },
  {
    key: "providerAbstraction",
    rule: "LLM/OCR/translation behind an abstraction with health checks; on provider failure features degrade to their listed fallback — core flows never block on AI.",
  },
  {
    key: "costControls",
    rule: "Per-tenant AND per-feature usage caps with alerts and a kill-switch per feature (usage billed to Client per §15). Thresholds pending Q12.",
  },
  {
    key: "promptInjectionDefence",
    rule: "User- and document-supplied content is treated as DATA; the assistant cannot be instructed by it to exceed the user's permissions (§7).",
  },
  {
    key: "loggingAndPrivacy",
    rule: "All AI interactions logged (AI interaction log, §8.1) with PII minimised/redacted in logs.",
  },
  {
    key: "uxStates",
    rule: "Every AI surface shows loading, confidence, sources and error states; every suggestion is review/approve/override — AI is assistive, not autonomous.",
  },
] as const;

```

### workflow-state-machines.ts (`typescript`)

```typescript
// PRD v2.0 §10 — Key workflows & states.
// "The contract between backend, mobile and QA. Only the listed transitions are legal;
//  every transition is timestamped, actor-attributed and notified via SC-09.
//  SLA values are proposed defaults, configurable per tenant."
// Suggested location: src/domain/workflows.ts

export interface StateMachine {
  key: string;
  requirementId: string;
  states: readonly string[];
  branches: readonly string[];
  transitions: readonly (readonly [from: string, to: string])[];
  rules: readonly string[];
}

export const WORK_ORDER: StateMachine = {
  key: "workOrder",
  requirementId: "FM-03",
  states: ["New", "Triaged", "Assigned", "In Progress", "On Hold", "Resolved", "Verified", "Closed"],
  branches: ["Rejected", "Cancelled"],
  transitions: [
    ["New", "Triaged"], ["Triaged", "Assigned"], ["Assigned", "In Progress"],
    ["In Progress", "On Hold"], ["On Hold", "In Progress"], ["In Progress", "Resolved"],
    ["Resolved", "Verified"], ["Verified", "Closed"],
  ],
  rules: [
    "AI triage suggests category/priority/assignee; human confirms (AI-F-02 / AI-E-02).",
    "SLA timers per priority (proposed): Emergency respond 2h / resolve 24h; Routine 72h.",
    "Resolved -> Verified by requester or manager; auto-close after 5 days (proposed).",
    "Offline-capable per §12.1: queued writes, visible sync status, server-authoritative conflict resolution.",
  ],
};

export const SERVICE_CHARGE: StateMachine = {
  key: "serviceCharge",
  requirementId: "EM-01",
  states: ["Draft", "Issued", "Partially paid", "Paid", "Overdue", "In arrears", "Escalated"],
  branches: [],
  transitions: [
    ["Draft", "Issued"], ["Issued", "Partially paid"], ["Partially paid", "Paid"], ["Issued", "Paid"],
    ["Issued", "Overdue"], ["Overdue", "In arrears"], ["In arrears", "Escalated"],
  ],
  rules: [
    "Reminder schedule (proposed): -3d, due, +7d, +21d via SC-09.",
    "AI timing suggestions (AI-E-03) require manager approval; no automated penalties.",
    "Escalation policy per tenant.",
  ],
};

export const BOOKING: StateMachine = {
  key: "booking",
  requirementId: "EM-05",
  states: ["Requested", "Approved", "Auto-approved", "Confirmed", "Completed"],
  branches: ["Declined", "Cancelled"],
  transitions: [
    ["Requested", "Approved"], ["Requested", "Auto-approved"],
    ["Approved", "Confirmed"], ["Auto-approved", "Confirmed"], ["Confirmed", "Completed"],
  ],
  rules: [
    "Auto-approval per amenity rules (per-tenant config, §8.2).",
    "Payment (if fees) required to confirm — via SC-02 / SC-04.",
    "Cancellation window per policy.",
  ],
};

export const SOS_EVENT: StateMachine = {
  key: "sosEvent",
  requirementId: "EM-06",
  states: ["Raised", "Acknowledged", "Responding", "Resolved", "Reviewed"],
  branches: [],
  transitions: [
    ["Raised", "Acknowledged"], ["Acknowledged", "Responding"],
    ["Responding", "Resolved"], ["Resolved", "Reviewed"],
  ],
  rules: [
    "Acknowledge target < 60s during manned hours (proposed) — manned hours pending Q4.",
    "Unacknowledged alerts escalate to backup responders (chain pending Q4).",
    "Full timeline retained for review; all security events audit-logged (SC-10).",
    "Works on poor connectivity with SMS fallback (proposed).",
  ],
};

export const MARKETPLACE_ORDER: StateMachine = {
  key: "marketplaceOrder",
  requirementId: "EM-09",
  states: ["Placed", "Accepted", "Fulfilled", "Closed"],
  branches: ["Declined", "Refunded"],
  transitions: [
    ["Placed", "Accepted"], ["Accepted", "Fulfilled"], ["Fulfilled", "Closed"],
  ],
  rules: [
    "Vendor must accept within SLA or the order auto-expires.",
    "Refunds via gateway (SC-02).",
    "Payout model pending Q3 — payouts are BLOCKED until answered.",
  ],
};

export const STATE_MACHINES = [
  WORK_ORDER, SERVICE_CHARGE, BOOKING, SOS_EVENT, MARKETPLACE_ORDER,
] as const;

```

### permissions-matrix.ts (`typescript`)

```typescript
// PRD v2.0 §7 — Roles & permissions matrix.
// "Server-side, deny-by-default enforcement on every API (SC-01)."
// "Fine-grained permissions per endpoint are finalised at design; this matrix is the authoritative baseline."
// Suggested location: src/domain/permissions.ts

export type Access = "F" | "M" | "V" | "O" | "-";
// F = full control · M = manage (create/edit within own tenant/estate)
// V = view · O = own records only · - = no access

export const ROLES = [
  "Plat", // Platform Admin (7 Fifteen Capital HQ)
  "Exec", // Owner / Executive
  "EstM", // Estate Manager
  "FacM", // Facility Manager
  "Tech", // Technician
  "Res",  // Resident
  "Sec",  // Security
  "Ven",  // Vendor
  "Inv",  // Investor
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  Plat: "Platform Admin",
  Exec: "Owner / Executive",
  EstM: "Estate Manager",
  FacM: "Facility Manager",
  Tech: "Technician",
  Res: "Resident",
  Sec: "Security",
  Ven: "Vendor",
  Inv: "Investor",
};

export interface CapabilityRow {
  capability: string;
  /** Requirements this capability row governs. */
  requirementIds: string[];
  access: Record<Role, Access>;
}

const row = (
  capability: string,
  requirementIds: string[],
  [Plat, Exec, EstM, FacM, Tech, Res, Sec, Ven, Inv]: Access[],
): CapabilityRow => ({
  capability, requirementIds,
  access: { Plat, Exec, EstM, FacM, Tech, Res, Sec, Ven, Inv },
});

export const PERMISSIONS_MATRIX: CapabilityRow[] = [
  row("Tenant onboarding & config", ["SC-07", "SC-06"], ["F","-","V","-","-","-","-","-","-"]),
  row("Users & roles",              ["SC-01"],          ["F","V","M","M","-","O","-","O","O"]),
  row("Assets & PPM plans",         ["FM-01","FM-02"],  ["V","V","V","M","V","-","-","-","-"]),
  row("Work orders",                ["FM-03","EM-03"],  ["V","V","M","M","O","O","-","O","-"]),
  row("Inspections & compliance",   ["FM-06"],          ["V","V","V","M","O","-","-","-","-"]),
  row("Charges & invoicing",        ["EM-01"],          ["V","V","M","-","-","O","-","-","-"]),
  row("Payments (pay in-app)",      ["SC-02"],          ["-","-","-","-","-","O","-","-","-"]),
  row("Announcements",              ["EM-04"],          ["V","V","M","M","-","V","V","-","-"]),
  row("Bookings & amenities",       ["EM-05"],          ["V","V","M","-","-","O","V","-","-"]),
  row("Security & SOS",             ["EM-06","EM-02"],  ["V","V","M","-","-","O","M","-","-"]),
  row("Marketplace",                ["EM-09","SC-04"],  ["V","V","M","-","-","O","-","O","-"]),
  row("Investor projects",          ["SC-08"],          ["F","V","-","-","-","-","-","-","O"]),
  row("Reports & analytics",        ["FM-07","AI-S-02"],["F","V","M","M","-","-","-","-","V"]),
];

/** Known gaps in the matrix — resolve at design, do not assume. */
export const MATRIX_GAPS = [
  "FM-05 requires vendors to submit invoices via the vendor portal, but Vendor is '-' on 'Charges & invoicing'.",
  "§5 lists 'Worker / Security' as one persona; §7 has only a 'Sec' column — no separate Worker role.",
  "Platform Admin is 'V' on operational rows, yet §8.2 permits cross-tenant visibility only at Platform Admin — the cross-tenant read scope needs an explicit NDPA-compatible definition.",
  "Resident is 'O' on Work orders while EM-03 is the resident surface — whether residents see the WO entity or only a request projection is unspecified.",
] as const;

```

### phase-and-blockers.ts (`typescript`)

```typescript
// PRD v2.0 §16 delivery plan + §17 open-questions register.
// Suggested location: src/domain/delivery.ts

import type { OpenQuestionId, Phase } from "./requirements";

export const PHASE_MAP: Record<Phase, { label: string; weeks: string; focus: string; requirementIds: string[] }> = {
  1: {
    label: "Foundations & MVP",
    weeks: "1-12 (indicative)",
    focus: "Discovery, brand, UX/UI; shared core; Must-priority features; AI guardrails scaffolding.",
    requirementIds: [
      "SC-01","SC-02","SC-03","SC-05","SC-06","SC-07","SC-09","SC-10",
      "FM-01","FM-02","FM-03","FM-05","FM-07","FM-08",
      "EM-01","EM-02","EM-03","EM-04","EM-06",
      "AI-S-06",
    ], // 20
  },
  2: {
    label: "Committed scope",
    weeks: "10-20 (indicative)",
    focus: "Should-priority features behind flags; AI feature set on the guardrails platform.",
    requirementIds: [
      "FM-04","FM-06",
      "EM-05","EM-07","EM-08","EM-09",
      "SC-04","SC-08","SC-11",
      "AI-F-01","AI-F-02","AI-F-03","AI-F-04","AI-F-05",
      "AI-E-01","AI-E-02","AI-E-03","AI-E-04",
      "AI-S-01","AI-S-02","AI-S-03","AI-S-04",
    ], // 22
  },
  3: {
    label: "Complete & harden",
    weeks: "18-26 (indicative)",
    focus: "Could items; performance/security hardening; UAT; deployment, go-live, integration & handover.",
    requirementIds: [
      "AI-E-05",
      "AI-E-06", // conditional: "if Q5 signed off"
      "AI-S-05",
      // plus: NFR verification, docs & runbooks (no requirement IDs)
    ], // 3
  },
};

export interface OpenQuestion {
  id: OpenQuestionId;
  question: string;
  whyItMatters: string;
  owner: "Client" | "Unrealabs" | "Client + Unrealabs";
  neededBy: string;
  /** Requirements whose build cannot correctly complete until this is answered. */
  blocks: string[];
  /** Requirements whose shape/config changes with the answer. */
  shapes: string[];
}

export const OPEN_QUESTIONS: OpenQuestion[] = [
  { id: "Q1", question: "Who exactly is a 'tenant' — estates operated by 7 Fifteen Capital, or third-party operators too?",
    whyItMatters: "Shapes onboarding, branding and commercial model.", owner: "Client", neededBy: "Kickoff",
    blocks: ["SC-07"], shapes: ["SC-01","SC-06","SC-11"] },
  { id: "Q2", question: "Confirm data-isolation strategy (ADR-01: shared DB + row-level security vs schema-per-tenant).",
    whyItMatters: "Foundational architecture; expensive to change later.", owner: "Unrealabs", neededBy: "Kickoff",
    blocks: ["SC-07","AI-S-06"], shapes: ["SC-01","AI-S-03","EM-08"] },
  { id: "Q3", question: "Marketplace commercial model: commission %, escrow, vendor payout rails and KYC.",
    whyItMatters: "Payouts have regulatory and gateway implications; blocks EM-09 payout build.", owner: "Client", neededBy: "Phase 2 start",
    blocks: ["EM-09","SC-04"], shapes: ["SC-02","AI-E-05","AI-S-05"] },
  { id: "Q4", question: "SOS operating model: who responds, escalation chain, liability and manned hours.",
    whyItMatters: "Safety-critical flow; drives EM-06 SLAs and staffing.", owner: "Client", neededBy: "Phase 1",
    blocks: ["EM-06"], shapes: ["SC-09"] },
  { id: "Q5", question: "Proceed with AI security & access (AI-E-06)? Requires consent framework + DPIA.",
    whyItMatters: "NDPA-contingent; long lead time.", owner: "Client + Unrealabs", neededBy: "Phase 2",
    blocks: ["AI-E-06"], shapes: ["EM-06","SC-10"] },
  { id: "Q6", question: "Language list for localization at launch.",
    whyItMatters: "Sizes translation and QA effort.", owner: "Client", neededBy: "Design phase",
    blocks: ["AI-E-04"], shapes: ["SC-05","SC-06","SC-09","EM-04","SC-07"] },
  { id: "Q7", question: "Hosting provider and data-residency requirement (Nigeria vs regional cloud).",
    whyItMatters: "NDPA posture, latency and cost.", owner: "Client", neededBy: "Kickoff",
    blocks: ["SC-07"], shapes: ["AI-S-06","SC-10","EM-02","EM-08","AI-E-06","AI-S-03"] },
  { id: "Q8", question: "Launch sizing: tenants, units, users, expected concurrency.",
    whyItMatters: "Validates §12 scalability targets and load tests.", owner: "Client", neededBy: "Design phase",
    blocks: [], shapes: ["SC-07"] },
  { id: "Q9", question: "Any legacy data to migrate (spreadsheets, resident lists, asset registers)?",
    whyItMatters: "Migration is unscoped; may need a Change Request.", owner: "Client", neededBy: "Kickoff",
    blocks: [], shapes: ["FM-01","EM-02","SC-07","FM-04"] },
  { id: "Q10", question: "Payment reconciliation source of truth (gateway settlement vs bank statements).",
    whyItMatters: "Defines EM-01 reconciliation rules.", owner: "Client", neededBy: "Phase 1",
    blocks: ["EM-01"], shapes: ["SC-02"] },
  { id: "Q11", question: "iOS distribution: v1.0 lists TestFlight/IPA — is a production App Store release in scope?",
    whyItMatters: "Affects review lead times and release plan.", owner: "Client + Unrealabs", neededBy: "Phase 1",
    blocks: ["SC-05"], shapes: ["FM-08"] },
  { id: "Q12", question: "Per-tenant AI/SMS budget caps and alert thresholds.",
    whyItMatters: "Client pays usage; caps prevent surprises.", owner: "Client", neededBy: "Phase 2",
    blocks: [], shapes: ["AI-S-06","SC-03","SC-07"] },
];

/** Questions whose deadline lands no earlier than the phase of the work they gate. */
export const TIMING_HAZARDS = [
  "Q4 due Phase 1 but EM-06 is a Phase 1 Must (SLA/escalation undefined at build start).",
  "Q10 due Phase 1 but EM-01 is a Phase 1 Must (reconciliation rules undefined at build start).",
  "Q3 due Phase 2 START while EM-09 and SC-04 build during Phase 2.",
  "Q12 due Phase 2 while AI-S-06 (which implements the caps) builds in Phase 1.",
  "Q5 due Phase 2 but AI-E-06 is scheduled in Phase 3 with no defined descope path if declined.",
] as const;

```

## Open issues
- CITATION DEFECT: FM-01's third acceptance criterion reads "all changes audit-logged (SC-11)" but SC-11 is the Landing page; audit logging is SC-10. Almost certainly an off-by-one introduced when SC-09/SC-10 were added as new v2.0 requirements. Confirm with the client rather than silently correcting — the PRD states items are confirmed at discovery.
- NO 'COULD' ITEMS OUTSIDE AI: the MoSCoW split is 22 Must / 20 Should / 3 Could, and all three Coulds are AI (AI-E-05, AI-E-06, AI-S-05). §6.2 declares Could items "first to reflow if the timeline is squeezed", so the only descope lever the PRD provides removes AI scope — which is priced at USD 150,000 of the USD 300,000 total. No FM/EM/SC feature can be reflowed without a Change Request.
- AI-F-02 vs AI-E-02 DOUBLE-COUNTING: AI-E-02 is explicitly "a shared service with AI-F-02" with the same HITL, same fallback and a shared benchmark. They are one build with two surfaces, yet both occupy separate Phase 2 slots. Same pattern for AI-S-01 ("extends AI-F-05", shared benchmark) and AI-S-05 ("As AI-E-05" for HITL, fallback and benchmark). Effort estimation and the delivery plan must not treat these six IDs as six independent builds.
- OFFLINE LAYER HAS NO OWNING REQUIREMENT: §12.1 (read caching, queued writes with visible sync status, server-authoritative conflict resolution with overwritten edits surfaced and audit-logged) is cited as an acceptance criterion by FM-03 and required by FM-06, FM-08 and EM-06, but SC-05 carries no offline AC and no shared-core requirement owns the sync/conflict engine.
- BENCHMARKS UNMEASURABLE INSIDE THE BUILD WINDOW: AI-F-01 requires "3-6 months of data", AI-E-03 requires "two billing cycles", AI-S-04 is "reviewed quarterly vs actuals". All three are Phase 2 (weeks 10-20) in a 24-26 week engagement ending December 2026 with a 30-day warranty. The acceptance mechanism for these three features is undefined at handover.
- EM-01 AND EM-06 ARE PHASE 1 MUSTS WITH PHASE 1 BLOCKERS: Q10 (reconciliation source of truth, "Defines EM-01 reconciliation rules") and Q4 (SOS operating model, "drives EM-06 SLAs and staffing") are both due "Phase 1" — the same phase the features are built in. Q3 is due "Phase 2 start" while EM-09/SC-04 build in Phase 2. Q12 is due Phase 2 while AI-S-06 (which implements the caps) builds in Phase 1.
- §13.2 SAYS THE PAYMENTS DECISION "blocks EM-01" BUT NOT SC-02: SC-02 is the gateway abstraction and is the requirement that actually integrates the provider. Either the annotation is incomplete or SC-02's abstraction is expected to be provider-agnostic enough to build before selection — a material architectural assumption that is nowhere stated.
- MFA FIRMNESS CONTRADICTION: SC-01 lists "MFA for admin roles (proposed)" while §12 Security states "MFA for admin roles" as a measurable target alongside OWASP ASVS L2 and AES-256. One marks it negotiable, the other treats it as a security baseline.
- SC-09 QUIET HOURS vs EM-06 SOS ESCALATION: SC-09 requires per-user quiet hours; EM-06 requires SOS escalation to backup responders on non-acknowledgement within 60s. No emergency-override rule is defined for quiet hours, and this is a safety-critical interaction.
- TEMPLATE OWNERSHIP SPLIT BETWEEN SC-03 AND SC-09: SC-03 requires "template management" for SMS/email; SC-09 requires "per-tenant templates". Both are Must and Phase 1. The boundary between transport-level and notification-level templating is undefined.
- AI-E-06 HAS NO DESCOPE OR CREDIT PATH: it is Could/optional, gated on Q5 ("Builds only after sign-off"), conditioned in §16 as "if Q5 signed off", and its benchmark is "not in default acceptance". But AI capabilities are priced as a single USD 150,000 bundle in §18 with no stated substitution or credit if the client declines.
- MIGRATION HAS NO REQUIREMENT ID: Q9 states "Migration is unscoped; may need a Change Request", while FM-01 contracts "bulk import via CSV template" and SC-07 contracts "configures estates/units (bulk import)". The boundary between contracted bulk import and unscoped migration is undefined and is a likely commercial dispute point.
- AI-F-04 ENERGY DATA HAS NO SOURCE REQUIREMENT: AI-F-04 takes "cost/energy/usage series" as input, but no FM/EM/SC requirement defines energy or utility data capture, and §6.3 puts IoT hardware procurement out of scope. The provenance of the energy series is unspecified. The same applies to AI-F-01's "sensor feeds where available".
- INVESTOR ROLE HAS NO PHASE 1 SURFACE: Investor is one of the 9 roles in the §7 MVP permissions matrix (O on Investor projects, V on Reports), but its only functionality, SC-08, is Should/Phase 2. Phase 1 ships an authenticated role with no product.
- 'APPROVED VENDOR' STATE IS UNDEFINED: EM-07 and EM-09 both say "approved vendors", but FM-05's acceptance criteria define only profiles, documents with expiry alerts, assignments and performance metrics — no approval status or approval workflow.
- AI-E-01 CORPUS CURATION HAS NO REQUIREMENT ID: "Corpus curated by the Estate Manager" implies an inclusion/exclusion and grounding-scope UI beyond EM-08's folder and permission controls, but no requirement defines it.
- AI-S-02 IS THE CO-GUARANTOR OF KPI REPORTABILITY BUT IS SHOULD/PHASE 2: §14 states every KPI "must be reportable from the product itself (FM-07 / AI-S-02)". If AI-S-02 reflows, the entire KPI traceability obligation falls on FM-07's fixed dashboards, whose acceptance criteria name only four metrics (open/overdue WOs, PPM compliance %, downtime, cost by category/estate) against six KPI categories.
- PHASE WEEKS OVERLAP: Phase 1 is weeks 1-12, Phase 2 is weeks 10-20, Phase 3 is weeks 18-26. A requirement's phase therefore does not pin a delivery week, and Phase 3 carries Could-item AI builds concurrently with UAT, hardening, deployment, go-live and handover.
- 'WORKER' PERSONA MISSING FROM THE MATRIX: §5 lists "Worker / Security" as an Estate persona needing access control, SOS response, patrols and directory, but §7 provides only a Sec column. Whether Worker is a distinct role or a synonym for Security needs confirming before RBAC is built.
- VENDOR INVOICING HAS NO MATRIX ROW: FM-05 requires vendors to "submit updates & invoices via the vendor portal", yet §7 gives Vendor "-" on Charges & invoicing and "-" on Payments. The vendor-invoice capability has no authoritative permission definition.
- PLATFORM ADMIN CROSS-TENANT READ SCOPE vs NDPA: §8.2 permits cross-tenant access only "below Platform Admin", implying Platform Admin can read across tenants, while §12 requires NDPA consent records, a processing register and per-entity retention. The lawful basis and audit treatment of Platform Admin cross-tenant reads is undefined.
- SC-11's SOLE ACCEPTANCE CRITERION IS ITSELF '(proposed)': "lead capture into the investor pipeline (proposed)" — per §1, (proposed) items "do not silently become contract terms", so SC-11 currently has no confirmed definition of done despite being named as a driver of the Commercial KPI category.
