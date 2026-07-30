/**
 * Construction engine (deterministic, no ML). The commercial + predictive heart:
 * Earned-Value Management (PV/EV/AC → CPI/SPI/EAC/ETC/VAC/TCPI), critical-path
 * scheduling (CPM forward/backward pass), procurement bid scoring + award
 * recommendation, budget-exception detection, inventory stock signals + leakage,
 * and a cross-project risk radar. Every "AI/forecast" output is advisory, carries
 * evidence + confidence, and is labelled as such in the UI.
 */

import type { Tone } from '@/lib/status-tones';
import type {
  Project, Phase, Task, CostCode, Quote, PurchaseOrder, PurchaseRequest, Material, StockItem,
  StockMovement, Milestone, Issue, DailyReport, RFI, Worker, Vendor, Attendance,
} from './types';

const DAY = 24 * 3600 * 1000;
const minor = (m: { minor: number }) => m.minor;

/* --- Earned Value Management ---------------------------------------------- */

export type EVM = {
  bac: number; pv: number; ev: number; ac: number;
  cv: number; sv: number; cpi: number; spi: number;
  eac: number; etc: number; vac: number; tcpi: number;
  costBand: Tone; scheduleBand: Tone;
};

/** Project-level earned value. BAC = approved budget; PV/EV scale it by planned
 *  and actual %; AC is the summed actual cost. Classic PMI formulas. */
export function projectEVM(p: Pick<Project, 'approvedBudget' | 'plannedPercent' | 'percentComplete'>, actualMinor: number): EVM {
  const bac = minor(p.approvedBudget);
  const pv = Math.round(bac * p.plannedPercent / 100);
  const ev = Math.round(bac * p.percentComplete / 100);
  const ac = Math.max(0, actualMinor);
  const cpi = ac > 0 ? ev / ac : 1;
  const spi = pv > 0 ? ev / pv : 1;
  const eac = cpi > 0 ? Math.round(bac / cpi) : bac;
  const etc = Math.max(0, eac - ac);
  const vac = bac - eac;
  const tcpi = (bac - ac) !== 0 ? (bac - ev) / (bac - ac) : 1;
  return {
    bac, pv, ev, ac, cv: ev - ac, sv: ev - pv, cpi: round2(cpi), spi: round2(spi),
    eac, etc, vac, tcpi: round2(tcpi),
    costBand: perfBand(cpi), scheduleBand: perfBand(spi),
  };
}

/** Roll several cost codes into one EVM using each code's own budget/earned/actual. */
export function costCodesEVM(codes: readonly CostCode[]): EVM {
  const bac = codes.reduce((n, c) => n + minor(c.budget), 0);
  const pv = codes.reduce((n, c) => n + Math.round(minor(c.budget) * c.plannedPercent / 100), 0);
  const ev = codes.reduce((n, c) => n + Math.round(minor(c.budget) * c.earnedPercent / 100), 0);
  const ac = codes.reduce((n, c) => n + minor(c.actual), 0);
  const cpi = ac > 0 ? ev / ac : 1;
  const spi = pv > 0 ? ev / pv : 1;
  const eac = cpi > 0 ? Math.round(bac / cpi) : bac;
  return { bac, pv, ev, ac, cv: ev - ac, sv: ev - pv, cpi: round2(cpi), spi: round2(spi), eac, etc: Math.max(0, eac - ac), vac: bac - eac, tcpi: round2((bac - ac) !== 0 ? (bac - ev) / (bac - ac) : 1), costBand: perfBand(cpi), scheduleBand: perfBand(spi) };
}

/** Performance-index band: ≥1 good, ≥0.9 watch, else at-risk. */
export function perfBand(index: number): Tone {
  return index >= 1 ? 'success' : index >= 0.9 ? 'warn' : 'danger';
}

export function committedMinor(codes: readonly CostCode[]): number { return codes.reduce((n, c) => n + minor(c.committed), 0); }

/* --- S-curve (planned vs actual cumulative spend) ------------------------- */

export type CurvePoint = { label: string; plannedPct: number; actualPct: number };
/** A smooth cumulative-progress S-curve to `nowPct`, with planned running slightly
 *  ahead — deterministic (logistic shape), for the cash-flow / progress chart. */
export function sCurve(plannedPct: number, actualPct: number, points = 10): CurvePoint[] {
  const logistic = (t: number) => 1 / (1 + Math.exp(-8 * (t - 0.5)));
  const base = logistic(1) - logistic(0);
  const out: CurvePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const s = (logistic(t) - logistic(0)) / base; // 0..1
    out.push({ label: `M${i}`, plannedPct: Math.round(s * plannedPct), actualPct: t <= (actualPct / 100) + 0.0001 ? Math.round(s * actualPct * (plannedPct ? 1 : 1)) : Math.round(s * actualPct) });
  }
  return out;
}

