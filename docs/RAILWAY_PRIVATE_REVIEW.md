# Propbrew private application review

The application review is a separate Railway service from the public website:

- Application: `https://propbrew-app-production.up.railway.app`
- Application service: `propbrew-app`
- Database: private-network PostgreSQL in the Propbrew project.
- Access: the review passphrase set by the owner; no password or provider key belongs in Git or this document.

This environment is for product review with sample records. Operational sample changes reset on restart. Do not enter customer information. AI conversations use real OpenAI responses; their tenant-isolated usage, estimated costs and redacted interaction records persist in PostgreSQL.

## Release configuration

`deployment/railway-review-settings.json` records the service settings applied through Railway's API. It is a reference manifest, not deprecated root-level Railway Config as Code. The public website service does not consume it. `.node-version` and `RAILPACK_NODE_VERSION` select Node 22; use one application replica for the shared review sign-in throttle.

The review requires `PROPBREW_REVIEW_MODE=1`, `PROPBREW_WEBSITE_ONLY=0`, `NEXT_PUBLIC_DEV_IDENTITY=0`, its salted password hash and random session secret, a persisted review ledger UUID, the least-privilege PostgreSQL application URL, the canonical HTTPS site URL, the server-only OpenAI key and a positive daily AI ceiling. Demo identity and in-memory customer-production bypass flags stay disabled. Clerk, payment, messaging and private-upload credentials are forbidden in this review environment.

The shared review identity has Estate Manager access to all four sample workspaces. It is derived on the server after password verification; unsigned identity cookies cannot change it. Sessions are Secure, HttpOnly, SameSite Strict, password-version-bound and expire after 12 hours. Sign-in has CSRF checks plus shared and per-address rolling attempt limits. Non-Copilot APIs, finance integrations, callbacks and uploads are unavailable.

## Database

Apply migrations 001–006 using the migration administrator. Create the review ledger tenant and enable all four feature controls. Run the application as a separate non-owner role with no superuser, role-creation, database-creation or RLS-bypass privileges. Its access is limited to the AI accounting/control tables and budget functions. Do not give the application the migration administrator's password.

The application uses native PostgreSQL transactions on Railway's encrypted private network. Every operation sets the tenant context locally in the same transaction. Neon-hosted connections retain their HTTP transaction transport. Public PostgreSQL connections require verified TLS.

Operational records are intentionally scoped demonstration fixtures in this environment; the canonical database UUID is used only for durable review AI accounting. This does not activate a production customer datastore or map customer identities to sample data.

## Validation and rollback

Before release, run tests, TypeScript, lint, production dependency audit and the production build. Check unauthenticated redirects/API denials, native password sign-in, secure cookies, all four workspace pages and a live sourced answer in each Copilot. Verify durable per-feature accounting, native currencies and the sample-data banner. Keep a previous healthy deployment available for subsequent Railway rollback.

This release patches Next.js to 16.4.3 and refreshes vulnerable compatible dependencies. A customer production launch remains a separate release requiring its own real identity, operational persistence, provider/data-region approval and UAT.
