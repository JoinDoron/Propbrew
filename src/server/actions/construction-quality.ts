'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCan, ForbiddenError, type Actor } from '@/lib/authz';
import { canEnterWorkspace } from '@/config/workspaces';
import type { Issue, QualityChecklistResult, QualityInspectionVisit } from '@/domain/construction/types';
import { getActor } from '@/server/session';
import { db } from '@/server/data/store';
import { scopedConstructionProjectGet } from '@/server/data';
import { withDurableMutation } from '@/server/data/durable-records';
import { operatingDateISO, operatingNowISO } from '@/server/operating-clock';
import { canRecordQualitySignOff, qualityIssueVisible } from '@/server/construction/quality-access';
import { resolveQualityPhotos } from '@/server/construction/quality-photos';
import { rfiPackageAllowed } from '@/server/construction/rfi-access';
import type { Res } from './construction';

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const date = z.iso.date();
const timeWAT = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const photoIds = z.array(z.uuid()).max(12);
const appointment = z.object({ dateISO: date, timeWAT, inspector: text(2, 120) }).strict();
const scheduleSchema = z.object({
  projectId: text(1, 200), title: text(4, 180), location: text(2, 160),
  owner: text(2, 100), authority: text(2, 160), dueISO: date,
  workPackageId: text(1, 200).optional(),
  checklist: z.array(text(4, 180)).min(1).max(25),
  appointment,
}).strict();
const resultsSchema = z.object({
  visitId: text(1, 100), notes: text(0, 1000),
  results: z.array(z.object({
    itemId: text(1, 100), result: z.enum(['pass', 'fail', 'not_applicable']),
    finding: text(0, 1000).optional(), photoIds,
  }).strict()).min(1).max(25),
}).strict();
const remediationSchema = z.object({ description: text(8, 1000), photoIds: photoIds.min(1), owner: text(2, 100), dueISO: date }).strict();
const signOffSchema = z.object({ signer: text(2, 120), role: text(2, 100), reference: text(3, 160), decision: text(8, 1000) }).strict();

async function gate(action: 'create' | 'update'): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  const actor = await getActor();
  if (!canEnterWorkspace(actor, 'construction')) return { ok: false, error: 'Your account cannot access Construction.' };
  try { assertCan(actor, 'reports_analytics', action); return { ok: true, actor }; }
  catch (error) { if (error instanceof ForbiddenError) return { ok: false, error: 'Your Construction role cannot change quality records.' }; throw error; }
}
function issueFor(actor: Actor, id: string, action: 'read' | 'update' = 'update'): Issue | null {
  const issue = db.constructionIssues.find((row) => row.id === id && row.tenantId === actor.tenantId);
  return issue && qualityIssueVisible(actor, issue, action) ? issue : null;
}
function audit(actor: Actor, issue: Issue, action: 'record' | 'resolve', summary: string, before?: string, after?: string) {
  const seq = db.constructionAudit.length + 1;
  db.constructionAudit.push({ tenantId: actor.tenantId, id: `au-quality-${randomUUID()}`, seq, atISO: operatingNowISO(), actorId: actor.userId, actorName: db.users.find((row) => row.id === actor.userId)?.name ?? 'Site team', actorRole: actor.roles[0] ?? 'unknown', action, entity: 'construction_quality', entityRef: issue.id, projectId: issue.projectId, summary, before, after } as (typeof db.constructionAudit)[number]);
}
function refresh() { revalidatePath('/construction/quality'); revalidatePath('/construction/projects'); revalidatePath('/construction/audit'); }
function lastVisit(issue: Issue): QualityInspectionVisit | undefined { return issue.inspection?.visits.at(-1); }
function latestResults(issue: Issue): QualityChecklistResult[] { return lastVisit(issue)?.results ?? []; }
function allClear(issue: Issue): boolean {
  const latest = latestResults(issue);
  return Boolean(issue.inspection && latest.length === issue.inspection.checklist.length && latest.every((row) => row.result !== 'fail'));
}
function linkedPunchItems(issue: Issue): Issue[] {
  return db.constructionIssues.filter((row) => row.tenantId === issue.tenantId && row.projectId === issue.projectId && row.inspectionId === issue.id && row.category === 'Punch list');
}

