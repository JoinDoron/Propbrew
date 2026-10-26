import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  EMPTY_OWNER_SETUP, ownerSetupDraftSchema, recommendOwnerPlan,
  validateOwnerCompletion, type OwnerSetupDraft,
} from '@/domain/owner-onboarding';
import type { Building, Site, Unit } from '@/domain/entities';
import { canUseCompanyModule } from '@/lib/auth/company-policy';
import { isDemoAccount } from '@/server/auth/demo-config';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { withDurableMutation, withDurableRead } from '@/server/data/durable-records';
import { currentRecordContext } from '@/server/data/record-context';
import { db } from '@/server/data/store';
import { OnboardingConflictError, type OwnerSetupRecord } from './contracts';

const SIDECAR = 'ownerOnboarding';
const maxVersion = 2_147_483_647;
const recordSchema = z.strictObject({
  draft: ownerSetupDraftSchema,
  version: z.number().int().min(1).max(maxVersion),
  completedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  activatedProperty: z.strictObject({
    id: z.string().regex(/^estate-[0-9a-f-]{36}$/i),
    name: z.string().min(2).max(120),
    unitCount: z.number().int().min(1).max(10_000),
  }).optional(),
});
const envelopeSchema = z.strictObject({
  tenantId: z.uuid(),
  record: recordSchema,
  planKey: z.enum(['core', 'growth', 'scale']).optional(),
});

/** The callback runs after the durable boundary rechecks fresh membership under
 * the company lock. A subject binds an open form to its original company; it
 * never grants access or chooses the storage namespace. */
function ownerContext(subject: string, mode: 'read' | 'write') {
  const context = currentRecordContext();
  const principal = context?.companyPrincipal;
  if (!nativeAuthEnabled() || process.env.DATA_SOURCE !== 'postgres' || !context || !principal
    || principal.membership.companyRole !== 'owner' || principal.membership.status !== 'active'
    || principal.membership.companyStatus !== 'active' || principal.actor.companyAccess?.companyRole !== 'owner'
    || isDemoAccount(principal.user.id)
    || principal.membership.userId !== principal.user.id || principal.membership.companyId !== principal.company.id
    || principal.actor.userId !== principal.user.id || principal.actor.tenantId !== principal.company.id
    || context.domainTenantId !== principal.company.id || subject !== `company:${principal.company.id}`
    || mode === 'write' && context.mode !== 'write'
    || !canUseCompanyModule(principal.actor, 'estate', 'create')) {
    throw new Error('Company owner setup is unavailable. Choose the original company with an authorised owner account.');
  }
  return { context, principal };
}

function emptyRecord(): OwnerSetupRecord {
  return { draft: structuredClone(EMPTY_OWNER_SETUP), version: 0, completedAt: null, updatedAt: null };
}

function readRecord(subject: string, mode: 'read' | 'write'): OwnerSetupRecord {
  const { context, principal } = ownerContext(subject, mode);
  if (!Object.hasOwn(context.state.auxiliary, SIDECAR)) return emptyRecord();
  const stored = envelopeSchema.parse(context.state.auxiliary[SIDECAR]);
  if (stored.tenantId !== principal.company.id) throw new Error('Stored owner setup belongs to another company.');
  if (Boolean(stored.record.completedAt) !== Boolean(stored.record.activatedProperty)) {
    throw new Error('Stored company activation is incomplete. Restore its records before continuing.');
  }
  if (stored.record.activatedProperty && !db.sites.some((site) => site.tenantId === principal.company.id
    && site.kind === 'estate' && site.id === stored.record.activatedProperty!.id)) {
    throw new Error('The activated property is unavailable. Restore its records before continuing.');
  }
  return structuredClone(stored.record);
}

function checkVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 0 || version >= maxVersion) {
    throw new Error('A valid onboarding version is required.');
  }
}

