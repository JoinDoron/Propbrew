'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { PpmPlan } from '@/domain/entities';
import type { AssetRuntime, PpmOccurrence } from '@/domain/ppm';
import { advanceMaintenanceAfterService, facilityMaintenanceState, maintenanceAsset, maintenanceBasis, maintenanceCycleDate, maintenanceDate, maintenanceFrequency, maintenancePlanOccurrence, maintenancePlanMatchesMetadata, maintenanceMetadataForPlan, maintenanceText, metadataBindingValid, processDueFacilityMaintenance, type MaintenancePlanMetadata } from '@/domain/facility/maintenance';
import { assertCan, matchesScope, type Action, type Actor } from '@/lib/authz';
import { currentRecordContext } from '@/server/data/record-context';
import { withDurableMutation } from '@/server/data/durable-records';
import { recordHistory } from '@/server/data/store';
import { getActor } from '@/server/session';
import { operatingClock } from '@/server/operating-clock';
import { resolveFacilityEvidence } from '@/server/facility/evidence';

export type MaintenanceSetupResult = { ok: true; id?: string; message: string; ref?: string } | { ok: false; error: string };
const scopeFields = { expectedCompanyId: z.string().min(1).max(160), expectedSiteId: z.string().min(1).max(160), expectedUnitId: z.string().min(1).max(160).nullable(), assetId: z.string().min(1).max(160) };
const hours = z.number().finite().min(0).max(100_000_000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001, 'Use at most two decimal places.');
const configuration = { title: maintenanceText, frequency: maintenanceFrequency, every: z.number().int().min(1).max(12), basis: maintenanceBasis,
  firstDue: maintenanceDate, leadTimeDays: z.number().int().min(0).max(90), estimatedHours: z.number().finite().positive().max(1000),
  runtimeIntervalHours: hours.nullable(), checklist: z.array(z.strictObject({ label: maintenanceText, requiresPhoto: z.boolean() })).min(1).max(50), evidenceRequired: z.boolean(), autoGenerate: z.boolean() };
