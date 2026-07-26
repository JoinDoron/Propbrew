# Domain model (entities, fields, relationships, enums, tenancy)

## Summary
Extracted the buildable domain model from PRD v2.0 §8.1 plus every acceptance criterion in §9 (FM-01…08, EM-01…09, SC-01…11), the state machines in §10, AI guardrails in §11.4 and the NFR/offline clauses in §12. §8.1 names 18 entities; the acceptance criteria force ~55 concrete tables — §8.1 collapses distinct records (Charge vs Invoice vs Statement; Vendor vs VendorDocument; Inspection vs InspectionTemplate vs ComplianceObligation; Listing vs Order vs Payout) and omits entities that requirements make mandatory (AuditLog SC-10; Notification/Template/Preference SC-09; MaintenanceRequest EM-03; Amenity EM-05; PatrolLog/Incident EM-06; ImportJob FM-01; UsageMeter §8.2; ConsentRecord §12; SyncQueueItem §12.1; InvestorAccess SC-08). Tenancy is six levels (Platform → Tenant → Estate/Facility → Building → Floor → Unit → Residents/Assets) with tenantId on every record per §8.2 hard isolation, plus per-tenant storage prefixes and vector-store namespaces. Five enums are exactly enumerated by the PRD (the §10 state machines); asset status, occupancy status, defect severity, the full priority ladder and payment status are only implied and ship as marked PROPOSED_* placeholders rather than invented fact. Note: the target scaffold now lives at /Users/samuelomosehin/developer/vesta (cargoflow-next no longer exists) and has no src/domain; STATUS_COLORS in src/components/ui/index.tsx is keyed to LoadStatus and must be re-pointed at the domain status tones.

### Tenancy hierarchy and universal tenant scoping
*Requirements: SC-07, SC-01, AI-S-06, FM-01, FM-04*

§8.2: Platform → Tenant → Estates/Facilities → Buildings → Units → Residents/Assets, and 'Every domain record carries its tenant scope.' FM-01 and FM-04 add a Floor level (estate→building→floor→unit/zone) that §8.2's list omits — model Floor as an optional level. Enforcement is two-layer: application + database (row-level security proposed, ADR-01/Q2), tenant-scoped object storage, per-tenant vector-store namespaces. Hard isolation: no query, file, search index, AI retrieval or report crosses tenants below Platform Admin; cross-tenant tests are release-blocking in CI (SC-07, AI-S-06). Practical model: every entity extends TenantScoped { tenantId }, and location-bearing entities carry a nullable SpaceRef { estateId, buildingId, floorId, unitId }. Platform Admin is above tenant, so User.tenantId must be nullable for that role only.

### Tenant, TenantConfiguration, settlement account, usage metering
*Requirements: SC-07, SC-09, SC-02, AI-S-06*

Tenant is the isolation boundary: has estates/facilities, users, configuration, payment account (§8.1). Onboarding (§8.2, SC-07): Platform Admin creates the organisation, then configures estates/units by bulk import, branding, payment settlement account, languages, enabled features — no code changes. Per-tenant configuration covers branding, notification templates, amenity rules, charge structures, AI feature flags and usage caps. Additional config forced by other requirements: SLA timers per priority (§10, configurable per tenant), arrears reminder schedule (−3d, due, +7d, +21d) and escalation policy (§10), work-order auto-close window (5 days proposed), retention schedule per entity (§12), data residency (Q7), languages (Q6). Cost metering: AI, SMS and email usage metered per tenant (§8.2, §15.2) → UsageMeter records feeding caps, alert thresholds and kill-switches (§11.4, Q12). Branding maps directly onto the scaffold's src/config/brand.ts (name, tagline, primaryColor).

### Estate/Facility, Building, Floor, Unit/Space
*Requirements: FM-04, EM-01, SC-03*

Estate/Facility is one entity with a kind discriminator — glossary distinguishes Estate (residential/mixed community: units, residents, amenities, security) from Facility (managed building/site with assets, maintenance, compliance). Belongs to tenant; has buildings, units, amenities, staff (§8.1). Unit/Space is 'an addressable space (apartment, office, zone)' linking residents, assets, charges and bookings. FM-04: the estate→building→floor→unit/zone hierarchy is maintained once and shared with the Estate module — one space table serves both modules, never duplicated. FM-04 also requires occupancy/allocation status per space, and spaces link to assets, bookings and residents. EM-01 requires unit type and size on the unit because charge setup is 'per unit type/size'. Maps/geocoding per SC-03 implies a geo point on estate/building.

### User, Role, RoleAssignment, Session — 9 roles, deny-by-default
*Requirements: SC-01, SC-09, SC-06*

SC-01: roles and access per §7, tenant- and estate-scoped, deny-by-default on every API — server-side, not UI. Nine roles: Platform Admin, Owner/Executive, Estate Manager, Facility Manager, Technician, Resident, Security, Vendor, Investor. RoleAssignment is separate from User because roles are scoped per tenant and, where relevant, per estate — a user can hold different roles in different estates. Session and password policy required; MFA for admin roles (proposed, also §12 Security). User carries notification channel preferences and quiet hours (SC-09) and locale (§12 Localization). Resident links user → unit(s); vendor links user → vendor org (§8.1). The §7 matrix has 13 capability rows × 9 roles with levels F/M/V/O/— and is the authoritative permission baseline; encode it as data, not as scattered conditionals.

### Resident and HouseholdMember
*Requirements: EM-02, EM-03, EM-01, EM-05, EM-06, EM-09, EM-08*

EM-02: resident onboarding is invite + profile, linked to unit(s); move-in/move-out supported; household members supported. So Resident is a link record (userId → unitId) with status (invited/active/moved_out), moveInDate, moveOutDate, and a primary flag when a household has several residents on one unit. HouseholdMember hangs off Resident. Residents raise maintenance requests (EM-03), issue visitor passes (EM-02), pay charges (EM-01/SC-02), make bookings (EM-05), trigger SOS (EM-06), place marketplace orders (EM-09) and see documents shared to their audience (EM-08). Per §7 a Resident has 'O' (own records only) on users/roles, work orders, charges, payments, bookings, security, marketplace — every resident-facing query must filter to their own records, not merely their tenant.

### Vendor org, VendorDocument with expiry alerts, performance metrics
*Requirements: FM-05, EM-09, EM-07, FM-03*

FM-05: vendor profiles carry services, coverage and documents (insurance/certifications) with expiry alerts — so VendorDocument needs type, expiryDate and an alert-sent marker driving SC-09 notifications. Vendors receive assignments and submit updates and invoices via a vendor portal, which makes VendorInvoice a distinct payable separate from the resident-facing Invoice of EM-01. Performance metrics required: jobs completed, SLA hit rate, rating — either denormalised on Vendor or computed. §8.1: vendor receives work orders and has documents, invoices, ratings, listings — so Vendor is also the marketplace seller (EM-09) and appears in the vendor/staff directory (EM-07). Per §7 Vendor is 'O' on users, work orders and marketplace only.

### Asset — the fully specified entity (FM-01)
*Requirements: FM-01, FM-02, FM-06, SC-10, AI-F-01*

FM-01 enumerates the fields verbatim: name, category, serial/tag, location (estate→building→unit/zone), status, purchase and warranty dates, photos, documents. Assets link to work orders and inspections, with service history viewable per asset. Two cross-cutting rules: archive, never hard delete (archivedAt/archivedBy), and all changes audit-logged. Bulk import via CSV template → ImportJob entity with row counts and per-row errors. Asset also anchors PPM plans (FM-02, per asset or category) and AI-F-01 predictive maintenance (failure-risk ranking on a 30-day window, shadow mode until data volume suffices). Note the PRD cites '(SC-11)' for audit logging in FM-01, but SC-11 is the Landing page and SC-10 is Audit logging — treat as a cross-reference error. The PRD never enumerates asset status members.

### PpmPlan, checklist and generated schedule occurrences
*Requirements: FM-02, FM-07, AI-F-01, FM-03*

FM-02: PPM plans carry frequency, checklist, assignee rules, lead time, and scope of either a specific asset or a category. The scheduler auto-generates work orders ahead of the due date (lead time), a calendar view is required, and overdue items are flagged — that needs a materialised PpmOccurrence row per due date holding dueDate, generatedWorkOrderId and an overdue flag, not just a recurrence rule. Completion requires checklist plus evidence photo, configurable per plan. AI-F-01 writes suggested PPM dates as draft schedule entries that the Facility Manager approves before any schedule change, so occurrences need a source (scheduled vs ai_suggested) and an approval state. PPM compliance % is a required FM-07 dashboard metric, computable only from occurrences.

### WorkOrder — lifecycle, SLA timers, assignment, evidence, offline
*Requirements: FM-03, FM-02, FM-06, EM-03, AI-F-02, AI-E-02, SC-09, SC-10*

FM-03 is the hub. Lifecycle states and transitions exactly per §10 with per-priority SLA timers → respondBy/resolveBy targets plus respondedAt/resolvedAt actuals and a breach flag. Assign to internal technician or vendor (assigneeType discriminator); reassignment and every state change tracked and notified (WorkOrderTransition rows with from, to, actor, timestamp, notification reference). Capture photos, notes, parts and costs (WorkOrderPart, WorkOrderCost); requester notified on state changes. Offline updates per §12.1 → syncStatus on the record and queued writes. Origins are three: reactive from a resident/manager request (EM-03), planned from a PPM occurrence (FM-02), and auto-raised from a failed inspection item (FM-06). Resolved → Verified by requester or manager, auto-close after 5 days (proposed). AI-F-02/AI-E-02 attach a triage suggestion (category, priority, best-fit assignee, confidence) that a dispatcher confirms or overrides, with overrides logged for tuning.

### MaintenanceRequest (resident ticket) is distinct from WorkOrder
*Requirements: EM-03, FM-03, AI-E-01, AI-E-02*

EM-03: a resident raises a request with category, description and photos, receiving a ticket ID with visible status. Requests feed the shared work-order pipeline (FM-03) with estate routing, the resident is notified on each state change, and can rate the resolution. The request must be its own record because it has a resident-visible ticket ID and a resolution rating that do not belong on the internal work order, and because AI-E-01 must be able to escalate a chatbot conversation into a ticket when no grounded source exists. Relationship: MaintenanceRequest 1—0..1 WorkOrder. Resident satisfaction score and request resolution time are §14 KPIs sourced from this entity.

### InspectionTemplate, Inspection run, InspectionItem, ComplianceObligation
*Requirements: FM-06, FM-03, AI-F-03, SC-10*

