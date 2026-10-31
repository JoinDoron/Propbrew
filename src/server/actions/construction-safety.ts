'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canEnterWorkspace } from '@/config/workspaces';
import type { SafetyPermit } from '@/domain/construction/types';
import { ForbiddenError, assertCan, type Actor } from '@/lib/authz';
import { scopedConstructionProjectGet, scopedMutableGet } from '@/server/data';
import { withDurableMutation } from '@/server/data/durable-records';
import { nextRecordSequence } from '@/server/data/record-context';
import { db } from '@/server/data/store';
import { pushNotification } from '@/server/data/inbox';
import { getActor } from '@/server/session';
import { operatingDateISO, operatingNowISO } from '@/server/operating-clock';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getCompanyPrincipal } from '@/server/auth/company';
import { rfiProjectMembers } from '@/server/construction/rfi-members';

type Result = { ok: true; ref?: string; message?: string } | { ok: false; error: string };
const id = z.string().trim().min(1).max(200);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
const permitInput = z.object({ projectId: id, type: z.enum(['hot_work', 'height', 'excavation', 'confined_space', 'lifting', 'electrical']), zoneId: id.optional(), location: text(3, 160), supervisor: text(2, 120), validFromISO: date, validToISO: date, controls: z.array(text(3, 240)).min(1).max(20) }).strict();
const talkInput = z.object({ projectId: id, topic: text(3, 200), atISO: date, attendees: z.number().int().min(1).max(5000), deliveredBy: text(2, 120), location: text(3, 160).optional() }).strict();
const correctiveInput = z.object({ ownerUserId: id, dueISO: date, description: text(8, 1000) }).strict();
const allowedRequesters = ['project-director', 'project-manager', 'site-manager', 'construction-hse', 'site-engineer'];
const safetyApprovers = ['project-director', 'project-manager', 'construction-hse'];
const siteActivators = ['project-director', 'project-manager', 'site-manager', 'construction-hse'];

function refresh() {
  for (const path of ['/construction', '/construction/safety', '/construction/copilot', '/construction/audit']) revalidatePath(path);
  revalidatePath('/construction/projects/[projectId]/[section]', 'page');
}
function nameOf(actor: Actor) { return db.users.find((row) => row.id === actor.userId && row.tenantId === actor.tenantId)?.name ?? 'Construction team member'; }
function profileAllowed(actor: Actor, profiles: readonly string[]) {
  const access = actor.companyAccess;
  return !access || access.companyRole === 'owner' || access.companyRole === 'admin' || !access.operationalProfileId || profiles.includes(access.operationalProfileId);
}
async function gate(action: 'create' | 'update'): Promise<{ actor: Actor } | { error: string }> {
  const actor = await getActor();
  if (!actor.tenantId || !canEnterWorkspace(actor, 'construction')) return { error: 'Your account cannot manage Construction safety.' };
  try { assertCan(actor, 'reports_analytics', action); return { actor }; }
  catch (error) { if (error instanceof ForbiddenError) return { error: 'Your Construction role cannot perform this safety action.' }; throw error; }
}
function audit(actor: Actor, action: 'issue' | 'approve' | 'reject' | 'override', entity: string, ref: string, projectId: string, summary: string) {
  const seq = nextRecordSequence('construction:auditSeq', db.constructionAudit.reduce((max, row) => Math.max(max, row.seq), 0), true);
  db.constructionAudit.unshift({ tenantId: actor.tenantId!, id: `ca-${randomUUID()}`, seq, atISO: operatingNowISO(), actorId: actor.userId, actorName: nameOf(actor), actorRole: String(actor.roles[0] ?? 'operator'), action, entity, entityRef: ref, projectId, summary } as (typeof db.constructionAudit)[number]);
}
function permitFor(actor: Actor, permitId: string) { return scopedMutableGet(actor, 'reports_analytics', db.constructionSafetyPermits, permitId, 'update'); }
function eventFor(actor: Actor, eventId: string) { return scopedMutableGet(actor, 'reports_analytics', db.constructionSafetyEvents, eventId, 'update'); }
async function projectMembers(actor: Actor, projectId: string) {
  if (!nativeAuthEnabled()) return [{ userId: actor.userId, name: nameOf(actor), canRespond: true, profileId: null }];
  const principal = await getCompanyPrincipal();
  return principal?.company.id === actor.tenantId ? rfiProjectMembers(principal, projectId) : [];
}

