# Architecture & Non-Functional Requirements

## Summary
The PRD fixes a Platform → Tenant → Estate/Facility → Building → Unit → Resident/Asset hierarchy (§8.2) with hard isolation across queries, files, search indexes, AI retrieval and reports below Platform Admin, verified by release-blocking cross-tenant tests in CI (SC-07, AI-S-06). The proposed isolation strategy — shared DB with row-level security, tenant-scoped object storage, per-tenant vector namespaces — is unconfirmed (ADR-01 / Q2, owner Unrealabs, due kickoff); I recommend confirming it as proposed at the 20-tenant/50k-user design target, with FORCE RLS, a session-GUC tenant scope, a separate BYPASSRLS platform role, and a documented promote-a-tenant-to-dedicated-DB escape hatch. §12 quantifies eight NFR areas (API P95 <500 ms, 99.5% monthly availability, RPO ≤24 h / RTO ≤4 h, OWASP ASVS L2, TLS 1.2+ / AES-256, 20 tenants / 10,000 units / 50,000 users / 1,000 concurrent, WCAG 2.1 AA, ≥70% unit coverage on core domains) and §12.1 defines read caching, queued writes and server-authoritative conflict resolution. §11.4 makes six AI guardrails release-blocking — tenant-scoped retrieval, provider abstraction with health checks and per-feature fallbacks, per-tenant/per-feature caps with kill-switches, prompt-injection-as-data, PII-redacted AI interaction logs, and mandatory loading/confidence/sources/error UX states. Architecturally the Next.js app must be a presentation + BFF tier only — because SC-01 demands server-side deny-by-default on every API that mobile (SC-05) also consumes, the authoritative API, state machines (§10), scheduler, webhooks, notification event bus (SC-09), audit log (SC-10) and AI gateway (AI-S-06) belong in a separate backend; the web data layer should be built now as tenant-context-first ports with seed and HTTP adapters behind one provider switch.

### Tenancy model and the full isolation surface (§8.2)
*Requirements: SC-07, SC-01, AI-S-06, Q2, Q1*

Hierarchy is fixed: Platform → Tenant (organisation) → Estates/Facilities → Buildings → Units → Residents/Assets, and 'every domain record carries its tenant scope'. Hard isolation is stated as an absolute: 'no query, file, search index, AI retrieval or report may cross tenants below Platform Admin'. That is five distinct enforcement surfaces, not one — (1) relational queries, (2) object/file storage, (3) the search index, (4) AI/RAG retrieval, (5) generated reports and exports. Any design that only scopes the database satisfies one fifth of the requirement.

Proposed isolation strategy (explicitly marked proposed, pending ADR-01 / Q2): shared database with tenant-scoped rows enforced at BOTH application and database layer (e.g. row-level security), tenant-scoped object storage, and per-tenant vector-store namespaces.

Tenant onboarding is a Platform Admin flow with no code changes (SC-07 user story): create the organisation, then configure estates/units (bulk import), branding, payment settlement account, languages and enabled features. Per-tenant configuration surface: branding, notification templates, amenity rules, charge structures, AI feature flags and usage caps. Cost metering: AI, SMS and email usage metered per tenant (§15 assumption: usage costs billed to the Client).

Note the deliberate cross-tenant path: Platform Admin sits ABOVE the isolation boundary and §7 grants Plat 'F' on tenant onboarding, investor projects and reports & analytics, and 'V' on work orders, charges, inspections, announcements, bookings, security and marketplace. So the cross-tenant test suite must assert two things, not one: deny for all non-platform principals, and allow-plus-audit for Platform Admin.

### ADR-01 recommendation: confirm shared DB + row-level security (reject schema-per-tenant)
*Requirements: Q2, Q1, SC-07, AI-S-06*

RECOMMENDATION: confirm the PRD's proposed baseline — shared database, tenant_id on every domain table, PostgreSQL row-level security, tenant-prefixed object storage, per-tenant vector namespaces.

Reasoning against schema-per-tenant at this scale and timeline:
1. Scale is small. The §12 design target is 20 tenants / 10,000 units / 50,000 users / 1,000 concurrent. Schema-per-tenant only starts paying for itself at hundreds of tenants or where a tenant contractually demands physical separation. At 20 tenants it is pure overhead.
2. Migration fan-out. Every schema change must be applied N times with per-tenant failure states. Phase 1 (weeks 1–12) already carries SC-01/02/03/05/06/07/09/10 plus six FM and five EM Musts plus AI-S-06; adding tenant-provisioning-as-DDL and migration orchestration into the tightest phase is schedule risk for no isolation gain.
3. Platform Admin needs genuine cross-tenant reads (§7: F on reports & analytics, F on investor projects, V across operational capabilities), and §8.2 requires cross-tenant usage metering for AI/SMS/email. Both are trivial aggregate queries on a shared DB and require cross-schema UNION machinery otherwise.
4. Isolation quality is not actually better. Schema-per-tenant isolates only if connection routing / search_path is correct; a mis-set search_path leaks exactly as badly as a missing WHERE clause, and is harder to unit-test. RLS gives defence in depth: the PRD demands enforcement at application AND database layer, and RLS is the only option that keeps a single migration path while satisfying the database layer.
5. Per-tenant vector namespaces are the right call under either strategy (managed vector stores expose namespaces, not per-tenant instances), so schema-per-tenant does not simplify surface (4) of the isolation requirement.

Conditions to attach to ADR-01 when it is signed:
- tenant_id NOT NULL on every domain table; every index and primary key leads with tenant_id.
- ALTER TABLE ... FORCE ROW LEVEL SECURITY on every table (so the owning role is not exempt).
- Policies read a session GUC (e.g. current_setting('app.tenant_id')) set via SET LOCAL inside a transaction wrapper owned by the data-access layer. Application code must never hand-append WHERE tenant_id — that is the bug class RLS exists to catch.
- Two DB roles: app_user (RLS enforced, used by every request path and background job) and app_platform (BYPASSRLS, used only by explicitly enumerated Platform Admin operations, every use written to the SC-10 audit log with actor + tenant + timestamp).
- Object storage keyed tenants/{tenantId}/… with pre-signed URLs scoped to that prefix; no shared prefix, no guessable public paths.
- Search index and vector store partitioned by tenantId as a server-applied filter — the tenant key must never be sourced from a client-supplied parameter.
- Escape hatch preserved: because every tenant shares one schema, promoting a single tenant to a dedicated database instance later is a connection-routing change, not a rewrite. This keeps the schema-per-tenant option available at near-zero cost if Q1 resolves to 'third-party operators too' and one demands physical isolation.

### Cross-tenant access tests: what 'release-blocking' has to cover
*Requirements: SC-07, AI-S-06, FM-07, SC-02, EM-04, SC-10*

Three places in the PRD make these tests release-blocking: §8.2 ('Verified by automated cross-tenant access tests in CI (release-blocking)'), SC-07 AC ('cross-tenant access tests pass in CI (release-blocking)'), §12 Security ('cross-tenant tests release-blocking'), plus AI-S-06's hard benchmark 'Zero cross-tenant retrieval in isolation tests'.

The suite must be a matrix, not a smoke test. Minimum axes:
- Principal axis: one seeded principal per non-platform role from §7 (Exec, EstM, FacM, Tech, Res, Sec, Ven, Inv) in Tenant A, plus a Platform Admin.
- Resource axis: one record per §8.1 entity in Tenant B — Estate/Facility, Unit/Space, User, Asset, PPM plan, Work order, Inspection, Vendor, Charge/Invoice, Payment, Announcement, Booking, Visitor pass, SOS event, Document, Listing/Order, Investor project/Lead, AI interaction log.
- Surface axis, one case per isolation surface named in §8.2: (a) REST/RPC read and write, (b) direct object-storage URL and pre-signed URL replay, (c) search index query with an injected tenant filter, (d) AI retrieval — assert zero Tenant B chunks appear in the assembled context, (e) report generation and CSV/PDF export (FM-07 exports are a real leak vector).
- Assertion: 404 or 403 for every non-platform principal; allow + audit-log entry for Platform Admin.

Additional cases the PRD implies but does not spell out: payment webhook replay carrying Tenant B's reference against Tenant A's settlement account (SC-02 idempotency), announcement targeting that crosses estates within a tenant (EM-04 targeted sends), and vendor identity spanning tenants (see open issues).

Web-tier case specific to this codebase: assert no Next.js cache entry is reachable across tenant sessions (see the Next.js 16 finding).

### RBAC architecture: the §7 matrix, deny-by-default, and where enforcement lives
*Requirements: SC-01, SC-07*

§7 header is unambiguous: 'Server-side, deny-by-default enforcement on every API (SC-01)', and the matrix 'is the authoritative baseline' with fine-grained per-endpoint permissions finalised at design.

Legend: F = full control, M = manage (create/edit within own tenant/estate), V = view, O = own records only, — = no access. Columns: Plat, Exec, EstM, FacM, Tech, Res, Sec, Ven, Inv.

Full matrix, transcribed exactly (13 capabilities × 9 roles):
- Tenant onboarding & config: F, —, V, —, —, —, —, —, —
- Users & roles: F, V, M, M, —, O, —, O, O
- Assets & PPM plans: V, V, V, M, V, —, —, —, —
- Work orders: V, V, M, M, O, O, —, O, —
- Inspections & compliance: V, V, V, M, O, —, —, —, —
- Charges & invoicing: V, V, M, —, —, O, —, —, —
- Payments (pay in-app): —, —, —, —, —, O, —, —, —
- Announcements: V, V, M, M, —, V, V, —, —
- Bookings & amenities: V, V, M, —, —, O, V, —, —
- Security & SOS: V, V, M, —, —, O, M, —, —
- Marketplace: V, V, M, —, —, O, —, O, —
- Investor projects: F, V, —, —, —, —, —, —, O
- Reports & analytics: F, V, M, M, —, —, —, —, V

Architectural consequences:
- 'O' (own records only) is a row-level predicate, not a role check. It cannot be expressed as a static route guard; it requires an ownership resolver per entity (resident→unit, technician→assignee, vendor→vendor org, investor→project). Design this as a policy function, not scattered conditionals.
- Three scopes stack: tenant scope (§8.2) → estate scope (SC-01 'tenant- and estate-scoped') → ownership ('O'). All three must be applied server-side in that order.
- SC-01 also requires session and password policy, and MFA for admin roles (proposed) — §12 Security restates MFA for admin roles without the '(proposed)' qualifier, so treat it as in-scope.
- The web app may express the matrix in the UI to hide/disable affordances, but that is cosmetic. The Next.js tier must never be the enforcement point (see the architecture split finding).

### NFR — Performance (§12), exact targets
*Requirements: FM-03, FM-08, EM-01, EM-03, EM-06, FM-07, SC-02, SC-06*

Requirement: 'Fast load on mobile networks; smooth under concurrent load.'
Measurable target (proposed): API P95 < 500 ms; key screens interactive < 3 s on 4G and usable on 3G.

