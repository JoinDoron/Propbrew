# Facility operating setup

A native company with Facility manage access can configure maintenance, record asset services, manage site-owned stock and track compliance obligations from its own empty workspace. These flows use the existing PostgreSQL workspace transaction and company lock. They do not require a sending service or payment provider. View-only accounts cannot submit operational changes; current membership and module access are rechecked before a save.

Start in **Facility → Spaces → Add facility site**. A company-wide Facility manager can record the site's name and address without Estate access. This creates an actual Facility site with no invented buildings or units; its assets, stock and compliance records can be configured immediately. A manager assigned only to existing sites cannot create a new location and thereby extend their own access. Repeated submissions use the same creation receipt.

## Maintenance and servicing

Create an asset in Assets, then create its plan in Maintenance. A plan records its calendar cadence (weekly, monthly, quarterly, half-yearly or yearly, with a multiplier), first due date, lead time, labour estimate and checklist. Runtime and combined plans also record an engine-hour interval. Cumulative runtime readings can be entered for generators and pumps without a connected sensor. Entries cannot reduce the recorded meter; replaying the same submission does not add hours twice.

Calendar cycles retain their original anchor: a monthly January 31 plan produces February 28/29, then March 31. The application maintains one pending occurrence per managed plan and preserves earlier occurrences. Editing or resuming a plan uses a distinct occurrence identity, so an archived schedule is never reused. Paused periods are not silently converted into a backlog. Asset, site and unit bindings are checked again before dispatch or servicing.

New plans default to manual work-order generation. A manager can record service against an unlinked occurrence using the checklist, actual service date, recorded meter value when applicable, notes and saved evidence. Service history retains the original record; approved service entries are not overwritten by later plan edits. Service dates cannot be in the future or earlier than the previous recorded service. The next calendar cycle advances beyond the actual service date without inventing completed missed visits.

Automatic work orders are an explicit plan setting for an established field-team process. The long-running Railway application checks eligible companies every five minutes (first check after startup). It generates unassigned work orders at the plan's lead date or recorded runtime threshold. Generation is bounded to four batches of 24 work orders per company per sweep. A deterministic occurrence link prevents duplicate dispatch after a retry, restart or concurrent request. Directory scans continue between bounded sweeps. Failed companies do not stop other companies, and empty sweeps do not rewrite workspace versions.

Generated jobs still require ordinary triage, eligible assignment and field-team resolution. A linked job must reach Resolved before its asset service can be recorded. The service record does not verify or close that job. Existing technician/vendor and manager separation remains in force; creating a plan does not provision a field-team identity or supplier account. Use manual service recording while configuring a team. The native company access model currently grants module management/view access; more detailed field-team role provisioning is a separate account-management enhancement.

The scheduler runs only for native PostgreSQL company deployments, excludes suspended companies and private demo sandboxes, and has no HTTP job endpoint. Set server-only `PROPBREW_FACILITY_MAINTENANCE_WORKER=0` to stop it. Keep a running application replica; this timer is not a serverless cron service. Demo operators can use **Review due work orders** to process their own configured plans.

## Inventory

Inventory supports a site-owned part master, unique company SKU, stocking unit, bin/location, reorder point, monthly usage estimate and exact NGN unit cost. An opening count requires a reference and reason. Quantities use whole stocking units; choose a smaller stocking unit when the measured item needs fractional quantities.

Receipts, issues and physical-count adjustments append a movement with its before/after stock, operator, timestamp, reference, reason and cost snapshot. Movements cannot make stock negative. Replays do not duplicate a delivery or issue. Stale stock/version checks reject an outdated form rather than replacing a newer balance. Correction of master details does not rewrite earlier movement costs. Only zero-stock items can be archived, and archived stock stays in its history.

New parts require an authorised site, which remains fixed once registered. Historical parts without a site require explicit adoption by a company-wide operator and an opening count. A manager assigned only to particular sites cannot claim an unlocated item. Non-NGN historical records require a reviewed migration, never a silent currency conversion. The former receive-only shortcut is closed in native mode so it cannot bypass movement evidence and history. Stock signals are planning estimates, not supplier orders, invoices or payments.

## Compliance and inspections

Configure an obligation for an authorised site and optional active asset. Record its title, authority, inspection template/checklist, cadence, operational due date and any certificate reference and expiry. Recording a certificate date requires a reference; these are operator-entered details, not independent verification.

Schedule an inspection, then record each checklist result once. Failures and not-applicable items require an explanation. Applicable photo requirements must be satisfied by an actual saved image for that obligation. Failed items create new, unassigned corrective work orders with severity and findings; retrying does not duplicate them. Completed runs retain their checklist and captured cadence even when the obligation is edited later.

A passing operational inspection advances its next operational due date. It **does not extend a certificate expiry, issue a regulatory certificate or establish legal compliance**. Certificate validity and operational follow-up are separate fields. This setup does not invent Nigerian regulatory deadlines; the authorised operator records the applicable authority and obligation.

## Private evidence

Facility service and inspection forms upload real PNG, JPEG, WebP and PDF bytes through a company-aware endpoint. Files are private, bound to the actual asset or obligation and its site, and selected by stored identifier. A claimed photo count, arbitrary URL or another resource's file cannot satisfy an evidence requirement. Active file formats such as SVG/HTML are rejected. PDFs download as attachments; file responses have private/no-store and restrictive content headers.

The pilot stores bounded evidence in an immutable PostgreSQL table, separate from the JSON workspace. Metadata and bytes commit in the same transaction. A hash verifies the retrieved bytes. RLS checks the current tenant, site, Facility grant, active session and private demo-session binding. Read-only users can read permitted evidence but cannot upload. Reset demo metadata no longer authorises old file URLs; bytes remain retained until an administrator applies the retention procedure. Neither private filenames nor file bytes/links enter the Facility AI context.

Limits are 2 MB per file and 100 MB/500 files per company. A database trigger enforces the company-wide limit across site managers. The database backup includes these files; plan object storage before expanding beyond this bounded pilot. No public bucket, object-storage key or external transfer is activated by this release. Automated file-retention/deletion policy remains separate work and should be agreed before collecting sensitive evidence at scale.

## Verification and release

Run unit, lint, type and production build checks; `node scripts/test-workspace-postgres.mjs` exercises real sessions, the runtime database role, evidence bytes/RLS, transaction rollback, workflows and scheduler replay. `node scripts/test-company-auth-e2e.mjs` exercises fresh-company forms, reload persistence and the existing company/demo journeys in an isolated app copy and loopback database.

Back up the database before applying `013_facility_operating_setup.sql`, then deploy the application. Migration 013 adds private evidence and narrow scheduler-directory functions; it does not change existing workspace RLS. Evidence writes are append-only for the application role. A compatible application rollback preserves maintenance plans, service records, stock movements, inspections and evidence. Disable the Facility worker before an incompatible rollback, and never restore a live database in place as a rollback test.

Facility Copilot remains read-only. It uses the current native operating snapshot and scoped maintenance/stock/inspection facts, with bounded history coverage. Risk scores and fuel/carbon estimates are advisory calculations, not verified predictions, supplier prices, live telemetry or regulatory approvals.