export async function requestSafetyPermit(input: z.input<typeof permitInput>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('create'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor;
    if (!profileAllowed(actor, allowedRequesters)) return { ok: false, error: 'Your Construction profile cannot request a permit.' };
    const parsed = permitInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter a project, work type, location, supervisor, validity dates and at least one control.' };
    const data = parsed.data;
    if (data.validFromISO < operatingDateISO() || data.validToISO < data.validFromISO) return { ok: false, error: 'Permit validity must start today or later and end after it starts.' };
    const project = scopedConstructionProjectGet(actor, data.projectId, 'create');
    if (!project || !['planning', 'active', 'closing'].includes(project.status)) return { ok: false, error: 'That project cannot receive a permit.' };
    if (data.zoneId && !db.constructionZones.some((row) => row.id === data.zoneId && row.projectId === project.id && row.tenantId === actor.tenantId)) return { ok: false, error: 'Choose a zone in this project.' };
    const number = nextRecordSequence('construction:permitSeq', db.constructionSafetyPermits.filter((row) => row.tenantId === actor.tenantId).reduce((max, row) => Math.max(max, Number(row.ref.match(/\d+$/)?.[0] ?? 0)), 0), true);
    const permit: SafetyPermit = { tenantId: actor.tenantId! as SafetyPermit['tenantId'], id: `sp-${randomUUID()}`, ref: `PTW-${String(number).padStart(4, '0')}`, ...data, requestedBy: nameOf(actor), requestedById: actor.userId, requestedAtISO: operatingNowISO(), status: 'requested' };
    db.constructionSafetyPermits.unshift(permit);
    audit(actor, 'issue', 'safety_permit', permit.ref, project.id, `Requested ${permit.type} permit at ${permit.location}`);
    refresh(); return { ok: true, ref: permit.ref };
  }, 'construction');
}

export async function decideSafetyPermit(permitId: string, decision: 'approved' | 'rejected', note = ''): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor;
    if (!profileAllowed(actor, safetyApprovers)) return { ok: false, error: 'Only an assigned HSE or project manager can decide a permit.' };
    const permit = permitFor(actor, permitId);
    if (!permit || permit.status !== 'requested') return { ok: false, error: 'A requested permit in your project is required.' };
    if (permit.requestedById ? permit.requestedById === actor.userId : permit.requestedBy.toLowerCase() === nameOf(actor).toLowerCase()) return { ok: false, error: 'A different authorised person must review this permit.' };
    const reviewNote = note.trim();
    if (decision === 'rejected' && reviewNote.length < 8) return { ok: false, error: 'Record why this permit was rejected.' };
    if (decision === 'approved') {
      if (permit.validToISO < operatingDateISO()) return { ok: false, error: 'This permit has expired. Request a new validity window.' };
      const overlap = db.constructionSafetyPermits.some((row) => row.id !== permit.id && row.tenantId === actor.tenantId && row.projectId === permit.projectId && ['approved', 'active'].includes(row.status) && row.validToISO >= operatingDateISO() && row.location.trim().toLowerCase() === permit.location.trim().toLowerCase() && row.validFromISO <= permit.validToISO && permit.validFromISO <= row.validToISO);
      if (overlap && reviewNote.length < 15) return { ok: false, error: 'Record the site coordination controls for overlapping permits before approval.' };
    }
    permit.status = decision; permit.reviewedById = actor.userId; permit.reviewedAtISO = operatingNowISO(); permit.reviewNote = reviewNote || undefined;
    audit(actor, decision === 'approved' ? 'approve' : 'reject', 'safety_permit', permit.ref, permit.projectId, `${decision === 'approved' ? 'Approved' : 'Rejected'} permit${reviewNote ? `: ${reviewNote}` : ''}`);
    refresh(); return { ok: true, ref: permit.ref };
  }, 'construction');
}

export async function activateSafetyPermit(permitId: string, controlsConfirmed: boolean, note: string): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor;
    if (!profileAllowed(actor, siteActivators)) return { ok: false, error: 'Only the assigned site or HSE manager can activate a permit.' };
    const permit = permitFor(actor, permitId);
    if (!permit || permit.status !== 'approved') return { ok: false, error: 'An approved permit in your project is required.' };
    const today = operatingDateISO();
    if (today < permit.validFromISO || today > permit.validToISO) return { ok: false, error: 'The permit can be activated only within its approved validity window.' };
    if (!controlsConfirmed || note.trim().length < 8) return { ok: false, error: 'Confirm the site controls and record the activation check.' };
    permit.status = 'active'; permit.activatedById = actor.userId; permit.activatedAtISO = operatingNowISO(); permit.activationNote = note.trim().slice(0, 500);
    audit(actor, 'approve', 'safety_permit', permit.ref, permit.projectId, `Activated permit after controls check: ${permit.activationNote}`);
    refresh(); return { ok: true, ref: permit.ref };
  }, 'construction');
}