FM-06 needs four records where §8.1 lists one. InspectionTemplate holds checklist items with pass/fail/severity. Inspection is a run — scheduled or ad-hoc, performed on mobile with photo capture, linked to an asset/space and an inspector. InspectionItem holds per-item result, severity, notes and photos; failed items auto-raise work orders (FM-03), so the item needs a raisedWorkOrderId. ComplianceObligation is the compliance register: status and expiry per obligation, which is neither the template nor the run. AI-F-03 adds vision-detected defects with severity plus an auto-drafted report that the inspector edits and approves — so the run needs aiDraftedReport, editedBy and approvedBy fields. The PRD never enumerates the severity scale or the compliance status values.

### ChargeDefinition, Invoice, InvoiceLine, Statement
*Requirements: EM-01, SC-02, SC-09, AI-E-03, SC-10*

EM-01 splits into several records. ChargeDefinition: charge setup per unit type/size with recurring cycles, one-off levies, and configurable penalties/discounts. Invoice: generated and delivered in-app plus email/SMS, with lines, due date, and the §10 status machine. Payments auto-reconcile to invoices, partial payments and receipts are supported, and arrears aging is tracked — so Invoice needs amountPaid, balance and an arrears age, and a partial payment must not close the invoice. Statements per unit/resident plus an accounting export are separate outputs. Reminder schedule (−3d, due, +7d, +21d) via SC-09 with per-tenant escalation policy; AI-E-03 suggests reminder timing and defaulter-risk scores but managers approve reminder campaigns and no automated penalties are ever applied. Q10 (reconciliation source of truth: gateway settlement vs bank statements) defines the reconciliation rules.

### Payment, Refund, ReconciliationReport
*Requirements: SC-02, EM-01, EM-09, EM-05, SC-04*

SC-02: gateway abstraction (Paystack/Flutterwave per §13.2) supporting cards, transfers and USSD where available. Webhook-confirmed payments with idempotency and retries — so Payment carries providerReference, idempotencyKey, webhookConfirmedAt, and a retry/attempt trail; refund and void are required, so Refund is its own record. Per-tenant reconciliation report and per-tenant settlement account (§8.1). Payment reconciles to invoices (EM-01), marketplace orders (EM-09) and paid bookings (EM-05/SC-04) — model the target as a polymorphic reference (invoice | order | booking) rather than three nullable columns. Payments row of §7: only Resident has access ('O'), all other roles are '—', so pay-in-app is a resident-only capability. The PRD does not enumerate payment status members or name a transaction currency.

### Announcement, targeting and delivery statistics
*Requirements: EM-04, SC-09, AI-E-04, SC-03*

EM-04: broadcast and targeted sends scoped to estate, building or audience, delivered via in-app, push, SMS and email per user preference (SC-09). Delivery/read statistics must be visible to managers, which requires an AnnouncementDelivery row per recipient per channel with status, deliveredAt and readAt — aggregate counters alone cannot satisfy it. AI-E-04 drafts and translates announcements into configured languages but manager approval is required before any send, so Announcement needs a status covering draft → pending_approval → approved → sent, plus approvedBy/approvedAt and an aiDrafted flag and source language. §8.1 confirms announcements are delivered via the notifications engine and track delivery/read. Per §7, Estate Manager and Facility Manager manage; Resident and Security view.

### Amenity and Booking
*Requirements: EM-05, SC-04, SC-02, AI-S-05*

EM-05: amenity setup carries capacity, hours, rules and optional fees; an availability calendar is required; approval is auto or manager per amenity; fees are paid via the gateway; cancellation follows policy. Booking therefore needs amenityId, residentId, start/end, the §10 status machine, an optional paymentId, and a cancellation deadline derived from the amenity's policy. §8.1 confirms booking links resident, amenity and optional payment with approval per amenity rules. Amenity rules are per-tenant configuration (§8.2). SC-04 shares catalog/cart/order/payment services between the marketplace and paid bookings, so a paid booking and a marketplace order settle through the same payment path. AI-S-05 recommendation/fraud service sits behind bookings as well as AI-E-05.

### VisitorPass and visitor log
*Requirements: EM-02, SC-10*

EM-02: visitor invites generate time-bound codes/QR verified by Security at the gate, and the visitor log is retained per NDPA retention policy (§12). VisitorPass therefore needs issuedByResidentId, unitId, guest details, validFrom/validTo, a code and QR reference, a status, and verification fields (verifiedBySecurityUserId, verifiedAt, gate/location). §8.1 restates it: issued by resident, verified by security, logged. Retention is per-entity per §12 (per-entity retention schedule, data residency per Q7), and consent records plus a processing register are required — so visitor data needs an explicit retention policy entry and purge job. Per §7, Security manages Security & SOS and views Bookings & amenities; Residents see own records only.

### SosEvent, responders, PatrolLog, SecurityIncident
*Requirements: EM-06, SC-10, SC-09, SC-03*

EM-06: SOS alerts the security desk and designated responders with unit/location; states Raised → Acknowledged → Responding → Resolved → Reviewed with timestamps (§10). Acknowledge target under 60 seconds during manned hours (proposed); unacknowledged alerts escalate to backup responders, so the event needs an escalation trail and a responder roster reference. Patrol and incident logging for security staff are separate entities the §8.1 table omits. All security events are audit-logged (SC-10 lists security events as an audit category). SOS submission must work on poor connectivity with SMS fallback (proposed), so the event carries a submission channel and a queued/sync status per §12.1. Q4 (who responds, escalation chain, liability, manned hours) shapes the responder and escalation model.

### Folder, Document, and AI extraction fields
*Requirements: EM-08, AI-S-03, FM-01, FM-05, AI-S-06*

EM-08: upload and organise with folder and permission control; residents see documents shared to their audience; all stored documents are indexed for AI document intelligence. So Document needs folderId, an audience/permission grant (role- and estate-scoped), and indexing state. AI-S-03 adds OCR plus field extraction plus semantic search, with extracted fields editable before save — model ExtractedField with key, value, confidence and an edited-by marker, plus ocrText and an embedding namespace scoped per tenant (§8.2, §11.4 hard-scoped retrieval). §8.1 also attaches documents to assets (FM-01), vendors (FM-05 insurance/certifications with expiry) and work orders (evidence), so Document needs a polymorphic owner reference. Benchmark: field extraction ≥95% printed / ≥85% scanned.

### Listing, MarketplaceOrder, Payout (payout blocked by Q3)
*Requirements: EM-09, SC-04, AI-E-05, AI-S-05, SC-02*

EM-09: vendors list products/services; residents browse, order and pay via the gateway; order lifecycle placed → accepted → fulfilled → closed with notifications, plus Declined and Refunded branches (§10). Vendor must accept within an SLA or the order auto-expires, so the order needs an acceptByDeadline. Commission/payout model is open question Q3, which explicitly blocks build of payouts — model Payout as a defined but unbuilt entity (commission %, escrow, vendor payout rails, KYC all undecided). SC-04 provides shared catalog/cart/order/payment services consumed by EM-09 and paid bookings. AI-E-05 adds listing auto-generation, personalised recommendations and fraud flags — fraud flags go to a human review queue and never auto-block, so a FraudFlag review record is required.

### InvestorProject, Lead, InvestorAccess, Forecast
*Requirements: SC-08, SC-11, AI-S-04, SC-10*

SC-08: off-plan projects with sales pipeline, occupancy and returns; investors see only their projects — that visibility rule needs an explicit InvestorAccess grant entity, which §8.1 does not provide (it only lists 'Investor project / Lead'). Lead is a pipeline record with a stage and, per AI-S-04, a score. SC-11 (landing page) captures leads into the investor pipeline (proposed), so Lead has an external/public origin. AI-S-04 produces sales/occupancy forecasting, lead scoring and ROI projections, all of which must be labelled as estimates with assumptions shown and never presented as financial advice — so Forecast carries a label, an assumptions payload and a generatedAt, and is never stored as fact on the project. Per §7, Platform Admin has full control of investor projects, Executive views, Investor sees own only.

### AiInteractionLog and AiSuggestion — the HITL substrate
*Requirements: AI-S-06, AI-F-02, AI-F-04, AI-E-01, AI-E-03, SC-10*

§8.1 requires an AI interaction log of every AI request/response, confidence and override, per tenant, powering audit, tuning and cost metering. §11.4 adds: PII minimised/redacted in logs; retrieval, embeddings and context hard-scoped to the tenant; provider abstraction with health checks and degradation to the listed fallback; per-tenant and per-feature usage caps with alerts and a kill-switch per feature; user- and document-supplied content treated as data so the assistant cannot be instructed to exceed the user's permissions (§7). Separately, every AI surface must show loading, confidence, sources and error states, and every suggestion is review/approve/override — that generic HITL wrapper is a second entity (AiSuggestion) with targetType/targetId, featureId, payload, confidence, sources, status and reviewedBy. AI-F-02 override logging, AI-F-04 confirm/dismiss feedback and AI-E-01 escalation all write through these two records.

### AuditLog, notifications engine, and the entities §8.1 omits
*Requirements: SC-10, SC-09, FM-01, SC-07, AI-E-06, FM-03, FM-06, EM-06*

SC-10 requires an immutable log of auth events, permission changes, financial actions, security events and AI overrides with actor, tenant and timestamp, 12-month retention (proposed), queryable from the admin console — this is a first-class entity absent from §8.1, and it is also what FM-01's archive-not-delete rule depends on. SC-09 requires a unified push/SMS/email/in-app service on a single event bus with per-user channel preferences and quiet hours, per-tenant templates and delivery logging — three entities (NotificationTemplate, NotificationPreference, NotificationDelivery). Also absent from §8.1 but required: ImportJob (FM-01 CSV template, §8.2 bulk import of estates/units), UsageMeter (§8.2 cost metering), ConsentRecord and processing register and DPIA (§12 privacy, Q5 gating AI-E-06), RetentionPolicy per entity (§12), and SyncQueueItem (§12.1 queued writes with visible sync status, server-authoritative conflict resolution, overwritten offline edits surfaced to the user and audit-logged).

### Enums the PRD enumerates exactly vs. those it only implies
*Requirements: FM-01, FM-04, FM-06, EM-04, SC-02, SC-09, SC-01*

Exactly enumerated in §10 and binding on backend, mobile and QA: WorkOrderStatus (New, Triaged, Assigned, In Progress, On Hold, Resolved, Verified, Closed; branches Rejected, Cancelled); InvoiceStatus (Draft, Issued, Partially paid, Paid; Issued → Overdue → In arrears → Escalated); BookingStatus (Requested, Approved/Auto-approved, Confirmed, Completed; branches Declined, Cancelled); SosStatus (Raised, Acknowledged, Responding, Resolved, Reviewed); MarketplaceOrderStatus (Placed, Accepted, Fulfilled, Closed; branches Declined, Refunded). Also exact: nine roles and five permission levels (F/M/V/O/—) in §7; four notification channels (in-app, push, SMS, email) in EM-04/SC-09; three payment methods (cards, transfers, USSD) in SC-02; pass/fail inspection results in FM-06; MoSCoW priorities in §6.2. Only implied and shipped as PROPOSED_* placeholders: asset status (FM-01 names the field, not the values), space occupancy/allocation status (FM-04), defect/inspection severity (FM-06, AI-F-03), the full work-order priority ladder (§10 names only Emergency and Routine, by example), payment status, visitor pass status, compliance obligation status, and announcement approval status.

