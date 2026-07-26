# Information Architecture — web app + admin dashboard (SC-06)

## Summary
The scaffold's single flat sidebar cannot serve nine roles whose §7 permissions differ not just in degree but in kind: four roles (Resident, Vendor, Investor, plus Technician on work orders) are "O — own records only" personas whose screens are singular ("my invoice") rather than collectional ("all invoices"), and Platform Admin's primary object is the Tenant, not the work order. I recommend six authenticated shells behind explicit URL prefixes — /app (Executive, Estate Manager, Facility Manager, Technician), /admin (Platform Admin), /resident, /vendor, /investor, /gate (Security) — plus two unauthenticated route groups, (marketing) for SC-11 and (auth). Because every shell owns a distinct URL segment, they are plain folders with their own layout.tsx, not parenthesised route groups; parens are reserved for (marketing)/(auth), which share chrome without sharing a prefix, and for code-organisation groups (facility)/(estate) inside /app. A single root layout.tsx keeps fonts, theme tokens and ThemeProvider single-sourced, so cross-shell navigation stays client-side — the documented full-reload penalty only applies to multiple root layouts. The map is ~175 route files; Executive/Estate Manager/Facility Manager/Technician deliberately share one route space with nav filtered and write-actions suppressed by §7 access level (V vs M vs O), which is the single biggest route-count saving available. Three Next.js 16 constraints shape the design: tenant cannot live in a root dynamic segment (unstable_rootParams removed), the auth gate belongs in proxy.ts not middleware.ts, and any @copilot parallel slot requires an explicit default.tsx or the build fails.

### Headline recommendation: six authenticated shells, not one — and the reasoning
*Requirements: SC-06, SC-01, SC-08, EM-06, FM-08, FM-07, SC-07, SC-10*

RECOMMENDATION: split into six authenticated shells (/app, /admin, /resident, /vendor, /investor, /gate) plus (marketing) and (auth). Do NOT put residents, vendors and investors under the manager shell.

The case for splitting, strongest argument first:

1. PERMISSION SHAPE, NOT PERMISSION COUNT. §7 gives Resident 'O' on users_roles, work_orders, charges_invoicing, payments, bookings_amenities, security_sos and marketplace; Vendor 'O' on users_roles, work_orders and marketplace; Investor 'O' on investor_projects and users_roles. 'O — own records only' is not a filtered version of 'M'. A manager screen is list → filter → bulk-select → detail; an O-persona screen is a feed plus a handful of tasks, and often has no list at all (a resident has one open balance, not a payments register). Sharing a shell forces every list route to branch on 'am I own-scope?', and that branch is more code than a second layout.tsx.

