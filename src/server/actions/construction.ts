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
import { money, type Money } from '@/domain/primitives';
import { NOW } from '@/domain/ppm';
import { nextRevision, timesheetCostMinor } from '@/domain/construction';

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

const PATHS = ['/construction', '/construction/evm', '/construction/schedule', '/construction/materials', '/construction/risk', '/construction/procurement', '/construction/site', '/construction/cost', '/construction/projects', '/construction/workforce', '/construction/digest', '/construction/documents', '/construction/boq', '/construction/timesheets'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

async function gate(action: 'update' | 'create'): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  const actor = await getActor();
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
  const r = db.constructionReports.find((x) => x.id === id); if (!r) return { ok: false, error: 'Report not found.' };
  if (r.status !== 'draft' && r.status !== 'returned') return { ok: false, error: 'Only a draft can be submitted.' };
  r.status = 'submitted'; revalidate(); return { ok: true, ref: r.dateISO };
}
export async function reviewReport(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = db.constructionReports.find((x) => x.id === id); if (!r) return { ok: false, error: 'Report not found.' };
  if (r.status !== 'submitted') return { ok: false, error: 'Only a submitted report can be reviewed.' };
  r.status = 'reviewed'; revalidate(); return { ok: true };
}
export async function approveDailyReport(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = db.constructionReports.find((x) => x.id === id); if (!r) return { ok: false, error: 'Report not found.' };
  if (r.status !== 'submitted' && r.status !== 'reviewed') return { ok: false, error: 'Only a submitted/reviewed report can be approved.' };
  // Segregation of duties: the approver may not be the reporting officer.
  const me = nameOf(g.actor).toLowerCase();
  if (me && r.officer.toLowerCase() === me) return { ok: false, error: 'You submitted this report — a different manager must approve it.' };
  r.status = 'approved'; revalidate(); return { ok: true, ref: r.dateISO };
}
export async function returnDailyReport(id: string, reason: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = db.constructionReports.find((x) => x.id === id); if (!r) return { ok: false, error: 'Report not found.' };
  if (!reason?.trim()) return { ok: false, error: 'A return reason is required.' };
  r.status = 'returned'; r.constraints = [...r.constraints, `Returned: ${reason.trim()}`]; revalidate(); return { ok: true };
}

/* --- schedule ------------------------------------------------------------- */
export async function updateTaskProgress(id: string, pct: number): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const t = db.constructionTasks.find((x) => x.id === id); if (!t) return { ok: false, error: 'Task not found.' };
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  t.percentComplete = p; t.status = p === 0 ? 'not_started' : p >= 100 ? 'done' : 'in_progress';
  if (p > 0 && !t.actualStartISO) t.actualStartISO = NOW.slice(0, 10);
  if (p >= 100 && !t.actualFinishISO) t.actualFinishISO = NOW.slice(0, 10);
  revalidate(); return { ok: true, ref: t.name };
}
export async function advanceMilestone(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const m = db.constructionMilestones.find((x) => x.id === id); if (!m) return { ok: false, error: 'Milestone not found.' };
  m.status = 'accepted'; revalidate(); return { ok: true, ref: m.name };
}
let issueSeq = 0;
export async function escalateTaskToIssue(taskId: string): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const t = db.constructionTasks.find((x) => x.id === taskId); if (!t) return { ok: false, error: 'Task not found.' };
  const id = `is-esc-${++issueSeq}`;
  db.constructionIssues.unshift({ tenantId: g.actor.tenantId, id, projectId: t.projectId, category: 'Schedule', title: `Overdue task escalated: ${t.name}`, severity: 'high', owner: t.owner, raisedISO: NOW.slice(0, 10), dueISO: daysISO(NOW, 3), status: 'open', correctiveAction: 'Recovery plan required' } as (typeof db.constructionIssues)[number]);
  revalidate(); return { ok: true, ref: t.name };
}