Reading: the 500 ms budget is on the API, so any Next.js server-render that fans out to N backend calls multiplies latency and will miss the 3 s interactive target even with a compliant API. This forces two design rules on the web app: (1) per-screen aggregate endpoints or a BFF composition layer rather than chatty client fetching, (2) Suspense-streamed shells so first paint does not wait on the slowest call. 'Usable on 3G' also pushes toward server-rendered HTML over large client bundles.

'Key screens' is not enumerated in the PRD. Derive the list from the Must-priority flows so it can be instrumented and tested: technician work-order list and detail (FM-03, FM-08), resident charges/pay (EM-01, SC-02), resident request raise (EM-03), manager dashboard (FM-07), security SOS console (EM-06).

### NFR — Reliability (§12), exact targets
*Requirements: AI-S-06, AI-F-01, AI-F-02, AI-F-03, AI-F-04, AI-F-05, AI-E-01, AI-E-03, AI-E-04, AI-S-02, AI-S-03*

Requirement: 'High availability; AI fails safely.'
Measurable target (proposed): 99.5% monthly availability for core flows; AI outage never blocks core; backups with RPO ≤ 24 h, RTO ≤ 4 h.

99.5% monthly = roughly 3 h 39 m of allowed downtime per month. 'Core flows' is undefined in the PRD and must be enumerated to be measurable.

'AI outage never blocks core' is restated as a release-blocking guardrail in §11.4 ('on provider failure, features degrade to their listed fallback — core flows never block on AI'). Architecturally this means every AI call must be non-blocking, timeout-bounded, and behind a circuit breaker whose open state renders the documented fallback rather than an error — the fallback is a product state, not an exception path.

RPO ≤ 24 h / RTO ≤ 4 h is stated for 'backups' generally. Note it does not separately cover object storage (documents, inspection photos, evidence) or the vector store, both of which carry tenant data under §8.2.

### NFR — Security (§12), exact targets
*Requirements: SC-10, SC-02, SC-01, FM-01, EM-06, SC-07*

Requirement: 'RBAC, encryption, certified gateway, audit logs, tenant isolation.'
Measurable target (proposed): OWASP ASVS L2; TLS 1.2+ in transit, AES-256 at rest; MFA for admin roles; audit log per SC-10; cross-tenant tests release-blocking.

Supporting requirements:
- SC-10 (Must, new in v2.0): immutable log of auth events, permission changes, financial actions, security events and AI overrides — capturing actor, tenant, timestamp. 12-month retention (proposed); queryable from the admin console. 'Immutable' is a storage-design constraint: append-only table with no UPDATE/DELETE grant, or WORM object storage — not a normal audit table.
- SC-02: 'certified gateway' maps to the payment gateway decision (§13.2) — Paystack or Flutterwave — with webhook-confirmed payments, idempotency and retries, refund/void, per-tenant reconciliation report and per-tenant settlement accounts.
- FM-01 requires archive-not-hard-delete for assets with all changes audit-logged; EM-06 requires all security events audit-logged.

ASVS L2 is asserted with no stated verification method, tester or budget owner — see open issues.

### NFR — Privacy & compliance (§12), exact targets
*Requirements: AI-E-06, EM-02, Q5, Q7, SC-10, AI-S-06*

Requirement: 'NDPA compliance; consent for biometric/CCTV.'
Measurable target (proposed): consent records + processing register; DPIA before any AI-E-06 work; per-entity retention schedule; data residency per Q7.

Concrete architectural obligations:
- Consent records are first-class data, not a settings flag: they need subject, purpose, timestamp, version of the notice, and withdrawal. NDPA is defined in the glossary as governing 'privacy, consent and biometric/CCTV features'.
- Processing register must be maintained as a deliverable artefact, not code.
- Per-entity retention schedule means retention is an attribute of each §8.1 entity, driving scheduled deletion/anonymisation jobs. EM-02 makes this explicit for visitor logs: 'visitor log retained per NDPA retention policy (§12)'.
- DPIA is a hard gate on AI-E-06 (AI security & access: CCTV anomaly detection, face/plate recognition). AI-E-06's own row states 'Prerequisites: NDPA compliance, explicit consent and DPIA sign-off (Q5). Builds only after sign-off'. §16 places it in Phase 3 'if Q5 signed off'.
- Data residency (Nigeria vs regional cloud) is Q7, owned by the Client, needed by kickoff, and it also determines the hosting provider (§13.2 Hosting row). This is the single decision with the widest blast radius on infrastructure selection.
- §11.4 adds: all AI interactions logged with PII minimised/redacted in logs.

### NFR — Scalability, Accessibility, Localization, Maintainability (§12), exact targets
*Requirements: Q8, Q6, SC-06, AI-E-04, SC-05*

SCALABILITY — Requirement: 'Grows with tenants, units and users.' Target: launch sizing to confirm (Q8) — design target: 20 tenants / 10,000 units / 50,000 users / 1,000 concurrent; documented horizontal scale path. The '1,000 concurrent' figure is not qualified as concurrent users or concurrent requests, which changes sizing by an order of magnitude. Q8 (Client, design phase) validates these targets and gates meaningful load tests.

ACCESSIBILITY — Requirement: 'Mobile-first, responsive, connectivity-tolerant.' Target: WCAG 2.1 AA for web; offline behaviour per §12.1. WCAG 2.1 AA lands squarely on this Next.js codebase (SC-06). The existing design system is a reasonable starting point but needs an audit pass: colour-contrast verification for the token pairs in both themes (--text-3 on --surface and status-pill text on 13%-alpha backgrounds are the likely failures), focus-visible styling on all interactive primitives, keyboard operability for Tabs and the collapsible sidebar/drawer, and accessible names on every IconButton. The shell already handles prefers-reduced-motion, ⌘K focus and aria-current, which is a good baseline.

LOCALIZATION — Requirement: 'Multilingual for a diverse user base.' Target: English at launch; additional languages per Q6; all UI strings externalised; AI translation for communications (AI-E-04). 'All UI strings externalised' is a build-now constraint even though only English ships: hardcoded JSX copy becomes a full-app retrofit later. Note per-tenant language configuration is also listed in §8.2 tenant onboarding ('languages'), so locale is tenant-scoped as well as user-scoped.

MAINTAINABILITY — Requirement: 'Modular, shared design system, documented handover.' Target: modular services; CI/CD; unit-test coverage ≥ 70% on core domains; runbooks + handover docs per §16. 'Core domains' is undefined and must be enumerated for the coverage gate to be enforceable. §16 Phase 3 explicitly scopes 'docs & runbooks' as deliverables alongside NFR verification.

### Offline & poor-connectivity behaviour (§12.1)
*Requirements: FM-03, FM-08, EM-06, SC-05, SC-06, SC-02, SC-10*

Three rules, stated verbatim:
1. Read caching for dashboards, work-order lists and key resident screens.
2. Queued writes for work-order updates, inspection logs and SOS (SMS fallback for SOS, proposed), with visible sync status.
3. Conflict resolution is server-authoritative; overwritten offline edits are surfaced to the user and audit-logged.

Cross-references that make this binding: FM-03 AC 'Offline updates supported per §12.1'; FM-08 'I do my whole job from my phone, including in poor-connectivity areas'; EM-06 'SOS submission works on poor connectivity with SMS fallback (proposed)'; §12 Accessibility 'offline behaviour per §12.1'.

Architectural implications:
- Queued writes require every mutating operation to carry a client-generated idempotency key so replay on reconnect cannot double-create work-order updates or SOS events. This is the same idempotency discipline SC-02 already demands for payments.
- 'Visible sync status' is a UI contract: pending / syncing / synced / conflicted must be renderable per record, which means the offline queue state has to be readable by the view layer, not hidden in a background worker.
- 'Server-authoritative' conflict resolution plus 'overwritten offline edits are surfaced to the user and audit-logged' means the server must return what it discarded, and the discard must produce an SC-10 audit entry. A last-write-wins server that silently drops the loser does not satisfy this.
- Ambiguity: §12.1 sits under a §12 Accessibility row whose target is 'WCAG 2.1 AA for web', but the offline behaviours listed (work-order updates, inspection logs, SOS) are all mobile technician/resident flows from SC-05. Whether SC-06's web app must also work offline — i.e. whether a service worker / PWA is in scope for this codebase — is not stated and materially changes the Next.js architecture. Flag for discovery; do not assume.

### Integration decision table (§13.2) and downstream blocking
*Requirements: EM-01, EM-05, EM-09, SC-02, SC-03, SC-04, SC-09, SC-01, SC-05, EM-04, EM-06, FM-01, FM-08, AI-S-06, AI-S-03, AI-F-03, Q3, Q7, Q10*

Table verbatim — Area | Need | Candidate providers (illustrative) | Decide by:
1. Payments | Cards, transfers, USSD; webhooks; per-tenant settlement | Paystack · Flutterwave | Kickoff (blocks EM-01)
2. SMS | Transactional + OTP delivery in Nigeria | Termii · Twilio | Kickoff
3. Email | Transactional email at volume | AWS SES · SendGrid · Mailgun | Kickoff
4. Maps | Location display and geocoding | Google Maps Platform | Design phase
5. LLM / AI | Copilots, chatbot, triage, translation via provider abstraction | Provider-agnostic (e.g. Anthropic, OpenAI) behind AI-S-06 | Design phase
6. OCR / vision | Document extraction; inspection photo analysis | Cloud vision API or equivalent | Design phase
7. Push | Mobile push notifications | FCM · APNs | Design phase
8. Hosting | Cloud hosting; residency per Q7 | To be agreed with Client | Kickoff

Third-party fees are the Client's (§15, §18). Only Payments carries an explicit 'blocks' annotation in the table. The rest below is derived from requirement text and should be presented as derived, not quoted:
- Payments (EXPLICIT) blocks EM-01 service charge & billing. Also underpins SC-02 gateway abstraction (cards/transfers/USSD, webhook-confirmed, idempotent, refund/void, per-tenant reconciliation), EM-05 paid bookings, EM-09 marketplace orders, SC-04 shared payment services. Note EM-09 payouts are separately blocked by Q3 (commission %, escrow, payout rails, KYC) — the gateway choice alone does not unblock payouts. Q10 (reconciliation source of truth: gateway settlement vs bank statements) defines EM-01's reconciliation rules and is due Phase 1.
- SMS (derived) gates SC-03 abstraction, SC-09 notifications engine SMS channel, EM-01 invoice delivery via SMS, EM-04 SMS sends, EM-06 SOS SMS fallback (proposed), and OTP for SC-01 session/MFA.
- Email (derived) gates SC-03, SC-09 email channel, EM-01 invoice delivery, EM-04.
- Maps (derived) gates SC-03 'maps for locations', asset location display (FM-01 location hierarchy), and security/patrol surfaces (EM-06).
- LLM (derived) gates AI-S-06 and therefore every AI-F-*, AI-E-*, AI-S-* feature. Because it is decided at design phase but AI-S-06 is a Phase 1 deliverable, the abstraction must be built before the provider is chosen — which is exactly what §11.4 mandates anyway.
- OCR / vision (derived) gates AI-S-03 document intelligence and AI-F-03 vision-based inspections.
- Push (derived) gates SC-05 push via FCM/APNs, SC-09 push channel, FM-08 push for assignments and escalations.
- Hosting (derived) gates everything infrastructural and is coupled to Q7 data residency; it determines the managed Postgres, object storage, vector store and job runner selections, and constrains which LLM/OCR providers are legally usable.