2. EXTERNAL TRUST BOUNDARY. §8.1 defines Vendor as an external contractor ORGANISATION ('vendor links user → vendor org') — a vendor user is not a member of the tenant's staff. SC-08 requires 'investors see only their projects'. §8.2 makes cross-tenant isolation release-blocking with automated CI tests. A distinct URL prefix turns the gate into a one-line prefix check in proxy.ts and makes the isolation test suite trivially expressible per prefix ('no /vendor/* response may contain another vendor_org_id'). Nav-level filtering inside one shell gives you no such structural seam.

3. DENSITY AND DEVICE ARE CHROME-LEVEL, NOT PAGE-LEVEL. EM-06 targets SOS acknowledgement <60s during manned hours — that is a wall-mounted gatehouse screen with a permanent live SOS banner, not a collapsible 248px sidebar. FM-08 says the Technician 'does my whole job from my phone'. §14 tracks 'Resident app adoption'. FM-07's Executive wants a wide portfolio dashboard. Sidebar-vs-bottom-tabs, 13px dense tables vs 44px touch targets, collapsible vs pinned — all of that lives in layout.tsx.

4. PLATFORM ADMIN HAS A DIFFERENT ENTITY VOCABULARY. §7 gives Plat 'F' on only four rows (tenant_config, users_roles, investor_projects, reports_analytics) and 'V' on all eight operational rows. Their object graph is Tenant → config → usage → audit (SC-07, SC-10, §8.2, §11.4), not Estate → work order. A tenant-scoped sidebar is meaningless to them, and an estate scope switcher is actively wrong.

5. THE NEXT.JS COST IS NEAR ZERO. Shells are folders with a layout.tsx. Keeping ONE root app/layout.tsx (html, Inter Tight + JetBrains Mono, themeInitScript, ThemeProvider) means these are nested layouts, not multiple root layouts — so the documented 'full page load when navigating between different root layouts' caveat never fires, and a manager who is also a resident crosses /app → /resident client-side.

WHERE NOT TO SPLIT: Executive, Estate Manager, Facility Manager and Technician all stay in /app. They share entity vocabulary (work orders, assets, spaces, invoices), share URL space, and differ only by which nav items render and whether write affordances are suppressed. Splitting them would roughly triple the route count for no gain and would break the everyday 'the FM is covering for the EM this week' case.

THE ONE GENUINELY ARGUABLE SPLIT is /gate. Security has only three §7 rows (security_sos M, announcements V, bookings_amenities V) and could live in /app with a 6-item nav. I still recommend /gate because the gatehouse device profile and the always-on SOS banner justify separate chrome — but if the team needs to economise, this is the split to collapse, at the cost of a slower gate UI against EM-06's <60s target.

### URL prefix strategy: plain folders, parens only where they earn it
*Requirements: SC-06, SC-09, SC-11, EM-02*

Every authenticated shell owns a distinct URL segment, so route-group parentheses are NOT needed for them — a plain folder with its own layout.tsx does the job. Reserve parens for the two cases where they are load-bearing:

(a) (marketing) and (auth) — these share chrome without sharing a URL prefix. (marketing)/page.tsx → '/', (marketing)/legal/privacy → '/legal/privacy', (auth)/login → '/login'. Two groups rather than one (public) because a landing page (SC-11) and a centred auth card are different chrome.

(b) (facility) and (estate) inside /app — pure code organisation, matching the docs' 'organizing routes by team, concern, or feature'. app/(facility)/assets/page.tsx → /app/assets. This gives the two module teams clean ownership boundaries without polluting URLs. Watch the documented conflicting-paths caveat: (facility) and (estate) must never both claim the same path — assign /app/documents to (estate) only, /app/compliance to (facility) only.

Final prefixes: '/' + /legal/* + /login|/invite|/reset-password (public) · /app (ops) · /admin · /resident · /vendor · /investor · /gate · /verify/[passCode] (public QR target, root-level).

WHY EXPLICIT PREFIXES RATHER THAN BARE ROUTE GROUPS: SC-09 sends deep links over push, SMS (Termii) and email. A resident tapping an SMS link must land deterministically in the resident shell; a bare-group URL like /invoices/123 is ambiguous when the recipient holds two roles. Prefixes also make the proxy.ts gate a cheap string comparison and make 'which hat am I wearing' explicit and switchable rather than magic.

### Tenant and estate scoping must stay OUT of the URL as root params — a hard Next.js 16 constraint
*Requirements: SC-07, SC-01, FM-04, FM-07*

Do not model tenancy as app/[tenant]/... . Next.js 16 REMOVED unstable_rootParams (confirmed in node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md: 'The unstable_rootParams function has been removed. We are working on an alternative API that we will ship in an upcoming minor release.'). That was the API for reading a root dynamic segment from layouts and server code. Without it, a root [tenant] segment means threading an awaited params promise through every layout and page in ~175 routes.

RECOMMENDED MODEL:
- Tenant is SESSION-DERIVED. proxy.ts resolves the tenant from the session (and later, optionally, from a subdomain for §8.2 per-tenant branding) and forwards it as a request header. No URL segment.
- Platform Admin crosses tenants explicitly through the entity path /admin/tenants/[tenantId]/... — which is a normal nested dynamic segment, not a root param, and reads naturally because the Tenant genuinely IS their primary object.
- Estate/facility scope is a HEADER SCOPE SWITCHER in OpsShell writing to a cookie, with ?estate= as the deep-link override. §7 scopes managers 'within own tenant/estate' and FM-07 requires 'filters by estate/date' — a filter, not a route dimension. Making it a path segment would double every ops route.
- /app/settings/estates and /app/spaces/[spaceId] still exist as ENTITY routes (FM-04 estate→building→floor→unit/zone). The scope switcher and the estate entity page are different things and both are needed.

Q1 ('who exactly is a tenant') is unresolved and is the one open question that could reopen this: if third-party operators become tenants with their own branded domains, add subdomain resolution in proxy.ts. That is a proxy change only — no route churn. A /t/[slug] path prefix would be route churn, which is precisely why it is the wrong default.

### Route map — (marketing), (auth) and the public visitor-pass target
*Requirements: SC-11, SC-01, EM-02, FM-05, AI-S-04*

src/app/
  layout.tsx                              root only: <html lang>, Inter Tight + JetBrains Mono, themeInitScript, ThemeProvider. NO AppShell — remove it from here.
  not-found.tsx · error.tsx · globals.css

  (marketing)/layout.tsx                  MarketingShell — public header/footer, no auth, no sidebar
    page.tsx                              '/' landing                                    SC-11
    register-interest/page.tsx            lead capture → investor pipeline (proposed)    SC-11, AI-S-04
    legal/privacy/page.tsx                NDPA privacy notice                            §12
    legal/terms/page.tsx
    legal/data-request/page.tsx           NDPA data-subject request intake               §12

  (auth)/layout.tsx                       AuthShell — centred card, brand mark
    login/page.tsx                        session + password policy                      SC-01
    login/mfa/page.tsx                    MFA challenge for admin roles (proposed)       SC-01, §12 Security
    forgot-password/page.tsx              SC-01
    reset-password/[token]/page.tsx       SC-01
    invite/[token]/page.tsx               resident invite EM-02 · vendor invite FM-05 · staff SC-01
    switch/page.tsx                       multi-role context chooser, post-login         SC-01
    no-access/page.tsx                    403 landing — see the forbidden.tsx note below

  verify/[passCode]/page.tsx              root-level public QR target for a visitor pass EM-02

SCREEN NOTES.
- '/' (SC-11): hero, two-module positioning (§6.1), lead-capture form writing into the investor pipeline. This is the only route the design system's marketing-weight typography is used on.
- /invite/[token]: one route, three audiences. The token resolves to the role and determines the post-accept redirect (resident → /resident, vendor → /vendor, staff → /app). Household members (EM-02) accept through the same route.
- /verify/[passCode] is deliberately PUBLIC and deliberately THIN: it renders only enough to confirm a pass exists and is in-window. The actual check-in ACTION requires an authenticated Security user and deep-links to /gate/visitors/verify/[passCode]. Putting the action on the public route would let anyone with a QR photo burn a pass, and EM-02 requires the visitor log to be attributable.
- /switch exists because a single person can hold Estate Manager on one estate and Resident of a unit. It lists the user's roles and routes to the matching shell prefix.

### Route map — /app (facility) — Facility Management module
*Requirements: FM-01, FM-02, FM-03, FM-04, FM-05, FM-06, FM-07, AI-F-01, AI-F-02, AI-F-03, AI-F-04, AI-F-05, AI-S-01, AI-S-03, SC-09, SC-10, EM-03*

app/layout.tsx                            OpsShell (see chrome spec below)
app/page.tsx                              role-adaptive dashboard          FM-07, EM-01, AI-F-04
app/copilot/page.tsx                      full-page copilot                AI-F-05, AI-S-01
app/insights/page.tsx                     anomaly cards + drill-down       AI-F-04
app/notifications/page.tsx                notification inbox               SC-09

app/(facility)/
  assets/page.tsx                         register; filters, status, location  FM-01
  assets/new/page.tsx                     FM-01
  assets/import/page.tsx                  CSV template bulk import             FM-01
  assets/[assetId]/page.tsx               identity, location, warranty, photos FM-01
  assets/[assetId]/history/page.tsx       service history: linked WOs + inspections  FM-01, FM-03, FM-06
  assets/[assetId]/ppm/page.tsx           plans attached to this asset         FM-02
  assets/[assetId]/documents/page.tsx     asset docs + extracted fields        FM-01, AI-S-03

  ppm/page.tsx                            plan list                            FM-02
  ppm/new/page.tsx                        frequency, checklist, assignee rules, lead time  FM-02
  ppm/[planId]/page.tsx                   FM-02
  ppm/calendar/page.tsx                   calendar view, overdue flagged       FM-02
  ppm/forecast/page.tsx                   ranked failure-risk list + suggested PPM dates as DRAFT entries; FM approves before any schedule change; shadow-mode banner until data volume sufficient  AI-F-01

  work-orders/page.tsx                    list; filter by the ten §10 states; per-priority SLA timers  FM-03, §10
  work-orders/board/page.tsx              kanban by state                      FM-03, §10
  work-orders/triage/page.tsx             suggested category/priority/assignee + confidence; confirm or override; overrides logged for tuning; falls back to a manual triage queue  AI-F-02, AI-E-02
  work-orders/new/page.tsx                FM-03
  work-orders/[woId]/page.tsx             detail: state actions, assign to internal technician or vendor, photos, notes, parts  FM-03, FM-05
  work-orders/[woId]/costs/page.tsx       parts and costs                      FM-03
  work-orders/[woId]/activity/page.tsx    timestamped, actor-attributed transition trail  FM-03, SC-10, §10

  inspections/page.tsx                    scheduled + ad-hoc runs              FM-06
  inspections/templates/page.tsx          FM-06
  inspections/templates/[templateId]/page.tsx  checklist items, pass/fail/severity  FM-06
  inspections/[runId]/page.tsx            run detail; detected defects with severity and an auto-drafted report the inspector edits and approves  FM-06, AI-F-03

  compliance/page.tsx                     register: status and expiry per obligation, plus vendor insurance/certification expiry alerts  FM-06, FM-05

  vendors/page.tsx                        list with jobs completed, SLA hit rate, rating  FM-05
  vendors/invite/page.tsx                 onboarding invite                    FM-05
  vendors/[vendorId]/page.tsx             profile: services, coverage          FM-05
  vendors/[vendorId]/documents/page.tsx   insurance/certifications + expiry    FM-05, AI-S-03
  vendors/[vendorId]/invoices/page.tsx    invoices submitted via the vendor portal  FM-05
  vendors/[vendorId]/performance/page.tsx FM-05

  spaces/page.tsx                         estate→building→floor→unit/zone tree, occupancy/allocation  FM-04
  spaces/import/page.tsx                  bulk import                          FM-04, §8.2
  spaces/[spaceId]/page.tsx               links to assets, bookings, residents FM-04

NOTE ON /app/requests vs /app/work-orders: EM-03 says resident requests 'feed the shared work-order pipeline (FM-03) with estate routing'. Keep /app/requests (under (estate)) as the resident-facing intake queue with its own columns (requester, unit, rating), and have it link INTO /app/work-orders/[woId] once triaged. One pipeline, two entry views — do not duplicate the work-order detail screen.

### Route map — /app (estate) — Estate Management module
*Requirements: EM-01, EM-02, EM-03, EM-04, EM-05, EM-06, EM-07, EM-08, EM-09, SC-02, SC-04, SC-09, SC-10, AI-E-03, AI-E-04, AI-E-05, AI-E-06, AI-S-03, FM-03*

app/(estate)/
  billing/page.tsx                        issued vs collected vs arrears; collection-rate KPI  EM-01, §14
  billing/charges/page.tsx                charge setup per unit type/size: recurring cycles, one-off levies, penalties/discounts  EM-01
  billing/charges/[chargeId]/page.tsx     EM-01
  billing/invoices/page.tsx               register filtered by §10 states       EM-01, §10
  billing/invoices/[invoiceId]/page.tsx   detail, partial payments, receipts    EM-01, SC-02
  billing/payments/page.tsx               gateway transactions, webhook state, idempotency, refund/void  SC-02
  billing/reconciliation/page.tsx         per-tenant reconciliation report; source-of-truth toggle pending Q10  SC-02
  billing/arrears/page.tsx                arrears aging + anomaly flags and defaulter-risk scores  EM-01, AI-E-03
  billing/reminders/page.tsx              reminder campaigns on the −3d/due/+7d/+21d schedule with AI timing suggestions; manager approves every campaign; NO automated penalties, ever  AI-E-03, SC-09, §10
  billing/statements/page.tsx             statements per unit/resident          EM-01
  billing/exports/page.tsx                accounting export                     EM-01

  residents/page.tsx                      EM-02
  residents/invite/page.tsx               invite + profile linked to unit(s)    EM-02
  residents/movements/page.tsx            move-in / move-out queue              EM-02
  residents/[residentId]/page.tsx         profile, units, household members     EM-02

  requests/page.tsx                       resident request intake queue         EM-03
  requests/[requestId]/page.tsx           ticket, status, rating; links to the WO  EM-03, FM-03

  announcements/page.tsx                  EM-04
  announcements/new/page.tsx              compose; broadcast or targeted by estate/building/audience; AI drafting and translation with mandatory manager approval before send  EM-04, AI-E-04, SC-09
  announcements/[announcementId]/page.tsx delivery and read statistics          EM-04, SC-09

  bookings/page.tsx                       calendar + request queue, §10 states  EM-05
  bookings/amenities/page.tsx             capacity, hours, rules, optional fees EM-05
  bookings/amenities/[amenityId]/page.tsx EM-05
  bookings/[bookingId]/page.tsx           approve / decline                     EM-05, §10

  security/page.tsx                       estate security overview              EM-06
  security/sos/page.tsx                   SOS board, §10 states                 EM-06
  security/sos/[eventId]/page.tsx         timeline, responders, the Reviewed step  EM-06, §10
  security/incidents/page.tsx             EM-06, SC-10
  security/patrols/page.tsx               EM-06
  security/visitors/page.tsx              visitor log, NDPA retention policy    EM-02, §12
  security/access/page.tsx                CCTV anomaly / face and plate recognition — FEATURE-FLAGGED OFF; renders a 'requires DPIA sign-off' state until Q5 resolves  AI-E-06, §12

  directory/page.tsx                      searchable vendor + staff directory with per-role visibility  EM-07

  documents/page.tsx                      folders + permission control          EM-08
  documents/search/page.tsx               semantic search across the corpus     AI-S-03
  documents/[docId]/page.tsx              viewer; OCR-extracted fields editable before save  EM-08, AI-S-03

  marketplace/page.tsx                    manager overview                      EM-09
  marketplace/listings/page.tsx           approve / suspend listings            EM-09, SC-04
  marketplace/listings/[listingId]/page.tsx  EM-09
  marketplace/orders/page.tsx             §10 Placed→Accepted→Fulfilled→Closed, Declined/Refunded  EM-09, §10
  marketplace/orders/[orderId]/page.tsx   EM-09
  marketplace/review-queue/page.tsx       fraud flags to human review — never auto-block  AI-E-05
  marketplace/payouts/page.tsx            BLOCKED by Q3 (commission %, escrow, payout rails, KYC); ship the route with a disabled 'pending commercial decision' state  EM-09

### Route map — /app cross-cutting: reports, AI surfaces and tenant settings
*Requirements: FM-07, AI-S-02, AI-F-04, AI-F-05, AI-S-01, SC-01, SC-02, SC-03, SC-09, EM-01, EM-05, FM-04*

app/reports/page.tsx                      dashboards: open/overdue WOs, PPM compliance %, downtime, cost by category/estate; filters by estate/date; CSV and PDF export; role-scoped per §7  FM-07
app/reports/[reportId]/page.tsx           saved/detail report                  FM-07
app/reports/ask/page.tsx                  natural-language questions across data returning answers and reports in plain language, with every figure traceable to the underlying records; falls back to the standard FM-07 reports  AI-S-02

app/settings/page.tsx                     index
app/settings/profile/page.tsx             SC-01
app/settings/notifications/page.tsx       per-user channel preferences + quiet hours  SC-09
app/settings/security/page.tsx            password/session policy, MFA        SC-01, §12
app/settings/organisation/page.tsx        branding and org profile — READ-ONLY for Estate Manager (§7 tenant_config = V); creation and edit live in /admin  §8.2
app/settings/users/page.tsx               users & roles — M for EstM and FacM, V for Exec  SC-01, §7
app/settings/users/[userId]/page.tsx      SC-01
app/settings/roles/page.tsx               the §7 matrix rendered read-only at tenant level  §7, SC-01
app/settings/estates/page.tsx             estates/facilities config            §8.2, FM-04
app/settings/charge-structures/page.tsx   per-tenant charge structures         EM-01, §8.2
app/settings/amenity-rules/page.tsx       per-tenant amenity rules             EM-05, §8.2
app/settings/templates/page.tsx           per-tenant notification templates    SC-09, SC-03
app/settings/payments/page.tsx            settlement account — VIEW only; Platform Admin owns configuration  SC-02, §8.2
app/settings/ai/page.tsx                  AI feature flags and usage caps at tenant level, with per-feature kill-switch  §8.2, §11.4
app/settings/languages/page.tsx           localization — English at launch, list pending Q6  §12

AI SURFACE PLACEMENT. Three distinct patterns, do not conflate them:
- /app/copilot is the full-page conversational surface (AI-F-05, AI-S-01). It also mounts as a slide-over from the OpsShell header on every route, so 'raise a WO from here' works in context. Every drafted action requires explicit user confirmation.
- /app/reports/ask is NL reporting (AI-S-02) — a different job from the copilot: it returns tables and figures with source records, not conversation.
- /app/insights (AI-F-04) is a passive card feed with a confirm/dismiss loop that tunes sensitivity. It is a destination, not a chat.
All three must render the §11.4 UX states: loading, confidence, sources, error, and a visible degraded state when the provider health check fails.

### Route map — /admin, the Platform Admin console
*Requirements: SC-07, SC-01, SC-02, SC-03, SC-08, SC-09, SC-10, SC-11, AI-S-04, AI-S-06*

admin/layout.tsx                          AdminShell: platform sidebar, global tenant search, NO estate scope switcher
admin/page.tsx                            platform overview: tenants, usage, health  SC-07

admin/tenants/page.tsx                    tenant list                          SC-07
admin/tenants/new/page.tsx                onboarding wizard, the §8.2 sequence: create organisation → configure estates/units by bulk import → branding → payment settlement account → languages → enabled features  SC-07, §8.2
admin/tenants/[tenantId]/page.tsx         tenant overview                      SC-07
admin/tenants/[tenantId]/estates/page.tsx estates/units config + bulk import   §8.2
admin/tenants/[tenantId]/branding/page.tsx  §8.2
admin/tenants/[tenantId]/payments/page.tsx  per-tenant settlement account      §8.2, SC-02
admin/tenants/[tenantId]/features/page.tsx  enabled features, AI feature flags, per-feature kill-switch  §8.2, §11.4
admin/tenants/[tenantId]/usage/page.tsx   AI, SMS and email metering per tenant; budget caps and alert thresholds pending Q12  §8.2, §11.4
admin/tenants/[tenantId]/users/page.tsx   SC-01
admin/tenants/[tenantId]/audit/page.tsx   tenant-scoped audit                  SC-10
admin/tenants/[tenantId]/operations/page.tsx  READ-ONLY drill-in to that tenant's assets, work orders, inspections, charges, announcements, bookings, security and marketplace  §7 (Plat = V on all eight)

admin/users/page.tsx                      cross-tenant user search             SC-01
admin/roles/page.tsx                      role definitions; deny-by-default authoring  §7, SC-01
admin/audit/page.tsx                      immutable log of auth events, permission changes, financial actions, security events and AI overrides — actor, tenant, timestamp; 12-month retention (proposed); queryable  SC-10

admin/ai/page.tsx                         AI control plane index               AI-S-06
admin/ai/interactions/page.tsx            every AI request/response with confidence and override, PII minimised/redacted  §8.1, §11.4
admin/ai/usage/page.tsx                   per-tenant and per-feature caps with alerts  §11.4, Q12
admin/ai/providers/page.tsx               LLM/OCR/translation abstraction health checks and current degrade-to-fallback status per feature  §11.4
admin/ai/evals/page.tsx                   the §11 benchmarks: triage top-1 accuracy, assignee acceptance, grounded-answer accuracy, defect recall, false-positive rate, risk-model AUC, extraction rates, forecast MAPE  §11, §14
admin/ai/isolation/page.tsx               latest CI result for zero cross-tenant retrieval and cross-tenant access — both release-blocking  AI-S-06, §8.2, §11.4

admin/integrations/page.tsx               provider selection and status per §13.2: payments (Paystack/Flutterwave), SMS (Termii/Twilio), email, maps, push, OCR/vision  SC-03, §13.2
admin/integrations/webhooks/page.tsx      webhook confirmation, idempotency, retries  SC-02
admin/notifications/templates/page.tsx    SC-09
admin/notifications/delivery/page.tsx     delivery logging and delivery-failure handling  SC-09, SC-03

admin/investors/page.tsx                  SC-08
admin/investors/projects/page.tsx         off-plan projects — Plat is F on investor_projects  SC-08, §7
admin/investors/projects/[projectId]/page.tsx  sales pipeline, occupancy, returns  SC-08, AI-S-04
admin/investors/leads/page.tsx            landing-page lead capture + lead scoring  SC-11, AI-S-04

admin/compliance/page.tsx                 NDPA: consent records, processing register, per-entity retention schedule, DPIA status for AI-E-06 (Q5), data residency (Q7)  §12
admin/health/page.tsx                     API P95, availability against the 99.5% monthly target, backup RPO/RTO  §12
admin/settings/page.tsx                   platform config

THE KEY IA CONSEQUENCE OF §7: Platform Admin gets NO top-level 'Work Orders' or 'Billing' nav item. They are 'V' on every operational row, which means read-only inspection reached by drilling into a tenant — hence /admin/tenants/[tenantId]/operations rather than a parallel set of top-level ops routes. Getting this wrong is the most likely IA mistake on this build: it produces a duplicate, subtly-divergent copy of the entire ops module.

### Route map — /resident, the resident app
*Requirements: EM-01, EM-02, EM-03, EM-04, EM-05, EM-06, EM-07, EM-08, EM-09, SC-01, SC-02, SC-04, SC-09, AI-E-01, AI-E-02, §12.1*

resident/layout.tsx                       ResidentShell: bottom tab bar under 880px, slim rail above; persistent SOS affordance; offline sync badge
resident/page.tsx                         home: outstanding balance, open requests, latest announcements, next booking  EM-01, EM-03, EM-04, EM-05

resident/payments/page.tsx                what I owe                           EM-01, SC-02
resident/payments/invoices/[invoiceId]/page.tsx  invoice detail                EM-01
resident/payments/checkout/[invoiceId]/page.tsx  cards, transfers and USSD where available  SC-02
resident/payments/receipts/page.tsx       receipts, including for partial payments  EM-01
resident/payments/statement/page.tsx      statement per unit/resident          EM-01

resident/requests/page.tsx                my tickets with visible status       EM-03
resident/requests/new/page.tsx            category, description, photos → ticket ID; photo-based classification runs server-side, HITL happens manager-side  EM-03, AI-E-02
resident/requests/[requestId]/page.tsx    status timeline + rate the resolution  EM-03

resident/announcements/page.tsx           EM-04 (Resident = V)
resident/announcements/[id]/page.tsx      EM-04

resident/bookings/page.tsx                my bookings, §10 states              EM-05
resident/bookings/amenities/page.tsx      availability calendar                EM-05
resident/bookings/amenities/[amenityId]/page.tsx  book; fees paid via gateway  EM-05, SC-02, SC-04
resident/bookings/[bookingId]/page.tsx    confirm / cancel within policy window  EM-05, §10

resident/visitors/page.tsx                my passes                            EM-02
resident/visitors/new/page.tsx            issue a time-bound code/QR           EM-02
resident/visitors/[passId]/page.tsx       QR display + share                   EM-02

resident/sos/page.tsx                     trigger + live acknowledgement state; must work on poor connectivity with SMS fallback (proposed)  EM-06, §12.1

resident/marketplace/page.tsx             browse approved vendors              EM-09
resident/marketplace/listings/[listingId]/page.tsx  EM-09
resident/marketplace/cart/page.tsx        SC-04
resident/marketplace/checkout/page.tsx    SC-02, SC-04
resident/marketplace/orders/page.tsx      §10 order states                     EM-09
resident/marketplace/orders/[orderId]/page.tsx  EM-09

resident/directory/page.tsx               approved vendors and estate staff, visibility per §7  EM-07
resident/documents/page.tsx               documents shared to my audience      EM-08
resident/help/page.tsx                    RAG chatbot: grounded answer with source, or — when there is no source — an explicit refusal that escalates into a ticket; falls back to FAQ plus ticket  AI-E-01, EM-03

resident/settings/profile/page.tsx        own profile + household members      SC-01, EM-02
resident/settings/notifications/page.tsx  channel preferences + quiet hours    SC-09
resident/settings/units/page.tsx          my unit(s), move-out request         EM-02
resident/settings/privacy/page.tsx        NDPA consent records and data request  §12

WHAT A RESIDENT NEVER SEES, straight from §7: assets and PPM (—), inspections and compliance (—), investor projects (—), reports and analytics (—). No vendor management, no other residents' data, no estate-wide anything. Resident is the only role with 'O' on payments — nobody else pays in-app.

### Route map — /vendor and /investor
*Requirements: FM-03, FM-05, FM-07, EM-08, EM-09, SC-01, SC-08, SC-09, AI-E-05, AI-S-04*

VENDOR PORTAL. §7 gives Vendor exactly three rows: users_roles O, work_orders O, marketplace O. FM-05 names the 'vendor portal' explicitly.

vendor/layout.tsx                         VendorShell: 8-item rail, SLA countdown in header
vendor/page.tsx                           home: new assignments, SLA clocks, unpaid invoices  FM-05, FM-03
vendor/jobs/page.tsx                      assigned work orders, own records only  FM-03, FM-05
vendor/jobs/[woId]/page.tsx               accept/decline, advance state, capture photos, notes, parts and costs  FM-03, §10
vendor/invoices/page.tsx                  FM-05
vendor/invoices/new/page.tsx              submit an invoice through the portal  FM-05
vendor/invoices/[invoiceId]/page.tsx      FM-05
vendor/listings/page.tsx                  my marketplace listings              EM-09
vendor/listings/new/page.tsx              with listing auto-generation as an assist  EM-09, AI-E-05
vendor/listings/[listingId]/page.tsx      EM-09
vendor/orders/page.tsx                    must accept within SLA or the order auto-expires  EM-09, §10
vendor/orders/[orderId]/page.tsx          EM-09
vendor/payouts/page.tsx                   BLOCKED by Q3 — ship disabled       EM-09
vendor/profile/page.tsx                   services and coverage                FM-05
vendor/documents/page.tsx                 insurance and certifications with expiry alerts  FM-05
vendor/performance/page.tsx               jobs completed, SLA hit rate, rating FM-05
vendor/settings/notifications/page.tsx    SC-09

INVESTOR DASHBOARD. §7 gives Investor: investor_projects O, reports_analytics V, users_roles O. Three rows, nothing else.

investor/layout.tsx                       InvestorShell: wide chart-first canvas; a permanent 'projections are estimates, not financial advice' disclaimer band
investor/page.tsx                         portfolio: sales, occupancy, returns across my projects  SC-08
investor/projects/page.tsx                only my projects — hard-scoped server-side  SC-08
investor/projects/[projectId]/page.tsx    SC-08
investor/projects/[projectId]/sales/page.tsx      pipeline detail + lead scoring  SC-08, AI-S-04
investor/projects/[projectId]/occupancy/page.tsx  SC-08
investor/projects/[projectId]/forecast/page.tsx   sales and occupancy forecasting and ROI projections, every output labelled an estimate with its assumptions shown  AI-S-04, SC-08
investor/reports/page.tsx                 read-only reports, CSV/PDF export    §7, FM-07
investor/documents/page.tsx               project documents under the EM-08 permission model  EM-08
investor/settings/profile/page.tsx        SC-01
investor/settings/notifications/page.tsx  SC-09

The investor shell is the smallest of the six — ten routes — and is the one most likely to be seen by someone who has never used the product before. It should be the least chrome-heavy: no collapsible sidebar, no scope switcher, no copilot.

### Route map — /gate, the Security gatehouse
*Requirements: EM-02, EM-04, EM-05, EM-06, SC-09, SC-10, §10, §12*

§7 gives Security exactly three rows: security_sos M, announcements V, bookings_amenities V. Nothing else — notably NOT work orders.

gate/layout.tsx                           GateShell: high contrast, 44px+ targets, pinned nav (no collapse), permanent live SOS banner, no theme toggle (gate screens are fixed to the room's lighting)
gate/page.tsx                             live board: active SOS, expected visitors today, patrol due  EM-06, EM-02
gate/sos/page.tsx                         SOS queue; acknowledgement target under 60s during manned hours (proposed); unacknowledged alerts escalate to backup responders  EM-06, §10
gate/sos/[eventId]/page.tsx               Raised → Acknowledged → Responding → Resolved; the Reviewed step is manager-side at /app/security/sos/[eventId]  EM-06, §10
gate/visitors/page.tsx                    expected and on-site                 EM-02
gate/visitors/verify/page.tsx             scan or keypad entry                 EM-02
gate/visitors/verify/[passCode]/page.tsx  verification result + check-in/check-out  EM-02
gate/visitors/log/page.tsx                visitor log retained per the NDPA retention policy  EM-02, §12
gate/patrols/page.tsx                     patrol logging                       EM-06
gate/patrols/[patrolId]/page.tsx          EM-06
gate/incidents/page.tsx                   incident log; all security events audit-logged  EM-06, SC-10
gate/incidents/new/page.tsx               EM-06
gate/bookings/page.tsx                    who has the clubhouse today — view only  EM-05, §7
gate/announcements/page.tsx               view only                            EM-04, §7
gate/settings/notifications/page.tsx      SC-09

The SOS timing target is the single hardest NFR in the product to hit through a generic shell: a 60-second acknowledgement budget includes the guard noticing the alert. That is why the live SOS banner is layout-level and why this shell does not collapse or animate its nav.

### Per-role nav — Platform Admin
*Requirements: SC-07, SC-01, SC-03, SC-08, SC-09, SC-10, SC-11, AI-S-04, AI-S-06*

Shell: /admin. §7 row access — tenant_config F · users_roles F · investor_projects F · reports_analytics F · assets_ppm V · work_orders V · inspections V · charges V · announcements V · bookings V · security_sos V · marketplace V · payments —

PLATFORM
  Overview            /admin
  Tenants             /admin/tenants                    SC-07 · §8.2
  Users               /admin/users                      SC-01
  Roles & permissions /admin/roles                      §7 · SC-01

AI CONTROL
  Overview            /admin/ai                         AI-S-06
  Interaction log     /admin/ai/interactions            §8.1 · §11.4
  Usage & caps        /admin/ai/usage                   §11.4 · Q12
  Providers           /admin/ai/providers               §11.4
  Benchmarks          /admin/ai/evals                   §11 · §14
  Isolation tests     /admin/ai/isolation               AI-S-06 · §8.2

PLATFORM OPS
  Audit log           /admin/audit                      SC-10
  Integrations        /admin/integrations               SC-03 · §13.2
  Notifications       /admin/notifications/delivery     SC-09
  Compliance          /admin/compliance                 §12 · Q5 · Q7
  Health              /admin/health                     §12

INVESTOR
  Projects            /admin/investors/projects         SC-08
  Leads               /admin/investors/leads            SC-11 · AI-S-04

  Settings            /admin/settings

DELIBERATELY ABSENT: no Work Orders, Assets, Billing, Bookings, Security or Marketplace items. Plat is 'V' on all of those, and view access is exercised by drilling into a tenant at /admin/tenants/[tenantId]/operations — not by a parallel top-level module. Also absent: any estate scope switcher, and any 'pay' affordance (§7 payments = — for Plat, the only role besides Resident that the matrix explicitly excludes).

### Per-role nav — Owner/Executive
*Requirements: FM-01, FM-02, FM-03, FM-04, FM-06, FM-07, EM-01, EM-02, EM-04, EM-05, EM-06, EM-09, SC-01, SC-08, AI-E-03, AI-F-04, AI-S-01, AI-S-02*

Shell: /app. §7 row access — reports_analytics V · users_roles V · investor_projects V · and V on every operational row: assets_ppm, work_orders, inspections, charges, announcements, bookings, security_sos, marketplace. tenant_config — · payments —

Executive is a PURE READ-ONLY PORTFOLIO PERSONA. Same routes as the managers, every write affordance suppressed: no 'New' buttons, no state-transition controls, no assign, no approve, no send. This is the cleanest demonstration of why V and M can share a route space.

OVERVIEW
  Portfolio           /app                              FM-07
  Reports             /app/reports                      FM-07
  Ask                 /app/reports/ask                  AI-S-02
  Insights            /app/insights                     AI-F-04
  Copilot             /app/copilot                      AI-S-01

PORTFOLIO (all read-only)
  Estates & spaces    /app/spaces                       FM-04
  Assets & PPM        /app/assets                       FM-01 · FM-02
  Work orders         /app/work-orders                  FM-03
  Inspections         /app/inspections                  FM-06
  Compliance          /app/compliance                   FM-06

FINANCE (read-only)
  Billing             /app/billing                      EM-01
  Arrears             /app/billing/arrears              EM-01 · AI-E-03

COMMUNITY (read-only)
  Residents           /app/residents                    EM-02
  Announcements       /app/announcements                EM-04
  Bookings            /app/bookings                     EM-05
  Security            /app/security                     EM-06
  Marketplace         /app/marketplace                  EM-09

INVESTMENT
  Investor projects   /app/investor-projects → redirect to a read-only view of /admin/investors/projects scoped to the tenant   SC-08 · §7

  Team               /app/settings/users                SC-01 (V)
  Settings           /app/settings/profile

OPEN POINT: §7 gives Exec 'V' on investor_projects, but SC-08's investor surfaces are specified for the Investor role and Plat owns project authoring. The Exec view needs a route; the cleanest option is a read-only mount under /app rather than granting Exec access to the /admin prefix. Flagged in open issues.

### Per-role nav — Estate Manager
*Requirements: EM-01, EM-02, EM-03, EM-04, EM-05, EM-06, EM-07, EM-08, EM-09, FM-01, FM-02, FM-03, FM-04, FM-06, FM-07, SC-01, SC-02, SC-09, AI-E-03, AI-E-04, AI-F-04, AI-F-05, AI-S-01, AI-S-03*

Shell: /app. §7 row access — users_roles M · work_orders M · charges_invoicing M · announcements M · bookings_amenities M · security_sos M · marketplace M · reports_analytics M · tenant_config V · assets_ppm V · inspections_compliance V · investor_projects — · payments —

OVERVIEW
  Dashboard           /app                              EM-01 · EM-03 · EM-06
  Copilot             /app/copilot                      AI-S-01 · AI-F-05
  Insights            /app/insights                     AI-F-04

FINANCE  (M — full authoring)
  Billing             /app/billing                      EM-01
  Invoices            /app/billing/invoices             EM-01 · §10
  Payments            /app/billing/payments             SC-02
  Arrears & risk      /app/billing/arrears              EM-01 · AI-E-03
  Reminders           /app/billing/reminders            AI-E-03 · SC-09
  Statements          /app/billing/statements           EM-01
  Reconciliation      /app/billing/reconciliation       SC-02 · Q10

COMMUNITY  (M)
  Residents           /app/residents                    EM-02
  Requests            /app/requests                     EM-03
  Announcements       /app/announcements                EM-04 · AI-E-04
  Bookings            /app/bookings                     EM-05
  Security & SOS      /app/security                     EM-06
  Visitors            /app/security/visitors            EM-02
  Directory           /app/directory                    EM-07
  Documents           /app/documents                    EM-08 · AI-S-03
  Marketplace         /app/marketplace                  EM-09

WORK  (M on work orders, V on assets/PPM/inspections)
  Work orders         /app/work-orders                  FM-03
  Spaces              /app/spaces                       FM-04
  Assets & PPM        /app/assets  (read-only)          FM-01 · FM-02
  Inspections         /app/inspections (read-only)      FM-06

  Reports             /app/reports                      FM-07

SETTINGS
  Users & roles       /app/settings/users               SC-01 (M)
  Organisation        /app/settings/organisation        §8.2 (V — tenant_config = V, so read-only)
  Charge structures   /app/settings/charge-structures   EM-01
  Amenity rules       /app/settings/amenity-rules       EM-05
  Templates           /app/settings/templates           SC-09
  Profile & alerts    /app/settings/profile             SC-01 · SC-09

ABSENT: investor projects (—), in-app payments (—), PPM authoring and inspection authoring (V only — the Estate Manager can look at the maintenance programme but not define it; that is the Facility Manager's job). The 'Organisation' item is present but read-only, which is the one place a V on tenant_config surfaces in the UI.

### Per-role nav — Facility Manager
*Requirements: FM-01, FM-02, FM-03, FM-04, FM-05, FM-06, FM-07, EM-04, SC-01, SC-09, AI-F-01, AI-F-02, AI-F-03, AI-F-04, AI-F-05, AI-S-01*

Shell: /app. §7 row access — assets_ppm M · work_orders M · inspections_compliance M · announcements M · users_roles M · reports_analytics M · tenant_config — · charges_invoicing — · payments — · bookings_amenities — · security_sos — · marketplace — · investor_projects —

OVERVIEW
  Dashboard           /app                              FM-07 · AI-F-04
  Copilot             /app/copilot                      AI-F-05 · AI-S-01
  Insights            /app/insights                     AI-F-04

MAINTENANCE  (M)
  Work orders         /app/work-orders                  FM-03 · §10
  Triage queue        /app/work-orders/triage           AI-F-02
  PPM plans           /app/ppm                          FM-02
  PPM calendar        /app/ppm/calendar                 FM-02
  Predictive          /app/ppm/forecast                 AI-F-01

ASSETS  (M)
  Asset register      /app/assets                       FM-01
  Spaces              /app/spaces                       FM-04

QUALITY  (M)
  Inspections         /app/inspections                  FM-06 · AI-F-03
  Templates           /app/inspections/templates        FM-06
  Compliance          /app/compliance                   FM-06 · FM-05

SUPPLY
  Vendors             /app/vendors                      FM-05

  Announcements       /app/announcements                EM-04 (M — the one estate-module item a Facility Manager gets)
  Reports             /app/reports                      FM-07

SETTINGS
  Users & roles       /app/settings/users               SC-01 (M)
  Profile & alerts    /app/settings/profile             SC-01 · SC-09

ABSENT AND IMPORTANT: no Finance section at all (charges_invoicing = —), no Bookings, no Security & SOS, no Marketplace, no Residents, no Investor projects, no Organisation settings. Set against the Estate Manager's nav, this is the sharpest divergence in the product: two roles in the same shell with almost disjoint sidebars, overlapping only on Work orders, Spaces, Announcements, Reports and Users. That overlap is exactly the argument for keeping them in one route space rather than two.

### Per-role nav — Technician
*Requirements: FM-01, FM-02, FM-03, FM-06, FM-08, SC-01, SC-05, SC-09, SC-10, §12.1*

Shell: /app, compact variant. §7 row access — work_orders O · inspections_compliance O · assets_ppm V · everything else —

MY WORK
  My jobs             /app/work-orders?assignee=me      FM-03 (O)
  My inspections      /app/inspections?assignee=me      FM-06 (O)
  Asset lookup        /app/assets                       FM-01 · FM-02 (V)
  Notifications       /app/notifications                SC-09
  Profile             /app/settings/profile             SC-01

Five items. That is the entire Technician web app.

WHY THE WEB SHELL EXISTS AT ALL, given FM-08 says the Technician does the whole job from a phone: (a) parity for a technician at a desk or on a depot terminal, (b) supervisors reviewing a technician's queue, (c) the same routes serve the FM's filtered views, so the marginal build cost is a query parameter rather than a screen. Be honest about the priority — SC-05 mobile is the primary Technician surface and this web view should not receive bespoke design effort.

IMPLEMENTATION NOTE ON 'O': ?assignee=me is a UI convenience, not the security boundary. §7 'O — own records only' must be enforced server-side under SC-01's deny-by-default rule — a technician who removes the query parameter must still receive only their own records, not the full list. The same applies to every 'O' cell in the matrix (Resident, Vendor, Investor).

OFFLINE: this is one of the two shells where §12.1 queued writes matter most — work-order updates and inspection logs queue with a visible sync status, and conflicts resolve server-authoritative with overwritten offline edits surfaced to the user and audit-logged. The sync badge belongs in OpsShell's header, not on individual pages.

### Per-role nav — Resident, Security, Vendor and Investor
*Requirements: EM-01, EM-02, EM-03, EM-04, EM-05, EM-06, EM-07, EM-08, EM-09, FM-03, FM-05, SC-01, SC-02, SC-08, SC-09, AI-E-01, AI-S-04*

RESIDENT — shell /resident. §7: payments O · charges_invoicing O · work_orders O · bookings_amenities O · security_sos O · marketplace O · users_roles O · announcements V · everything else —
Mobile (bottom tabs, five max): Home · Pay · Requests · Book · More
Full nav: Home /resident · Payments /resident/payments (EM-01, SC-02) · Requests /resident/requests (EM-03) · Bookings /resident/bookings (EM-05) · Visitors /resident/visitors (EM-02) · Announcements /resident/announcements (EM-04, V) · Marketplace /resident/marketplace (EM-09) · Directory /resident/directory (EM-07) · Documents /resident/documents (EM-08) · Help /resident/help (AI-E-01) · Settings /resident/settings/profile
SOS is NOT a nav item — it is a persistent shell-level action (EM-06), reachable from every screen without navigation. Absent: assets, PPM, inspections, vendors, reports (§7 reports_analytics = — for Resident), investor projects.

SECURITY — shell /gate. §7: security_sos M · announcements V · bookings_amenities V · everything else —
Nav (8 items, no collapse): Live board /gate · SOS /gate/sos (EM-06) · Visitors /gate/visitors (EM-02) · Verify /gate/visitors/verify (EM-02) · Patrols /gate/patrols (EM-06) · Incidents /gate/incidents (EM-06) · Today's bookings /gate/bookings (EM-05, V) · Announcements /gate/announcements (EM-04, V) · Alerts /gate/settings/notifications
Absent and notable: no work orders (§7 work_orders = — for Security), no residents list, no billing.

VENDOR — shell /vendor. §7: work_orders O · marketplace O · users_roles O · everything else —
Nav: Home /vendor · Jobs /vendor/jobs (FM-03, FM-05) · Invoices /vendor/invoices (FM-05) · Listings /vendor/listings (EM-09) · Orders /vendor/orders (EM-09) · Payouts /vendor/payouts (EM-09, disabled pending Q3) · Company /vendor/profile (FM-05) · Documents /vendor/documents (FM-05) · Performance /vendor/performance (FM-05) · Alerts /vendor/settings/notifications
Absent: assets, PPM, inspections, residents, billing, announcements, bookings, security, reports, investor.

INVESTOR — shell /investor. §7: investor_projects O · reports_analytics V · users_roles O · everything else —
Nav (7 items): Overview /investor · My projects /investor/projects (SC-08) · Sales /investor/projects/[id]/sales (SC-08, AI-S-04) · Forecast /investor/projects/[id]/forecast (AI-S-04) · Reports /investor/reports (V) · Documents /investor/documents (EM-08) · Settings /investor/settings/profile
Absent: every operational row in §7 is '—' for Investor. This role touches no facility or estate data whatsoever.

### Shell chrome divergence — what each layout.tsx actually contains
*Requirements: SC-06, EM-01, EM-06, FM-03, AI-F-05, AI-S-01, AI-S-04, §10, §11.4, §12.1, §13.1*

The design system is shared; the chrome is not. Six layouts, each reusing the same tokens, Card/KpiCard/StatusPill/Button/FilterChip/Tabs/Table/Avatar/Mono/EmptyState primitives.

ROOT app/layout.tsx — <html lang>, Inter Tight + JetBrains Mono variables, themeInitScript before paint, ThemeProvider. Nothing else. Remove <AppShell> from here; it currently wraps every route and would apply the manager sidebar to the login page and the landing page.

OpsShell (/app) — closest to the existing app-shell.tsx. Keep: 248px→72px collapsible sidebar, 64px header, off-canvas drawer under 880px, ⌘K search, theme toggle. Add: (1) estate/facility scope switcher in the header, cookie-backed; (2) copilot slide-over trigger (AI-F-05, AI-S-01); (3) offline sync-status badge (§12.1); (4) role-filtered nav from the §7 matrix; (5) a read-only banner when the active role is Executive.

AdminShell (/admin) — same skeleton, different contents. No estate scope switcher. Add a global tenant search and a persistent tenant-context breadcrumb when inside /admin/tenants/[tenantId]/*. Add a visible environment badge (dev/staging/production per §13.1) — Platform Admin is the one role that operates across environments and mistaking staging for production here is expensive.

ResidentShell (/resident) — the biggest departure. Bottom tab bar under 880px (five tabs), slim icon rail above. Larger type and touch targets than the ops density. Persistent SOS button (EM-06). Outstanding-balance chip in the header (EM-01). Offline sync badge (§12.1). No ⌘K, no collapse control, no scope switcher.

VendorShell (/vendor) — narrow 200px rail, no collapse. SLA countdown in the header (§10: 'vendor must accept within SLA or order auto-expires'; FM-03 per-priority SLA timers). Vendor org name and logo in place of the tenant brand — the vendor works for several tenants and needs to know whose job they are looking at.

InvestorShell (/investor) — widest content column, chart-first. Top nav rather than a sidebar (seven items fit). Permanent disclaimer band: AI-S-04 requires all outputs 'labelled as estimates with assumptions shown; not presented as financial advice'. Putting that at layout level rather than per-chart makes it impossible to ship a forecast screen without it.

GateShell (/gate) — kiosk profile. Pinned nav, no collapse, no theme toggle. High contrast, 44px+ targets. A live SOS banner mounted above the content area that takes over the viewport when an event is Raised and unacknowledged (EM-06, §10 <60s target). Large clock and on-duty indicator.

SHARED COMPONENTS the design system still needs, added alongside the existing primitives: <AiSuggestion> (confidence + accept/override), <AiSourceList>, <AiDisabledFallback> (renders the listed fallback when the provider health check fails), <StateTimeline> (for the four §10 state machines), <SlaTimer>, <SyncStatus>, <ScopeSwitcher>, <MoneyCell> (Mono + NGN formatting). §11.4 requires loading, confidence, sources and error states on every AI surface — that is a component contract, not a per-page concern.

### Next.js 16 constraints that materially change this IA
*Requirements: SC-01, SC-06, SC-07, AI-F-05, AI-S-01*

Verified against node_modules/next/dist/docs (Next 16.2.12). Four of these would cause build failures or rework if assumed from Next 14/15 habits.

1. middleware.ts IS NOW proxy.ts. The docs state: 'The middleware file convention is deprecated and has been renamed to proxy.' The role→prefix gate belongs in a root-level proxy.ts exporting a default or named `proxy` function with a config.matcher. Note the caveat: 'Proxy is meant to be invoked separately of your render code… you should not attempt relying on shared modules or globals.' Pass tenant and role to the app through headers, cookies, rewrites or the URL — not shared imports.

2. unstable_rootParams WAS REMOVED with no replacement yet shipped. This is the direct reason tenant must not be a root dynamic segment. Covered above.

3. PARALLEL ROUTE SLOTS NOW REQUIRE AN EXPLICIT default.js — 'Builds will fail without them.' If the copilot slide-over is built as a @copilot parallel slot in OpsShell (a reasonable choice, since it keeps copilot state across navigation), app/@copilot/default.tsx must exist returning null. Same for any @modal used for work-order quick-view or invoice detail. This is a build-breaking gotcha, not a warning.

4. forbidden.tsx AND unauthorized.tsx ARE STILL MARKED version: experimental and require experimental.authInterrupts in next.config.ts. RECOMMENDATION for MVP: do not depend on them. Use an explicit /no-access route under (auth) and redirect from proxy.ts. Revisit when the flag stabilises. SC-01's deny-by-default enforcement is server-side anyway; these files only control the 401/403 UI.

5. ASYNC REQUEST APIS. params is a Promise in layouts and pages — every [tenantId], [woId], [invoiceId] segment needs `const { woId } = await params`. Also async now: params for icon and opengraph-image, and the id parameter for sitemap.

6. PPR is no longer a per-route experimental_ppr segment config; opt in via the cacheComponents config instead. Relevant if the team wants the ops dashboard shell to prerender while KPI cards stream.

7. SCROLL BEHAVIOUR is no longer overridden during navigation unless <html data-scroll-behavior="smooth"> is set. Minor, but it changes perceived navigation snappiness across a 175-route app.

8. The docs also ship a multi-tenant guide (02-guides/multi-tenant.md) that simply points at Vercel's platforms-starter-kit rather than prescribing an approach — so there is no framework-blessed pattern to defer to here, and ADR-01 (Q2) genuinely is ours to decide.

### What to delete, rename and rewrite in the existing scaffold
*Requirements: SC-06, SC-11, §8.2, §10*

DELETE OUTRIGHT (logistics domain, no reusable content):
- src/app/loads/page.tsx, carriers/page.tsx, customers/page.tsx, fuel/page.tsx, maintenance/page.tsx, staff/page.tsx — all are 11-line EmptyState placeholders. Nothing to salvage.
- src/app/page.tsx (163 lines) — the living style guide. Extract nothing; the landing page (SC-11) replaces '/'. If the team wants a style guide, keep it at /admin/settings/design-system or a Storybook, not at the product root.
- src/app/settings/page.tsx — superseded by the per-shell settings trees.

REWRITE:
- src/config/nav.ts — replace the flat navGroups array with the role-aware structure (artifact below). The current pageMeta record maps 8 routes to title/subtitle; it will not scale to ~175 routes and will drift. Replace with per-route `metadata` exports plus a route manifest the shells read for the header title.
- src/components/app-shell.tsx — becomes src/components/shells/ops-shell.tsx and is the base the other five shells fork from. Extract NavLink, the brand block, the search trigger and the profile footer into src/components/shell/ so all six share them.
- src/app/layout.tsx — remove <AppShell>; it must not wrap (marketing) or (auth).
- src/config/brand.ts — name and tagline are 'Cargoflow' / 'FREIGHT TMS' with a Truck icon hardcoded in app-shell.tsx line 86. §8.2 requires PER-TENANT branding, so brand must become a runtime value resolved from the tenant, not a compile-time constant. Keep the file as the platform default and add a tenant-branding override that the shells read.
- src/components/ui/index.tsx — LoadStatus and STATUS_COLORS (Draft/Posted/Booked/In Transit/Delivered/Closed) are logistics states. Replace with the five §10 vocabularies (artifact below). StatusPill's implementation is fine and stays; only the status union and colour map change.

KEEP UNCHANGED: globals.css tokens, theme-provider.tsx (themeInitScript, useSyncExternalStore, cross-tab sync), the Inter Tight / JetBrains Mono pairing, and every UI primitive's implementation. DESIGN-SYSTEM.md already anticipates this: 'Its screens… were not ported — the PRD defines what actually gets built.'

ONE CAUTION: DESIGN-SYSTEM.md documents the breakpoints as ≤1120px, ≤880px, ≤560px. The 880px sidebar-to-drawer breakpoint is right for OpsShell and AdminShell but wrong for ResidentShell, which should switch to bottom tabs closer to 768px, and irrelevant to GateShell, which never collapses. Do not treat 880px as global.

### Five status vocabularies replace one — a cross-cutting IA consequence of §10
*Requirements: FM-03, EM-01, EM-05, EM-06, EM-09, SC-09, SC-10, §10*

The scaffold has a single six-value status scale. §10 defines FOUR state machines and §10's marketplace row a fifth, all of which appear simultaneously on manager dashboards. This affects IA because it determines what filter chips exist on each list route and what StatusPill renders.

WORK ORDER (FM-03, appears on /app/work-orders, /app/requests, /vendor/jobs, technician views)
New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed; branches Rejected, Cancelled. Ten values. Per-priority SLA timers (Emergency respond 2h / resolve 24h; Routine 72h — proposed). Resolved → Verified by requester or manager; auto-close after 5 days (proposed).

SERVICE CHARGE / INVOICE (EM-01, on /app/billing/invoices, /resident/payments)
Draft → Issued → Partially paid → Paid; and Issued → Overdue → In arrears → Escalated. Seven values across two branches. Note this is not a single linear chain — the arrears branch runs parallel to the payment chain, so a filter UI needs both axes.

BOOKING (EM-05, on /app/bookings, /resident/bookings, /gate/bookings)
Requested → Approved / Auto-approved → Confirmed → Completed; branches Declined, Cancelled. Payment required to confirm where fees apply.

SOS EVENT (EM-06, on /gate/sos, /app/security/sos, /resident/sos)
Raised → Acknowledged → Responding → Resolved → Reviewed. Five values. The Reviewed step is manager-only, which is why /gate/sos/[eventId] stops at Resolved and /app/security/sos/[eventId] owns Reviewed.

MARKETPLACE ORDER (EM-09, on /app/marketplace/orders, /vendor/orders, /resident/marketplace/orders)
Placed → Accepted → Fulfilled → Closed; branches Declined, Refunded.

IA IMPLICATIONS: (a) StatusPill needs a domain parameter, since 'Closed' means different things for a work order and an order, and 'Resolved' appears in two machines; (b) every list route's FilterChip row derives mechanically from its machine — write it once as a config, not per page; (c) §10 says 'only the listed transitions are legal', so detail screens render actions from a transition table rather than a fixed button set; (d) every transition is timestamped, actor-attributed and notified via SC-09, so every detail route needs an activity/timeline view.

### Feature-flagged and blocked routes — build the shell, gate the content
*Requirements: AI-E-06, AI-E-05, AI-F-01, AI-F-02, AI-E-01, AI-E-03, AI-S-02, AI-F-04, EM-09, FM-07, §11.4, §12, §15.2*

Three routes must exist structurally but must not be functional at launch. Building them as flagged shells rather than omitting them keeps the nav stable and avoids a late IA change.

1. /app/security/access — AI-E-06 (CCTV anomaly detection, face/plate recognition). Priority is 'Could (optional)'. Prerequisites per §11.2: NDPA compliance, explicit consent and DPIA sign-off, tracked as Q5, owned jointly by Client and Unrealabs, needed by Phase 2. §12 states 'DPIA before any AI-E-06 work'. Phase 3 in §16 lists it as 'AI-E-05/06 (if Q5 signed off)'. BUILD: the route, behind a tenant feature flag defaulting off, rendering an EmptyState explaining the DPIA prerequisite. Do NOT put it in the Estate Manager's default sidebar; reveal the nav item only when the flag is on. Hardware is explicitly out of scope (§6.3) — software integration only.

2. /app/marketplace/payouts and /vendor/payouts — EM-09 states 'Commission/payout model per commercial decision — open question Q3 blocks build of payouts'. Q3 covers commission %, escrow, vendor payout rails and KYC, is owned by the Client and needed by Phase 2 start. BUILD: both routes with a disabled 'pending commercial decision' state. The rest of the marketplace (listings, orders, resident purchase via gateway) is unblocked and ships.

3. AI-F-01 predictive maintenance at /app/ppm/forecast — not blocked, but §11.1 requires it to 'run in shadow mode until data volume is sufficient' and §15.2 confirms data-hungry features launch in shadow/tuning mode. The route ships with a persistent shadow-mode banner and its suggestions render as DRAFT schedule entries the Facility Manager approves. Same treatment for AI-E-03's risk scores at /app/billing/arrears — §11.2 sets the AUC benchmark 'after two billing cycles'.

ALSO WORTH FLAGGING AT THE ROUTE LEVEL: §11.4 requires a per-feature kill-switch. That means every AI route needs a defined degraded state, not an error page — /app/work-orders/triage falls back to a manual triage queue, /resident/help falls back to FAQ plus ticket, /app/reports/ask falls back to standard FM-07 reports, /app/insights falls back to static threshold alerts, /app/ppm/forecast falls back to the standard PPM calendar. Core flows never block on AI. The fallback is part of each route's spec, not an afterthought.

### Localization: do not add a [locale] segment now
*Requirements: SC-11, AI-E-04, §12*

§12 requires 'English at launch; additional languages per Q6; all UI strings externalised'. Q6 is owned by the Client and needed by the design phase. AI-E-04 provides AI translation for communications, which is content translation, not UI translation — a separate concern.

RECOMMENDATION: no locale URL segment. Resolve locale from user preference (stored on the user record) falling back to Accept-Language, in proxy.ts. Externalise every string now, as §12 requires.

REASONING, including the counter-argument: the usual objection is that adding /[locale] later changes every URL. That is true but manageable — proxy.ts can rewrite /* to /[locale]/* and issue redirects, and the change is mechanical. Adding the segment NOW, by contrast, imposes a permanent cost on all ~175 routes (an extra awaited param in every layout and page, plus generateStaticParams decisions) to serve a language list that does not exist yet and may never exceed one entry. Given English-only at launch and Q6 unresolved, the asymmetry favours deferring.

EXCEPTION WORTH WATCHING: if Q6 comes back with languages that matter for SEO on the public marketing surface (SC-11) — the only publicly indexed part of the product — add locale segments to (marketing) alone. That group has six routes, so the cost is trivial and it does not touch the authenticated shells. This is a genuinely good reason to keep (marketing) as its own route group rather than folding it into a general (public).

### Route inventory and effort shape
*Requirements: SC-01, SC-02, SC-05, SC-06, SC-07, SC-08, SC-09, SC-10, SC-11, FM-01, FM-02, FM-03, FM-05, FM-07, FM-08, EM-01, EM-02, EM-03, EM-04, EM-06, AI-S-06*

Approximate page.tsx count by shell, useful for sequencing against the §16 phase plan:

(marketing) + (auth) + /verify   ~14 routes   Phase 1 (SC-01 login is a Phase 1 Must; SC-11 landing is Phase 2 Should)
/app (facility)                  ~33 routes   Phase 1 for FM-01/02/03/05/07; Phase 2 for FM-04/06 and AI-F-*
/app (estate)                    ~40 routes   Phase 1 for EM-01/02/03/04/06; Phase 2 for EM-05/07/08/09 and AI-E-*
/app cross-cutting               ~20 routes   reports, AI surfaces, settings
/admin                           ~30 routes   Phase 1 for SC-07/SC-10 core; Phase 2 for AI control plane and SC-08
/resident                        ~28 routes   Phase 1 for payments, requests, announcements, SOS; Phase 2 for bookings, marketplace, documents, chatbot
/vendor                          ~17 routes   Phase 1 for jobs and invoices (FM-05 is Must); Phase 2 for listings and orders
/investor                        ~11 routes   Phase 2 (SC-08 is Should)
/gate                            ~15 routes   Phase 1 (EM-06 is Must)
TOTAL                           ~208 route files

What brings this down in practice: (a) Executive shares every /app route with the managers rather than getting a mirror set — that alone avoids roughly 60 routes; (b) Technician adds five nav entries and zero new routes; (c) many [id] detail routes are one screen with tabs rather than separate sub-routes, so the count above is an upper bound where I listed sub-routes explicitly (e.g. /app/work-orders/[woId]/costs and /activity could be tabs on the detail page).

SEQUENCING NOTE against §16: Phase 1 (weeks 1–12) covers SC-01/02/03/05/06/07/09/10, FM-01/02/03/05/07/08, EM-01/02/03/04/06 and AI-S-06. Mapped onto this IA, that is the root layout, OpsShell, AdminShell, ResidentShell and GateShell — four of the six shells — plus (auth). VendorShell is needed in Phase 1 too, because FM-05 is a Must and its acceptance criteria require vendors to 'submit updates & invoices via the vendor portal'. Only InvestorShell is genuinely Phase 2. Worth flagging to the delivery lead: five of six shells are Phase 1 work, so the shell architecture decision cannot be deferred past kickoff.

## Code-ready artifacts

### src/config/roles.ts (`typescript`)

```typescript
/**
 * §7 Roles & permissions matrix, transcribed verbatim from PRD v2.0.
 *
 * This is a UI-SHAPING artifact only. SC-01 requires server-side,
 * deny-by-default enforcement on every API; nothing here is a security
 * boundary. Hiding a nav item is cosmetic.
 */

