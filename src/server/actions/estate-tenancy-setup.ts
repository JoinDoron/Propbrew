'use server';

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCan, matchesScope, type Action } from '@/lib/authz';
import { getActor } from '@/server/session';
import { withDurableMutation } from '@/server/data/durable-records';
import { db } from '@/server/data/store';
import { operatingDateISO, operatingNowISO } from '@/server/operating-clock';
import { tenancySetupState } from '@/server/reads/tenancy-setup';
import { tenancyAgreementInputSchema, tenancyMinor, type TenancyAgreementInput, type TenancyAgreementDetails } from '@/domain/estate/tenancy-setup';
import type { Tenancy } from '@/domain/estate';

export type TenancyAgreementResult = { ok: true; id: string; name: string } | { ok: false; error: string };
const refresh = () => ['/tenancy', '/estate', '/people', '/properties', '/portfolio'].forEach((path) => revalidatePath(path));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function target(input: TenancyAgreementInput, action: Action) {
  const actor = await getActor();
  const scope = assertCan(actor, 'users_roles', action);
  if (!actor.tenantId || input.companyScope !== actor.tenantId) throw new Error('Company changed. Reopen this form in the company you want to update.');
  const resident = db.residents.find((row) => row.id === input.residentId && matchesScope(row, scope) && ['active', 'invited'].includes(row.status));
  const unit = resident && db.units.find((row) => row.id === resident.unitId && row.tenantId === actor.tenantId && row.siteId === resident.siteId && matchesScope({ ...row, unitId: row.id }, scope));
  const estate = unit && db.sites.find((row) => row.id === unit.siteId && row.tenantId === actor.tenantId && row.kind === 'estate');
  if (!resident || !unit || !estate || input.expectedUnitId !== unit.id) throw new Error('Choose an available resident and their current unit. Refresh the form if the resident has moved.');
  return { actor, resident, unit, estate, scope };
}
function overlap(tenantId: string, residentId: string, unitId: string, estateId: string, unitLabel: string, start: string, end: string, exceptId?: string) {
  const metadata = tenancySetupState().agreements;
  return db.tenancies.some((row) => {
    if (row.tenantId !== tenantId || row.id === exceptId || row.stage === 'closed') return false;
    const detail = metadata.find((value) => value.tenantId === tenantId && value.tenancyId === row.id);
    if (detail ? detail.unitId !== unitId && detail.residentId !== residentId : row.estateId !== estateId || row.unitLabel !== unitLabel) return false;
    const existingStart = detail?.startDate ?? row.moveInISO ?? row.applicationISO;
    const existingEnd = detail?.endDate ?? row.leaseEndISO ?? '2100-12-31';
    return start <= existingEnd.slice(0, 10) && end >= existingStart.slice(0, 10);
  });
}
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return message.startsWith('Company changed.') || message.startsWith('Choose an available resident') ? message : 'The agreement could not be saved. Check your access and refresh the company records.';
}

