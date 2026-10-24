'use server';

/**
 * Construction (ConstructionOS) actions. Every mutation re-checks the §7
 * reports_analytics capability server-side (estate_manager/facility_manager hold
 * M and mutate; executive/investor hold V → rejected). The flagship flows are
 * end-to-end: awarding an RFQ issues a PO and commits budget; receiving a
 * delivery books stock AND actual cost; escalating a risk signal opens a real
 * Issue — so the money and the site stay in one truth.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, type Actor } from '@/lib/authz';
import { db } from '@/server/data/store';
import { repos, scopedMutableGet } from '@/server/data';
import { money, type Money } from '@/domain/primitives';
import { NOW } from '@/domain/ppm';
import { canEnterWorkspace } from '@/config/workspaces';
import {
  nextRevision, timesheetCostMinor, movementAllowed, routeFor, stepsFromRule,
  canApprove, applyDecision, pendingSteps, fxExposure, fxTable,
} from '@/domain/construction';
import type { CurrencyCode } from '@/domain/primitives';

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

const PATHS = ['/construction', '/construction/evm', '/construction/schedule', '/construction/materials', '/construction/risk', '/construction/procurement', '/construction/site', '/construction/cost', '/construction/projects', '/construction/workforce', '/construction/digest', '/construction/documents', '/construction/boq', '/construction/timesheets', '/construction/stock', '/construction/approvals', '/construction/audit', '/construction/fx'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

async function gate(action: 'update' | 'create'): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  const actor = await getActor();
  if (!canEnterWorkspace(actor, 'construction')) return { ok: false, error: 'You cannot enter the construction workspace with this account.' };
  try { assertCan(actor, 'reports_analytics', action); return { ok: true, actor }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You need construction-manager access for this.' }; throw e; }
}

const addMinor = (a: Money, b: number): Money => money(a.minor + b, a.currency);
/** The acting user's human name (Actor carries ids, not display names). */
const nameOf = (actor: Actor): string => db.users.find((u) => u.id === actor.userId)?.name ?? 'Site team';
const daysISO = (fromISO: string, days: number) => new Date(Date.parse(fromISO) + days * 24 * 3600 * 1000).toISOString().slice(0, 10);

/* --- daily site reports (state machine) ----------------------------------- */
export async function submitReport(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = scopedMutableGet(g.actor, 'reports_analytics', db.constructionReports, id, 'update'); if (!r) return { ok: false, error: 'Report not found.' };
  if (r.status !== 'draft' && r.status !== 'returned') return { ok: false, error: 'Only a draft can be submitted.' };
  r.status = 'submitted'; revalidate(); return { ok: true, ref: r.dateISO };
}
export async function reviewReport(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = scopedMutableGet(g.actor, 'reports_analytics', db.constructionReports, id, 'update'); if (!r) return { ok: false, error: 'Report not found.' };
  if (r.status !== 'submitted') return { ok: false, error: 'Only a submitted report can be reviewed.' };
  r.status = 'reviewed'; revalidate(); return { ok: true };
}
export async function approveDailyReport(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = scopedMutableGet(g.actor, 'reports_analytics', db.constructionReports, id, 'update'); if (!r) return { ok: false, error: 'Report not found.' };
  if (r.status !== 'submitted' && r.status !== 'reviewed') return { ok: false, error: 'Only a submitted/reviewed report can be approved.' };
  // Segregation of duties: the approver may not be the reporting officer.
  const me = nameOf(g.actor).toLowerCase();
  if (me && r.officer.toLowerCase() === me) return { ok: false, error: 'You submitted this report — a different manager must approve it.' };
  r.status = 'approved'; revalidate(); return { ok: true, ref: r.dateISO };
}
export async function returnDailyReport(id: string, reason: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = scopedMutableGet(g.actor, 'reports_analytics', db.constructionReports, id, 'update'); if (!r) return { ok: false, error: 'Report not found.' };
  if (!reason?.trim()) return { ok: false, error: 'A return reason is required.' };
  r.status = 'returned'; r.constraints = [...r.constraints, `Returned: ${reason.trim()}`]; revalidate(); return { ok: true };
}

/* --- schedule ------------------------------------------------------------- */
export async function updateTaskProgress(id: string, pct: number): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const t = scopedMutableGet(g.actor, 'reports_analytics', db.constructionTasks, id, 'update'); if (!t) return { ok: false, error: 'Task not found.' };
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  t.percentComplete = p; t.status = p === 0 ? 'not_started' : p >= 100 ? 'done' : 'in_progress';
  if (p > 0 && !t.actualStartISO) t.actualStartISO = NOW.slice(0, 10);
  if (p >= 100 && !t.actualFinishISO) t.actualFinishISO = NOW.slice(0, 10);
  revalidate(); return { ok: true, ref: t.name };
}
export async function advanceMilestone(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const m = scopedMutableGet(g.actor, 'reports_analytics', db.constructionMilestones, id, 'update'); if (!m) return { ok: false, error: 'Milestone not found.' };
  m.status = 'accepted'; revalidate(); return { ok: true, ref: m.name };
}
let issueSeq = 0;
export async function escalateTaskToIssue(taskId: string): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const t = scopedMutableGet(g.actor, 'reports_analytics', db.constructionTasks, taskId, 'create'); if (!t) return { ok: false, error: 'Task not found.' };
  const id = `is-esc-${++issueSeq}`;
  db.constructionIssues.unshift({ tenantId: g.actor.tenantId, id, projectId: t.projectId, category: 'Schedule', title: `Overdue task escalated: ${t.name}`, severity: 'high', owner: t.owner, raisedISO: NOW.slice(0, 10), dueISO: daysISO(NOW, 3), status: 'open', correctiveAction: 'Recovery plan required' } as (typeof db.constructionIssues)[number]);
  revalidate(); return { ok: true, ref: t.name };
}