export const ROLES = [
  'platform_admin',   // Plat — 7 Fifteen Capital HQ
  'executive',        // Exec — Owner/Executive
  'estate_manager',   // EstM
  'facility_manager', // FacM
  'technician',       // Tech
  'resident',         // Res
  'security',         // Sec
  'vendor',           // Ven
  'investor',         // Inv
] as const;
export type Role = (typeof ROLES)[number];

/** §7 legend. F full · M manage (within own tenant/estate) · V view · O own records only · '-' no access */
export type Access = 'F' | 'M' | 'V' | 'O' | '-';

export const CAPABILITIES = [
  'tenant_config',          // Tenant onboarding & config
  'users_roles',            // Users & roles
  'assets_ppm',             // Assets & PPM plans
  'work_orders',            // Work orders
  'inspections_compliance', // Inspections & compliance
  'charges_invoicing',      // Charges & invoicing
  'payments',               // Payments (pay in-app)
  'announcements',          // Announcements
  'bookings_amenities',     // Bookings & amenities
  'security_sos',           // Security & SOS
  'marketplace',            // Marketplace
  'investor_projects',      // Investor projects
  'reports_analytics',      // Reports & analytics
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const PERMISSIONS: Record<Capability, Record<Role, Access>> = {
  tenant_config:          { platform_admin: 'F', executive: '-', estate_manager: 'V', facility_manager: '-', technician: '-', resident: '-', security: '-', vendor: '-', investor: '-' },
  users_roles:            { platform_admin: 'F', executive: 'V', estate_manager: 'M', facility_manager: 'M', technician: '-', resident: 'O', security: '-', vendor: 'O', investor: 'O' },
  assets_ppm:             { platform_admin: 'V', executive: 'V', estate_manager: 'V', facility_manager: 'M', technician: 'V', resident: '-', security: '-', vendor: '-', investor: '-' },
  work_orders:            { platform_admin: 'V', executive: 'V', estate_manager: 'M', facility_manager: 'M', technician: 'O', resident: 'O', security: '-', vendor: 'O', investor: '-' },
  inspections_compliance: { platform_admin: 'V', executive: 'V', estate_manager: 'V', facility_manager: 'M', technician: 'O', resident: '-', security: '-', vendor: '-', investor: '-' },
  charges_invoicing:      { platform_admin: 'V', executive: 'V', estate_manager: 'M', facility_manager: '-', technician: '-', resident: 'O', security: '-', vendor: '-', investor: '-' },
  payments:               { platform_admin: '-', executive: '-', estate_manager: '-', facility_manager: '-', technician: '-', resident: 'O', security: '-', vendor: '-', investor: '-' },
  announcements:          { platform_admin: 'V', executive: 'V', estate_manager: 'M', facility_manager: 'M', technician: '-', resident: 'V', security: 'V', vendor: '-', investor: '-' },
  bookings_amenities:     { platform_admin: 'V', executive: 'V', estate_manager: 'M', facility_manager: '-', technician: '-', resident: 'O', security: 'V', vendor: '-', investor: '-' },
  security_sos:           { platform_admin: 'V', executive: 'V', estate_manager: 'M', facility_manager: '-', technician: '-', resident: 'O', security: 'M', vendor: '-', investor: '-' },
  marketplace:            { platform_admin: 'V', executive: 'V', estate_manager: 'M', facility_manager: '-', technician: '-', resident: 'O', security: '-', vendor: 'O', investor: '-' },
  investor_projects:      { platform_admin: 'F', executive: 'V', estate_manager: '-', facility_manager: '-', technician: '-', resident: '-', security: '-', vendor: '-', investor: 'O' },
  reports_analytics:      { platform_admin: 'F', executive: 'V', estate_manager: 'M', facility_manager: 'M', technician: '-', resident: '-', security: '-', vendor: '-', investor: 'V' },
};

export const accessFor = (role: Role, cap: Capability): Access => PERMISSIONS[cap][role];

/** Item appears in nav at all. */
export const canSee = (role: Role, cap: Capability): boolean => PERMISSIONS[cap][role] !== '-';

/** Create / edit / transition affordances render. */
export const canManage = (role: Role, cap: Capability): boolean => {
  const a = PERMISSIONS[cap][role];
  return a === 'M' || a === 'F';
};

/** Read-only: the route renders, every write control is suppressed. Executive is this everywhere. */
export const isReadOnly = (role: Role, cap: Capability): boolean => PERMISSIONS[cap][role] === 'V';

/**
 * 'O — own records only'. The list is SCOPED, not filtered: a request without
 * the scope must still return only the actor's records (SC-01 deny-by-default).
 * Resident, Vendor, Investor and Technician all depend on this.
 */
export const isOwnScope = (role: Role, cap: Capability): boolean => PERMISSIONS[cap][role] === 'O';

/** Platform-level: crosses tenants. Only ever true for platform_admin. */
export const isPlatformScope = (role: Role, cap: Capability): boolean => PERMISSIONS[cap][role] === 'F' && role === 'platform_admin';

```

### src/config/shells.ts (`typescript`)

```typescript
/**
 * Shell = one authenticated layout + one URL prefix.
 *
 * Each shell is a plain folder under src/app with its own layout.tsx.
 * Route-group parentheses are NOT used here — they are reserved for
 * (marketing) and (auth), which share chrome without sharing a prefix,
 * and for (facility)/(estate) inside /app, which organise code without
 * touching URLs.
 *
 * One ROOT layout (fonts, tokens, ThemeProvider) sits above all of these,
 * so these are nested layouts — the documented "full page load between
 * different root layouts" caveat never applies and cross-shell navigation
 * stays client-side.
 */

import type { Role } from './roles';

export const SHELLS = ['ops', 'admin', 'resident', 'vendor', 'investor', 'gate'] as const;
export type Shell = (typeof SHELLS)[number];

export const SHELL_PREFIX: Record<Shell, string> = {
  ops:      '/app',
  admin:    '/admin',
  resident: '/resident',
  vendor:   '/vendor',
  investor: '/investor',
  gate:     '/gate',
};

/** The shell a role lands in. A user holding several roles chooses at /switch. */
export const ROLE_SHELL: Record<Role, Shell> = {
  platform_admin:   'admin',
  executive:        'ops',
  estate_manager:   'ops',
  facility_manager: 'ops',
  technician:       'ops',
  resident:         'resident',
  security:         'gate',
  vendor:           'vendor',
  investor:         'investor',
};

/** Which roles a shell admits. proxy.ts uses this as the prefix gate. */
export const SHELL_ROLES: Record<Shell, readonly Role[]> = {
  ops:      ['executive', 'estate_manager', 'facility_manager', 'technician'],
  admin:    ['platform_admin'],
  resident: ['resident'],
  vendor:   ['vendor'],
  investor: ['investor'],
  gate:     ['security'],
};

export const shellForPath = (pathname: string): Shell | null => {
  const hit = SHELLS.find((s) => pathname === SHELL_PREFIX[s] || pathname.startsWith(`${SHELL_PREFIX[s]}/`));
  return hit ?? null;
};

/** Chrome profile per shell — read by each layout.tsx. */
export type ShellChrome = {
  nav: 'sidebar-collapsible' | 'sidebar-pinned' | 'rail' | 'bottom-tabs' | 'top-nav';
  scopeSwitcher: 'estate' | 'tenant' | 'none';
  copilot: boolean;      // AI-F-05 / AI-S-01 slide-over
  sosAffordance: boolean; // EM-06
  syncBadge: boolean;    // §12.1 queued writes
  density: 'compact' | 'comfortable' | 'kiosk';
  themeToggle: boolean;
  drawerBreakpoint: number | null;
};

export const SHELL_CHROME: Record<Shell, ShellChrome> = {
  ops:      { nav: 'sidebar-collapsible', scopeSwitcher: 'estate', copilot: true,  sosAffordance: false, syncBadge: true,  density: 'compact',     themeToggle: true,  drawerBreakpoint: 880 },
  admin:    { nav: 'sidebar-collapsible', scopeSwitcher: 'tenant', copilot: true,  sosAffordance: false, syncBadge: false, density: 'compact',     themeToggle: true,  drawerBreakpoint: 880 },
  resident: { nav: 'bottom-tabs',         scopeSwitcher: 'none',   copilot: false, sosAffordance: true,  syncBadge: true,  density: 'comfortable', themeToggle: true,  drawerBreakpoint: 768 },
  vendor:   { nav: 'rail',                scopeSwitcher: 'none',   copilot: false, sosAffordance: false, syncBadge: false, density: 'compact',     themeToggle: true,  drawerBreakpoint: 880 },
  investor: { nav: 'top-nav',             scopeSwitcher: 'none',   copilot: false, sosAffordance: false, syncBadge: false, density: 'comfortable', themeToggle: true,  drawerBreakpoint: null },
  gate:     { nav: 'sidebar-pinned',      scopeSwitcher: 'none',   copilot: false, sosAffordance: true,  syncBadge: true,  density: 'kiosk',       themeToggle: false, drawerBreakpoint: null },
};

```

### src/config/nav.ts (`typescript`)

```typescript
/**
 * Role-aware navigation. Replaces the template's flat navGroups array.
 *
 * Every item declares the §7 capability row that gates it. Items whose
 * capability has no matching §7 row (Documents, Directory, Vendors, Spaces,
 * Notifications) carry an explicit `roles` list instead — see openIssues.
 *
 * Filtering here is cosmetic. SC-01 enforcement is server-side.
 */

import {
  Activity, AlertTriangle, Bell, Bot, Boxes, Building2, CalendarClock, CalendarDays,
  ClipboardCheck, Coins, CreditCard, FileBarChart, FileText, Gauge, Hammer, HeartPulse,
  Home, IdCard, LayoutGrid, LifeBuoy, ListChecks, MapPin, Megaphone, Package, Plug,
  Receipt, ScrollText, Search, Settings, Shield, ShieldAlert, ShoppingBag, Siren,
  Sparkles, Store, TrendingUp, Truck, UserCog, Users, UsersRound, Wallet, Wrench,
  type LucideIcon,
} from 'lucide-react';

import { type Capability, type Role, canManage, canSee } from './roles';
import { type Shell } from './shells';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** §7 row that gates visibility. */
  capability?: Capability;
  /** 'see' (default) shows on any non-'-' access; 'manage' requires M or F. */
  requires?: 'see' | 'manage';
  /** Explicit role list for items §7 has no row for. */
  roles?: readonly Role[];
  /** Tenant feature flag. Q5 gates ai_security_access; Q3 gates marketplace_payouts. */
  flag?: 'ai_security_access' | 'marketplace_payouts';
  /** Live count key resolved at render (open WOs, unread announcements, active SOS…). */
  badgeKey?: string;
};

