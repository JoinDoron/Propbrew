/**
 * SC-07 / SC-10 / AI-S-06 — platform-admin analytics (deterministic, no LLM).
 *
 * Cross-tenant health, subscription/MRR modelling, AI usage & cost, and
 * security-event detection over the audit trail. Platform Admin is the only
 * reader allowed across tenants (§8.2). MRR/plan figures are demo assumptions.
 */

import type { Tone } from '@/lib/status-tones';

export const TENANT_LABEL: Record<string, string> = { 't-lekki': 'Lekki Gardens Group', 't-ikoyi': 'Ikoyi Heights Ltd' };
export function tenantLabel(id: string): string { return TENANT_LABEL[id] ?? id; }

/* --- subscription / MRR --------------------------------------------------- */

export type Plan = 'Starter' | 'Growth' | 'Enterprise';
const PER_UNIT_MRR_MINOR = 120_000; // ₦1,200/unit/mo
const BASE_MRR_MINOR = 15_000_00; // ₦15,000 platform base

export function planFor(units: number): { plan: Plan; mrrMinor: number } {
  const plan: Plan = units >= 200 ? 'Enterprise' : units >= 80 ? 'Growth' : 'Starter';
  const multiplier = plan === 'Enterprise' ? 0.9 : plan === 'Growth' ? 1 : 1.1; // volume discount
  return { plan, mrrMinor: BASE_MRR_MINOR + Math.round(units * PER_UNIT_MRR_MINOR * multiplier) };
}

/* --- tenant health -------------------------------------------------------- */

export type TenantVitals = { units: number; users: number; activeUsers: number; suspendedUsers: number; openWorkOrders: number; totalWorkOrders: number; overdueInvoices: number };
export type TenantHealth = { score: number; band: Tone; label: string };

/** Composite 0–100: adoption (active users), ops (open WO ratio), collections
 *  (overdue invoices), minus a suspended-user penalty. */
export function tenantHealth(v: TenantVitals): TenantHealth {
  const adoption = v.users ? v.activeUsers / v.users : 1;
  const opsLoad = v.totalWorkOrders ? v.openWorkOrders / v.totalWorkOrders : 0;
  const collections = v.units ? Math.min(1, v.overdueInvoices / Math.max(1, v.units * 0.2)) : 0;
  const raw = 100 * (0.45 * adoption + 0.3 * (1 - opsLoad) + 0.25 * (1 - collections)) - v.suspendedUsers * 4;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const band: Tone = score >= 80 ? 'success' : score >= 60 ? 'warn' : 'danger';
  return { score, band, label: score >= 80 ? 'Healthy' : score >= 60 ? 'Watch' : 'At risk' };
}

/* --- AI usage & cost ------------------------------------------------------ */

const COST_PER_CALL_MINOR = 8000; // ₦80/call blended

export type AiUsage = { calls: number; costMinor: number; capMinor: number; capPct: number };

export function aiUsage(totalCalls: number, capMinor = 250_000_000): AiUsage {
  const costMinor = totalCalls * COST_PER_CALL_MINOR;
  return { calls: totalCalls, costMinor, capMinor, capPct: capMinor ? Math.min(100, Math.round((costMinor / capMinor) * 100)) : 0 };
}

/* --- security events over the audit trail --------------------------------- */

const SECURITY_EVENTS = new Set(['REFUND', 'RAISE', 'ACKNOWLEDGE', 'ESCALATE', 'REJECT', 'CANCEL', 'DECLINE']);

export function isSecurityEvent(machine: string, event: string): boolean {
  return machine === 'sos-event' || SECURITY_EVENTS.has(event);
}

export function isFinancialEvent(machine: string, event: string): boolean {
  return machine === 'service-charge' || event === 'REFUND' || event === 'PAYMENT_CONFIRMED';
}
