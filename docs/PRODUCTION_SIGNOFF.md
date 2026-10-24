# Production sign-off register

These decisions are intentionally not inferred by engineering. They require the client/operator to record an owner, decision, rationale, and date before production promotion:

| Decision | Required sign-off |
|---|---|
| Tenant model and operator hierarchy | Client + COO |
| Data residency and provider region | Client + DPO |
| SOS escalation owner and 60-second backup response | Security lead |
| Gateway settlement vs bank statement source of truth | Finance lead |
| Marketplace payout and KYC policy | Finance + Legal |
| Launch size and supported estate count | Founder + Operations |
| English-only or Yoruba/Hausa/Igbo launch scope | Product + Research |
| Native iOS/Android distribution scope | Product + Engineering |
| Vendor invoicing permissions | Finance + Legal |
| Reopen/adjustment rules for terminal states | Product + Operations |
| Offline evidence-photo ordering and reconciliation | Operations |
| AI security/biometric access approval and DPIA | DPO + Security |

No deployment workflow should treat this register as approved merely because code exists. Provider credentials, settlement account ownership, and client sign-off remain controlled external inputs.