/* --- schedule health ------------------------------------------------------ */

export function scheduleVariancePct(p: Pick<Project, 'plannedPercent' | 'percentComplete'>): number {
  return p.percentComplete - p.plannedPercent;
}

/** Forecast finish from SPI: the slower you earn, the later you finish. */
export function forecastFinishISO(p: Pick<Project, 'startISO' | 'plannedFinishISO'>, spi: number): { iso: string; slipDays: number } {
  const start = Date.parse(p.startISO), planned = Date.parse(p.plannedFinishISO);
  const dur = Math.max(1, planned - start);
  const forecastDur = spi > 0 ? dur / spi : dur * 2;
  const iso = new Date(start + forecastDur).toISOString().slice(0, 10);
  return { iso, slipDays: Math.round((start + forecastDur - planned) / DAY) };
}

export function projectHealth(spi: number, cpi: number, openCritical: number): { score: number; band: Tone; label: string } {
  const sched = Math.min(100, Math.round(spi * 100));
  const cost = Math.min(100, Math.round(cpi * 100));
  const score = Math.max(0, Math.round(0.45 * sched + 0.45 * cost - openCritical * 5));
  const band: Tone = score >= 90 ? 'success' : score >= 75 ? 'warn' : 'danger';
  return { score, band, label: score >= 90 ? 'On track' : score >= 75 ? 'Watch' : 'At risk' };
}

/* --- critical path (CPM) -------------------------------------------------- */

export type CpmTask = { id: string; durationDays: number; dependsOn: readonly string[] };
export type CpmResult = { es: Map<string, number>; ef: Map<string, number>; ls: Map<string, number>; lf: Map<string, number>; slack: Map<string, number>; critical: Set<string>; durationDays: number };

/** Forward+backward pass over a finish-to-start DAG → earliest/latest times and
 *  the zero-slack critical path. Task durations in days. */
export function criticalPath(tasks: readonly CpmTask[]): CpmResult {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const es = new Map<string, number>(), ef = new Map<string, number>();
  const efOf = (id: string): number => {
    if (ef.has(id)) return ef.get(id)!;
    const t = byId.get(id)!;
    const start = t.dependsOn.length ? Math.max(...t.dependsOn.filter((d) => byId.has(d)).map((d) => efOf(d))) : 0;
    es.set(id, start); const finish = start + t.durationDays; ef.set(id, finish); return finish;
  };
  for (const t of tasks) efOf(t.id);
  const projectEnd = Math.max(0, ...[...ef.values()]);
  const dependents = new Map<string, string[]>();
  for (const t of tasks) for (const d of t.dependsOn) if (byId.has(d)) dependents.set(d, [...(dependents.get(d) ?? []), t.id]);
  const lf = new Map<string, number>(), ls = new Map<string, number>();
  const lfOf = (id: string): number => {
    if (lf.has(id)) return lf.get(id)!;
    const deps = dependents.get(id) ?? [];
    const finish = deps.length ? Math.min(...deps.map((d) => lsOf(d))) : projectEnd;
    lf.set(id, finish); ls.set(id, finish - byId.get(id)!.durationDays); return finish;
  };
  const lsOf = (id: string): number => { lfOf(id); return ls.get(id)!; };
  for (const t of tasks) lfOf(t.id);
  const slack = new Map<string, number>(), critical = new Set<string>();
  for (const t of tasks) { const s = (ls.get(t.id) ?? 0) - (es.get(t.id) ?? 0); slack.set(t.id, s); if (s <= 0) critical.add(t.id); }
  return { es, ef, ls, lf, slack, critical, durationDays: projectEnd };
}

export function taskDurationDays(t: Pick<Task, 'plannedStartISO' | 'plannedFinishISO'>): number {
  return Math.max(1, Math.round((Date.parse(t.plannedFinishISO) - Date.parse(t.plannedStartISO)) / DAY));
}

/* --- procurement: bid scoring + award ------------------------------------- */

export type ScoredQuote = { quote: Quote; score: number; priceScore: number; leadScore: number; warrantyScore: number; complianceScore: number; recommended: boolean };

/** Score quotes 0–100 (price 45%, lead 20%, warranty 15%, compliance 20%) and
 *  recommend the highest — a transparent award recommendation, not a black box. */