function operationalDraft(input: OwnerSetupDraft, complete: boolean): OwnerSetupDraft {
  const draft = ownerSetupDraftSchema.parse(input);
  const propertyValues = Object.values(draft.firstProperty).filter((value): value is string => typeof value === 'string');
  if (propertyValues.some((value) => /[\u0000-\u001f\u007f]/.test(value))) throw new Error('Property details cannot contain control characters.');
  if (complete && Object.keys(validateOwnerCompletion(draft)).length) throw new Error('Complete all owner setup steps before activation.');
  return draft;
}

export async function getNativeOwnerSetup(subject: string): Promise<OwnerSetupRecord> {
  return withDurableRead(async () => readRecord(subject, 'read'));
}

/** Optimistic draft versioning preserves another tab's newer answers. */
export async function saveNativeOwnerSetup(subject: string, input: OwnerSetupDraft, expectedVersion: number): Promise<OwnerSetupRecord> {
  checkVersion(expectedVersion);
  const draft = operationalDraft(input, false);
  return withDurableMutation(async () => {
    const { context, principal } = ownerContext(subject, 'write');
    const existing = readRecord(subject, 'write');
    if (existing.completedAt || existing.version !== expectedVersion) throw new OnboardingConflictError();
    const record: OwnerSetupRecord = { draft, version: existing.version + 1, completedAt: null, updatedAt: new Date().toISOString() };
    context.state.auxiliary[SIDECAR] = { tenantId: principal.company.id, record };
    return structuredClone(record);
  }, 'estate');
}

/** Property, building, vacant units, creator provenance and completion share
 * one locked workspace commit. A repeated successful submission returns the
 * original activation and can never create a second property or start billing. */
export async function completeNativeOwnerSetup(subject: string, input: OwnerSetupDraft, expectedVersion: number): Promise<OwnerSetupRecord> {
  checkVersion(expectedVersion);
  const draft = operationalDraft(input, true);
  return withDurableMutation(async () => {
    const { context, principal } = ownerContext(subject, 'write');
    const existing = readRecord(subject, 'write');
    if (existing.completedAt) return existing;
    if (existing.version !== expectedVersion) throw new OnboardingConflictError();

    const property = draft.firstProperty;
    const unitType = property.propertyType === 'apartment' ? 'Apartment'
      : property.propertyType === 'house' ? 'House'
        : property.propertyType === 'commercial' ? 'Commercial unit' : 'Unspecified';
    const tenantId = principal.company.id;
    const actorId = principal.user.id;
    const siteId = `estate-${randomUUID()}`;
    const buildingId = `building-${randomUUID()}`;
    const at = new Date().toISOString();
    const site = {
      tenantId, id: siteId, kind: 'estate', name: property.name,
      address: [property.address, property.city, property.state, property.country].join(', '),
      buildingCount: 1, unitCount: property.units,
    } as Site;
    const building = { tenantId, id: buildingId, siteId, name: property.name, floors: 1 } as Building;
    const units = Array.from({ length: property.units }, (_, index) => ({
      tenantId, id: `unit-${randomUUID()}`, siteId, buildingId,
      label: `Unit ${index + 1}`, type: unitType, occupancy: 'vacant',
    } as Unit));
    const result = { id: siteId, name: property.name };
    const receiptPayload = { name: property.name, address: site.address, unitCount: property.units, unitType };
    const record: OwnerSetupRecord = {
      draft: { ...draft, step: 6 }, version: existing.version + 1, completedAt: at, updatedAt: at,
      activatedProperty: { ...result, unitCount: property.units },
    };

    db.sites.push(site);
    db.buildings.push(building);
    db.units.push(...units);
    db.estateRegistrationReceipts.push({
      tenantId, actorId, key: randomUUID(), kind: 'property',
      payloadHash: createHash('sha256').update(JSON.stringify(receiptPayload)).digest('hex'), result, createdAt: at,
    });
    db.estateCreatorAssignments.push({ tenantId, userId: actorId, siteId, source: 'estate_property_registration', createdAt: at });
    db.estateRegistrationAudit.push({ tenantId, actorId, action: 'property.created', entityId: siteId, siteId, at });
    context.state.auxiliary[SIDECAR] = { tenantId, record, planKey: recommendOwnerPlan(draft).key };
    return structuredClone(record);
  }, 'estate');
}
