# Roles & Permissions System (PRD §7) — verified matrix, TypeScript enforcement design, and per-role UI surface map

## Summary
I re-parsed PRD §7 (prd.txt lines 146–291) mechanically and verified all 13 capabilities × 9 roles = 117 cells: the matrix supplied for cross-checking is 100% correct — zero corrections. Structural findings: Platform Admin is the only role holding F (4 cells: tenant config, users & roles, investor projects, reports) and is otherwise a cross-tenant *read-only* observer (V on all operations, — on in-app payments); Owner/Executive holds no write anywhere (11× V, — on tenant config and payments); Estate Manager is the estate operational owner (M on 7 rows) but cannot author assets/PPM or inspections (V only); Facility Manager owns the asset/maintenance/inspection spine but has zero financial access (— on charges, payments, bookings, security, marketplace, investor). "O" is not one rule — it means six materially different ownership predicates (self, my units/household, requested-by-me, assigned-to-me, my vendor org, my projects) which I've enumerated per cell with requirement citations. The enforcement design is a compile-time-exhaustive `Record<Capability, Record<Role, Level>>` (a missing cell becomes a TS error, never an implicit allow), a level→action algebra with narrowing-only per-cell overrides, and a `Decision` that returns a `ScopeFilter{tenantId, estateIds, ownership}` compiled into every query — so SC-01 deny-by-default and §8.2 hard tenant isolation are structural, not conventional. Nine real gaps/contradictions surfaced, chief among them: Vendor is "—" on Charges & invoicing yet FM-05 requires vendors to submit invoices; Investor is "V" on Reports yet SC-08 says investors see only their projects; Technician is "—" on Announcements; and six PRD features (EM-07 directory, EM-08 documents, FM-04 spaces, FM-05 vendors, SC-09 preferences, SC-10 audit log) have no matrix row at all — with EM-07 circularly deferring its "visibility rules per role" to a §7 that does not cover it.

### VERIFIED MATRIX — all 13 rows correct, zero corrections required
*Requirements: SC-01, SC-07*

I re-parsed prd.txt lines 146–291 mechanically (strip whitespace, drop blanks, chunk into capability + 9 values after the 'Inv' column header) and got exactly 13 rows with 0 leftover tokens — proving no column drift in the PDF extraction. Every cell in the supplied cross-check parse matches the PRD. **No row needed correction.**

Column order: Plat, Exec, EstM, FacM, Tech, Res, Sec, Ven, Inv.

| Capability | Plat | Exec | EstM | FacM | Tech | Res | Sec | Ven | Inv |
|---|---|---|---|---|---|---|---|---|---|
| Tenant onboarding & config | F | — | V | — | — | — | — | — | — |
| Users & roles | F | V | M | M | — | O | — | O | O |
| Assets & PPM plans | V | V | V | M | V | — | — | — | — |
| Work orders | V | V | M | M | O | O | — | O | — |
| Inspections & compliance | V | V | V | M | O | — | — | — | — |
| Charges & invoicing | V | V | M | — | — | O | — | — | — |
| Payments (pay in-app) | — | — | — | — | — | O | — | — | — |
| Announcements | V | V | M | M | — | V | V | — | — |
| Bookings & amenities | V | V | M | — | — | O | V | — | — |
| Security & SOS | V | V | M | — | — | O | M | — | — |
| Marketplace | V | V | M | — | — | O | — | O | — |
| Investor projects | F | V | — | — | — | — | — | — | O |
| Reports & analytics | F | V | M | M | — | — | — | — | V |

Legend verbatim (line 147–148): F = full control · M = manage (create/edit within own tenant/estate) · V = view · O = own records only · — = no access. Column key (line 148–150): Plat = Platform Admin (7 Fifteen Capital HQ), Exec = Owner/Executive, EstM = Estate Manager, FacM = Facility Manager, Tech = Technician, Res = Resident, Sec = Security, Ven = Vendor, Inv = Investor.

Two governing sentences bracket the table and are binding on the build:
- Line 147: "Server-side, deny-by-default enforcement on every API (SC-01)." → the Next.js app is a *client*; UI gating is cosmetic and must be mirrored, never trusted.
- Line 291: "Fine-grained permissions per endpoint are finalised at design; this matrix is the authoritative baseline." → this is the licence to add per-cell action narrowing (below), provided nothing is widened beyond a cell's level.

Distribution facts worth designing around: F appears only 4 times and only for Platform Admin. Exec never holds F, M or O — it is a pure read role across 11 capabilities. The Payments row has exactly one non-dash cell in the entire table (Res = O).

### Legend semantics → a concrete action algebra (level → allowed verbs)
*Requirements: SC-01, FM-01, FM-07, EM-01*

The legend gives levels, not verbs. To enforce anything you need a level→action mapping. Derived strictly from the PRD wording:

- **F (full control)** → read, export, create, update, archive, approve, transition, configure. Only Platform Admin holds F, and only on tenant_config, users_roles, investor_projects, reports_analytics.
- **M ("manage — create/edit within own tenant/estate", line 147)** → read, export, create, update, archive, approve, transition. Explicitly **not** `configure` — tenant/platform configuration is SC-07 Platform Admin work (§8.2 "Platform Admin creates the organisation, then configures estates/units…").
- **V (view)** → read, export. Export is bundled with read because FM-07 states "export CSV/PDF; role-scoped visibility per §7" — the export is the same data under the same scope, so it cannot be a separate grant.
- **O (own records only)** → read, export, create, update, archive, transition — every one of them row-filtered by an ownership predicate. **O is not a weaker V**: a Resident with O on charges/payments/bookings performs mutations (EM-01 pay, EM-05 book, EM-03 raise) that an Exec with V cannot. Ranking levels on a single axis (F>M>V>O) is therefore wrong and will produce bugs; O is orthogonal to V.
- **— (none)** → empty set. Not "hidden" — denied.

**Archive, never delete**: FM-01 states "Archive (no hard delete); all changes audit-logged". There is no `delete` action anywhere in the system; `archive` is the terminal verb. Enforce this by simply not defining `delete` in the Action union.

**Per-cell narrowing (PROPOSED, licensed by line 291)** — a cell may grant fewer verbs than its level implies, never more:
- technician:work_orders → read, update, transition only. FM-03's story is "receive, update and close"; work orders originate from EM-03 resident requests, the FM-02 scheduler, and FM-06 failed inspection items — never from a technician.
- vendor:work_orders → read, update, transition only. FM-05: "Vendors receive assignments and submit updates & invoices."
- resident:work_orders → read, create, update. EM-03 permits raising a request, attaching photos and rating the resolution; it does not permit driving the §10 state machine (that is Triaged/Assigned/Resolved/Verified, manager- and technician-owned).
- resident:charges_invoicing → read, export only. EM-01 gives residents "Statements per unit/resident", not invoice authoring.
- resident:payments_in_app → read, create only. SC-02: initiate a payment, view a receipt; payments are webhook-confirmed and idempotent, so they are never client-editable.
- resident:security_sos → read, create only. EM-06 gives residents SOS raise and EM-02 gives visitor-pass issue; acknowledge→responding→resolved is the Security role's M.
- estate_manager:tenant_config → read only. This is what V means here: an Estate Manager reads the tenant's amenity rules, charge structures and branding but cannot change them (SC-07).

### "O" is six different predicates — the per-cell ownership table
*Requirements: EM-01, EM-02, EM-03, EM-05, EM-06, EM-09, FM-03, FM-05, FM-06, SC-02, SC-08*

There are 14 O cells in the matrix and they mean materially different things. Implementing O as one generic `ownerId === actor.userId` check will silently break resident household billing, vendor org access and investor project access. Each O cell resolves to one or more ownership keys (OR semantics within a cell):

