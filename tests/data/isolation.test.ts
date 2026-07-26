/**
 * SC-07 / §8.2 — cross-tenant & scope isolation, exercised through the REAL data
 * access layer (repos) rather than the matrix in isolation. The PRD makes these
 * "release-blocking" and requires them to "pass in CI"; this is that gate for
 * the seed adapter, and it transfers unchanged to the future HTTP adapter.
 *
 * Note the DAL is server-only, so these import the scope engine + fixtures
 * directly and reconstruct the same scopedList path the repos use.
 */

import { describe, expect, it } from 'vitest';
import { assertCan, applyScope, type Actor, type Capability, type ScopableRow } from '@/lib/authz';
import { SEED } from '@/server/identities';
import * as seed from '@/server/data/seed/fixtures';

function scoped<T extends ScopableRow>(actor: Actor, cap: Capability, rows: readonly T[]): readonly T[] {
  return applyScope(rows, assertCan(actor, cap, 'read'));
}

const base = {
  estateIds: [] as readonly string[],
  allEstates: false,
  unitIds: [] as readonly string[],
  vendorOrgId: null as string | null,
  investorProjectIds: [] as readonly string[],
};

const lekkiEstateManager: Actor = { ...base, userId: 'u-em', tenantId: SEED.tenantA, roles: ['estate_manager'], estateIds: [SEED.estateGardens] };
const lekkiFacilityManager: Actor = { ...base, userId: 'u-fm', tenantId: SEED.tenantA, roles: ['facility_manager'], estateIds: [SEED.estateGardens, SEED.estateVictoria] };
const resident: Actor = { ...base, userId: 'user-resident', tenantId: SEED.tenantA, roles: ['resident'], allEstates: true, unitIds: [SEED.unitRes] };
const vendor: Actor = { ...base, userId: 'u-ven', tenantId: SEED.tenantA, roles: ['vendor'], allEstates: true, vendorOrgId: SEED.vendorOrg };
const platformAdmin: Actor = { ...base, userId: 'u-pa', tenantId: null, roles: ['platform_admin'], allEstates: true };

describe('tenant isolation — no Lekki actor ever sees Ikoyi (tenant B) data', () => {
  it('estate manager work orders are all tenant A', () => {
    const rows = scoped(lekkiEstateManager, 'work_orders', seed.workOrders);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((w) => w.tenantId === SEED.tenantA)).toBe(true);
    expect(rows.some((w) => w.tenantId === SEED.tenantB)).toBe(false);
  });

  it('the Ikoyi work order (tenant B) is never in a Lekki result', () => {
    const rows = scoped(lekkiFacilityManager, 'work_orders', seed.workOrders);
    expect(rows.find((w) => w.ref === 'WO-90001')).toBeUndefined();
  });

  it('invoices, assets and residents are all tenant-A for a tenant-A manager', () => {
    expect(scoped(lekkiEstateManager, 'charges_invoicing', seed.invoices).every((i) => i.tenantId === SEED.tenantA)).toBe(true);
    expect(scoped(lekkiFacilityManager, 'assets_ppm', seed.assets).every((a) => a.tenantId === SEED.tenantA)).toBe(true);
    expect(scoped(lekkiEstateManager, 'users_roles', seed.residents).every((r) => r.tenantId === SEED.tenantA)).toBe(true);
  });
});

describe('estate scoping — a single-estate manager never sees other estates', () => {
  it('the Gardens-only estate manager does not see the Victoria chiller WO', () => {
    const rows = scoped(lekkiEstateManager, 'work_orders', seed.workOrders);
    expect(rows.every((w) => w.estateId === SEED.estateGardens)).toBe(true);
    expect(rows.find((w) => w.ref === 'WO-24814')).toBeUndefined(); // Victoria
  });

  it('the two-estate facility manager DOES see the Victoria asset', () => {
    const rows = scoped(lekkiFacilityManager, 'assets_ppm', seed.assets);
    expect(rows.find((a) => a.siteId === SEED.estateVictoria)).toBeDefined();
    expect(rows.find((a) => a.siteId === SEED.estateGardens)).toBeDefined();
  });
});

describe('own-records-only (O) — a resident sees only their own rows', () => {
  it('a resident sees only invoices they own', () => {
    const rows = scoped(resident, 'charges_invoicing', seed.invoices);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((i) => i.ownerUserId === 'user-resident')).toBe(true);
    // never another resident's invoice
    expect(rows.some((i) => i.residentName === 'Tobi Ade')).toBe(false);
  });

  it("a resident's work orders are only ones they requested or on their unit", () => {
    const rows = scoped(resident, 'work_orders', seed.workOrders);
    expect(rows.every((w) => w.requesterUserId === 'user-resident' || w.unitId === SEED.unitRes)).toBe(true);
  });

  it('a vendor sees only work orders assigned to its own org', () => {
    const rows = scoped(vendor, 'work_orders', seed.workOrders);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((w) => w.vendorOrgId === SEED.vendorOrg)).toBe(true);
  });
});

describe('platform admin — the one legitimate cross-tenant reader', () => {
  it('sees work orders from BOTH tenants', () => {
    const rows = scoped(platformAdmin, 'work_orders', seed.workOrders);
    expect(rows.some((w) => w.tenantId === SEED.tenantA)).toBe(true);
    expect(rows.some((w) => w.tenantId === SEED.tenantB)).toBe(true);
  });
});
