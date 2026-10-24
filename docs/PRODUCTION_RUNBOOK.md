# Reeve production runbook

## Promotion gates

1. Apply `db/migrations/*.sql` to a staging Neon branch, then production.
2. Set `DATA_SOURCE=http`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, and provider secrets. Never set `REEVE_ALLOW_IN_MEMORY_DATA=1` in production.
3. Run typecheck, lint, all Vitest suites, `npm audit --omit=dev --audit-level=high`, and `npm run build`.
4. Run the UAT checklist: sign-in/MFA, tenant boundary, work-order mutation, invoice payment webhook replay, offline sync replay, private upload access, consent withdrawal, and AI budget kill switch.
5. Promote staging to production only after webhook signatures, RLS policies, backups, and restore verification pass.
6. Finance approval routes: `POST/PATCH /api/finance/adjustments`, `PATCH /api/finance/settlements`, and `POST /api/finance/settlement-accounts`.
7. Communication callbacks arrive at `/api/webhooks/communications`; queued sends must remain blocked until manager approval when `requires_approval` is true.

The manual backup workflow (`Backup recovery check`) runs `scripts/verify-backup.sh` against the approved archive before promotion.

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