| Cell | Ownership predicate | Source |
|---|---|---|
| Res : Users & roles | `self` OR `my_units` (household members) | EM-02 "household members supported" |
| Ven : Users & roles | `my_vendor_org` (vendor org users, profile, insurance/cert documents) | FM-05 vendor profiles + documents with expiry alerts |
| Inv : Users & roles | `self` (own investor profile only) | §8.1 User+Role(s) |
| Tech : Work orders | `assigned_to_me` (assigneeUserId = actor) | FM-03 |
| Res : Work orders | `requested_by_me` OR `my_units` | EM-03 (a household member's request on my unit must be visible) |
| Ven : Work orders | `my_vendor_org` (assignedVendorOrgId) | FM-03 "Assign to internal technician or vendor"; FM-05 vendor portal |
| Tech : Inspections | `assigned_to_me` (inspector on the run) | FM-06 |
| Res : Charges & invoicing | `my_units` OR `self` | EM-01 "Statements per unit/resident" |
| Res : Payments | `self` | SC-02 |
| Res : Bookings | `self` | EM-05 |
| Res : Security & SOS | `self` OR `my_units` (my SOS events, my issued visitor passes) | EM-06, EM-02 |
| Res : Marketplace | `self` (my orders) | EM-09 |
| Ven : Marketplace | `my_vendor_org` (my listings + orders against them) | EM-09 |
| Inv : Investor projects | `my_projects` | SC-08 "investors see only their projects" |

**Critical: ownership is not exclusive to O.** Inv : Reports & analytics is level **V** in §7, but SC-08 constrains investors to their own projects. So that V cell must additionally carry the `my_projects` clause. The engine must therefore allow an ownership clause on any level, not just O.

**Empty-predicate trap (high-severity):** if a resident has no linked units, `my_units` resolves to an empty id list. An empty `OR []` in Prisma means *match everything*, and an empty `IN ()` in raw SQL is a syntax error. The rule must be: if a cell has ownership keys and every clause resolves unsatisfiable, that role contributes **no grant at all** (skip it in the union) rather than emitting an empty filter. This is the single most likely way an O cell silently becomes an F cell in production.

### Tenant and estate scoping — the two axes above ownership
*Requirements: SC-01, SC-07, EM-01*

§8.1 defines the User entity as "roles per §7, scoped to tenant (and estate where relevant)" and §8.2 makes tenant isolation hard: "no query, file, search index, AI retrieval or report may cross tenants below Platform Admin. Verified by automated cross-tenant access tests in CI (release-blocking)."

Three independent scoping axes, evaluated in this order:
1. **Tenant** — every grant except Platform Admin's is pinned to `actor.tenantId`. Platform Admin resolves to `'*'`, and it is the *only* role that ever does. A non-platform actor with a null tenantId must be denied outright, not defaulted.
2. **Estate** — the M legend says "within own tenant/estate", so M carries an estate restriction. **The PRD does not enumerate which roles are estate-scoped vs tenant-wide** — this is a genuine gap (see open issues). Proposed baseline: estate_manager, facility_manager, security and technician are estate-scoped (restricted to assigned estateIds); executive and platform_admin are tenant-wide/platform-wide (Exec's whole purpose per §5 is "Portfolio-level visibility"); resident is unit-scoped via `my_units`; vendor is scoped by `my_vendor_org` across whatever estates it was assigned into.
3. **Ownership** — the row-level predicate above.

These compose into a single `ScopeFilter { tenantId, estateIds, ownership }` that must be compiled into the data query, never applied after fetch. Post-fetch filtering violates §8.2 for search indexes and AI retrieval in particular, where the leak happens before any application filter runs (AI-S-06's hard requirement is "Zero cross-tenant retrieval in isolation tests").

Platform Admin's `'*'` tenant scope deserves a break-glass treatment: it is a cross-tenant read of another organisation's operational and resident data under NDPA (§12 Privacy & compliance). SC-10 already requires an immutable audit log of "auth events, permission changes, financial actions, security events and AI overrides" — cross-tenant reads should be added to that list, and the admin console should visibly badge which tenant context is active.

### Multi-role users: union semantics, not role ranking
*Requirements: SC-01*

§8.1 names the entity "User + Role(s)" — plural. The PRD never states how multiple roles combine, which is an open decision (see open issues), but the only defensible default is **union of decisions**:

- An action is allowed if **any** held role allows it for that capability.
- The resulting scope is the **widening union** of the scopes of the roles that allowed it: `'*'` beats a concrete tenantId; `'all'` estates beats a list; a null ownership clause (unrestricted) beats any clause list; otherwise concatenate estate ids and OR the ownership clauses.

Why not "highest level wins": because levels are not totally ordered (O grants verbs V does not — see the action algebra finding). Picking the single "highest" role would strip a user who is both Executive (V on bookings) and Resident (O on bookings) of the ability to book an amenity, since V outranks O on any naive ranking but cannot create.

The realistic combinations to design for are Exec + Investor (portfolio owner who also holds off-plan units — SC-08), EstM + Resident (a manager who lives on the estate), and FacM + EstM in small tenants. Note the consequence and surface it to the client: an Estate Manager who is also a Resident sees every resident's charges through the M grant; the O grant adds nothing. If the client wants a manager's *personal* bills separated from the ones they administer, that is a UI/context switch, not a permission difference.

### Deny-by-default enforcement architecture — where each layer sits
*Requirements: SC-01, SC-06, SC-07, SC-10, AI-S-06*

Five layers, each independently denying. SC-01 requires the server to be the enforcement point; the Next.js codebase supplies layers 1–2 and must never be the only thing standing between a user and data.

**Layer 0 — Type system (compile time).** `MATRIX: Record<Capability, Record<Role, Level>>` is exhaustive by construction: adding a role or capability without filling every cell is a TypeScript error. This is what makes "unspecified" impossible to mean "allowed". The runtime lookup still ends in `?? 'none'` for untyped input crossing the wire.

**Layer 1 — Navigation & affordances (cosmetic).** `visibleNav(actor)` filters sidebar entries; buttons are hidden at V, not disabled-with-tooltip (a disabled 'Issue invoice' button tells a Facility Manager that invoicing exists and they are excluded — the matrix says — meaning the capability should not be discoverable at all).

**Layer 2 — Route guard (Next.js).** `ROUTE_ACCESS` maps each pathname to `{capability, action}`; the layout/middleware denies before the page renders. Denial must be a generic not-found, not a 403 with a descriptive message, so route existence cannot be enumerated across tenants.

**Layer 3 — API (authoritative, SC-01).** Every handler calls `assertCan(actor, capability, action)` and compiles the returned `ScopeFilter` into the query. No handler may accept a `tenantId` or `estateId` from the request body — scope comes from the session-derived actor only. This is the layer the contract is written against.

**Layer 4 — Database (defence in depth, §8.2 / ADR-01, open question Q2).** Row-level security keyed on a session tenant variable, so a missed application filter still cannot cross tenants. §8.2 flags shared-DB-plus-RLS as *proposed*, pending Q2.

**Layer 5 — AI (release-blocking, §11.4).** "the assistant cannot be instructed by [user- or document-supplied content] to exceed the user's permissions (§7)". The copilot (AI-F-05, AI-S-01) and NL search (AI-S-02) must not have their own data path: retrieval filters and every drafted action must pass through the same `can()`/`ScopeFilter` as the UI, with the actor's identity, never a service identity. AI-S-06's hard benchmark is "Zero cross-tenant retrieval in isolation tests", and per-tenant vector namespaces (§8.2) are the retrieval-side expression of the same rule.

### Role surface — Platform Admin (Plat)
*Requirements: SC-06, SC-07, SC-10, SC-08*

Grants: tenant_config **F**, users_roles **F**, investor_projects **F**, reports_analytics **F**; assets/work orders/inspections/charges/announcements/bookings/security/marketplace **V**; payments **—**.

The defining shape: Platform Admin is a *cross-tenant read-only operator with full control of the platform's own objects*. It configures tenants and users and owns investor projects and reporting, but it cannot create a work order, issue an invoice or approve a booking in a client tenant. Build the console around that asymmetry.

**Should see** (SC-06: "platform admin console for tenant management, configuration and audit views"):
- Tenant list, tenant onboarding wizard, bulk estate/unit import, branding, payment settlement account, languages, enabled features (§8.2 tenant onboarding + per-tenant configuration).
- Global user & role administration across tenants.
- Investor project administration and the off-plan pipeline (SC-08).
- Platform-wide reporting and per-tenant usage metering for AI/SMS/email (§8.2 cost metering, SC-07).
- Audit log console (SC-10 "queryable from the admin console", 12-month retention proposed).
- AI feature flags, per-tenant usage caps and the per-feature kill-switch (§11.4 cost controls).
- A tenant-context switcher with a persistent, unmistakable indicator of which tenant is being viewed.

**Should NOT see**: any create/edit affordance on assets, PPM plans, work orders, inspections, charges, announcements, bookings, security or marketplace — those screens render in strict read-only mode. No in-app payment/checkout UI whatsoever (payments = —). Note the consequence for SC-02: **refund/void has no Platform Admin cell**; it falls under Charges & invoicing, where Plat is V — so only the Estate Manager (M) can refund. Flag at design.

Also note MFA: SC-01 and §12 Security require "MFA for admin roles" (marked proposed) — Platform Admin is unambiguously in scope.

### Role surface — Owner / Executive (Exec)
*Requirements: FM-07, AI-S-02, SC-08*

Grants: **V** on users_roles, assets_ppm, work_orders, inspections, charges_invoicing, announcements, bookings, security_sos, marketplace, investor_projects, reports_analytics. **—** on tenant_config and payments.

Exec is the only role that is *uniformly* read-only: no F, no M, no O, anywhere. §5 describes the need as "Portfolio-level visibility, reports and ROI", and FM-07's story is written from the Executive's point of view.

**Should see**: a portfolio dashboard across all estates in the tenant (FM-07: open/overdue WOs, PPM compliance %, downtime, cost by category/estate; filters by estate/date; CSV/PDF export), drill-down into any work order, invoice, booking, SOS event or marketplace order as a detail view, the investor project register (V), the announcement history with delivery/read statistics (EM-04), and NL search/reporting (AI-S-02, "every figure traceable to source records").

**Should NOT see**: every mutating control on every screen. No 'New work order', 'Issue invoice', 'Compose announcement', 'Approve booking', 'Acknowledge SOS', 'Onboard resident'. No tenant settings/configuration entry point at all (tenant_config = —). No in-app payment UI. Exec is the role most likely to be handed a build where buttons are merely disabled — hide them.

Design implication for the scaffold: Exec is the best fit for the existing KpiCard + chart + Table + FilterChip surface, and it is the cheapest role to ship first because it needs no mutation flows.

### Role surface — Estate Manager (EstM)
*Requirements: EM-01, EM-02, EM-03, EM-04, EM-05, EM-06, EM-09, FM-03, FM-07, SC-07*

Grants: **M** on users_roles, work_orders, charges_invoicing, announcements, bookings_amenities, security_sos, marketplace, reports_analytics (8 M cells — the most of any role). **V** on tenant_config, assets_ppm, inspections_compliance. **—** on payments and investor_projects.

EstM is the operational owner of Module 02 plus the work-order pipeline, but is deliberately *not* the owner of the asset/inspection spine — that is the Facility Manager's.

**Should see**: resident onboarding, move-in/move-out and household management (EM-02); the visitor pass register (EM-02); charge setup per unit type/size, recurring cycles, one-off levies, penalties/discounts, invoice generation, reconciliation, partial payments, receipts, arrears aging and accounting export (EM-01); the full work-order board with triage, assignment to technician or vendor, and reassignment (FM-03) — including AI triage suggestions requiring human confirmation (AI-F-02/AI-E-02); announcement composer with broadcast/targeted audiences and delivery stats, with AI drafting/translation always gated on manager approval (EM-04, AI-E-04); amenity setup and booking approvals (EM-05); the SOS/security console (EM-06); marketplace vendor and listing approval (EM-09); estate-scoped reports (FM-07); AI arrears intelligence with the hard constraint "no automated penalties ever" and manager approval on reminder campaigns (AI-E-03).

**Should NOT see**: any create/edit on assets or PPM plans (V only — the asset register and PPM calendar are read-only for EstM); any create/edit on inspections or inspection templates (V only); tenant configuration editing (V only — reads the config the Platform Admin set); investor projects at all (—); in-app payment/checkout (—).

This asymmetry is worth confirming with the client: an Estate Manager can dispatch a work order against an asset they cannot edit, and can read a compliance register they cannot run an inspection against.

### Role surface — Facility Manager (FacM)
*Requirements: FM-01, FM-02, FM-03, FM-04, FM-05, FM-06, FM-07, EM-04*

Grants: **M** on assets_ppm, work_orders, inspections_compliance, users_roles, announcements, reports_analytics. **—** on tenant_config, charges_invoicing, payments, bookings, security_sos, marketplace, investor_projects.

FacM owns Module 01 end to end and has **zero financial or community access**. Six of thirteen capabilities are hard-denied — the most denials of any staff role.

**Should see**: the asset register with CRUD, categories, serial/tag, location hierarchy, status, purchase/warranty dates, photos, documents, service history, archive and CSV bulk import (FM-01); PPM plan definition with frequency, checklist, assignee rules, lead time, the auto-generation scheduler, calendar view and overdue flags (FM-02); the full work-order lifecycle per §10 with per-priority SLA timers (FM-03); inspection templates, scheduled and ad-hoc runs, and the compliance register with expiry status (FM-06); the space hierarchy estate→building→floor→unit/zone (FM-04); vendor onboarding, documents with expiry alerts, job routing and performance metrics — jobs completed, SLA hit rate, rating (FM-05); FM-07 dashboards; the facility-manager copilot (AI-F-05) and predictive-maintenance draft schedules requiring FM approval (AI-F-01).

**Should NOT see**: charges, invoices, arrears, statements, reconciliation or any money screen (—). No amenity or booking management (—). No SOS/security console (—). No marketplace (—). No investor dashboard (—). No tenant settings (—).

Note the interesting inclusion: FacM holds **M on Announcements** (equal to EstM) — the composer is a shared surface, presumably for maintenance-window and outage notices. And FacM holds **M on Users & roles**, which is how technician and vendor accounts get provisioned.

FM-05's vendor management has no matrix row — see the gap register; it is proposed to inherit users_roles (vendor org records) + work_orders (assignment).

### Role surface — Technician (Tech)
*Requirements: FM-03, FM-06, FM-08, SC-05*

Grants: **V** on assets_ppm. **O** on work_orders (assigned_to_me) and inspections_compliance (assigned_to_me). **—** on all ten other capabilities, including announcements.

This is the narrowest staff role in the system, and FM-08 says the technician's job is a phone job: "As a Technician, I do my whole job from my phone, including in poor-connectivity areas." The web app is therefore a *fallback* surface for this role, not the primary one — mobile (SC-05) carries it.

**Should see**: 'My work orders' — assigned only, with the §10 state machine (New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed; branches Rejected, Cancelled), per-priority SLA countdown (Emergency respond 2h/resolve 24h; Routine 72h — proposed), photo/notes/parts/costs capture, and queued-write sync status per §12.1. 'My inspections' — assigned runs with pass/fail/severity checklist items and photo capture (FM-06). Read-only asset lookup and the PPM calendar (assets_ppm = V) so a technician can see an asset's service history while on a job.

**Should NOT see**: everything else. No user administration, no billing, no bookings, no security console, no marketplace, no reports, no investor dashboard, no tenant settings — and, per the matrix as written, **no announcements at all** (Tech = —), which I flag as a likely oversight (see open issues), since SC-09 delivers assignment and escalation notifications to technicians and EM-04 supports targeted audiences.

A technician must not be able to create a work order (FM-03's story is receive/update/close; work orders originate from EM-03, FM-02 and FM-06), nor see any work order not assigned to them — including other technicians' jobs on the same asset.

### Role surface — Resident (Res)
*Requirements: EM-01, EM-02, EM-03, EM-04, EM-05, EM-06, EM-07, EM-08, EM-09, SC-02, AI-E-01*

Grants: **O** on users_roles, work_orders, charges_invoicing, payments_in_app, bookings_amenities, security_sos, marketplace. **V** on announcements. **—** on tenant_config, assets_ppm, inspections_compliance, investor_projects, reports_analytics.

Resident is the only role with any payments grant in the entire matrix, and it is O.

**Should see** (a self-service portal, unit-scoped): own profile and household members with move-in/move-out state (EM-02); own maintenance requests — raise with category, description and photos, receive a ticket ID with visible status, get notified on each state change, and rate the resolution (EM-03); own charges, invoices, receipts, partial payments, arrears and unit statements (EM-01), with in-app payment by card, transfer or USSD (SC-02); visitor invites that generate time-bound codes/QR (EM-02); amenity availability calendar, booking, fee payment and cancellation per policy (EM-05); the SOS button and own SOS history (EM-06); marketplace browse/order/pay and own order history (EM-09); the announcements feed (V — read-only, no composer) with per-user channel preferences and quiet hours (SC-09); the resident support chatbot, which must refuse and escalate to an EM-03 ticket when it has no source (AI-E-01); documents shared to their audience (EM-08); the vendor/staff directory (EM-07).

**Should NOT see**: the asset register or PPM plans (—), inspections or the compliance register (—), any other resident's request, invoice, booking, order or SOS event (O), estate-wide reports or analytics (—), investor projects (—), tenant configuration (—), announcement authoring (V, not M), or amenity setup (bookings is O, not M — a resident books, never configures).

The `my_units` predicate is the subtle one: a household member's request or a co-resident's invoice on the *same unit* is in scope; the identical record on the neighbouring unit is not.

### Role surface — Security (Sec)
*Requirements: EM-02, EM-06, EM-04, EM-05, SC-10*

Grants: **M** on security_sos. **V** on announcements and bookings_amenities. **—** on all ten other capabilities, including work_orders and users_roles.

**Should see**: the SOS console — Raised → Acknowledged → Responding → Resolved → Reviewed per §10, with an acknowledge target under 60 seconds during manned hours (proposed), escalation to backup responders on unacknowledged alerts, and the full retained timeline (EM-06); patrol and incident logging, with all security events audit-logged (EM-06, SC-10); visitor pass verification at the gate — scan/verify the time-bound code or QR issued by a resident, with the visitor log retained per the NDPA retention policy (EM-02); the amenity booking calendar in read-only form (bookings = V — so security knows who is entitled to be at the pool/hall); the announcements feed (V).

**Should NOT see**: work orders (— — security cannot raise or view a maintenance job, see open issues), the resident register or any user administration (users_roles = —), any billing or payments screen (—), assets or inspections (—), marketplace (—), reports (—), investor (—), tenant settings (—).

One nuance: EM-02 places visitor management under "Residents & visitor management", but Security has **—** on users_roles, so the visitor pass verification surface must be modelled under the security_sos capability (where Sec holds M), not under users_roles. If visitor passes are implemented as a users_roles-scoped entity, Security will be locked out of the gate flow. That is a concrete implementation trap.

AI-E-06 (CCTV anomaly detection, face/plate recognition) would land in this role's surface, but it is Could/optional and gated on NDPA compliance, explicit consent and DPIA sign-off (Q5) — build nothing for it until Q5 is answered.

### Role surface — Vendor (Ven)
*Requirements: FM-05, FM-03, EM-09, SC-04*

Grants: **O** on users_roles (my_vendor_org), work_orders (my_vendor_org), marketplace (my_vendor_org). **—** on everything else — including **charges_invoicing**, which contradicts FM-05 (see open issues).

**Should see** (a vendor portal): own vendor organisation profile — services, coverage, insurance/certification documents with expiry alerts (FM-05); own org's users; assigned work orders only, with the ability to submit updates and move them through the §10 states (FM-03 "Assign to internal technician or vendor"); own performance metrics — jobs completed, SLA hit rate, rating (FM-05); own marketplace listings with create/edit, and the order lifecycle Placed → Accepted → Fulfilled → Closed with the auto-expiry-on-non-acceptance rule (EM-09, §10).

**Should NOT see**: the asset register (— — note a vendor working a job cannot see the asset record behind it, which will need a scoped exception or an explicit acceptance at design), inspections (—), any other vendor's jobs, listings or orders (O), the resident register (—), any estate billing or arrears data (—), bookings (—), security/SOS (—), announcements (— — a vendor cannot even read estate announcements), reports (—), investor (—).

**The FM-05 contradiction**: FM-05's acceptance criteria state "Vendors receive assignments and submit updates & invoices via the vendor portal", yet §7 gives Vendor **—** on Charges & invoicing. The reconciliation is almost certainly that *vendor invoices* (money the tenant owes the vendor, attached to a work order) are a different entity from *service charges/invoices* (money residents owe the tenant, EM-01) — the matrix row is the latter. Recommend modelling vendor invoice submission under the work_orders capability and adding an explicit row at design. Do not silently grant Ven access to the EM-01 invoice entity.

EM-09 payouts are blocked by open question Q3 (commission %, escrow, payout rails, KYC) — build listings and orders, not payouts.

### Role surface — Investor (Inv)
*Requirements: SC-08, AI-S-04, SC-11, FM-07*

Grants: **O** on users_roles (self) and investor_projects (my_projects). **V** on reports_analytics. **—** on all ten other capabilities.

**Should see**: the off-plan dashboard restricted to their own projects — sales pipeline, occupancy and returns (SC-08: "investors see only their projects"); AI forecasting, lead scoring and ROI projections, always labelled as estimates with assumptions shown and never presented as financial advice (AI-S-04); own profile; reports scoped to their projects.

**Should NOT see**: any facility or estate operational surface at all — no assets, work orders, inspections, charges, announcements, bookings, security, marketplace (all —). No other investor's projects (O). No tenant configuration (—). No in-app payments (—).

**The SC-08 tension**: §7 gives Inv **V** on Reports & analytics, which read literally is tenant-wide reporting visibility, while SC-08 states investors see only their projects. The V must be constrained by the `my_projects` ownership clause — i.e. an ownership predicate on a V cell. Treat the §7 V as "read-only" and SC-08 as the scope, not the other way round. Flagged as an open issue for explicit client confirmation, because the alternative reading (an investor sees portfolio-wide performance) is a material disclosure decision, not an engineering one.

SC-11's landing page with "lead capture into the investor pipeline (proposed)" feeds this role's project/lead entities but is a **public, unauthenticated** surface and must be outside the authz perimeter entirely.

### Capability gap register — PRD features with no row in the §7 matrix
*Requirements: FM-04, FM-05, EM-07, EM-08, SC-09, SC-10, AI-F-05, AI-S-01, AI-S-02, SC-11*

§7 covers 13 capabilities. At least eight buildable surfaces in the PRD map to none of them. Line 291 ("Fine-grained permissions per endpoint are finalised at design") licenses proposing a mapping, but each needs client sign-off — none of these are invented requirements; they are named features with no permission row.

| Feature | PRD ID | Proposed capability mapping | Note |
|---|---|---|---|
| Space management (estate→building→floor→unit/zone) | FM-04 | `assets_ppm` | FM-04 says the hierarchy is "maintained once, shared with the Estate module" — but assets_ppm gives EstM only V, so an Estate Manager could not create a unit. Likely wrong; needs its own row. |
| Vendor management (onboarding, documents, performance) | FM-05 | `users_roles` (vendor org records) + `work_orders` (routing) | Gives Plat F, Exec V, EstM M, FacM M, Ven O — which reads correctly. |
| Vendor / staff directory | EM-07 | `users_roles` at read | **Circular**: EM-07 says "visibility rules per role (§7)" but §7 has no directory row. As mapped, Res/Ven/Inv get O on users_roles — which would show them only themselves, defeating the directory. Needs an explicit row. |
| Document management | EM-08 | own ACL, layered under the owning capability | EM-08 already specifies "folder and permission control" — a **second, orthogonal permission system**. Rule: a document is visible only if BOTH the EM-08 folder ACL allows it AND the §7 capability behind its context allows it. Must not become a §7 bypass. |
| Notification channel preferences & quiet hours | SC-09 | self-service, `users_roles` at O for every authenticated role | Every role including Technician needs this, yet Tech has — on users_roles. Gap. |
| Audit log console | SC-10 | `tenant_config` (Plat F) | SC-10 says "queryable from the admin console", implying Platform Admin. Whether an Estate Manager can query their own tenant's audit log is unspecified — a real compliance question under NDPA. |
| Copilot / NL search & reporting | AI-F-05, AI-S-01, AI-S-02 | **inherits** — no independent grant | §11.4 is explicit: the assistant "cannot be instructed [by content] to exceed the user's permissions (§7)". The copilot must run every retrieval and every drafted action through the same `can()` with the user's actor. It needs no capability of its own and must never have a service identity. |
| Landing page + lead capture | SC-11 | public, outside the perimeter | Feeds `investor_projects` leads; must be unauthenticated and write-only into the pipeline. |

Separately, a **PRD cross-reference defect**: FM-01's acceptance criteria say "all changes audit-logged (SC-11)" (prd.txt line 404), but SC-11 is the Landing page — audit logging is **SC-10**. Worth correcting in the next PRD revision.

### Route → capability map and shell architecture for cargoflow-next
*Requirements: SC-06, SC-05, FM-08*

SC-06 requires two things from this codebase: "Responsive web app for residents/managers" and "platform admin console for tenant management, configuration and audit views". These are different information architectures, so use three Next.js route groups over the one existing AppShell rather than one nav filtered nine ways:

- **`(admin)`** — Platform Admin only. Tenant management, global users, investor projects, platform reports, usage metering, audit log, AI kill-switches.
- **`(ops)`** — Executive, Estate Manager, Facility Manager, Security, Technician. The manager/staff console; nav filtered by capability level.
- **`(portal)`** — Resident, Vendor, Investor. Self-service surfaces built entirely on O-level, pre-filtered lists.

Why split rather than filter: the O roles need a different IA ('My requests', not a work-order board), and route-group separation makes the route guard a boundary rather than a per-page concern. It also means an accidental nav leak in ops cannot expose an admin route.

The existing logistics routes map across cleanly — `/loads`→`/work-orders`, `/maintenance`→`/assets` + `/ppm`, `/carriers`→`/vendors`, `/customers`→`/residents`, `/staff`→`/people`, `/fuel`→`/billing`, `/settings` stays. Retire `/fuel` and `/carriers` naming entirely.

Route guard rule: a denied route returns the **not-found** page, not a 403 with an explanatory message. A descriptive 403 lets any authenticated user enumerate which capabilities and which tenants exist. Likewise, distinguish the two EmptyState copies carefully — 'Nothing here yet' for an empty in-scope list, and the generic not-found for denial. Never render 'You do not have permission to view these 47 invoices'.

### UI affordance rules per level — how the design system should behave
*Requirements: SC-06, FM-07, EM-04, AI-S-06*

A single rule table keeps nine roles consistent across every screen, and lets the existing primitives carry the load:

- **— (none)**: route not registered in the role's nav, guard returns not-found. No disabled states, no tooltips, no mention.
- **V (view)**: screen renders; **every** mutating affordance is removed from the DOM, not disabled. Tables render without row-action menus. Detail views render without edit. Export stays (FM-07). A persistent 'Read-only' chip in the page header is honest and prevents support tickets.
- **O (own)**: the list is pre-filtered server-side by the ownership clause; the UI never shows a 'show all' toggle, an estate/unit filter that could widen scope, or a total count that includes out-of-scope rows. Counts and KPI tiles must be computed under the same ScopeFilter — a KpiCard showing 'Open work orders: 312' to a Resident is a scope leak even if the list below it is filtered correctly.
- **M (manage)**: full CRUD plus approvals and state transitions, with the estate filter constrained to assigned estates — the FilterChip set must be built from `actor.estateIds`, not from all estates in the tenant.
- **F (full)**: adds configuration and destructive/administrative operations.

**Reusable as-is from the scaffold**: Card, KpiCard (FM-07 dashboards), StatusPill (all five §10 state machines), Button, FilterChip (FM-07 estate/date filters), Tabs (lifecycle buckets), Table (asset/WO/invoice/resident registers), Avatar (assignee), Mono (ticket IDs per EM-03, invoice numbers, asset serial/tags), EmptyState.

**StatusPill needs five variant sets**, one per §10 machine: Work order (9 states + Rejected/Cancelled), Service charge (Draft/Issued/Partially paid/Paid/Overdue/In arrears/Escalated), Booking (Requested/Approved/Auto-approved/Confirmed/Completed/Declined/Cancelled), SOS (Raised/Acknowledged/Responding/Resolved/Reviewed), Marketplace order (Placed/Accepted/Fulfilled/Closed/Declined/Refunded).

**Primitives the scaffold lacks and this domain requires**: NGN currency formatting (EM-01/SC-02), SLA countdown/overdue timer (FM-03, §10), photo/evidence uploader (FM-03, FM-06, EM-03), calendar (FM-02 PPM, EM-05 availability), QR scan/verify (EM-02 visitor passes), charts (FM-07), offline sync-status indicator (§12.1), and — mandated by §11.4 — an AI surface primitive that always exposes loading, confidence, sources and error states, with review/approve/override on every suggestion. That last one is release-blocking, not decorative.

### Testing obligations — what CI must prove about §7
*Requirements: SC-01, SC-07, AI-S-06*

§8.2 and SC-07 make cross-tenant access tests **release-blocking** in CI, and AI-S-06 sets a hard requirement of "Zero cross-tenant retrieval in isolation tests". The §7 matrix should be tested with the same seriousness:

1. **Golden snapshot of the matrix.** A test asserts the 117 cells byte-for-byte against §7. Any change fails CI and therefore requires a Change Request — which is exactly the PRD's governance model (§19, Clause 10).
2. **Exhaustiveness.** Assert 13 capabilities × 9 roles with no undefined cell, and that `levelFor` on an unknown role or capability returns `'none'`.
3. **Negative matrix sweep.** For every `—` cell, assert that all 8 actions are denied — 9 roles × 13 capabilities × 8 actions is a cheap exhaustive sweep that catches an accidentally widened override.
4. **Narrowing-only invariant.** Assert every entry in the per-cell override table is a subset of its level's default action set. This structurally prevents an override from becoming a privilege escalation.
5. **Empty-ownership safety.** Assert that an actor with zero units / no vendor org / no projects gets a denial, never an unfiltered query — and that no compiled filter is ever emitted with an empty `OR` array.
6. **Cross-tenant.** For each non-Platform role, assert every capability×action against a foreign tenantId is denied, and that only `platform_admin` ever resolves `tenantId: '*'`.
7. **Copilot parity.** Assert the AI retrieval path produces an identical ScopeFilter to the UI path for the same actor and capability (§11.4 prompt-injection defence), including a test where injected document content instructs the assistant to widen scope.
8. **Estate scoping.** Assert an EstM/FacM assigned to estate A cannot read estate B within the same tenant.

§12 Maintainability sets unit-test coverage ≥ 70% on core domains; the authz module should sit at or near 100% — it is 13×9 table-driven and cheap to cover exhaustively.

## Code-ready artifacts

### src/lib/authz/matrix.ts (`typescript`)

```typescript
/**
 * PRD v2.0 §7 — Roles & permissions matrix (page 3), transcribed verbatim and
 * verified cell-by-cell against the source document (13 capabilities × 9 roles).
 *
 * "Server-side, deny-by-default enforcement on every API (SC-01)."
 * "Fine-grained permissions per endpoint are finalised at design; this matrix
 *  is the authoritative baseline."
 *
 * DO NOT edit this table without a Change Request (PRD §19, Clause 10).
 * A golden-snapshot test guards it in CI.
 */

export const ROLES = [
  'platform_admin',   // Plat — Platform Admin (7 Fifteen Capital HQ)
  'executive',        // Exec — Owner / Executive
  'estate_manager',   // EstM
  'facility_manager', // FacM
  'technician',       // Tech
  'resident',         // Res
  'security',         // Sec
  'vendor',           // Ven
  'investor',         // Inv
] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'tenant_config',          // Tenant onboarding & config  — SC-07, §8.2
  'users_roles',            // Users & roles               — SC-01, EM-02, FM-05
  'assets_ppm',             // Assets & PPM plans          — FM-01, FM-02
  'work_orders',            // Work orders                 — FM-03, EM-03
  'inspections_compliance', // Inspections & compliance    — FM-06
  'charges_invoicing',      // Charges & invoicing         — EM-01
  'payments_in_app',        // Payments (pay in-app)       — SC-02
  'announcements',          // Announcements               — EM-04
  'bookings_amenities',     // Bookings & amenities        — EM-05
  'security_sos',           // Security & SOS              — EM-06, EM-02
  'marketplace',            // Marketplace                 — EM-09, SC-04
  'investor_projects',      // Investor projects           — SC-08
  'reports_analytics',      // Reports & analytics         — FM-07, AI-S-02
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * §7 legend:
 *   F    full control
 *   M    manage (create/edit within own tenant/estate)
 *   V    view
 *   O    own records only
 *   none —  no access
 *
 * NOTE: these are NOT totally ordered. `O` grants mutations that `V` does not
 * (a Resident pays an invoice; an Executive cannot). Never rank them.
 */
export type Level = 'F' | 'M' | 'V' | 'O' | 'none';

type Row = Readonly<Record<Role, Level>>;

/**
 * Exhaustive by construction: `Record<Capability, Record<Role, Level>>` makes a
 * missing cell a TypeScript error, so "unspecified" can never mean "allowed".
 * This is the compile-time half of SC-01's deny-by-default.
 */
export const MATRIX: Readonly<Record<Capability, Row>> = {
  //                        Plat    Exec    EstM    FacM    Tech    Res     Sec     Ven     Inv
  tenant_config:          { platform_admin: 'F',    executive: 'none', estate_manager: 'V',    facility_manager: 'none', technician: 'none', resident: 'none', security: 'none', vendor: 'none', investor: 'none' },
  users_roles:            { platform_admin: 'F',    executive: 'V',    estate_manager: 'M',    facility_manager: 'M',    technician: 'none', resident: 'O',    security: 'none', vendor: 'O',    investor: 'O'    },
  assets_ppm:             { platform_admin: 'V',    executive: 'V',    estate_manager: 'V',    facility_manager: 'M',    technician: 'V',    resident: 'none', security: 'none', vendor: 'none', investor: 'none' },
  work_orders:            { platform_admin: 'V',    executive: 'V',    estate_manager: 'M',    facility_manager: 'M',    technician: 'O',    resident: 'O',    security: 'none', vendor: 'O',    investor: 'none' },
  inspections_compliance: { platform_admin: 'V',    executive: 'V',    estate_manager: 'V',    facility_manager: 'M',    technician: 'O',    resident: 'none', security: 'none', vendor: 'none', investor: 'none' },
  charges_invoicing:      { platform_admin: 'V',    executive: 'V',    estate_manager: 'M',    facility_manager: 'none', technician: 'none', resident: 'O',    security: 'none', vendor: 'none', investor: 'none' },
  payments_in_app:        { platform_admin: 'none', executive: 'none', estate_manager: 'none', facility_manager: 'none', technician: 'none', resident: 'O',    security: 'none', vendor: 'none', investor: 'none' },
  announcements:          { platform_admin: 'V',    executive: 'V',    estate_manager: 'M',    facility_manager: 'M',    technician: 'none', resident: 'V',    security: 'V',    vendor: 'none', investor: 'none' },
  bookings_amenities:     { platform_admin: 'V',    executive: 'V',    estate_manager: 'M',    facility_manager: 'none', technician: 'none', resident: 'O',    security: 'V',    vendor: 'none', investor: 'none' },
  security_sos:           { platform_admin: 'V',    executive: 'V',    estate_manager: 'M',    facility_manager: 'none', technician: 'none', resident: 'O',    security: 'M',    vendor: 'none', investor: 'none' },
  marketplace:            { platform_admin: 'V',    executive: 'V',    estate_manager: 'M',    facility_manager: 'none', technician: 'none', resident: 'O',    security: 'none', vendor: 'O',    investor: 'none' },
  investor_projects:      { platform_admin: 'F',    executive: 'V',    estate_manager: 'none', facility_manager: 'none', technician: 'none', resident: 'none', security: 'none', vendor: 'none', investor: 'O'    },
  reports_analytics:      { platform_admin: 'F',    executive: 'V',    estate_manager: 'M',    facility_manager: 'M',    technician: 'none', resident: 'none', security: 'none', vendor: 'none', investor: 'V'    },
} as const;

/** Human-readable labels for the admin console's permission viewer. */
export const CAPABILITY_LABELS: Readonly<Record<Capability, string>> = {
  tenant_config: 'Tenant onboarding & config',
  users_roles: 'Users & roles',
  assets_ppm: 'Assets & PPM plans',
  work_orders: 'Work orders',
  inspections_compliance: 'Inspections & compliance',
  charges_invoicing: 'Charges & invoicing',
  payments_in_app: 'Payments (pay in-app)',
  announcements: 'Announcements',
  bookings_amenities: 'Bookings & amenities',
  security_sos: 'Security & SOS',
  marketplace: 'Marketplace',
  investor_projects: 'Investor projects',
  reports_analytics: 'Reports & analytics',
};

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  platform_admin: 'Platform Admin',
  executive: 'Owner / Executive',
  estate_manager: 'Estate Manager',
  facility_manager: 'Facility Manager',
  technician: 'Technician',
  resident: 'Resident',
  security: 'Security',
  vendor: 'Vendor',
  investor: 'Investor',
};

/** Deny-by-default lookup. `?? 'none'` guards untyped input crossing the wire. */
export function levelFor(role: Role, capability: Capability): Level {
  return MATRIX[capability]?.[role] ?? 'none';
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value);
}

```

### src/lib/authz/policy.ts (`typescript`)

```typescript
/**
 * Action algebra + ownership predicates.
 *
 * The §7 legend gives levels, not verbs. This file turns a level into a verb
 * set, and turns "O" into the specific row-level predicate each cell means.
 *
 * Per-cell entries are PROPOSED under PRD §7: "Fine-grained permissions per
 * endpoint are finalised at design; this matrix is the authoritative baseline."
 * Every entry cites the requirement it derives from. Overrides NARROW only —
 * enforced at runtime by intersection, and asserted in CI.
 */

import { type Capability, type Level, type Role, levelFor } from './matrix';

export const ACTIONS = [
  'read',
  'export',      // FM-07: "export CSV/PDF; role-scoped visibility per §7"
  'create',
  'update',
  'archive',     // FM-01: "Archive (no hard delete)" — there is no `delete`
  'approve',
  'transition',  // drive a §10 state machine
  'configure',
] as const;
export type Action = (typeof ACTIONS)[number];

/** Default verb set per level, derived from the §7 legend wording. */
const LEVEL_ACTIONS: Readonly<Record<Level, readonly Action[]>> = {
  // full control
  F: ['read', 'export', 'create', 'update', 'archive', 'approve', 'transition', 'configure'],
  // "manage (create/edit within own tenant/estate)" — notably NOT `configure`,
  // which is Platform Admin's tenant setup (SC-07, §8.2).
  M: ['read', 'export', 'create', 'update', 'archive', 'approve', 'transition'],
  // view
  V: ['read', 'export'],
  // own records only — same verbs, every one row-filtered. NOT a weaker V.
  O: ['read', 'export', 'create', 'update', 'archive', 'transition'],
  none: [],
};

type Cell = `${Role}:${Capability}`;

/** PROPOSED per-cell narrowing. Subset of the cell's level actions, always. */
const CELL_ACTIONS: Partial<Record<Cell, readonly Action[]>> = {
  // FM-03: "receive, update and close". WOs originate from EM-03 requests,
  // the FM-02 scheduler and FM-06 failed items — never from a technician.
  'technician:work_orders': ['read', 'update', 'transition'],
  // FM-06: runs a scheduled inspection. Ad-hoc run creation = open issue.
  'technician:inspections_compliance': ['read', 'update', 'transition'],
  // FM-05: "Vendors receive assignments and submit updates & invoices".
  'vendor:work_orders': ['read', 'update', 'transition'],
  // EM-03: raise + photos + rate. Not the §10 state machine.
  'resident:work_orders': ['read', 'create', 'update'],
  // EM-01: "Statements per unit/resident" — read, not invoice authoring.
  'resident:charges_invoicing': ['read', 'export'],
  // SC-02: initiate + receipt. Payments are webhook-confirmed and idempotent,
  // therefore never client-editable.
  'resident:payments_in_app': ['read', 'create'],
  // EM-06 SOS raise + EM-02 visitor pass issue. Acknowledge/respond is Sec 'M'.
  'resident:security_sos': ['read', 'create'],
  // EM-05: book + cancel per policy.
  'resident:bookings_amenities': ['read', 'create', 'archive'],
  // EM-09: order + cancel. Listings are vendor-side.
  'resident:marketplace': ['read', 'create', 'archive'],
  // EM-02: own profile + household members.
  'resident:users_roles': ['read', 'create', 'update'],
  // FM-05: vendor profile, services, coverage, insurance/cert documents.
  'vendor:users_roles': ['read', 'update'],
  // EM-09: listings + Placed→Accepted→Fulfilled→Closed.
  'vendor:marketplace': ['read', 'create', 'update', 'archive', 'transition'],
  'investor:users_roles': ['read', 'update'],
  // SC-08: "investors see only their projects" — read-only.
  'investor:investor_projects': ['read', 'export'],
  'investor:reports_analytics': ['read', 'export'],
  // §7 gives EstM 'V' on tenant config: reads amenity rules / charge structures
  // / branding that Platform Admin set (SC-07). Cannot change them.
  'estate_manager:tenant_config': ['read'],
};

/** Verbs a role may perform on a capability. Intersection => narrowing only. */
export function actionsFor(role: Role, capability: Capability): readonly Action[] {
  const base = LEVEL_ACTIONS[levelFor(role, capability)] ?? [];
  const override = CELL_ACTIONS[`${role}:${capability}` as Cell];
  return override ? override.filter((a) => base.includes(a)) : base;
}

/* ------------------------------------------------------------------ */
/* Ownership — what "O" actually means, per cell                       */
/* ------------------------------------------------------------------ */

export type OwnershipKey =
  | 'self'             // record.userId === actor.userId
  | 'requested_by_me'  // record.requesterUserId === actor.userId
  | 'assigned_to_me'   // record.assigneeUserId === actor.userId
  | 'my_units'         // record.unitId ∈ actor.unitIds  (household)
  | 'my_vendor_org'    // record.vendorOrgId === actor.vendorOrgId
  | 'my_projects';     // record.projectId ∈ actor.investorProjectIds

/**
 * OR semantics within a cell.
 *
 * Ownership is NOT exclusive to level 'O': `investor:reports_analytics` is 'V'
 * in §7 but SC-08 constrains investors to their own projects, so the V cell
 * carries a clause too.
 */
export const OWNERSHIP: Partial<Record<Cell, readonly OwnershipKey[]>> = {
  'resident:users_roles': ['self', 'my_units'],                 // EM-02 household members
  'vendor:users_roles': ['my_vendor_org'],                      // FM-05
  'investor:users_roles': ['self'],
  'technician:work_orders': ['assigned_to_me'],                 // FM-03
  'resident:work_orders': ['requested_by_me', 'my_units'],      // EM-03
  'vendor:work_orders': ['my_vendor_org'],                      // FM-03 / FM-05
  'technician:inspections_compliance': ['assigned_to_me'],      // FM-06
  'resident:charges_invoicing': ['my_units', 'self'],           // EM-01 statements
  'resident:payments_in_app': ['self'],                         // SC-02
  'resident:bookings_amenities': ['self'],                      // EM-05
  'resident:security_sos': ['self', 'my_units'],                // EM-06 / EM-02
  'resident:marketplace': ['self'],                             // EM-09
  'vendor:marketplace': ['my_vendor_org'],                      // EM-09
  'investor:investor_projects': ['my_projects'],                // SC-08
  'investor:reports_analytics': ['my_projects'],                // SC-08 narrows the §7 'V'
};

export function ownershipKeysFor(role: Role, capability: Capability): readonly OwnershipKey[] | null {
  return OWNERSHIP[`${role}:${capability}` as Cell] ?? null;
}

/**
 * Estate scoping. §8.1: roles are "scoped to tenant (and estate where
 * relevant)" — the PRD does NOT enumerate which. PROPOSED baseline, confirm
 * at discovery (see open issues).
 */
export const ESTATE_SCOPED_ROLES: ReadonlySet<Role> = new Set<Role>([
  'estate_manager',
  'facility_manager',
  'security',
  'technician',
]);

```

### src/lib/authz/can.ts (`typescript`)

```typescript
/**
 * The decision engine. Deny-by-default (SC-01) with hard tenant isolation
 * (§8.2: "no query, file, search index, AI retrieval or report may cross
 * tenants below Platform Admin").
 *
 * `can()` returns not just a boolean but the ScopeFilter that MUST be compiled
 * into the query. Filtering after fetch is a §8.2 violation.
 */

import { CAPABILITIES, ROLES, type Capability, type Level, type Role, levelFor } from './matrix';
import {
  ESTATE_SCOPED_ROLES,
  actionsFor,
  ownershipKeysFor,
  type Action,
  type OwnershipKey,
} from './policy';

/** Session-derived. NEVER built from request body/query params. */
export type Actor = {
  userId: string;
  /** null is legal only for platform_admin. */
  tenantId: string | null;
  /** §8.1 "User + Role(s)" — plural. */
  roles: readonly Role[];
  /** Estates this user is assigned to (EstM/FacM/Sec/Tech). */
  estateIds: readonly string[];
  /** true for tenant-wide roles (Executive). */
  allEstates: boolean;
  /** Units linked to a resident, incl. household (EM-02). */
  unitIds: readonly string[];
  vendorOrgId: string | null;
  investorProjectIds: readonly string[];
};

export type OwnershipClause =
  | { key: 'self'; userId: string }
  | { key: 'requested_by_me'; userId: string }
  | { key: 'assigned_to_me'; userId: string }
  | { key: 'my_units'; unitIds: readonly string[] }
  | { key: 'my_vendor_org'; vendorOrgId: string }
  | { key: 'my_projects'; projectIds: readonly string[] };

export type ScopeFilter = {
  /** '*' ONLY for platform_admin (§8.2). */
  tenantId: string | '*';
  estateIds: readonly string[] | 'all';
  /** null = no row-level restriction. Non-null = OR of clauses. */
  ownership: readonly OwnershipClause[] | null;
};

export type DenyReason =
  | 'unknown_capability'
  | 'unknown_action'
  | 'no_grant'
  | 'no_tenant_context'
  | 'unsatisfiable_ownership';

export type Decision =
  | { allowed: false; reason: DenyReason }
  | { allowed: true; level: Level; scope: ScopeFilter };

const deny = (reason: DenyReason): Decision => ({ allowed: false, reason });

/** Build the concrete clause for an ownership key, or null if unsatisfiable. */
function clauseFor(key: OwnershipKey, actor: Actor): OwnershipClause | null {
  switch (key) {
    case 'self':
      return { key, userId: actor.userId };
    case 'requested_by_me':
      return { key, userId: actor.userId };
    case 'assigned_to_me':
      return { key, userId: actor.userId };
    case 'my_units':
      // An empty unit list is UNSATISFIABLE, not unrestricted. Emitting an
      // empty filter here is how an O cell silently becomes an F cell.
      return actor.unitIds.length ? { key, unitIds: actor.unitIds } : null;
    case 'my_vendor_org':
      return actor.vendorOrgId ? { key, vendorOrgId: actor.vendorOrgId } : null;
    case 'my_projects':
      return actor.investorProjectIds.length ? { key, projectIds: actor.investorProjectIds } : null;
  }
}

/** Scope contributed by one role. null = this role contributes no grant. */
function scopeForRole(actor: Actor, role: Role, capability: Capability): ScopeFilter | null {
  if (role === 'platform_admin') {
    // The single cross-tenant role (§8.2). Log every such read under SC-10.
    return { tenantId: '*', estateIds: 'all', ownership: null };
  }
  if (!actor.tenantId) return null;

  const estateIds: readonly string[] | 'all' =
    ESTATE_SCOPED_ROLES.has(role) && !actor.allEstates ? actor.estateIds : 'all';

  const keys = ownershipKeysFor(role, capability);
  if (!keys) return { tenantId: actor.tenantId, estateIds, ownership: null };

  const clauses = keys.map((k) => clauseFor(k, actor)).filter((c): c is OwnershipClause => c !== null);
  if (clauses.length === 0) return null; // unsatisfiable => no grant, never "all"

  return { tenantId: actor.tenantId, estateIds, ownership: clauses };
}

/** Union of two grants — the widening rule for multi-role users. */
function widen(a: ScopeFilter, b: ScopeFilter): ScopeFilter {
  return {
    tenantId: a.tenantId === '*' || b.tenantId === '*' ? '*' : a.tenantId,
    estateIds:
      a.estateIds === 'all' || b.estateIds === 'all'
        ? 'all'
        : Array.from(new Set([...a.estateIds, ...b.estateIds])),
    // null (unrestricted) absorbs any clause list.
    ownership: a.ownership === null || b.ownership === null ? null : [...a.ownership, ...b.ownership],
  };
}

const LEVEL_DISPLAY_RANK: Record<Level, number> = { F: 4, M: 3, V: 2, O: 1, none: 0 };

/**
 * Deny-by-default. Every early return is a denial; the only path to `allowed`
 * is an explicit matrix grant plus a satisfiable scope.
 *
 * Multi-role semantics are UNION, not ranking — see the design notes. `level`
 * on the result is for UI display only (which affordances to render); never
 * branch on it for authorisation.
 */
export function can(actor: Actor, capability: Capability, action: Action): Decision {
  if (!(CAPABILITIES as readonly string[]).includes(capability)) return deny('unknown_capability');

  let result: Decision = deny('no_grant');

  for (const role of actor.roles) {
    if (!(ROLES as readonly string[]).includes(role)) continue;       // unknown role => ignored
    if (!actionsFor(role, capability).includes(action)) continue;      // not granted by §7
    const scope = scopeForRole(actor, role, capability);
    if (!scope) continue;                                              // no tenant / unsatisfiable

    const level = levelFor(role, capability);
    result = result.allowed
      ? {
          allowed: true,
          level: LEVEL_DISPLAY_RANK[level] > LEVEL_DISPLAY_RANK[result.level] ? level : result.level,
          scope: widen(result.scope, scope),
        }
      : { allowed: true, level, scope };
  }

  if (!result.allowed && !actor.tenantId && !actor.roles.includes('platform_admin')) {
    return deny('no_tenant_context');
  }
  return result;
}

export class ForbiddenError extends Error {
  constructor(
    readonly capability: Capability,
    readonly action: Action,
    readonly reason: DenyReason,
  ) {
    // Deliberately opaque. A descriptive message lets any authenticated user
    // enumerate capabilities and tenants.
    super('Not found');
    this.name = 'ForbiddenError';
  }
}

/** Throwing form for API handlers and server actions. Returns the ScopeFilter. */
export function assertCan(actor: Actor, capability: Capability, action: Action): ScopeFilter {
  const decision = can(actor, capability, action);
  if (!decision.allowed) throw new ForbiddenError(capability, action, decision.reason);
  return decision.scope;
}

/** Highest level held on a capability — for UI affordance shaping ONLY. */
export function effectiveLevel(actor: Actor, capability: Capability): Level {
  let best: Level = 'none';
  for (const role of actor.roles) {
    if (!(ROLES as readonly string[]).includes(role)) continue;
    const level = levelFor(role, capability);
    if (LEVEL_DISPLAY_RANK[level] > LEVEL_DISPLAY_RANK[best]) best = level;
  }
  return best;
}

/** Cross-tenant guard for any record loaded by id (§8.2). */
export function assertSameTenant(scope: ScopeFilter, recordTenantId: string): void {
  if (scope.tenantId === '*') return;
  if (scope.tenantId !== recordTenantId) throw new Error('Not found');
}

/* ------------------------------------------------------------------ */
/* Compiling a ScopeFilter into a query                                */
/* ------------------------------------------------------------------ */

const OWNERSHIP_COLUMN: Record<OwnershipKey, string> = {
  self: 'ownerUserId',
  requested_by_me: 'requesterUserId',
  assigned_to_me: 'assigneeUserId',
  my_units: 'unitId',
  my_vendor_org: 'vendorOrgId',
  my_projects: 'projectId',
};

function clauseToWhere(c: OwnershipClause): Record<string, unknown> {
  switch (c.key) {
    case 'self':
    case 'requested_by_me':
    case 'assigned_to_me':
      return { [OWNERSHIP_COLUMN[c.key]]: c.userId };
    case 'my_units':
      return { unitId: { in: c.unitIds } };
    case 'my_vendor_org':
      return { vendorOrgId: c.vendorOrgId };
    case 'my_projects':
      return { projectId: { in: c.projectIds } };
  }
}

/**
 * Prisma-shaped `where`. Never emits an empty `OR` — in Prisma `OR: []` means
 * MATCH EVERYTHING, which would turn an O grant into an F grant.
 */
export function toWhere(scope: ScopeFilter): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (scope.tenantId !== '*') where.tenantId = scope.tenantId;
  if (scope.estateIds !== 'all') where.estateId = { in: scope.estateIds };
  if (scope.ownership) {
    if (scope.ownership.length === 0) throw new Error('empty ownership clause — refusing to build filter');
    where.OR = scope.ownership.map(clauseToWhere);
  }
  return where;
}

```

### src/config/nav.ts (`typescript`)

```typescript
/**
 * Role-aware navigation, replacing the logistics template's Overview /
 * Operations / Admin grouping.
 *
 * SC-06 asks for two distinct products in one codebase: a "responsive web app
 * for residents/managers" and a "platform admin console". Three Next.js route
 * groups keep those information architectures apart:
 *
 *   (admin)  → platform_admin
 *   (ops)    → executive, estate_manager, facility_manager, security, technician
 *   (portal) → resident, vendor, investor          (all O-level, pre-filtered)
 *
 * Visibility here is COSMETIC. SC-01 puts enforcement on the server; the route
 * guard and API repeat every check.
 */

import {
  Banknote,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Gauge,
  LayoutGrid,
  Megaphone,
  Package,
  PieChart,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UsersRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Capability, Level, Role } from '@/lib/authz/matrix';
import { type Actor, effectiveLevel } from '@/lib/authz/can';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  /** §7 capability gating this entry. */
  capability: Capability;
  /** Levels at which the entry appears. Omit = any level above 'none'. */
  levels?: readonly Level[];
  /** true where §7 has no row and the mapping is a design proposal. */
  proposed?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

/* ---------------- (admin) — Platform Admin console (SC-06, SC-07) --------- */

export const adminNavGroups: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      { id: 'tenants', label: 'Tenants', href: '/admin/tenants', icon: Building2, capability: 'tenant_config' },
      { id: 'admin-users', label: 'Users & roles', href: '/admin/users', icon: UsersRound, capability: 'users_roles' },
      // SC-10 "queryable from the admin console" — no §7 row of its own.
      { id: 'audit', label: 'Audit log', href: '/admin/audit', icon: ScrollText, capability: 'tenant_config', proposed: true },
      // §8.2 cost metering + §11.4 caps and per-feature kill-switch.
      { id: 'ai-controls', label: 'AI & usage', href: '/admin/ai', icon: Sparkles, capability: 'tenant_config', proposed: true },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      { id: 'admin-investors', label: 'Investor projects', href: '/admin/investors', icon: TrendingUp, capability: 'investor_projects' },
      { id: 'admin-reports', label: 'Reports', href: '/admin/reports', icon: PieChart, capability: 'reports_analytics' },
    ],
  },
];

/* ---------------- (ops) — managers, security, technicians ---------------- */

export const opsNavGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/', icon: Gauge, capability: 'reports_analytics', levels: ['F', 'M', 'V'] },
      // AI-F-05 / AI-S-01: inherits the user's §7 permissions, never its own.
      { id: 'copilot', label: 'Copilot', href: '/copilot', icon: Sparkles, capability: 'reports_analytics', levels: ['F', 'M', 'V'], proposed: true },
    ],
  },
  {
    label: 'Facility',
    items: [
      { id: 'assets', label: 'Assets', href: '/assets', icon: Package, capability: 'assets_ppm' },              // FM-01
      { id: 'ppm', label: 'PPM plans', href: '/ppm', icon: CalendarCheck, capability: 'assets_ppm' },           // FM-02
      { id: 'work-orders', label: 'Work orders', href: '/work-orders', icon: Wrench, capability: 'work_orders' }, // FM-03
      { id: 'inspections', label: 'Inspections', href: '/inspections', icon: ClipboardCheck, capability: 'inspections_compliance' }, // FM-06
      // FM-04 / FM-05 have no §7 row — proposed mappings, confirm at design.
      { id: 'spaces', label: 'Spaces', href: '/spaces', icon: LayoutGrid, capability: 'assets_ppm', proposed: true },
      { id: 'vendors', label: 'Vendors', href: '/vendors', icon: Building2, capability: 'users_roles', levels: ['F', 'M', 'V'], proposed: true },
    ],
  },
  {
    label: 'Estate',
    items: [
      { id: 'people', label: 'People', href: '/people', icon: UsersRound, capability: 'users_roles', levels: ['F', 'M', 'V'] }, // EM-02
      { id: 'billing', label: 'Billing', href: '/billing', icon: Banknote, capability: 'charges_invoicing', levels: ['F', 'M', 'V'] }, // EM-01
      { id: 'bookings', label: 'Bookings', href: '/bookings', icon: CalendarCheck, capability: 'bookings_amenities', levels: ['F', 'M', 'V'] }, // EM-05
      { id: 'security', label: 'Security & SOS', href: '/security', icon: ShieldAlert, capability: 'security_sos', levels: ['F', 'M', 'V'] }, // EM-06
      { id: 'marketplace', label: 'Marketplace', href: '/marketplace', icon: ShoppingBag, capability: 'marketplace', levels: ['F', 'M', 'V'] }, // EM-09
      { id: 'announcements', label: 'Announcements', href: '/announcements', icon: Megaphone, capability: 'announcements' }, // EM-04
      // EM-08 carries its own folder ACL on top of §7.
      { id: 'documents', label: 'Documents', href: '/documents', icon: FileText, capability: 'announcements', proposed: true },
    ],
  },
  {
    label: 'Insight',
    items: [
      { id: 'reports', label: 'Reports', href: '/reports', icon: PieChart, capability: 'reports_analytics' }, // FM-07
      { id: 'investors', label: 'Investor projects', href: '/investors', icon: TrendingUp, capability: 'investor_projects' }, // SC-08
      { id: 'settings', label: 'Settings', href: '/settings', icon: Settings, capability: 'tenant_config' },
    ],
  },
];

/* ---------------- (portal) — resident / vendor / investor ---------------- */

export const portalNavGroups: NavGroup[] = [
  {
    label: 'Home',
    items: [
      { id: 'p-home', label: 'Home', href: '/portal', icon: Gauge, capability: 'users_roles' },
      { id: 'p-announcements', label: 'Announcements', href: '/portal/announcements', icon: Megaphone, capability: 'announcements' }, // Res V
    ],
  },
  {
    label: 'My estate',
    items: [
      { id: 'p-requests', label: 'My requests', href: '/portal/requests', icon: Wrench, capability: 'work_orders' },        // EM-03 / FM-05
      { id: 'p-bills', label: 'Bills & payments', href: '/portal/bills', icon: Banknote, capability: 'charges_invoicing' }, // EM-01 / SC-02
      { id: 'p-bookings', label: 'Bookings', href: '/portal/bookings', icon: CalendarCheck, capability: 'bookings_amenities' }, // EM-05
      { id: 'p-visitors', label: 'Visitors & SOS', href: '/portal/security', icon: ShieldAlert, capability: 'security_sos' },   // EM-02 / EM-06
      { id: 'p-marketplace', label: 'Marketplace', href: '/portal/marketplace', icon: ShoppingBag, capability: 'marketplace' }, // EM-09
    ],
  },
  {
    label: 'My portfolio',
    items: [
      { id: 'p-projects', label: 'My projects', href: '/portal/projects', icon: TrendingUp, capability: 'investor_projects' }, // SC-08
      { id: 'p-reports', label: 'Performance', href: '/portal/reports', icon: PieChart, capability: 'reports_analytics' },
    ],
  },
];

/* ---------------- shell selection + filtering ---------------------------- */

export type Shell = 'admin' | 'ops' | 'portal';

const PORTAL_ROLES: ReadonlySet<Role> = new Set<Role>(['resident', 'vendor', 'investor']);

/** A user holding both an ops and a portal role lands in ops (union semantics). */
export function shellFor(actor: Actor): Shell {
  if (actor.roles.includes('platform_admin')) return 'admin';
  if (actor.roles.some((r) => !PORTAL_ROLES.has(r))) return 'ops';
  return 'portal';
}

export function homeRouteFor(actor: Actor): string {
  const shell = shellFor(actor);
  if (shell === 'admin') return '/admin/tenants';
  if (shell === 'portal') return '/portal';
  return '/';
}

function visible(actor: Actor, item: NavItem): boolean {
  const level = effectiveLevel(actor, item.capability);
  if (level === 'none') return false;
  return item.levels ? item.levels.includes(level) : true;
}

/** Drops empty groups so a role never sees an orphan section header. */
export function visibleNav(actor: Actor): NavGroup[] {
  const shell = shellFor(actor);
  const source =
    shell === 'admin' ? adminNavGroups : shell === 'portal' ? portalNavGroups : opsNavGroups;
  return source
    .map((group) => ({ ...group, items: group.items.filter((item) => visible(actor, item)) }))
    .filter((group) => group.items.length > 0);
}

```

### src/lib/authz/routes.ts (`typescript`)

```typescript
/**
 * Route guard. Layer 2 of 5 — cosmetic relative to the API (SC-01), but it is
 * what stops a page from rendering data it then has to redact.
 *
 * A denied route yields NOT-FOUND, never a descriptive 403: a 403 that names
 * the capability lets any authenticated user enumerate the system.
 */

import { notFound } from 'next/navigation';
import type { Capability } from './matrix';
import type { Action } from './policy';
import { type Actor, can } from './can';

type RouteRule = { capability: Capability; action: Action };

/** Longest-prefix match; every route must be listed or it is denied. */
export const ROUTE_ACCESS: Readonly<Record<string, RouteRule>> = {
  // (admin)
  '/admin/tenants': { capability: 'tenant_config', action: 'configure' },
  '/admin/users': { capability: 'users_roles', action: 'configure' },
  '/admin/audit': { capability: 'tenant_config', action: 'configure' },      // SC-10, proposed
  '/admin/ai': { capability: 'tenant_config', action: 'configure' },         // §11.4, proposed
  '/admin/investors': { capability: 'investor_projects', action: 'read' },   // SC-08
  '/admin/reports': { capability: 'reports_analytics', action: 'read' },

  // (ops)
  '/': { capability: 'reports_analytics', action: 'read' },
  '/copilot': { capability: 'reports_analytics', action: 'read' },           // AI-F-05 / AI-S-01
  '/assets': { capability: 'assets_ppm', action: 'read' },                   // FM-01
  '/ppm': { capability: 'assets_ppm', action: 'read' },                      // FM-02
  '/spaces': { capability: 'assets_ppm', action: 'read' },                   // FM-04, proposed
  '/work-orders': { capability: 'work_orders', action: 'read' },             // FM-03
  '/inspections': { capability: 'inspections_compliance', action: 'read' },  // FM-06
  '/vendors': { capability: 'users_roles', action: 'read' },                 // FM-05, proposed
  '/people': { capability: 'users_roles', action: 'read' },                  // EM-02
  '/billing': { capability: 'charges_invoicing', action: 'read' },           // EM-01
  '/bookings': { capability: 'bookings_amenities', action: 'read' },         // EM-05
  '/security': { capability: 'security_sos', action: 'read' },               // EM-06
  '/marketplace': { capability: 'marketplace', action: 'read' },             // EM-09
  '/announcements': { capability: 'announcements', action: 'read' },         // EM-04
  '/documents': { capability: 'announcements', action: 'read' },             // EM-08, proposed
  '/reports': { capability: 'reports_analytics', action: 'read' },           // FM-07
  '/investors': { capability: 'investor_projects', action: 'read' },         // SC-08
  '/settings': { capability: 'tenant_config', action: 'read' },

  // (portal) — all O-level, server-filtered
  '/portal': { capability: 'users_roles', action: 'read' },
  '/portal/announcements': { capability: 'announcements', action: 'read' },
  '/portal/requests': { capability: 'work_orders', action: 'read' },
  '/portal/bills': { capability: 'charges_invoicing', action: 'read' },
  '/portal/bookings': { capability: 'bookings_amenities', action: 'read' },
  '/portal/security': { capability: 'security_sos', action: 'read' },
  '/portal/marketplace': { capability: 'marketplace', action: 'read' },
  '/portal/projects': { capability: 'investor_projects', action: 'read' },
  '/portal/reports': { capability: 'reports_analytics', action: 'read' },
};

function ruleFor(pathname: string): RouteRule | null {
  let match: { key: string; rule: RouteRule } | null = null;
  for (const [key, rule] of Object.entries(ROUTE_ACCESS)) {
    const hit = pathname === key || pathname.startsWith(`${key}/`);
    if (hit && (!match || key.length > match.key.length)) match = { key, rule };
  }
  return match?.rule ?? null;
}

/** Unlisted route => denied. Deny-by-default at the routing layer too. */
export function canEnter(actor: Actor, pathname: string): boolean {
  const rule = ruleFor(pathname);
  if (!rule) return false;
  return can(actor, rule.capability, rule.action).allowed;
}

/** Call at the top of every protected layout/page (server component). */
export function guardRoute(actor: Actor, pathname: string): void {
  if (!canEnter(actor, pathname)) notFound();
}

```

### src/lib/authz/__tests__/matrix.spec.ts (`typescript`)

```typescript
/**
 * §7 conformance suite.
 *
 * §8.2 and SC-07 make cross-tenant tests release-blocking in CI; AI-S-06 sets
 * "Zero cross-tenant retrieval in isolation tests" as a hard requirement. The
 * permission matrix deserves the same treatment: it is 13×9 and table-driven,
 * so exhaustive coverage is cheap. §12 sets ≥70% coverage on core domains —
 * this module should be at 100%.
 */

import { describe, expect, it } from 'vitest';
import { CAPABILITIES, MATRIX, ROLES, levelFor, type Capability, type Level, type Role } from '../matrix';
import { ACTIONS, actionsFor, type Action } from '../policy';
import { type Actor, can, toWhere } from '../can';

/** Golden snapshot of PRD v2.0 §7. Changing it requires a Change Request. */
const GOLDEN: Record<Capability, Record<Role, Level>> = MATRIX as never;

const actorOf = (over: Partial<Actor> = {}): Actor => ({
  userId: 'u1',
  tenantId: 't1',
  roles: [],
  estateIds: [],
  allEstates: false,
  unitIds: [],
  vendorOrgId: null,
  investorProjectIds: [],
  ...over,
});

describe('§7 matrix integrity', () => {
  it('is exactly 13 capabilities × 9 roles with no undefined cell', () => {
    expect(CAPABILITIES).toHaveLength(13);
    expect(ROLES).toHaveLength(9);
    for (const c of CAPABILITIES) for (const r of ROLES) expect(GOLDEN[c][r]).toBeDefined();
  });

  it('matches the §7 golden snapshot', () => {
    expect(MATRIX).toMatchSnapshot('prd-v2.0-section-7');
  });

  it('denies unknown roles and capabilities', () => {
    expect(levelFor('ghost' as Role, 'work_orders')).toBe('none');
    expect(levelFor('resident', 'ghost' as Capability)).toBe('none');
  });

  it('grants F only to Platform Admin', () => {
    for (const c of CAPABILITIES)
      for (const r of ROLES)
        if (GOLDEN[c][r] === 'F') expect(r).toBe('platform_admin');
  });

  it('gives Executive no write level anywhere (11× V, 2× none)', () => {
    const levels = CAPABILITIES.map((c) => GOLDEN[c].executive);
    expect(levels.filter((l) => l === 'V')).toHaveLength(11);
    expect(levels.filter((l) => l === 'none')).toHaveLength(2);
    expect(levels).not.toContain('F');
    expect(levels).not.toContain('M');
    expect(levels).not.toContain('O');
  });

  it('grants payments (pay in-app) to Resident and nobody else', () => {
    for (const r of ROLES)
      expect(GOLDEN.payments_in_app[r]).toBe(r === 'resident' ? 'O' : 'none');
  });
});

describe('deny-by-default (SC-01)', () => {
  it('denies every action on every "—" cell', () => {
    for (const c of CAPABILITIES)
      for (const r of ROLES)
        if (GOLDEN[c][r] === 'none')
          for (const a of ACTIONS)
            expect(can(actorOf({ roles: [r] }), c, a).allowed).toBe(false);
  });

  it('never lets a per-cell override widen its level', () => {
    for (const c of CAPABILITIES)
      for (const r of ROLES) {
        const granted = actionsFor(r, c);
        if (GOLDEN[c][r] === 'V')
          expect(granted.every((a) => a === 'read' || a === 'export')).toBe(true);
        if (GOLDEN[c][r] === 'none') expect(granted).toHaveLength(0);
        if (GOLDEN[c][r] !== 'F') expect(granted).not.toContain('configure');
      }
  });

  it('denies an actor with no tenant context unless Platform Admin', () => {
    expect(can(actorOf({ roles: ['estate_manager'], tenantId: null }), 'work_orders', 'read').allowed).toBe(false);
    expect(can(actorOf({ roles: ['platform_admin'], tenantId: null }), 'work_orders', 'read').allowed).toBe(true);
  });
});

describe('tenant isolation (§8.2, SC-07)', () => {
  it("scopes every non-platform role to the actor's tenant", () => {
    for (const r of ROLES) {
      if (r === 'platform_admin') continue;
      for (const c of CAPABILITIES) {
        const d = can(actorOf({ roles: [r], unitIds: ['un1'], vendorOrgId: 'v1', investorProjectIds: ['p1'] }), c, 'read');
        if (d.allowed) expect(d.scope.tenantId).toBe('t1');
      }
    }
  });

  it("resolves '*' only for Platform Admin", () => {
    const d = can(actorOf({ roles: ['platform_admin'] }), 'work_orders', 'read');
    expect(d.allowed && d.scope.tenantId).toBe('*');
  });
});

describe('"O" ownership scoping', () => {
  it('filters a technician to assigned work orders only (FM-03)', () => {
    const d = can(actorOf({ roles: ['technician'] }), 'work_orders', 'read');
    expect(d.allowed && d.scope.ownership).toEqual([{ key: 'assigned_to_me', userId: 'u1' }]);
  });

  it('includes household units for a resident (EM-02, EM-03)', () => {
    const d = can(actorOf({ roles: ['resident'], unitIds: ['un1', 'un2'] }), 'work_orders', 'read');
    expect(d.allowed && d.scope.ownership).toEqual([
      { key: 'requested_by_me', userId: 'u1' },
      { key: 'my_units', unitIds: ['un1', 'un2'] },
    ]);
  });

  it('narrows the investor reports "V" to own projects (SC-08)', () => {
    const d = can(actorOf({ roles: ['investor'], investorProjectIds: ['p1'] }), 'reports_analytics', 'read');
    expect(d.allowed && d.scope.ownership).toEqual([{ key: 'my_projects', projectIds: ['p1'] }]);
  });

  it('DENIES rather than unfilters when ownership is unsatisfiable', () => {
    // Vendor with no org, resident with no units: must be a denial, never a
    // filterless query. This is how an O cell silently becomes an F cell.
    expect(can(actorOf({ roles: ['vendor'], vendorOrgId: null }), 'work_orders', 'read').allowed).toBe(false);
    expect(can(actorOf({ roles: ['investor'], investorProjectIds: [] }), 'investor_projects', 'read').allowed).toBe(false);
  });

  it('refuses to compile an empty OR (Prisma: empty OR matches everything)', () => {
    expect(() => toWhere({ tenantId: 't1', estateIds: 'all', ownership: [] })).toThrow();
  });
});

describe('estate scoping (§8.1)', () => {
  it('restricts an estate-scoped manager to assigned estates', () => {
    const d = can(actorOf({ roles: ['estate_manager'], estateIds: ['e1'] }), 'work_orders', 'read');
    expect(d.allowed && d.scope.estateIds).toEqual(['e1']);
  });

  it('gives the Executive tenant-wide reach (portfolio visibility, FM-07)', () => {
    const d = can(actorOf({ roles: ['executive'] }), 'work_orders', 'read');
    expect(d.allowed && d.scope.estateIds).toBe('all');
  });
});

describe('multi-role users (§8.1 "User + Role(s)")', () => {
  it('unions grants — Exec+Investor reads reports tenant-wide, unrestricted', () => {
    const d = can(actorOf({ roles: ['executive', 'investor'], investorProjectIds: ['p1'] }), 'reports_analytics', 'read');
    expect(d.allowed && d.scope.ownership).toBeNull();
  });

  it('keeps O-only verbs when combined with a V role (EstM+Resident pays)', () => {
    const a: Action = 'create';
    expect(can(actorOf({ roles: ['executive', 'resident'], unitIds: ['un1'] }), 'payments_in_app', a).allowed).toBe(true);
  });
});

```

## Open issues
- CONTRADICTION — Vendor invoices: §7 gives Ven '—' on Charges & invoicing, but FM-05 requires "Vendors receive assignments and submit updates & invoices via the vendor portal". Most likely resolution: vendor invoices (payable) are a different entity from EM-01 service-charge invoices (receivable), and the matrix row covers only the latter. Needs an explicit row or an explicit statement that vendor invoice submission lives under the work_orders capability. Do not silently grant Ven access to the EM-01 invoice entity.
- CONTRADICTION — Investor reporting scope: §7 gives Inv 'V' on Reports & analytics (tenant-wide read on a plain reading), while SC-08 states "investors see only their projects". I have implemented V + a my_projects ownership clause. This is a material disclosure decision for the client, not an engineering one — confirm explicitly.
- LIKELY OVERSIGHT — Technician announcements: Tech is '—' on Announcements, so a technician cannot even read estate/facility announcements. Yet SC-09 delivers assignment and escalation notifications to technicians and EM-04 supports targeted audiences. Confirm whether Tech should be 'V'.
- GAP — Security cannot see work orders: Sec is '—' on Work orders, but EM-06 requires "Patrol and incident logging". Confirm whether a security incident can raise a work order (as FM-06 failed inspection items do), and if so which capability authorises it.
- GAP — Six named PRD features have no matrix row: FM-04 space management, FM-05 vendor management, EM-07 vendor/staff directory, EM-08 document management, SC-09 notification channel preferences & quiet hours, SC-10 audit log console. EM-07 is circular: it says "visibility rules per role (§7)" but §7 has no directory row, and mapping it to users_roles gives Res/Ven/Inv 'O', which would show them only themselves and defeat the directory entirely.
- GAP — FM-04 space management mapped to assets_ppm gives Estate Manager only 'V', meaning an Estate Manager could not create a unit — yet FM-04 says the hierarchy is "maintained once, shared with the Estate module" and §8.2 puts bulk unit import in tenant onboarding. Space management probably needs its own row.
- GAP — Refunds and voids (SC-02) have no cell. They fall under Charges & invoicing, where Platform Admin is 'V' and only Estate Manager holds 'M'. Confirm that Estate Manager is the sole role able to refund, and that Platform Admin genuinely cannot.
- UNSPECIFIED — Estate scoping: §8.1 says roles are "scoped to tenant (and estate where relevant)" but never enumerates which roles are estate-scoped vs tenant-wide. I proposed EstM/FacM/Sec/Tech estate-scoped, Exec tenant-wide, Res unit-scoped, Ven vendor-org-scoped. Needs confirmation — it changes what every manager sees.
- UNSPECIFIED — Multi-role combination semantics: §8.1 says "User + Role(s)" (plural) but the PRD never states how grants combine. I implemented union-of-decisions with scope widening. The visible consequence: an Estate Manager who also lives on the estate sees every resident's data through the M grant, with no separation of their own bills. Confirm.
- UNSPECIFIED — "MFA for admin roles" (SC-01, §12 Security) is marked (proposed) and never defines which of the nine roles count as admin. Proposed: platform_admin, executive, estate_manager, facility_manager.
- UNSPECIFIED — Whether an Estate Manager can query their own tenant's audit log. SC-10 says the log is "queryable from the admin console", implying Platform Admin only, which is a real NDPA/compliance question for tenants who need their own accountability trail.
- UNSPECIFIED — EM-08 document permissions are a second, orthogonal permission system ("folder and permission control") layered over §7. The composition rule must be explicit: a document is visible only if BOTH the folder ACL AND the §7 capability behind its context allow it. Left implicit, EM-08 becomes a §7 bypass.
- PRD DEFECT — Cross-reference error: FM-01's acceptance criteria cite "all changes audit-logged (SC-11)" (prd.txt line 404), but SC-11 is the Landing page. Audit logging is SC-10. Correct in the next revision.
- DEPENDENCY — Q1 ("Who exactly is a tenant — estates operated by 7 Fifteen Capital, or third-party operators too?") directly shapes how sensitive Platform Admin's cross-tenant 'V' reads are. If tenants are third-party operators, cross-tenant reads of resident PII need break-glass treatment, explicit audit under SC-10, and an NDPA basis (§12).
- DEPENDENCY — Q2 (ADR-01: shared DB + row-level security vs schema-per-tenant) determines whether layer 4 of the enforcement stack exists at all. Until answered, the application layer is the only tenant boundary.
- DEPENDENCY — Q3 (marketplace commission, escrow, payout rails, KYC) blocks the EM-09 payout surfaces for Vendor. Build listings and orders; do not build payout screens.
- DEPENDENCY — Q5 (NDPA consent framework + DPIA for AI-E-06 CCTV/face/plate recognition) gates the entire AI security surface in the Security role. Build nothing for it until sign-off.