### Design-system bridge: status tones replace STATUS_COLORS
*Requirements: SC-06, FM-07, EM-06, §10*

The scaffold at /Users/samuelomosehin/developer/vesta exposes STATUS_COLORS as Record<LoadStatus, string> and StatusPill accepting LoadStatus | string (src/components/ui/index.tsx). The logistics LoadStatus union must be deleted and replaced by the five §10 status unions plus the implied ones; StatusPill should be re-typed to a DomainStatus union so an unmapped status becomes a compile error rather than a grey pill. A single tone map keyed by every domain status keeps one colour language across work orders, invoices, bookings, SOS and marketplace orders — important because FM-07 dashboards and §7 role scoping put several of these status families on the same screen. SOS statuses warrant a distinct high-salience tone given the sub-60-second acknowledge target in EM-06.

## Code-ready artifacts

### src/domain/core.ts — primitives, IDs, base mixins, enums (`typescript`)

```typescript
/** PRD v2.0 §8 — primitives + enums. Every citation is a real requirement ID. */

/* ── Branded ids ─────────────────────────────────────────── */
export type Id<B extends string> = string & { readonly __brand: B };

export type TenantId = Id<'Tenant'>;
export type EstateId = Id<'Estate'>;
export type BuildingId = Id<'Building'>;
export type FloorId = Id<'Floor'>;
export type UnitId = Id<'Unit'>;
export type UserId = Id<'User'>;
export type ResidentId = Id<'Resident'>;
export type VendorId = Id<'Vendor'>;
export type AssetId = Id<'Asset'>;
export type PpmPlanId = Id<'PpmPlan'>;
export type PpmOccurrenceId = Id<'PpmOccurrence'>;
export type WorkOrderId = Id<'WorkOrder'>;
export type RequestId = Id<'MaintenanceRequest'>;
export type InspectionTemplateId = Id<'InspectionTemplate'>;
export type InspectionId = Id<'Inspection'>;
export type InspectionItemId = Id<'InspectionItem'>;
export type ObligationId = Id<'ComplianceObligation'>;
export type ChargeDefinitionId = Id<'ChargeDefinition'>;
export type InvoiceId = Id<'Invoice'>;
export type PaymentId = Id<'Payment'>;
export type RefundId = Id<'Refund'>;
export type AnnouncementId = Id<'Announcement'>;
export type AmenityId = Id<'Amenity'>;
export type BookingId = Id<'Booking'>;
export type VisitorPassId = Id<'VisitorPass'>;
export type SosEventId = Id<'SosEvent'>;
export type PatrolId = Id<'Patrol'>;
export type IncidentId = Id<'Incident'>;
export type FolderId = Id<'Folder'>;
export type DocumentId = Id<'Document'>;
export type ListingId = Id<'Listing'>;
export type OrderId = Id<'MarketplaceOrder'>;
export type PayoutId = Id<'Payout'>;
export type ProjectId = Id<'InvestorProject'>;
export type LeadId = Id<'Lead'>;
export type AttachmentId = Id<'Attachment'>;
export type AuditLogId = Id<'AuditLog'>;
export type AiInteractionId = Id<'AiInteraction'>;
export type AiSuggestionId = Id<'AiSuggestion'>;
export type NotificationId = Id<'Notification'>;
export type ImportJobId = Id<'ImportJob'>;
export type ConversationId = Id<'Conversation'>;

export type ISODateTime = string;
export type ISODate = string;

/** PRD prices the build in USD (§18); the market/gateways are Nigerian (§13.2).
 *  Transaction currency is NOT specified — treat as tenant config. */
export type CurrencyCode = 'NGN' | 'USD';
export interface Money { amount: number; currency: CurrencyCode }

export interface GeoPoint { lat: number; lng: number } // SC-03 maps

/* ── Base mixins ─────────────────────────────────────────── */

/** §8.2 — every domain record carries its tenant scope. */
export interface TenantScoped { tenantId: TenantId }

/** §8.2 hierarchy; `floorId` comes from FM-01/FM-04 (§8.2's list omits it). */
export interface SpaceRef {
  estateId: EstateId | null;
  buildingId: BuildingId | null;
  floorId: FloorId | null;
  unitId: UnitId | null;
}

/** SC-10 — actor + timestamp on every mutation. */
export interface Auditable {
  createdAt: ISODateTime; createdBy: UserId;
  updatedAt: ISODateTime; updatedBy: UserId;
}

/** FM-01 — "Archive (no hard delete)". */
export interface Archivable { archivedAt: ISODateTime | null; archivedBy: UserId | null }

export interface DomainRecord extends TenantScoped, Auditable {}

export type AttachmentKind = 'photo' | 'document';
export interface Attachment {
  id: AttachmentId; tenantId: TenantId;
  kind: AttachmentKind; url: string; mimeType: string; sizeBytes: number;
  capturedAt: ISODateTime | null; uploadedBy: UserId; uploadedAt: ISODateTime;
}

/* ── Roles & scope (§7, SC-01) ───────────────────────────── */
export const ROLES = [
  'platform_admin','owner_executive','estate_manager','facility_manager',
  'technician','resident','security','vendor','investor',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform Admin', owner_executive: 'Owner / Executive',
  estate_manager: 'Estate Manager', facility_manager: 'Facility Manager',
  technician: 'Technician', resident: 'Resident', security: 'Security',
  vendor: 'Vendor', investor: 'Investor',
};

export const MODULES = ['facility','estate','shared'] as const;        // §6.1
export type Module = (typeof MODULES)[number];

export const MOSCOW = ['must','should','could','wont'] as const;        // §6.2
export type Moscow = (typeof MOSCOW)[number];

/* ── §10 state enums — EXACT, contract between backend/mobile/QA ── */

export const WORK_ORDER_STATUSES = [
  'new','triaged','assigned','in_progress','on_hold',
  'resolved','verified','closed','rejected','cancelled',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const INVOICE_STATUSES = [
  'draft','issued','partially_paid','paid','overdue','in_arrears','escalated',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const BOOKING_STATUSES = [
  'requested','approved','auto_approved','confirmed','completed','declined','cancelled',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const SOS_STATUSES = ['raised','acknowledged','responding','resolved','reviewed'] as const;
export type SosStatus = (typeof SOS_STATUSES)[number];

export const ORDER_STATUSES = ['placed','accepted','fulfilled','closed','declined','refunded'] as const;
export type MarketplaceOrderStatus = (typeof ORDER_STATUSES)[number];

/* ── Other exactly-stated enums ──────────────────────────── */

/** EM-04 / SC-09 */
export const NOTIFICATION_CHANNELS = ['in_app','push','sms','email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** SC-02 — "cards, transfers and USSD where available" */
export const PAYMENT_METHODS = ['card','transfer','ussd'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** FM-03 — internal technician or vendor */
export type AssigneeType = 'technician' | 'vendor';

/** Glossary — WO is reactive (from request) or planned (from PPM). */
export type WorkOrderSource = 'reactive' | 'planned';
/** FM-06 also auto-raises WOs from failed inspection items. */
export type WorkOrderOrigin = 'request' | 'ppm' | 'inspection' | 'manual';

/** FM-06 */
export type InspectionResult = 'pass' | 'fail';
export type InspectionRunType = 'scheduled' | 'ad_hoc';

/** EM-04 — broadcast and targeted (estate/building/audience) */
export const ANNOUNCEMENT_AUDIENCES = ['broadcast','estate','building','audience'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/** Glossary — apartment, office, zone */
export type SpaceType = 'apartment' | 'office' | 'zone';
/** Glossary — Estate vs Facility */
export type SiteKind = 'estate' | 'facility';

/** EM-05 */
export type AmenityApprovalMode = 'auto' | 'manager';

/** SC-10 audit categories — exact list */
export const AUDIT_CATEGORIES = [
  'auth','permission_change','financial','security','ai_override',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** §8.2 cost metering */
export type UsageMeterKind = 'ai' | 'sms' | 'email';

/** §12.1 offline */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict';

/** §11 — every AI feature id */
export const AI_FEATURES = [
  'AI-F-01','AI-F-02','AI-F-03','AI-F-04','AI-F-05',
  'AI-E-01','AI-E-02','AI-E-03','AI-E-04','AI-E-05','AI-E-06',
  'AI-S-01','AI-S-02','AI-S-03','AI-S-04','AI-S-05','AI-S-06',
] as const;
export type AiFeatureId = (typeof AI_FEATURES)[number];

/** §11.4 — every suggestion is review / approve / override. */
export type AiSuggestionStatus = 'pending' | 'approved' | 'overridden' | 'dismissed';

/* ── PROPOSED_* : field exists in the PRD, members do NOT.
 *  Confirm at discovery; do not treat as contract. ───────── */

export const PROPOSED_ASSET_STATUSES = // FM-01 "status"
  ['operational','under_maintenance','out_of_service','decommissioned'] as const;
export type AssetStatus = (typeof PROPOSED_ASSET_STATUSES)[number];

export const PROPOSED_OCCUPANCY_STATUSES = // FM-04 "occupancy/allocation status"
  ['vacant','occupied','reserved','out_of_service'] as const;
export type OccupancyStatus = (typeof PROPOSED_OCCUPANCY_STATUSES)[number];

export const PROPOSED_SEVERITIES = // FM-06 "pass/fail/severity", AI-F-03
  ['low','medium','high','critical'] as const;
export type Severity = (typeof PROPOSED_SEVERITIES)[number];

/** §10 names ONLY 'Emergency' and 'Routine', and only by example. */
export const PRD_NAMED_PRIORITIES = ['emergency','routine'] as const;
export const PROPOSED_PRIORITIES = ['emergency','high','medium','routine'] as const;
export type WorkOrderPriority = (typeof PROPOSED_PRIORITIES)[number];

export const PROPOSED_PAYMENT_STATUSES = // SC-02 implies webhook-confirm + refund/void
  ['pending','confirmed','failed','refunded','voided'] as const;
export type PaymentStatus = (typeof PROPOSED_PAYMENT_STATUSES)[number];

export const PROPOSED_VISITOR_PASS_STATUSES = // EM-02 "time-bound", "verified"
  ['issued','verified','expired','revoked'] as const;
export type VisitorPassStatus = (typeof PROPOSED_VISITOR_PASS_STATUSES)[number];

export const PROPOSED_OBLIGATION_STATUSES = // FM-06 "status and expiry per obligation"
  ['compliant','due_soon','expired','not_applicable'] as const;
export type ObligationStatus = (typeof PROPOSED_OBLIGATION_STATUSES)[number];

export const PROPOSED_ANNOUNCEMENT_STATUSES = // EM-04 approval-before-send
  ['draft','pending_approval','approved','scheduled','sent'] as const;
export type AnnouncementStatus = (typeof PROPOSED_ANNOUNCEMENT_STATUSES)[number];

export const PROPOSED_RESIDENT_STATUSES = // EM-02 invite + move-in/move-out
  ['invited','active','moved_out'] as const;
export type ResidentStatus = (typeof PROPOSED_RESIDENT_STATUSES)[number];

```