/* --- procurement (PR → RFQ award → PO → delivery) ------------------------- */
export async function approvePurchaseRequest(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const pr = scopedMutableGet(g.actor, 'reports_analytics', db.constructionRequests, id, 'update'); if (!pr) return { ok: false, error: 'Request not found.' };
  if (pr.status !== 'pending' && pr.status !== 'draft') return { ok: false, error: 'Only a pending request can be approved.' };
  pr.status = 'approved'; revalidate(); return { ok: true, ref: pr.ref };
}
let poSeq = 0;
/** Award an RFQ to a vendor: issue a PO from the winning quote and commit budget. */
export async function awardRfq(rfqId: string, vendorId: string): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const rfq = scopedMutableGet(g.actor, 'reports_analytics', db.constructionRfqs, rfqId, 'create'); if (!rfq) return { ok: false, error: 'RFQ not found.' };
  const q = rfq.quotes.find((x) => x.vendorId === vendorId); if (!q) return { ok: false, error: 'Quote not found.' };
  rfq.status = 'awarded'; rfq.awardedVendorId = vendorId;
  const ref = `PO-${3015 + db.constructionOrders.length + (++poSeq)}`;
  db.constructionOrders.unshift({ tenantId: g.actor.tenantId, id: `po-new-${poSeq}`, ref, projectId: rfq.projectId, vendorId, vendorName: q.vendorName, item: rfq.item, qty: rfq.qty, unit: rfq.unit, costCode: 'MAR-SUP', value: q.price, status: 'issued', issuedISO: NOW.slice(0, 10), expectedISO: daysISO(NOW, q.leadDays), deliveredQty: 0 } as (typeof db.constructionOrders)[number]);
  const req = repos.constructionRequests.list(g.actor, { limit: 500 }).items.find((r) => r.ref === rfq.requestRef); if (req) req.status = 'ordered';
  const cc = repos.constructionCostCodes.list(g.actor, { limit: 500 }).items.find((c) => c.code === 'MAR-SUP'); if (cc) cc.committed = addMinor(cc.committed, q.price.minor);
  revalidate(); return { ok: true, ref };
}
export async function approvePurchaseOrder(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const po = scopedMutableGet(g.actor, 'reports_analytics', db.constructionOrders, id, 'update'); if (!po) return { ok: false, error: 'PO not found.' };
  po.status = po.status === 'draft' ? 'approved' : 'issued'; revalidate(); return { ok: true, ref: po.ref };
}
let movSeq = 0;
/** Receive against a PO: advance delivery, book stock AND actual cost. */
export async function receiveDelivery(poId: string, qty: number): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const po = scopedMutableGet(g.actor, 'reports_analytics', db.constructionOrders, poId, 'update'); if (!po) return { ok: false, error: 'PO not found.' };
  if (!(qty > 0)) return { ok: false, error: 'Enter a quantity greater than zero.' };
  const recv = Math.min(qty, po.qty - po.deliveredQty);
  po.deliveredQty += recv; po.status = po.deliveredQty >= po.qty ? 'delivered' : 'part_delivered';
  // Book actual cost pro-rata into the cost code.
  const cc = repos.constructionCostCodes.list(g.actor, { limit: 500 }).items.find((c) => c.code === po.costCode);
  const bookedMinor = Math.round(po.value.minor * (recv / Math.max(1, po.qty)));
  if (cc) cc.actual = addMinor(cc.actual, bookedMinor);
  // Book stock if we can match the material by name, and log a permanent movement.
  const mat = repos.constructionMaterials.list(g.actor, { limit: 500 }).items.find((m) => po.item.toLowerCase().includes(m.name.toLowerCase().slice(0, 6)) || m.name.toLowerCase().includes(po.item.toLowerCase().slice(0, 6)));
  if (mat) {
    const st = repos.constructionStock.list(g.actor, { limit: 1000 }).items.find((s) => s.materialId === mat.id);
    if (st) { st.onHand += recv; st.inTransit = Math.max(0, st.inTransit - recv); }
    db.constructionMovements.unshift({ tenantId: g.actor.tenantId, id: `sm-new-${++movSeq}`, materialId: mat.id, kind: 'receipt', qty: recv, atISO: NOW.slice(0, 10), projectId: po.projectId, costCode: po.costCode, ref: po.ref, by: nameOf(g.actor) } as (typeof db.constructionMovements)[number]);
  }
  revalidate(); return { ok: true, ref: `${recv} ${po.unit}` };
}