const createSchema = z.strictObject({ ...scopeFields, ...configuration, idempotencyKey: z.uuid() });
const editSchema = z.strictObject({ ...scopeFields, ...configuration, planId: z.string().min(1).max(160), expectedVersion: z.number().int().min(0) });
const refresh = () => ['/ppm', '/assets', '/facility', '/work-orders', '/portfolio'].forEach((path) => revalidatePath(path));
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function openOccurrences(context: NonNullable<ReturnType<typeof currentRecordContext>>, tenantId: string, planId: string) {
  const data = facilityMaintenanceState(context.state, tenantId);
  return (context.state.collections.ppmOccurrences as PpmOccurrence[]).filter((row) => row.tenantId === tenantId && String(row.planId) === planId && row.status !== 'completed' && !data.archivedOccurrenceIds.includes(row.id));
}
function archiveUnlinkedOccurrences(context: NonNullable<ReturnType<typeof currentRecordContext>>, tenantId: string, planId: string) {
  const data = facilityMaintenanceState(context.state, tenantId);
  for (const row of openOccurrences(context, tenantId, planId)) if (!row.workOrderRef) data.archivedOccurrenceIds.push(row.id);
}
function checked(actor: Actor, binding: z.infer<typeof createSchema> | { expectedCompanyId: string; expectedSiteId: string; expectedUnitId: string | null; assetId: string }, action: Action) {
  const context = currentRecordContext();
  if (!context || context.mode !== 'write' || !actor.tenantId || context.domainTenantId !== actor.tenantId || binding.expectedCompanyId !== actor.tenantId) throw new Error('Your company changed. Reopen Maintenance before saving.');
  const scope = assertCan(actor, 'assets_ppm', action), asset = maintenanceAsset(context.state, actor.tenantId, binding.assetId);
  if (!asset || !matchesScope(asset, scope) || String(asset.siteId) !== binding.expectedSiteId || (asset.unitId ? String(asset.unitId) : null) !== binding.expectedUnitId
    || !metadataBindingValid(context.state, actor.tenantId, { assetId: binding.assetId, siteId: binding.expectedSiteId, unitId: binding.expectedUnitId } as MaintenancePlanMetadata)) throw new Error('The asset or location changed. Reopen Maintenance and choose an available asset.');
  return { context, scope, asset, tenantId: actor.tenantId, data: facilityMaintenanceState(context.state, actor.tenantId, true) };
}
function attributed(actor: Actor) { return { id: actor.userId, name: currentRecordContext()?.companyPrincipal?.user.name ?? 'Facility manager', role: 'facility_manager', at: operatingClock().iso }; }
function receipt(data: ReturnType<typeof facilityMaintenanceState>, actor: Actor, key: string, kind: string, hash: string) {
  const prior = data.receipts.find((row) => row.actorId === actor.userId && row.key === key);
  if (prior && (prior.hash !== hash || prior.kind !== kind)) throw new Error('This submission key was used for different details. Start a new form.');
  return prior;
}
function failure(error: unknown): MaintenanceSetupResult {
  const message = error instanceof Error ? error.message : '';
  return { ok: false, error: /^(Your company|The asset|This submission|This maintenance|Complete the|Finish the|Record a|Select the|Only stored|A service|The service|Runtime|Pause the|The first|The checklist)/.test(message) ? message : 'This maintenance change could not be saved. Check your access and form details.' };
}
function validateConfiguration(input: z.infer<typeof createSchema> | z.infer<typeof editSchema>) {
  if (input.basis !== 'calendar' && (!input.runtimeIntervalHours || input.runtimeIntervalHours <= 0)) throw new Error('Runtime-based plans need a positive service interval.');
  if (new Set(input.checklist.map((item) => item.label.toLowerCase())).size !== input.checklist.length) throw new Error('The checklist must use distinct service items.');
}
export async function createFacilityMaintenancePlan(input: unknown): Promise<MaintenanceSetupResult> {
  return withDurableMutation(async () => {
    const parsed = createSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Review the asset, cadence, first due date, service interval and checklist.' };
    try {
      const actor = await getActor(), value = parsed.data;
      const { context, tenantId, asset, data } = checked(actor, value, 'create'); validateConfiguration(value);
      const hash = digest(value), prior = receipt(data, actor, value.idempotencyKey, 'plan.create', hash);
      if (prior) return { ok: true, id: prior.resultId, message: 'This maintenance plan was already created.' };
      if (data.plans.length >= 2000) return { ok: false, error: 'This company has reached its 2,000 maintenance-plan limit.' };
      const clock = operatingClock(), id = `ppm-${randomUUID()}`;
      const feed = (context.state.collections.assetRuntime as AssetRuntime[]).find((row) => row.tenantId === tenantId && String(row.assetId) === value.assetId);
      const plan = { tenantId, id, assetId: asset.id, assetName: asset.name, category: asset.category, siteId: asset.siteId, buildingId: asset.buildingId, frequency: value.frequency, basis: value.basis,
        nextDue: value.firstDue, overdue: value.firstDue < clock.dateISO, leadTimeDays: value.leadTimeDays, runtimeIntervalHours: value.basis === 'calendar' ? undefined : value.runtimeIntervalHours!,
        checklist: value.checklist.map((item) => ({ ...item, id: randomUUID() })), checklistItems: value.checklist.length, evidenceRequired: value.evidenceRequired || value.checklist.some((item) => item.requiresPhoto),
        lastServicedAt: null, estimatedHours: value.estimatedHours, assignee: 'Unassigned', statutory: false, rescheduleCount: 0,
      } as unknown as PpmPlan;
      const meta: MaintenancePlanMetadata = { tenantId, planId: id, assetId: value.assetId, siteId: value.expectedSiteId, unitId: value.expectedUnitId, title: value.title, enabled: true, autoGenerate: value.autoGenerate,
        version: 1, anchorDate: value.firstDue, every: value.every, nextCycleIndex: 0, baselineRuntimeHours: feed?.runtimeHours ?? 0, createdAt: clock.iso, updatedAt: clock.iso };
      (context.state.collections.ppmPlans as PpmPlan[]).push(plan); data.plans.push(meta);
      if (value.basis !== 'calendar' && !feed) (context.state.collections.assetRuntime as AssetRuntime[]).push({ tenantId, assetId: asset.id, runtimeHours: 0, runtimeHoursAtLastService: 0, runtimeServiceInterval: value.runtimeIntervalHours!, dailyRuntimeHours: 0, lastReadingAt: clock.iso });
      data.receipts.push({ tenantId, actorId: actor.userId, key: value.idempotencyKey, kind: 'plan.create', hash, resultId: id });
      data.audit.push({ tenantId, actorId: actor.userId, entityId: id, action: 'maintenance.plan_created', at: clock.iso });
      recordHistory('ppm', id, { at: clock.iso, event: 'CREATE', from: null, to: 'scheduled', actorId: actor.userId, actorName: attributed(actor).name, actorRole: 'facility_manager', note: `Maintenance plan created; cadence ${value.every} ${value.frequency}; automatic work orders ${value.autoGenerate ? 'enabled' : 'disabled'}.` });
      processDueFacilityMaintenance(context.state, tenantId, clock.dateISO, { ...attributed(actor), estateIds: [meta.siteId] });
      refresh(); return { ok: true, id, message: 'Maintenance plan created with its schedule and checklist.' };
    } catch (error) { return failure(error); }
  }, 'facility');
}
export async function updateFacilityMaintenancePlan(input: unknown): Promise<MaintenanceSetupResult> {
  return withDurableMutation(async () => {
    const parsed = editSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Review the maintenance plan details.' };
    try {
      const actor = await getActor(), value = parsed.data, { context, tenantId, data } = checked(actor, value, 'update'); validateConfiguration(value);
      const plan = (context.state.collections.ppmPlans as PpmPlan[]).find((row) => row.tenantId === tenantId && String(row.id) === value.planId);
      const meta = plan ? maintenanceMetadataForPlan(context.state, tenantId, plan) : null;
      if (!meta || !plan || meta.assetId !== value.assetId || meta.version !== value.expectedVersion || !maintenancePlanMatchesMetadata(plan, meta) || !metadataBindingValid(context.state, tenantId, meta)) throw new Error('This maintenance plan changed. Refresh before editing.');
      if (openOccurrences(context, tenantId, value.planId).some((row) => row.workOrderRef)) throw new Error('Finish the linked work order and record service before changing this plan.');
      if (plan.statutory && plan.statutoryDeadline && value.firstDue > plan.statutoryDeadline) return { ok: false, error: 'This date is after the recorded statutory deadline.' };
      const clock = operatingClock();
      archiveUnlinkedOccurrences(context, tenantId, value.planId);
      plan.frequency = value.frequency; plan.basis = value.basis; plan.leadTimeDays = value.leadTimeDays; plan.runtimeIntervalHours = value.basis === 'calendar' ? undefined : value.runtimeIntervalHours!;
      plan.checklist = value.checklist.map((item) => ({ ...item, id: randomUUID() })); plan.checklistItems = value.checklist.length;
      plan.evidenceRequired = value.evidenceRequired || value.checklist.some((item) => item.requiresPhoto); plan.estimatedHours = value.estimatedHours;
      meta.title = value.title; meta.anchorDate = value.firstDue; meta.every = value.every; meta.nextCycleIndex = 0; meta.version++; meta.updatedAt = clock.iso; meta.createdAt ||= clock.iso; meta.autoGenerate = value.autoGenerate;
      if (!data.plans.some((row) => row.planId === meta.planId)) data.plans.push(meta);
      const feed = (context.state.collections.assetRuntime as AssetRuntime[]).find((row) => row.tenantId === tenantId && String(row.assetId) === meta.assetId);
      if (value.basis !== 'calendar' && !feed) (context.state.collections.assetRuntime as AssetRuntime[]).push({ tenantId, assetId: plan.assetId, runtimeHours: 0, runtimeHoursAtLastService: 0, runtimeServiceInterval: value.runtimeIntervalHours!, dailyRuntimeHours: 0, lastReadingAt: clock.iso });
      processDueFacilityMaintenance(context.state, tenantId, clock.dateISO, { ...attributed(actor), estateIds: [meta.siteId] });
      data.audit.push({ tenantId, actorId: actor.userId, entityId: value.planId, action: 'maintenance.plan_updated', at: clock.iso });
      recordHistory('ppm', value.planId, { at: clock.iso, event: 'EDIT', from: 'scheduled', to: 'scheduled', actorId: actor.userId, actorName: attributed(actor).name, actorRole: 'facility_manager', note: 'Future maintenance configuration updated. Historic service records were retained.' });
      refresh(); return { ok: true, id: value.planId, message: 'Future maintenance configuration updated.' };
    } catch (error) { return failure(error); }
  }, 'facility');
}
export async function setFacilityMaintenancePlanEnabled(input: unknown): Promise<MaintenanceSetupResult> {
  return withDurableMutation(async () => {
    const parsed = z.strictObject({ ...scopeFields, planId: z.string().min(1).max(160), expectedVersion: z.number().int().min(0), enabled: z.boolean() }).safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Choose a valid maintenance plan.' };
    try {
      const actor = await getActor(), value = parsed.data, { context, data, tenantId } = checked(actor, value, 'update');
      const plan = (context.state.collections.ppmPlans as PpmPlan[]).find((row) => row.tenantId === tenantId && String(row.id) === value.planId);
      const meta = plan ? maintenanceMetadataForPlan(context.state, tenantId, plan) : null;
      if (!meta || !plan || meta.version !== value.expectedVersion || meta.assetId !== value.assetId || !maintenancePlanMatchesMetadata(plan, meta) || !metadataBindingValid(context.state, tenantId, meta)) throw new Error('This maintenance plan changed. Refresh before updating it.');
      const clock = operatingClock(), open = maintenancePlanOccurrence(context.state, tenantId, value.planId);
      if (value.enabled && !meta.enabled && !open?.workOrderRef) {
        archiveUnlinkedOccurrences(context, tenantId, value.planId);
        while (maintenanceCycleDate(meta.anchorDate, plan.frequency, meta.every, meta.nextCycleIndex) < clock.dateISO && meta.nextCycleIndex < 11000) meta.nextCycleIndex++;
      }
      meta.enabled = value.enabled; meta.version++; meta.updatedAt = clock.iso; meta.createdAt ||= clock.iso;
      if (!data.plans.some((row) => row.planId === meta.planId)) data.plans.push(meta);
      if (value.enabled) processDueFacilityMaintenance(context.state, tenantId, clock.dateISO, { ...attributed(actor), estateIds: [meta.siteId] });
      data.audit.push({ tenantId, actorId: actor.userId, entityId: meta.planId, action: value.enabled ? 'maintenance.plan_resumed' : 'maintenance.plan_paused', at: clock.iso });
      refresh(); return { ok: true, message: value.enabled ? 'Maintenance resumed. Missed paused intervals were not queued as a backlog.' : 'Maintenance paused. Existing work orders and service history remain available.' };
    } catch (error) { return failure(error); }
  }, 'facility');
}
export async function recordFacilityService(input: unknown): Promise<MaintenanceSetupResult> {
  return withDurableMutation(async () => {
    const parsed = z.strictObject({ ...scopeFields, planId: z.string().min(1).max(160), occurrenceId: z.string().min(1).max(200), expectedPlanVersion: z.number().int().min(0),
      checkedIds: z.array(z.string().min(1).max(100)).max(50), evidenceIds: z.array(z.string().min(1).max(160)).max(20), servicedOn: maintenanceDate, runtimeAtService: hours.nullable(), notes: z.string().trim().max(2000), idempotencyKey: z.uuid(),
    }).safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Review the service date, checklist, stored evidence and runtime reading.' };
    try {
      const actor = await getActor(), value = parsed.data, { context, data, tenantId } = checked(actor, value, 'transition');
      const hash = digest(value), prior = receipt(data, actor, value.idempotencyKey, 'service.record', hash);
      if (prior) return { ok: true, id: prior.resultId, message: 'This service completion was already saved.' };
      const plan = (context.state.collections.ppmPlans as PpmPlan[]).find((row) => row.tenantId === tenantId && String(row.id) === value.planId);
      const meta = plan ? maintenanceMetadataForPlan(context.state, tenantId, plan) : null;
      const occurrence = (context.state.collections.ppmOccurrences as PpmOccurrence[]).find((row) => row.tenantId === tenantId && row.id === value.occurrenceId && String(row.planId) === value.planId && String(row.assetId) === value.assetId);
      if (!meta || !plan || !occurrence || occurrence.status === 'completed' || meta.version !== value.expectedPlanVersion || meta.assetId !== value.assetId || data.archivedOccurrenceIds.includes(occurrence.id) || !maintenancePlanMatchesMetadata(plan, meta) || !metadataBindingValid(context.state, tenantId, meta)) throw new Error('This maintenance occurrence changed. Refresh before recording service.');
      const clock = operatingClock(); if (value.servicedOn > clock.dateISO || plan.lastServicedAt && value.servicedOn < plan.lastServicedAt) throw new Error('The service date must be today or earlier and cannot precede the last recorded service.');
      if (new Set(value.checkedIds).size !== value.checkedIds.length || plan.checklist.some((item) => !value.checkedIds.includes(item.id)) || value.checkedIds.some((id) => !plan.checklist.some((item) => item.id === id))) throw new Error('Complete the current service checklist exactly once per item.');
      const evidence = resolveFacilityEvidence(actor, 'asset', value.assetId, value.evidenceIds);
      if (!evidence) throw new Error('Select the stored evidence belonging to this asset.');
      if ((plan.evidenceRequired || plan.checklist.some((item) => item.requiresPhoto)) && !evidence.some((item) => item.kind === 'image')) throw new Error('Only stored image evidence can satisfy the required service photo. Upload or select an asset photo.');
      const linked = occurrence.workOrderRef ? (context.state.collections.workOrders as { tenantId: string; ref: string; status: string; assetId?: string }[]).find((row) => row.tenantId === tenantId && row.ref === occurrence.workOrderRef && String(row.assetId) === value.assetId) : null;
      if (occurrence.workOrderRef && (!linked || !['resolved', 'verified', 'closed'].includes(linked.status))) throw new Error('Finish the linked work order through Resolved before recording this service. Work-order verification remains separate.');
      const feed = (context.state.collections.assetRuntime as AssetRuntime[]).find((row) => row.tenantId === tenantId && String(row.assetId) === value.assetId);
      if (plan.basis !== 'calendar' && (value.runtimeAtService === null || !feed || value.runtimeAtService < meta.baselineRuntimeHours || value.runtimeAtService > feed.runtimeHours)) throw new Error('Record a service-time meter reading between the previous service baseline and the latest recorded reading.');
      const id = `service-${randomUUID()}`;
      data.services.push({ id, tenantId, planId: value.planId, occurrenceId: occurrence.id, assetId: value.assetId, siteId: meta.siteId, title: meta.title, servicedOn: value.servicedOn,
        checkedIds: [...value.checkedIds], evidence: evidence.map((item) => ({ ...item })), runtimeAtService: value.runtimeAtService, notes: value.notes, actorId: actor.userId, actorName: attributed(actor).name, at: clock.iso, workOrderRef: occurrence.workOrderRef });
      const from = occurrence.status; occurrence.status = 'completed';
      if (plan.basis !== 'calendar') meta.baselineRuntimeHours = value.runtimeAtService!;
      advanceMaintenanceAfterService(plan, meta, value.servicedOn); meta.version++; meta.updatedAt = clock.iso; meta.createdAt ||= clock.iso;
      if (!data.plans.some((row) => row.planId === meta.planId)) {
        archiveUnlinkedOccurrences(context, tenantId, value.planId);
        data.plans.push(meta);
      }
      data.receipts.push({ tenantId, actorId: actor.userId, key: value.idempotencyKey, kind: 'service.record', hash, resultId: id });
      data.audit.push({ tenantId, actorId: actor.userId, entityId: id, action: 'maintenance.service_recorded', at: clock.iso });
      recordHistory('ppm', value.planId, { at: clock.iso, event: 'COMPLETE', from, to: 'completed', actorId: actor.userId, actorName: attributed(actor).name, actorRole: 'facility_manager', note: `Service recorded on ${value.servicedOn}; ${value.checkedIds.length} checklist items; ${evidence.length} stored evidence files. Missed calendar intervals were not fabricated as completed.` });
      processDueFacilityMaintenance(context.state, tenantId, clock.dateISO, { ...attributed(actor), estateIds: [meta.siteId] });
      refresh(); return { ok: true, id, message: 'Service saved with its checklist, evidence and next maintenance cycle.' };
    } catch (error) { return failure(error); }
  }, 'facility');
}
export async function recordFacilityRuntimeReading(input: unknown): Promise<MaintenanceSetupResult> {
  return withDurableMutation(async () => {
    const parsed = z.strictObject({ ...scopeFields, readingHours: hours, expectedPreviousHours: hours, idempotencyKey: z.uuid() }).safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter a valid cumulative meter reading with at most two decimal places.' };
    try {
      const actor = await getActor(), value = parsed.data, { context, data, tenantId } = checked(actor, value, 'update');
      const hash = digest(value), prior = receipt(data, actor, value.idempotencyKey, 'runtime.reading', hash);
      if (prior) return { ok: true, id: value.assetId, message: 'This runtime reading was already saved.' };
      const feed = (context.state.collections.assetRuntime as AssetRuntime[]).find((row) => row.tenantId === tenantId && String(row.assetId) === value.assetId);
      if (!feed || feed.runtimeHours !== value.expectedPreviousHours || value.readingHours < feed.runtimeHours) throw new Error('Runtime changed or the meter reading goes backwards. Refresh the latest reading before saving.');
      const clock = operatingClock(); feed.runtimeHours = value.readingHours; feed.lastReadingAt = clock.iso;
      data.runtimeReadings.push({ tenantId, assetId: value.assetId, hours: value.readingHours, actorId: actor.userId, at: clock.iso });
      data.receipts.push({ tenantId, actorId: actor.userId, key: value.idempotencyKey, kind: 'runtime.reading', hash, resultId: value.assetId });
      data.audit.push({ tenantId, actorId: actor.userId, entityId: value.assetId, action: 'maintenance.runtime_recorded', at: clock.iso });
      processDueFacilityMaintenance(context.state, tenantId, clock.dateISO, { ...attributed(actor), estateIds: [String(value.expectedSiteId)] });
      refresh(); return { ok: true, id: value.assetId, message: 'Cumulative runtime reading saved and maintenance thresholds reviewed.' };
    } catch (error) { return failure(error); }
  }, 'facility');
}
export async function refreshFacilityMaintenance(input: unknown): Promise<MaintenanceSetupResult> {
  return withDurableMutation(async () => {
    const parsed = z.strictObject({ expectedCompanyId: scopeFields.expectedCompanyId }).safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Choose the current company.' };
    try {
      const actor = await getActor(), context = currentRecordContext(), scope = assertCan(actor, 'assets_ppm', 'transition');
      if (!context || context.mode !== 'write' || actor.tenantId !== parsed.data.expectedCompanyId || context.domainTenantId !== actor.tenantId) throw new Error('Your company changed. Reopen Maintenance.');
      const result = processDueFacilityMaintenance(context.state, actor.tenantId!, operatingClock().dateISO, { ...attributed(actor), estateIds: scope.estateIds === 'all' ? undefined : scope.estateIds });
      refresh(); return { ok: true, message: `${result.created} maintenance work order(s) generated.${result.remainingDue ? ' More work orders are due; refresh the schedule again.' : ''}${result.skipped ? ' Some plans need asset or location review.' : ''}` };
    } catch (error) { return failure(error); }
  }, 'facility');
}