### AI guardrails §11.4 — the six release-blocking requirements
*Requirements: AI-S-06, SC-01, SC-10, Q12*

§11.4 is titled 'AI guardrails & design requirements (release-blocking)' and AI-S-06 is the only Must-priority AI requirement, scheduled into Phase 1 (weeks 1–12) as 'AI guardrails scaffolding'. Its benchmark is a hard requirement, not a proposed baseline: 'Zero cross-tenant retrieval in isolation tests'. The six bullets, verbatim in substance:

1. TENANT ISOLATION — retrieval, embeddings and context are hard-scoped to the tenant; automated cross-tenant leakage tests run in CI. Note this names three artefacts: the retrieval query, the stored embeddings, and the assembled context window. Embeddings must be written into a per-tenant namespace at index time (§8.2), the retriever must apply the tenant filter server-side, and the assembled prompt must be asserted chunk-by-chunk in tests.

2. PROVIDER ABSTRACTION — LLM/OCR/translation behind an abstraction with health checks; on provider failure, features degrade to their listed fallback; core flows never block on AI. Three provider families, not one: text generation, OCR/vision, translation. Health checks imply active probing plus circuit-breaker state, and the degraded state must render the documented per-feature fallback.

3. COST CONTROLS — per-tenant AND per-feature usage caps, with alerts and a kill-switch per feature. Usage is billed to the Client (§15). Ties to §8.2 per-tenant metering of AI, SMS and email, and to §8.2 per-tenant configuration of 'AI feature flags and usage caps'. The actual cap numbers and alert thresholds are Q12 (Client, Phase 2) — so build the mechanism with configurable values in Phase 1 and populate later.

4. PROMPT-INJECTION DEFENCE — user- and document-supplied content is treated as data; the assistant cannot be instructed by it to exceed the user's permissions (§7). This is a permissions statement, not a filtering statement: the tool/action layer must re-check the caller's §7 capability server-side on every AI-initiated action, so a malicious document cannot escalate. Retrieved chunks and user text must be structurally delimited from instructions, and every AI-drafted action must round-trip through the same deny-by-default authorisation as a human-initiated one (SC-01).

5. LOGGING & PRIVACY — all AI interactions logged via the AI interaction log entity (§8.1: 'Every AI request/response, confidence, override. Per tenant; powers audit, tuning and cost metering') with PII minimised/redacted in logs. SC-10 separately requires AI overrides in the immutable audit log.

6. UX STATES — every AI surface shows loading, confidence, sources and error states; every suggestion is review/approve/override; 'AI is assistive, not autonomous'.

### AI provider abstraction: the per-feature fallback and HITL matrix
*Requirements: AI-F-01, AI-F-02, AI-F-03, AI-F-04, AI-F-05, AI-E-01, AI-E-02, AI-E-03, AI-E-04, AI-E-05, AI-E-06, AI-S-01, AI-S-02, AI-S-03, AI-S-04, AI-S-05, AI-S-06, EM-03, EM-04, FM-07, SC-08, Q5*

Guardrail 2 says features 'degrade to their listed fallback'. Those fallbacks are specified per feature in §11.1–11.3 and form the contract the abstraction must implement. Fallback | human-in-the-loop | proposed benchmark:

FACILITY (§11.1)
- AI-F-01 Predictive maintenance (Should): fallback = standard PPM calendar unaffected; FM approves before any schedule changes; runs in shadow mode until data volume sufficient. Benchmark: after 3–6 months of data, precision ≥ 70% on 30-day failure window.
- AI-F-02 Smart WO triage (Should): fallback = manual triage queue; dispatcher confirms or overrides, overrides logged for tuning. Benchmark: top-1 category accuracy ≥ 85%; assignee suggestion acceptance ≥ 70%.
- AI-F-03 Vision-based inspections (Should): fallback = manual checklist flow; inspector edits and approves every report. Benchmark: defect recall ≥ 80% on agreed defect classes (pilot set).
- AI-F-04 Analytics & anomaly alerts (Should): fallback = static threshold alerts; confirm/dismiss feedback tunes sensitivity. Benchmark: false-positive rate ≤ 30% after tuning period.
- AI-F-05 FM copilot (Should): fallback = normal navigation and search; every drafted action requires explicit user confirmation. Benchmark: grounded-answer accuracy ≥ 90% on eval set.

ESTATE (§11.2)
- AI-E-01 Resident support chatbot (Should): fallback = FAQ + ticket; no source ⇒ MUST refuse and escalate to a ticket (EM-03); corpus curated by Estate Manager. Benchmark: routine-query deflection ≥ 60%; grounded-answer accuracy ≥ 90%.
- AI-E-02 Smart request triage (Should): shared service with AI-F-02; same HITL and fallback; shared benchmark.
- AI-E-03 Billing & arrears intelligence (Should): fallback = fixed reminder schedule; managers approve reminder campaigns; 'no automated penalties ever'. Benchmark: risk model AUC ≥ 0.75 after two billing cycles.
- AI-E-04 Communication assistant (Should): fallback = manual compose; manager approval required before any send (restated in EM-04 AC). Benchmark: human review pass rate ≥ 90%.
- AI-E-05 Marketplace intelligence (Could): fallback = manual listings, no recommendations; fraud flags go to a human review queue, never auto-block. Benchmark: fraud-flag precision ≥ 60% at review (pilot).
- AI-E-06 AI security & access (Could, optional): gated on NDPA compliance, explicit consent and DPIA sign-off (Q5); integrates with client hardware (hardware out of scope per §6.3). Not in default acceptance.

SHARED (§11.3)
- AI-S-01 Platform-wide copilot (Should): fallback = standard UI; action confirmation as AI-F-05; shared benchmark with AI-F-05.
- AI-S-02 NL search & reporting (Should): fallback = standard reports (FM-07); every figure traceable to source records. Benchmark: query success rate ≥ 80% on agreed test set.
- AI-S-03 Document intelligence (Should): fallback = manual entry and keyword search; extracted fields editable before save. Benchmark: field extraction ≥ 95% printed / ≥ 85% scanned.
- AI-S-04 Investor-dashboard AI (Should): all outputs labelled as estimates with assumptions shown; not presented as financial advice (restated in SC-08 AC). Benchmark: forecast error (MAPE) reviewed quarterly vs actuals.
- AI-S-05 Recommendation & fraud engine (Could): as AI-E-05.

§15 sets acceptance policy: AI features are accepted against these agreed benchmarks, not 100% accuracy; data-hungry features (AI-F-01, AI-E-03) launch in shadow/tuning mode; scope is foundation models + RAG, bespoke training excluded (§6.3).

### Required AI UX states — what this Next.js codebase must render
*Requirements: AI-S-06, SC-06, AI-F-02, AI-F-05, AI-E-01, AI-E-03, AI-E-04, AI-S-02, AI-S-04, SC-10*

Guardrail 6 is a UI requirement and lands directly on SC-06. Every AI surface must show: loading, confidence, sources, error. Every suggestion must be review / approve / override.

This means the web app needs a small set of reusable AI primitives layered on the existing design system, not ad-hoc per-screen treatments:
- AiPanel state union: idle | loading | ready | error | unavailable. 'unavailable' is distinct from 'error' because it is the circuit-breaker/degraded state from guardrail 2 and must render the feature's documented fallback affordance (e.g. 'Open manual triage queue' for AI-F-02, 'Raise a ticket' for AI-E-01) rather than a retry.
- ConfidenceBadge: renders the model's confidence; AI-F-02 explicitly outputs 'suggested category, priority and best-fit assignee/vendor with confidence'.
- SourceList: citations that link to the underlying records. AI-F-05 answers 'with sources'; AI-S-02 requires 'every figure traceable to source records'; AI-E-01 must produce 'a grounded answer with source, or escalation'.
- SuggestionActions: approve / edit / override, with the override reason captured — overrides are logged for tuning (AI-F-02) and written to the audit log (SC-10 'AI overrides').
- EstimateLabel: for AI-S-04 investor outputs, 'labelled as estimates with assumptions shown; not presented as financial advice'.
- ApprovalGate: for AI-E-04 announcements and AI-E-03 reminder campaigns, which require manager approval before any send.

Design-system note: none of these exist in src/components/ui/index.tsx today. They should be added as new primitives in the same file/idiom (token-driven colours, 38px controls, rounded-[11px] chips, 120–150ms transitions) so they inherit theming automatically.

### Environments, CI/CD and the release gates (§13.1)
*Requirements: SC-07, AI-S-06, SC-05, SC-06, Q11, Q8*

§13.1 Footprint, verbatim:
- Mobile — Android (APK/AAB) and iOS (TestFlight/IPA); store release plan per Q11.
- Web — product web app plus admin dashboard.
- Environments — dev, staging and production with CI/CD promotion; staging seeded with realistic multi-tenant test data.

'Staging seeded with realistic multi-tenant test data' is load-bearing for two reasons: the cross-tenant access tests are meaningless with a single tenant, and the seed fixtures used by this Next.js app should mirror the same multi-tenant shape so UI states seen in development match staging.

Release-BLOCKING gates, stated as such in the PRD:
1. Cross-tenant access tests pass in CI — §8.2, SC-07 AC, §12 Security.
2. Zero cross-tenant AI retrieval in isolation tests — AI-S-06 ('hard requirement'), §11.4 guardrail 1.
3. The whole of §11.4 is headed 'release-blocking', so provider-abstraction fallbacks, cost caps/kill-switches, prompt-injection defence, AI logging with PII redaction and the AI UX states are all gates, not backlog.

Gates that are stated as targets, NOT as blocking (do not over-claim): unit-test coverage ≥ 70% on core domains, API P95 < 500 ms, 99.5% availability, WCAG 2.1 AA, OWASP ASVS L2. These are §12 'measurable targets (proposed)' verified in Phase 3 ('NFR verification'). Recommend promoting coverage and WCAG to CI gates anyway, since both are cheap to automate and expensive to retrofit.

Other process facts: §16 defines Discovery → design (up to 3 revision rounds) → build → QA → client review (5 business days; deemed acceptance if no response) → deployment, with a 30-day post-deployment warranty on reproducible bugs. §15 notes App Store / Play Store publishing requires Client-owned developer accounts, and Q11 decides whether a production App Store release is in scope at all.

### Architecture recommendation: Next.js as presentation + BFF, authoritative logic in a separate backend
*Requirements: SC-06, SC-05, SC-01, SC-02, SC-09, SC-10, SC-11, SC-07, FM-02, FM-03, FM-05, AI-S-06*

RECOMMENDATION: this Next.js codebase becomes the SC-06 web app and admin console plus the SC-11 landing page, and a thin backend-for-frontend. It must NOT become the system of record.

The decisive argument is SC-01 + SC-05. SC-01 requires 'deny-by-default enforcement on every API', server-side. SC-05 requires native Android and iOS apps on a single cross-platform codebase. Mobile cannot consume Next.js Server Actions. If domain logic and authorisation live in the Next tier, either mobile gets a second, divergent implementation (guaranteeing the two enforcement paths drift, which is precisely the cross-tenant leak the release gate exists to catch) or a separate API is built anyway. So the authoritative API must exist independently from day one, and both web and mobile become clients of it.

