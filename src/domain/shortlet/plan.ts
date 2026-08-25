/**
 * Short-Let PMS — packaging & team (deterministic, no LLM).
 *
 * §8 packaging: five naira tiers gated by apartment count + two premium
 * capabilities (WhatsApp @ Starter, iCal @ Growth). FR-TM team RBAC: in-app team
 * roles (owner / manager / housekeeper / accountant) with a permission matrix —
 * these are MODULE roles (data), not Reeve §7 auth roles.
 */

import type { TenantScoped } from '@/domain/tenancy';

/* --- plans (§8) ----------------------------------------------------------- */

export type PlanKey = 'lite' | 'starter' | 'growth' | 'pro' | 'enterprise';

export type Plan = { key: PlanKey; name: string; priceMonthlyMinor: number | null; apartmentCap: number; badge?: string; adds: string[] };

const BASE = ['Bookings & calendar', 'Payments & caution fees', 'Guest check-in links', 'Expenses & profit', 'Checkout inspections', 'Analytics & export'];

export const PLANS: Plan[] = [
  { key: 'lite', name: 'Lite', priceMonthlyMinor: 20_000_00, apartmentCap: 2, adds: [] },
  { key: 'starter', name: 'Starter', priceMonthlyMinor: 30_000_00, apartmentCap: 4, adds: ['WhatsApp automation'] },
  { key: 'growth', name: 'Growth', priceMonthlyMinor: 50_000_00, apartmentCap: 6, badge: 'Most popular', adds: ['iCal channel sync'] },
  { key: 'pro', name: 'Pro', priceMonthlyMinor: 85_000_00, apartmentCap: 12, adds: ['Priority support'] },
  { key: 'enterprise', name: 'Enterprise', priceMonthlyMinor: null, apartmentCap: Infinity, adds: ['Custom onboarding', 'Dedicated support'] },
];

const ORDER: PlanKey[] = ['lite', 'starter', 'growth', 'pro', 'enterprise'];
export function planIndex(key: PlanKey): number { return ORDER.indexOf(key); }
export function planFor(key: PlanKey): Plan { return PLANS.find((p) => p.key === key) ?? PLANS[0]; }

/** Cumulative entitlements up to and including this plan. */
export function entitlements(key: PlanKey): string[] {
  const idx = planIndex(key);
  return [...BASE, ...PLANS.filter((p) => planIndex(p.key) <= idx).flatMap((p) => p.adds)];
}

export const ANNUAL_DISCOUNT = 0.1; // 10% off on annual billing

/** Smallest plan that fits the portfolio + the premium features in use. */
export function recommendPlan(apartments: number, usesWhatsapp: boolean, usesIcal: boolean): { key: PlanKey; reasons: string[] } {
  const reasons: string[] = [];
  let minIdx = 0;
  if (apartments > 6) { minIdx = Math.max(minIdx, planIndex(apartments > 12 ? 'enterprise' : 'pro')); reasons.push(`${apartments} apartments`); }
  else if (apartments > 4) { minIdx = Math.max(minIdx, planIndex('growth')); reasons.push(`${apartments} apartments`); }
  else if (apartments > 2) { minIdx = Math.max(minIdx, planIndex('starter')); reasons.push(`${apartments} apartments`); }
  if (usesIcal) { minIdx = Math.max(minIdx, planIndex('growth')); reasons.push('iCal channel sync'); }
  else if (usesWhatsapp) { minIdx = Math.max(minIdx, planIndex('starter')); reasons.push('WhatsApp automation'); }
  if (reasons.length === 0) reasons.push('small portfolio');
  return { key: ORDER[minIdx], reasons };
}

/* --- team RBAC (FR-TM) ---------------------------------------------------- */

export type TeamRole = 'owner' | 'manager' | 'housekeeper' | 'accountant';
export type PermLevel = 'manage' | 'view' | 'none';

export type TeamMember = TenantScoped & { id: string; name: string; phone: string; role: TeamRole; status: 'active' | 'invited'; lastActive: string };

export const TEAM_ROLES: { key: TeamRole; label: string; blurb: string }[] = [
  { key: 'owner', label: 'Owner', blurb: 'Full access, including billing & team' },
  { key: 'manager', label: 'Manager', blurb: 'Runs operations; sees but cannot change financials' },
  { key: 'accountant', label: 'Accountant', blurb: 'Financials & analytics only' },
  { key: 'housekeeper', label: 'Housekeeper', blurb: 'Checkout inspections & the calendar only' },
];
export function roleLabel(r: TeamRole): string { return TEAM_ROLES.find((x) => x.key === r)?.label ?? r; }

export const PERM_MODULES = ['Bookings', 'Calendar', 'Inspections', 'Financials', 'Analytics', 'Guests', 'Team & plan'] as const;
export type PermModule = (typeof PERM_MODULES)[number];

/** FR-TM: exactly what each in-app role may view/manage. */
export const TEAM_PERMISSIONS: Record<TeamRole, Record<PermModule, PermLevel>> = {
  owner: { Bookings: 'manage', Calendar: 'manage', Inspections: 'manage', Financials: 'manage', Analytics: 'manage', Guests: 'manage', 'Team & plan': 'manage' },
  manager: { Bookings: 'manage', Calendar: 'manage', Inspections: 'manage', Financials: 'view', Analytics: 'manage', Guests: 'manage', 'Team & plan': 'none' },
  accountant: { Bookings: 'view', Calendar: 'view', Inspections: 'none', Financials: 'manage', Analytics: 'manage', Guests: 'none', 'Team & plan': 'none' },
  housekeeper: { Bookings: 'none', Calendar: 'view', Inspections: 'manage', Financials: 'none', Analytics: 'none', Guests: 'none', 'Team & plan': 'none' },
};
