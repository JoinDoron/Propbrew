'use server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCan, matchesScope } from '@/lib/authz';
import { getActor } from '@/server/session';
import { withDurableMutation } from '@/server/data/durable-records';
import { db } from '@/server/data/store';
import { repos } from '@/server/data';
import { operatingDateISO, operatingNowISO } from '@/server/operating-clock';
import { complianceObligationFields, type ComplianceObligationInput, type FacilityComplianceResult } from '@/domain/facility/compliance';
import { facilityComplianceState, complianceHash } from '@/server/reads/facility-compliance';
import type { ComplianceObligation } from '@/domain/entities';
const refresh = () => ['/inspections', '/estate/inspections', '/facility', '/assets'].forEach((path) => revalidatePath(path));
async function target(input: ComplianceObligationInput, action: 'create' | 'update') {
  const actor = await getActor(), scope = assertCan(actor, 'inspections_compliance', action);
  if (!actor.tenantId || input.expectedCompanyId !== actor.tenantId) throw new Error('The company changed. Reopen compliance setup in the original company.');
  const site = db.sites.find((row) => row.id === input.siteId && matchesScope({ ...row, siteId: row.id }, scope));
  const asset = input.assetId ? repos.assets.get(actor, input.assetId) : null;
  if (!site || input.assetId && (!asset || asset.siteId !== site.id || asset.status === 'archived' || asset.archivedAt)) throw new Error('Choose an authorised location and an active asset in that location.');
  return { actor, scope, site, asset };
}
const safeError = (error: unknown) => error instanceof Error && (error.message.startsWith('The company changed.') || error.message.startsWith('Choose an authorised')) ? error.message : 'The obligation could not be saved. Refresh the records and check your access.';
export async function createFacilityComplianceObligation(input: unknown): Promise<FacilityComplianceResult> {
  return withDurableMutation(async () => {
    const parsed = complianceObligationFields.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Review the location, obligation, valid dates, cadence, certificate reference and complete checklist.' };
    try {
      const data = parsed.data, { actor, site, asset } = await target(data, 'create'), state = facilityComplianceState();
      const { idempotencyKey, ...payload } = data, payloadHash = complianceHash(payload);
      const prior = state.receipts.find((row) => row.tenantId === actor.tenantId && row.actorId === actor.userId && row.key === idempotencyKey);
      if (prior) return prior.operation === 'obligation.create' && prior.payloadHash === payloadHash ? prior.result : { ok: false, error: 'This submission key was used for different details. Reopen the form.' };
      const id = `obligation-${randomUUID()}`, at = operatingNowISO();
      const row = { tenantId: actor.tenantId!, id, name: data.name, scopeLabel: asset?.name ?? data.scopeLabel, assetId: asset?.id,
        siteId: site.id, estateId: site.id, criticality: data.criticality, cadenceDays: data.cadenceDays, templateKey: data.templateKey, validUntil: data.validUntil, authority: data.authority || undefined } as unknown as ComplianceObligation;
      db.complianceObligations.push(row);
      state.configurations.push({ tenantId: actor.tenantId!, obligationId: id, siteId: String(site.id), assetId: asset ? String(asset.id) : null,
        version: 1, templateName: data.templateName, checklist: data.checklist, certificateReference: data.certificateReference, nextOperationalDue: data.nextDueDate ?? operatingDateISO(), createdAt: at, createdBy: actor.userId, updatedAt: at, updatedBy: actor.userId });
      state.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, obligationId: id, action: 'obligation.created', at, note: 'Operator-recorded obligation; certificate validity is not independently verified.' });
      const result = { ok: true as const, id }; state.receipts.push({ tenantId: actor.tenantId!, actorId: actor.userId, operation: 'obligation.create', key: idempotencyKey, payloadHash, result });
      refresh(); return result;
    } catch (error) { return { ok: false, error: safeError(error) }; }
  }, 'facility');
}
export async function updateFacilityComplianceObligation(input: unknown): Promise<FacilityComplianceResult> {
  return withDurableMutation(async () => {
    const parsed = complianceObligationFields.safeExtend({ obligationId: z.string().min(1).max(160), expectedVersion: z.number().int().min(1).max(2_147_483_646) }).safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Review the obligation details and reload the latest configuration before saving.' };
    try {
      const data = parsed.data, { actor, site, asset, scope } = await target(data, 'update'), state = facilityComplianceState();
      const row = db.complianceObligations.find((value) => value.id === data.obligationId && matchesScope(value, scope));
      const config = state.configurations.find((value) => value.tenantId === actor.tenantId && value.obligationId === data.obligationId);
      if (!row || !config) return { ok: false, error: 'This configured obligation is unavailable in your location scope.' };
      const { idempotencyKey, ...payload } = data, payloadHash = complianceHash(payload);
      const prior = state.receipts.find((value) => value.tenantId === actor.tenantId && value.actorId === actor.userId && value.key === idempotencyKey);
      if (prior) return prior.operation === 'obligation.update' && prior.payloadHash === payloadHash ? prior.result : { ok: false, error: 'This submission key was used with different obligation details.' };
      if (config.version !== data.expectedVersion) return { ok: false, error: 'This obligation changed in another tab. Reload its latest configuration.' };
      if ((row.siteId !== site.id || (row.assetId ?? null) !== (asset?.id ?? null)) && db.inspections.some((inspection) => inspection.tenantId === actor.tenantId && inspection.obligationId === row.id && ['scheduled', 'overdue', 'in_progress'].includes(inspection.status))) return { ok: false, error: 'Complete the open inspection before changing this obligation’s location or asset.' };
      Object.assign(row, { name: data.name, scopeLabel: asset?.name ?? data.scopeLabel, assetId: asset?.id, siteId: site.id, estateId: site.id, criticality: data.criticality, cadenceDays: data.cadenceDays, templateKey: data.templateKey, validUntil: data.validUntil, authority: data.authority || undefined });
      Object.assign(config, { siteId: String(site.id), assetId: asset ? String(asset.id) : null, version: config.version + 1, templateName: data.templateName, checklist: data.checklist, certificateReference: data.certificateReference, nextOperationalDue: data.nextDueDate ?? config.nextOperationalDue, updatedAt: operatingNowISO(), updatedBy: actor.userId });
      state.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, obligationId: row.id, action: 'obligation.updated', at: config.updatedAt, note: 'Operator-recorded expiry and reference; no regulatory sign-off is implied.' });
      const result = { ok: true as const, id: row.id }; state.receipts.push({ tenantId: actor.tenantId!, actorId: actor.userId, operation: 'obligation.update', key: idempotencyKey, payloadHash, result });
      refresh(); return result;
    } catch (error) { return { ok: false, error: safeError(error) }; }
  }, 'facility');
}