export function scoreQuotes(quotes: readonly Quote[]): ScoredQuote[] {
  if (quotes.length === 0) return [];
  const prices = quotes.map((q) => minor(q.price)), leads = quotes.map((q) => q.leadDays), warr = quotes.map((q) => q.warrantyMonths);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const minL = Math.min(...leads), maxL = Math.max(...leads);
  const maxW = Math.max(...warr, 1);
  const norm = (v: number, lo: number, hi: number, invert = false) => hi === lo ? 100 : Math.round(((invert ? hi - v : v - lo) / (hi - lo)) * 100);
  const scored = quotes.map((q) => {
    const priceScore = norm(minor(q.price), minP, maxP, true);
    const leadScore = norm(q.leadDays, minL, maxL, true);
    const warrantyScore = Math.round((q.warrantyMonths / maxW) * 100);
    const complianceScore = q.compliancePct;
    const score = Math.round(0.45 * priceScore + 0.2 * leadScore + 0.15 * warrantyScore + 0.2 * complianceScore);
    return { quote: q, score, priceScore, leadScore, warrantyScore, complianceScore, recommended: false };
  });
  const best = Math.max(...scored.map((s) => s.score));
  for (const s of scored) if (s.score === best) { s.recommended = true; break; }
  return scored.sort((a, b) => b.score - a.score);
}

/** Would this request breach the remaining budget on its cost code? */
export function budgetException(req: Pick<PurchaseRequest, 'estimate' | 'costCode'>, codes: readonly CostCode[]): { exception: boolean; remainingMinor: number } {
  const cc = codes.find((c) => c.code === req.costCode);
  if (!cc) return { exception: false, remainingMinor: 0 };
  const remaining = minor(cc.budget) - minor(cc.committed);
  return { exception: minor(req.estimate) > remaining, remainingMinor: remaining };
}

/** Cash needed to clear open (issued/acknowledged/part-delivered) POs. */
export function cashRequirementMinor(pos: readonly PurchaseOrder[]): number {
  const OPEN: PurchaseOrder['status'][] = ['issued', 'acknowledged', 'part_delivered', 'approved'];
  return pos.filter((p) => OPEN.includes(p.status)).reduce((n, p) => n + Math.round(minor(p.value) * (1 - p.deliveredQty / Math.max(1, p.qty))), 0);
}

/* --- inventory: signals + leakage ----------------------------------------- */

export function stockPosition(item: Pick<StockItem, 'onHand' | 'reserved' | 'inTransit'>): { available: number } {
  return { available: item.onHand - item.reserved };
}

export function stockSignal(material: Pick<Material, 'reorderLevel'>, onHand: number, monthlyConsumption: number): { belowReorder: boolean; daysCover: number | null; band: Tone } {
  const perDay = monthlyConsumption / 30;
  const daysCover = perDay > 0 ? Math.round(onHand / perDay) : null;
  const belowReorder = onHand <= material.reorderLevel;
  const band: Tone = belowReorder || (daysCover !== null && daysCover <= 7) ? 'danger' : daysCover !== null && daysCover <= 21 ? 'warn' : 'success';
  return { belowReorder, daysCover, band };
}

/** Leakage = received − issued − on-hand (what can't be accounted for), and an
 *  anomaly flag when issues run well above the received baseline. */
export function materialLeakage(materialId: string, movements: readonly StockMovement[], onHand: number): { receivedQty: number; issuedQty: number; leakageQty: number; leakagePct: number; anomalous: boolean } {
  const ms = movements.filter((m) => m.materialId === materialId);
  const receivedQty = ms.filter((m) => m.kind === 'receipt').reduce((n, m) => n + m.qty, 0);
  const issuedQty = ms.filter((m) => m.kind === 'issue').reduce((n, m) => n + m.qty, 0);
  const returnedQty = ms.filter((m) => m.kind === 'return').reduce((n, m) => n + m.qty, 0);
  const leakageQty = Math.max(0, receivedQty + returnedQty - issuedQty - onHand);
  const leakagePct = receivedQty > 0 ? Math.round((leakageQty / receivedQty) * 100) : 0;
  return { receivedQty, issuedQty, leakageQty, leakagePct, anomalous: leakagePct >= 5 };
}

/* --- risk radar ----------------------------------------------------------- */

export type RiskKind = 'schedule_slip' | 'cost_overrun' | 'procurement_late' | 'low_stock' | 'missing_report' | 'overdue_rfi' | 'cert_expiry' | 'open_critical_issue' | 'material_leakage';
export type RiskSignal = { id: string; kind: RiskKind; projectId: string; projectName: string; severity: Tone; confidence: number; title: string; evidence: string; recommendation: string; nairaAtRiskMinor: number; href: string };

export const RISK_LABEL: Record<RiskKind, string> = {
  schedule_slip: 'Schedule slip', cost_overrun: 'Cost overrun', procurement_late: 'Late procurement',
  low_stock: 'Low stock', missing_report: 'Missing site report', overdue_rfi: 'Overdue RFI',
  cert_expiry: 'Certificate expiry', open_critical_issue: 'Critical issue open', material_leakage: 'Material leakage',
};