export type NavGroup = { id: string; label: string; shell: Shell; items: NavItem[] };

export const NAV: NavGroup[] = [
  /* ── OPS SHELL ─────────────────────────────────────────────────────────── */
  { id: 'ops-overview', label: 'Overview', shell: 'ops', items: [
    { id: 'dashboard', label: 'Dashboard',  href: '/app',           icon: Gauge,    roles: ['executive', 'estate_manager', 'facility_manager', 'technician'] },
    { id: 'copilot',   label: 'Copilot',    href: '/app/copilot',   icon: Sparkles, roles: ['executive', 'estate_manager', 'facility_manager'] },
    { id: 'insights',  label: 'Insights',   href: '/app/insights',  icon: Activity, roles: ['executive', 'estate_manager', 'facility_manager'] },
    { id: 'notifs',    label: 'Alerts',     href: '/app/notifications', icon: Bell, roles: ['technician'], badgeKey: 'unread' },
  ]},

  { id: 'ops-maintenance', label: 'Maintenance', shell: 'ops', items: [
    { id: 'work-orders', label: 'Work orders', href: '/app/work-orders',        icon: Wrench,        capability: 'work_orders', badgeKey: 'wo_open' },
    { id: 'triage',      label: 'Triage queue', href: '/app/work-orders/triage', icon: ListChecks,   capability: 'work_orders', requires: 'manage', badgeKey: 'wo_untriaged' },
    { id: 'ppm',         label: 'PPM plans',    href: '/app/ppm',                icon: CalendarClock, capability: 'assets_ppm' },
    { id: 'ppm-cal',     label: 'PPM calendar', href: '/app/ppm/calendar',       icon: CalendarDays,  capability: 'assets_ppm' },
    { id: 'ppm-forecast',label: 'Predictive',   href: '/app/ppm/forecast',       icon: TrendingUp,    capability: 'assets_ppm', requires: 'manage' },
  ]},

  { id: 'ops-assets', label: 'Assets', shell: 'ops', items: [
    { id: 'assets', label: 'Asset register', href: '/app/assets', icon: Boxes,     capability: 'assets_ppm' },
    { id: 'spaces', label: 'Spaces',         href: '/app/spaces', icon: LayoutGrid, roles: ['executive', 'estate_manager', 'facility_manager'] },
  ]},

  { id: 'ops-quality', label: 'Quality', shell: 'ops', items: [
    { id: 'inspections', label: 'Inspections', href: '/app/inspections', icon: ClipboardCheck, capability: 'inspections_compliance' },
    { id: 'templates',   label: 'Templates',   href: '/app/inspections/templates', icon: FileText, capability: 'inspections_compliance', requires: 'manage' },
    { id: 'compliance',  label: 'Compliance',  href: '/app/compliance',  icon: Shield,        capability: 'inspections_compliance' },
  ]},

  { id: 'ops-supply', label: 'Supply', shell: 'ops', items: [
    { id: 'vendors', label: 'Vendors', href: '/app/vendors', icon: Truck, roles: ['executive', 'estate_manager', 'facility_manager'] },
  ]},

  { id: 'ops-finance', label: 'Finance', shell: 'ops', items: [
    { id: 'billing',   label: 'Billing',        href: '/app/billing',                icon: Coins,      capability: 'charges_invoicing' },
    { id: 'invoices',  label: 'Invoices',       href: '/app/billing/invoices',       icon: Receipt,    capability: 'charges_invoicing' },
    { id: 'payments',  label: 'Payments',       href: '/app/billing/payments',       icon: CreditCard, capability: 'charges_invoicing', requires: 'manage' },
    { id: 'arrears',   label: 'Arrears & risk', href: '/app/billing/arrears',        icon: AlertTriangle, capability: 'charges_invoicing', badgeKey: 'arrears' },
    { id: 'reminders', label: 'Reminders',      href: '/app/billing/reminders',      icon: Bell,       capability: 'charges_invoicing', requires: 'manage' },
    { id: 'recon',     label: 'Reconciliation', href: '/app/billing/reconciliation', icon: FileBarChart, capability: 'charges_invoicing', requires: 'manage' },
  ]},

  { id: 'ops-community', label: 'Community', shell: 'ops', items: [
    { id: 'residents',     label: 'Residents',     href: '/app/residents',            icon: UsersRound, roles: ['executive', 'estate_manager'] },
    { id: 'requests',      label: 'Requests',      href: '/app/requests',             icon: LifeBuoy,   capability: 'work_orders', requires: 'manage', badgeKey: 'req_open' },
    { id: 'announcements', label: 'Announcements', href: '/app/announcements',        icon: Megaphone,  capability: 'announcements' },
    { id: 'bookings',      label: 'Bookings',      href: '/app/bookings',             icon: CalendarDays, capability: 'bookings_amenities' },
    { id: 'security',      label: 'Security & SOS',href: '/app/security',             icon: ShieldAlert, capability: 'security_sos', badgeKey: 'sos_active' },
    { id: 'visitors',      label: 'Visitors',      href: '/app/security/visitors',    icon: IdCard,     capability: 'security_sos' },
    { id: 'ai-access',     label: 'AI access',     href: '/app/security/access',      icon: HeartPulse, capability: 'security_sos', requires: 'manage', flag: 'ai_security_access' },
    { id: 'directory',     label: 'Directory',     href: '/app/directory',            icon: Users,      roles: ['executive', 'estate_manager'] },
    { id: 'documents',     label: 'Documents',     href: '/app/documents',            icon: FileText,   roles: ['executive', 'estate_manager'] },
    { id: 'marketplace',   label: 'Marketplace',   href: '/app/marketplace',          icon: Store,      capability: 'marketplace' },
    { id: 'payouts',       label: 'Payouts',       href: '/app/marketplace/payouts',  icon: Wallet,     capability: 'marketplace', requires: 'manage', flag: 'marketplace_payouts' },
  ]},

  { id: 'ops-reporting', label: 'Reporting', shell: 'ops', items: [
    { id: 'reports', label: 'Reports', href: '/app/reports',     icon: FileBarChart, capability: 'reports_analytics' },
    { id: 'ask',     label: 'Ask',     href: '/app/reports/ask', icon: Search,       capability: 'reports_analytics' },
  ]},

  { id: 'ops-admin', label: 'Admin', shell: 'ops', items: [
    { id: 'users',    label: 'Users & roles', href: '/app/settings/users',        icon: UserCog,  capability: 'users_roles' },
    { id: 'org',      label: 'Organisation',  href: '/app/settings/organisation', icon: Building2, capability: 'tenant_config' },
    { id: 'settings', label: 'Settings',      href: '/app/settings',              icon: Settings, roles: ['executive', 'estate_manager', 'facility_manager', 'technician'] },
  ]},

  /* ── ADMIN SHELL ───────────────────────────────────────────────────────── */
  { id: 'admin-platform', label: 'Platform', shell: 'admin', items: [
    { id: 'a-overview', label: 'Overview',    href: '/admin',         icon: Gauge,   roles: ['platform_admin'] },
    { id: 'a-tenants',  label: 'Tenants',     href: '/admin/tenants', icon: Building2, roles: ['platform_admin'] },
    { id: 'a-users',    label: 'Users',       href: '/admin/users',   icon: Users,   roles: ['platform_admin'] },
    { id: 'a-roles',    label: 'Roles',       href: '/admin/roles',   icon: UserCog, roles: ['platform_admin'] },
  ]},
  { id: 'admin-ai', label: 'AI control', shell: 'admin', items: [
    { id: 'a-ai',        label: 'Overview',      href: '/admin/ai',              icon: Bot,        roles: ['platform_admin'] },
    { id: 'a-ai-log',    label: 'Interactions',  href: '/admin/ai/interactions', icon: ScrollText, roles: ['platform_admin'] },
    { id: 'a-ai-usage',  label: 'Usage & caps',  href: '/admin/ai/usage',        icon: Coins,      roles: ['platform_admin'] },
    { id: 'a-ai-prov',   label: 'Providers',     href: '/admin/ai/providers',    icon: Plug,       roles: ['platform_admin'] },
    { id: 'a-ai-evals',  label: 'Benchmarks',    href: '/admin/ai/evals',        icon: TrendingUp, roles: ['platform_admin'] },
    { id: 'a-ai-iso',    label: 'Isolation',     href: '/admin/ai/isolation',    icon: Shield,     roles: ['platform_admin'] },
  ]},
  { id: 'admin-ops', label: 'Platform ops', shell: 'admin', items: [
    { id: 'a-audit',   label: 'Audit log',     href: '/admin/audit',                  icon: ScrollText, roles: ['platform_admin'] },
    { id: 'a-integ',   label: 'Integrations',  href: '/admin/integrations',           icon: Plug,       roles: ['platform_admin'] },
    { id: 'a-notifs',  label: 'Notifications', href: '/admin/notifications/delivery', icon: Bell,       roles: ['platform_admin'] },
    { id: 'a-comply',  label: 'Compliance',    href: '/admin/compliance',             icon: Shield,     roles: ['platform_admin'] },
    { id: 'a-health',  label: 'Health',        href: '/admin/health',                 icon: HeartPulse, roles: ['platform_admin'] },
  ]},
  { id: 'admin-investor', label: 'Investor', shell: 'admin', items: [
    { id: 'a-projects', label: 'Projects', href: '/admin/investors/projects', icon: Building2, roles: ['platform_admin'] },
    { id: 'a-leads',    label: 'Leads',    href: '/admin/investors/leads',    icon: TrendingUp, roles: ['platform_admin'] },
  ]},

  /* ── RESIDENT SHELL ────────────────────────────────────────────────────── */
  { id: 'res-primary', label: '', shell: 'resident', items: [
    { id: 'r-home',      label: 'Home',         href: '/resident',              icon: Home,      roles: ['resident'] },
    { id: 'r-pay',       label: 'Pay',          href: '/resident/payments',     icon: Wallet,    roles: ['resident'], badgeKey: 'balance_due' },
    { id: 'r-requests',  label: 'Requests',     href: '/resident/requests',     icon: LifeBuoy,  roles: ['resident'] },
    { id: 'r-book',      label: 'Book',         href: '/resident/bookings',     icon: CalendarDays, roles: ['resident'] },
    { id: 'r-visitors',  label: 'Visitors',     href: '/resident/visitors',     icon: IdCard,    roles: ['resident'] },
    { id: 'r-news',      label: 'Announcements',href: '/resident/announcements',icon: Megaphone, roles: ['resident'], badgeKey: 'unread' },
    { id: 'r-shop',      label: 'Marketplace',  href: '/resident/marketplace',  icon: ShoppingBag, roles: ['resident'] },
    { id: 'r-directory', label: 'Directory',    href: '/resident/directory',    icon: Users,     roles: ['resident'] },
    { id: 'r-docs',      label: 'Documents',    href: '/resident/documents',    icon: FileText,  roles: ['resident'] },
    { id: 'r-help',      label: 'Help',         href: '/resident/help',         icon: Bot,       roles: ['resident'] },
    { id: 'r-settings',  label: 'Settings',     href: '/resident/settings/profile', icon: Settings, roles: ['resident'] },
  ]},

  /* ── VENDOR SHELL ──────────────────────────────────────────────────────── */
  { id: 'ven-primary', label: '', shell: 'vendor', items: [
    { id: 'v-home',  label: 'Home',        href: '/vendor',             icon: Home,      roles: ['vendor'] },
    { id: 'v-jobs',  label: 'Jobs',        href: '/vendor/jobs',        icon: Hammer,    roles: ['vendor'], badgeKey: 'jobs_new' },
    { id: 'v-inv',   label: 'Invoices',    href: '/vendor/invoices',    icon: Receipt,   roles: ['vendor'] },
    { id: 'v-list',  label: 'Listings',    href: '/vendor/listings',    icon: Package,   roles: ['vendor'] },
    { id: 'v-ord',   label: 'Orders',      href: '/vendor/orders',      icon: ShoppingBag, roles: ['vendor'], badgeKey: 'orders_pending' },
    { id: 'v-pay',   label: 'Payouts',     href: '/vendor/payouts',     icon: Wallet,    roles: ['vendor'], flag: 'marketplace_payouts' },
    { id: 'v-prof',  label: 'Company',     href: '/vendor/profile',     icon: Building2, roles: ['vendor'] },
    { id: 'v-docs',  label: 'Documents',   href: '/vendor/documents',   icon: FileText,  roles: ['vendor'] },
    { id: 'v-perf',  label: 'Performance', href: '/vendor/performance', icon: TrendingUp, roles: ['vendor'] },
  ]},

  /* ── INVESTOR SHELL ────────────────────────────────────────────────────── */
  { id: 'inv-primary', label: '', shell: 'investor', items: [
    { id: 'i-overview', label: 'Overview',  href: '/investor',           icon: Gauge,       roles: ['investor'] },
    { id: 'i-projects', label: 'Projects',  href: '/investor/projects',  icon: Building2,   roles: ['investor'] },
    { id: 'i-reports',  label: 'Reports',   href: '/investor/reports',   icon: FileBarChart, roles: ['investor'] },
    { id: 'i-docs',     label: 'Documents', href: '/investor/documents', icon: FileText,    roles: ['investor'] },
    { id: 'i-settings', label: 'Settings',  href: '/investor/settings/profile', icon: Settings, roles: ['investor'] },
  ]},

  /* ── GATE SHELL ────────────────────────────────────────────────────────── */
  { id: 'gate-primary', label: '', shell: 'gate', items: [
    { id: 'g-board',   label: 'Live board',   href: '/gate',                   icon: Gauge,     roles: ['security'] },
    { id: 'g-sos',     label: 'SOS',          href: '/gate/sos',               icon: Siren,     roles: ['security'], badgeKey: 'sos_active' },
    { id: 'g-visitors',label: 'Visitors',     href: '/gate/visitors',          icon: IdCard,    roles: ['security'] },
    { id: 'g-verify',  label: 'Verify pass',  href: '/gate/visitors/verify',   icon: MapPin,    roles: ['security'] },
    { id: 'g-patrols', label: 'Patrols',      href: '/gate/patrols',           icon: ClipboardCheck, roles: ['security'] },
    { id: 'g-inc',     label: 'Incidents',    href: '/gate/incidents',         icon: AlertTriangle, roles: ['security'] },
    { id: 'g-book',    label: 'Today',        href: '/gate/bookings',          icon: CalendarDays, roles: ['security'] },
    { id: 'g-news',    label: 'Announcements',href: '/gate/announcements',     icon: Megaphone, roles: ['security'] },
  ]},
];