/* --- materials ------------------------------------------------------------ */
export async function issueMaterials(materialId: string, qty: number, projectId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const st = repos.constructionStock.list(g.actor, { limit: 1000 }).items.find((s) => s.materialId === materialId); if (!st) return { ok: false, error: 'Stock not found.' };
  if (!(qty > 0)) return { ok: false, error: 'Enter a quantity greater than zero.' };
  if (qty > st.onHand) return { ok: false, error: 'Cannot issue more than on-hand (negative stock blocked).' };
  st.onHand -= qty; st.reserved = Math.max(0, st.reserved - qty);
  db.constructionMovements.unshift({ tenantId: g.actor.tenantId, id: `sm-new-${++movSeq}`, materialId, kind: 'issue', qty, atISO: NOW.slice(0, 10), projectId, ref: `MI-${470 + movSeq}`, by: nameOf(g.actor) } as (typeof db.constructionMovements)[number]);
  revalidate(); return { ok: true };
}

/* --- cost control --------------------------------------------------------- */
let varSeq = 0;
export type VariationInput = { projectId: string; title: string; reason: string; costImpactNaira: number; scheduleImpactDays: number };
export async function raiseVariation(input: VariationInput): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  if (!input.title?.trim()) return { ok: false, error: 'Enter a variation title.' };
  const ref = `VO-${12 + db.constructionVariations.length + (++varSeq)}`;
  db.constructionVariations.unshift({ tenantId: g.actor.tenantId, id: `var-new-${varSeq}`, ref, projectId: input.projectId, title: input.title.trim(), reason: input.reason.trim() || 'Not stated', costImpact: money(Math.round((input.costImpactNaira || 0) * 100)), scheduleImpactDays: Math.round(input.scheduleImpactDays || 0), status: 'submitted', raisedISO: NOW.slice(0, 10) } as (typeof db.constructionVariations)[number]);
  revalidate(); return { ok: true, ref };
}
export async function approveVariation(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const v = scopedMutableGet(g.actor, 'reports_analytics', db.constructionVariations, id, 'update'); if (!v) return { ok: false, error: 'Variation not found.' };
  v.status = 'approved'; revalidate(); return { ok: true, ref: v.ref };
}

/* --- risk radar (advisory lifecycle) -------------------------------------- */
function setSignalState(signalId: string, state: 'ack' | 'snoozed' | 'escalated' | 'dismissed') {
  const existing = db.constructionSignalStates.find((s) => s.signalId === signalId);
  if (existing) existing.state = state; else db.constructionSignalStates.push({ signalId, state, atISO: NOW });
}
export async function acknowledgeSignal(signalId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  setSignalState(signalId, 'ack'); revalidate(); return { ok: true };
}
export async function snoozeSignal(signalId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  setSignalState(signalId, 'snoozed'); revalidate(); return { ok: true };
}
export async function dismissSignal(signalId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  setSignalState(signalId, 'dismissed'); revalidate(); return { ok: true };
}
export async function escalateSignalToIssue(signalId: string, projectId: string, title: string): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const id = `is-esc-${++issueSeq}`;
  db.constructionIssues.unshift({ tenantId: g.actor.tenantId, id, projectId, category: 'Risk', title: `Escalated: ${title}`, severity: 'high', owner: nameOf(g.actor), raisedISO: NOW.slice(0, 10), dueISO: daysISO(NOW, 5), status: 'open', correctiveAction: 'From risk radar' } as (typeof db.constructionIssues)[number]);
  setSignalState(signalId, 'escalated'); revalidate(); return { ok: true, ref: id };
}

/* --- projects ------------------------------------------------------------- */
let projSeq = 0;
export type ProjectInput = { name: string; location: string; clientName: string; contractNaira: number; budgetNaira: number; plannedFinishISO: string };
export async function createProject(input: ProjectInput): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  if (!input.name?.trim()) return { ok: false, error: 'Enter a project name.' };
  const id = `cp-new-${++projSeq}`;
  db.constructionProjects.unshift({ tenantId: g.actor.tenantId, id, projectId: id, code: `NEW-${projSeq}`, name: input.name.trim(), location: input.location.trim() || 'Lagos', clientName: input.clientName.trim() || '7 Fifteen Capital', pmName: nameOf(g.actor), status: 'planning', contractValue: money(Math.round((input.contractNaira || 0) * 100)), approvedBudget: money(Math.round((input.budgetNaira || 0) * 100)), startISO: NOW.slice(0, 10), plannedFinishISO: input.plannedFinishISO || daysISO(NOW, 540), plannedPercent: 0, percentComplete: 0 } as (typeof db.constructionProjects)[number]);
  revalidate(); return { ok: true, ref: input.name.trim() };
}

/* --- workforce ------------------------------------------------------------ */
export async function clockWorker(workerId: string, projectId: string, present: boolean): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const today = NOW.slice(0, 10);
  const existing = db.constructionAttendance.find((a) => a.workerId === workerId && a.dateISO === today);
  if (existing) { existing.status = present ? 'present' : 'absent'; existing.clockIn = present ? '07:30' : undefined; }
  else db.constructionAttendance.unshift({ tenantId: g.actor.tenantId, id: `at-new-${workerId}`, workerId, projectId, dateISO: today, clockIn: present ? '07:30' : undefined, hours: 0, overtime: 0, method: 'manual', withinGeofence: present, status: present ? 'present' : 'absent' } as (typeof db.constructionAttendance)[number]);
  revalidate(); return { ok: true };
}