BUILD IN THE SEPARATE BACKEND (authoritative):
- The §10 state machines — work order, service charge, booking, SOS, marketplace order. §10 calls them 'the contract between backend, mobile and QA' and states only listed transitions are legal, every transition timestamped, actor-attributed and notified via SC-09.
- RBAC evaluation and the §7 matrix, including 'O' ownership resolution, plus tenant and estate scoping (SC-01).
- All data access with RLS session scoping (§8.2, ADR-01).
- Payment gateway integration and webhooks (SC-02): webhook-confirmed, idempotent, retried, refund/void, per-tenant reconciliation and settlement. Webhooks need durable retry semantics; they must not terminate in a rendering tier.
- The scheduler: PPM work-order auto-generation ahead of due date (FM-02), per-priority SLA timers and escalations (FM-03, §10), reminder schedules at −3d/due/+7d/+21d (§10 service charge), SOS unacknowledged escalation to backup responders (§10), marketplace order auto-expiry (§10), vendor document expiry alerts (FM-05).
- SC-09 notifications engine — explicitly 'a single event bus' for push/SMS/email/in-app used by all modules, with per-user channel preferences, quiet hours, per-tenant templates and delivery logging.
- SC-10 immutable audit log.
- The AI gateway implementing AI-S-06: provider abstraction, health checks, circuit breakers, per-tenant/per-feature caps and kill-switches, tenant-scoped retrieval, AI interaction logging. Shared by web and mobile — duplicating it in the Next tier would duplicate the guardrails, and guardrails are release-blocking.
- Per-tenant usage metering for AI, SMS and email (§8.2).
- Offline write-queue reconciliation with server-authoritative conflict resolution (§12.1).

BUILD IN THIS NEXT.JS APP:
- Every SC-06 screen: responsive product web app for residents/managers plus the platform admin console for tenant management, configuration and audit views.
- SC-11 public landing page with lead capture into the investor pipeline — a separate route group with no app shell, statically rendered.
- BFF concerns: session cookie handling and token exchange, CSRF, per-screen aggregation so the 3 s interactive target survives the 500 ms-per-call API budget, per-tenant branding resolution (§8.2), i18n string catalogue (§12 Localization).
- Optimistic UI gating from a mirrored read-only copy of the §7 matrix and the §10 transition tables — used only to disable illegal buttons. The server remains authoritative; a mirrored copy is a UX affordance, never a security control.

Explicitly NOT in Next.js: authorisation decisions, state transitions, webhook receipt, scheduled jobs, AI provider calls, audit writes.

### Web data layer: tenant-context-first ports so seed → API is a config change
*Requirements: SC-06, SC-01, SC-07, AI-S-06, EM-01, FM-03*

RECOMMENDATION: structure the data layer as ports and adapters now, with the seed adapter as the first implementation. The five rules below are what actually prevent a UI rewrite when the real API lands — each targets a specific thing that normally forces one.

1. TENANT CONTEXT IS THE FIRST ARGUMENT of every read and command, even in seed mode. In the seed adapter it filters fixtures; in the HTTP adapter it becomes auth headers and is validated server-side. Because §8.2 requires every record to carry tenant scope, encoding it in the call signature from day one means adding real tenancy is a no-op for call sites. Server-side it must be derived from the session, never from a client-supplied parameter.

2. ONE PAGINATED ENVELOPE for all list reads — cursor-based, with a typed filter/sort object. The seed adapter implements real cursor pagination over fixtures. This is the single biggest rewrite-avoider: UIs built against `T[]` and re-sorted client-side have to be rebuilt when the server takes over paging, filtering and sorting.

3. ALL MUTATIONS RETURN A DISCRIMINATED RESULT (ok | validation_error | forbidden | conflict | unavailable), never throw for expected domain outcomes. `forbidden` is unavoidable given deny-by-default (SC-01), and `conflict` is required by §12.1 server-authoritative conflict resolution — designing those states in from the start means the screens already have somewhere to render them.

4. FIELD NAMES MATCH §8.1 EXACTLY. Fixtures that invent field names guarantee a mapping layer later.

5. THE SEED ADAPTER SIMULATES REALITY, not a happy path: 150–400 ms artificial latency (so Suspense boundaries are real and the <3 s target is designed against, not discovered), plus a forced `unavailable` mode for every AI port so the §11.4 fallback path is reachable and testable before any provider exists.

