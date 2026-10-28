import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({
  residents: [{ tenantId: 't', id: 'r', userId: 'u', unitId: 'unit-1', siteId: 'estate-1', name: 'Chris Pradana', status: 'active' }],
  invoices: [{ tenantId: 't', id: 'i', ref: 'INV-1', unitId: 'unit-1', ownerUserId: 'u', estateId: 'estate-1', status: 'in_arrears', amount: { minor: 450000, currency: 'NGN' }, paid: { minor: 50000, currency: 'NGN' } }],
  wallets: [{ tenantId: 't', id: 'w', unitId: 'unit-1', ownerUserId: 'u', available: { minor: 17000, currency: 'NGN' } }],
}));
vi.mock('@/server/data', () => ({ repos: new Proxy({}, { get: (_, key) => ({ list: () => ({ items: rows[key as keyof typeof rows] ?? [] }) }) }) }));

import { mobileTenantBootstrap } from '@/server/mobile/bootstrap';

describe('mobile tenant bootstrap', () => {
  it('returns only the actor-scoped unit and keeps NGN in minor units', () => {
    const result = mobileTenantBootstrap({ userId: 'u', tenantId: 't', roles: ['resident'], estateIds: ['estate-1'], allEstates: false, unitIds: ['unit-1'], vendorOrgId: null, investorProjectIds: [] }, 'Fallback Name');
    expect(result.profile).toMatchObject({ firstName: 'Chris', activeUnitId: 'unit-1' });
    expect(result.summary.wallet).toEqual({ minor: 17000, currency: 'NGN' });
    expect(result.summary.pending).toEqual([{ minor: 400000, currency: 'NGN' }]);
  });
});
