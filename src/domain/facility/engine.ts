/**
 * Facility Intelligence — engine (deterministic, no LLM). Composite site health,
 * generator refuel prediction + fuel-efficiency anomaly detection, inventory
 * stock-out forecasting, SLA + contract-coverage analysis, and permit conflict
 * detection. Advisory outputs are labelled as such in the UI.
 */

import type { Tone } from '@/lib/status-tones';
import type {
  BuildingSystem, SystemStatus, Alarm, Generator, Part, Contract, Permit, SystemCategory,
  AccessPoint, VisitorPass, SustainabilityTarget, Incident, Sensor,
} from './types';

const DAY = 24 * 3600 * 1000;

/* --- control center: composite health ------------------------------------- */

const STATUS_WEIGHT: Record<SystemStatus, number> = { operational: 100, standby: 90, degraded: 55, down: 0 };
export const STATUS_TONE: Record<SystemStatus, Tone> = { operational: 'success', standby: 'info', degraded: 'warn', down: 'danger' };

export function siteHealth(systems: readonly BuildingSystem[]): { score: number; band: Tone; label: string } {
  if (systems.length === 0) return { score: 100, band: 'success', label: 'All clear' };
  const score = Math.round(systems.reduce((n, s) => n + STATUS_WEIGHT[s.status], 0) / systems.length);
  const band: Tone = score >= 90 ? 'success' : score >= 70 ? 'warn' : 'danger';
  return { score, band, label: score >= 90 ? 'Healthy' : score >= 70 ? 'Watch' : 'At risk' };
}

export function alarmCounts(alarms: readonly Alarm[]): { critical: number; warning: number; active: number } {
  const open = alarms.filter((a) => !a.acknowledged);
  return { critical: open.filter((a) => a.severity === 'critical').length, warning: open.filter((a) => a.severity === 'warning').length, active: open.length };
}

/* --- energy: refuel prediction + efficiency anomaly ----------------------- */

export type FuelForecast = { litresRemaining: number; hoursToEmpty: number; runsDryISO: string | null; daysToEmpty: number; band: Tone };

/** Time to dry tank at the current draw and today's runtime pace. */
export function refuelForecast(g: Generator, nowMs: number): FuelForecast {
  const litresRemaining = Math.round((g.fuelPct / 100) * g.tankLitres);
  const hoursPerDay = Math.max(1, g.runtimeHoursToday || 8);
  const litresPerDay = g.litresPerHour * hoursPerDay;
  const daysToEmpty = litresPerDay > 0 ? litresRemaining / litresPerDay : Infinity;
  const hoursToEmpty = g.litresPerHour > 0 ? Math.round(litresRemaining / g.litresPerHour) : 0;
  const runsDryISO = Number.isFinite(daysToEmpty) ? new Date(nowMs + daysToEmpty * DAY).toISOString().slice(0, 10) : null;
  const band: Tone = daysToEmpty <= 1.5 ? 'danger' : daysToEmpty <= 3 ? 'warn' : 'success';
  return { litresRemaining, hoursToEmpty, runsDryISO, daysToEmpty: Math.round(daysToEmpty * 10) / 10, band };
}

/** Percent above/below the generator's efficiency baseline — a fault signal. */
export function fuelAnomaly(g: Generator): { deltaPct: number; anomalous: boolean } {
  const deltaPct = g.baselineLph > 0 ? Math.round(((g.litresPerHour - g.baselineLph) / g.baselineLph) * 100) : 0;
  return { deltaPct, anomalous: deltaPct >= 12 };
}

const DIESEL_PER_LITRE_MINOR = 130000; // ₦1,300/L
const KWH_PER_LITRE = 3.5; // rough genset yield
const CO2_KG_PER_LITRE = 2.68;

export function dieselCost(litres: number): number { return Math.round(litres * DIESEL_PER_LITRE_MINOR); }
export function costPerKwhMinor(): number { return Math.round(DIESEL_PER_LITRE_MINOR / KWH_PER_LITRE); }
export function co2Kg(litres: number): number { return Math.round(litres * CO2_KG_PER_LITRE); }

export function gridReliancePct(generators: readonly Generator[]): { gensetPct: number; gridPct: number } {
  const genHours = generators.reduce((n, g) => n + g.runtimeHoursMonth, 0);
  const totalHours = 24 * 30 * Math.max(1, generators.length);
  const gensetPct = Math.min(100, Math.round((genHours / totalHours) * 100));
  return { gensetPct, gridPct: 100 - gensetPct };
}

/* --- inventory: stock-out prediction -------------------------------------- */

