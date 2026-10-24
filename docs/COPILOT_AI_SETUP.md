# Propbrew Copilot activation

Estate, Facility, Shortlet and Construction share an AI-only streaming service. Each portal supplies its own authorised record projection. Chat does not call the legacy keyword answer engines, substitute scripted answers after provider errors, or perform operational mutations.

## Connect OpenAI

1. Create a project API key in [OpenAI API settings](https://platform.openai.com/api-keys). Keep it out of source control and chat.
2. Add `OPENAI_API_KEY` to the server environment. For this checkout, use `.env.local`; for deployment, use the hosting service's encrypted environment settings. Never use a `NEXT_PUBLIC_` prefix.
3. Use Node.js 22 or newer. Install the locked dependencies with `npm ci`.
4. Restart the deployed application after changing its environment. During local development, ensure Next has reloaded the environment before testing.
5. The default model is `gpt-6.1-sol` through OpenAI's Responses API. An authorised manager can select a tenant model in Facility → Copilot → Usage & models. Other modules use that same tenant selection. Model access and billing must be enabled on the provider account.
6. Set `REEVE_AI_DAILY_CAP_MINOR_NGN` to the approved daily tenant ceiling before using customer data. The value is in kobo; `500000` is an estimated ₦5,000 ceiling. An unset/zero environment value means no environment cap. The database can set a stricter per-feature cap, including an explicit zero.

Optional connections remain available for explicitly selected models: `AI_GATEWAY_API_KEY` (or valid Vercel OIDC) for Gateway, and `ANTHROPIC_API_KEY` for Claude. Selecting a model whose provider is disconnected produces an explicit error; the service does not silently switch models or providers. OpenAI is preferred for OpenAI models when its key is present.

## Durable safeguards

For production, configure `DATABASE_URL` with a real tenant UUID and apply all migrations, including `db/migrations/006_copilot_usage.sql`, using the existing migration process. The live database has **not** been migrated by this UI implementation.

Migration 006 adds a tenant-isolated request ledger and atomic daily budget reservations. It also enables and forces RLS on the AI interaction and feature-control tables. Use the existing least-privilege application database role; a superuser/bypass-RLS role is unsuitable. Review the migration in staging before promotion.

Budget guards reserve a conservative request estimate before contacting the provider. The estimate includes input/context/history and a bounded output allowance. Completed requests reconcile against provider token usage. Unknown-usage interruptions retain a conservative charge; they are not assumed free. Expired reservations retain a charge until confirmed reconciliation. Costs are planning estimates using model catalogue prices and a fixed ₦1,600/USD planning rate, not a current FX quote or provider invoice. Check the provider invoice for actual charges.

Durable `ai_feature_controls` keys are `estate_copilot`, `facility_copilot`, `shortlet_copilot` and `construction_copilot`. New questions also honour these server emergency switches:

```
REEVE_AI_DISABLE_ESTATE_COPILOT=1
REEVE_AI_DISABLE_FACILITY_COPILOT=1
REEVE_AI_DISABLE_SHORTLET_COPILOT=1
REEVE_AI_DISABLE_CONSTRUCTION_COPILOT=1
```

Development/test can use a process-local ledger for seeded tenant identifiers. It resets with the process and is not a production audit trail. Production refuses that fallback. A missing migration or unreachable ledger blocks provider execution rather than allowing unmetered calls.

## Review the experience

- Ask a free-form operational question in each of `/estate/copilot`, `/copilot`, `/shortlet/copilot` and `/construction/copilot`.
- Verify streamed text and the actual model label. Ask a follow-up that requires the previous completed exchange.
- Expand the activity strip. It reports actual application stages: access, context loading, model connection, answer generation and usage recording. It never displays private model reasoning. OpenAI response storage is disabled, and reasoning summaries are not requested.
- Check snapshot dates, partial-coverage warnings and the source registers. These are supplied context references, not fabricated document citations. Current repository snapshots may be historical demonstration data; live AI does not turn seed records into live bank or channel evidence.
- Stop a response and verify that its partial text stays marked incomplete. Retry is explicit; aborted/failed text is not reused as completed follow-up context.
- Test a limited Construction operator: commercial datasets and prior privileged conversation are withheld. A pure investor cannot enter the operator Copilot.
- Exercise a missing key, exhausted budget, provider error and unavailable ledger. None should produce a scripted answer or a successful completion badge.

Only scoped, explicitly projected record fields enter the provider request. Contact identifiers and recognisable credentials are redacted. Raw database entities, guest access tokens, Wi-Fi credentials, bank account fields and private media are excluded. Prompts/outputs in the durable audit are redacted and bounded; the grounding audit stores coverage/source metadata rather than the full record snapshot. OpenAI's account data controls, processing terms, retention exceptions and region remain a separate provider configuration and client approval responsibility.

## Verification record

Automated checks cover stream framing/Unicode, follow-up history, safe rendering, cancellation, explicit errors, module/tenant scope, restricted commercial fields, native currencies, usage accounting and provider request configuration. Migration 006 was exercised against a disposable local PostgreSQL 16 cluster: RLS, concurrent reservations, feature controls, UTC day boundaries, idempotent completion and unknown-usage reconciliation passed. This is not verification of the production database or a billable live-model call.
