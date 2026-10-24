# Propbrew Master Product Requirements Document

**Product:** Propbrew — Real Estate Operating System  
**Pilot market:** Lagos, Nigeria  
**Document version:** 1.0  
**Date:** 11 October 2026  
**Status:** Product baseline; production launch remains gated by infrastructure, UAT, and client sign-off.

## 1. Product brief

Propbrew is a multi-tenant operating system for residential estates and property operators. It brings facility operations, estate management, construction delivery, resident services, payments, communications, and AI-assisted decision support into one secure workspace.

The product must work for Nigerian operating conditions: mobile-first usage, intermittent connectivity, Nigerian Naira payments, Paystack/Flutterwave settlement, Termii SMS, WhatsApp, email, local privacy obligations under the NDPA, and operational escalation where response time matters.

### Product promise

Operators should be able to answer, from one trusted system:

- What needs attention now?
- Which resident, asset, vendor, invoice, or project is affected?
- Who owns the next action and when is it due?
- What evidence supports the decision?
- What changed, who changed it, and can we prove it later?

## 2. Outcomes and success measures

### Business outcomes

1. Reduce missed maintenance, compliance, and SOS actions.
2. Improve collection visibility and payment reconciliation.
3. Give residents a reliable request, communication, payment, and access experience.
4. Give executives a trustworthy portfolio view across estates.
5. Reduce administrative work through safe, reviewable AI assistance.
6. Establish a repeatable operating platform for Nigerian estate operators.

### Pilot success targets

| Area | Target |
|---|---|
| Launch footprint | One Lagos operator, up to 10 estates, 2,000 units, 100 active staff |
| Work orders | 95% of urgent work orders acknowledged within tenant SLA |
| SOS | Acknowledgement within 60 seconds during manned hours, subject to agreed staffing |
| Payments | 100% of verified gateway events persisted idempotently; unmatched settlement lines visible |
| Reconciliation | Finance approval required for settlement adjustments and exceptions |
| Offline operations | No silent loss of queued field updates or evidence media |
| AI safety | Every AI output has tenant scope, redaction, confidence/grounding state, budget, and human override path |
| Privacy | Consent, retention, access, and deletion/anonymisation records available for regulated data |

## 3. Users and roles

The authoritative roles are:

- **Platform Admin:** cross-tenant support with audited break-glass access.
- **Executive:** portfolio visibility and decision-making.
- **Estate Manager:** resident, billing, communications, and estate operations.
- **Facility Manager:** assets, maintenance, inspections, vendors, and compliance.
- **Technician:** assigned field work, evidence capture, and offline updates.
- **Resident:** own requests, invoices, payments, bookings, access, and community interactions.
- **Security:** SOS, visitors, access events, and security operations.
- **Vendor:** own assignments, documents, updates, invoices, and marketplace presence.
- **Investor:** own project and investment views.

Authorization is deny-by-default. Every request derives tenant, estate, unit, ownership, and role scope from the authenticated session; no request body or URL parameter may grant scope.

## 4. Product structure

### 4.1 Facility Management

**Must:**

- Asset register with archive-only lifecycle, location, warranty, photos, documents, and history.
- Preventive maintenance plans, checklists, due dates, and generated work orders.
- Work-order lifecycle: New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed, with Rejected and Cancelled branches.
- Vendor management, assignments, insurance/certification expiry, performance, and invoice submission.
- Reporting and analytics with estate/date filters, role-scoped visibility, and CSV/PDF export.
- Mobile-first field access with offline reads, queued writes, evidence capture, conflict visibility, and sync status.

**Should:**

- Space hierarchy: estate → building → floor → unit/zone.
- Inspection templates, mobile runs, failed-item work orders, and compliance register.

### 4.2 Estate Management

**Must:**

- Service charges, recurring cycles, levies, penalties/discounts, invoices, receipts, partial payments, arrears aging, and accounting export.
- Resident onboarding, unit linkage, household members, move-in/move-out, visitor invites, QR/pass verification, and retention controls.
- Resident maintenance request portal feeding the shared work-order pipeline.
- Targeted and broadcast announcements through in-app, push, SMS, email, and WhatsApp, respecting preferences.
- Community, documents, governance, bookings, parcels, security/SOS, and marketplace foundations already represented in the application navigation.

**Should:**

- Amenities, events, rewards, board/committee, collections workflows, and richer marketplace operations.

### 4.3 Construction delivery

- Projects, phases, tasks, milestones, RFQs, purchase orders, materials, warehouses, stock, cost codes, variations, workers, attendance, safety, RFIs, approvals, transmittals, site logs, and offline field capture.
- Immutable audit history for state transitions, approvals, stock reconciliation, and evidence.
- Site and project views must remain useful with intermittent connectivity.

