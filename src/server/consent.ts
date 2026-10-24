import 'server-only';
export type ConsentPurpose = 'service_delivery' | 'marketing' | 'ai_assistance' | 'security';
export type ConsentRecord = { subjectId: string; purpose: ConsentPurpose; policyVersion: string; grantedAt: string; retentionUntil: string };
export function createConsent(subjectId: string, purpose: ConsentPurpose, policyVersion = process.env.NDPA_POLICY_VERSION ?? '2026-01'): ConsentRecord {
  if (!subjectId || !policyVersion) throw new Error('Consent subject and policy version are required.');
  const now = new Date(); const retentionDays = purpose === 'security' ? 365 : 180;
  return { subjectId, purpose, policyVersion, grantedAt: now.toISOString(), retentionUntil: new Date(now.getTime() + retentionDays * 86400000).toISOString() };
}