Proposed layout under src/lib/:
  domain/        tenancy.ts, permissions.ts, state-machines.ts, entities.ts   (pure, no I/O, mirrors the PRD)
  data/ports.ts  repository + command interfaces, Paginated<T>, Result<T,E>
  data/adapters/seed/*   fixtures implementing the ports
  data/adapters/http/*   fetch implementation against the real API
  data/index.ts  provider switch on an env var
  ai/ports.ts    AI surface ports with the mandated state union

Hard rule to enforce with lint: no file under src/app/** may import from data/adapters/**. Screens import only from data/index.ts. That one boundary is what makes the swap a one-line change.

### Next.js 16 specific tenancy hazards in this codebase
*Requirements: SC-06, SC-07, SC-01, AI-S-06*

The scaffold is Next 16.2.12 / React 19.2.4 and its AGENTS.md warns that conventions differ from older Next. Three version-specific points bear on multi-tenancy:

1. CACHE KEYS ARE A CROSS-TENANT LEAK VECTOR. Next 16's `use cache` (behind `cacheComponents: true`) stores results on the SERVER and keys them on the function's arguments and closed-over values. A cached read that derives tenantId from cookies inside the function body will serve one tenant's data to another. §8.2's 'no query ... may cross tenants' therefore applies to the web cache, not just the database. Two safe patterns: (a) pass tenantId as an explicit argument to any `use cache` function so it becomes part of the cache key, and tag entries per tenant via cacheTag(`tenant:${tenantId}:...`); or (b) use `'use cache: private'` for anything derived from cookies()/headers() — those results are never stored on the server, only in browser memory, which is the correct default for role-scoped tenant data. Note `'use cache: private'` is marked experimental and is not available in Route Handlers. Add a cross-tenant cache case to the release-blocking suite: two concurrent sessions in different tenants hitting the same route must never observe each other's data.

2. MIDDLEWARE IS NOW `proxy.ts`. Use it for host/subdomain → tenant resolution and optimistic redirects only. The Next 16 docs are explicit that proxy 'should not be used as a full session management or authorization solution' — which aligns exactly with SC-01's server-side deny-by-default. Tenant resolution in proxy is a routing hint; the backend must independently derive and enforce tenant scope from the token.

3. STREAMING IS HOW THE PERFORMANCE TARGET IS MET. Wrap uncached, request-time data in Suspense so the shell paints while API calls resolve — this is the mechanism for 'key screens interactive < 3 s on 4G' against a 500 ms P95 API, and it doubles as the natural home for the §11.4 mandated AI loading state.

### Design-system reuse plan: keep the visual language, replace the domain
*Requirements: SC-06, AI-S-06, SC-01, EM-01, FM-03, EM-06, EM-05, EM-09*

KEEP AS-IS: the token system in src/app/globals.css (--app, --surface/-2/-3, --border/-2, --text/-2/-3, --primary, --primary-weak, semantic positive/negative/warning) with the [data-theme="dark"] flip; the Inter Tight + JetBrains Mono pairing; shape and motion rules (cards rounded-[16px], controls rounded-[10px], chips/buttons rounded-[11px], 38px controls, 64px header, 120–150ms transitions, prefers-reduced-motion collapse); the breakpoint behaviour (≤1120 / ≤880 / ≤560); theme-provider.tsx with its pre-paint init script; and the primitives Card, CardHeader, KpiCard, Button, IconButton, FilterChip, Tabs, Table/Th/Td/TableRow, Avatar, Mono, EmptyState.

MUST CHANGE:
- src/components/ui/index.tsx exports `LoadStatus` and a `STATUS_COLORS` map of Draft/Posted/Booked/In Transit/Delivered/Closed. That is the logistics load lifecycle and has no relationship to this PRD. Replace with a keyed registry of five status scales, one per §10 state machine (workOrder, serviceCharge, booking, sos, marketplaceOrder), and make StatusPill generic over the scale so a work order's 'Closed' and an invoice's 'Paid' cannot be confused. The colour semantics carry over cleanly — amber for in-flight, green for terminal-good, red for arrears/escalated, grey for draft/closed.
- src/config/nav.ts is entirely logistics (Loads, Carriers & Brokers, Fuel, Customers) and must be replaced with the PRD's module structure, made role-aware so the §7 matrix drives what appears.
- src/config/brand.ts: name 'Cargoflow', tagline 'FREIGHT TMS'. Rebrand. Note §8.2 makes branding PER-TENANT configuration, so brand must eventually be loaded from tenant config, not a static module — keep the shape but plan for it to be provided by a server component / context.
- src/app/layout.tsx metadata description is 'Logistics management platform.'
- app-shell.tsx hardcodes 'Delowar Rahman' / 'Admin · Full access' in two places and a Truck brand icon; the profile must come from session, and the role label from §7.
- The seven placeholder routes (/loads, /carriers, /fuel, /customers, /maintenance, /staff, /settings) should be deleted rather than renamed, so no logistics route survives by accident.

MUST ADD: the §11.4 AI primitives (AiPanel state union, ConfidenceBadge, SourceList, SuggestionActions, EstimateLabel, ApprovalGate), a SyncStatus indicator if web offline is in scope (§12.1), and a WCAG 2.1 AA audit pass on contrast and focus-visible across both themes.

### Recommended route map / information architecture for SC-06
*Requirements: SC-06, SC-11, SC-07, SC-08, SC-10, SC-01, SC-04, FM-01, FM-02, FM-03, FM-04, FM-05, FM-06, FM-07, EM-01, EM-02, EM-03, EM-04, EM-05, EM-06, EM-07, EM-08, EM-09, AI-S-01, AI-S-02, AI-S-03, AI-S-04, Q12*

SC-06 covers two products in one codebase: 'responsive web app for residents/managers' and a 'platform admin console for tenant management, configuration and audit views'. Recommend three route groups.

(app) — authenticated product, wrapped in the existing AppShell:
  /                     Role-aware dashboard — FM-07 (open/overdue WOs, PPM compliance %, downtime, cost by category/estate)
  /work-orders          FM-03 list; /work-orders/[id] detail with §10 transitions
  /assets               FM-01 register; /assets/[id] with service history
  /ppm                  FM-02 plans + calendar view, overdue flagged
  /inspections          FM-06 templates, runs, compliance register
  /vendors              FM-05 profiles, documents with expiry, performance metrics
  /spaces               FM-04 estate→building→floor→unit/zone hierarchy
  /reports              FM-07 with CSV/PDF export, plus AI-S-02 NL reporting
  /billing              EM-01 charges, invoices, arrears aging, statements, accounting export
  /requests             EM-03 resident maintenance requests feeding FM-03
  /residents            EM-02 onboarding, move-in/out, household members
  /visitors             EM-02 time-bound codes/QR, visitor log
  /announcements        EM-04 broadcast/targeted, delivery & read stats, AI-E-04 draft + approval
  /bookings             EM-05 amenities, availability calendar, approvals
  /security             EM-06 SOS console, patrols, incidents
  /directory            EM-07 vendor/staff directory
  /documents            EM-08 folders + permissions, AI-S-03 semantic search
  /marketplace          EM-09 listings and orders (SC-04 shared catalog/order/payment)
  /investors            SC-08 off-plan projects, pipeline, occupancy, returns, AI-S-04 estimates
  /copilot              AI-S-01 platform-wide assistant

(admin) — platform admin console, Plat role only:
  /admin/tenants        SC-07 onboarding, bulk import of estates/units, branding, settlement account, languages, enabled features
  /admin/config         §8.2 per-tenant config: notification templates, amenity rules, charge structures
  /admin/audit          SC-10 queryable immutable log
  /admin/ai             §11.4 AI feature flags, per-tenant/per-feature caps, alerts, kill-switches (values per Q12)
  /admin/usage          §8.2 per-tenant AI/SMS/email metering

(marketing) — public, no app shell:
  /                     SC-11 landing page with lead capture into the investor pipeline

Auth: /login with session and password policy, MFA for admin roles (SC-01, §12 Security).

Sidebar grouping suggestion for nav.ts: Overview · Facility · Estate · Finance · Community · Intelligence · Admin — with items filtered by the §7 capability the route requires, so a Resident and a Facility Manager get genuinely different navigation from one config.

### State machines as a shared, versioned contract (§10)
*Requirements: FM-03, EM-01, EM-05, EM-06, EM-09, SC-09, SC-05, AI-F-02, AI-E-02, AI-E-03, Q3, Q4*

§10 states the machines are 'the contract between backend, mobile and QA', only listed transitions are legal, and every transition is timestamped, actor-attributed and notified via SC-09. SLA values are proposed defaults, configurable per tenant — so they are configuration, not constants.

Work order: New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed; branches Rejected, Cancelled. AI triage suggests category/priority/assignee, human confirms (AI-F-02 / AI-E-02). SLA timers per priority, e.g. Emergency respond 2 h / resolve 24 h; Routine 72 h. Resolved → Verified by requester or manager; auto-close after 5 days (proposed).
Service charge: Draft → Issued → Partially paid → Paid; and Issued → Overdue → In arrears → Escalated. Reminder schedule e.g. −3d, due, +7d, +21d via SC-09; AI-E-03 timing suggestions require manager approval; escalation policy per tenant.
Booking: Requested → Approved / Auto-approved → Confirmed → Completed; branches Declined, Cancelled. Auto-approval per amenity rules; payment (if fees) required to confirm; cancellation window per policy.
SOS event: Raised → Acknowledged → Responding → Resolved → Reviewed. Acknowledge target < 60 s during manned hours (proposed); unacknowledged alerts escalate to backup responders; full timeline retained for review.
Marketplace order: Placed → Accepted → Fulfilled → Closed; branches Declined, Refunded. Vendor must accept within SLA or order auto-expires; refunds via gateway; payout model pending Q3.

Architecture note: because SC-05 defers the mobile framework decision to kickoff, the machines may not be shareable as a TypeScript package (if mobile is Flutter). Recommend the canonical definition be a language-neutral spec (JSON/YAML) checked into the repo and code-generated into TypeScript for web and into the mobile language — with the backend generating from the same source. That keeps 'the contract between backend, mobile and QA' literally true rather than aspirational. The transition edges beyond the linear chains (e.g. On Hold → In Progress, who may Reject, when Cancel is legal) are not enumerated in §10 and must be closed at design.

### Notifications engine (SC-09) and audit log (SC-10) as shared infrastructure
*Requirements: SC-09, SC-10, SC-03, FM-01, FM-03, FM-05, FM-08, EM-01, EM-03, EM-04, EM-06, EM-09*

Both are Must and both are new-in-v2.0, meaning they were implicit before and are now explicit foundation work in Phase 1.

SC-09 Notifications engine — 'Unified service for push/SMS/email/in-app used by all modules (single event bus)'; per-user channel preferences and quiet hours; per-tenant templates; delivery logging. Consumers named across the PRD: FM-03 (state changes, requester notified), FM-05 (vendor assignment, document expiry alerts), FM-08 (push for assignments and escalations), EM-01 (invoice delivery in-app + email/SMS), EM-03 (resident notified on each state change), EM-04 (broadcast/targeted across in-app/push/SMS/email per user preference, with delivery and read statistics), EM-06 (SOS to security desk and designated responders), EM-09 (order lifecycle notifications), §10 (every state transition notified). The 'single event bus' phrasing plus 'quiet hours' has a safety implication: SOS must bypass quiet hours and channel preferences. The PRD does not say so explicitly — flag it.

SC-10 Audit logging — immutable log of auth events, permission changes, financial actions, security events and AI overrides, each with actor, tenant and timestamp; 12-month retention (proposed); queryable from the admin console. Writers named elsewhere: FM-01 (all asset changes audit-logged), EM-06 (all security events audit-logged), §11.4 / §8.1 (AI overrides), §12.1 (overwritten offline edits audit-logged). Recommend adding Platform Admin cross-tenant reads as a sixth category — §8.2 permits them and nothing currently records them.

Both belong in the backend, not the Next tier: the event bus fans out to providers chosen at kickoff (Termii/Twilio, SES/SendGrid/Mailgun, FCM/APNs) with delivery-failure handling and logs per SC-03, and the audit log needs append-only storage guarantees a rendering tier cannot provide.

### Phase mapping of architecture work (§16)
*Requirements: AI-S-06, SC-01, SC-02, SC-03, SC-05, SC-06, SC-07, SC-09, SC-10, SC-04, SC-08, SC-11, FM-01, FM-02, FM-03, FM-04, FM-05, FM-06, FM-07, FM-08, EM-01, EM-02, EM-03, EM-04, EM-05, EM-06, EM-07, EM-08, EM-09, Q5*

Phase 1 — Foundations & MVP, weeks 1–12: SC-01/02/03/05/06/07/09/10 · FM-01/02/03/05/07/08 · EM-01/02/03/04/06 · AI-S-06. Focus: discovery, brand, UX/UI; shared core; Must-priority features; AI guardrails scaffolding.
Phase 2 — Committed scope, weeks 10–20: FM-04/06 · EM-05/07/08/09 · SC-04/08/11 · AI-F-01…05 · AI-E-01…04 · AI-S-01…04. Should-priority features behind flags; AI feature set on the guardrails platform.
Phase 3 — Complete & harden, weeks 18–26: AI-E-05/06 (if Q5 signed off) · AI-S-05 · NFR verification · docs & runbooks.

Architecturally significant readings:
- AI-S-06 in Phase 1 with the AI features in Phase 2 confirms the intended sequencing: guardrails and the provider abstraction are built BEFORE any provider is chosen (§13.2 puts the LLM decision at design phase) and before any AI feature exists. Phase 2's 'AI feature set on the guardrails platform' makes the abstraction a hard dependency.
- 'Should-priority features behind flags' means feature flagging is Phase 1 infrastructure, and §8.2 already requires per-tenant 'AI feature flags and usage caps' — one flag system serves both.
- NFR verification is explicitly deferred to Phase 3, which is late for anything requiring architectural change. Recommend continuous measurement of the §12 targets from Phase 1 rather than a Phase 3 discovery.
- Phases overlap (1: 1–12, 2: 10–20, 3: 18–26), so the shared core must be stable enough to build on before Phase 1 formally closes.

## Code-ready artifacts

### src/lib/domain/tenancy.ts (`typescript`)

```typescript
/**
 * Tenancy + identity primitives.
 * §8.2 hierarchy: Platform -> Tenant -> Estate/Facility -> Building -> Unit -> Resident/Asset.
 * "Every domain record carries its tenant scope."
 */

export type TenantId = string & { readonly __brand: 'TenantId' };
export type EstateId = string & { readonly __brand: 'EstateId' };
export type UserId = string & { readonly __brand: 'UserId' };

/** §7 matrix columns, in order. */
export type Role =
  | 'platform_admin'   // Plat - 7 Fifteen Capital HQ
  | 'executive'        // Exec - Owner/Executive
  | 'estate_manager'   // EstM
  | 'facility_manager' // FacM
  | 'technician'       // Tech
  | 'resident'         // Res
  | 'security'         // Sec
  | 'vendor'           // Ven
  | 'investor';        // Inv

/**
 * Passed as the FIRST argument to every read and command in the data layer -
 * including in seed mode. Seed adapters use it to filter fixtures; the HTTP
 * adapter turns it into auth headers. Server-side it is derived from the
 * session and NEVER from a client-supplied value (SC-01, §8.2).
 */
export interface TenantContext {
  tenantId: TenantId;
  userId: UserId;
  roles: Role[];
  /** Estates the principal is scoped to (SC-01: "tenant- and estate-scoped"). */
  estateIds: EstateId[];
  /** §12 Localization: English at launch, further languages per Q6. */
  locale: string;
  /** True only for Platform Admin - the one context §8.2 allows to read across tenants. */
  isPlatform: boolean;
}

/** Every domain entity extends this. Mirrors §8.2 "every domain record carries its tenant scope". */
export interface TenantScoped {
  id: string;
  tenantId: TenantId;
  estateId?: EstateId;
  createdAt: string;
  updatedAt: string;
}

```

### src/lib/domain/permissions.ts (`typescript`)

```typescript
/**
 * §7 Roles & permissions matrix, transcribed verbatim.
 * The PRD calls this "the authoritative baseline"; fine-grained per-endpoint
 * permissions are finalised at design.
 *
 * IMPORTANT: this copy exists ONLY to gate UI affordances. Enforcement is
 * server-side and deny-by-default on every API (SC-01). Never treat a check
 * here as a security control.
 */

import type { Role } from './tenancy';

export type Capability =
  | 'tenant_onboarding'      // Tenant onboarding & config
  | 'users_roles'            // Users & roles
  | 'assets_ppm'             // Assets & PPM plans
  | 'work_orders'            // Work orders
  | 'inspections_compliance' // Inspections & compliance
  | 'charges_invoicing'      // Charges & invoicing
  | 'payments_pay'           // Payments (pay in-app)
  | 'announcements'          // Announcements
  | 'bookings_amenities'     // Bookings & amenities
  | 'security_sos'           // Security & SOS
  | 'marketplace'            // Marketplace
  | 'investor_projects'      // Investor projects
  | 'reports_analytics';     // Reports & analytics

/** F full control - M manage (create/edit within own tenant/estate) - V view - O own records only - '-' no access */
export type Access = 'F' | 'M' | 'V' | 'O' | '-';

const ORDER: Role[] = [
  'platform_admin', 'executive', 'estate_manager', 'facility_manager',
  'technician', 'resident', 'security', 'vendor', 'investor',
];

const row = (...v: Access[]): Record<Role, Access> =>
  Object.fromEntries(ORDER.map((r, i) => [r, v[i]])) as Record<Role, Access>;