### 4.4 Shared platform

- Tenant and estate isolation with PostgreSQL RLS.
- Clerk-backed authentication with MFA policy for privileged roles.
- Mobile-consumable versioned API.
- Idempotency for webhooks and offline operations.
- Private object storage for evidence and documents.
- Durable audit, consent, retention, notification, and AI interaction records.

## 5. Payments and finance requirements

### Payment lifecycle

1. Resident or customer initiates payment through a configured provider.
2. Paystack is the pilot primary; Flutterwave is the configured fallback.
3. Webhook signatures are verified against the raw request body.
4. Verified events are persisted before business projection changes.
5. `(provider, event_id)` is idempotent.
6. Payment is matched to an invoice/order using tenant, reference, currency, and amount rules.
7. Partial payments update the invoice without overstating collection.
8. Refunds, chargebacks, and adjustments create approval records and immutable audit entries.
9. Bank statement lines are imported, matched, marked unmatched, and approved/rejected by finance.
10. Tenant settlement accounts are configured per provider; only safe references and account last-four are stored.

### Finance controls

- No refund, chargeback, settlement adjustment, or manual reconciliation approval without an authenticated finance-capable actor.
- Gateway settlement versus bank statement source of truth must be explicitly selected by the client finance owner.
- Marketplace payouts remain manual until vendor KYC and reconciliation are approved.
- Every financial action is searchable by tenant, actor, reference, status, and timestamp.

## 6. Communications requirements

### Channels

- In-app notifications and inbox.
- Push notifications when mobile distribution is enabled.
- Termii SMS.
- Resend transactional email.
- WhatsApp Business.

### Reliability and control

- Queue every provider delivery that may need retry.
- Use exponential backoff and a dead-letter state after bounded attempts.
- Persist provider message IDs and delivery/read/bounce/failure callbacks.
- Support tenant templates by purpose and channel.
- Support per-recipient channel preferences, quiet hours, and emergency overrides.
- Emergency messages may bypass quiet hours only under the tenant’s approved policy.
- AI-generated or AI-translated messages must be blocked until a manager approves the exact content.
- Marketing messages require recorded consent; operational and emergency messages use documented lawful-basis rules.

## 7. AI platform requirements

### Gateway

All AI features use one provider gateway with:

- Provider abstraction and health checks.
- Tenant and feature budgets stored in database controls.
- Environment kill switches for emergency shutdown.
- Redacted prompts, grounding, and outputs in durable interaction logs.
- Tenant-isolated retrieval and embeddings.
- Explicit fallback when a provider is unavailable or a budget is exceeded.
- Confidence, grounding/source, loading, error, and human override UX states.

### AI feature families

**Facility AI:** predictive maintenance, work-order triage, inspection defect assistance, anomaly cards, and operational copilot.  
**Estate AI:** resident chatbot, request triage, arrears/reminder timing suggestions, communication drafting/translation, investor/lead assistance.  
**Shared AI:** grounded reporting, document extraction, document search, provider routing, and interaction evaluation.

### AI safety rules

- AI never changes a schedule, payment, permission, security action, or outbound message without the required human approval.
- Retrieval must apply tenant scope before results are generated.
- Sensitive data must be redacted where the use case does not require raw values.
- Security or biometric AI requires DPO/security approval and a completed DPIA before activation.
- Evaluation datasets, scores, overrides, and provider incidents are retained for review.

## 8. Nigeria pilot requirements

- Default currency: NGN; minor-unit arithmetic for all money.
- Paystack primary and Flutterwave fallback, subject to provider selection and credentials.
- Termii SMS sender and delivery status.
- WhatsApp Business phone-number ID, access token, opt-in, and callback verification.
- Resend verified sending domain and `EMAIL_FROM`.
- Nigeria-region primary data where provider support exists; cross-border processing requires legal/DPO review.
- NDPA processing register, consent records, retention schedules, subject access/deletion/anonymisation workflows, and DPIA evidence.
- PWA/offline-first pilot; native iOS/Android distribution follows reliability proof and account ownership.
- English at launch; Yoruba, Hausa, and Igbo are a planned localization tranche after UAT.

## 9. Data and architecture requirements

### Tenant model

Pilot baseline: one tenant per operating company; estates are child scopes. Every durable row, object path, search namespace, AI embedding, audit event, and provider record carries tenant scope.

### Persistence

