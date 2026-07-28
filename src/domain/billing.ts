/**
 * Billing intelligence (EM-01 / AI-E-03). Pure, deterministic — computed over
 * already-scoped invoices, no LLM. AI-E-03's hard rule: suggestions and
 * defaulter-risk scores only; NEVER an automated penalty. NOW is pinned.
 */

import type { Invoice } from './entities';

const UNPAID = ['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated'];
const ARREARS = ['overdue', 'in_arrears', 'escalated'];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export type RiskBand = 'high' | 'watch' | 'ok';
export const BAND_TONE: Record<RiskBand, 'danger' | 'warn' | 'success'> = { high: 'danger', watch: 'warn', ok: 'success' };

export type DefaulterRisk = {
  ownerUserId: string;
  residentName: string;
  unitId: string;
  outstandingMinor: number;
  billedMinor: number;
  worstAging: number;
  invoiceCount: number;
  unpaidCount: number;
  score: number; // 0–100
  band: RiskBand;
  payProbability: number; // 0–1 expected settlement of what they owe
  drivers: { label: string; value: string }[];
};

const owed = (i: Invoice) => i.amount.minor - i.paid.minor;
const statusPenalty = (statuses: string[]) =>
  statuses.includes('escalated') ? 1 : statuses.includes('in_arrears') ? 0.65 : statuses.includes('overdue') ? 0.4 : statuses.includes('partially_paid') ? 0.15 : 0;

/** Defaulter-risk per resident (AI-E-03). Ranked high→low. */
export function assessDefaulters(invoices: readonly Invoice[]): DefaulterRisk[] {
  const byOwner = new Map<string, Invoice[]>();
  for (const i of invoices) {
    if (i.status === 'draft' || i.status === 'paid') continue; // no live exposure
    const k = String(i.ownerUserId);
    (byOwner.get(k) ?? byOwner.set(k, []).get(k)!).push(i);
  }

  const out: DefaulterRisk[] = [];
  for (const [ownerUserId, list] of byOwner) {
    const unpaid = list.filter((i) => UNPAID.includes(i.status));
    if (unpaid.length === 0) continue;
    const outstanding = unpaid.reduce((a, i) => a + owed(i), 0);
    const billed = list.reduce((a, i) => a + i.amount.minor, 0);
    const worstAging = Math.max(0, ...unpaid.map((i) => i.agingDays));
    const statuses = unpaid.map((i) => i.status);

    const agingStress = clamp01(worstAging / 90);
    const sPenalty = statusPenalty(statuses);
    const balanceStress = clamp01(outstanding / (billed || 1));
    const countStress = clamp01(unpaid.length / 3);

    const score = Math.round(100 * clamp01(0.38 * agingStress + 0.32 * sPenalty + 0.2 * balanceStress + 0.1 * countStress));
    const band: RiskBand = score >= 70 ? 'high' : score >= 45 ? 'watch' : 'ok';
    const payProbability = band === 'high' ? 0.35 : band === 'watch' ? 0.65 : 0.9;

    const drivers = [
      { label: 'Oldest arrears', value: worstAging > 0 ? `${worstAging}d overdue` : 'current' },
      { label: 'Worst status', value: (statuses.sort((a, b) => statusPenalty([b]) - statusPenalty([a]))[0] ?? 'issued').replace(/_/g, ' ') },
      { label: 'Outstanding', value: `${Math.round((balanceStress) * 100)}% of billed` },
      { label: 'Open invoices', value: String(unpaid.length) },
    ];

    out.push({ ownerUserId, residentName: list[0].residentName, unitId: String(list[0].unitId), outstandingMinor: outstanding, billedMinor: billed, worstAging, invoiceCount: list.length, unpaidCount: unpaid.length, score, band, payProbability, drivers });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Collections forecast for the cycle — expected inflow weighted by defaulter risk. */
export function collectionsForecast(invoices: readonly Invoice[]): {
  billedMinor: number; collectedMinor: number; outstandingMinor: number; rate: number;
  projectedMinor: number; projectedRate: number; atRiskMinor: number;
} {
  const live = invoices.filter((i) => i.status !== 'draft');
  const billed = live.reduce((a, i) => a + i.amount.minor, 0);
  const collected = live.reduce((a, i) => a + i.paid.minor, 0);
  const outstanding = billed - collected;

  const probByOwner = new Map(assessDefaulters(invoices).map((d) => [d.ownerUserId, d.payProbability]));
  let expected = 0;
  let atRisk = 0;
  for (const i of live) {
    const rem = owed(i);
    if (rem <= 0) continue;
    const p = probByOwner.get(String(i.ownerUserId)) ?? 0.8;
    expected += rem * p;
    atRisk += rem * (1 - p);
  }
  const projected = collected + expected;
  return {
    billedMinor: billed, collectedMinor: collected, outstandingMinor: outstanding,
    rate: billed ? Math.round((collected / billed) * 100) : 0,
    projectedMinor: Math.round(projected), projectedRate: billed ? Math.round((projected / billed) * 100) : 0,
    atRiskMinor: Math.round(atRisk),
  };
}

export type AgingBucket = { key: string; label: string; minor: number; count: number; tone: 'success' | 'info' | 'warn' | 'danger' | 'muted' };

/** Arrears aging waterfall over the outstanding balance. */
export function agingBuckets(invoices: readonly Invoice[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: 'current', label: 'Not yet due', minor: 0, count: 0, tone: 'success' },
    { key: 'b30', label: '1–30 days', minor: 0, count: 0, tone: 'info' },
    { key: 'b60', label: '31–60 days', minor: 0, count: 0, tone: 'warn' },
    { key: 'b90', label: '61–90 days', minor: 0, count: 0, tone: 'danger' },
    { key: 'b90p', label: '90+ days', minor: 0, count: 0, tone: 'danger' },
  ];
  for (const i of invoices) {
    if (!UNPAID.includes(i.status)) continue;
    const rem = owed(i);
    if (rem <= 0) continue;
    const d = i.agingDays;
    const b = d <= 0 ? buckets[0] : d <= 30 ? buckets[1] : d <= 60 ? buckets[2] : d <= 90 ? buckets[3] : buckets[4];
    b.minor += rem;
    b.count += 1;
  }
  return buckets;
}

export function isArrears(status: string): boolean {
  return ARREARS.includes(status);
}
