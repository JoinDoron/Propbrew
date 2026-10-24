# Propbrew company accounts

## Identity and company boundaries

`PROPBREW_AUTH_MODE=company`, `PROPBREW_REVIEW_MODE=0` and `DATA_SOURCE=postgres` enable native accounts. Better Auth owns password hashing, database sessions, secure cookies, sign-out and authenticator verification. No hosted Clerk account or provider key is required for this path. Development identity presets and shared review credentials never become company identities.

One person can belong to several companies. A company is a canonical tenant UUID, and its logical operational namespace is the same UUID. Company selection is stored on the verified database session. Selecting an ID grants nothing: every request reloads active membership and company status. A missing, suspended or revoked selection returns to the company chooser without falling back to another company's records.

Public owner registration creates an account and then provisions the tenant, owner membership, empty operational workspace and bounded AI controls in one database transaction. A failed company transaction cannot leave partial tenant data. An account whose company setup failed can retry from `/companies`. New companies receive no demonstration properties, people, messages, histories or commercial records. The former review tenant remains stored separately and is not assigned to public sign-ups.

## Roles and workspaces

Company owners and administrators manage membership; a member receives `view` or `manage` independently for Estate, Facility, Shortlet and Construction. These grants narrow the operational capability matrix. They cannot grant platform administration, resident payment authority or another company's access.

The module chooser, page guards, source queries, Copilot context and explicit mutation boundaries enforce the same module choices. Pages receive a module-narrowed actor so mixed manager/viewer accounts also receive the correct controls. All 138 operational mutations declare their module. A read-only member may update their own notification read markers, but cannot create operational records or author inbox messages.

An owner cannot be demoted or removed through the membership API. Members cannot change their own authority. Company mutations and access changes share a tenant advisory lock; the operational transaction rechecks membership version before executing a write. Removing access preserves company records and does not remove access to unrelated companies.

Estate/Facility site assignments are supported by the trusted membership policy. The present membership UI grants company-wide module access. Shortlet and Construction are company-wide; do not describe these as per-project permissions.

## Sign-in and invitations

- `/sign-up`: personal email/password plus company name; no public tenant/role fields.
- `/login`: password sign-in; enrolled accounts continue to `/login/two-factor`.
- `/companies`: verified memberships, company selection and company creation.
- `/workspaces`: portals available inside the selected company.
- `/company/team`: owner/admin membership and invitation management.
- `/account/security`: local authenticator setup and recovery codes.
- `/invite/<token>`: recipient-bound acceptance; invited registration joins the invited company instead of creating an extra one.

Sessions are stored in PostgreSQL, expire after seven days and are revoked server-side on sign-out. Cookie caching is disabled so revoked sessions are not accepted from cached claims. TOTP enrollment requires the password and a valid authenticator code; password-only sign-in for an enrolled account does not issue an authenticated session. Recovery codes are displayed locally once and are never sent to a QR provider.

Invitations contain a random 256-bit token, expire after 48 hours and are stored only as a SHA-256 digest. Acceptance requires a signed-in account with the matching email, a still-active inviting administrator and an unused invitation. Owners share the private link with the intended teammate; the application does not claim an email was sent. Tokens must not be included in application audit payloads.

Email verification and password-reset delivery are **not connected**. The UI offers password/TOTP access and manual private invitation links; it must not claim an email was delivered or a password-reset request was sent. An unverified email string is not proof of mailbox ownership. Payment, SMS, WhatsApp, uploads and legacy bearer/mobile APIs remain closed by the native proxy until their company identity contract is implemented.

## Configuration and database permissions

Set server-only `BETTER_AUTH_SECRET` (at least 32 random characters), `BETTER_AUTH_URL`, `DATABASE_URL`, `PROPBREW_AUTH_MODE=company`, `PROPBREW_REVIEW_MODE=0`, `PROPBREW_WEBSITE_ONLY=0` and `DATA_SOURCE=postgres`. Keep all demonstration identity/bypass flags disabled. `PROPBREW_AUTH_ORIGINS` may contain comma-separated exact, verified HTTPS app origins. Public connections require verified TLS; Railway's existing private database transport is unchanged. Record the actual region with `PROPBREW_DATABASE_REGION`; a Nigerian company does not imply Nigerian hosting.

Apply all nine migrations through `010_company_ai_platform_budget.sql` with the migration administrator. The existing nonowner `propbrew_review_app` role retains its legacy name but receives the explicit runtime grants in migrations 009–010. Identity tables are server-only authentication authority. Memberships, invitations, security events, tenants and operational records enforce their request-scoped RLS policies. Security-definer helpers have fixed search paths, no dynamic SQL and explicit runtime execute grants; their backing tables are not exposed publicly.

Sign-up/sign-in and MFA use shared database limits. The custom auth hooks also cover direct HTTP calls and server-side SDK calls, which are not covered by the SDK's HTTP limiter alone. Company membership changes and authentication session creation/revocation are durable audit events; credentials and invitation tokens are excluded.

Company-management JSON requests require an exact configured browser origin and a JSON media type. The reader counts actual UTF-8 bytes, permits at most 4,096 bytes, and cancels oversized streams; a forged `Content-Length` does not bypass the limit. Forwarded host/origin headers and Railway's internal request URL never supply origin authority. Account responses use `Cache-Control: no-store`.

Native companies share a conservative platform AI reservation ceiling of **500,000 kobo (₦5,000) per UTC day**, matching the former single-review daily exposure. Each company feature has a narrower initial allowance. Reservations are not refunded after errors or expiry; this is an abuse/spend ceiling, not a provider invoice. An administrator can set the singleton policy to zero to pause native requests. Runtime accounts cannot read or edit global spend totals. Human review and tenant-isolated retrieval still apply.

## Verification and release

Run the normal unit/type/lint/build gates, `node scripts/test-workspace-postgres.mjs`, and `node scripts/test-company-auth-e2e.mjs`. Both database runners create disposable loopback-only clusters. Never supply a live application's database to tests. The native suites exercise actual Better Auth HTTP credentials/TOTP, two-company RLS, atomic provisioning, invitation replay/concurrency, fresh permission checks, operational persistence and the global AI ceiling.

Before changing the live auth mode, back up the current database and verify an isolated restore. Stage native settings without triggering the old release; then deploy the tested code. Verify public sign-up/login, a private company workspace and all four Copilot routes against the live canonical origin. Verify a restart preserves sessions and records. Keep the former review data unassigned unless its owner explicitly approves a controlled import into a verified company.

Rollback must use a compatible database-backed application version and preserve the new auth tables. Do not switch real company records to a development memory adapter. A rollback to review mode must not expose or reassign native company records.

Before adding account email in a later release, require verified mailbox ownership before company creation or recipient-bound invitation acceptance. Verification must not create a full session that bypasses an enrolled authenticator; require the normal password/MFA sign-in afterward or explicitly enforce the second factor. Include existing unverified sessions in that migration plan. Keep delivery receipts free of addresses, credentials, message bodies and tokens, and distinguish provider acceptance from inbox delivery.
