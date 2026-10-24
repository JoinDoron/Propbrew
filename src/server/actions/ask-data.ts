'use server';

import { withDurableRead } from '@/server/data/durable-records';

/**
 * AI-S-02 — natural-language search & reporting, demo engine.
 *
 * No LLM is wired yet (the PRD keeps AI behind a provider abstraction, AI-S-06),
 * so this is a deterministic intent matcher that answers a curated set of
 * questions by COMPUTING over the caller's scoped data. That preserves the two
 * properties the PRD actually cares about for this surface:
 *   • §11.4 tenant isolation — every figure comes from the scoped repos, so an
 *     answer can never cross the estate/tenant boundary the actor is confined to.
 *   • §11.4 grounding — each answer ships the underlying record links and a
 *     confidence, and unmatched questions fall back rather than hallucinate.
 * Swapping this for a real RAG call changes only this file.
 */

import { getActor } from '@/server/session';
import { can } from '@/lib/authz';
import { repos, seed } from '@/server/data';
import { listEstateWorkOrders } from '@/server/reads/estate-work-orders';
import { NOW_MS } from '@/domain/ppm';
import type { Invoice } from '@/domain/entities';
import type { CurrencyCode } from '@/domain/primitives';

export type DataAnswer = {
  matched: boolean;
  answer: string;
  metric?: string;
  detail?: string[];
  sources: { label: string; href: string }[];
  confidence: number; // 0–1
  scopeLabel: string;
};