const visible = (item: NavItem, role: Role, flags: ReadonlySet<string>): boolean => {
  if (item.flag && !flags.has(item.flag)) return false;
  if (item.roles) return item.roles.includes(role);
  if (!item.capability) return false;
  return item.requires === 'manage'
    ? canManage(role, item.capability)
    : canSee(role, item.capability);
};

/** The sidebar for a role, with empty groups dropped. */
export function navForRole(role: Role, shell: Shell, flags: ReadonlySet<string> = new Set()): NavGroup[] {
  return NAV
    .filter((g) => g.shell === shell)
    .map((g) => ({ ...g, items: g.items.filter((i) => visible(i, role, flags)) }))
    .filter((g) => g.items.length > 0);
}

```

### proxy.ts (`typescript`)

```typescript
/**
 * Route gate. Project root — Next.js 16 renamed `middleware.ts` to `proxy.ts`.
 *
 * Responsibilities, in order:
 *   1. let public routes through
 *   2. require a session
 *   3. keep each role inside its own shell prefix
 *   4. forward tenant + estate scope as headers (never as a root route param —
 *      unstable_rootParams was removed in Next 16)
 *
 * NOT a security boundary. SC-01 requires deny-by-default enforcement on every
 * API; this only prevents a wrong-shell render. Per the docs, proxy runs
 * separately from render code and must not rely on shared modules or globals,
 * so the role → prefix table is inlined rather than imported from src/config.
 */