/** Rank a risk by how much it should worry you (severity weight × confidence). */
export function riskWeight(r: Pick<RiskSignal, 'severity' | 'confidence'>): number {
  const sev = r.severity === 'danger' ? 3 : r.severity === 'warn' ? 2 : 1;
  return sev * r.confidence;
}
export function rankRisks(risks: readonly RiskSignal[]): RiskSignal[] {
  return [...risks].sort((a, b) => riskWeight(b) - riskWeight(a));
}

/* --- aging helpers (RFIs, milestones, reports) ---------------------------- */

export function daysUntil(iso: string, nowMs: number): number { return Math.round((Date.parse(iso) - nowMs) / DAY); }
export function isOverdue(iso: string, nowMs: number): boolean { return Date.parse(iso) < nowMs; }

export function certBand(w: Pick<Worker, 'certExpiryISO'>, nowMs: number): { days: number | null; band: Tone } {
  if (!w.certExpiryISO) return { days: null, band: 'muted' };
  const days = daysUntil(w.certExpiryISO, nowMs);
  return { days, band: days < 0 ? 'danger' : days <= 30 ? 'warn' : 'success' };
}

export function rfiState(r: Pick<RFI, 'status' | 'dueISO'>, nowMs: number): { band: Tone; label: string } {
  if (r.status === 'closed') return { band: 'muted', label: 'Closed' };
  if (r.status === 'answered') return { band: 'success', label: 'Answered' };
  return isOverdue(r.dueISO, nowMs) ? { band: 'danger', label: 'Overdue' } : { band: 'progress', label: 'Open' };
}

export function vendorBand(v: Pick<Vendor, 'suspended' | 'onTimePct' | 'complianceExpiryISO'>, nowMs: number): Tone {
  if (v.suspended) return 'danger';
  if (v.complianceExpiryISO && isOverdue(v.complianceExpiryISO, nowMs)) return 'danger';
  return v.onTimePct >= 90 ? 'success' : v.onTimePct >= 75 ? 'warn' : 'danger';
}

/* --- misc helpers --------------------------------------------------------- */

function round2(n: number): number { return Math.round(n * 100) / 100; }

export function milestoneBand(m: Pick<Milestone, 'status' | 'dueISO'>, nowMs: number): Tone {
  if (m.status === 'accepted') return 'success';
  if (m.status === 'missed') return 'danger';
  return isOverdue(m.dueISO, nowMs) ? 'danger' : daysUntil(m.dueISO, nowMs) <= 14 ? 'warn' : 'info';
}

export function issueBand(i: Pick<Issue, 'severity' | 'status'>): Tone {
  if (i.status === 'resolved') return 'muted';
  return i.severity === 'critical' || i.severity === 'high' ? 'danger' : i.severity === 'medium' ? 'warn' : 'info';
}

export function reportBand(status: DailyReport['status']): Tone {
  return status === 'approved' ? 'success' : status === 'returned' ? 'danger' : status === 'submitted' || status === 'reviewed' ? 'progress' : 'muted';
}

/* --- the world (for cross-entity scans) ----------------------------------- */

export type ConWorld = {
  projects: readonly Project[]; phases: readonly Phase[]; tasks: readonly Task[]; costCodes: readonly CostCode[];
  pos: readonly PurchaseOrder[]; requests: readonly PurchaseRequest[]; reports: readonly DailyReport[];
  materials: readonly Material[]; stock: readonly StockItem[]; movements: readonly StockMovement[];
  rfis: readonly RFI[]; workers: readonly Worker[]; issues: readonly Issue[];
  milestones: readonly Milestone[]; attendance: readonly Attendance[];
};

/** Actual cost booked against a project (its cost codes' actuals). */
export function projectActualMinor(projectId: string, codes: readonly CostCode[]): number {
  return codes.filter((c) => c.projectId === projectId).reduce((n, c) => n + minor(c.actual), 0);
}
export function projectCommittedMinor(projectId: string, codes: readonly CostCode[]): number {
  return codes.filter((c) => c.projectId === projectId).reduce((n, c) => n + minor(c.committed), 0);
}
export function projectEVMOf(p: Project, codes: readonly CostCode[]): EVM {
  return projectEVM(p, projectActualMinor(p.id, codes));
}

/* --- risk radar: five deterministic detectors scanning the world ---------- */

const ACTIVE: Project['status'][] = ['active', 'closing'];

