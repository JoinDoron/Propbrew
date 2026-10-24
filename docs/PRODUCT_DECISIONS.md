# Product decisions — pilot baseline

These decisions close the open questions recorded in `src/domain/delivery.ts` for the Lagos pilot. They are deliberately reversible through configuration.

| Area | Pilot decision |
|---|---|
| Tenancy | One tenant per operating company; every row carries tenant scope; estates are child scopes. |
| Database isolation | PostgreSQL RLS using `app.tenant_id`; platform support uses an audited break-glass role. |
| Payouts/KYC | Marketplace payouts remain manual until vendor KYC and settlement reconciliation are approved. |
| SOS | Security desk owns acknowledgement; escalation requires a named on-call and response SLA. |
| AI consent | AI assistance is opt-in, redacted, budgeted, kill-switchable, and logged against policy version. |
| Languages | English first; Yoruba, Hausa, and Igbo are the next localization tranche after UAT. |
| Residency | Nigeria-region primary data where provider support exists; no sensitive export without consent/legal review. |
| Launch sizing | Pilot one Lagos operator, up to 10 estates, 2,000 units, 100 active staff. |
| Migration | Seed data is demo-only; production starts from a validated import with reconciliation sign-off. |
| Payments | Paystack primary, Flutterwave fallback; both require event replay protection and bank reconciliation. |
| Mobile | PWA/offline first; native distribution follows once offline media and push reliability are proven. |
| AI budget | Tenant daily cap plus per-feature caps; default deny when a cap or provider policy is missing. |
