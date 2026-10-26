# Estate operating setup

Native company owners and Estate managers can start from an empty company: create a property and units, add a resident, and then configure billing, tenancy terms and shared amenities. Every new form carries a company binding; resident-bound forms also retain the expected unit. These values only detect stale forms. Verified membership, module permissions, estate scope and PostgreSQL RLS remain the authority.

## Invoices and recurring charges

Billing supports one-off NGN invoice drafts, correction of unpaid drafts and explicit manager issue approval. Amounts are parsed as exact decimal naira into integer kobo; foreign currencies are never silently converted. Draft edits compare the original terms and use an idempotent receipt. Issued and paid invoices cannot be changed by the draft editor. Issuing rechecks the actual resident, unit, property and zero paid balance. Saving or issuing an invoice does not collect money or confirm external message delivery.

Monthly, quarterly and yearly schedules retain their original calendar anchor. A January 31 monthly cycle lands on February 28/29 and then March 31. Rules can be paused/resumed; paused periods are not silently back-billed. Editing a rule changes future ungenerated cycles only. A moved-out resident or changed unit/account binding blocks generation for review. Manual catch-up creates at most 24 drafts per run and reports remaining due rules. The background worker runs up to eight such batches per company in each five-minute sweep (192 drafts), then continues later. Each rule/cycle has a stable invoice identity, so a repeat or restart cannot create a second invoice for that period.

Migration `012_estate_recurring_worker.sql` adds narrow job-directory functions, with no RLS policy changes. Only the runtime database role can call them; an authenticated user transaction cannot enumerate the directory. The directory excludes suspended companies, demonstration sandboxes, the original review tenant and companies without enabled rules.

The long-running Railway application starts an internal worker after startup and checks every five minutes. Each company is revalidated under its normal workspace lock, and the same pure projection used by manager-triggered generation creates **drafts only**. It never impersonates a user, issues a charge, applies a penalty, moves funds or sends a provider message. Generation history records the system timer, and a batch audit event commits in the same database transaction. Empty runs do not rewrite workspace versions. Directory passes are bounded to 2,000 companies and continue from the last scanned identifier on the next sweep, preventing a busy first page from starving later companies. PostgreSQL cursors and deterministic cycle identities provide restart/multiple-instance safety; missed runs catch up later.

Set server-only `PROPBREW_ESTATE_RECURRING_WORKER=0` to stop the background worker. It is also disabled during development/builds, on website-only releases, in shared review mode and without native PostgreSQL storage. There is no public job endpoint. Keep a running Railway application replica; this timer is not a serverless cron substitute.

Residents' displayed native-company balances and Estate Copilot receivables are derived from issued invoices instead of cached contact balances. Draft proposals are excluded from billed totals. Currencies remain separate; malformed balances are marked for review. Copilot uses the current native operating snapshot and remains read-only.

## Tenancy agreements

The Tenancy page records resident/unit-bound lease dates, rent per month/quarter/year, agreed deposit, document reference and notes. It creates an Application-stage agreement with a pending deposit. Application and screening terms may be edited with version and request-replay checks; approved terms remain protected. Overlapping open agreements are rejected, including after a resident moves property. Stage advancement requires the state displayed when a managed agreement was opened. Advancing a stage never invents a deposit receipt.

These are operational agreement records. The form does not execute a legal signature, upload a signed file, transfer a deposit or establish legal enforceability. Actual file storage, verified payments and authorised amendments are separate integrations/policy work.

## Amenities and bookings

The Bookings page includes an Amenities register. Managers configure a property, name, simultaneous-reservation capacity, explicit NGN fee, WAT opening/closing hours, reservation duration and approval rule. A new native company has no global sample catalogue. Changes retain prior booking snapshots, and capacity/hours/duration cannot be changed while future reservations depend on them. Archiving requires future active reservations to be cancelled or completed.

Managers can record reservations for actual residents at the amenity's property. The server validates current company/unit binding, WAT hours, future dates and concurrent interval capacity. Requests reserve capacity, preventing overlapping submissions from oversubscribing a space. Approval rechecks availability. Explicit zero-fee bookings can confirm through the configured rule; fee-bearing bookings remain unconfirmed until verified payment exists. No payment is claimed by reservation creation or approval.

## Verification and release

Run the normal unit, type, lint and build checks, plus `node scripts/test-workspace-postgres.mjs` and `node scripts/test-company-auth-e2e.mjs`. The real database suite covers exact money, invoice issue, recurring manual/background replay, job directory isolation, tenancy deposit integrity, amenity capacity/free confirmation, read-only denial and foreign-company rejection. Browser coverage starts with a fresh company and exercises all four setup areas and reload persistence.

Back up the database, apply migration 012, then deploy the application. The migration is additive. A compatible application rollback preserves new invoices, agreements, booking snapshots and auxiliary setup; stopping the worker does not erase schedule cursors. Do not restore a live database in place as a rollback test.
