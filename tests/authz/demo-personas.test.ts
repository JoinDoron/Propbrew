import { describe, expect, it } from 'vitest';
import { DEMO_PERSONAS, demoPersonaById } from '@/config/demo-personas';
import { canUseCompanyModule } from '@/lib/auth/company-policy';
import { projectDemoSandboxActor } from '@/lib/auth/demo-persona';
import type { Actor } from '@/lib/authz';
import type { WorkspaceId } from '@/config/workspaces';

const base: Actor = {
  userId: '8fd60a0b-3fd5-4301-8f01-8c42c2e34d01',
  tenantId: '3b626aaf-fc18-4bc4-9448-64a27f43e276',
  roles: ['estate_manager', 'facility_manager'], estateIds: ['estate-1'], allEstates: true,
  unitIds: [], vendorOrgId: null, investorProjectIds: [],
  companyAccess: {
    membershipId: 'membership-1', companyRole: 'member',
    modules: { estate: 'manage', facility: 'manage', shortlet: 'manage', construction: 'manage' },
  },
};

describe('private demo personas', () => {
  it('uses an allowlisted default for missing or forged values', () => {
    expect(demoPersonaById(undefined).id).toBe('company-owner');
    expect(demoPersonaById('platform-admin').id).toBe('company-owner');
  });

  it.each(DEMO_PERSONAS)('narrows the actor to $label without changing tenant or ownership scope', (persona) => {
    const before = structuredClone(base);
    const projected = projectDemoSandboxActor(base, persona);
    expect(projected).not.toBe(base);
    expect(projected.userId).toBe(base.userId);
    expect(projected.tenantId).toBe(base.tenantId);
    expect(projected.estateIds).toEqual(base.estateIds);
    expect(projected.roles).toEqual(persona.roles);
    expect(projected.companyAccess?.modules).toEqual(persona.modules);
    expect(base).toEqual(before);

    const modules = persona.modules as Readonly<Partial<Record<WorkspaceId, 'manage' | 'view'>>>;
    for (const workspace of ['estate', 'facility', 'shortlet', 'construction'] as const) {
      const access = modules[workspace];
      expect(canUseCompanyModule(projected, workspace, 'read')).toBe(Boolean(access));
      expect(canUseCompanyModule(projected, workspace, 'update')).toBe(access === 'manage');
    }
  });

  it('cannot project an unverified actor without a company membership', () => {
    expect(() => projectDemoSandboxActor({ ...base, companyAccess: undefined }, DEMO_PERSONAS[0])).toThrow(/company-scoped demo actor/i);
  });
});