### src/domain/permissions.ts — §7 matrix as data (`typescript`)

```typescript
/** PRD v2.0 §7 — roles & permissions matrix, verbatim.
 *  "Server-side, deny-by-default enforcement on every API (SC-01)."
 *  This matrix is the authoritative baseline; the UI mirrors it, never defines it. */

import type { Role } from './core';

/** §7 legend: F full · M manage (own tenant/estate) · V view · O own records only · — none */
export const PERMISSION_LEVELS = ['F','M','V','O','none'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  F: 'Full control',
  M: 'Manage (create/edit within own tenant/estate)',
  V: 'View',
  O: 'Own records only',
  none: 'No access',
};

/** The 13 capability rows of §7. */
export const CAPABILITIES = [
  'tenant_onboarding_config','users_roles','assets_ppm_plans','work_orders',
  'inspections_compliance','charges_invoicing','payments_pay_in_app','announcements',
  'bookings_amenities','security_sos','marketplace','investor_projects','reports_analytics',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  tenant_onboarding_config: 'Tenant onboarding & config',
  users_roles: 'Users & roles',
  assets_ppm_plans: 'Assets & PPM plans',
  work_orders: 'Work orders',
  inspections_compliance: 'Inspections & compliance',
  charges_invoicing: 'Charges & invoicing',
  payments_pay_in_app: 'Payments (pay in-app)',
  announcements: 'Announcements',
  bookings_amenities: 'Bookings & amenities',
  security_sos: 'Security & SOS',
  marketplace: 'Marketplace',
  investor_projects: 'Investor projects',
  reports_analytics: 'Reports & analytics',
};

type Row = Record<Role, PermissionLevel>;
const r = (
  plat: PermissionLevel, exec: PermissionLevel, estM: PermissionLevel,
  facM: PermissionLevel, tech: PermissionLevel, res: PermissionLevel,
  sec: PermissionLevel, ven: PermissionLevel, inv: PermissionLevel,
): Row => ({
  platform_admin: plat, owner_executive: exec, estate_manager: estM,
  facility_manager: facM, technician: tech, resident: res,
  security: sec, vendor: ven, investor: inv,
});

/** Transcribed exactly from §7. Column order: Plat Exec EstM FacM Tech Res Sec Ven Inv. */
export const PERMISSION_MATRIX: Record<Capability, Row> = {
  tenant_onboarding_config: r('F','none','V','none','none','none','none','none','none'),
  users_roles:              r('F','V','M','M','none','O','none','O','O'),
  assets_ppm_plans:         r('V','V','V','M','V','none','none','none','none'),
  work_orders:              r('V','V','M','M','O','O','none','O','none'),
  inspections_compliance:   r('V','V','V','M','O','none','none','none','none'),
  charges_invoicing:        r('V','V','M','none','none','O','none','none','none'),
  payments_pay_in_app:      r('none','none','none','none','none','O','none','none','none'),
  announcements:            r('V','V','M','M','none','V','V','none','none'),
  bookings_amenities:       r('V','V','M','none','none','O','V','none','none'),
  security_sos:             r('V','V','M','none','none','O','M','none','none'),
  marketplace:              r('V','V','M','none','none','O','none','O','none'),
  investor_projects:        r('F','V','none','none','none','none','none','none','O'),
  reports_analytics:        r('F','V','M','M','none','none','none','none','V'),
};

export function levelFor(role: Role, cap: Capability): PermissionLevel {
  return PERMISSION_MATRIX[cap][role];
}
/** Deny-by-default (SC-01): anything not 'none' is visible; 'O' additionally requires
 *  an ownership predicate at the query layer, never a client-side filter. */
export function canView(role: Role, cap: Capability): boolean {
  return levelFor(role, cap) !== 'none';
}
export function canManage(role: Role, cap: Capability): boolean {
  const l = levelFor(role, cap);
  return l === 'F' || l === 'M';
}
export function requiresOwnershipFilter(role: Role, cap: Capability): boolean {
  return levelFor(role, cap) === 'O';
}

```

### src/domain/state-machines.ts — §10 legal transitions (`typescript`)

```typescript
/** PRD v2.0 §10 — "State machines below are the contract between backend, mobile and QA.
 *  Only the listed transitions are legal; every transition is timestamped,
 *  actor-attributed and notified via SC-09." */

import type {
  WorkOrderStatus, InvoiceStatus, BookingStatus, SosStatus,
  MarketplaceOrderStatus, WorkOrderPriority,
} from './core';

type Graph<S extends string> = Record<S, readonly S[]>;

/* ── Work order (FM-03) ──────────────────────────────────── */
/** Literal chain: New → Triaged → Assigned → In Progress → On Hold →
 *  Resolved → Verified → Closed; branches: Rejected, Cancelled.
 *  §10 does not say from which states the branches are reachable, nor whether
 *  On Hold can resume — see WORK_ORDER_TRANSITIONS_UNRESOLVED. */
export const WORK_ORDER_TRANSITIONS: Graph<WorkOrderStatus> = {
  new: ['triaged'],
  triaged: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['on_hold'],
  on_hold: ['resolved'],
  resolved: ['verified'],
  verified: ['closed'],
  closed: [],
  rejected: [],
  cancelled: [],
};

/** Transitions the build almost certainly needs but §10 does NOT state.
 *  Confirm at discovery before merging into the graph above. */
export const WORK_ORDER_TRANSITIONS_UNRESOLVED = {
  on_hold_resume: ['on_hold', 'in_progress'] as const,
  skip_hold: ['in_progress', 'resolved'] as const,
  verification_rejected: ['verified', 'in_progress'] as const,
  reject_from: ['new', 'triaged'] as const,
  cancel_from: ['new', 'triaged', 'assigned', 'in_progress', 'on_hold'] as const,
} as const;

/** §10: "Resolved → Verified by requester or manager; auto-close after 5 days (proposed)." */
export const WORK_ORDER_AUTO_CLOSE_DAYS = 5; // proposed, per-tenant configurable

/** §10: "SLA timers per priority (e.g. Emergency: respond 2h / resolve 24h; Routine: 72h)."
 *  Only these two are named; 'high'/'medium' below are placeholders, not PRD facts. */
export interface SlaTarget { respondHours: number | null; resolveHours: number }
export const PRD_NAMED_SLA: Partial<Record<WorkOrderPriority, SlaTarget>> = {
  emergency: { respondHours: 2, resolveHours: 24 },
  routine:   { respondHours: null, resolveHours: 72 },
};

/* ── Service charge (EM-01) ──────────────────────────────── */
/** Draft → Issued → Partially paid → Paid; Issued → Overdue → In arrears → Escalated. */
export const INVOICE_TRANSITIONS: Graph<InvoiceStatus> = {
  draft: ['issued'],
  issued: ['partially_paid', 'paid', 'overdue'],
  partially_paid: ['paid'],
  paid: [],
  overdue: ['in_arrears'],
  in_arrears: ['escalated'],
  escalated: [],
};
/** UNRESOLVED: §10 gives no path back from overdue/in_arrears/escalated when a
 *  payment lands. EM-01 requires partial payments + auto-reconciliation, so
 *  overdue → partially_paid / paid must exist. Confirm at discovery. */
export const INVOICE_TRANSITIONS_UNRESOLVED = {
  payment_after_due: ['overdue', 'in_arrears', 'escalated'] as const,
} as const;

/** §10 reminder schedule via SC-09; AI-E-03 timing suggestions need manager approval. */
export const ARREARS_REMINDER_OFFSETS_DAYS = [-3, 0, 7, 21] as const;

/* ── Booking (EM-05) ─────────────────────────────────────── */
/** Requested → Approved / Auto-approved → Confirmed → Completed; Declined, Cancelled.
 *  UNRESOLVED: whether 'Approved' and 'Auto-approved' are two states or one state
 *  plus an `autoApproved` flag — modelled as two states to match §10 literally. */
export const BOOKING_TRANSITIONS: Graph<BookingStatus> = {
  requested: ['approved', 'auto_approved', 'declined', 'cancelled'],
  approved: ['confirmed', 'cancelled'],
  auto_approved: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  declined: [],
  cancelled: [],
};
/** EM-05/§10: "payment (if fees) required to confirm". */
export const BOOKING_REQUIRES_PAYMENT_TO_CONFIRM = true;

/* ── SOS event (EM-06) ───────────────────────────────────── */
export const SOS_TRANSITIONS: Graph<SosStatus> = {
  raised: ['acknowledged'],
  acknowledged: ['responding'],
  responding: ['resolved'],
  resolved: ['reviewed'],
  reviewed: [],
};
/** §10: "Acknowledge target < 60s during manned hours (proposed); unacknowledged
 *  alerts escalate to backup responders." Operating model per Q4. */
export const SOS_ACK_TARGET_SECONDS = 60;

/* ── Marketplace order (EM-09) ───────────────────────────── */
export const ORDER_TRANSITIONS: Graph<MarketplaceOrderStatus> = {
  placed: ['accepted', 'declined'],
  accepted: ['fulfilled', 'refunded'],
  fulfilled: ['closed', 'refunded'],
  closed: [],
  declined: [],
  refunded: [],
};
/** §10: "Vendor must accept within SLA or order auto-expires" — SLA value undefined.
 *  Payout model pending Q3. */
export const ORDER_ACCEPT_SLA_HOURS: number | null = null;

export function canTransition<S extends string>(g: Graph<S>, from: S, to: S): boolean {
  return g[from].includes(to);
}

```

### src/domain/entities.ts — full entity set (`typescript`)