const OPEN = (s: string) => !['closed', 'cancelled', 'rejected', 'verified'].includes(s);
const money = (minor: number, currency: CurrencyCode) => {
  const value = (minor / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'NGN' ? `₦${value}` : `${currency} ${value}`;
};
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/** A native-currency summary is only valid if billed and paid amounts agree.
 * Never choose a conversion rate or reinterpret foreign minor units as naira. */
function invoiceCurrency(invoices: readonly Invoice[]): CurrencyCode | null {
  if (invoices.some((invoice) => invoice.amount.currency !== invoice.paid.currency)) return null;
  const currencies = new Set(invoices.map((invoice) => invoice.amount.currency));
  return currencies.size > 1 ? null : currencies.values().next().value ?? 'NGN';
}

function currencyReview(base: { scopeLabel: string }): DataAnswer {
  return {
    ...base, matched: false,
    answer: 'These financial records contain mixed currencies or mismatched billed and paid currencies. I cannot combine them. Open Billing and select a currency to review its records. No FX conversion or naira substitution has been applied.',
    sources: [{ label: 'Review Billing by currency', href: '/billing' }], confidence: 0,
  };
}

export async function askData(question: string): Promise<DataAnswer> {
  return withDurableRead(async () => {
  const actor = await getActor();
  const q = question.toLowerCase().trim();
  const scopeLabel = actor.allEstates ? 'all your estates' : `your ${actor.estateIds.length} estate(s)`;

  const seesWorkOrders = can(actor, 'work_orders', 'read').allowed;
  const workOrders = seesWorkOrders ? listEstateWorkOrders(actor) : [];
  const seesInvoices = can(actor, 'charges_invoicing', 'read').allowed;
  const invoices = seesInvoices ? repos.invoices.list(actor).items : [];
  const seesSos = can(actor, 'security_sos', 'read').allowed;
  const sos = seesSos ? repos.sosEvents.list(actor).items : [];
  const vendors = repos.vendors.list(actor).items;

  const siteName = (id: string) => seed.sites.find((s) => s.id === id)?.name ?? id;
  const base = { matched: true, scopeLabel };

  if (!q) {
    return { ...base, matched: false, answer: 'Ask me something about your work orders, billing, arrears, SOS or vendors.', sources: [], confidence: 0 };
  }

  // 1 — overdue / SLA-breached work orders, grouped by estate
  if (has(q, 'overdue', 'breach', 'sla', 'late', 'behind') && has(q, 'work order', 'job', 'maintenance', 'wo', 'repair', 'request')) {
    if (!seesWorkOrders) return noAccess(base, 'work-order');
    const breached = workOrders.filter((w) => OPEN(w.status) && Date.parse(w.respondDueAt ?? '') < NOW_MS);
    const byEstate = breached.reduce<Record<string, number>>((a, w) => ((a[w.estateId] = (a[w.estateId] ?? 0) + 1), a), {});
    const ranked = Object.entries(byEstate).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    return {
      ...base,
      answer: breached.length === 0
        ? `No work orders are breaching SLA across ${scopeLabel} right now.`
        : `${breached.length} work order${breached.length > 1 ? 's are' : ' is'} breaching SLA across ${scopeLabel}${top ? `, most at ${siteName(top[0])} (${top[1]})` : ''}.`,
      metric: String(breached.length),
      detail: ranked.map(([id, n]) => `${siteName(id)}: ${n} breaching`),
      sources: [{ label: `${breached.length} work orders`, href: '/estate/work-orders' }],
      confidence: 0.93,
    };
  }

  // 2 — collection rate
  if (has(q, 'collection', 'collected', 'paid') && has(q, 'rate', '%', 'percent', 'how much', 'charge', 'service')) {
    if (!seesInvoices) return noAccess(base, 'billing');
    const currency = invoiceCurrency(invoices);
    if (!currency) return currencyReview(base);
    const billed = invoices.reduce((a, i) => a + i.amount.minor, 0);
    const collected = invoices.reduce((a, i) => a + i.paid.minor, 0);
    const rate = billed ? Math.round((collected / billed) * 100) : 0;
    return {
      ...base,
      answer: `Recorded collection rate across ${scopeLabel} is ${rate}% — ${money(collected, currency)} recorded paid of ${money(billed, currency)} billed (${currency}). No currency conversion is applied; these records are not independently verified bank settlements.`,
      metric: `${rate}%`,
      sources: [{ label: `${invoices.length} invoices`, href: '/billing' }],
      confidence: 0.95,
    };
  }

  // 3 — arrears / who owes
  if (has(q, 'arrears', 'owe', 'owed', 'outstanding', 'debt', 'defaulter', 'unpaid')) {
    if (!seesInvoices) return noAccess(base, 'billing');
    const arrears = invoices.filter((i) => ['overdue', 'in_arrears', 'escalated'].includes(i.status));
    const currency = invoiceCurrency(arrears);
    if (!currency) return currencyReview(base);
    const outstanding = arrears.reduce((a, i) => a + (i.amount.minor - i.paid.minor), 0);
    const worst = [...arrears].sort((a, b) => b.agingDays - a.agingDays)[0];
    return {
      ...base,
      answer: arrears.length === 0
        ? `No invoices are marked in arrears across ${scopeLabel}.`
        : `${arrears.length} invoice${arrears.length > 1 ? 's are' : ' is'} marked in arrears across ${scopeLabel}, ${money(outstanding, currency)} outstanding (${currency})${worst ? `. Oldest: ${worst.residentName} (${worst.agingDays}d, ${worst.status.replace(/_/g, ' ')})` : ''}. No currency conversion is applied.`,
      metric: money(outstanding, currency),
      detail: arrears.map((i) => `${i.residentName} · ${i.ref} · ${money(i.amount.minor - i.paid.minor, currency)} · ${i.agingDays}d`),
      sources: [{ label: `${arrears.length} invoices`, href: '/billing' }],
      confidence: 0.94,
    };
  }

  // 4 — open work orders
  if (has(q, 'open', 'active', 'ongoing', 'how many') && has(q, 'work order', 'job', 'maintenance', 'wo', 'repair', 'request', 'ticket')) {
    if (!seesWorkOrders) return noAccess(base, 'work-order');
    const open = workOrders.filter((w) => OPEN(w.status));
    const byStatus = open.reduce<Record<string, number>>((a, w) => ((a[w.status] = (a[w.status] ?? 0) + 1), a), {});
    return {
      ...base,
      answer: `${open.length} open work order${open.length === 1 ? '' : 's'} across ${scopeLabel}.`,
      metric: String(open.length),
      detail: Object.entries(byStatus).map(([s, n]) => `${s.replace(/_/g, ' ')}: ${n}`),
      sources: [{ label: `${open.length} work orders`, href: '/estate/work-orders' }],
      confidence: 0.95,
    };
  }

  // 5 — preventive vs reactive
  if (has(q, 'preventive', 'reactive', 'ppm', 'planned')) {
    if (!seesWorkOrders) return noAccess(base, 'work-order');
    const preventive = workOrders.filter((w) => w.origin === 'ppm_schedule').length;
    const reactive = workOrders.filter((w) => w.origin === 'resident_request').length;
    const share = Math.round((preventive / (preventive + reactive || 1)) * 100);
    return {
      ...base,
      answer: `${share}% of maintenance is preventive across ${scopeLabel} (${preventive} planned vs ${reactive} reactive).`,
      metric: `${share}%`,
      sources: [{ label: 'Work orders', href: '/estate/work-orders' }],
      confidence: 0.9,
    };
  }

  // 6 — SOS / emergencies
  if (has(q, 'sos', 'emergency', 'panic', 'alert', 'security', 'incident')) {
    if (!seesSos) return noAccess(base, 'security');
    const active = sos.filter((s) => s.status !== 'reviewed');
    const acked = sos.filter((s) => s.ackSeconds !== null);
    const avg = acked.length ? Math.round(acked.reduce((a, s) => a + (s.ackSeconds ?? 0), 0) / acked.length) : null;
    return {
      ...base,
      answer: `${active.length} recorded active SOS event${active.length === 1 ? '' : 's'} across ${scopeLabel}. ${avg === null ? 'No acknowledgement times are recorded.' : `Average recorded acknowledgement is ${avg}s across ${acked.length} incident record(s).`} These demonstration records are not verified emergency dispatch or SLA measurements. The operational acknowledgement target is under 60 seconds.`,
      metric: String(active.length),
      detail: sos.map((s) => `${s.ref} · ${s.residentName} · ${s.status}${s.ackSeconds !== null ? ` · ${s.ackSeconds}s` : ' · pending'}`),
      sources: [{ label: `${sos.length} SOS events`, href: '/security' }],
      confidence: 0.92,
    };
  }

  // 7 — vendors
  if (has(q, 'vendor', 'contractor', 'supplier')) {
    const best = [...vendors].sort((a, b) => b.slaHitRate - a.slaHitRate)[0];
    const expiring = vendors.filter((v) => v.compliance !== 'valid');
    return {
      ...base,
      answer: vendors.length === 0
        ? `No vendors are visible in ${scopeLabel}.`
        : `${vendors.length} vendors in ${scopeLabel}. Best on-time: ${best.name} (${best.slaHitRate}% SLA). ${expiring.length} have compliance issues.`,
      metric: String(vendors.length),
      detail: vendors.map((v) => `${v.name} · ${v.slaHitRate}% SLA · ${v.compliance}`),
      // The scoped records are listed above. There is no Estate vendor page;
      // do not make reviewing this answer silently switch to Facility.
      sources: [],
      confidence: 0.9,
    };
  }

  // 8 — residents / occupancy
  if (has(q, 'resident', 'occupanc', 'tenant', 'unit', 'vacant')) {
    const residents = can(actor, 'users_roles', 'read').allowed ? repos.residents.list(actor).items : [];
    const sites = repos.sites.all(actor);
    const units = sites.reduce((a, s) => a + s.unitCount, 0);
    return {
      ...base,
      answer: `${residents.length} resident${residents.length === 1 ? '' : 's'} across ${sites.length} site(s) (${units.toLocaleString()} units) in ${scopeLabel}.`,
      metric: String(residents.length),
      sources: [{ label: 'Residents', href: '/people' }, { label: 'Properties', href: '/properties' }],
      confidence: 0.88,
    };
  }

  // fallback
  return {
    ...base,
    matched: false,
    answer: 'I can’t answer that yet. Try asking about SLA breaches, collection rate, arrears, open work orders, SOS response times or vendors — all scoped to your estates.',
    sources: [],
    confidence: 0,
  };

  });
}

function noAccess(base: { scopeLabel: string }, what: string): DataAnswer {
  return {
    ...base,
    matched: true,
    answer: `Your role doesn’t have access to ${what} data, so I can’t report on it. This mirrors your §7 permissions — the assistant can never exceed them (§11.4).`,
    sources: [],
    confidence: 1,
  };
}