export type StockSignal = { daysToStockout: number | null; band: Tone; belowReorder: boolean };
export function stockSignal(p: Part): StockSignal {
  const perDay = p.usedPerMonth / 30;
  const daysToStockout = perDay > 0 ? Math.round(p.stock / perDay) : null;
  const belowReorder = p.stock <= p.reorderPoint;
  const band: Tone = belowReorder || (daysToStockout !== null && daysToStockout <= 7) ? 'danger' : daysToStockout !== null && daysToStockout <= 21 ? 'warn' : 'success';
  return { daysToStockout, band, belowReorder };
}
export function stockValueMinor(parts: readonly Part[]): number { return parts.reduce((n, p) => n + p.stock * p.unitCost.minor, 0); }

/* --- contracts: renewal + SLA + coverage gap ------------------------------ */

export function contractStatus(c: Pick<Contract, 'endISO'>, nowMs: number): { daysLeft: number; band: Tone; label: string } {
  const daysLeft = Math.round((Date.parse(c.endISO) - nowMs) / DAY);
  const band: Tone = daysLeft < 0 ? 'danger' : daysLeft <= 45 ? 'warn' : 'success';
  return { daysLeft, band, label: daysLeft < 0 ? 'Expired' : daysLeft <= 45 ? 'Expiring' : 'Active' };
}

const ALL_CATEGORIES: (SystemCategory | 'general')[] = ['power', 'vertical_transport', 'water', 'hvac', 'safety', 'access', 'general'];
export const CATEGORY_LABEL: Record<SystemCategory | 'general', string> = {
  power: 'Power / generators', vertical_transport: 'Lifts', water: 'Water systems', hvac: 'HVAC / cooling', safety: 'Fire & safety', access: 'Access control', general: 'General',
};

/** Which system categories have NO active contract — the coverage gap. */
export function coverageGap(contracts: readonly Contract[], nowMs: number): (SystemCategory | 'general')[] {
  const covered = new Set(contracts.filter((c) => Date.parse(c.endISO) >= nowMs).map((c) => c.coversCategory));
  return ALL_CATEGORIES.filter((c) => c !== 'general' && !covered.has(c));
}

/* --- safety: permit conflict detection ------------------------------------ */

export type PermitConflict = { a: Permit; b: Permit };

/** Two active/requested permits overlapping in time AND location — a clash. */
export function permitConflicts(permits: readonly Permit[]): PermitConflict[] {
  const live = permits.filter((p) => p.status !== 'closed');
  const out: PermitConflict[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.location !== b.location) continue;
      const start = Math.max(Date.parse(a.validFromISO), Date.parse(b.validFromISO));
      const end = Math.min(Date.parse(a.validToISO), Date.parse(b.validToISO));
      if (end > start) out.push({ a, b });
    }
  }
  return out;
}

/* --- access & visitors ---------------------------------------------------- */

export function visitorStats(passes: readonly VisitorPass[], nowMs: number): { onSite: number; expectedToday: number; deniedToday: number } {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return {
    onSite: passes.filter((p) => p.status === 'checked_in').length,
    expectedToday: passes.filter((p) => p.status === 'expected' && p.validFromISO.slice(0, 10) <= today && p.validToISO.slice(0, 10) >= today).length,
    deniedToday: passes.filter((p) => p.status === 'denied' && p.validToISO.slice(0, 10) === today).length,
  };
}

/** A visitor still on-site past their pass window — the security tail risk. */
export function isOverstay(p: Pick<VisitorPass, 'status' | 'validToISO'>, nowMs: number): boolean {
  return p.status === 'checked_in' && Date.parse(`${p.validToISO.slice(0, 10)}T23:59:59Z`) < nowMs;
}

const POINT_TONE: Record<AccessPoint['status'], Tone> = { online: 'success', offline: 'muted', held_open: 'warn', forced: 'danger' };
export function accessPointTone(p: Pick<AccessPoint, 'status' | 'mode'>): Tone {
  if (p.mode === 'lockdown') return 'danger';
  return POINT_TONE[p.status];
}

/** Points that need eyes: forced, propped open, or offline (blind spot). */
export function accessThreats(points: readonly AccessPoint[]): AccessPoint[] {
  return points.filter((p) => p.status === 'forced' || p.status === 'held_open' || p.status === 'offline');
}

/* --- sustainability & ESG ------------------------------------------------- */

/** Signed progress from baseline→target, direction-agnostic (works whether the
 *  target is a reduction or an increase). Clamped 0–100. */