export const PERMISSION_MATRIX: Record<Capability, Record<Role, Access>> = {
  //                        Plat Exec EstM FacM Tech Res  Sec  Ven  Inv
  tenant_onboarding:      row('F','-','V','-','-','-','-','-','-'),
  users_roles:            row('F','V','M','M','-','O','-','O','O'),
  assets_ppm:             row('V','V','V','M','V','-','-','-','-'),
  work_orders:            row('V','V','M','M','O','O','-','O','-'),
  inspections_compliance: row('V','V','V','M','O','-','-','-','-'),
  charges_invoicing:      row('V','V','M','-','-','O','-','-','-'),
  payments_pay:           row('-','-','-','-','-','O','-','-','-'),
  announcements:          row('V','V','M','M','-','V','V','-','-'),
  bookings_amenities:     row('V','V','M','-','-','O','V','-','-'),
  security_sos:           row('V','V','M','-','-','O','M','-','-'),
  marketplace:            row('V','V','M','-','-','O','-','O','-'),
  investor_projects:      row('F','V','-','-','-','-','-','-','O'),
  reports_analytics:      row('F','V','M','M','-','-','-','-','V'),
};

const RANK: Record<Access, number> = { '-': 0, O: 1, V: 2, M: 3, F: 4 };

/** Highest access the principal's roles grant for a capability. */
export function accessFor(roles: Role[], cap: Capability): Access {
  return roles.reduce<Access>((best, r) => {
    const a = PERMISSION_MATRIX[cap][r];
    return RANK[a] > RANK[best] ? a : best;
  }, '-');
}

/**
 * UI gate. `ownsRecord` resolves the 'O' (own records only) predicate -
 * resident->unit, technician->assignee, vendor->vendor org, investor->project.
 * 'O' is row-level and cannot be answered by role alone.
 */
export function canView(roles: Role[], cap: Capability, ownsRecord = false): boolean {
  const a = accessFor(roles, cap);
  return a === 'F' || a === 'M' || a === 'V' || (a === 'O' && ownsRecord);
}

export function canManage(roles: Role[], cap: Capability, ownsRecord = false): boolean {
  const a = accessFor(roles, cap);
  return a === 'F' || a === 'M' || (a === 'O' && ownsRecord);
}

```

### src/lib/domain/state-machines.ts (`typescript`)

```typescript
/**
 * §10 Key workflows & states - "the contract between backend, mobile and QA".
 * Only listed transitions are legal; every transition is timestamped,
 * actor-attributed and notified via SC-09. SLA values are proposed defaults,
 * configurable per tenant.
 *
 * NOTE: §10 lists the linear chains and branch states but does not enumerate
 * every edge (e.g. On Hold -> In Progress, who may Reject, when Cancel is
 * legal). Edges marked /* inferred *\/ are proposals to close at design.
 */

/* ---------------- Work order (FM-03, EM-03) ---------------- */
export type WorkOrderState =
  | 'New' | 'Triaged' | 'Assigned' | 'InProgress' | 'OnHold'
  | 'Resolved' | 'Verified' | 'Closed' | 'Rejected' | 'Cancelled';

export const WORK_ORDER_TRANSITIONS: Record<WorkOrderState, WorkOrderState[]> = {
  New:        ['Triaged', 'Rejected', 'Cancelled'],
  Triaged:    ['Assigned', 'Rejected', 'Cancelled'],
  Assigned:   ['InProgress', 'Cancelled'],
  InProgress: ['OnHold', 'Resolved', 'Cancelled'],
  OnHold:     ['InProgress', 'Cancelled'],           /* inferred: resume edge */
  Resolved:   ['Verified', 'InProgress'],            /* inferred: reject-resolution edge */
  Verified:   ['Closed'],
  Closed:     [],
  Rejected:   [],
  Cancelled:  [],
};

/** §10: "SLA timers per priority (e.g. Emergency: respond 2h / resolve 24h; Routine: 72h)". */
export const WORK_ORDER_SLA_HOURS = {
  Emergency: { respond: 2, resolve: 24 },
  Routine:   { resolve: 72 },
} as const;

/** §10: "Resolved -> Verified by requester or manager; auto-close after 5 days (proposed)". */
export const WORK_ORDER_AUTO_CLOSE_DAYS = 5;

/* ---------------- Service charge (EM-01) ---------------- */
export type ServiceChargeState =
  | 'Draft' | 'Issued' | 'PartiallyPaid' | 'Paid'
  | 'Overdue' | 'InArrears' | 'Escalated';

export const SERVICE_CHARGE_TRANSITIONS: Record<ServiceChargeState, ServiceChargeState[]> = {
  Draft:         ['Issued'],
  Issued:        ['PartiallyPaid', 'Paid', 'Overdue'],
  PartiallyPaid: ['Paid', 'Overdue'],
  Paid:          [],
  Overdue:       ['PartiallyPaid', 'Paid', 'InArrears'],
  InArrears:     ['PartiallyPaid', 'Paid', 'Escalated'],
  Escalated:     ['PartiallyPaid', 'Paid'],           /* inferred: settlement from escalation */
};

/** §10: "Reminder schedule (e.g. -3d, due, +7d, +21d) via SC-09". Days relative to due date. */
export const CHARGE_REMINDER_OFFSETS_DAYS = [-3, 0, 7, 21] as const;

/* ---------------- Booking (EM-05) ---------------- */
export type BookingState =
  | 'Requested' | 'Approved' | 'AutoApproved' | 'Confirmed'
  | 'Completed' | 'Declined' | 'Cancelled';

export const BOOKING_TRANSITIONS: Record<BookingState, BookingState[]> = {
  Requested:    ['Approved', 'AutoApproved', 'Declined', 'Cancelled'],
  Approved:     ['Confirmed', 'Cancelled'],
  AutoApproved: ['Confirmed', 'Cancelled'],
  Confirmed:    ['Completed', 'Cancelled'],
  Completed:    [],
  Declined:     [],
  Cancelled:    [],
};

/* ---------------- SOS event (EM-06) ---------------- */
export type SosState = 'Raised' | 'Acknowledged' | 'Responding' | 'Resolved' | 'Reviewed';

export const SOS_TRANSITIONS: Record<SosState, SosState[]> = {
  Raised:       ['Acknowledged'],
  Acknowledged: ['Responding'],
  Responding:   ['Resolved'],
  Resolved:     ['Reviewed'],
  Reviewed:     [],
};

/** §10: "Acknowledge target < 60s during manned hours (proposed)"; unacknowledged escalate to backup responders. */
export const SOS_ACK_TARGET_SECONDS = 60;

/* ---------------- Marketplace order (EM-09) ---------------- */
export type MarketplaceOrderState =
  | 'Placed' | 'Accepted' | 'Fulfilled' | 'Closed' | 'Declined' | 'Refunded';

export const MARKETPLACE_ORDER_TRANSITIONS: Record<MarketplaceOrderState, MarketplaceOrderState[]> = {
  Placed:    ['Accepted', 'Declined'],   // auto-expires if vendor does not accept within SLA
  Accepted:  ['Fulfilled', 'Refunded'],
  Fulfilled: ['Closed', 'Refunded'],
  Closed:    [],
  Declined:  [],
  Refunded:  [],
};

export function canTransition<S extends string>(
  table: Record<S, S[]>, from: S, to: S,
): boolean {
  return table[from]?.includes(to) ?? false;
}

```

### src/lib/data/ports.ts (`typescript`)

```typescript
/**
 * Data-layer ports. Screens depend on these interfaces only - never on an
 * adapter. Swapping seed fixtures for the real API is a change in
 * src/lib/data/index.ts and nothing else.
 *
 * Five rules encoded here, each targeting a specific cause of UI rewrites:
 *  1. TenantContext is the first argument of every call (§8.2 scope, SC-01).
 *  2. One cursor-paginated envelope for all lists - the seed adapter really paginates.
 *  3. Mutations return a discriminated Result, never throw for domain outcomes.
 *  4. Field names follow §8.1 exactly.
 *  5. Adapters simulate latency and the AI 'unavailable' state (§11.4).
 */

import type { TenantContext } from '@/lib/domain/tenancy';

/* ---------------- Envelopes ---------------- */

export interface Page<T> {
  items: T[];
  /** Opaque cursor; null when there is no further page. */
  nextCursor: string | null;
  /** Total when the server can supply it cheaply; omit rather than guess. */
  totalCount?: number;
}

export interface Query<TFilter, TSort extends string = string> {
  filter?: Partial<TFilter>;
  sort?: { by: TSort; dir: 'asc' | 'desc' };
  cursor?: string | null;
  limit?: number;
  /** Free-text search; server-side, never a client array filter. */
  q?: string;
}

export type DomainError =
  | { kind: 'validation'; fields: Record<string, string> }
  /** SC-01 deny-by-default. */
  | { kind: 'forbidden'; capability?: string }
  | { kind: 'not_found' }
  /** §12.1 server-authoritative conflict; `serverValue` is what was kept. */
  | { kind: 'conflict'; serverValue?: unknown; message: string }
  /** §11.4 provider failure -> render the feature's documented fallback. */
  | { kind: 'unavailable'; retryAfterMs?: number }
  | { kind: 'transport'; message: string };

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError };

/** §12.1 "visible sync status" - renderable per record. */
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'conflicted';

/* ---------------- Generic repository shape ---------------- */

export interface Repository<T, TFilter, TCreate, TPatch> {
  list(ctx: TenantContext, query?: Query<TFilter>): Promise<Page<T>>;
  get(ctx: TenantContext, id: string): Promise<T | null>;
  create(ctx: TenantContext, input: TCreate, idempotencyKey?: string): Promise<Result<T>>;
  update(ctx: TenantContext, id: string, patch: TPatch, idempotencyKey?: string): Promise<Result<T>>;
}

/**
 * Idempotency keys are not optional in practice: §12.1 queued writes replay on
 * reconnect and SC-02 requires idempotent payment handling.
 */

/* ---------------- Example: work orders (FM-03) ---------------- */

import type { WorkOrderState } from '@/lib/domain/state-machines';

export interface WorkOrderFilter {
  state: WorkOrderState[];
  priority: 'Emergency' | 'Routine';
  assigneeId: string;
  estateId: string;
  assetId: string;
  overdue: boolean;
}

export interface WorkOrderRepository
  extends Repository<WorkOrder, WorkOrderFilter, CreateWorkOrder, PatchWorkOrder> {
  /** Server validates the §10 transition table; the client copy only disables buttons. */
  transition(
    ctx: TenantContext,
    id: string,
    to: WorkOrderState,
    opts?: { note?: string; idempotencyKey?: string },
  ): Promise<Result<WorkOrder>>;
}