export async function createEstateTenancyAgreement(input: unknown): Promise<TenancyAgreementResult> {
  return withDurableMutation(async () => {
    const parsed = tenancyAgreementInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter a resident, valid lease dates, positive rent and a non-negative deposit in NGN with at most two decimal places.' };
    const data = parsed.data;
    try {
      const { actor, resident, unit, estate } = await target(data, 'create');
      const state = tenancySetupState();
      const { idempotencyKey, ...payload } = data;
      const payloadHash = hash(payload);
      const prior = state.receipts.find((row) => row.tenantId === actor.tenantId && row.actorId === actor.userId && row.key === idempotencyKey);
      if (prior) return prior.operation === 'create' && prior.payloadHash === payloadHash ? { ok: true, id: prior.tenancyId, name: prior.name } : { ok: false, error: 'This submission key was already used with different agreement details. Reopen the form.' };
      if (overlap(actor.tenantId!, resident.id, unit.id, estate.id, unit.label, data.startDate, data.endDate)) return { ok: false, error: 'This resident or unit already has an overlapping open agreement. Review or close that agreement before creating another.' };
      const id = `tenancy-${randomUUID()}`, at = operatingNowISO();
      const record = {
        tenantId: actor.tenantId!, id, estateId: estate.id, residentName: resident.name, unitLabel: unit.label,
        stage: 'applied', applicationISO: operatingDateISO(), moveInISO: data.startDate, leaseEndISO: data.endDate,
        rentMinor: tenancyMinor(data.rentAmount, true)!, depositMinor: tenancyMinor(data.depositAmount)!, depositStatus: 'pending',
      } as unknown as Tenancy;
      const details: TenancyAgreementDetails = { tenantId: actor.tenantId!, tenancyId: id, residentId: resident.id, unitId: unit.id, estateId: estate.id,
        startDate: data.startDate, endDate: data.endDate, rentFrequency: data.rentFrequency, agreementReference: data.agreementReference, notes: data.notes,
        version: 1, createdAt: at, createdBy: actor.userId, updatedAt: at, updatedBy: actor.userId };
      db.tenancies.push(record); state.agreements.push(details);
      state.receipts.push({ tenantId: actor.tenantId!, actorId: actor.userId, key: idempotencyKey, operation: 'create', payloadHash, tenancyId: id, name: resident.name });
      state.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, tenancyId: id, estateId: estate.id, action: 'agreement.created', at });
      refresh(); return { ok: true, id, name: resident.name };
    } catch (error) { return { ok: false, error: errorMessage(error) }; }
  }, 'estate');
}

export async function updateEstateTenancyAgreement(input: unknown): Promise<TenancyAgreementResult> {
  return withDurableMutation(async () => {
    const schema = tenancyAgreementInputSchema.safeExtend({ id: z.string().min(1).max(160), expectedVersion: z.number().int().min(1).max(2_147_483_646) });
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter valid agreement details and reload the latest draft before saving.' };
    const data = parsed.data;
    try {
      const { actor, resident, unit, estate, scope } = await target(data, 'update');
      const state = tenancySetupState();
      const record = db.tenancies.find((row) => row.id === data.id && matchesScope(row, scope));
      const detail = state.agreements.find((row) => row.tenantId === actor.tenantId && row.tenancyId === data.id && row.estateId === estate.id);
      if (!record || !detail || detail.residentId !== resident.id || detail.unitId !== unit.id) return { ok: false, error: 'This agreement is unavailable or its resident/unit binding changed. Reopen the record.' };
      const { idempotencyKey, ...payload } = data;
      const payloadHash = hash(payload);
      const prior = state.receipts.find((row) => row.tenantId === actor.tenantId && row.actorId === actor.userId && row.key === idempotencyKey);
      if (prior) return prior.operation === 'update' && prior.payloadHash === payloadHash ? { ok: true, id: prior.tenancyId, name: prior.name } : { ok: false, error: 'This submission key was already used with different agreement details. Reopen the form.' };
      if (!['applied', 'screening'].includes(record.stage)) return { ok: false, error: 'Approved, active and terminal agreement terms are protected. Record an authorised amendment separately.' };
      if (detail.version !== data.expectedVersion) return { ok: false, error: 'This agreement changed in another tab. Refresh its latest terms before saving.' };
      if (overlap(actor.tenantId!, resident.id, unit.id, estate.id, unit.label, data.startDate, data.endDate, record.id)) return { ok: false, error: 'The revised dates overlap another open agreement for this resident or unit.' };
      record.moveInISO = data.startDate; record.leaseEndISO = data.endDate;
      record.rentMinor = tenancyMinor(data.rentAmount, true)!; record.depositMinor = tenancyMinor(data.depositAmount)!;
      Object.assign(detail, { startDate: data.startDate, endDate: data.endDate, rentFrequency: data.rentFrequency, agreementReference: data.agreementReference, notes: data.notes, version: detail.version + 1, updatedAt: operatingNowISO(), updatedBy: actor.userId });
      state.receipts.push({ tenantId: actor.tenantId!, actorId: actor.userId, key: idempotencyKey, operation: 'update', payloadHash, tenancyId: record.id, name: resident.name });
      state.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, tenancyId: record.id, estateId: estate.id, action: 'agreement.updated', at: detail.updatedAt });
      refresh(); return { ok: true, id: record.id, name: resident.name };
    } catch (error) { return { ok: false, error: errorMessage(error) }; }
  }, 'estate');
}