```typescript
/** PRD v2.0 §8.1 core entities + every entity forced by §9 acceptance criteria.
 *  Entities marked (not in §8.1) are required by a requirement but absent from the table. */

import type {
  TenantId, EstateId, BuildingId, FloorId, UnitId, UserId, ResidentId, VendorId,
  AssetId, PpmPlanId, PpmOccurrenceId, WorkOrderId, RequestId, InspectionTemplateId,
  InspectionId, InspectionItemId, ObligationId, ChargeDefinitionId, InvoiceId,
  PaymentId, RefundId, AnnouncementId, AmenityId, BookingId, VisitorPassId,
  SosEventId, PatrolId, IncidentId, FolderId, DocumentId, ListingId, OrderId,
  PayoutId, ProjectId, LeadId, AttachmentId, AuditLogId, AiInteractionId,
  AiSuggestionId, NotificationId, ImportJobId, ConversationId,
  ISODate, ISODateTime, Money, GeoPoint, Attachment, DomainRecord, Archivable,
  SpaceRef, Role, Module, SiteKind, SpaceType, OccupancyStatus, AssetStatus,
  WorkOrderStatus, WorkOrderPriority, WorkOrderSource, WorkOrderOrigin, AssigneeType,
  InspectionResult, InspectionRunType, Severity, ObligationStatus,
  InvoiceStatus, PaymentMethod, PaymentStatus, CurrencyCode,
  AnnouncementAudience, AnnouncementStatus, NotificationChannel,
  AmenityApprovalMode, BookingStatus, VisitorPassStatus, SosStatus,
  MarketplaceOrderStatus, ResidentStatus, AuditCategory, UsageMeterKind,
  SyncStatus, AiFeatureId, AiSuggestionStatus,
} from './core';

/* ══ 1. TENANCY (§8.2) ═══════════════════════════════════ */

/** §8.1 Tenant — client organisation; the isolation boundary for all data. */
export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  status: 'active' | 'suspended';          // implied by SC-07 onboarding
  onboardedAt: ISODateTime;
  onboardedBy: UserId;                     // Platform Admin (§7, §8.2)
  createdAt: ISODateTime; updatedAt: ISODateTime;
}

/** §8.2 per-tenant configuration: branding, notification templates, amenity rules,
 *  charge structures, AI feature flags and usage caps. Extended by §10/§12 knobs. */
export interface TenantConfiguration {
  tenantId: TenantId;
  branding: { productName: string; tagline: string; primaryColor: string; logoUrl: string | null };
  languages: string[];                     // English at launch; list per Q6 (§12 Localization)
  defaultCurrency: CurrencyCode;           // NOT specified by the PRD
  enabledFeatures: Record<string, boolean>;// SC-07 "enabled features"
  aiFeatureFlags: Record<AiFeatureId, boolean>;      // §11.4 kill-switch per feature
  aiUsageCaps: Record<AiFeatureId, number | null>;   // §11.4 per-feature caps, Q12
  smsMonthlyCap: number | null;            // Q12
  emailMonthlyCap: number | null;          // Q12
  slaByPriority: Record<WorkOrderPriority, { respondHours: number | null; resolveHours: number }>; // §10
  workOrderAutoCloseDays: number;          // §10, proposed 5
  arrearsReminderOffsetsDays: number[];    // §10, proposed [-3,0,7,21]
  arrearsEscalationPolicy: string;         // §10 "Escalation policy per tenant"
  amenityRules: Record<string, unknown>;   // §8.2
  dataResidency: string | null;            // Q7
  settlementAccount: PaymentSettlementAccount | null; // §8.1 Payment, SC-02
}

/** SC-02 / §8.1 "per-tenant settlement account". */
export interface PaymentSettlementAccount {
  tenantId: TenantId;
  provider: 'paystack' | 'flutterwave';    // §13.2 candidates, decided at kickoff
  accountReference: string;
  subaccountCode: string | null;
  verifiedAt: ISODateTime | null;
}

/** (not in §8.1) §8.2 cost metering: AI, SMS and email usage metered per tenant. */
export interface UsageMeter {
  tenantId: TenantId;
  kind: UsageMeterKind;
  featureId: AiFeatureId | null;           // null for sms/email
  periodStart: ISODate; periodEnd: ISODate;
  units: number;
  estimatedCost: Money;
  capUnits: number | null;
  alertThresholdPct: number | null;        // Q12
  killSwitchTriggeredAt: ISODateTime | null; // §11.4
}

/** §8.1 Estate / Facility — belongs to tenant; has buildings, units, amenities, staff. */
export interface Site extends DomainRecord {
  id: EstateId;
  kind: SiteKind;                          // glossary: estate vs facility
  name: string;
  address: string;
  geo: GeoPoint | null;                    // SC-03 maps
}

export interface Building extends DomainRecord {
  id: BuildingId; estateId: EstateId; name: string; floorCount: number | null;
}

/** FM-01/FM-04 include a floor level; §8.2's hierarchy list omits it. */
export interface Floor extends DomainRecord {
  id: FloorId; buildingId: BuildingId; estateId: EstateId; name: string; level: number;
}

/** §8.1 Unit / Space — addressable space; links residents, assets, charges, bookings. */
export interface Unit extends DomainRecord {
  id: UnitId;
  estateId: EstateId; buildingId: BuildingId | null; floorId: FloorId | null;
  name: string;
  type: SpaceType;
  unitTypeCode: string | null;             // EM-01 "charge setup per unit type/size"
  sizeSqm: number | null;                  // EM-01
  occupancyStatus: OccupancyStatus;        // FM-04
}

/* ══ 2. IDENTITY & ACCESS (SC-01, §7) ════════════════════ */

/** §8.1 User + Role(s) — any actor; roles per §7, scoped to tenant (and estate). */
export interface User {
  id: UserId;
  tenantId: TenantId | null;               // null ONLY for Platform Admin (above tenant, §8.2)
  fullName: string; email: string; phone: string | null;
  status: 'invited' | 'active' | 'disabled';
  locale: string;                          // §12 Localization
  mfaEnabled: boolean;                     // SC-01, §12 "MFA for admin roles"
  lastLoginAt: ISODateTime | null;
  createdAt: ISODateTime; updatedAt: ISODateTime;
}

/** Separate record: roles are tenant- and estate-scoped (SC-01). */
export interface RoleAssignment {
  userId: UserId; tenantId: TenantId | null; role: Role;
  estateIds: EstateId[];                   // empty = tenant-wide
  grantedBy: UserId; grantedAt: ISODateTime;
}

/** SC-01 "session and password policy". */
export interface Session {
  id: string; userId: UserId; tenantId: TenantId | null;
  createdAt: ISODateTime; expiresAt: ISODateTime;
  mfaSatisfied: boolean; ipAddress: string; userAgent: string;
  revokedAt: ISODateTime | null;
}

/** §8.1 "Resident links user → unit(s)"; EM-02 move-in/move-out. */
export interface Resident extends DomainRecord {
  id: ResidentId; userId: UserId; unitId: UnitId; estateId: EstateId;
  status: ResidentStatus;
  isPrimary: boolean;
  invitedAt: ISODateTime | null;
  moveInDate: ISODate | null; moveOutDate: ISODate | null;
}

/** EM-02 "household members supported". */
export interface HouseholdMember extends DomainRecord {
  id: string; residentId: ResidentId; unitId: UnitId;
  fullName: string; relationship: string | null;
  linkedUserId: UserId | null;
}

/** §8.1 Vendor — external contractor org; "vendor links user → vendor org". */
export interface Vendor extends DomainRecord, Archivable {
  id: VendorId;
  name: string;
  services: string[];                      // FM-05
  coverageEstateIds: EstateId[];           // FM-05 coverage
  contactEmail: string; contactPhone: string;
  jobsCompleted: number;                   // FM-05 performance metrics
  slaHitRatePct: number | null;
  rating: number | null;
  status: 'pending' | 'approved' | 'suspended';
}

export interface VendorContact { userId: UserId; vendorId: VendorId; isPrimary: boolean }

/** FM-05 "documents (insurance/certifications) with expiry alerts". */
export interface VendorDocument extends DomainRecord {
  id: DocumentId; vendorId: VendorId;
  type: 'insurance' | 'certification' | 'other';
  documentId: DocumentId;
  expiryDate: ISODate | null;
  expiryAlertSentAt: ISODateTime | null;   // drives SC-09 notification
}

/** FM-05 "vendors submit updates & invoices via the vendor portal" —
 *  a payable, distinct from the resident-facing Invoice of EM-01. */
export interface VendorInvoice extends DomainRecord {
  id: string; vendorId: VendorId; workOrderId: WorkOrderId | null;
  reference: string; amount: Money; submittedAt: ISODateTime;
  status: 'submitted' | 'approved' | 'rejected' | 'paid';
  approvedBy: UserId | null;
  attachments: AttachmentId[];
}

/* ══ 3. MODULE 01 — FACILITY MANAGEMENT ══════════════════ */

/** FM-01 — fields transcribed from the acceptance criteria. */
export interface Asset extends DomainRecord, Archivable {
  id: AssetId;
  name: string;
  category: string;
  serialOrTag: string;
  location: SpaceRef;                      // estate→building→(floor)→unit/zone
  status: AssetStatus;
  purchaseDate: ISODate | null;
  warrantyExpiryDate: ISODate | null;
  photos: AttachmentId[];
  documents: DocumentId[];
  importJobId: ImportJobId | null;         // FM-01 bulk CSV import
}

/** FM-02 — frequency, checklist, assignee rules, lead time, per asset or category. */
export interface PpmPlan extends DomainRecord, Archivable {
  id: PpmPlanId;
  name: string;
  scope: { kind: 'asset'; assetId: AssetId } | { kind: 'category'; category: string };
  frequency: { every: number; unit: 'day' | 'week' | 'month' | 'year' };
  leadTimeDays: number;                    // WO generated ahead of due date
  assigneeRule: { type: AssigneeType; technicianId?: UserId; vendorId?: VendorId } | null;
  checklist: PpmChecklistItem[];
  requiresEvidencePhoto: boolean;          // FM-02 "configurable"
  active: boolean;
}
export interface PpmChecklistItem { id: string; label: string; required: boolean }

/** FM-02 calendar view + overdue flagging require materialised occurrences. */
export interface PpmOccurrence extends DomainRecord {
  id: PpmOccurrenceId; ppmPlanId: PpmPlanId; assetId: AssetId | null;
  dueDate: ISODate;
  generatedWorkOrderId: WorkOrderId | null;
  isOverdue: boolean;
  source: 'scheduled' | 'ai_suggested';    // AI-F-01 draft schedule entries
  approvedBy: UserId | null;               // AI-F-01 "FM approves before any schedule changes"
}

/** FM-03 — the hub entity. Lifecycle per §10. */
export interface WorkOrder extends DomainRecord {
  id: WorkOrderId;
  reference: string;
  title: string; description: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  category: string;
  source: WorkOrderSource;                 // glossary: reactive | planned
  origin: WorkOrderOrigin;
  originRequestId: RequestId | null;       // EM-03
  originPpmOccurrenceId: PpmOccurrenceId | null; // FM-02
  originInspectionItemId: InspectionItemId | null; // FM-06 failed item auto-raise
  assetId: AssetId | null;
  location: SpaceRef;
  requesterId: UserId;
  assigneeType: AssigneeType | null;
  assigneeUserId: UserId | null;           // technician
  assigneeVendorId: VendorId | null;       // vendor
  respondBy: ISODateTime | null;           // per-priority SLA timers
  resolveBy: ISODateTime | null;
  respondedAt: ISODateTime | null;
  resolvedAt: ISODateTime | null;
  slaBreached: boolean;
  verifiedBy: UserId | null; verifiedAt: ISODateTime | null; // requester or manager
  autoCloseAt: ISODateTime | null;         // §10 proposed 5 days
  closedAt: ISODateTime | null;
  notes: string | null;
  photos: AttachmentId[];
  totalCost: Money | null;
  syncStatus: SyncStatus;                  // §12.1 offline updates
  aiTriageSuggestionId: AiSuggestionId | null; // AI-F-02 / AI-E-02
}

export interface WorkOrderPart extends DomainRecord {
  id: string; workOrderId: WorkOrderId; name: string; quantity: number; unitCost: Money;
}
export interface WorkOrderCost extends DomainRecord {
  id: string; workOrderId: WorkOrderId; category: string; amount: Money; note: string | null;
}
/** FM-03 "every state change tracked and notified"; §10 timestamped + actor-attributed. */
export interface WorkOrderTransition {
  id: string; tenantId: TenantId; workOrderId: WorkOrderId;
  fromStatus: WorkOrderStatus | null; toStatus: WorkOrderStatus;
  actorId: UserId; at: ISODateTime; note: string | null;
  notificationId: NotificationId | null;
}

/** FM-06 — template, run, item and register are four records, not one. */
export interface InspectionTemplate extends DomainRecord, Archivable {
  id: InspectionTemplateId; name: string; category: string;
  items: { id: string; label: string; requiresPhoto: boolean }[];
}
export interface Inspection extends DomainRecord {
  id: InspectionId; templateId: InspectionTemplateId;
  runType: InspectionRunType;
  assetId: AssetId | null; location: SpaceRef;
  scheduledFor: ISODateTime | null;
  performedBy: UserId | null; performedAt: ISODateTime | null;
  status: 'scheduled' | 'in_progress' | 'completed';
  aiDraftedReport: string | null;          // AI-F-03 auto-drafted report
  reportApprovedBy: UserId | null; reportApprovedAt: ISODateTime | null;
  syncStatus: SyncStatus;                  // §12.1 queued inspection logs
}
export interface InspectionItem extends DomainRecord {
  id: InspectionItemId; inspectionId: InspectionId; templateItemId: string;
  label: string;
  result: InspectionResult | null;
  severity: Severity | null;
  notes: string | null;
  photos: AttachmentId[];
  raisedWorkOrderId: WorkOrderId | null;   // FM-06 failed items auto-raise WOs
  aiDetected: boolean;                     // AI-F-03 vision-detected defect
}
/** (not in §8.1) FM-06 "compliance register shows status and expiry per obligation". */
export interface ComplianceObligation extends DomainRecord {
  id: ObligationId; name: string;
  location: SpaceRef; assetId: AssetId | null;
  status: ObligationStatus; expiryDate: ISODate | null;
  lastInspectionId: InspectionId | null;
  evidenceDocumentIds: DocumentId[];
}

/* ══ 4. MODULE 02 — ESTATE MANAGEMENT ════════════════════ */

/** EM-01 "charge setup per unit type/size: recurring cycles, one-off levies,
 *  penalties/discounts (configurable)". */
export interface ChargeDefinition extends DomainRecord, Archivable {
  id: ChargeDefinitionId; estateId: EstateId; name: string;
  kind: 'recurring' | 'one_off_levy';
  cycle: 'monthly' | 'quarterly' | 'annual' | null;
  appliesToUnitTypeCodes: string[];
  ratePerSqm: Money | null; flatAmount: Money | null;
  penaltyRule: { afterDays: number; percent: number } | null;
  discountRule: { beforeDays: number; percent: number } | null;
}

export interface Invoice extends DomainRecord {
  id: InvoiceId; reference: string;
  unitId: UnitId; residentId: ResidentId | null; estateId: EstateId;
  status: InvoiceStatus;
  issuedAt: ISODateTime | null; dueDate: ISODate;
  subtotal: Money; penalties: Money; discounts: Money; total: Money;
  amountPaid: Money; balance: Money;       // EM-01 partial payments
  arrearsAgeDays: number;                  // EM-01 arrears aging
  deliveredChannels: NotificationChannel[];// EM-01 in-app + email/SMS
  escalatedAt: ISODateTime | null;
}
export interface InvoiceLine {
  id: string; tenantId: TenantId; invoiceId: InvoiceId;
  chargeDefinitionId: ChargeDefinitionId | null;
  description: string; quantity: number; unitAmount: Money; lineTotal: Money;
}
/** EM-01 "statements per unit/resident; accounting export". */
export interface Statement extends DomainRecord {
  id: string; unitId: UnitId; residentId: ResidentId | null;
  periodStart: ISODate; periodEnd: ISODate;
  openingBalance: Money; closingBalance: Money;
  generatedAt: ISODateTime; exportUrl: string | null;
}

/** §8.1 Payment — webhook-confirmed; idempotent; per-tenant settlement account. */
export interface Payment extends DomainRecord {
  id: PaymentId;
  target: { kind: 'invoice'; invoiceId: InvoiceId }
        | { kind: 'order'; orderId: OrderId }
        | { kind: 'booking'; bookingId: BookingId }; // SC-04 shared payment service
  payerUserId: UserId;
  amount: Money;
  method: PaymentMethod;                   // SC-02 cards / transfers / USSD
  provider: 'paystack' | 'flutterwave';
  providerReference: string;
  idempotencyKey: string;                  // SC-02
  status: PaymentStatus;
  webhookConfirmedAt: ISODateTime | null;
  webhookAttempts: number;                 // SC-02 retries
  isPartial: boolean;                      // EM-01
  receiptUrl: string | null;
}
export interface Refund extends DomainRecord {
  id: RefundId; paymentId: PaymentId; amount: Money;
  reason: string; status: 'requested' | 'completed' | 'failed';
  providerReference: string | null; requestedBy: UserId;
}
/** SC-02 "per-tenant reconciliation report"; source of truth per Q10. */
export interface ReconciliationReport extends DomainRecord {
  id: string; periodStart: ISODate; periodEnd: ISODate;
  gatewayTotal: Money; ledgerTotal: Money; variance: Money;
  unmatchedPaymentIds: PaymentId[]; generatedAt: ISODateTime;
}
/** EM-01 §10 reminder schedule; AI-E-03 timing suggestions need manager approval. */
export interface ReminderCampaign extends DomainRecord {
  id: string; estateId: EstateId;
  offsetsDays: number[]; channels: NotificationChannel[];
  targetInvoiceIds: InvoiceId[];
  aiSuggestionId: AiSuggestionId | null;   // AI-E-03
  approvedBy: UserId | null; approvedAt: ISODateTime | null; // "managers approve"
  status: 'draft' | 'approved' | 'running' | 'completed';
}

/** (not in §8.1) EM-03 resident ticket — distinct from WorkOrder. */
export interface MaintenanceRequest extends DomainRecord {
  id: RequestId; ticketId: string;         // "ticket ID with visible status"
  residentId: ResidentId; unitId: UnitId; estateId: EstateId;
  category: string; description: string;
  photos: AttachmentId[];
  workOrderId: WorkOrderId | null;         // feeds FM-03 pipeline
  visibleStatus: WorkOrderStatus;
  ratingStars: number | null;              // "can rate the resolution"
  ratingComment: string | null;
  aiTriageSuggestionId: AiSuggestionId | null; // AI-E-02
}

/** §8.1 Announcement — broadcast or targeted; tracks delivery/read. */
export interface Announcement extends DomainRecord {
  id: AnnouncementId;
  title: string; body: string;
  audienceType: AnnouncementAudience;
  targetEstateIds: EstateId[]; targetBuildingIds: BuildingId[]; targetRoles: Role[];
  channels: NotificationChannel[];         // per user preference (SC-09)
  status: AnnouncementStatus;
  aiDrafted: boolean;                      // AI-E-04
  aiSuggestionId: AiSuggestionId | null;
  translations: Record<string, { title: string; body: string }>; // AI-E-04
  approvedBy: UserId | null; approvedAt: ISODateTime | null;     // required before send
  scheduledFor: ISODateTime | null; sentAt: ISODateTime | null;
  sentCount: number; deliveredCount: number; readCount: number;  // EM-04 stats
}
/** EM-04 delivery/read statistics require per-recipient rows. */
export interface AnnouncementDelivery {
  id: string; tenantId: TenantId; announcementId: AnnouncementId;
  userId: UserId; channel: NotificationChannel;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'read';
  sentAt: ISODateTime | null; deliveredAt: ISODateTime | null; readAt: ISODateTime | null;
  failureReason: string | null;
}

/** (not in §8.1) EM-05 amenity setup. */
export interface Amenity extends DomainRecord, Archivable {
  id: AmenityId; estateId: EstateId; name: string;
  capacity: number;
  openingHours: { day: number; opens: string; closes: string }[];
  rules: string;
  feeAmount: Money | null;
  approvalMode: AmenityApprovalMode;
  cancellationWindowHours: number;
}
export interface Booking extends DomainRecord {
  id: BookingId; amenityId: AmenityId; residentId: ResidentId; estateId: EstateId;
  startsAt: ISODateTime; endsAt: ISODateTime;
  status: BookingStatus;
  attendees: number | null;
  feeAmount: Money | null; paymentId: PaymentId | null; // payment required to confirm
  approvedBy: UserId | null; approvedAt: ISODateTime | null;
  cancellationDeadline: ISODateTime | null; cancelledAt: ISODateTime | null;
}

/** §8.1 Visitor pass — issued by resident; verified by security; logged. */
export interface VisitorPass extends DomainRecord {
  id: VisitorPassId;
  issuedByResidentId: ResidentId; unitId: UnitId; estateId: EstateId;
  guestName: string; guestPhone: string | null; vehiclePlate: string | null;
  code: string; qrUrl: string;
  validFrom: ISODateTime; validTo: ISODateTime; // time-bound
  status: VisitorPassStatus;
  verifiedBy: UserId | null; verifiedAt: ISODateTime | null; gate: string | null;
  retentionExpiresAt: ISODateTime;         // EM-02 "retained per NDPA retention policy"
}

/** §8.1 SOS event — panic alert with acknowledge/resolve trail. */
export interface SosEvent extends DomainRecord {
  id: SosEventId;
  raisedByUserId: UserId; residentId: ResidentId | null;
  unitId: UnitId | null; estateId: EstateId; geo: GeoPoint | null;
  status: SosStatus;
  raisedAt: ISODateTime;
  acknowledgedAt: ISODateTime | null; acknowledgedBy: UserId | null;
  respondingAt: ISODateTime | null;
  resolvedAt: ISODateTime | null; resolvedBy: UserId | null;
  reviewedAt: ISODateTime | null; reviewedBy: UserId | null;
  responderUserIds: UserId[];
  escalatedToBackupAt: ISODateTime | null; // §10 unacknowledged → escalate
  submissionChannel: 'app' | 'sms';        // EM-06 SMS fallback (proposed)
  syncStatus: SyncStatus;                  // §12.1 queued SOS writes
}
export interface SosTimelineEntry {
  id: string; tenantId: TenantId; sosEventId: SosEventId;
  fromStatus: SosStatus | null; toStatus: SosStatus;
  actorId: UserId | null; at: ISODateTime; note: string | null;
}
/** (not in §8.1) EM-06 "patrol and incident logging for security staff". */
export interface PatrolLog extends DomainRecord {
  id: PatrolId; estateId: EstateId; officerId: UserId;
  startedAt: ISODateTime; endedAt: ISODateTime | null;
  checkpoints: { name: string; scannedAt: ISODateTime; geo: GeoPoint | null }[];
  notes: string | null; syncStatus: SyncStatus;
}
export interface SecurityIncident extends DomainRecord {
  id: IncidentId; estateId: EstateId; reportedBy: UserId;
  occurredAt: ISODateTime; category: string; description: string;
  severity: Severity | null; photos: AttachmentId[];
  linkedSosEventId: SosEventId | null;
  status: 'open' | 'under_review' | 'closed';
}

/** EM-07 searchable directory with services and contact routes; visibility per role. */
export interface DirectoryEntry extends DomainRecord {
  id: string; estateId: EstateId;
  subject: { kind: 'vendor'; vendorId: VendorId } | { kind: 'staff'; userId: UserId };
  displayName: string; services: string[];
  contactPhone: string | null; contactEmail: string | null;
  visibleToRoles: Role[];                  // §7 visibility rules
}

/** EM-08 + AI-S-03. */
export interface Folder extends DomainRecord {
  id: FolderId; parentId: FolderId | null; estateId: EstateId | null; name: string;
  visibleToRoles: Role[];
}
export interface DocumentRecord extends DomainRecord, Archivable {
  id: DocumentId; folderId: FolderId | null;
  name: string; mimeType: string; sizeBytes: number; storageKey: string; // tenant-prefixed (§8.2)
  owner: { kind: 'estate'; estateId: EstateId } | { kind: 'asset'; assetId: AssetId }
       | { kind: 'vendor'; vendorId: VendorId } | { kind: 'work_order'; workOrderId: WorkOrderId }
       | { kind: 'standalone' };
  visibleToRoles: Role[]; visibleToEstateIds: EstateId[];
  indexStatus: 'pending' | 'indexed' | 'failed'; // EM-08 "all documents indexed"
  ocrText: string | null;                  // AI-S-03
  vectorNamespace: string;                 // §8.2 per-tenant vector-store namespace
}
/** AI-S-03 "extracted fields editable before save". */
export interface ExtractedField {
  id: string; tenantId: TenantId; documentId: DocumentId;
  key: string; value: string; confidence: number;
  editedBy: UserId | null; savedAt: ISODateTime | null;
}

/* ══ 5. MARKETPLACE (EM-09, SC-04) & INVESTOR (SC-08) ════ */

export interface Listing extends DomainRecord, Archivable {
  id: ListingId; vendorId: VendorId; estateId: EstateId | null;
  type: 'product' | 'service';
  title: string; description: string; price: Money;
  photos: AttachmentId[];
  status: 'draft' | 'active' | 'suspended';
  aiGenerated: boolean;                    // AI-E-05 listing auto-generation
}
export interface MarketplaceOrder extends DomainRecord {
  id: OrderId; reference: string;
  residentId: ResidentId; vendorId: VendorId; estateId: EstateId;
  status: MarketplaceOrderStatus;
  total: Money; paymentId: PaymentId | null;
  placedAt: ISODateTime;
  acceptByDeadline: ISODateTime | null;    // §10 auto-expire if not accepted
  acceptedAt: ISODateTime | null; fulfilledAt: ISODateTime | null; closedAt: ISODateTime | null;
  payoutId: PayoutId | null;               // BLOCKED by Q3
}
export interface OrderItem {
  id: string; tenantId: TenantId; orderId: OrderId; listingId: ListingId;
  quantity: number; unitPrice: Money; lineTotal: Money;
}
/** EM-09 "Commission/payout model per commercial decision — Q3 blocks build of payouts." */
export interface Payout extends DomainRecord {
  id: PayoutId; vendorId: VendorId; orderIds: OrderId[];
  grossAmount: Money; commissionAmount: Money | null; netAmount: Money | null;
  status: 'pending' | 'paid' | 'failed';
  // commission %, escrow, payout rails and KYC all undefined until Q3 is answered
}
/** AI-E-05 "fraud flags go to a human review queue — never auto-block". */
export interface FraudFlag extends DomainRecord {
  id: string;
  subject: { kind: 'listing'; listingId: ListingId } | { kind: 'order'; orderId: OrderId };
  reason: string; confidence: number;
  reviewStatus: 'pending' | 'cleared' | 'confirmed';
  reviewedBy: UserId | null; reviewedAt: ISODateTime | null;
}

export interface InvestorProject extends DomainRecord {
  id: ProjectId; name: string; estateId: EstateId | null;
  totalUnits: number; unitsSold: number; occupancyPct: number | null;
  targetReturnPct: number | null;
  status: 'off_plan' | 'under_construction' | 'delivered';
}
/** (not in §8.1) SC-08 "investors see only their projects" needs an explicit grant. */
export interface InvestorAccess {
  tenantId: TenantId; investorUserId: UserId; projectId: ProjectId;
  grantedBy: UserId; grantedAt: ISODateTime;
}
export interface Lead extends DomainRecord {
  id: LeadId; projectId: ProjectId | null;
  fullName: string; email: string; phone: string | null;
  source: 'landing_page' | 'manual' | 'referral'; // SC-11 lead capture (proposed)
  stage: 'new' | 'contacted' | 'qualified' | 'reserved' | 'closed_won' | 'closed_lost';
  aiScore: number | null;                  // AI-S-04 lead scoring
}
/** AI-S-04 "all outputs labelled as estimates with assumptions shown". */
export interface Forecast extends DomainRecord {
  id: string; projectId: ProjectId;
  kind: 'sales' | 'occupancy' | 'roi';
  horizonMonths: number; value: number;
  assumptions: string[];                   // must be shown in the UI
  isEstimate: true;                        // never presented as financial advice
  generatedAt: ISODateTime; aiInteractionId: AiInteractionId;
}

/* ══ 6. PLATFORM SERVICES ════════════════════════════════ */

/** SC-10 — immutable; 12-month retention (proposed); queryable from admin console. */
export interface AuditLog {
  id: AuditLogId; tenantId: TenantId | null;
  category: AuditCategory;
  actorId: UserId | null; actorRole: Role | null;
  action: string;
  entityType: string; entityId: string | null;
  before: unknown | null; after: unknown | null;
  ipAddress: string | null;
  at: ISODateTime;
  retentionExpiresAt: ISODateTime;
}

/** SC-09 — unified push/SMS/email/in-app service on a single event bus. */
export interface NotificationTemplate extends DomainRecord {
  id: string; key: string; channel: NotificationChannel; locale: string;
  subject: string | null; body: string;
}
export interface NotificationPreference {
  userId: UserId; tenantId: TenantId | null;
  channels: Record<NotificationChannel, boolean>;
  quietHours: { start: string; end: string; timezone: string } | null;
}
export interface Notification {
  id: NotificationId; tenantId: TenantId;
  eventKey: string; userId: UserId; channel: NotificationChannel;
  templateId: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'read';
  sentAt: ISODateTime | null; deliveredAt: ISODateTime | null; readAt: ISODateTime | null;
  failureReason: string | null;            // SC-03 delivery-failure handling/logs
  deepLink: string | null;
}

/** §8.1 AI interaction log — per tenant; powers audit, tuning and cost metering. */
export interface AiInteractionLog {
  id: AiInteractionId; tenantId: TenantId;
  featureId: AiFeatureId; userId: UserId | null;
  requestRedacted: string;                 // §11.4 PII minimised/redacted
  responseRedacted: string;
  confidence: number | null;
  sources: { documentId: DocumentId | null; label: string }[]; // grounded answers
  latencyMs: number; inputTokens: number; outputTokens: number;
  estimatedCost: Money;
  provider: string;                        // §11.4 provider abstraction
  fallbackUsed: boolean;                   // degraded to listed fallback
  vectorNamespace: string;                 // hard-scoped to tenant
  at: ISODateTime;
}
/** §11.4 "every suggestion is review/approve/override — AI is assistive, not autonomous." */
export interface AiSuggestion extends DomainRecord {
  id: AiSuggestionId; featureId: AiFeatureId;
  targetType: string; targetId: string;
  payload: unknown; confidence: number;
  sources: { documentId: DocumentId | null; label: string }[];
  status: AiSuggestionStatus;
  reviewedBy: UserId | null; reviewedAt: ISODateTime | null;
  overrideValue: unknown | null;           // AI-F-02 overrides logged for tuning
  aiInteractionId: AiInteractionId;
}
/** AI-E-01 / AI-F-05 / AI-S-01 conversational surfaces. */
export interface Conversation extends DomainRecord {
  id: ConversationId; featureId: AiFeatureId; userId: UserId;
  module: Module;
  escalatedRequestId: RequestId | null;    // AI-E-01 no source → refuse and escalate
}
export interface ConversationMessage {
  id: string; tenantId: TenantId; conversationId: ConversationId;
  role: 'user' | 'assistant'; content: string;
  sources: { documentId: DocumentId | null; label: string }[];
  confidence: number | null; at: ISODateTime;
  aiInteractionId: AiInteractionId | null;
}
/** AI-F-01 ranked failure-risk list; AI-E-03 defaulter risk; AI-F-04 anomaly cards. */
export interface RiskScore extends DomainRecord {
  id: string; featureId: AiFeatureId;
  subject: { kind: 'asset'; assetId: AssetId } | { kind: 'unit'; unitId: UnitId }
         | { kind: 'resident'; residentId: ResidentId };
  score: number; windowDays: number | null;
  shadowMode: boolean;                     // AI-F-01 runs in shadow until data suffices
  computedAt: ISODateTime;
}
export interface AnomalyCard extends DomainRecord {
  id: string; featureId: AiFeatureId;
  series: 'cost' | 'energy' | 'usage';
  title: string; explanation: string;      // plain-language
  drillDownFilter: Record<string, unknown>;
  feedback: 'confirmed' | 'dismissed' | null; // tunes sensitivity
  feedbackBy: UserId | null;
}

/** (not in §8.1) FM-01 CSV template; §8.2 bulk import of estates/units. */
export interface ImportJob extends DomainRecord {
  id: ImportJobId;
  target: 'assets' | 'units' | 'residents' | 'estates';
  fileUrl: string; status: 'pending' | 'running' | 'completed' | 'failed';
  rowsTotal: number; rowsSucceeded: number; rowsFailed: number;
  errors: { row: number; message: string }[];
}

/** §12.1 queued writes with visible sync status; server-authoritative conflicts. */
export interface SyncQueueItem {
  id: string; tenantId: TenantId; userId: UserId; deviceId: string;
  entityType: 'work_order' | 'inspection' | 'sos' | 'patrol';
  entityId: string; operation: 'create' | 'update';
  payload: unknown; queuedAt: ISODateTime;
  status: SyncStatus;
  conflictSurfacedAt: ISODateTime | null;  // overwritten edits surfaced + audit-logged
  auditLogId: AuditLogId | null;
}

/** §12 Privacy — NDPA consent records + processing register; DPIA gates AI-E-06 (Q5). */
export interface ConsentRecord {
  id: string; tenantId: TenantId; subjectUserId: UserId;
  purpose: 'biometric' | 'cctv' | 'marketing' | 'processing';
  granted: boolean; grantedAt: ISODateTime | null; revokedAt: ISODateTime | null;
  evidenceUrl: string | null;
}
export interface RetentionPolicy {
  tenantId: TenantId; entityType: string; retentionDays: number; // per-entity schedule
}

/** FM-07 dashboards, filters by estate/date, CSV/PDF export, role-scoped per §7. */
export interface ReportExport extends DomainRecord {
  id: string; reportKey: string;
  filters: { estateIds: EstateId[]; from: ISODate; to: ISODate };
  format: 'csv' | 'pdf';
  requestedBy: UserId; fileUrl: string | null;
  status: 'queued' | 'ready' | 'failed';
}

```