/* --- digest --------------------------------------------------------------- */
export async function publishDigest(projectId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const p = scopedMutableGet(g.actor, 'reports_analytics', db.constructionProjects, projectId, 'update'); if (!p) return { ok: false, error: 'Project not found.' };
  revalidate(); return { ok: true, ref: p.name };
}

/* --- document revision control -------------------------------------------- */

let revSeq = 0;
/** Issue a new revision over an existing one. The prior revision is marked
 *  superseded rather than edited — an approved issue is immutable, which is the
 *  whole point of a controlled register (PRD §12 "Prevent approved revisions
 *  from being overwritten"). */
export async function issueRevision(docId: string, changeNote: string): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const prior = scopedMutableGet(g.actor, 'reports_analytics', db.constructionDocs, docId, 'update');
  if (!prior) return { ok: false, error: 'Document not found.' };
  if (prior.status === 'superseded') return { ok: false, error: 'That revision is already superseded — issue from the current one.' };
  if (prior.status === 'approved' && !changeNote.trim()) return { ok: false, error: 'A change note is required when superseding an approved revision.' };

  const revision = nextRevision(prior.revision);
  const id = `doc-rev-${++revSeq}`;
  db.constructionDocs.unshift({
    ...prior, id, revision, status: 'draft',
    effectiveISO: NOW.slice(0, 10), changeNote: changeNote.trim() || undefined,
    uploadedBy: nameOf(g.actor), approvedBy: undefined, approvedISO: undefined,
    supersedesId: prior.id, supersededById: undefined,
  } as (typeof db.constructionDocs)[number]);
  // The prior revision is NOT retired yet. A drawing under revision must keep
  // its approved issue current — the site has to have something to build to
  // until the replacement is itself approved. `approveRevision` does the swap.
  revalidate();
  return { ok: true, ref: `${prior.number} rev ${revision}` };
}

export async function approveRevision(docId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const doc = scopedMutableGet(g.actor, 'reports_analytics', db.constructionDocs, docId, 'update');
  if (!doc) return { ok: false, error: 'Document not found.' };
  if (doc.status === 'approved') return { ok: false, error: 'Already approved.' };
  if (doc.status === 'superseded') return { ok: false, error: 'A superseded revision cannot be approved.' };
  // Exactly one approved revision per document number.
  for (const other of db.constructionDocs) {
    if (other.number === doc.number && other.id !== doc.id && other.status === 'approved') {
      other.status = 'superseded';
      other.supersededById = doc.id;
    }
  }
  doc.status = 'approved'; doc.approvedBy = nameOf(g.actor); doc.approvedISO = NOW.slice(0, 10);
  revalidate();
  return { ok: true, ref: `${doc.number} rev ${doc.revision}` };
}

let trSeq = 0;
/** Formally issue a revision to a party — the distribution record an audit asks for. */
export async function sendTransmittal(docId: string, toParty: string, purpose: 'for_construction' | 'for_review' | 'for_information'): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const doc = scopedMutableGet(g.actor, 'reports_analytics', db.constructionDocs, docId, 'update');
  if (!doc) return { ok: false, error: 'Document not found.' };
  if (!toParty.trim()) return { ok: false, error: 'Name the party being issued to.' };
  if (doc.status !== 'approved' && purpose === 'for_construction') {
    return { ok: false, error: 'Only an approved revision can be issued for construction.' };
  }
  db.constructionTransmittals.unshift({
    tenantId: g.actor.tenantId, id: `tr-new-${++trSeq}`, docId, docNumber: doc.number,
    revision: doc.revision, toParty: toParty.trim(), sentISO: NOW.slice(0, 10), purpose,
  } as unknown as (typeof db.constructionTransmittals)[number]);
  revalidate();
  return { ok: true, ref: `${doc.number} rev ${doc.revision} → ${toParty.trim()}` };
}

export async function answerRfi(rfiId: string, answer: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = scopedMutableGet(g.actor, 'reports_analytics', db.constructionRfis, rfiId, 'update');
  if (!r) return { ok: false, error: 'RFI not found.' };
  if (!answer.trim()) return { ok: false, error: 'An answer is required.' };
  r.answer = answer.trim(); r.answeredISO = NOW.slice(0, 10); r.status = 'answered';
  revalidate();
  return { ok: true, ref: r.ref };
}

export async function closeRfi(rfiId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = scopedMutableGet(g.actor, 'reports_analytics', db.constructionRfis, rfiId, 'update');
  if (!r) return { ok: false, error: 'RFI not found.' };
  if (r.status === 'open') return { ok: false, error: 'Answer the RFI before closing it.' };
  r.status = 'closed';
  revalidate();
  return { ok: true, ref: r.ref };
}

/* --- BOQ import ------------------------------------------------------------ */

let ccSeq = 0;
export type BoqImportRow = { code: string; name: string; category: string; budgetMinor: number };

/** Commit a parsed BOQ. Existing codes have their BUDGET updated (committed and
 *  actual are untouched — those are transaction history, not a spreadsheet's to
 *  overwrite); new codes are created. */