export function scanRisks(w: ConWorld, nowMs: number): RiskSignal[] {
  const out: RiskSignal[] = [];
  const nameOf = (id: string) => w.projects.find((p) => p.id === id)?.name ?? id;
  const stockOf = (materialId: string) => w.stock.filter((s) => s.materialId === materialId).reduce((n, s) => n + s.onHand, 0);

  for (const p of w.projects) {
    const evm = projectEVMOf(p, w.costCodes);
    const dailyBurn = Math.round(evm.bac / Math.max(1, (Date.parse(p.plannedFinishISO) - Date.parse(p.startISO)) / DAY));
    // 1. schedule slip
    if (evm.spi < 0.92 && ACTIVE.includes(p.status)) {
      const ff = forecastFinishISO(p, evm.spi);
      out.push({ id: `rs-slip-${p.id}`, kind: 'schedule_slip', projectId: p.id, projectName: p.name, severity: evm.spi < 0.85 ? 'danger' : 'warn', confidence: clamp01(0.6 + (0.92 - evm.spi) * 2), title: `${p.name} is behind schedule (SPI ${evm.spi})`, evidence: `Earned ${p.percentComplete}% vs planned ${p.plannedPercent}% → forecast finish ${ff.iso} (${ff.slipDays > 0 ? '+' : ''}${ff.slipDays}d)`, recommendation: 'Review critical path; consider crashing the pour sequence.', nairaAtRiskMinor: Math.max(0, ff.slipDays) * Math.round(dailyBurn * 0.15), href: '/construction/schedule' });
    }
    // 2. cost overrun
    if (evm.vac < 0 && ACTIVE.includes(p.status)) {
      out.push({ id: `rs-cost-${p.id}`, kind: 'cost_overrun', projectId: p.id, projectName: p.name, severity: evm.cpi < 0.9 ? 'danger' : 'warn', confidence: clamp01(0.65 + (1 - evm.cpi)), title: `${p.name} forecast to overrun (CPI ${evm.cpi})`, evidence: `EAC ₦${fmtM(evm.eac)} vs budget ₦${fmtM(evm.bac)} → VAC −₦${fmtM(-evm.vac)}`, recommendation: 'QS to review committed costs; raise a budget variation if scope-driven.', nairaAtRiskMinor: -evm.vac, href: '/construction/evm' });
    }
    // 5. missing site report (active projects)
    if (ACTIVE.includes(p.status)) {
      const lastApproved = w.reports.filter((r) => r.projectId === p.id && r.status === 'approved').map((r) => Date.parse(r.dateISO)).sort((a, b) => b - a)[0];
      const daysSince = lastApproved ? Math.round((nowMs - lastApproved) / DAY) : 99;
      if (daysSince >= 2) out.push({ id: `rs-report-${p.id}`, kind: 'missing_report', projectId: p.id, projectName: p.name, severity: daysSince >= 4 ? 'danger' : 'warn', confidence: 0.9, title: `${p.name} — no approved site report in ${daysSince} days`, evidence: `Last approved daily report was ${daysSince} days ago.`, recommendation: 'Chase the site engineer to submit; review pending reports.', nairaAtRiskMinor: 0, href: '/construction/site' });
    }
  }
  // 3. late procurement (open POs past their promised date)
  const OPEN: PurchaseOrder['status'][] = ['issued', 'acknowledged', 'part_delivered', 'approved'];
  for (const po of w.pos) {
    if (OPEN.includes(po.status) && isOverdue(po.expectedISO, nowMs) && po.deliveredQty < po.qty) {
      const outstanding = Math.round(minor(po.value) * (1 - po.deliveredQty / Math.max(1, po.qty)));
      out.push({ id: `rs-po-${po.id}`, kind: 'procurement_late', projectId: po.projectId, projectName: nameOf(po.projectId), severity: 'danger', confidence: 0.95, title: `${po.ref} late — ${po.item}`, evidence: `Promised ${po.expectedISO}, ${po.deliveredQty}/${po.qty} ${po.unit} delivered (${daysUntil(po.expectedISO, nowMs) * -1}d overdue).`, recommendation: 'Expedite with vendor; source a backup supplier for the balance.', nairaAtRiskMinor: outstanding, href: '/construction/procurement' });
    }
  }
  // 4. low stock
  for (const m of w.materials) {
    const onHand = stockOf(m.id);
    if (onHand <= m.reorderLevel) {
      out.push({ id: `rs-stock-${m.id}`, kind: 'low_stock', projectId: w.stock.find((s) => s.materialId === m.id)?.warehouseId.includes('marina') ? 'cp-marina' : 'cp-cedar', projectName: m.name, severity: onHand <= m.reorderLevel * 0.5 ? 'danger' : 'warn', confidence: 0.85, title: `${m.name} below reorder (${onHand} ${m.unit})`, evidence: `On-hand ${onHand} ${m.unit} ≤ reorder level ${m.reorderLevel}.`, recommendation: 'Raise a purchase request now to avoid a stockout on the pour.', nairaAtRiskMinor: Math.max(0, m.reorderLevel - onHand) * minor(m.unitCost), href: '/construction/materials' });
    }
    // 9. material leakage
    const leak = materialLeakage(m.id, w.movements, stockOf(m.id));
    if (leak.anomalous) out.push({ id: `rs-leak-${m.id}`, kind: 'material_leakage', projectId: 'cp-marina', projectName: m.name, severity: leak.leakagePct >= 12 ? 'danger' : 'warn', confidence: clamp01(0.5 + leak.leakagePct / 40), title: `${m.name} — ${leak.leakagePct}% unaccounted`, evidence: `Received ${leak.receivedQty}, issued ${leak.issuedQty}, on-hand ${stockOf(m.id)} → ${leak.leakageQty} ${m.unit} unexplained.`, recommendation: 'Advisory only. Trigger a stock count and reconcile with reason codes.', nairaAtRiskMinor: leak.leakageQty * minor(m.unitCost), href: '/construction/materials' });
  }
  // 6. overdue RFIs
  for (const r of w.rfis) if (r.status === 'open' && isOverdue(r.dueISO, nowMs)) out.push({ id: `rs-rfi-${r.id}`, kind: 'overdue_rfi', projectId: r.projectId, projectName: nameOf(r.projectId), severity: 'warn', confidence: 0.8, title: `${r.ref} overdue — ${r.discipline}`, evidence: `"${r.question}" due ${r.dueISO} (${daysUntil(r.dueISO, nowMs) * -1}d overdue).`, recommendation: 'Chase the responsible discipline for a response.', nairaAtRiskMinor: 0, href: '/construction/schedule' });
  // 7. cert expiry
  for (const wk of w.workers) { const c = certBand(wk, nowMs); if (c.days !== null && c.days <= 14) out.push({ id: `rs-cert-${wk.id}`, kind: 'cert_expiry', projectId: wk.projectId ?? '', projectName: nameOf(wk.projectId ?? ''), severity: c.days < 0 ? 'danger' : 'warn', confidence: 0.9, title: `${wk.name}'s ${wk.certName} ${c.days < 0 ? 'expired' : 'expiring'}`, evidence: `${wk.certName} ${c.days < 0 ? `expired ${-c.days}d ago` : `expires in ${c.days}d`} (${wk.certExpiryISO}).`, recommendation: 'Renew before it blocks certified work on site.', nairaAtRiskMinor: 0, href: '/construction/workforce' }); }
  // 8. open critical issues
  for (const i of w.issues) if (i.status !== 'resolved' && (i.severity === 'critical' || i.severity === 'high')) out.push({ id: `rs-issue-${i.id}`, kind: 'open_critical_issue', projectId: i.projectId, projectName: nameOf(i.projectId), severity: i.severity === 'critical' ? 'danger' : 'warn', confidence: 0.75, title: `${i.title}`, evidence: `${i.severity} issue open since ${i.raisedISO}, due ${i.dueISO}.`, recommendation: i.correctiveAction ?? 'Assign an owner and corrective action.', nairaAtRiskMinor: 0, href: '/construction/schedule' });

  return rankRisks(out);
}