### src/domain/status-tones.ts — design-system bridge (`typescript`)

```typescript
/** Replaces STATUS_COLORS / LoadStatus in src/components/ui/index.tsx.
 *  One colour language across every §10 state machine so FM-07 dashboards
 *  (SC-06) read consistently when several status families share a screen. */

import type {
  WorkOrderStatus, InvoiceStatus, BookingStatus, SosStatus,
  MarketplaceOrderStatus, WorkOrderPriority, Severity,
} from './core';

export type DomainStatus =
  | WorkOrderStatus | InvoiceStatus | BookingStatus | SosStatus | MarketplaceOrderStatus;

/** Semantic tone, not a hex — the token layer resolves it so themes still work. */
export type Tone = 'neutral' | 'info' | 'progress' | 'warn' | 'danger' | 'success' | 'muted';

export const TONE_COLORS: Record<Tone, string> = {
  neutral: '#8b93a1', info: '#3b82f6', progress: '#8b5cf6', warn: '#f59e0b',
  danger: '#e0533d', success: '#10b981', muted: '#6b7280',
};

/** Exhaustive over WorkOrderStatus — adding a state without a tone is a type error. */
export const WORK_ORDER_TONES: Record<WorkOrderStatus, Tone> = {
  new: 'neutral', triaged: 'info', assigned: 'info', in_progress: 'progress',
  on_hold: 'warn', resolved: 'success', verified: 'success', closed: 'muted',
  rejected: 'danger', cancelled: 'muted',
};

export const INVOICE_TONES: Record<InvoiceStatus, Tone> = {
  draft: 'neutral', issued: 'info', partially_paid: 'warn', paid: 'success',
  overdue: 'warn', in_arrears: 'danger', escalated: 'danger',
};

export const BOOKING_TONES: Record<BookingStatus, Tone> = {
  requested: 'neutral', approved: 'info', auto_approved: 'info',
  confirmed: 'progress', completed: 'success', declined: 'danger', cancelled: 'muted',
};

/** EM-06's sub-60s acknowledge target justifies high-salience tones throughout. */
export const SOS_TONES: Record<SosStatus, Tone> = {
  raised: 'danger', acknowledged: 'warn', responding: 'progress',
  resolved: 'success', reviewed: 'muted',
};

export const ORDER_TONES: Record<MarketplaceOrderStatus, Tone> = {
  placed: 'neutral', accepted: 'info', fulfilled: 'success', closed: 'muted',
  declined: 'danger', refunded: 'warn',
};

export const PRIORITY_TONES: Record<WorkOrderPriority, Tone> = {
  emergency: 'danger', high: 'warn', medium: 'info', routine: 'neutral',
};

export const SEVERITY_TONES: Record<Severity, Tone> = {
  low: 'neutral', medium: 'info', high: 'warn', critical: 'danger',
};

export const STATUS_TONES: Record<DomainStatus, Tone> = {
  ...WORK_ORDER_TONES, ...INVOICE_TONES, ...BOOKING_TONES, ...SOS_TONES, ...ORDER_TONES,
};

/** Human labels — §10 writes these in Title Case with spaces. */
export const STATUS_LABELS: Partial<Record<DomainStatus, string>> = {
  in_progress: 'In Progress', on_hold: 'On Hold',
  partially_paid: 'Partially Paid', in_arrears: 'In Arrears',
  auto_approved: 'Auto-approved',
};
export function statusLabel(s: DomainStatus): string {
  return STATUS_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

```