import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = [
  /^\/$/,
  /^\/register-interest$/,
  /^\/legal(\/|$)/,
  /^\/login(\/|$)/,
  /^\/forgot-password$/,
  /^\/reset-password\//,
  /^\/invite\//,
  /^\/verify\//,   // public visitor-pass QR landing (EM-02) — read-only, no check-in action
  /^\/no-access$/,
];

const SHELL_PREFIXES = ['/app', '/admin', '/resident', '/vendor', '/investor', '/gate'] as const;

const ROLE_SHELL: Record<string, string> = {
  platform_admin: '/admin',
  executive: '/app',
  estate_manager: '/app',
  facility_manager: '/app',
  technician: '/app',
  resident: '/resident',
  security: '/gate',
  vendor: '/vendor',
  investor: '/investor',
};

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();

  // Session claims arrive verified from the auth layer.
  const activeRole = request.cookies.get('active_role')?.value;
  const tenantId   = request.cookies.get('tenant_id')?.value;
  const estateId   = request.cookies.get('estate_scope')?.value;

  if (!activeRole) {
    const to = new URL('/login', request.url);
    to.searchParams.set('next', pathname + search);
    return NextResponse.redirect(to);
  }

  const allowed = ROLE_SHELL[activeRole];
  if (!allowed) return NextResponse.redirect(new URL('/no-access', request.url));

  const requested = SHELL_PREFIXES.find((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Bare authenticated URL → the role's own shell.
  if (!requested) return NextResponse.redirect(new URL(allowed, request.url));

  // Wrong shell → /switch, which lets multi-role users change hats rather than
  // dead-ending someone who legitimately holds two roles.
  if (requested !== allowed) return NextResponse.redirect(new URL('/switch', request.url));

  const headers = new Headers(request.headers);
  if (tenantId) headers.set('x-tenant-id', tenantId);
  if (estateId) headers.set('x-estate-scope', estateId);
  headers.set('x-active-role', activeRole);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|woff2)$).*)'],
};