/* --- procurement (PR → RFQ award → PO → delivery) ------------------------- */
export async function approvePurchaseRequest(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const pr = db.constructionRequests.find((x) => x.id === id); if (!pr) return { ok: false, error: 'Request not found.' };
  if (pr.status !== 'pending' && pr.status !== 'draft') return { ok: false, error: 'Only a pending request can be approved.' };
  pr.status = 'approved'; revalidate(); return { ok: true, ref: pr.ref };
}
let poSeq = 0;
/** Award an RFQ to a vendor: issue a PO from the winning quote and commit budget. */
export async function awardRfq(rfqId: string, vendorId: string): Promise<Res> {
  const g = await gate('create'); if (!g.ok) return g;
  const rfq = db.constructionRfqs.find((x) => x.id === rfqId); if (!rfq) return { ok: false, error: 'RFQ not found.' };
  const q = rfq.quotes.find((x) => x.vendorId === vendorId); if (!q) return { ok: false, error: 'Quote not found.' };
  rfq.status = 'awarded'; rfq.awardedVendorId = vendorId;
  const ref = `PO-${3015 + db.constructionOrders.length + (++poSeq)}`;
  db.constructionOrders.unshift({ tenantId: g.actor.tenantId, id: `po-new-${poSeq}`, ref, projectId: rfq.projectId, vendorId, vendorName: q.vendorName, item: rfq.item, qty: rfq.qty, unit: rfq.unit, costCode: 'MAR-SUP', value: q.price, status: 'issued', issuedISO: NOW.slice(0, 10), expectedISO: daysISO(NOW, q.leadDays), deliveredQty: 0 } as (typeof db.constructionOrders)[number]);
  const req = db.constructionRequests.find((r) => r.ref === rfq.requestRef); if (req) req.status = 'ordered';
  const cc = db.constructionCostCodes.find((c) => c.code === 'MAR-SUP'); if (cc) cc.committed = addMinor(cc.committed, q.price.minor);
  revalidate(); return { ok: true, ref };
}
export async function approvePurchaseOrder(id: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const po = db.constructionOrders.find((x) => x.id === id); if (!po) return { ok: false, error: 'PO not found.' };
  po.status = po.status === 'draft' ? 'approved' : 'issued'; revalidate(); return { ok: true, ref: po.ref };
}
let movSeq = 0;
/** Receive against a PO: advance delivery, book stock AND actual cost. */
export async function receiveDelivery(poId: string, qty: number): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const po = db.constructionOrders.find((x) => x.id === poId); if (!po) return { ok: false, error: 'PO not found.' };
  if (!(qty > 0)) return { ok: false, error: 'Enter a quantity greater than zero.' };
  const recv = Math.min(qty, po.qty - po.deliveredQty);
  po.deliveredQty += recv; po.status = po.deliveredQty >= po.qty ? 'delivered' : 'part_delivered';
  // Book actual cost pro-rata into the cost code.
  const cc = db.constructionCostCodes.find((c) => c.code === po.costCode);
  const bookedMinor = Math.round(po.value.minor * (recv / Math.max(1, po.qty)));
  if (cc) cc.actual = addMinor(cc.actual, bookedMinor);
  // Book stock if we can match the material by name, and log a permanent movement.
  const mat = db.constructionMaterials.find((m) => po.item.toLowerCase().includes(m.name.toLowerCase().slice(0, 6)) || m.name.toLowerCase().includes(po.item.toLowerCase().slice(0, 6)));
  if (mat) {
    const st = db.constructionStock.find((s) => s.materialId === mat.id);
    if (st) { st.onHand += recv; st.inTransit = Math.max(0, st.inTransit - recv); }
    db.constructionMovements.unshift({ tenantId: g.actor.tenantId, id: `sm-new-${++movSeq}`, materialId: mat.id, kind: 'receipt', qty: recv, atISO: NOW.slice(0, 10), projectId: po.projectId, costCode: po.costCode, ref: po.ref, by: nameOf(g.actor) } as (typeof db.constructionMovements)[number]);
  }
  revalidate(); return { ok: true, ref: `${recv} ${po.unit}` };
}