export function targetProgress(t: Pick<SustainabilityTarget, 'baselineValue' | 'currentValue' | 'targetValue'>): { pct: number; band: Tone; onTrack: boolean } {
  const range = t.targetValue - t.baselineValue;
  const done = t.currentValue - t.baselineValue;
  const pct = range !== 0 ? Math.round(Math.min(100, Math.max(0, (done / range) * 100))) : 100;
  const band: Tone = pct >= 75 ? 'success' : pct >= 40 ? 'warn' : 'danger';
  return { pct, band, onTrack: pct >= 50 };
}

/** Composite ESG score: 60% energy (lower genset reliance is greener here,
 *  since genset = diesel), 40% share of targets on-track. */
export function esgScore(gensetPct: number, targets: readonly SustainabilityTarget[]): { score: number; band: Tone; label: string } {
  const energyComponent = Math.max(0, 100 - gensetPct);
  const targetComponent = targets.length ? Math.round((targets.filter((t) => targetProgress(t).onTrack).length / targets.length) * 100) : 100;
  const score = Math.round(energyComponent * 0.6 + targetComponent * 0.4);
  const band: Tone = score >= 70 ? 'success' : score >= 45 ? 'warn' : 'danger';
  return { score, band, label: score >= 70 ? 'Leading' : score >= 45 ? 'Improving' : 'Lagging' };
}

export type ReductionScenario = { id: string; title: string; detail: string; co2SavedKg: number; nairaSavedMinor: number; capexMinor: number; paybackMonths: number | null };

/** What each intervention would save, from the current diesel burn. Deterministic
 *  back-of-envelope — the numbers move with the actual monthly litres. */
export function reductionScenarios(litresPerMonth: number): ReductionScenario[] {
  const perLitreNaira = DIESEL_PER_LITRE_MINOR;
  const scenario = (id: string, title: string, detail: string, offsetPct: number, capexMinor: number): ReductionScenario => {
    const litresSaved = Math.round(litresPerMonth * offsetPct);
    const nairaSavedMinor = litresSaved * perLitreNaira;
    return { id, title, detail, co2SavedKg: Math.round(litresSaved * 12 * CO2_KG_PER_LITRE), nairaSavedMinor: nairaSavedMinor * 12, capexMinor, paybackMonths: nairaSavedMinor > 0 ? Math.max(1, Math.round(capexMinor / nairaSavedMinor)) : null };
  };
  return [
    scenario('solar', 'Solar + storage (100kWp)', 'Daytime load off the genset — offsets ~40% of runtime', 0.4, 150_000_000_00),
    scenario('service', 'Service the Block C generator', 'Fixes the +19% fuel anomaly — restores baseline efficiency', 0.08, 450_000_00),
    scenario('led', 'LED + occupancy retrofit', 'Cuts common-area load ~12%', 0.12, 9_000_000_00),
    scenario('gas', 'Convert to gas (dual-fuel)', 'Lower ₦/kWh and cleaner burn on ~25% of hours', 0.25, 40_000_000_00),
  ];
}

/* --- executive portfolio rollup ------------------------------------------- */

export type EstateVitals = {
  siteId: string; name: string; kind: string;
  healthScore: number; openWos: number; overdueWos: number; openAlarms: number;
  dieselSpendMinor: number; gensetPct: number; contractsAtRisk: number;
  arrearsMinor: number | null; // null when the viewer can't see money
};

/** Composite estate index: 55% systems health, 45% an ops-load score that
 *  penalises overdue work, open alarms and at-risk contracts. */
export function estateIndex(v: Pick<EstateVitals, 'healthScore' | 'overdueWos' | 'openAlarms' | 'contractsAtRisk'>): { score: number; band: Tone; label: string } {
  const penalties = v.overdueWos * 8 + v.openAlarms * 6 + v.contractsAtRisk * 5;
  const opsScore = Math.max(0, 100 - penalties);
  const score = Math.round(0.55 * v.healthScore + 0.45 * opsScore);
  const band: Tone = score >= 85 ? 'success' : score >= 65 ? 'warn' : 'danger';
  return { score, band, label: score >= 85 ? 'Healthy' : score >= 65 ? 'Watch' : 'At risk' };
}