export async function importBoq(projectId: string, rows: BoqImportRow[]): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  if (!scopedMutableGet(g.actor, 'reports_analytics', db.constructionProjects, projectId, 'create')) return { ok: false, error: 'Project not found.' };
  if (rows.length === 0) return { ok: false, error: 'Nothing to import.' };

  let created = 0, updated = 0;
  for (const r of rows) {
    const existing = repos.constructionCostCodes.list(g.actor, { limit: 500 }).items.find((c) => c.projectId === projectId && c.code === r.code);
    if (existing) {
      existing.budget = money(r.budgetMinor);
      existing.name = r.name;
      existing.category = r.category;
      updated += 1;
    } else {
      db.constructionCostCodes.push({
        tenantId: g.actor.tenantId, id: `cc-boq-${++ccSeq}`, projectId,
        code: r.code, name: r.name, category: r.category,
        budget: money(r.budgetMinor), committed: money(0), actual: money(0),
        plannedPercent: 0, earnedPercent: 0,
      } as unknown as (typeof db.constructionCostCodes)[number]);
      created += 1;
    }
  }
  revalidate();
  return { ok: true, ref: `${created} created, ${updated} updated` };
}

/* --- timesheets → earned value -------------------------------------------- */

export async function submitTimesheet(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const ts = scopedMutableGet(g.actor, 'reports_analytics', db.constructionTimesheets, id, 'update');
  if (!ts) return { ok: false, error: 'Timesheet not found.' };
  if (ts.status !== 'draft' && ts.status !== 'rejected') return { ok: false, error: 'Only a draft can be submitted.' };
  ts.status = 'submitted';
  revalidate();
  return { ok: true, ref: ts.ref };
}

/**
 * Approve a timesheet and POST its labour cost to the cost code's actual — the
 * step that makes labour visible in earned value. `postedMinor` records what was
 * posted so a re-approval can never double-count.
 */
export async function approveTimesheet(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const ts = scopedMutableGet(g.actor, 'reports_analytics', db.constructionTimesheets, id, 'update');
  if (!ts) return { ok: false, error: 'Timesheet not found.' };
  if (ts.status === 'approved') return { ok: false, error: 'Already approved and posted.' };
  if (ts.status !== 'submitted') return { ok: false, error: 'Only a submitted timesheet can be approved.' };
  // Segregation of duties: you cannot approve the hours you booked yourself.
  if (ts.submittedBy.toLowerCase() === nameOf(g.actor).toLowerCase()) {
    return { ok: false, error: 'You submitted these hours — a different approver is required.' };
  }
  const worker = scopedMutableGet(g.actor, 'reports_analytics', db.constructionWorkers, ts.workerId, 'read');
  const costMinor = timesheetCostMinor(ts, worker ? worker.dayRate.minor : 0);
  const code = repos.constructionCostCodes.list(g.actor, { limit: 500 }).items.find((c) => c.projectId === ts.projectId && c.code === ts.costCode);
  if (!code) return { ok: false, error: `Cost code ${ts.costCode} does not exist on this project.` };

  code.actual = addMinor(code.actual, costMinor);
  ts.status = 'approved'; ts.approvedBy = nameOf(g.actor); ts.approvedISO = NOW.slice(0, 10); ts.postedMinor = costMinor;
  revalidate();
  return { ok: true, ref: `${ts.ref} · ₦${Math.round(costMinor / 100).toLocaleString('en-NG')} posted to ${ts.costCode}` };
}

export async function rejectTimesheet(id: string, reason: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const ts = scopedMutableGet(g.actor, 'reports_analytics', db.constructionTimesheets, id, 'update');
  if (!ts) return { ok: false, error: 'Timesheet not found.' };
  if (ts.status === 'approved') return { ok: false, error: 'An approved timesheet is already posted — raise an adjustment instead.' };
  if (!reason.trim()) return { ok: false, error: 'A rejection reason is required.' };
  ts.status = 'rejected';
  revalidate();
  return { ok: true, ref: ts.ref };
}

/* --- audit trail ----------------------------------------------------------- */

/** Append an immutable audit entry. Called by every sensitive action; nothing in
 *  the app ever updates or deletes one (PRD §18.3 / SC-10). */
function audit(actor: Actor, entry: {
  action: 'approve' | 'reject' | 'issue' | 'supersede' | 'post_cost' | 'import' | 'stock_move' | 'stock_count' | 'override' | 'delegate' | 'cancel' | 'fx_revalue';
  entity: string; entityRef: string; summary: string;
  projectId?: string; amountMinor?: number; before?: string; after?: string; reasonCodeId?: string; note?: string;
}): void {
  const seq = db.constructionAudit.length + 1;
  db.constructionAudit.push({
    tenantId: actor.tenantId, id: `au-${seq}-${Date.now().toString(36)}`, seq,
    atISO: new Date(Date.parse(NOW)).toISOString(),
    actorId: actor.userId, actorName: nameOf(actor), actorRole: actor.roles[0] ?? 'unknown',
    ...entry,
  } as unknown as (typeof db.constructionAudit)[number]);
}