/* --- portfolio confidence ------------------------------------------------- */

export function portfolioConfidence(projects: readonly Project[], codes: readonly CostCode[], signals: readonly RiskSignal[]): { score: number; band: Tone; label: string; nairaAtRiskMinor: number } {
  const active = projects.filter((p) => ACTIVE.includes(p.status));
  const list = active.length ? active : projects;
  const avg = (f: (e: EVM) => number) => list.length ? list.reduce((n, p) => n + f(projectEVMOf(p, codes)), 0) / list.length : 1;
  const spi = avg((e) => e.spi), cpi = avg((e) => e.cpi);
  const danger = signals.filter((s) => s.severity === 'danger').length;
  const score = Math.max(0, Math.min(100, Math.round(0.4 * Math.min(1, spi) * 100 + 0.4 * Math.min(1, cpi) * 100 - danger * 5)));
  const band: Tone = score >= 85 ? 'success' : score >= 70 ? 'warn' : 'danger';
  return { score, band, label: score >= 85 ? 'Healthy' : score >= 70 ? 'Watch' : 'At risk', nairaAtRiskMinor: signals.reduce((n, s) => n + s.nairaAtRiskMinor, 0) };
}

/* --- money S-curve (planned/earned/actual/forecast, minor units) ---------- */

export type MoneyCurvePoint = { label: string; pv: number; ev: number; ac: number; forecast: number };
export function moneySCurve(evm: EVM, nowFrac: number, points = 12): MoneyCurvePoint[] {
  const logistic = (t: number) => 1 / (1 + Math.exp(-8 * (t - 0.5)));
  const base = logistic(1) - logistic(0);
  const s = (t: number) => (logistic(t) - logistic(0)) / base;
  const nf = Math.max(0.05, Math.min(0.99, nowFrac));
  const evAtNow = evm.ev, acAtNow = evm.ac;
  const out: MoneyCurvePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const pv = Math.round(s(t) * evm.bac);
    const ev = t <= nf ? Math.round((s(t) / s(nf)) * evAtNow) : evAtNow;
    const ac = t <= nf ? Math.round((s(t) / s(nf)) * acAtNow) : 0;
    const forecast = t >= nf ? Math.round(acAtNow + ((t - nf) / (1 - nf)) * (evm.eac - acAtNow)) : 0;
    out.push({ label: `M${i}`, pv, ev, ac, forecast });
  }
  return out;
}