export async function scheduleConstructionInspection(input: z.input<typeof scheduleSchema>): Promise<Res> {
  return withDurableMutation(async () => {
    const g = await gate('create'); if (!g.ok) return g;
    const parsed = scheduleSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter the appointment, authority and every checklist item.' };
    const data = parsed.data;
    const project = scopedConstructionProjectGet(g.actor, data.projectId, 'create');
    if (!project || !rfiPackageAllowed(g.actor, project, data.workPackageId)) return { ok: false, error: 'This project or work package is unavailable.' };
    if (data.appointment.dateISO < operatingDateISO() || data.dueISO < data.appointment.dateISO) return { ok: false, error: 'The appointment must be today or later, and the correction deadline cannot precede it.' };
    if (new Set(data.checklist.map((label) => label.toLocaleLowerCase())).size !== data.checklist.length) return { ok: false, error: 'Checklist items must be distinct.' };
    const id = `is-inspection-${randomUUID()}`;
    const issue: Issue = {
      tenantId: g.actor.tenantId as Issue['tenantId'], id, projectId: project.id, category: 'Authority inspection', title: data.title,
      severity: 'medium', owner: data.owner, raisedISO: operatingDateISO(), dueISO: data.dueISO, status: 'open',
      location: data.location, authority: data.authority, workPackageId: data.workPackageId,
      inspection: { checklist: data.checklist.map((label) => ({ id: randomUUID(), label })), visits: [{ id: randomUUID(), kind: 'initial', ...data.appointment, scheduledBy: g.actor.userId, scheduledAtISO: operatingNowISO() }] },
    };
    db.constructionIssues.unshift(issue);
    audit(g.actor, issue, 'record', `Authority inspection scheduled: ${issue.title}`);
    refresh(); return { ok: true, ref: id };
  }, 'construction');
}

export async function recordConstructionInspectionVisit(id: string, input: z.input<typeof resultsSchema>): Promise<Res> {
  return withDurableMutation(async () => {
    const g = await gate('update'); if (!g.ok) return g;
    const parsed = resultsSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Complete the checklist and describe every failed item.' };
    const issue = issueFor(g.actor, id);
    const visit = issue && lastVisit(issue);
    if (!issue?.inspection || !visit || issue.status === 'resolved' || visit.id !== parsed.data.visitId || visit.recordedAtISO) return { ok: false, error: 'This scheduled inspection is unavailable or already recorded.' };
    if (visit.dateISO > operatingDateISO()) return { ok: false, error: 'Record the inspection on or after its appointment date.' };
    const checklistIds = new Set(issue.inspection.checklist.map((item) => item.id));
    const results = parsed.data.results;
    if (results.length !== checklistIds.size || new Set(results.map((row) => row.itemId)).size !== checklistIds.size || results.some((row) => !checklistIds.has(row.itemId))) return { ok: false, error: 'Record one result for every checklist item.' };
    for (const row of results) {
      if (row.result === 'fail' && (!row.finding || row.finding.length < 8 || !row.photoIds.length)) return { ok: false, error: 'Each failed item needs a finding and at least one stored photo.' };
      if (row.result !== 'fail' && row.finding) return { ok: false, error: 'Only failed items can carry a finding.' };
      if (row.photoIds.length && !resolveQualityPhotos(g.actor, issue.id, row.photoIds)) return { ok: false, error: 'A photo is missing or belongs to another project or quality record.' };
    }
    if (visit.kind === 'reinspection') {
      const failedPreviously = new Set(issue.inspection.checklist.filter((item) => item.punchIssueId).map((item) => item.id));
      if ([...failedPreviously].some((itemId) => !results.some((row) => row.itemId === itemId && row.photoIds.length))) return { ok: false, error: 'Photograph every previously failed item at reinspection.' };
    }
    visit.results = results.map((row) => ({ ...row, photoIds: [...row.photoIds] }));
    visit.notes = parsed.data.notes; visit.recordedBy = g.actor.userId; visit.recordedAtISO = operatingNowISO();
    for (const result of results.filter((row) => row.result === 'fail')) {
      const line = issue.inspection.checklist.find((row) => row.id === result.itemId)!;
      const existing = line.punchIssueId ? linkedPunchItems(issue).find((row) => row.id === line.punchIssueId) : undefined;
      if (existing) {
        existing.status = 'in_progress'; existing.correctiveAction = result.finding; existing.photoIds = [...new Set([...(existing.photoIds ?? []), ...result.photoIds])]; existing.remediation = undefined;
        audit(g.actor, existing, 'record', `Reinspection finding: ${line.label}`, 'in_progress', 'in_progress');
      } else {
        const punch: Issue = { tenantId: issue.tenantId, id: `is-punch-${randomUUID()}`, projectId: issue.projectId, category: 'Punch list', title: `${issue.title}: ${line.label}`.slice(0, 180), severity: issue.severity, owner: issue.owner, raisedISO: operatingDateISO(), dueISO: issue.dueISO, status: 'open', location: issue.location, authority: issue.authority, workPackageId: issue.workPackageId, inspectionId: issue.id, checklistItemId: line.id, correctiveAction: result.finding, photoIds: [...result.photoIds] };
        db.constructionIssues.unshift(punch); line.punchIssueId = punch.id;
        audit(g.actor, punch, 'record', `Inspection finding created punch item: ${line.label}`);
      }
    }
    audit(g.actor, issue, 'record', `${visit.kind === 'initial' ? 'Inspection' : 'Reinspection'} results recorded: ${issue.title}`, 'scheduled', results.some((row) => row.result === 'fail') ? 'findings' : 'clear');
    refresh(); return { ok: true, ref: issue.id };
  }, 'construction');
}

