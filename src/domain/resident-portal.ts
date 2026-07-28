/**
 * Resident-portal helpers (deterministic, no LLM). Small, friendly domain logic
 * for the consumer surfaces: request triage suggestions, a resident-facing
 * progress tracker, and shared formatting. Grown per page.
 */

import type { WorkOrderPriority } from './enums.proposed';

/* --- My Requests: smart raise + tracker ----------------------------------- */

export type RequestCategory = {
  key: string;
  label: string;
  icon: string; // lucide name
  priority: WorkOrderPriority;
  etaHours: number;
  match: RegExp;
};

/** Ordered most-urgent first; the first match wins. */
export const REQUEST_CATEGORIES: RequestCategory[] = [
  { key: 'security', label: 'Security', icon: 'shield', priority: 'emergency', etaHours: 1, match: /intrud|break.?in|theft|stolen|suspicious|gate|lock (broke|not)|unsafe/i },
  { key: 'electrical', label: 'Electrical', icon: 'zap', priority: 'high', etaHours: 4, match: /power|light|electric|socket|switch|spark|no light|outage|breaker|wiring/i },
  { key: 'plumbing', label: 'Plumbing', icon: 'droplet', priority: 'high', etaHours: 4, match: /leak|water|pipe|tap|toilet|flush|drain|blocked|burst|sewage|flood/i },
  { key: 'hvac', label: 'Air-con / heat', icon: 'wind', priority: 'high', etaHours: 8, match: /a\/?c\b|air.?con|cooling|heat|hvac|fan|not cold|temperature/i },
  { key: 'appliance', label: 'Appliance', icon: 'washing-machine', priority: 'routine', etaHours: 24, match: /fridge|freezer|oven|cooker|washing|dryer|microwave|dishwasher|appliance/i },
  { key: 'pest', label: 'Pest control', icon: 'bug', priority: 'routine', etaHours: 24, match: /pest|rat|mice|roach|cockroach|insect|ant|mosquito|termite/i },
  { key: 'structural', label: 'Structural', icon: 'hammer', priority: 'routine', etaHours: 48, match: /crack|wall|ceiling|door|window|floor|tile|paint|roof|leak.*roof/i },
  { key: 'cleaning', label: 'Cleaning', icon: 'sparkles', priority: 'routine', etaHours: 24, match: /clean|rubbish|refuse|waste|bin|dirty|litter|dump/i },
];

const OTHER: RequestCategory = { key: 'other', label: 'General', icon: 'wrench', priority: 'routine', etaHours: 48, match: /.*/ };

const URGENT = /urgent|emergency|asap|immediately|danger|flood|fire|no water|no power|sparking/i;

export type Triage = { category: RequestCategory; priority: WorkOrderPriority; escalated: boolean; etaHours: number };

/** Suggest a category, priority and ETA from the resident's own words. */
export function triageRequest(text: string): Triage {
  const category = REQUEST_CATEGORIES.find((c) => c.match.test(text)) ?? OTHER;
  const escalated = URGENT.test(text) && category.priority !== 'emergency';
  const priority: WorkOrderPriority = escalated ? (category.priority === 'routine' ? 'high' : 'emergency') : category.priority;
  const etaHours = priority === 'emergency' ? 1 : priority === 'high' ? Math.min(category.etaHours, 6) : category.etaHours;
  return { category, priority, escalated, etaHours };
}

/* --- resident-facing status tracker --------------------------------------- */

export const REQUEST_STEPS = ['Submitted', 'Triaged', 'Assigned', 'In progress', 'Resolved'] as const;
export type RequestStep = (typeof REQUEST_STEPS)[number];

const STATUS_STEP: Record<string, number> = {
  new: 0, triaged: 1, assigned: 2, in_progress: 3, on_hold: 3,
  resolved: 4, verified: 4, closed: 4,
  rejected: -1, cancelled: -1,
};

export function requestStepIndex(status: string): number {
  return STATUS_STEP[status] ?? 0;
}
export function isRequestClosed(status: string): boolean {
  return ['resolved', 'verified', 'closed', 'rejected', 'cancelled'].includes(status);
}
export function isRequestRateable(status: string): boolean {
  return ['resolved', 'verified', 'closed'].includes(status);
}

export function etaLabel(hours: number): string {
  if (hours <= 1) return 'within the hour';
  if (hours < 24) return `~${hours} hours`;
  return `~${Math.round(hours / 24)} day${hours >= 48 ? 's' : ''}`;
}

/* --- Marketplace: order tracking ------------------------------------------ */

export const ORDER_STEPS = ['Placed', 'Accepted', 'Fulfilled', 'Closed'] as const;

const ORDER_STEP: Record<string, number> = {
  placed: 0, accepted: 1, fulfilled: 2, closed: 3,
  declined: -1, refunded: -1, expired: -1,
};

export function orderStepIndex(status: string): number {
  return ORDER_STEP[status] ?? 0;
}
export function isOrderOpen(status: string): boolean {
  return orderStepIndex(status) >= 0 && orderStepIndex(status) < 3;
}

/* --- My Bills: categorisation + spend -------------------------------------- */

const BILL_CATS: { key: string; match: RegExp }[] = [
  { key: 'Service charge', match: /service charge|levy|dues|maintenance fee/i },
  { key: 'Water', match: /water|borehole/i },
  { key: 'Electricity', match: /electric|power|energy|diesel|generator/i },
  { key: 'Security', match: /security|guard|patrol/i },
  { key: 'Waste', match: /waste|refuse|sanitation|cleaning/i },
  { key: 'Repair', match: /repair|damage|replace|fix/i },
];

export function billCategory(description: string): string {
  return BILL_CATS.find((c) => c.match.test(description))?.key ?? 'Other';
}

export type SpendSlice = { category: string; minor: number };

/** Group PAID charges by category, largest first. */
export function spendBreakdown(paid: readonly { description: string; paidMinor: number }[]): SpendSlice[] {
  const m = new Map<string, number>();
  for (const p of paid) m.set(billCategory(p.description), (m.get(billCategory(p.description)) ?? 0) + p.paidMinor);
  return [...m.entries()].map(([category, minor]) => ({ category, minor })).sort((a, b) => b.minor - a.minor);
}