export function portfolioTotals(estates: readonly EstateVitals[]): { avgIndex: number; openWos: number; overdueWos: number; openAlarms: number; dieselSpendMinor: number; arrearsMinor: number } {
  if (estates.length === 0) return { avgIndex: 100, openWos: 0, overdueWos: 0, openAlarms: 0, dieselSpendMinor: 0, arrearsMinor: 0 };
  const sum = (f: (v: EstateVitals) => number) => estates.reduce((n, v) => n + f(v), 0);
  return {
    avgIndex: Math.round(estates.reduce((n, v) => n + estateIndex(v).score, 0) / estates.length),
    openWos: sum((v) => v.openWos), overdueWos: sum((v) => v.overdueWos), openAlarms: sum((v) => v.openAlarms),
    dieselSpendMinor: sum((v) => v.dieselSpendMinor), arrearsMinor: sum((v) => v.arrearsMinor ?? 0),
  };
}

/* --- AI facility copilot -------------------------------------------------- */

export type CopilotWorld = {
  systems: readonly BuildingSystem[]; alarms: readonly Alarm[]; generators: readonly Generator[];
  parts: readonly Part[]; contracts: readonly Contract[]; permits: readonly Permit[];
  incidents: readonly Incident[]; sensors: readonly Sensor[]; nowMs: number;
};
export type InsightActionKind = 'dispatch_alarm' | 'ack_alarm' | 'reorder_part' | 'refuel_gen' | 'advance_permit' | 'none';
export type InsightAction = { kind: InsightActionKind; refId?: string; label: string };
export type Insight = { id: string; severity: 'critical' | 'warning' | 'info'; category: string; title: string; detail: string; action: InsightAction; score: number };

const SEV_SCORE = { critical: 100, warning: 60, info: 30 } as const;

/** The heart of the copilot: fuse every facility signal into one ranked,
 *  actionable list. Deterministic — the "AI" is the composition, not a model. */
export function copilotInsights(w: CopilotWorld): Insight[] {
  const out: Insight[] = [];
  const push = (i: Omit<Insight, 'score'>) => out.push({ ...i, score: SEV_SCORE[i.severity] });

  for (const a of w.alarms.filter((x) => !x.acknowledged)) {
    const sev = a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info';
    push({ id: `alarm-${a.id}`, severity: sev, category: 'Alarm', title: `${a.system}: ${a.message}`, detail: a.severity === 'critical' ? 'Unacknowledged critical alarm — dispatch a technician now.' : 'Open alarm awaiting action.', action: { kind: 'dispatch_alarm', refId: a.id, label: 'Dispatch WO' } });
  }
  for (const g of w.generators) {
    const f = refuelForecast(g, w.nowMs);
    if (f.band === 'danger') push({ id: `fuel-${g.id}`, severity: 'critical', category: 'Energy', title: `${g.name} runs dry in ~${f.daysToEmpty} day${f.daysToEmpty === 1 ? '' : 's'}`, detail: `${f.litresRemaining}L left at the current draw. Schedule a refuel before it stops.`, action: { kind: 'refuel_gen', refId: g.id, label: 'Log refuel' } });
    const an = fuelAnomaly(g);
    if (an.anomalous) push({ id: `anom-${g.id}`, severity: 'warning', category: 'Energy', title: `${g.name} burning ${an.deltaPct}% over baseline`, detail: 'Fuel efficiency has drifted — likely a fault. Book a service before it worsens.', action: { kind: 'none', label: '' } });
  }
  for (const p of w.parts.filter((x) => stockSignal(x).belowReorder)) {
    push({ id: `part-${p.id}`, severity: 'warning', category: 'Inventory', title: `${p.name} below reorder point`, detail: `${p.stock} in stock (reorder at ${p.reorderPoint}). Receive stock so repairs aren't blocked.`, action: { kind: 'reorder_part', refId: p.id, label: 'Receive stock' } });
  }
  for (const c of w.contracts) {
    const st = contractStatus(c, w.nowMs);
    if (st.daysLeft < 0) push({ id: `ct-${c.id}`, severity: 'warning', category: 'Contracts', title: `${c.service} contract has lapsed`, detail: `${c.vendorName} cover expired ${-st.daysLeft} day${-st.daysLeft === 1 ? '' : 's'} ago — you are uncovered. Renew urgently.`, action: { kind: 'none', label: '' } });
    else if (st.daysLeft <= 45) push({ id: `ct-${c.id}`, severity: 'info', category: 'Contracts', title: `${c.service} expiring in ${st.daysLeft} days`, detail: `Start the renewal with ${c.vendorName} to avoid a gap.`, action: { kind: 'none', label: '' } });
  }
  for (const clash of permitConflicts(w.permits)) {
    push({ id: `pc-${clash.a.id}-${clash.b.id}`, severity: 'warning', category: 'Safety', title: `Permit clash in ${clash.a.location}`, detail: `${clash.a.ref} and ${clash.b.ref} overlap in the same location — coordinate or reschedule.`, action: { kind: 'none', label: '' } });
  }
  for (const inc of w.incidents.filter((x) => x.status === 'open' && x.severity === 'major')) {
    push({ id: `inc-${inc.id}`, severity: 'warning', category: 'Safety', title: `Open major incident: ${inc.category}`, detail: `${inc.location} — needs investigation and closure.`, action: { kind: 'none', label: '' } });
  }
  const gaps = coverageGap(w.contracts, w.nowMs);
  if (gaps.length) push({ id: 'coverage', severity: 'info', category: 'Contracts', title: `${gaps.length} system categor${gaps.length === 1 ? 'y has' : 'ies have'} no active cover`, detail: `No live contract for: ${gaps.map((g) => CATEGORY_LABEL[g]).join(', ')}.`, action: { kind: 'none', label: '' } });

  return out.sort((a, b) => b.score - a.score);
}