```

### src/config/status.ts (`typescript`)

```typescript
/**
 * §10 state machines. Replaces the template's LoadStatus / STATUS_COLORS.
 *
 * "Only the listed transitions are legal; every transition is timestamped,
 * actor-attributed and notified via SC-09." Detail screens must render their
 * action buttons FROM the transition table, not from a fixed button set.
 *
 * SLA values are proposed defaults, configurable per tenant.
 */

export type Domain = 'work_order' | 'invoice' | 'booking' | 'sos' | 'order';

/* ── Work order (FM-03) ────────────────────────────────────────────────── */
export const WORK_ORDER_STATES = [
  'New', 'Triaged', 'Assigned', 'In Progress', 'On Hold',
  'Resolved', 'Verified', 'Closed', 'Rejected', 'Cancelled',
] as const;
export type WorkOrderState = (typeof WORK_ORDER_STATES)[number];

/** §10 lists the happy path plus Rejected/Cancelled branches. Entry points for
 *  the branches, and any return from On Hold, are NOT specified — see openIssues. */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderState, readonly WorkOrderState[]> = {
  'New':         ['Triaged', 'Rejected', 'Cancelled'],
  'Triaged':     ['Assigned', 'Rejected', 'Cancelled'],
  'Assigned':    ['In Progress', 'On Hold', 'Cancelled'],
  'In Progress': ['On Hold', 'Resolved', 'Cancelled'],
  'On Hold':     ['In Progress', 'Cancelled'],        // return path assumed — CONFIRM
  'Resolved':    ['Verified', 'In Progress'],          // reopen path assumed — CONFIRM
  'Verified':    ['Closed'],
  'Closed':      [],
  'Rejected':    [],
  'Cancelled':   [],
};

/** Proposed per-priority SLA, in hours. */
export const WORK_ORDER_SLA = {
  Emergency: { respondH: 2,  resolveH: 24 },
  Routine:   { respondH: 72, resolveH: 72 },
} as const;

/** Resolved → auto-close after 5 days if not Verified (proposed). */
export const WORK_ORDER_AUTOCLOSE_DAYS = 5;

/* ── Service charge / invoice (EM-01) ──────────────────────────────────── */
/** Two parallel branches: the payment chain and the arrears chain. */
export const INVOICE_STATES = [
  'Draft', 'Issued', 'Partially Paid', 'Paid',
  'Overdue', 'In Arrears', 'Escalated',
] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];

export const INVOICE_TRANSITIONS: Record<InvoiceState, readonly InvoiceState[]> = {
  'Draft':          ['Issued'],
  'Issued':         ['Partially Paid', 'Paid', 'Overdue'],
  'Partially Paid': ['Paid', 'Overdue'],
  'Paid':           [],
  'Overdue':        ['In Arrears', 'Partially Paid', 'Paid'],
  'In Arrears':     ['Escalated', 'Partially Paid', 'Paid'],
  'Escalated':      ['Partially Paid', 'Paid'],
};

/** Reminder schedule in days relative to due date (proposed). AI-E-03 may
 *  suggest alternative timing; a manager approves every campaign. */
export const REMINDER_OFFSETS_DAYS = [-3, 0, 7, 21] as const;

/* ── Booking (EM-05) ───────────────────────────────────────────────────── */
export const BOOKING_STATES = [
  'Requested', 'Approved', 'Auto-approved', 'Confirmed',
  'Completed', 'Declined', 'Cancelled',
] as const;
export type BookingState = (typeof BOOKING_STATES)[number];

export const BOOKING_TRANSITIONS: Record<BookingState, readonly BookingState[]> = {
  'Requested':     ['Approved', 'Auto-approved', 'Declined', 'Cancelled'],
  'Approved':      ['Confirmed', 'Cancelled'],   // payment required to confirm where fees apply
  'Auto-approved': ['Confirmed', 'Cancelled'],
  'Confirmed':     ['Completed', 'Cancelled'],
  'Completed':     [],
  'Declined':      [],
  'Cancelled':     [],
};

/* ── SOS event (EM-06) ─────────────────────────────────────────────────── */
export const SOS_STATES = ['Raised', 'Acknowledged', 'Responding', 'Resolved', 'Reviewed'] as const;
export type SosState = (typeof SOS_STATES)[number];

export const SOS_TRANSITIONS: Record<SosState, readonly SosState[]> = {
  'Raised':       ['Acknowledged'],
  'Acknowledged': ['Responding'],
  'Responding':   ['Resolved'],
  'Resolved':     ['Reviewed'],   // Reviewed is manager-side (/app), not gate-side (/gate)
  'Reviewed':     [],
};

/** Acknowledge target during manned hours (proposed). Unacknowledged alerts
 *  escalate to backup responders. Operating model pending Q4. */
export const SOS_ACK_TARGET_SECONDS = 60;

/* ── Marketplace order (EM-09) ─────────────────────────────────────────── */
export const ORDER_STATES = ['Placed', 'Accepted', 'Fulfilled', 'Closed', 'Declined', 'Refunded'] as const;
export type OrderState = (typeof ORDER_STATES)[number];

export const ORDER_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  'Placed':    ['Accepted', 'Declined'],   // auto-expires if the vendor misses the accept SLA
  'Accepted':  ['Fulfilled', 'Refunded'],
  'Fulfilled': ['Closed', 'Refunded'],
  'Closed':    [],
  'Declined':  [],
  'Refunded':  [],
};

/* ── Colour scale ──────────────────────────────────────────────────────── */
/** StatusPill needs a `domain` prop: 'Closed' and 'Resolved' mean different
 *  things across machines, so a single flat map would mis-colour them. */