/** Record a coded reason alongside whatever it explains. */
function recordReason(actor: Actor, e: {
  domain: 'rejection' | 'delay' | 'variance' | 'stock_adjust' | 'stock_return';
  codeId: string; subjectKind: string; subjectRef: string;
  projectId?: string; note?: string; impactMinor?: number; impactDays?: number;
}): void {
  db.constructionReasonEvents.push({
    tenantId: actor.tenantId, id: `re-${db.constructionReasonEvents.length + 1}-${Date.now().toString(36)}`,
    atISO: NOW.slice(0, 10), by: nameOf(actor), ...e,
  } as unknown as (typeof db.constructionReasonEvents)[number]);
}

/* --- stock movements (the full set) ---------------------------------------- */

const onHandOf = (materialId: string, warehouseId?: string) =>
  db.constructionStock
    .filter((s) => s.materialId === materialId && (!warehouseId || s.warehouseId === warehouseId))
    .reduce((n, s) => n + s.onHand, 0);

let mvSeq = 0;
function writeMovement(actor: Actor, kind: 'receipt' | 'issue' | 'transfer' | 'return' | 'adjust', materialId: string, qty: number, extra: { projectId?: string; costCode?: string; ref?: string } = {}): void {
  db.constructionMovements.unshift({
    tenantId: actor.tenantId, id: `mv-${kind}-${++mvSeq}`, materialId, kind, qty,
    atISO: new Date(Date.parse(NOW)).toISOString(), by: nameOf(actor), ...extra,
  } as unknown as (typeof db.constructionMovements)[number]);
}

/** Move stock between stores. Never allowed to drive the source negative. */
export async function transferStock(materialId: string, fromWarehouseId: string, toWarehouseId: string, qty: number): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  if (fromWarehouseId === toWarehouseId) return { ok: false, error: 'Pick two different stores.' };
  const from = repos.constructionStock.list(g.actor, { limit: 1000 }).items.find((s) => s.materialId === materialId && s.warehouseId === fromWarehouseId);
  const mat = scopedMutableGet(g.actor, 'reports_analytics', db.constructionMaterials, materialId, 'read');
  if (!from || !mat) return { ok: false, error: 'Stock line not found.' };
  const check = movementAllowed('transfer', from.onHand, qty);
  if (!check.allowed) return { ok: false, error: check.reason! };

  from.onHand -= qty;
  const to = repos.constructionStock.list(g.actor, { limit: 1000 }).items.find((s) => s.materialId === materialId && s.warehouseId === toWarehouseId);
  if (to) to.onHand += qty;
  else db.constructionStock.push({ tenantId: g.actor.tenantId, id: `st-tr-${++mvSeq}`, materialId, warehouseId: toWarehouseId, onHand: qty, reserved: 0, inTransit: 0 } as unknown as (typeof db.constructionStock)[number]);

  writeMovement(g.actor, 'transfer', materialId, qty, { ref: `${fromWarehouseId}→${toWarehouseId}` });
  audit(g.actor, { action: 'stock_move', entity: 'material', entityRef: mat.name, summary: `Transferred ${qty} ${mat.unit} between stores`, amountMinor: qty * mat.unitCost.minor });
  revalidate();
  return { ok: true, ref: `${qty} ${mat.unit} moved` };
}

/** Surplus coming back from site — needs a coded reason so returns are analysable. */
export async function returnStock(materialId: string, warehouseId: string, qty: number, reasonCodeId: string, note?: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const mat = scopedMutableGet(g.actor, 'reports_analytics', db.constructionMaterials, materialId, 'read');
  if (!mat) return { ok: false, error: 'Material not found.' };
  if (!(qty > 0)) return { ok: false, error: 'Quantity must be greater than zero.' };
  const code = scopedMutableGet(g.actor, 'reports_analytics', db.constructionReasonCodes, reasonCodeId, 'read');
  if (!code) return { ok: false, error: 'Choose a reason.' };
  if (code.requiresNote && !note?.trim()) return { ok: false, error: `“${code.label}” needs a note.` };

  const line = repos.constructionStock.list(g.actor, { limit: 1000 }).items.find((s) => s.materialId === materialId && s.warehouseId === warehouseId);
  if (line) line.onHand += qty;
  else db.constructionStock.push({ tenantId: g.actor.tenantId, id: `st-rt-${++mvSeq}`, materialId, warehouseId, onHand: qty, reserved: 0, inTransit: 0 } as unknown as (typeof db.constructionStock)[number]);

  writeMovement(g.actor, 'return', materialId, qty, { ref: code.code });
  recordReason(g.actor, { domain: 'stock_return', codeId: reasonCodeId, subjectKind: 'material', subjectRef: materialId, note, impactMinor: qty * mat.unitCost.minor });
  audit(g.actor, { action: 'stock_move', entity: 'material', entityRef: mat.name, summary: `${qty} ${mat.unit} returned to store — ${code.label}`, amountMinor: qty * mat.unitCost.minor, reasonCodeId, note });
  revalidate();
  return { ok: true, ref: `${qty} ${mat.unit} returned` };
}

let scSeq = 0;
/** Record a physical count. The variance is NOT written to stock until it is
 *  reconciled with a reason — counting and adjusting are deliberately separate. */
