# Propbrew production runbook

## Promotion gates

For native personal/company login, use [Company accounts](COMPANY_ACCOUNTS.md) and migrations through 010. That release replaces the shared review credential; new company accounts never inherit the stored review tenant.

1. Apply `db/migrations/*.sql` to a staging Neon branch, then production.
2. Complete the real identity, operational storage and provider configuration for a customer launch. The signed private review uses `DATA_SOURCE=postgres` as described below; its forbidden provider credentials must remain absent. Never set `REEVE_ALLOW_IN_MEMORY_DATA=1` in production.
3. Run typecheck, lint, all Vitest suites, `npm audit --omit=dev --audit-level=high`, and `npm run build`.
4. Run the UAT checklist: sign-in/MFA, tenant boundary, work-order mutation, invoice payment webhook replay, offline sync replay, private upload access, consent withdrawal, and AI budget kill switch.
5. Promote staging to production only after webhook signatures, RLS policies, backups, and restore verification pass.
6. Finance approval routes: `POST/PATCH /api/finance/adjustments`, `PATCH /api/finance/settlements`, and `POST /api/finance/settlement-accounts`.
7. Communication callbacks arrive at `/api/webhooks/communications`; queued sends must remain blocked until manager approval when `requires_approval` is true.

The manual backup workflow (`Backup recovery check`) runs `scripts/verify-backup.sh` against the approved archive before promotion.

## Durable workspace records

The current persistence boundary supports the signed private review, with `DATA_SOURCE=postgres`. The server maps its fixed logical sample tenant to `PROPBREW_REVIEW_TENANT_UUID`; callers cannot choose either storage namespace. Apply all migrations through `008_workspace_records.sql` with the migration administrator. Run the application as the nonowner `propbrew_review_app` role, without superuser or RLS-bypass privileges. Keep its connection and credentials separate from the migration account.

`workspace_records` holds one versioned JSONB working set per canonical tenant, including Estate, Facility, Shortlet and Construction records, creator receipts, workflow history, inbox/settings sidecars, reference sequences and offline recovery receipts. RLS is enabled and forced; every database transaction sets its tenant context locally. The logical tenant mapping is immutable.

Writes take tenant and row locks, load the latest committed state, run scoped domain validation, and commit the complete working set before returning success. Failed domain changes roll back; an owned pending offline receipt may be retained so the rejected capture can be reviewed or discarded. Reads use detached snapshots and release their transaction before provider calls. A database outage fails closed: do not switch to `memory` or an in-memory bypass to restore apparent availability.

The initial state is seeded only when a tenant partition is absent. Existing state is never merged with fixtures on startup. Before replacing a memory-only deployment, capture its working set, history and available sidecars before stopping that process. Use `importLegacyWorkspace` to filter ownership and advance reference sequences, validate the result, and import only into the verified, absent target partition. Preserve an encrypted source capture and record counts for reconciliation; do not log record contents or overwrite an existing partition.

Run `node scripts/test-workspace-postgres.mjs` for the disposable loopback PostgreSQL checks. CI runs the native and workspace integration suites against its own isolated service. The normal unit suite skips these database tests unless `PROPBREW_TEST_DATABASE_URL` is explicitly supplied; never point that variable at an application database.

## Workspace backup, restoration and restart verification

1. Take a recoverable PostgreSQL backup before migration or cutover, including `tenants`, `workspace_records`, AI accounting and related tables. Protect the archive as application data. Record its timestamp, workspace version and scoped record counts without exporting personal data into logs.
2. `scripts/verify-backup.sh` confirms archive readability only. Restore the archive with an administrator into a separate database/branch; this is required to prove recovery. Recreate the restricted runtime role/grants, retain forced RLS, and use the same canonical-to-logical tenant mapping. Never restore over the live database as a test.
3. On the isolated restore, verify created properties and creator grants, Facility work orders, Shortlet bookings and exact balances, Construction issues, history, inbox state, next-reference uniqueness and pending/applied/abandoned sync receipts. Verify another tenant and a connection without tenant context cannot read the workspace.
4. Restart the isolated application and repeat the scoped record/count checks. Confirm the stored version and records survive, fixtures are not reapplied, a retry does not duplicate an applied capture, and a pending conflict remains recoverable. Record restoration duration and any data gap against the agreed recovery objectives.
5. Promote only after those checks pass. Rollback must use a database-compatible application version and preserve `DATA_SOURCE=postgres`; deploying an older memory-only application is not a data-recovery procedure.

Persistence does not turn this shared sample review into customer production. Keep one replica for its process-local sign-in throttle. Real customer authentication/MFA, provider activation, permissions UAT, retention approval, data-region decisions and production recovery sign-off remain separate launch gates. See [private review configuration](RAILWAY_PRIVATE_REVIEW.md).

## Recovery

- Restore the latest Neon point-in-time snapshot into an isolated branch.
- Re-run migration checks and tenant-isolation tests against the restored branch.
- Replay only provider events whose `(provider,event_id)` is absent from `payment_events`.
- Rotate provider secrets and invalidate sessions after suspected compromise.

## Nigeria pilot operations

- Paystack and Flutterwave webhooks are signature-verified and must be idempotently persisted before reconciliation.
- Termii is the SMS fallback; Resend is transactional email; Meta WhatsApp is opt-in only.
- Store consent purpose, policy version, grant/withdrawal time, and retention deadline for every AI/marketing/security use.
- Run retention jobs only after DPO approval; use audit search/export for incident evidence and keep provider callbacks idempotent.