export type CopilotAnswer = { answer: string; sources: string[] };

/** Deterministic natural-language Q&A over the same world. Keyword-routed — no
 *  model call — so it is fast, free, and testable. */
export function askCopilot(question: string, w: CopilotWorld): CopilotAnswer {
  const q = question.toLowerCase();
  const insights = copilotInsights(w);
  const has = (...k: string[]) => k.some((x) => q.includes(x));

  if (has('fuel', 'diesel', 'generator', 'genset', 'refuel')) {
    const lines = w.generators.map((g) => { const f = refuelForecast(g, w.nowMs); const an = fuelAnomaly(g); return `${g.name}: ${g.fuelPct}% (${f.litresRemaining}L), runs dry in ~${f.daysToEmpty}d${an.anomalous ? `, burning ${an.deltaPct}% over baseline` : ''}.`; });
    return { answer: `Across ${w.generators.length} generators — ${lines.join(' ')}`, sources: w.generators.map((g) => g.name) };
  }
  if (has('alarm', 'wrong', 'issue', 'problem', 'attention', 'now', 'priority')) {
    const top = insights.slice(0, 3);
    return { answer: top.length ? `Top priorities right now: ${top.map((i, n) => `${n + 1}) ${i.title}`).join('; ')}.` : 'Nothing needs attention — all systems nominal.', sources: top.map((i) => i.category) };
  }
  if (has('contract', 'renew', 'expire', 'sla', 'cover')) {
    const exp = w.contracts.map((c) => ({ c, st: contractStatus(c, w.nowMs) })).filter((x) => x.st.daysLeft <= 45).sort((a, b) => a.st.daysLeft - b.st.daysLeft);
    return { answer: exp.length ? `${exp.length} contract(s) need attention: ${exp.map((x) => `${x.c.service} (${x.st.daysLeft < 0 ? `${-x.st.daysLeft}d overdue` : `${x.st.daysLeft}d left`})`).join(', ')}.` : 'All contracts are comfortably in date.', sources: exp.map((x) => x.c.vendorName) };
  }
  if (has('stock', 'part', 'inventory', 'spare', 'reorder')) {
    const low = w.parts.filter((p) => stockSignal(p).belowReorder);
    return { answer: low.length ? `${low.length} part(s) below reorder: ${low.map((p) => `${p.name} (${p.stock}/${p.reorderPoint})`).join(', ')}.` : 'Every spare is above its reorder point.', sources: low.map((p) => p.sku) };
  }
  if (has('permit', 'safety', 'incident', 'clash')) {
    const clashes = permitConflicts(w.permits);
    const open = w.incidents.filter((i) => i.status === 'open');
    return { answer: `${clashes.length} permit clash(es) and ${open.length} open incident(s).${clashes.length ? ` Clash: ${clashes[0].a.ref} vs ${clashes[0].b.ref} in ${clashes[0].a.location}.` : ''}`, sources: ['Permits', 'Incidents'] };
  }
  if (has('cost', 'spend', 'money', 'naira', 'carbon', 'co2', 'emission')) {
    const litres = w.generators.reduce((n, g) => n + Math.round(g.runtimeHoursMonth * g.litresPerHour), 0);
    return { answer: `Genset burn is ~${litres.toLocaleString()}L/month → about ₦${(dieselCost(litres) / 100).toLocaleString('en-NG')} in diesel and ~${co2Kg(litres).toLocaleString()}kg CO₂. Cutting genset reliance is the biggest lever.`, sources: ['Generators', 'Meters'] };
  }
  const top = insights[0];
  return { answer: top ? `The single most important thing: ${top.title}. ${top.detail}` : 'Everything looks healthy right now.', sources: top ? [top.category] : [] };
}