export const STATUS_COLORS: Record<Domain, Record<string, string>> = {
  work_order: {
    'New': '#8b93a1', 'Triaged': '#3b82f6', 'Assigned': '#8b5cf6',
    'In Progress': '#f59e0b', 'On Hold': '#a16207', 'Resolved': '#10b981',
    'Verified': '#059669', 'Closed': '#6b7280', 'Rejected': '#ef4444', 'Cancelled': '#6b7280',
  },
  invoice: {
    'Draft': '#8b93a1', 'Issued': '#3b82f6', 'Partially Paid': '#f59e0b',
    'Paid': '#10b981', 'Overdue': '#f97316', 'In Arrears': '#ef4444', 'Escalated': '#b91c1c',
  },
  booking: {
    'Requested': '#3b82f6', 'Approved': '#8b5cf6', 'Auto-approved': '#8b5cf6',
    'Confirmed': '#10b981', 'Completed': '#6b7280', 'Declined': '#ef4444', 'Cancelled': '#6b7280',
  },
  sos: {
    'Raised': '#ef4444', 'Acknowledged': '#f97316', 'Responding': '#f59e0b',
    'Resolved': '#10b981', 'Reviewed': '#6b7280',
  },
  order: {
    'Placed': '#3b82f6', 'Accepted': '#8b5cf6', 'Fulfilled': '#10b981',
    'Closed': '#6b7280', 'Declined': '#ef4444', 'Refunded': '#a16207',
  },
};

export const colorFor = (domain: Domain, state: string): string =>
  STATUS_COLORS[domain][state] ?? '#8b93a1';

/** Filter-chip rows derive mechanically from the machines — write once, not per page. */
export const FILTERS: Record<Domain, readonly string[]> = {
  work_order: WORK_ORDER_STATES,
  invoice:    INVOICE_STATES,
  booking:    BOOKING_STATES,
  sos:        SOS_STATES,
  order:      ORDER_STATES,
};

```

### docs/route-map.txt (`text`)

```text
FACILITY & ESTATE MANAGEMENT PLATFORM — WEB APP + ADMIN DASHBOARD (SC-06)
Next.js 16 App Router. ~208 page.tsx files across 6 authenticated shells + 2 public groups.

src/app/
  layout.tsx                                 ROOT ONLY: <html lang>, Inter Tight + JetBrains Mono,
                                             themeInitScript, ThemeProvider. NO AppShell.
  not-found.tsx · error.tsx · globals.css

  (marketing)/layout.tsx                     MarketingShell — public header/footer
    page.tsx                                 '/'                                        SC-11
    register-interest/page.tsx               lead capture → investor pipeline           SC-11 · AI-S-04
    legal/privacy · terms · data-request     NDPA notices + DSR intake                  §12

  (auth)/layout.tsx                          AuthShell — centred card
    login · login/mfa                        session/password policy, MFA (proposed)    SC-01
    forgot-password · reset-password/[token] SC-01
    invite/[token]                           resident EM-02 · vendor FM-05 · staff SC-01
    switch                                   multi-role context chooser                 SC-01
    no-access                                403 landing (forbidden.tsx still experimental)

  verify/[passCode]/page.tsx                 PUBLIC QR target, read-only                EM-02

─── /app  OPS SHELL — Executive · Estate Manager · Facility Manager · Technician ───
  app/layout.tsx    sidebar (role-filtered) · estate scope switcher · copilot slide-over · sync badge
  app/page.tsx                               role-adaptive dashboard      FM-07 · EM-01 · AI-F-04
  app/copilot                                                             AI-F-05 · AI-S-01
  app/insights                               anomaly cards + drill-down   AI-F-04
  app/notifications                                                       SC-09

  app/(facility)/
    assets · assets/new · assets/import                                   FM-01
    assets/[assetId] · /history · /ppm · /documents                       FM-01 · FM-02 · AI-S-03
    ppm · ppm/new · ppm/[planId] · ppm/calendar                           FM-02
    ppm/forecast                             draft schedule, FM approves  AI-F-01
    work-orders · /board · /new                                           FM-03 · §10
    work-orders/triage                       suggestions + confidence     AI-F-02 · AI-E-02
    work-orders/[woId] · /costs · /activity                               FM-03 · SC-10
    inspections · /templates · /templates/[templateId]                    FM-06
    inspections/[runId]                      vision defects + draft report AI-F-03
    compliance                               obligations + vendor expiry  FM-06 · FM-05
    vendors · /invite · /[vendorId] · /documents · /invoices · /performance  FM-05
    spaces · /import · /[spaceId]                                         FM-04 · §8.2

  app/(estate)/
    billing · /charges · /charges/[chargeId]                              EM-01
    billing/invoices · /invoices/[invoiceId]                              EM-01 · SC-02 · §10
    billing/payments · /reconciliation                                    SC-02 · Q10
    billing/arrears                          risk scores + anomaly flags  EM-01 · AI-E-03
    billing/reminders                        manager-approved campaigns   AI-E-03 · SC-09
    billing/statements · /exports                                         EM-01
    residents · /invite · /movements · /[residentId]                      EM-02
    requests · /[requestId]                  intake → FM-03 pipeline      EM-03
    announcements · /new · /[announcementId] draft/translate, approve     EM-04 · AI-E-04
    bookings · /amenities · /amenities/[id] · /[bookingId]                EM-05 · §10
    security · /sos · /sos/[eventId] · /incidents · /patrols · /visitors  EM-06 · EM-02
    security/access                          FLAG OFF until Q5 DPIA       AI-E-06
    directory                                                             EM-07
    documents · /search · /[docId]                                        EM-08 · AI-S-03
    marketplace · /listings · /orders · /review-queue                     EM-09 · AI-E-05
    marketplace/payouts                      BLOCKED by Q3                EM-09

  app/reports · /[reportId]                                               FM-07
  app/reports/ask                            NL reporting, traceable      AI-S-02
  app/settings/  profile · notifications · security · organisation(V) · users · roles ·
                 estates · charge-structures · amenity-rules · templates ·
                 payments(V) · ai · languages     SC-01 · SC-09 · SC-02 · §8.2 · §11.4 · Q6

─── /admin  PLATFORM ADMIN CONSOLE ───
  admin/layout.tsx   platform sidebar · global tenant search · environment badge · NO estate scope
  admin · admin/tenants · /new                                            SC-07 · §8.2
  admin/tenants/[tenantId]/ estates · branding · payments · features ·
                            usage · users · audit · operations(read-only) §8.2 · §11.4 · SC-10 · §7
  admin/users · admin/roles                                               SC-01 · §7
  admin/audit                                immutable, 12-month, queryable SC-10
  admin/ai · /interactions · /usage · /providers · /evals · /isolation     AI-S-06 · §11 · §11.4
  admin/integrations · /webhooks                                          SC-03 · SC-02 · §13.2
  admin/notifications/templates · /delivery                               SC-09
  admin/investors · /projects · /projects/[id] · /leads                   SC-08 · SC-11 · AI-S-04
  admin/compliance                           consent, DPIA, residency     §12 · Q5 · Q7
  admin/health                               P95, availability, RPO/RTO   §12
  admin/settings

─── /resident  RESIDENT APP ───
  resident/layout.tsx  bottom tabs <880px · persistent SOS · balance chip · sync badge
  resident · payments · /invoices/[id] · /checkout/[id] · /receipts · /statement  EM-01 · SC-02
  requests · /new · /[id]                                                 EM-03 · AI-E-02
  announcements · /[id]                                                   EM-04 (V)
  bookings · /amenities · /amenities/[id] · /[id]                         EM-05 · SC-04
  visitors · /new · /[passId]                                             EM-02
  sos                                        SMS fallback (proposed)      EM-06 · §12.1
  marketplace · /listings/[id] · /cart · /checkout · /orders · /orders/[id]  EM-09 · SC-04
  directory · documents                                                   EM-07 · EM-08
  help                                       grounded or escalate         AI-E-01 → EM-03
  settings/ profile · notifications · units · privacy                     SC-01 · SC-09 · EM-02 · §12

─── /vendor  VENDOR PORTAL ───
  vendor/layout.tsx  narrow rail · SLA countdown · vendor org branding
  vendor · jobs · jobs/[woId]                                             FM-03(O) · FM-05 · §10
  invoices · /new · /[id]                                                 FM-05
  listings · /new · /[id]                                                 EM-09 · AI-E-05
  orders · /[id]                             accept-within-SLA or expire  EM-09 · §10
  payouts                                    BLOCKED by Q3                EM-09
  profile · documents · performance                                       FM-05
  settings/notifications                                                  SC-09

─── /investor  INVESTOR DASHBOARD ───
  investor/layout.tsx  top nav · chart-first · permanent estimate disclaimer band
  investor · projects · projects/[id]                                     SC-08
  projects/[id]/sales · /occupancy                                        SC-08 · AI-S-04
  projects/[id]/forecast                     estimates + assumptions      AI-S-04
  reports (V) · documents                                                 §7 · FM-07 · EM-08
  settings/ profile · notifications                                       SC-01 · SC-09

─── /gate  GATEHOUSE (Security) ───
  gate/layout.tsx  pinned nav · kiosk density · permanent live SOS banner · no theme toggle
  gate                                       live board                   EM-06 · EM-02
  sos · sos/[eventId]                        <60s ack (proposed)          EM-06 · §10 · Q4
  visitors · /verify · /verify/[passCode] · /log                          EM-02 · §12
  patrols · /[patrolId] · incidents · /new                                EM-06 · SC-10
  bookings (V) · announcements (V)                                        EM-05 · EM-04
  settings/notifications                                                  SC-09

─── ROUTE-GROUP RULES ───
  · Parens ONLY on (marketing), (auth) — shared chrome, no shared prefix — and
    (facility)/(estate) inside /app — code organisation, no URL effect.
  · Shells are plain folders: each owns a URL segment, so parens add nothing.
  · ONE root layout.tsx keeps fonts/tokens/theme single-sourced → cross-shell
    navigation stays client-side (the full-reload caveat applies only to
    MULTIPLE ROOT layouts).
  · (facility) and (estate) must never claim the same path — documents and
    directory belong to (estate); compliance and vendors to (facility).
  · Any @copilot / @modal parallel slot REQUIRES an explicit default.tsx or the
    Next 16 build fails.

```

## Open issues
- §7 has no capability row for Documents (EM-08), Directory (EM-07), Vendors (FM-05) or Spaces (FM-04), yet all four are required features with clear per-role relevance. I have gated them with explicit role lists in nav.ts as a stopgap. The matrix is described as 'the authoritative baseline' with 'fine-grained permissions per endpoint finalised at design' — these four rows need adding at design, not inventing in the UI.
- §7 gives Technician '-' on Announcements, meaning technicians cannot see estate announcements at all. That reads like an oversight against SC-09's 'As a user, I get the right alerts on the right channel'. Confirm whether Technician should be 'V'.
- §7 gives Security '-' on Work orders, but EM-06 requires incident logging and FM-06 auto-raises work orders from failed inspection items. If a guard logging an incident should be able to raise a maintenance job, Security needs at least 'O' on work_orders. Confirm the intended flow.
- §7 gives Facility Manager '-' on Charges & invoicing, yet FM-03 requires capturing 'parts and costs' on a work order and FM-07 requires 'cost by category/estate'. Confirm that work-order cost capture is governed by the work_orders row, not charges_invoicing — otherwise the FM cannot complete a work order.
- §7 gives Executive 'V' on Investor projects, but SC-08's surfaces are specified for the Investor role and Platform Admin owns authoring ('F'). There is no defined route for an Executive to exercise that view. I propose a read-only mount under /app rather than granting Executive access to the /admin prefix — needs confirming.
- SC-10's acceptance criterion says the audit log is 'queryable from the admin console', which places it at /admin/audit. Whether Estate Manager or Facility Manager get any tenant-scoped audit view is unspecified and §7 has no audit row. I have marked /app/settings/audit as optional and left it out of the default nav.
- Q1 (who exactly is a 'tenant' — 7 Fifteen Capital's own estates, or third-party operators too) determines whether tenancy ever needs to appear in the URL. My recommendation defers this cleanly: session-derived tenant now, subdomain resolution added in proxy.ts later if needed, with no route churn either way. But it must be answered by kickoff as the PRD requires.
- Q3 (marketplace commission, escrow, payout rails, KYC) blocks /app/marketplace/payouts and /vendor/payouts. Both routes are in the map with a disabled state. The rest of EM-09 is unblocked.
- Q5 (proceed with AI-E-06 CCTV/biometrics) gates /app/security/access behind a feature flag defaulting off. §12 forbids any AI-E-06 work before DPIA sign-off, so the route must ship inert, and the nav item must not appear until the flag is on.
- Q6 (launch language list) determines whether a [locale] URL segment is ever needed. I recommend NOT adding one now — cookie/header negotiation with externalised strings — because adding it later is a mechanical proxy rewrite while carrying it across ~208 routes from the start is a permanent tax. If Q6 returns languages that matter for public SEO, add locale segments to (marketing) only.
- §10's work-order machine lists 'New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed; branches: Rejected, Cancelled' but does not specify which states may enter Rejected or Cancelled, whether On Hold returns to In Progress, or whether Resolved can be reopened. The PRD says 'only the listed transitions are legal', so these need pinning down before the transition table drives UI actions. I have marked my assumptions with CONFIRM in status.ts.
- §10's service-charge machine has two branches ('Draft → Issued → Partially paid → Paid' and 'Issued → Overdue → In arrears → Escalated') without stating how they interact — specifically whether a partially paid invoice can also be Overdue. This is a filter-UI and a data-model question, not just a display one.
- Q4 (SOS operating model: responders, escalation chain, liability, manned hours) shapes /gate/sos and the escalation UI. The <60s acknowledgement target is proposed and drives the GateShell design; if manned hours are limited, the shell needs an unmanned state that the PRD does not currently describe.
- The PRD does not state whether a single user may hold multiple roles simultaneously (e.g. Estate Manager who is also a Resident of a unit). §8.1 says 'User + Role(s)' — plural — which implies yes. My IA assumes yes and provides /switch. If roles are actually exclusive per user account, /switch can be dropped and proxy.ts simplifies.
- SC-06's acceptance criterion is 'responsive web app for residents/managers; platform admin console'. It does not explicitly name web surfaces for Vendor, Security or Investor. FM-05 requires a vendor portal and SC-08 requires an investor dashboard, so those are covered by other requirements; Security's web surface is inferred from EM-06 rather than stated. Worth confirming that /gate is in web scope rather than mobile-only under SC-05.
- forbidden.tsx and unauthorized.tsx are still marked experimental in Next 16 and require the experimental.authInterrupts config flag. I have routed around them with an explicit /no-access page. If the team wants proper 401/403 status codes on denied routes, that flag decision needs making early.