export async function closeSafetyPermit(permitId: string, note: string): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor;
    if (!profileAllowed(actor, siteActivators)) return { ok: false, error: 'Only the assigned site or HSE manager can close a permit.' };
    const permit = permitFor(actor, permitId);
    if (!permit || !['approved', 'active'].includes(permit.status)) return { ok: false, error: 'An approved or active permit in your project is required.' };
    if (note.trim().length < 8) return { ok: false, error: 'Record the work completion or withdrawal reason.' };
    permit.status = 'closed'; permit.closedById = actor.userId; permit.closedAtISO = operatingNowISO(); permit.closureNote = note.trim().slice(0, 500);
    audit(actor, 'override', 'safety_permit', permit.ref, permit.projectId, `Closed permit: ${permit.closureNote}`);
    refresh(); return { ok: true, ref: permit.ref };
  }, 'construction');
}

export async function recordToolboxTalk(input: z.input<typeof talkInput>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('create'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor;
    if (!profileAllowed(actor, allowedRequesters)) return { ok: false, error: 'Your Construction profile cannot record a toolbox talk.' };
    const parsed = talkInput.safeParse(input);
    if (!parsed.success || parsed.data.atISO > operatingDateISO()) return { ok: false, error: 'Enter a past or current talk date, topic, facilitator and attendance count.' };
    const project = scopedConstructionProjectGet(actor, parsed.data.projectId, 'create');
    if (!project) return { ok: false, error: 'Project not found.' };
    const talk = { tenantId: actor.tenantId! as SafetyPermit['tenantId'], id: `tb-${randomUUID()}`, ...parsed.data, recordedById: actor.userId, recordedAtISO: operatingNowISO() };
    db.constructionToolboxTalks.unshift(talk);
    audit(actor, 'issue', 'toolbox_talk', talk.id, project.id, `Recorded ${talk.topic} for ${talk.attendees} attendees`);
    refresh(); return { ok: true, ref: talk.topic };
  }, 'construction');
}

export async function assignSafetyCorrectiveAction(eventId: string, input: z.input<typeof correctiveInput>): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor;
    if (!profileAllowed(actor, safetyApprovers.concat('site-manager'))) return { ok: false, error: 'Only an assigned HSE or site manager can assign corrective work.' };
    const parsed = correctiveInput.safeParse(input);
    if (!parsed.success || parsed.data.dueISO < operatingDateISO()) return { ok: false, error: 'Choose an assigned member, a current or future due date and corrective work.' };
    const event = eventFor(actor, eventId);
    if (!event || event.closed || event.corrective) return { ok: false, error: 'An open safety event without assigned corrective work is required.' };
    const member = (await projectMembers(actor, event.projectId)).find((row) => row.userId === parsed.data.ownerUserId && (row.canRespond || row.profileId === 'construction-field-worker') && row.profileId !== 'client-investor');
    if (!member) return { ok: false, error: 'Assign an active member of this construction project.' };
    event.corrective = { ...parsed.data, ownerName: member.name, status: 'assigned', assignedById: actor.userId, assignedAtISO: operatingNowISO() };
    event.action = parsed.data.description;
    audit(actor, 'issue', 'safety_corrective_action', event.id, event.projectId, `Assigned corrective work to ${member.name}; due ${parsed.data.dueISO}`);
    if (member.userId !== actor.userId) pushNotification(member.userId, ['estate_manager'], { title: 'Safety corrective work assigned', body: `${event.title} · due ${parsed.data.dueISO}`, kind: 'warn', href: `/construction/safety?projectId=${encodeURIComponent(event.projectId)}` });
    refresh(); return { ok: true, ref: event.title };
  }, 'construction');
}

export async function startSafetyCorrectiveAction(eventId: string): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor; const event = eventFor(actor, eventId); const work = event?.corrective;
    if (!event || !work || work.ownerUserId !== actor.userId || !['assigned', 'returned'].includes(work.status)) return { ok: false, error: 'Only the assigned owner can start this corrective work.' };
    work.status = 'in_progress'; work.startedAtISO = operatingNowISO();
    audit(actor, 'override', 'safety_corrective_action', event.id, event.projectId, 'Started corrective work');
    refresh(); return { ok: true, ref: event.title };
  }, 'construction');
}