## Open issues
- FM-01 names an asset `status` field but never enumerates its members. Shipped as PROPOSED_ASSET_STATUSES — must be confirmed at discovery before the asset register UI is built.
- FM-04 requires 'occupancy/allocation status per space' without enumerating values. Shipped as PROPOSED_OCCUPANCY_STATUSES.
- §10 names only two work-order priorities, and only by example ('e.g. Emergency: respond 2h / resolve 24h; Routine: 72h'). The full priority ladder and the SLA target for every rung are undefined, yet FM-03 makes per-priority SLA timers a Must acceptance criterion.
- FM-06 specifies checklist items as 'pass/fail/severity' and AI-F-03 outputs 'defects with severity', but no severity scale is enumerated anywhere.
- §10's work-order graph is stated as a single linear chain (New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed) with unattached branches 'Rejected, Cancelled'. Four things are undefined: whether On Hold can resume to In Progress, whether In Progress can go straight to Resolved (bypassing On Hold), what happens when verification fails, and from which states Rejected/Cancelled are reachable. §10 says only listed transitions are legal, so this must be resolved before backend/mobile/QA can agree.
- §10's service-charge graph gives no return path once an invoice is Overdue, In arrears or Escalated, but EM-01 mandates partial payments and auto-reconciliation — a payment landing after the due date has no legal target state.
- §10 writes 'Approved / Auto-approved' as one cell. Unclear whether these are two distinct states or one state plus an autoApproved flag; modelled as two states to match the text literally.
- FM-01's acceptance criterion says 'all changes audit-logged (SC-11)', but SC-11 is the Landing page requirement and SC-10 is Audit logging. Cross-reference error in the PRD.
- No transaction currency is specified anywhere. §18 prices the build in USD; the market and the candidate gateways (Paystack/Flutterwave, USSD) are Nigerian. Money.currency is modelled as tenant configuration pending confirmation.
- EM-09 payouts are explicitly blocked by Q3 (commission %, escrow, vendor payout rails, KYC). The Payout entity is defined but its commission/escrow fields cannot be finalised, and Q3 is not due until Phase 2 start.
- Q1 — who counts as a 'tenant' (only estates operated by 7 Fifteen Capital, or third-party operators too) — determines whether Tenant needs an external operator organisation and separate commercial fields.
- Q2/ADR-01 — shared DB with row-level security vs schema-per-tenant. The model assumes tenantId on every record per §8.2; schema-per-tenant would move the boundary out of the row and change every query path.
- SC-08 requires 'investors see only their projects' but §8.1 provides no entity granting an investor access to a project. An InvestorAccess grant record is required and is not in the PRD's entity table.
- §8.2's hierarchy (Platform → Tenant → Estates/Facilities → Buildings → Units → Residents/Assets) omits the Floor level that FM-01 and FM-04 both include in 'estate→building→floor→unit/zone'. Modelled as an optional level.
- Q4 — SOS operating model (who responds, escalation chain, liability, manned hours) is unanswered, so the responder roster and escalation-target entities behind EM-06's 'designated responders' and 'backup responders' cannot be specified.
- SC-10 sets 12-month retention for the audit log (proposed), and §12 requires a 'per-entity retention schedule', but no other entity has a stated retention period — including the visitor log, which EM-02 says is 'retained per NDPA retention policy'.
- FM-05 says vendors 'submit updates & invoices via the vendor portal' and §8.1 says a vendor 'has documents, invoices, ratings, listings'. This vendor payable is distinct from the resident-facing Invoice in EM-01, but the PRD defines neither its lifecycle nor whether it settles through the SC-02 gateway.
- SC-02 requires webhook confirmation, idempotency, retries, refund and void, but never enumerates payment status members. Shipped as PROPOSED_PAYMENT_STATUSES.
- EM-02 says 'household members supported' without defining what a household member can do — whether they get their own login, can raise requests, issue visitor passes, or make bookings. This affects both the entity and the §7 matrix.
- §7 places Platform Admin at '7 Fifteen Capital HQ' and §8.2 places Platform above Tenant, which forces User.tenantId to be nullable for that role — but the PRD never states this explicitly, and no requirement describes how a Platform Admin's cross-tenant access is itself constrained or logged beyond SC-10.
- Q6 — the launch language list is undefined, yet §12 requires all UI strings externalised and AI-E-04 must translate 'into configured languages'.
- FM-06 requires a compliance register with 'status and expiry per obligation', but ComplianceObligation is absent from the §8.1 entity table and its status values are not enumerated.
- §10 says a marketplace order 'auto-expires' if the vendor does not accept 'within SLA', but the SLA value is never given.
- EM-04 allows targeting by 'audience' as a dimension distinct from estate and building, but no audience or segment entity exists anywhere in the PRD — how an audience is defined and maintained is undefined.
- AI-E-06 (CCTV anomaly detection, face/plate recognition) is gated on Q5 consent framework and DPIA sign-off, so its biometric entities are deliberately not modelled. §12 requires consent records and a processing register regardless of whether AI-E-06 proceeds.