- PostgreSQL is the system of record.
- Migrations are versioned and tracked in `schema_migrations`.
- RLS uses transaction-local `app.tenant_id`.
- Platform break-glass access is explicit and audited.
- Seed data is demo-only and never a production persistence strategy.
- Object storage is private, tenant-scoped, and accessed through short-lived authorized URLs.

### API

- Versioned mobile API under `/api/v1`.
- Request schemas validate body, query, headers, and size limits.
- Idempotency keys are mandatory for replayable mutations.
- Errors are safe, opaque where authorization is concerned, and include request IDs.

## 10. Security, privacy, and audit

- Clerk session verification and MFA policy for privileged roles.
- Authorization checks are repeated server-side for every read and write.
- Financial, security, permission, authentication, consent, retention, provider, and AI override events are durable and searchable.
- Audit export supports incident and regulator workflows without exposing unrelated tenants.
- Retention jobs support delete or anonymise modes and require DPO-approved policy inputs.
- No hard delete for regulated operational history unless the approved retention policy allows it.
- Secrets remain in Vercel environment variables or approved secret management; never commit values.

## 11. Release and operations

### Required quality gates

- TypeScript, lint, unit/integration tests, tenant-isolation tests, and production dependency audit.
- Browser E2E for sign-in, role scope, work-order mutation, payment webhook replay, offline sync, upload authorization, consent withdrawal, and AI kill switch.
- Accessibility scan with axe for primary shells and critical flows.
- Staging load tests for API health, sync, payment webhooks, reconciliation, and queue processing.
- Security/dependency/container scans.
- Backup restore into an isolated Neon branch.
- Staging promotion only after UAT and observability checks.
- Rollback procedure documented and rehearsed.

### Observability

- Structured logs with request ID, tenant-safe identifiers, route, status, latency, and provider correlation ID.
- Alerts for webhook failures, queue dead letters, reconciliation exceptions, SOS latency, AI provider degradation, budget exhaustion, and RLS test failures.
- No secrets, raw payment credentials, or unnecessary personal data in logs.

## 12. Delivery phases

### Phase 0 — production foundation

Provision Neon, configure Clerk/MFA, Blob, providers, secrets, migrations, RLS verification, durable repository cutover, backup/restore, and staging environment.

### Phase 1 — pilot MVP

Deliver core shared platform, assets, PPM, work orders, vendors, reporting, mobile/offline flows, billing/payments, residents, requests, announcements, notifications, consent, and the shared AI safety gateway.

### Phase 2 — committed expansion

Deliver spaces, inspections/compliance, richer estate operations, investor views, construction depth, document intelligence, anomaly/predictive features, and provider reliability automation.

### Phase 3 — conditional scale

Deliver additional AI features, localization, native distribution, advanced embeddings/reranking, marketplace payouts, and broader multi-operator scale only after sign-off and evidence.

## 13. Launch acceptance checklist

The pilot is launch-ready only when all are true:

- Real tenant UUIDs and operator hierarchy are approved.
- Neon staging and production branches exist, migrations are applied, and RLS cross-tenant tests pass.
- All production secrets are configured and rotated through the approved process.
- Clerk MFA, provider webhooks, Blob access, and callback signatures are verified.
- Payments, partial payments, reconciliation, refunds, chargebacks, and approval trails pass UAT.
- Communication retry/dead-letter and manager approval flows pass UAT.
- Offline sync, media upload, conflict handling, and retention controls pass UAT.
- AI feature budgets, kill switches, retrieval isolation, evaluation, confidence, and overrides pass UAT.
- Backup restoration, load, accessibility, security, and rollback checks pass.
- Client, finance, operations, security, legal, and DPO sign-offs are recorded.

## 14. Explicit non-goals for the Lagos pilot

- Automatic marketplace payouts before KYC and reconciliation approval.
- Unreviewed AI automation of financial, security, permission, or outbound communication actions.
- Native app-store launch before offline and push reliability is proven.
- Multi-country residency guarantees before provider/legal review.
- Treating seed fixtures or the in-memory store as production persistence.

## 15. Traceability and source documents

This master PRD consolidates the detailed requirements and architecture records in:

- `docs/prd-analysis/requirements-catalog.md`
- `docs/prd-analysis/architecture-nfr.md`
- `docs/prd-analysis/domain-model.md`
- `docs/prd-analysis/information-architecture.md`
- `docs/prd-analysis/rbac-permissions.md`
- `docs/prd-analysis/state-machines.md`
- `docs/PRODUCT_DECISIONS.md`
- `docs/PRODUCTION_RUNBOOK.md`
- `docs/PRODUCTION_SIGNOFF.md`

Where this document conflicts with a signed client decision, the signed decision controls and this PRD must be versioned accordingly.