export async function submitSafetyCorrectiveAction(eventId: string, evidenceReference: string, completionNote: string): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor; const event = eventFor(actor, eventId); const work = event?.corrective;
    if (!event || !work || work.ownerUserId !== actor.userId || work.status !== 'in_progress') return { ok: false, error: 'Start assigned corrective work before submitting it.' };
    if (evidenceReference.trim().length < 3 || completionNote.trim().length < 8) return { ok: false, error: 'Provide an evidence reference and describe the completed correction.' };
    work.status = 'awaiting_review'; work.evidenceReference = evidenceReference.trim().slice(0, 200); work.completionNote = completionNote.trim().slice(0, 1000); work.submittedById = actor.userId; work.submittedAtISO = operatingNowISO();
    audit(actor, 'issue', 'safety_corrective_action', event.id, event.projectId, `Submitted corrective evidence ${work.evidenceReference}`);
    refresh(); return { ok: true, ref: event.title };
  }, 'construction');
}

export async function reviewSafetyCorrectiveAction(eventId: string, decision: 'verified' | 'returned', note: string): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor;
    if (!profileAllowed(actor, safetyApprovers)) return { ok: false, error: 'Only an assigned HSE or project manager can verify corrective work.' };
    const event = eventFor(actor, eventId); const work = event?.corrective;
    if (!event || !work || work.status !== 'awaiting_review') return { ok: false, error: 'Corrective evidence awaiting review is required.' };
    if (work.submittedById === actor.userId || work.ownerUserId === actor.userId) return { ok: false, error: 'A different HSE or project manager must verify this work.' };
    if (note.trim().length < 8) return { ok: false, error: 'Record the verification finding or return reason.' };
    work.status = decision; work.reviewedById = actor.userId; work.reviewedAtISO = operatingNowISO(); work.reviewNote = note.trim().slice(0, 1000);
    if (decision === 'verified') event.closed = true;
    audit(actor, decision === 'verified' ? 'approve' : 'reject', 'safety_corrective_action', event.id, event.projectId, `${decision === 'verified' ? 'Verified' : 'Returned'} corrective work: ${work.reviewNote}`);
    if (decision === 'returned') pushNotification(work.ownerUserId, ['estate_manager'], { title: 'Safety correction returned', body: `${event.title} · ${work.reviewNote}`, kind: 'warn', href: `/construction/safety?projectId=${encodeURIComponent(event.projectId)}` });
    refresh(); return { ok: true, ref: event.title };
  }, 'construction');
}

export async function escalateOverdueSafetyAction(eventId: string, note: string): Promise<Result> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!('actor' in access)) return { ok: false, error: access.error };
    const actor = access.actor;
    if (!profileAllowed(actor, safetyApprovers.concat('site-manager'))) return { ok: false, error: 'Only an assigned HSE or site manager can escalate overdue work.' };
    const event = eventFor(actor, eventId); const work = event?.corrective;
    if (!event || !work || work.status === 'verified' || work.dueISO >= operatingDateISO() || work.escalatedAtISO) return { ok: false, error: 'An un-escalated overdue corrective action is required.' };
    if (note.trim().length < 8) return { ok: false, error: 'Record why this overdue correction needs escalation.' };
    const recipients = (await projectMembers(actor, event.projectId)).filter((row) => row.userId !== actor.userId && ['project-director', 'project-manager', 'construction-hse'].includes(row.profileId ?? ''));
    work.escalatedAtISO = operatingNowISO(); work.escalatedById = actor.userId; work.escalationNote = note.trim().slice(0, 500);
    for (const member of recipients) pushNotification(member.userId, ['estate_manager'], { title: 'Overdue site safety correction', body: `${event.title} · due ${work.dueISO} · ${work.escalationNote}`, kind: 'danger', href: `/construction/safety?projectId=${encodeURIComponent(event.projectId)}` });
    audit(actor, 'override', 'safety_corrective_action', event.id, event.projectId, `Escalated overdue correction; ${recipients.length} project leader(s) notified: ${work.escalationNote}`);
    refresh(); return { ok: true, ref: event.title, message: recipients.length ? 'Escalated to assigned project leaders.' : 'Escalation recorded. Assign a project leader in Team & access to receive alerts.' };
  }, 'construction');
}
