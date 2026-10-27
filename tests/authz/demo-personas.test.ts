import { describe, expect, it } from 'vitest';
import { DEMO_PERSONAS, demoPersonaById } from '@/config/demo-personas';
import { canUseCompanyModule } from '@/lib/auth/company-policy';
import { can } from '@/lib/authz';
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
    expect(projected.estateIds).toEqual('estateIds' in persona ? persona.estateIds : base.estateIds);
    expect(projected.buildingIds).toEqual('buildingIds' in persona ? persona.buildingIds : base.buildingIds);
    expect(projected.allEstates).toBe('allEstates' in persona ? persona.allEstates : base.allEstates);
    expect(projected.unitIds).toEqual('unitIds' in persona ? persona.unitIds : base.unitIds);
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

  it('enforces distinct Estate job-profile ceilings instead of label-only personas', () => {
    const finance = projectDemoSandboxActor(base, demoPersonaById('finance-officer'));
    expect(can(finance, 'charges_invoicing', 'update').allowed).toBe(true);
    expect(can(finance, 'security_sos', 'read').allowed).toBe(false);

    const auditor = projectDemoSandboxActor(base, demoPersonaById('auditor'));
    expect(can(auditor, 'reports_analytics', 'read').allowed).toBe(true);
    expect(can(auditor, 'reports_analytics', 'update').allowed).toBe(false);

    const guard = projectDemoSandboxActor(base, demoPersonaById('security-guard'));
    expect(can(guard, 'security_sos', 'transition').allowed).toBe(true);
    expect(can(guard, 'security_sos', 'approve').allowed).toBe(false);
    expect(can(guard, 'charges_invoicing', 'read').allowed).toBe(false);

    const board = projectDemoSandboxActor(base, demoPersonaById('board-approver'));
    expect(can(board, 'bookings_amenities', 'approve').allowed).toBe(true);
    expect(can(board, 'bookings_amenities', 'update').allowed).toBe(false);
  });

  it('cannot project an unverified actor without a company membership', () => {
    expect(() => projectDemoSandboxActor({ ...base, companyAccess: undefined }, DEMO_PERSONAS[0])).toThrow(/company-scoped demo actor/i);
  });
});