/* --- schedule: slip propagation ------------------------------------------- */

/** If `taskId` slips `days`, which downstream tasks and milestones move? */
export function slipPropagation(tasks: readonly Task[], taskId: string, days: number): { taskIds: string[]; latestFinishISO: string } {
  const affected = new Set<string>();
  const walk = (id: string) => { for (const t of tasks) if (t.dependsOn.includes(id) && !affected.has(t.id)) { affected.add(t.id); walk(t.id); } };
  walk(taskId);
  const base = tasks.find((t) => t.id === taskId);
  const latest = base ? new Date(Date.parse(base.plannedFinishISO) + days * DAY).toISOString().slice(0, 10) : '';
  return { taskIds: [...affected], latestFinishISO: latest };
}

/* --- delivery radar + workforce ------------------------------------------- */

export function deliveryRadar(pos: readonly PurchaseOrder[], nowMs: number): { today: PurchaseOrder[]; late: PurchaseOrder[]; upcoming: PurchaseOrder[] } {
  const OPEN: PurchaseOrder['status'][] = ['issued', 'acknowledged', 'part_delivered', 'approved'];
  const open = pos.filter((p) => OPEN.includes(p.status) && p.deliveredQty < p.qty);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return {
    today: open.filter((p) => p.expectedISO === today),
    late: open.filter((p) => isOverdue(p.expectedISO, nowMs)),
    upcoming: open.filter((p) => !isOverdue(p.expectedISO, nowMs) && p.expectedISO !== today).sort((a, b) => Date.parse(a.expectedISO) - Date.parse(b.expectedISO)),
  };
}

export function attendanceSummary(attendance: readonly Attendance[], workers: readonly Worker[], projectId: string, dateISO: string): { present: number; absent: number; planned: number; shortfall: number; byTrade: { trade: string; present: number }[] } {
  const today = attendance.filter((a) => a.projectId === projectId && a.dateISO === dateISO);
  const present = today.filter((a) => a.status === 'present').length;
  const absent = today.filter((a) => a.status === 'absent').length;
  const planned = workers.filter((w) => w.projectId === projectId).length;
  const map = new Map<string, number>();
  for (const a of today.filter((x) => x.status === 'present')) { const w = workers.find((x) => x.id === a.workerId); if (w) map.set(w.trade, (map.get(w.trade) ?? 0) + 1); }
  return { present, absent, planned, shortfall: Math.max(0, planned - present), byTrade: [...map.entries()].map(([trade, p]) => ({ trade, present: p })).sort((a, b) => b.present - a.present) };
}

export function labourCostMinor(attendance: readonly Attendance[], workers: readonly Worker[], projectId: string, dateISO: string): number {
  return attendance.filter((a) => a.projectId === projectId && a.dateISO === dateISO && a.status === 'present')
    .reduce((n, a) => n + (minor(workers.find((w) => w.id === a.workerId)?.dayRate ?? { minor: 0 })), 0);
}

/* --- material money-trail (kobo-weighted flow) ---------------------------- */

export type TrailNode = { id: string; label: string; minor: number; tone: Tone };
export function moneyTrail(projectId: string, codes: readonly CostCode[], pos: readonly PurchaseOrder[]): TrailNode[] {
  const cc = codes.filter((c) => c.projectId === projectId);
  const budget = cc.reduce((n, c) => n + minor(c.budget), 0);
  const committed = cc.reduce((n, c) => n + minor(c.committed), 0);
  const ordered = pos.filter((p) => p.projectId === projectId).reduce((n, p) => n + minor(p.value), 0);
  const received = pos.filter((p) => p.projectId === projectId).reduce((n, p) => n + Math.round(minor(p.value) * (p.deliveredQty / Math.max(1, p.qty))), 0);
  const actual = cc.reduce((n, c) => n + minor(c.actual), 0);
  return [
    { id: 'budget', label: 'Approved budget', minor: budget, tone: 'info' },
    { id: 'committed', label: 'Committed', minor: committed, tone: 'progress' },
    { id: 'ordered', label: 'On order (PO)', minor: ordered, tone: 'progress' },
    { id: 'received', label: 'Goods received', minor: received, tone: 'warn' },
    { id: 'actual', label: 'Actual cost', minor: actual, tone: 'danger' },
  ];
}

