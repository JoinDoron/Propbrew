/**
 * FM-03 / FM-05 / AI-F-02 — work-order intelligence (deterministic, no LLM).
 *
 * SLA state is computed against a caller-supplied clock so the UI can tick it
 * live; triage suggestions (AI-F-02) recommend a priority and the least-loaded
 * assignee with a reason, but never fire a transition — assignment stays a human
 * decision (HITL). Workload and cost roll-ups summarise the open register.
 */

import type { WorkOrder } from './entities';
import type { WorkOrderPriority } from './enums.proposed';
import type { Tone } from '@/lib/status-tones';

export const CLOSED = ['closed', 'cancelled', 'rejected', 'verified'];
export const isOpen = (w: Pick<WorkOrder, 'status'>) => !CLOSED.includes(w.status);
const UNASSIGNED = new Set(['', 'Unassigned', '—']);

/* --- live SLA ------------------------------------------------------------- */

export type Sla = { dueAt: string | null; kind: 'respond' | 'resolve' | 'none'; msRemaining: number | null; state: 'ok' | 'soon' | 'breached' | 'none'; tone: Tone };

/** The nearest live SLA deadline for a work order at `nowMs`. Respond first
 *  (until met), then resolve. "soon" is within 8h of the deadline. */
export function slaState(w: Pick<WorkOrder, 'status' | 'respondDueAt' | 'resolveDueAt'>, nowMs: number): Sla {
  if (!isOpen(w)) return { dueAt: null, kind: 'none', msRemaining: null, state: 'none', tone: 'neutral' };
  const respond = w.respondDueAt ? Date.parse(w.respondDueAt) : null;
  const resolve = w.resolveDueAt ? Date.parse(w.resolveDueAt) : null;
  // pick the earliest deadline still in the future; else the most overdue one
  const candidates: { at: number; kind: 'respond' | 'resolve' }[] = [];
  if (respond !== null) candidates.push({ at: respond, kind: 'respond' });
  if (resolve !== null) candidates.push({ at: resolve, kind: 'resolve' });
  if (candidates.length === 0) return { dueAt: null, kind: 'none', msRemaining: null, state: 'none', tone: 'neutral' };
  const future = candidates.filter((c) => c.at >= nowMs).sort((a, b) => a.at - b.at);
  const pick = future[0] ?? candidates.sort((a, b) => a.at - b.at)[0];
  const ms = pick.at - nowMs;
  const state = ms < 0 ? 'breached' : ms <= 8 * 3600 * 1000 ? 'soon' : 'ok';
  return { dueAt: new Date(pick.at).toISOString(), kind: pick.kind, msRemaining: ms, state, tone: state === 'breached' ? 'danger' : state === 'soon' ? 'warn' : 'success' };
}

/* --- workload ------------------------------------------------------------- */

export type Load = { assignee: string; open: number; critical: number; tone: Tone };

export function workload(wos: readonly WorkOrder[]): Load[] {
  const m = new Map<string, { open: number; critical: number }>();
  for (const w of wos) {
    if (!isOpen(w) || UNASSIGNED.has(w.assigneeName)) continue;
    const e = m.get(w.assigneeName) ?? { open: 0, critical: 0 };
    e.open += 1;
    if (w.priority === 'emergency' || w.priority === 'high') e.critical += 1;
    m.set(w.assigneeName, e);
  }
  return [...m.entries()]
    .map(([assignee, e]) => ({ assignee, ...e, tone: (e.open >= 4 ? 'danger' : e.open >= 2 ? 'warn' : 'success') as Tone }))
    .sort((a, b) => b.open - a.open);
}

/* --- AI-F-02 triage ------------------------------------------------------- */

export type Triage = { id: string; ref: string; title: string; currentPriority: WorkOrderPriority; suggestedPriority: WorkOrderPriority; suggestedAssignee: string; reason: string; escalate: boolean };

const URGENT = /leak|flood|fire|smoke|electric|shock|no power|outage|gas|burst|sewage|security|intruder|injur|trapped|lift stuck|elevator/i;
const MODERATE = /broken|not working|fault|repair|blocked|damage|crack|noise|pest/i;

function suggestPriority(w: Pick<WorkOrder, 'title' | 'origin' | 'priority'>): { p: WorkOrderPriority; why: string } {
  if (URGENT.test(w.title)) return { p: 'emergency', why: 'safety-critical keyword in the request' };
  if (w.origin === 'failed_inspection') return { p: 'high', why: 'raised by a failed inspection' };
  if (MODERATE.test(w.title)) return { p: 'high', why: 'repair-type request' };
  return { p: 'routine', why: 'routine request' };
}

const RANK: Record<string, number> = { emergency: 4, high: 3, routine: 2, low: 1 };

/** Suggestions for work orders still awaiting triage/assignment. Advisory only. */
export function triageSuggestions(wos: readonly WorkOrder[]): Triage[] {
  const loads = workload(wos);
  const leastLoaded = () => loads.length ? loads[loads.length - 1].assignee : 'Emeka Nwosu';
  return wos
    .filter((w) => isOpen(w) && (['new', 'triaged'].includes(w.status) || UNASSIGNED.has(w.assigneeName)))
    .map((w) => {
      const { p, why } = suggestPriority(w);
      const assignee = UNASSIGNED.has(w.assigneeName) ? leastLoaded() : w.assigneeName;
      const escalate = RANK[p] > RANK[w.priority];
      return { id: w.id, ref: w.ref, title: w.title, currentPriority: w.priority, suggestedPriority: p, suggestedAssignee: assignee, reason: `${why}${escalate ? ` — raise from ${w.priority}` : ''}`, escalate };
    })
    .sort((a, b) => RANK[b.suggestedPriority] - RANK[a.suggestedPriority]);
}

/* --- cost roll-up --------------------------------------------------------- */

export type CostRollup = { totalMinor: number; avgMinor: number; withCost: number; byOrigin: { origin: string; minor: number }[] };

const ORIGIN_LABEL: Record<string, string> = { resident_request: 'Resident', manager: 'Manager', ppm_schedule: 'PPM', failed_inspection: 'Inspection' };

export function costRollup(wos: readonly WorkOrder[]): CostRollup {
  const withCost = wos.filter((w) => w.cost && w.cost.minor > 0);
  const total = withCost.reduce((n, w) => n + (w.cost?.minor ?? 0), 0);
  const m = new Map<string, number>();
  for (const w of withCost) m.set(ORIGIN_LABEL[w.origin] ?? w.origin, (m.get(ORIGIN_LABEL[w.origin] ?? w.origin) ?? 0) + (w.cost?.minor ?? 0));
  return {
    totalMinor: total,
    avgMinor: withCost.length ? Math.round(total / withCost.length) : 0,
    withCost: withCost.length,
    byOrigin: [...m.entries()].map(([origin, minor]) => ({ origin, minor })).sort((a, b) => b.minor - a.minor),
  };
}
