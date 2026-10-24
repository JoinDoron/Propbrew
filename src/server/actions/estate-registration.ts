'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSession, devIdentityEnabled } from '@/server/session';
import { assertCan } from '@/lib/authz';
import { db } from '@/server/data/store';
import { scopedMutableGet } from '@/server/data';
import { canRegisterEstateRecords, withCreatedEstateAssignments } from '@/server/data/estate-creation-scope';
import { NOW } from '@/domain/ppm';
import { money } from '@/domain/primitives';
import { assertReviewReadiness, isReviewActor, reviewModeEnabled } from '@/server/review-auth';
import { currentRecordContext } from '@/server/data/record-context';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { nativeEstateCreationReady } from '@/server/data/company-estate-access';
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
  if (nativeAuthEnabled()) {
    const session = await getSession();
    if (!session || !nativeEstateCreationReady(session.actor, 'write')) {
      return { ok: false, error: 'Sign in with an active company membership that can create Estate records. Database storage must be available.' };
    }
    return { ok: true, actor: session.actor };
  }
  const review = reviewModeEnabled();
  const durableReview = review && process.env.DATA_SOURCE === 'postgres' && currentRecordContext()?.mode === 'write';
  if ((!review && process.env.NODE_ENV === 'production') || (process.env.DATA_SOURCE && process.env.DATA_SOURCE !== 'memory' && !durableReview)) {
    return { ok: false, error: 'Property and tenant creation require the durable registration adapter in this environment. No record was created.' };
  }
  if (review) {
    try { assertReviewReadiness(); }
    catch { return { ok: false, error: 'Private review registration is unavailable until its secure configuration is restored. No record was created.' }; }
  }
  const session = await getSession();
  if (review) {
    if (!session || session.key !== 'private-review' || !isReviewActor(session.actor) || !canRegisterEstateRecords(session.actor)) {
      return { ok: false, error: 'Sign in to the private review with the authorised estate-manager account to add sample records.' };
    }
    return { ok: true, actor: session.actor };
  }
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

/** Register company or authorised sample records; no subscription or billing changes. */
export async function addEstateProperty(input: unknown): Promise<RegistrationResult> {
  return withDurableMutation(async () => {
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

  }, 'estate');
}

/** Add a scoped resident contact record; never creates an auth account or sends an invite. */
export async function addEstateTenant(input: unknown): Promise<RegistrationResult> {
  return withDurableMutation(async () => {
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
  const referenceDate = nativeAuthEnabled()
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    : NOW;
  const future = data.moveInDate > referenceDate;
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

  }, 'estate');
}

/** Correct property details without changing inventory, tenancy or ownership. */
export async function updateEstateProperty(input: unknown): Promise<RegistrationResult> {
  return withDurableMutation(async () => {
    const gate = await registrationActor(); if (!gate.ok) return gate;
    assertCan(gate.actor, 'users_roles', 'update');
    const parsed = z.object({ id: text(1, 160), name: text(2, 120), address: z.preprocess((value) => typeof value === 'string' ? value.replace(/\r\n?|\n/g, ' ') : value, text(5, 500)) }).strict().safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter a valid property name and address. Ownership and unit inventory cannot be changed by this form.' };
    const site = scopedMutableGet(gate.actor, 'users_roles', db.sites.map((row) => ({ ...row, siteId: row.id })), parsed.data.id, 'update');
    const live = site && db.sites.find((row) => row.id === site.id && row.tenantId === gate.actor.tenantId && row.kind === 'estate');
    if (!live) return { ok: false, error: 'Choose an estate property available to your account.' };
    live.name = parsed.data.name; live.address = parsed.data.address;
    db.estateRegistrationAudit.push({ tenantId: gate.actor.tenantId!, actorId: gate.actor.userId, action: 'property.updated', entityId: live.id, siteId: live.id, at: new Date().toISOString() });
    refresh(); return { ok: true, id: String(live.id), name: live.name };
  }, 'estate');
}

/** Edit contact/household records; authentication and historical bills are unchanged. */
export async function updateEstateTenant(input: unknown): Promise<RegistrationResult> {
  return withDurableMutation(async () => {
    const gate = await registrationActor(); if (!gate.ok) return gate;
    assertCan(gate.actor, 'users_roles', 'update');
    const parsed = tenantSchema.omit({ moveInDate: true, idempotencyKey: true }).extend({ id: text(1, 160) }).strict().safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter valid resident contact details, household size and a permitted unit.' };
    const resident = scopedMutableGet(gate.actor, 'users_roles', db.residents, parsed.data.id, 'update');
    if (!resident) return { ok: false, error: 'This resident is unavailable in your estate scope.' };
    if (!['active', 'invited'].includes(resident.status)) return { ok: false, error: 'A moved-out resident needs a new tenancy before being assigned an active unit.' };
    const destination = scopedMutableGet(gate.actor, 'users_roles', db.units.map((row) => ({ ...row, unitId: row.id })), parsed.data.unitId, 'update');
    const unit = destination && db.units.find((row) => row.id === destination.id && row.tenantId === gate.actor.tenantId);
    const property = unit && db.sites.find((row) => row.id === unit.siteId && row.tenantId === gate.actor.tenantId && row.kind === 'estate');
    if (!unit || !property) return { ok: false, error: 'Choose an authorised estate unit.' };
    const moving = unit.id !== resident.unitId;
    if (moving && (unit.occupancy !== 'vacant' || db.residents.some((row) => row.tenantId === gate.actor.tenantId && row.unitId === unit.id && row.id !== resident.id && ['active', 'invited'].includes(row.status)))) return { ok: false, error: 'The selected unit is already occupied, reserved or unavailable.' };
    const oldUnitId = resident.unitId;
    resident.name = parsed.data.name; resident.email = parsed.data.email; resident.phone = parsed.data.phone; resident.household = parsed.data.household;
    resident.unitId = unit.id; resident.siteId = unit.siteId;
    if (moving) {
      const previous = db.units.find((row) => row.tenantId === gate.actor.tenantId && row.id === oldUnitId);
      if (previous && previous.occupancy !== 'unavailable' && !db.residents.some((row) => row.tenantId === gate.actor.tenantId && row.unitId === oldUnitId && ['active', 'invited'].includes(row.status))) previous.occupancy = 'vacant';
      unit.occupancy = resident.status === 'invited' ? 'reserved' : 'occupied';
    }
    db.estateRegistrationAudit.push({ tenantId: gate.actor.tenantId!, actorId: gate.actor.userId, action: 'resident.updated', entityId: resident.id, siteId: unit.siteId, unitId: unit.id, at: new Date().toISOString() });
    refresh(); return { ok: true, id: String(resident.id), name: resident.name };
  }, 'estate');
}
