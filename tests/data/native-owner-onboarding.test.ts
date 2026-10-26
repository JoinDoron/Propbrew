import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyPrincipal } from '@/server/auth/company';
import type { WorkspaceRecordState } from '@/server/data/record-context';

const boundary = vi.hoisted(() => ({
  principal: undefined as CompanyPrincipal | undefined,
  state: undefined as WorkspaceRecordState | undefined,
  noContext: false,
  module: vi.fn(),
}));
vi.mock('@/server/data/durable-records', async () => {
  const { runWithRecordContext } = await import('@/server/data/record-context');
  return {
    withDurableRead: async <T>(fn: () => Promise<T>) => boundary.noContext ? fn() : runWithRecordContext({
      state: structuredClone(boundary.state!), domainTenantId: boundary.principal?.company.id ?? '', mode: 'read', companyPrincipal: boundary.principal,
    }, fn),
    withDurableMutation: async <T>(fn: () => Promise<T>, module: string) => {
      boundary.module(module);
      if (boundary.noContext) return fn();
      const state = structuredClone(boundary.state!);
      const result = await runWithRecordContext({ state, domainTenantId: boundary.principal?.company.id ?? '', mode: 'write', companyPrincipal: boundary.principal }, fn);
      boundary.state = state;
      return result;
    },
  };
});

import { EMPTY_OWNER_SETUP, type OwnerSetupDraft } from '@/domain/owner-onboarding';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { DEMO_ACCOUNTS } from '@/server/auth/demo-config';
import { blankCompanyWorkspaceState } from '@/server/data/store';
import { OnboardingConflictError } from '@/server/onboarding/contracts';
import { completeNativeOwnerSetup, getNativeOwnerSetup, saveNativeOwnerSetup } from '@/server/onboarding/native-repository';

function principal(companyId: string = randomUUID(), userId: string = randomUUID()): CompanyPrincipal {
  const membership = {
    membershipId: randomUUID(), userId, companyId, companyRole: 'owner' as const,
    status: 'active' as const, companyStatus: 'active' as const, modules: { estate: 'manage' as const },
    estateIds: [], allEstates: true, version: '1',
  };
  return {
    user: { id: userId, name: 'Owner', email: 'owner@example.test' }, session: { id: randomUUID() },
    company: { id: companyId, name: 'Lagos operator' }, membership,
    actor: actorForCompanyMember(membership, userId)!, sandbox: undefined,
  };
}
const subject = () => `company:${boundary.principal!.company.id}`;
const completeDraft = (): OwnerSetupDraft => ({
  ...structuredClone(EMPTY_OWNER_SETUP), portfolioType: 'property_manager', propertyCount: 'one', tenantCount: 'none',
  rentWorkflow: 'spreadsheets', rentPaymentMethods: ['bank_transfer', 'cash_manual'], priority: 'records', step: 6,
  firstProperty: { name: 'Palm Court', address: '18 Test Avenue', city: 'Lagos', state: 'Lagos', country: 'NG', propertyType: 'building', units: 3 },
});
const rows = (name: string) => boundary.state!.collections[name] as Array<Record<string, unknown>>;