/* --- weekly digest (source-linked, approved records only) ----------------- */

export type DigestSection = { title: string; text: string; confidence: number; sources: { label: string; href: string }[] };
export function weeklyDigest(p: Project, w: ConWorld, nowMs: number): { sections: DigestSection[]; coverageGaps: string[] } {
  const evm = projectEVMOf(p, w.costCodes);
  const approved = w.reports.filter((r) => r.projectId === p.id && r.status === 'approved').sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO));
  const openPos = w.pos.filter((po) => po.projectId === p.id && po.status !== 'delivered' && po.status !== 'closed');
  const risks = scanRisks({ ...w, projects: [p] }, nowMs);
  const sections: DigestSection[] = [
    { title: 'Progress', text: approved.length ? `${p.name} is ${p.percentComplete}% complete against a ${p.plannedPercent}% plan (${scheduleVariancePct(p) >= 0 ? 'ahead' : `${-scheduleVariancePct(p)}pt behind`}). ${approved[0]?.completed.slice(0, 2).join('; ') || 'Work ongoing'}.` : 'No approved site reports this week — progress unverified.', confidence: approved.length ? 0.9 : 0.4, sources: approved.slice(0, 2).map((r) => ({ label: `Report ${r.dateISO}`, href: '/construction/site' })) },
    { title: 'Cost & earned value', text: `CPI ${evm.cpi} · SPI ${evm.spi}. Forecast out-turn ₦${fmtM(evm.eac)} vs budget ₦${fmtM(evm.bac)} (${evm.vac >= 0 ? 'under' : 'over'} by ₦${fmtM(Math.abs(evm.vac))}).`, confidence: 0.95, sources: [{ label: 'Earned Value Cockpit', href: '/construction/evm' }] },
    { title: 'Procurement', text: openPos.length ? `${openPos.length} open PO(s); ${w.pos.filter((po) => po.projectId === p.id && isOverdue(po.expectedISO, nowMs) && po.deliveredQty < po.qty).length} past their promised date.` : 'No open purchase orders.', confidence: 0.9, sources: openPos.slice(0, 2).map((po) => ({ label: po.ref, href: '/construction/procurement' })) },
    { title: 'Risks flagged', text: risks.length ? risks.slice(0, 3).map((r) => `${RISK_LABEL[r.kind]}: ${r.title}`).join(' · ') : 'No advisory risk signals this week.', confidence: 0.8, sources: [{ label: 'Risk Radar', href: '/construction/risk' }] },
  ];
  return { sections, coverageGaps: coverageGaps(w.reports, p.id, nowMs, 7) };
}

/** Dates in the last `days` with no approved report for a project. */
export function coverageGaps(reports: readonly DailyReport[], projectId: string, nowMs: number, days: number): string[] {
  const have = new Set(reports.filter((r) => r.projectId === projectId && r.status === 'approved').map((r) => r.dateISO));
  const gaps: string[] = [];
  for (let i = 1; i <= days; i++) { const d = new Date(nowMs - i * DAY).toISOString().slice(0, 10); if (!have.has(d)) gaps.push(d); }
  return gaps;
}

/* --- report completeness / quality ---------------------------------------- */

export function reportCompleteness(r: Pick<DailyReport, 'completed' | 'ongoing' | 'plannedNext' | 'workforceCount' | 'weather'>): { pct: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [r.completed.length > 0, 'Completed activities'], [r.ongoing.length > 0, 'Ongoing activities'],
    [r.plannedNext.length > 0, 'Planned next'], [r.workforceCount > 0, 'Workforce count'], [!!r.weather, 'Weather'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { pct: Math.round((done / checks.length) * 100), missing: checks.filter(([ok]) => !ok).map(([, l]) => l) };
}

/* --- misc formatting ------------------------------------------------------ */

function clamp01(n: number): number { return Math.max(0, Math.min(1, Math.round(n * 100) / 100)); }
/** Compact ₦ millions/billions for evidence strings. */
export function fmtM(m: number): string { const n = m / 100; return n >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : `${Math.round(n / 1000)}k`; }