export interface WorkOrder {
  id: string;
  tenantId: string;
  estateId: string;
  reference: string;
  state: WorkOrderState;
  priority: 'Emergency' | 'Routine';
  title: string;
  description: string;
  assetId?: string;
  unitId?: string;
  requesterId: string;
  assigneeId?: string;
  assigneeKind?: 'technician' | 'vendor';
  slaRespondBy?: string;
  slaResolveBy?: string;
  photos: string[];
  costs?: { parts: number; labour: number; currency: string };
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export type CreateWorkOrder = Omit<
  WorkOrder, 'id' | 'tenantId' | 'reference' | 'state' | 'syncStatus' | 'createdAt' | 'updatedAt'
>;
export type PatchWorkOrder = Partial<Pick<WorkOrder, 'title' | 'description' | 'priority' | 'assigneeId' | 'assigneeKind' | 'photos' | 'costs'>>;

/* ---------------- The registry every screen imports ---------------- */

export interface DataLayer {
  workOrders: WorkOrderRepository;
  // assets (FM-01), ppmPlans (FM-02), spaces (FM-04), vendors (FM-05),
  // inspections (FM-06), charges/invoices/payments (EM-01, SC-02),
  // residents/visitors (EM-02), requests (EM-03), announcements (EM-04),
  // bookings (EM-05), sosEvents (EM-06), directory (EM-07),
  // documents (EM-08), listings/orders (EM-09), investorProjects (SC-08),
  // auditLog (SC-10), tenants/config/usage (SC-07)
}

```

### src/lib/data/index.ts (`typescript`)

```typescript
/**
 * The single swap point. Screens import from here; nothing under src/app/**
 * may import an adapter directly.
 *
 * Enforce with ESLint:
 *   'no-restricted-imports': ['error', { patterns: ['@/lib/data/adapters/*'] }]
 * scoped to src/app/**. That one boundary is what makes seed -> API a
 * one-line change instead of a UI rewrite.
 */

import type { DataLayer } from './ports';
import { seedDataLayer } from './adapters/seed';
import { createHttpDataLayer } from './adapters/http';

const source = process.env.NEXT_PUBLIC_DATA_SOURCE ?? 'seed'; // 'seed' | 'http'

export const data: DataLayer =
  source === 'http'
    ? createHttpDataLayer({ baseUrl: process.env.API_BASE_URL! })
    : seedDataLayer;

/* ------------------------------------------------------------------ */
/* Seed adapter shape - simulates reality, not a happy path.           */
/* ------------------------------------------------------------------ */
//
// export const seedDataLayer: DataLayer = {
//   workOrders: {
//     async list(ctx, query = {}) {
//       await delay();                                  // 150-400ms: makes Suspense real
//       const scoped = WORK_ORDERS.filter(w =>
//         w.tenantId === ctx.tenantId &&                // §8.2 tenant scope, enforced even in fixtures
//         (ctx.isPlatform || ctx.estateIds.length === 0 || ctx.estateIds.includes(w.estateId)));
//       return paginate(applyFilter(scoped, query), query);   // real cursor paging
//     },
//     async transition(ctx, id, to) {
//       await delay();
//       const wo = ...;
//       if (!canTransition(WORK_ORDER_TRANSITIONS, wo.state, to))
//         return { ok: false, error: { kind: 'conflict', message: `Illegal transition ${wo.state} -> ${to}` } };
//       return { ok: true, value: { ...wo, state: to, updatedAt: now() } };
//     },
//   },
// };
//
// function delay() { return new Promise(r => setTimeout(r, 150 + Math.random() * 250)); }

/* ------------------------------------------------------------------ */
/* HTTP adapter - TenantContext becomes headers, nothing else changes. */
/* ------------------------------------------------------------------ */
//
// export function createHttpDataLayer({ baseUrl }: { baseUrl: string }): DataLayer {
//   return {
//     workOrders: {
//       async list(ctx, query = {}) {
//         const res = await fetch(`${baseUrl}/work-orders?${encodeQuery(query)}`, {
//           headers: authHeaders(ctx),   // tenant scope re-derived and re-enforced server-side
//         });
//         return res.json() as Promise<Page<WorkOrder>>;
//       },
//       ...
//     },
//   };
// }
//
// NOTE on Next 16 caching: if a read is wrapped in `use cache`, tenantId MUST
// be an explicit argument so it forms part of the cache key, and entries must
// be tagged cacheTag(`tenant:${tenantId}:work-orders`). For anything derived
// from cookies()/headers(), prefer `'use cache: private'` - results are never
// stored on the server. A shared server cache keyed without tenantId is a
// cross-tenant leak and fails the SC-07 release gate.

```

### src/lib/ai/ports.ts (`typescript`)

```typescript
/**
 * AI-S-06 guardrails surface, as consumed by the web app.
 * §11.4 is release-blocking: tenant isolation, provider abstraction with
 * fallbacks, cost caps + kill-switch, prompt-injection-as-data, redacted
 * logging, and mandatory UX states.
 *
 * The web app never calls an LLM provider directly - it calls the backend AI
 * gateway, which owns the abstraction shared with mobile (SC-05).
 */

import type { TenantContext } from '@/lib/domain/tenancy';

/** §11.4 UX states: "every AI surface shows loading, confidence, sources and error states". */
export type AiSurfaceState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; message: string }
  /** Circuit-breaker open. Render the feature's documented §11 fallback, not a retry. */
  | { status: 'unavailable'; fallback: AiFallback };

/** One per AI feature, verbatim from §11.1-11.3. */
export type AiFallback =
  | { feature: 'AI-F-01'; action: 'standard_ppm_calendar' }
  | { feature: 'AI-F-02' | 'AI-E-02'; action: 'manual_triage_queue' }
  | { feature: 'AI-F-03'; action: 'manual_checklist_flow' }
  | { feature: 'AI-F-04'; action: 'static_threshold_alerts' }
  | { feature: 'AI-F-05' | 'AI-S-01'; action: 'standard_navigation_and_search' }
  | { feature: 'AI-E-01'; action: 'faq_and_ticket' }
  | { feature: 'AI-E-03'; action: 'fixed_reminder_schedule' }
  | { feature: 'AI-E-04'; action: 'manual_compose' }
  | { feature: 'AI-E-05' | 'AI-S-05'; action: 'manual_listings_no_recommendations' }
  | { feature: 'AI-S-02'; action: 'standard_reports' }
  | { feature: 'AI-S-03'; action: 'manual_entry_keyword_search' };

/** A citation. AI-F-05 "answers with sources"; AI-S-02 "every figure traceable to source records". */
export interface AiSource {
  label: string;
  /** In-app route to the underlying record - not an opaque doc id. */
  href: string;
  kind: 'document' | 'work_order' | 'asset' | 'invoice' | 'announcement' | 'record';
}

/** Every AI output is a suggestion: review / approve / override (§11.4). */
export interface AiSuggestion<T> {
  value: T;
  /** Rendered by ConfidenceBadge. AI-F-02 outputs suggestions "with confidence". */
  confidence: number;
  sources: AiSource[];
  /** SC-10 logs AI overrides; AI-F-02 logs overrides for tuning. */
  reviewState: 'pending' | 'approved' | 'overridden';
  interactionId: string; // -> AI interaction log (§8.1)
}

export interface AiPort {
  /**
   * Triage a request (AI-F-02 / AI-E-02). Dispatcher confirms or overrides.
   * Retrieval and context are hard-scoped to ctx.tenantId server-side (§11.4.1).
   */
  triage(ctx: TenantContext, input: { text: string; photos?: string[] }):
    Promise<AiSurfaceState<AiSuggestion<{ category: string; priority: string; assigneeId?: string }>>>;

  /** Grounded Q&A (AI-F-05 / AI-S-01 / AI-E-01). AI-E-01: no source => must refuse and escalate to a ticket. */
  ask(ctx: TenantContext, question: string):
    Promise<AiSurfaceState<{ answer: string; sources: AiSource[]; refused?: boolean }>>;

  /** Record approve/override so it reaches the AI interaction log and SC-10 audit log. */
  recordReview(ctx: TenantContext, interactionId: string,
    outcome: 'approved' | 'overridden', reason?: string): Promise<void>;
}

/**
 * §11.4 cost controls - per-tenant AND per-feature caps, alerts, kill-switch.
 * Rendered by the admin console (/admin/ai). Actual numbers come from Q12.
 */
export interface AiFeatureControls {
  featureId: string;              // 'AI-F-02', 'AI-E-01', ...
  enabled: boolean;               // per-tenant feature flag (§8.2)
  killSwitch: boolean;            // §11.4.3 kill-switch per feature
  monthlyCapUnits: number | null; // null = uncapped (discouraged)
  alertThresholdPct: number;      // e.g. 80
  usedUnitsThisPeriod: number;    // §8.2 per-tenant metering
}

```

### ci/release-gates.yml (`yaml`)

```yaml
# Release gates derived from the PRD. Items under `blocking:` are stated as
# release-blocking in the document itself; items under `targets:` are §12
# "measurable targets (proposed)" verified in Phase 3 - promoted here where
# automation is cheap, but do not describe them to the Client as contractual
# blockers.

environments:            # §13.1
  - dev
  - staging              # "seeded with realistic multi-tenant test data" - MUST have >= 2 tenants
  - production
promotion: ci_cd         # §13.1 "CI/CD promotion"

blocking:
  cross_tenant_access:   # §8.2, SC-07 AC, §12 Security
    description: >-
      No query, file, search index, AI retrieval or report may cross tenants
      below Platform Admin.
    matrix:
      principals: [executive, estate_manager, facility_manager, technician,
                   resident, security, vendor, investor]     # plus platform_admin (allow + audit)
      resources:  [estate, unit, user, asset, ppm_plan, work_order, inspection,
                   vendor, charge, invoice, payment, announcement, booking,
                   visitor_pass, sos_event, document, listing, order,
                   investor_project, ai_interaction_log]
      surfaces:
        - api_read_write
        - object_storage_direct_url
        - object_storage_presigned_replay
        - search_index_query
        - ai_retrieval_context           # assert zero tenant-B chunks in assembled context
        - report_generation_and_export   # FM-07 CSV/PDF is a real leak vector
        - nextjs_server_cache            # two concurrent sessions, different tenants, same route
        - payment_webhook_replay         # SC-02: tenant-B reference against tenant-A settlement
    assert:
      non_platform: [403, 404]
      platform_admin: allow_and_audit    # SC-10 entry required

  ai_isolation:          # AI-S-06 benchmark - "hard requirement", not proposed
    description: Zero cross-tenant retrieval in isolation tests.
    assert: zero_cross_tenant_chunks

  ai_guardrails:         # §11.4 header: "release-blocking"
    - provider_abstraction_health_checks_present
    - every_ai_feature_has_declared_fallback      # see AiFallback union
    - core_flows_pass_with_all_ai_providers_down  # "core flows never block on AI"
    - per_tenant_and_per_feature_caps_enforced
    - kill_switch_per_feature_functional
    - prompt_injection_suite                      # injected doc cannot exceed caller's §7 permissions
    - ai_interactions_logged_with_pii_redacted
    - ai_ux_states_present                        # loading, confidence, sources, error