export async function recordStockCount(materialId: string, warehouseId: string, countedQty: number): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const mat = scopedMutableGet(g.actor, 'reports_analytics', db.constructionMaterials, materialId, 'read');
  if (!mat) return { ok: false, error: 'Material not found.' };
  if (countedQty < 0) return { ok: false, error: 'A count cannot be negative.' };
  const systemQty = onHandOf(materialId, warehouseId);
  const ref = `SC-${2040 + db.constructionStockCounts.length + (++scSeq)}`;
  db.constructionStockCounts.unshift({
    tenantId: g.actor.tenantId ?? 't-lekki', id: `sc-${scSeq}`, ref, warehouseId, materialId,
    systemQty, countedQty, countedBy: nameOf(g.actor), countedISO: NOW.slice(0, 10), status: 'open',
  });
  audit(g.actor, { action: 'stock_count', entity: 'material', entityRef: mat.name, summary: `Counted ${countedQty} vs ${systemQty} on system`, before: String(systemQty), after: String(countedQty) });
  revalidate();
  return { ok: true, ref };
}

/** Apply a count's variance to stock, with a mandatory coded reason. This is the
 *  only path by which a count can change the books. */
export async function reconcileStockCount(countId: string, reasonCodeId: string, note?: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const count = scopedMutableGet(g.actor, 'reports_analytics', db.constructionStockCounts, countId, 'update');
  if (!count) return { ok: false, error: 'Count not found.' };
  if (count.status === 'reconciled') return { ok: false, error: 'Already reconciled.' };
  const code = scopedMutableGet(g.actor, 'reports_analytics', db.constructionReasonCodes, reasonCodeId, 'read');
  if (!code) return { ok: false, error: 'A reason is required to move stock.' };
  if (code.requiresNote && !note?.trim()) return { ok: false, error: `“${code.label}” needs a note.` };

  const mat = scopedMutableGet(g.actor, 'reports_analytics', db.constructionMaterials, count.materialId, 'read');
  const delta = count.countedQty - count.systemQty;
  const line = repos.constructionStock.list(g.actor, { limit: 1000 }).items.find((s) => s.materialId === count.materialId && s.warehouseId === count.warehouseId);
  if (line) line.onHand = count.countedQty;
  else if (count.countedQty > 0) db.constructionStock.push({ tenantId: g.actor.tenantId, id: `st-sc-${++mvSeq}`, materialId: count.materialId, warehouseId: count.warehouseId, onHand: count.countedQty, reserved: 0, inTransit: 0 } as unknown as (typeof db.constructionStock)[number]);

  if (delta !== 0) writeMovement(g.actor, 'adjust', count.materialId, Math.abs(delta), { ref: `${count.ref} · ${code.code}` });
  count.status = 'reconciled'; count.reasonCodeId = reasonCodeId; count.note = note; count.approvedBy = nameOf(g.actor);

  recordReason(g.actor, { domain: 'stock_adjust', codeId: reasonCodeId, subjectKind: 'material', subjectRef: count.materialId, note, impactMinor: Math.abs(delta) * (mat?.unitCost.minor ?? 0) });
  audit(g.actor, { action: 'stock_count', entity: 'material', entityRef: mat?.name ?? count.materialId, summary: `${count.ref} reconciled: ${delta >= 0 ? '+' : ''}${delta} ${mat?.unit ?? ''} — ${code.label}`, amountMinor: Math.abs(delta) * (mat?.unitCost.minor ?? 0), before: String(count.systemQty), after: String(count.countedQty), reasonCodeId, note });
  revalidate();
  return { ok: true, ref: `${count.ref} · ${delta >= 0 ? '+' : ''}${delta}` };
}

/* --- approval workflow ------------------------------------------------------ */

let aprSeq = 0;
/** Raise a request onto the route its value and category select. */
export async function raiseApproval(subject: 'purchase_request' | 'variation' | 'timesheet' | 'stock_adjust' | 'budget_override', subjectRef: string, title: string, projectId: string, amountMinor: number, category?: string): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const rule = routeFor(db.constructionApprovalRules, subject, amountMinor, category);
  if (!rule) return { ok: false, error: 'No approval route is configured for this.' };
  const ref = `APR-${1050 + db.constructionApprovals.length + (++aprSeq)}`;
  db.constructionApprovals.unshift({
    tenantId: g.actor.tenantId, id: `apr-new-${aprSeq}`, ref, subject, subjectRef, title, projectId,
    amountMinor, raisedBy: nameOf(g.actor), raisedISO: new Date(Date.parse(NOW)).toISOString(),
    ruleId: rule.id, steps: stepsFromRule(rule), status: 'in_flight',
  } as unknown as (typeof db.constructionApprovals)[number]);
  audit(g.actor, { action: 'issue', entity: 'approval', entityRef: ref, projectId, summary: `Raised for approval on “${rule.name}”`, amountMinor });
  revalidate();
  return { ok: true, ref };
}

/** Approve or reject the step this actor actually owns. Segregation of duties and
 *  the parallel-step rule are enforced in the engine, not the UI. */