/* --- materials ------------------------------------------------------------ */
export async function issueMaterials(materialId: string, qty: number, projectId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const st = db.constructionStock.find((s) => s.materialId === materialId); if (!st) return { ok: false, error: 'Stock not found.' };
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
  const v = db.constructionVariations.find((x) => x.id === id); if (!v) return { ok: false, error: 'Variation not found.' };
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
  const p = db.constructionProjects.find((x) => x.id === projectId); if (!p) return { ok: false, error: 'Project not found.' };
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
  const prior = db.constructionDocs.find((d) => d.id === docId);
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
  const doc = db.constructionDocs.find((d) => d.id === docId);
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
  const doc = db.constructionDocs.find((d) => d.id === docId);
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
  const r = db.constructionRfis.find((x) => x.id === rfiId);
  if (!r) return { ok: false, error: 'RFI not found.' };
  if (!answer.trim()) return { ok: false, error: 'An answer is required.' };
  r.answer = answer.trim(); r.answeredISO = NOW.slice(0, 10); r.status = 'answered';
  revalidate();
  return { ok: true, ref: r.ref };
}

export async function closeRfi(rfiId: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const r = db.constructionRfis.find((x) => x.id === rfiId);
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
  if (!db.constructionProjects.some((p) => p.id === projectId)) return { ok: false, error: 'Project not found.' };
  if (rows.length === 0) return { ok: false, error: 'Nothing to import.' };

  let created = 0, updated = 0;
  for (const r of rows) {
    const existing = db.constructionCostCodes.find((c) => c.projectId === projectId && c.code === r.code);
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
  const ts = db.constructionTimesheets.find((x) => x.id === id);
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
  const ts = db.constructionTimesheets.find((x) => x.id === id);
  if (!ts) return { ok: false, error: 'Timesheet not found.' };
  if (ts.status === 'approved') return { ok: false, error: 'Already approved and posted.' };
  if (ts.status !== 'submitted') return { ok: false, error: 'Only a submitted timesheet can be approved.' };
  // Segregation of duties: you cannot approve the hours you booked yourself.
  if (ts.submittedBy.toLowerCase() === nameOf(g.actor).toLowerCase()) {
    return { ok: false, error: 'You submitted these hours — a different approver is required.' };
  }
  const worker = db.constructionWorkers.find((w) => w.id === ts.workerId);
  const costMinor = timesheetCostMinor(ts, worker ? worker.dayRate.minor : 0);
  const code = db.constructionCostCodes.find((c) => c.projectId === ts.projectId && c.code === ts.costCode);
  if (!code) return { ok: false, error: `Cost code ${ts.costCode} does not exist on this project.` };

  code.actual = addMinor(code.actual, costMinor);
  ts.status = 'approved'; ts.approvedBy = nameOf(g.actor); ts.approvedISO = NOW.slice(0, 10); ts.postedMinor = costMinor;
  revalidate();
  return { ok: true, ref: `${ts.ref} · ₦${Math.round(costMinor / 100).toLocaleString('en-NG')} posted to ${ts.costCode}` };
}

export async function rejectTimesheet(id: string, reason: string): Promise<Res> {
  const g = await gate('update'); if (!g.ok) return g;
  const ts = db.constructionTimesheets.find((x) => x.id === id);
  if (!ts) return { ok: false, error: 'Timesheet not found.' };
  if (ts.status === 'approved') return { ok: false, error: 'An approved timesheet is already posted — raise an adjustment instead.' };
  if (!reason.trim()) return { ok: false, error: 'A rejection reason is required.' };
  ts.status = 'rejected';
  revalidate();
  return { ok: true, ref: ts.ref };
}