export async function recordConstructionCorrectiveWork(id: string, input: z.input<typeof remediationSchema>): Promise<Res> {
  return withDurableMutation(async () => {
    const g = await gate('update'); if (!g.ok) return g;
    const parsed = remediationSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Assign the corrective work and attach at least one stored photo.' };
    const issue = issueFor(g.actor, id);
    if (!issue || issue.category !== 'Punch list' || issue.status === 'resolved') return { ok: false, error: 'Punch item unavailable.' };
    if (!resolveQualityPhotos(g.actor, issue.id, parsed.data.photoIds)) return { ok: false, error: 'A corrective photo is missing or belongs to another record.' };
    if (parsed.data.dueISO < operatingDateISO()) return { ok: false, error: 'Choose a current or future correction deadline.' };
    const before = issue.status;
    issue.owner = parsed.data.owner; issue.dueISO = parsed.data.dueISO; issue.status = 'in_progress';
    issue.remediation = { description: parsed.data.description, photoIds: [...parsed.data.photoIds], submittedBy: g.actor.userId, submittedAtISO: operatingNowISO() };
    issue.correctiveAction = parsed.data.description;
    audit(g.actor, issue, 'record', `Corrective work submitted: ${issue.title}`, before, issue.status);
    refresh(); return { ok: true, ref: issue.id };
  }, 'construction');
}

export async function scheduleConstructionReinspection(id: string, input: z.input<typeof appointment>): Promise<Res> {
  return withDurableMutation(async () => {
    const g = await gate('update'); if (!g.ok) return g;
    const parsed = appointment.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter a valid reinspection appointment.' };
    const issue = issueFor(g.actor, id); const latest = issue && lastVisit(issue);
    if (!issue?.inspection || issue.status === 'resolved' || !latest?.recordedAtISO || !latest.results?.some((row) => row.result === 'fail')) return { ok: false, error: 'A recorded inspection with open findings is required.' };
    if (parsed.data.dateISO < operatingDateISO()) return { ok: false, error: 'The reinspection must be today or later.' };
    const punches = linkedPunchItems(issue);
    if (!punches.length || punches.some((row) => !row.remediation?.photoIds.length)) return { ok: false, error: 'Submit corrective work and photos for every open finding first.' };
    issue.inspection.visits.push({ id: randomUUID(), kind: 'reinspection', ...parsed.data, scheduledBy: g.actor.userId, scheduledAtISO: operatingNowISO() });
    audit(g.actor, issue, 'record', `Reinspection scheduled: ${issue.title}`);
    refresh(); return { ok: true, ref: issue.id };
  }, 'construction');
}

export async function signOffConstructionQuality(id: string, input: z.input<typeof signOffSchema>): Promise<Res> {
  return withDurableMutation(async () => {
    const actor = await getActor();
    if (!canEnterWorkspace(actor, 'construction') || !canRecordQualitySignOff(actor)) return { ok: false, error: 'Project management or consultant sign-off authority is required.' };
    try { assertCan(actor, 'reports_analytics', actor.companyAccess?.operationalProfileId === 'consultant-approver' ? 'approve' : 'update'); }
    catch { return { ok: false, error: 'Your Construction role cannot sign off this quality record.' }; }
    const parsed = signOffSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Record the signer, their role, approval reference and decision.' };
    const issue = issueFor(actor, id, actor.companyAccess?.operationalProfileId === 'consultant-approver' ? 'read' : 'update');
    if (!issue || issue.status === 'resolved' || !['Authority inspection', 'Punch list'].includes(issue.category)) return { ok: false, error: 'Quality record unavailable.' };
    if (issue.category === 'Authority inspection') {
      if (!issue.inspection || !allClear(issue) || !lastVisit(issue)?.recordedAtISO) return { ok: false, error: 'Complete the checklist and clear every finding before sign-off.' };
      if (linkedPunchItems(issue).some((row) => !row.remediation?.photoIds.length)) return { ok: false, error: 'Corrective work is missing for a punch item.' };
      issue.inspection.signOff = { ...parsed.data, recordedBy: actor.userId, recordedAtISO: operatingNowISO() };
      for (const punch of linkedPunchItems(issue)) { punch.status = 'resolved'; punch.closedISO = operatingDateISO(); audit(actor, punch, 'resolve', `Inspection sign-off closed punch item: ${punch.title}`, 'in_progress', 'resolved'); }
    } else {
      if (issue.inspectionId) return { ok: false, error: 'This finding closes with its parent inspection sign-off.' };
      if (!issue.remediation?.photoIds.length) return { ok: false, error: 'Submit corrective work and photos before sign-off.' };
      issue.inspection = { checklist: [], visits: [], signOff: { ...parsed.data, recordedBy: actor.userId, recordedAtISO: operatingNowISO() } };
    }
    const before = issue.status; issue.status = 'resolved'; issue.closedISO = operatingDateISO();
    audit(actor, issue, 'resolve', `Recorded sign-off: ${issue.title} · ${parsed.data.reference}`, before, 'resolved');
    refresh(); return { ok: true, ref: issue.id };
  }, 'construction');
}