export async function decideApproval(requestId: string, decision: 'approved' | 'rejected', comment?: string, reasonCodeId?: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const req = scopedMutableGet(g.actor, 'reports_analytics', db.constructionApprovals, requestId, 'update');
  if (!req) return { ok: false, error: 'Request not found.' };
  const idx = db.constructionApprovals.findIndex((a) => a.id === requestId);
  const check = canApprove(req, g.actor.roles as string[], nameOf(g.actor));
  if (!check.allowed || !check.step) return { ok: false, error: check.reason ?? 'You cannot act on this step.' };
  if (decision === 'rejected') {
    const code = reasonCodeId ? scopedMutableGet(g.actor, 'reports_analytics', db.constructionReasonCodes, reasonCodeId, 'read') : null;
    if (!code) return { ok: false, error: 'A rejection needs a coded reason.' };
    if (code.requiresNote && !comment?.trim()) return { ok: false, error: `“${code.label}” needs a note.` };
  }

  const next = applyDecision(req, check.step.order, check.step.role, decision, nameOf(g.actor), NOW.slice(0, 10), comment);
  db.constructionApprovals[idx] = next as (typeof db.constructionApprovals)[number];

  if (decision === 'rejected' && reasonCodeId) {
    recordReason(g.actor, { domain: 'rejection', codeId: reasonCodeId, subjectKind: req.subject, subjectRef: req.subjectRef, projectId: req.projectId, note: comment, impactMinor: req.amountMinor });
  }
  audit(g.actor, {
    action: decision === 'approved' ? 'approve' : 'reject',
    entity: 'approval', entityRef: req.ref, projectId: req.projectId,
    summary: `${check.step.label} ${decision} — ${req.title}`,
    amountMinor: req.amountMinor, reasonCodeId, note: comment,
    before: 'in_flight', after: next.status,
  });
  revalidate();
  return { ok: true, ref: `${req.ref} · ${next.status === 'in_flight' ? 'advanced' : next.status}` };
}

/** Hand a live step to a named person (PRD §15.3 delegation). */
export async function delegateApproval(requestId: string, toName: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const req = scopedMutableGet(g.actor, 'reports_analytics', db.constructionApprovals, requestId, 'update');
  if (!req) return { ok: false, error: 'Request not found.' };
  if (req.status !== 'in_flight') return { ok: false, error: 'This request is already resolved.' };
  if (!toName.trim()) return { ok: false, error: 'Name the delegate.' };
  const live = pendingSteps(req);
  if (live.length === 0) return { ok: false, error: 'Nothing pending to delegate.' };
  const mine = live.find((s) => (g.actor.roles as string[]).includes(s.role));
  if (!mine) return { ok: false, error: 'You can only delegate a step you hold.' };
  const step = req.steps.find((s) => s.order === mine.order && s.role === mine.role && s.status === 'pending');
  if (step) step.delegatedTo = toName.trim();
  audit(g.actor, { action: 'delegate', entity: 'approval', entityRef: req.ref, projectId: req.projectId, summary: `${mine.label} delegated to ${toName.trim()}`, amountMinor: req.amountMinor });
  revalidate();
  return { ok: true, ref: `${req.ref} → ${toName.trim()}` };
}

/* --- FX revaluation -------------------------------------------------------- */

/**
 * Update the spot rate for a foreign currency. The change is a sensitive action:
 * it revalues every outstanding foreign commitment, so it writes an immutable
 * audit entry AND records a market-price variance event (VAR-PRICE) carrying the
 * NGN swing — which is why that cause shows up, weighted, in the reason Pareto.
 * The reporting currency (NGN) cannot be repriced against itself.
 */
export async function updateFxRate(currency: CurrencyCode, newRate: number): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  if (currency === 'NGN') return { ok: false, error: 'NGN is the reporting currency — it cannot be repriced.' };
  if (!(newRate > 0)) return { ok: false, error: 'Rate must be greater than zero.' };
  const row = repos.constructionFxRates.list(g.actor, { limit: 50 }).items.find((r) => r.currency === currency);
  if (!row) return { ok: false, error: `No ${currency} rate on file.` };
  const oldRate = row.rate;
  if (newRate === oldRate) return { ok: false, error: 'That is already the current rate.' };

  // Revaluation swing = the outstanding foreign book × the rate move (NGN).
  const rows = fxExposure(db.constructionOrders, fxTable(db.constructionFxRates)).filter((r) => r.currency === currency);
  const outstandingForeignMinor = rows.reduce((n, r) => n + r.outstandingForeignMinor, 0);
  const swingMinor = Math.round(outstandingForeignMinor * (newRate - oldRate));

  row.priorRate = oldRate;
  row.rate = newRate;
  row.asOfISO = NOW.slice(0, 10);

  const dir = newRate > oldRate ? 'weakened' : 'strengthened';
  audit(g.actor, {
    action: 'fx_revalue', entity: 'fx_rate', entityRef: currency,
    summary: `${currency} repriced ${oldRate} → ${newRate} — naira ${dir}; outstanding book revalued`,
    amountMinor: Math.abs(swingMinor), before: `₦${oldRate}/${currency}`, after: `₦${newRate}/${currency}`,
  });
  if (swingMinor !== 0) {
    const code = repos.constructionReasonCodes.list(g.actor, { limit: 100 }).items.find((c) => c.code === 'VAR-PRICE');
    if (code) recordReason(g.actor, {
      domain: 'variance', codeId: code.id, subjectKind: 'fx_rate', subjectRef: currency,
      note: `${currency} ${dir} ${oldRate}→${newRate}`, impactMinor: Math.abs(swingMinor),
    });
  }
  revalidate();
  return { ok: true, ref: `${currency} → ₦${newRate}` };
}
