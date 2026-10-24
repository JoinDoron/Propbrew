'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSession, devIdentityEnabled } from '@/server/session';
import { db } from '@/server/data/store';
import { scopedMutableGet } from '@/server/data';
import { canRegisterEstateRecords, withCreatedEstateAssignments } from '@/server/data/estate-creation-scope';
import { NOW } from '@/domain/ppm';
import { money } from '@/domain/primitives';
import type { Actor } from '@/lib/authz';
import type { Building, Resident, Site, Unit } from '@/domain/entities';

export type RegistrationResult = { ok: true; id: string; name: string } | { ok: false; error: string };

const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Control characters are not allowed.');
const key = z.string().uuid();
const propertySchema = z.object({
  name: text(2, 120), address: z.preprocess((value) => typeof value === 'string' ? value.replace(/\r\n?|\n/g, ' ') : value, text(5, 500)), unitCount: z.number().int().min(1).max(200),
  unitType: text(2, 100), idempotencyKey: key,
}).strict();
const tenantSchema = z.object({
  name: text(2, 120), unitId: text(1, 160), moveInDate: z.iso.date().refine((value) => value >= '1900-01-01' && value <= '2100-12-31', 'Move-in year must be between 1900 and 2100.'),
  household: z.number().int().min(1).max(50),
  email: z.preprocess((value) => typeof value === 'string' ? value.trim() : value, z.union([z.email().max(254), z.literal('')]).optional()).transform((value) => value?.toLowerCase() || undefined),
  phone: z.union([z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,24}$/), z.literal('')]).optional().transform((value) => value || undefined),
  idempotencyKey: key,
}).strict();

async function registrationActor(): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  if (process.env.NODE_ENV === 'production' || (process.env.DATA_SOURCE && process.env.DATA_SOURCE !== 'memory')) {
    return { ok: false, error: 'Property and tenant creation require the durable registration adapter in this environment. No record was created.' };
  }
  const session = await getSession();
  if (!session || session.key === 'clerk' || !devIdentityEnabled()) {
    return { ok: false, error: 'Registration is available only in the signed-in local demo until durable registration is configured.' };
  }
  const actor = withCreatedEstateAssignments(session.actor);
  if (!canRegisterEstateRecords(actor)) return { ok: false, error: 'Only an authorised estate manager can add property or tenant records.' };
  return { ok: true, actor };
}

function hash(payload: unknown) { return createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }

function priorResult(actor: Actor, requestKey: string, kind: 'property' | 'tenant', payloadHash: string): RegistrationResult | undefined {
  const receipt = db.estateRegistrationReceipts.find((row) => row.tenantId === actor.tenantId && row.actorId === actor.userId && row.key === requestKey);
  if (!receipt) return undefined;
  if (receipt.kind !== kind || receipt.payloadHash !== payloadHash) return { ok: false, error: 'This submission key was already used for different details. Start a new submission.' };
  return { ok: true, ...receipt.result };
}

const refresh = () => ['/estate', '/properties', '/people', '/tenancy', '/spaces', '/portfolio', '/workspaces'].forEach((path) => revalidatePath(path));

/** Demo record creation only: no infrastructure, subscription or billing changes. */
export async function addEstateProperty(input: unknown): Promise<RegistrationResult> {
  const gate = await registrationActor();
  if (!gate.ok) return gate;
  const parsed = propertySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter a property name, address, unit type, 1–200 units and a valid submission key. Unexpected ownership fields are not accepted.' };
  const { idempotencyKey, ...data } = parsed.data;
  const payloadHash = hash(data);
  const prior = priorResult(gate.actor, idempotencyKey, 'property', payloadHash);
  if (prior) return prior;

  const tenantId = gate.actor.tenantId!;
  const id = `estate-${randomUUID()}`;
  const buildingId = `building-${randomUUID()}`;
  const at = new Date().toISOString();
  const site = { tenantId, id, kind: 'estate', name: data.name, address: data.address, buildingCount: 1, unitCount: data.unitCount } as Site;
  const building = { tenantId, id: buildingId, siteId: id, name: data.name, floors: 1 } as Building;
  const units = Array.from({ length: data.unitCount }, (_, index) => ({
    tenantId, id: `unit-${randomUUID()}`, siteId: id, buildingId,
    label: `Unit ${index + 1}`, type: data.unitType, occupancy: 'vacant',
  } as Unit));
  const result = { id, name: data.name };
  // All validation and construction precedes this synchronous commit. No await
  // splits the property, inventory, receipt and creator-assignment writes.
  db.sites.push(site);
  db.buildings.push(building);
  db.units.push(...units);
  db.estateRegistrationReceipts.push({ tenantId, actorId: gate.actor.userId, key: idempotencyKey, kind: 'property', payloadHash, result, createdAt: at });
  db.estateCreatorAssignments.push({ tenantId, userId: gate.actor.userId, siteId: id, source: 'estate_property_registration', createdAt: at });
  db.estateRegistrationAudit.push({ tenantId, actorId: gate.actor.userId, action: 'property.created', entityId: id, siteId: id, at });
  refresh();
  return { ok: true, ...result };
}

/** Add a scoped resident contact record; never creates an auth account or sends an invite. */
export async function addEstateTenant(input: unknown): Promise<RegistrationResult> {
  const gate = await registrationActor();
  if (!gate.ok) return gate;
  const parsed = tenantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter valid tenant details, a real move-in date, household size and submission key. Unexpected ownership fields are not accepted.' };
  const { idempotencyKey, ...data } = parsed.data;
  const payloadHash = hash(data);
  const prior = priorResult(gate.actor, idempotencyKey, 'tenant', payloadHash);
  if (prior) return prior;

  // Authorization and the full tenant/estate predicate run inside the adapter.
  const scoped = scopedMutableGet(gate.actor, 'users_roles', db.units.map((unit) => ({ ...unit, unitId: unit.id })), data.unitId, 'create');
  const unit = scoped && db.units.find((row) => row.id === scoped.id && row.tenantId === gate.actor.tenantId);
  const property = unit && db.sites.find((row) => row.id === unit.siteId && row.tenantId === gate.actor.tenantId && row.kind === 'estate');
  if (!unit || !property) return { ok: false, error: 'Choose a vacant unit in one of your authorised estate properties.' };
  if (unit.occupancy !== 'vacant' || db.residents.some((resident) => resident.tenantId === gate.actor.tenantId && resident.unitId === unit.id && ['active', 'invited'].includes(resident.status))) {
    return { ok: false, error: 'This unit is no longer vacant or already has an active or invited tenant record.' };
  }
  const future = data.moveInDate > NOW;
  const tenantId = gate.actor.tenantId!;
  const id = `resident-${randomUUID()}`;
  const at = new Date().toISOString();
  const resident = {
    tenantId, id, userId: `unlinked-resident-${randomUUID()}`, name: data.name,
    email: data.email, phone: data.phone, unitId: unit.id, siteId: unit.siteId,
    status: future ? 'invited' : 'active', household: data.household,
    balance: money(0, 'NGN'), moveInDate: data.moveInDate,
  } as Resident;
  const result = { id, name: data.name };
  db.residents.push(resident);
  unit.occupancy = future ? 'reserved' : 'occupied';
  db.estateRegistrationReceipts.push({ tenantId, actorId: gate.actor.userId, key: idempotencyKey, kind: 'tenant', payloadHash, result, createdAt: at });
  db.estateRegistrationAudit.push({ tenantId, actorId: gate.actor.userId, action: 'resident.created', entityId: id, siteId: unit.siteId, unitId: unit.id, at });
  refresh();
  return { ok: true, ...result };
}