targets:                 # §12 - measured continuously, verified in Phase 3
  performance:
    api_p95_ms: 500
    key_screens_interactive_s_on_4g: 3
    usable_on_3g: true
    key_screens: [work_order_list, work_order_detail, resident_charges_pay,
                  resident_raise_request, manager_dashboard, security_sos_console]
  reliability:
    monthly_availability_pct: 99.5      # core flows; "core flows" needs enumerating (open issue)
    rpo_hours: 24
    rto_hours: 4
  security:
    standard: OWASP_ASVS_L2
    tls_min: "1.2"
    at_rest: AES-256
    mfa_admin_roles: true
  scalability:                          # design targets pending Q8
    tenants: 20
    units: 10000
    users: 50000
    concurrent: 1000                    # units ambiguous: users vs requests
  accessibility:
    standard: WCAG_2.1_AA               # web (SC-06)
  maintainability:
    unit_test_coverage_pct: 70          # "core domains" - undefined, must be enumerated

```

### src/config/nav.ts (replacement shape) (`typescript`)

```typescript
/**
 * Sidebar for SC-06. Replaces the logistics nav (Loads / Carriers / Fuel /
 * Customers). Each item declares the §7 capability it requires so one config
 * drives nine different role experiences - a Resident and a Facility Manager
 * see genuinely different navigation.
 */

import type { LucideIcon } from 'lucide-react';
import type { Capability } from '@/lib/domain/permissions';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Item renders only if canView(roles, requires). */
  requires: Capability;
  badge?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

// Icons elided for brevity - lucide-react equivalents:
// Gauge, Wrench, Boxes, CalendarClock, ClipboardCheck, HardHat, LayoutGrid,
// BarChart3, Receipt, MessageSquareWarning, Users, QrCode, Megaphone,
// CalendarDays, ShieldAlert, Contact, FolderOpen, Store, TrendingUp,
// Sparkles, Building2, SlidersHorizontal, ScrollText, Bot, Activity

export const navGroups: NavGroup[] = [
  { label: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', href: '/', requires: 'reports_analytics' },   // FM-07
  ]},
  { label: 'Facility', items: [                                                           // Module 01
    { id: 'work-orders', label: 'Work orders', href: '/work-orders', requires: 'work_orders' },        // FM-03
    { id: 'assets',      label: 'Assets',      href: '/assets',      requires: 'assets_ppm' },         // FM-01
    { id: 'ppm',         label: 'PPM plans',   href: '/ppm',         requires: 'assets_ppm' },         // FM-02
    { id: 'inspections', label: 'Inspections', href: '/inspections', requires: 'inspections_compliance' }, // FM-06
    { id: 'vendors',     label: 'Vendors',     href: '/vendors',     requires: 'work_orders' },        // FM-05
    { id: 'spaces',      label: 'Spaces',      href: '/spaces',      requires: 'assets_ppm' },         // FM-04
  ]},
  { label: 'Estate', items: [                                                             // Module 02
    { id: 'requests',      label: 'Requests',      href: '/requests',      requires: 'work_orders' },        // EM-03
    { id: 'residents',     label: 'Residents',     href: '/residents',     requires: 'users_roles' },        // EM-02
    { id: 'visitors',      label: 'Visitors',      href: '/visitors',      requires: 'security_sos' },       // EM-02
    { id: 'announcements', label: 'Announcements', href: '/announcements', requires: 'announcements' },      // EM-04
    { id: 'bookings',      label: 'Bookings',      href: '/bookings',      requires: 'bookings_amenities' }, // EM-05
    { id: 'security',      label: 'Security & SOS',href: '/security',      requires: 'security_sos' },       // EM-06
    { id: 'directory',     label: 'Directory',     href: '/directory',     requires: 'announcements' },      // EM-07
    { id: 'documents',     label: 'Documents',     href: '/documents',     requires: 'announcements' },      // EM-08
  ]},
  { label: 'Finance', items: [
    { id: 'billing',   label: 'Billing & arrears', href: '/billing',     requires: 'charges_invoicing' },  // EM-01
    { id: 'marketplace', label: 'Marketplace',     href: '/marketplace', requires: 'marketplace' },        // EM-09
  ]},
  { label: 'Intelligence', items: [
    { id: 'copilot',   label: 'Copilot',   href: '/copilot',   requires: 'reports_analytics' },  // AI-S-01
    { id: 'reports',   label: 'Reports',   href: '/reports',   requires: 'reports_analytics' },  // FM-07 / AI-S-02
    { id: 'investors', label: 'Investors', href: '/investors', requires: 'investor_projects' },  // SC-08 / AI-S-04
  ]},
  { label: 'Admin', items: [                                                              // Platform Admin console
    { id: 'tenants', label: 'Tenants',   href: '/admin/tenants', requires: 'tenant_onboarding' },  // SC-07
    { id: 'config',  label: 'Config',    href: '/admin/config',  requires: 'tenant_onboarding' },  // §8.2
    { id: 'ai-ops',  label: 'AI usage',  href: '/admin/ai',      requires: 'tenant_onboarding' },  // §11.4 caps/kill-switch, Q12
    { id: 'audit',   label: 'Audit log', href: '/admin/audit',   requires: 'tenant_onboarding' },  // SC-10
  ]},
];

/**
 * Also replace `pageMeta` (currently logistics copy) and, in
 * src/components/ui/index.tsx, replace `LoadStatus` / `STATUS_COLORS`
 * (Draft/Posted/Booked/In Transit/Delivered/Closed) with a keyed registry of
 * the five §10 scales: workOrder, serviceCharge, booking, sos,
 * marketplaceOrder - so a work order's 'Closed' and an invoice's 'Paid'
 * cannot be conflated by a shared colour map.
 */

```

## Open issues
- ADR-01 / Q2 (owner: Unrealabs, due kickoff) is unresolved: shared DB + row-level security vs schema-per-tenant. §8.2 calls the shared-DB option 'proposed' and Q2 notes it is 'foundational architecture; expensive to change later'. Recommendation above is to confirm as proposed, but nothing can be schema-frozen until it is signed.
- Q7 hosting provider and data residency (Nigeria vs regional cloud) is due at kickoff and gates every infrastructure selection — managed Postgres, object storage, vector store, job runner. It also creates a latent conflict with §13.2's LLM row: if Q7 lands on in-country residency, no major foundation-model provider offers Nigerian inference, so either residency or the AI architecture has to give. Surface to the Client explicitly rather than discovering it at design phase.
- Requirement ID collision: FM-01's acceptance criteria says 'all changes audit-logged (SC-11)', but §9.3 defines SC-11 as the Landing page and SC-10 as Audit logging. The reference should be SC-10. Needs an erratum so traceability and test mapping are not built against the wrong ID.
- §12 Reliability targets 99.5% monthly availability 'for core flows' but never defines core flows. Unmeasurable as written. Recommend enumerating: authentication, work-order read/update, charge payment, request raise, SOS.
- §12 Maintainability requires unit-test coverage ≥ 70% 'on core domains' with core domains undefined. Cannot be a CI gate until enumerated.
- SOS is safety-critical yet Q4 (who responds, escalation chain, liability, manned hours) is unresolved until Phase 1, the <60s acknowledge target is 'proposed', and the SMS fallback in EM-06 and §12.1 is also 'proposed'. Architecture must not assume SMS fallback exists. Additionally, SOS availability is not carved out of the general 99.5% target — a life-safety flow arguably needs a higher target and a separate error budget.
- §12.1 lists SOS among 'queued writes', but a silently queued SOS that syncs later is worse than a visible failure. The PRD does not state a rule. Recommend: SOS never queues silently — it either sends, falls back to SMS immediately, or fails loudly with an instruction to call. Needs a decision.
- SC-09 supports per-user channel preferences and quiet hours, but the PRD never states that SOS and other safety events bypass them. Confirm the bypass rule explicitly.
- Whether the WEB app must work offline is ambiguous. §12.1's behaviours are all mobile technician/resident flows (SC-05), yet it is referenced from the §12 Accessibility row whose target is 'WCAG 2.1 AA for web'. Whether a service worker / PWA is in scope for SC-06 materially changes the Next.js architecture and must be settled before build.
- Vendor identity across tenants is undefined. §8.1 defines Vendor as an 'External contractor organisation' belonging to a tenant, and §7 gives Ven 'O' on work orders, users & roles and marketplace. If a single vendor org serves two tenants, that is a cross-tenant identity in direct tension with §8.2 hard isolation. Decide: tenant-local vendor records only, or a platform-level vendor identity with per-tenant memberships.
- Investor scoping is similarly undefined. SC-08 says 'investors see only their projects' and §7 gives Inv 'O' on investor projects and 'V' on reports & analytics, but does not say whether an investor is tenant-scoped or platform-scoped across multiple tenants' projects.
- Platform Admin cross-tenant reads are permitted by §8.2 ('below Platform Admin') but SC-10's audit categories (auth events, permission changes, financial actions, security events, AI overrides) do not include them. Recommend adding platform cross-tenant access as an audited category — otherwise the one legitimate isolation bypass is the one nothing records.
- Q12 (per-tenant AI/SMS budget caps and alert thresholds) is due Phase 2, but §11.4 cost controls are release-blocking and AI-S-06 is a Phase 1 deliverable. Build the caps/alerts/kill-switch mechanism in Phase 1 with configurable values; the numbers arrive later.
- Q10 (payment reconciliation source of truth: gateway settlement vs bank statements) is due Phase 1 and 'defines EM-01 reconciliation rules' — but EM-01 is itself a Phase 1 Must. Tight sequencing risk on a Must feature.
- Q3 (marketplace commission %, escrow, payout rails, KYC) explicitly blocks the EM-09 payout build and is not due until Phase 2 start. EM-09 can ship listings/orders/payment-in without payouts; confirm that partial delivery is acceptable.
- Q8 (launch sizing) is unresolved, so the 20 tenants / 10,000 units / 50,000 users / 1,000 concurrent figures are design targets only and load tests cannot be signed off against them. Separately, '1,000 concurrent' does not distinguish concurrent users from concurrent requests — an order-of-magnitude difference in sizing.
- OWASP ASVS L2 is asserted with no stated verification method, tester, timing or cost owner. §15 makes third-party fees the Client's but does not mention penetration testing. Clarify whether an external assessment is in scope.
- RPO ≤ 24 h / RTO ≤ 4 h is stated for 'backups' generally, with no explicit coverage of object storage (documents, inspection photos, work-order evidence) or the vector store — both of which hold tenant data under §8.2.
- SC-05 defers the mobile framework decision to kickoff, which determines whether the §7 matrix and §10 state machines can be shared as a TypeScript package or must be code-generated from a language-neutral spec. §10 calls the machines 'the contract between backend, mobile and QA', so the sharing mechanism needs deciding early.
- Retention conflict: SC-10 proposes 12-month audit retention while §12 Privacy requires a 'per-entity retention schedule' and EM-02 requires visitor logs 'retained per NDPA retention policy'. These may not agree for security and visitor records. Needs a single reconciled retention matrix.
- Per-tenant branding is required (§8.2) but SC-06 does not say whether tenants get custom domains or subdomains. This determines proxy.ts host resolution, cookie scoping and TLS certificate strategy in this Next.js app.
- Q9 (legacy data migration from spreadsheets, resident lists, asset registers) is unresolved and §6.3/Q9 note migration is unscoped and 'may need a Change Request'. No migration tooling is budgeted, yet FM-01 and EM-02 both specify bulk CSV import, which is the likely landing point for it.