beforeEach(() => {
  vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('DATA_SOURCE', 'postgres'); vi.stubEnv('PROPBREW_REVIEW_MODE', '0');
  boundary.principal = principal(); boundary.state = blankCompanyWorkspaceState(); boundary.noContext = false; boundary.module.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('native company owner onboarding', () => {
  it('returns a detached empty setup without changing company state', async () => {
    const before = structuredClone(boundary.state);
    const record = await getNativeOwnerSetup(subject());
    expect(record).toEqual({ draft: EMPTY_OWNER_SETUP, version: 0, completedAt: null, updatedAt: null });
    record.draft.firstProperty.name = 'Changed client value';
    expect(await getNativeOwnerSetup(subject())).toEqual({ draft: EMPTY_OWNER_SETUP, version: 0, completedAt: null, updatedAt: null });
    expect(boundary.state).toEqual(before);
  });

  it('saves partial answers, resumes across calls and rejects stale overwrites', async () => {
    const draft = { ...structuredClone(EMPTY_OWNER_SETUP), portfolioType: 'growing_landlord' as const, step: 1 };
    const first = await saveNativeOwnerSetup(subject(), draft, 0);
    expect(first).toMatchObject({ draft, version: 1, completedAt: null });
    expect(await getNativeOwnerSetup(subject())).toEqual(first);
    expect(boundary.module).toHaveBeenCalledWith('estate');
    const before = structuredClone(boundary.state);
    await expect(saveNativeOwnerSetup(subject(), { ...draft, step: 2 }, 0)).rejects.toBeInstanceOf(OnboardingConflictError);
    expect(boundary.state).toEqual(before);
    const second = await saveNativeOwnerSetup(subject(), { ...draft, step: 2 }, 1);
    expect(second.version).toBe(2);
    expect(rows('sites')).toEqual([]);
  });

  it('atomically activates a property and vacant inventory while preserving unrelated work', async () => {
    const company = boundary.principal!.company.id;
    rows('sites').push({ tenantId: company, id: 'existing-facility', kind: 'facility', name: 'Existing facility' });
    rows('workOrders').push({ tenantId: company, id: 'owned-work-order', title: 'Existing work' });
    boundary.state!.auxiliary.unrelated = { preferences: true };
    boundary.state!.history[`${company}:work-order:owned-work-order`] = [{ event: 'CREATE' }];
    const record = await completeNativeOwnerSetup(subject(), completeDraft(), 0);
    expect(record).toMatchObject({ version: 1, activatedProperty: { name: 'Palm Court', unitCount: 3 }, completedAt: expect.any(String) });
    const estate = rows('sites').find((row) => row.id === record.activatedProperty!.id)!;
    expect(estate).toMatchObject({ tenantId: company, name: 'Palm Court', address: '18 Test Avenue, Lagos, Lagos, NG', unitCount: 3, buildingCount: 1 });
    expect(rows('buildings')).toHaveLength(1);
    expect(rows('units')).toHaveLength(3);
    expect(rows('units').map((row) => row.label)).toEqual(['Unit 1', 'Unit 2', 'Unit 3']);
    expect(rows('units').every((row) => row.tenantId === company && row.siteId === estate.id && row.occupancy === 'vacant' && row.type === 'Unspecified')).toBe(true);
    expect(rows('estateRegistrationAudit')).toEqual([expect.objectContaining({ action: 'property.created', entityId: estate.id, actorId: boundary.principal!.user.id })]);
    expect(rows('estateRegistrationReceipts')).toEqual([expect.objectContaining({ kind: 'property', result: { id: estate.id, name: 'Palm Court' } })]);
    expect(rows('estateCreatorAssignments')).toEqual([expect.objectContaining({ siteId: estate.id, source: 'estate_property_registration' })]);
    expect(rows('sites')).toContainEqual(expect.objectContaining({ id: 'existing-facility' }));
    expect(rows('workOrders')).toEqual([{ tenantId: company, id: 'owned-work-order', title: 'Existing work' }]);
    expect(boundary.state!.auxiliary.unrelated).toEqual({ preferences: true });
    expect(rows('invoices')).toEqual([]); expect(rows('residents')).toEqual([]); expect(rows('users')).toEqual([]);
    expect(boundary.state!.auxiliary.ownerOnboarding).toMatchObject({ tenantId: company, planKey: 'growth', record });
  });

  it('returns its original successful activation on retry and refuses draft reopening', async () => {
    const draft = completeDraft();
    const record = await completeNativeOwnerSetup(subject(), draft, 0);
    const counts = { sites: rows('sites').length, units: rows('units').length, receipts: rows('estateRegistrationReceipts').length };
    expect(await completeNativeOwnerSetup(subject(), { ...draft, firstProperty: { ...draft.firstProperty, name: 'A different valid name' } }, 0)).toEqual(record);
    expect({ sites: rows('sites').length, units: rows('units').length, receipts: rows('estateRegistrationReceipts').length }).toEqual(counts);
    await expect(saveNativeOwnerSetup(subject(), draft, record.version)).rejects.toBeInstanceOf(OnboardingConflictError);
    expect(await getNativeOwnerSetup(subject())).toEqual(record);
  });

  it.each([
    ['apartment', 'Apartment'], ['house', 'House'], ['commercial', 'Commercial unit'],
    ['building', 'Unspecified'], ['estate', 'Unspecified'], ['mixed_use', 'Unspecified'],
  ] as const)('keeps %s property classification separate from its initial unit type', async (propertyType, unitType) => {
    const draft = completeDraft(); draft.firstProperty.propertyType = propertyType;
    await completeNativeOwnerSetup(subject(), draft, 0);
    expect(rows('units').map((unit) => unit.type)).toEqual([unitType, unitType, unitType]);
    expect((await getNativeOwnerSetup(subject())).draft.firstProperty.propertyType).toBe(propertyType);
  });

  it('rejects incomplete, extra-authority and control-character input before any mutation', async () => {
    const before = structuredClone(boundary.state);
    await expect(completeNativeOwnerSetup(subject(), EMPTY_OWNER_SETUP, 0)).rejects.toThrow('Complete all');
    await expect(completeNativeOwnerSetup(subject(), { ...completeDraft(), tenantId: randomUUID() } as OwnerSetupDraft, 0)).rejects.toThrow();
    await expect(completeNativeOwnerSetup(subject(), { ...completeDraft(), firstProperty: { ...completeDraft().firstProperty, name: 'Bad\u0000name' } }, 0)).rejects.toThrow('control characters');
    await expect(completeNativeOwnerSetup(subject(), { ...completeDraft(), firstProperty: { ...completeDraft().firstProperty, units: 10_001 } }, 0)).rejects.toThrow();
    await expect(saveNativeOwnerSetup(subject(), EMPTY_OWNER_SETUP, -1)).rejects.toThrow('version');
    expect(boundary.state).toEqual(before);
  });

  it('binds every read and write to the company that opened the form', async () => {
    const originalSubject = subject();
    await saveNativeOwnerSetup(originalSubject, completeDraft(), 0);
    const oldState = structuredClone(boundary.state);
    boundary.principal = principal(); boundary.state = blankCompanyWorkspaceState();
    await expect(getNativeOwnerSetup(originalSubject)).rejects.toThrow('original company');
    await expect(saveNativeOwnerSetup(originalSubject, completeDraft(), 0)).rejects.toThrow('original company');
    await expect(completeNativeOwnerSetup(originalSubject, completeDraft(), 0)).rejects.toThrow('original company');
    expect(boundary.state!.auxiliary).toEqual({}); expect(rows('sites')).toEqual([]);
    boundary.state!.auxiliary.ownerOnboarding = oldState!.auxiliary.ownerOnboarding;
    await expect(getNativeOwnerSetup(subject())).rejects.toThrow('another company');
  });

  it.each(['admin', 'member', 'demo', 'no-manage', 'revoked', 'suspended'] as const)('denies %s setup authority', async (kind) => {
    const current = boundary.principal!;
    if (kind === 'demo') boundary.principal = principal(current.company.id, DEMO_ACCOUNTS[0].userId);
    else if (kind === 'admin' || kind === 'member') current.membership.companyRole = kind;
    else if (kind === 'no-manage') current.actor = { ...current.actor, companyAccess: { ...current.actor.companyAccess!, modules: { estate: 'view' } } };
    else if (kind === 'revoked') current.membership.status = 'revoked';
    else current.membership.companyStatus = 'suspended';
    const before = structuredClone(boundary.state);
    await expect(getNativeOwnerSetup(subject())).rejects.toThrow('owner setup is unavailable');
    await expect(saveNativeOwnerSetup(subject(), completeDraft(), 0)).rejects.toThrow('owner setup is unavailable');
    await expect(completeNativeOwnerSetup(subject(), completeDraft(), 0)).rejects.toThrow('owner setup is unavailable');
    expect(boundary.state).toEqual(before);
  });

  it('requires a verified database context and fails closed on corrupt completed state', async () => {
    boundary.noContext = true;
    await expect(getNativeOwnerSetup(subject())).rejects.toThrow('owner setup is unavailable');
    boundary.noContext = false;
    const record = await completeNativeOwnerSetup(subject(), completeDraft(), 0);
    rows('sites').splice(0);
    await expect(getNativeOwnerSetup(subject())).rejects.toThrow('activated property is unavailable');
    await expect(completeNativeOwnerSetup(subject(), completeDraft(), record.version)).rejects.toThrow('activated property is unavailable');
    expect(rows('sites')).toEqual([]);
  });
});
