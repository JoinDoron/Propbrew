import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_MODULE_GRANTS, DEMO_TENANT_ID } from '@/server/auth/demo-accounts.mjs';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { db, validateWorkspaceRecordState } from '@/server/data/store';
import { runWithRecordContext } from '@/server/data/record-context';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { repos } from '@/server/data';
import * as seed from '@/server/data/seed/fixtures';

beforeEach(() => vi.stubEnv('DATA_SOURCE', 'memory'));
afterEach(() => vi.unstubAllEnvs());

describe('isolated public demo fixtures', () => {
  it('populates every module from source fixtures and rewrites all tenant namespaces', () => {
    const state = createDemoWorkspaceState();
    expect(validateWorkspaceRecordState(state, DEMO_TENANT_ID)).toBe(state);
    for (const name of ['sites', 'residents', 'workOrders', 'facilitySensors', 'shortletProperties', 'shortletBookings', 'constructionProjects', 'constructionTasks', 'assets', 'vendors', 'investorProjects']) {
      expect(Array.isArray(state.collections[name]), name).toBe(true);
      expect((state.collections[name] as unknown[]).length, name).toBeGreaterThan(0);
    }
    expect(JSON.stringify(state)).not.toMatch(/"tenantId":"t-|Ikoyi Heights/);
    expect(state.history).toEqual({});
    expect(state.collections.copilotUsage).toEqual([]);
    expect(state.collections.shortletBookingPage).toMatchObject({ enabled: false, promoCodes: [] });
  });

  it('does not copy mutable process records or database records into the public demo', () => {
    const original = db.sites;
    try {
      db.sites = [{ ...seed.sites[0], name: 'PRIVATE CUSTOMER RECORD NEVER PUBLISH' }];
      const state = createDemoWorkspaceState();
      expect(JSON.stringify(state)).not.toContain('PRIVATE CUSTOMER RECORD NEVER PUBLISH');
      expect((state.collections.sites as { name: string }[]).map((row) => row.name)).toContain('Lekki Gardens Estate');
    } finally { db.sites = original; }
  });

  it('makes independent deep clones without modifying the immutable source', () => {
    const before = JSON.stringify(seed.constructionTasks);
    const first = createDemoWorkspaceState();
    const second = createDemoWorkspaceState();
    const firstTasks = first.collections.constructionTasks as { dependsOn: string[] }[];
    const secondTasks = second.collections.constructionTasks as { dependsOn: string[] }[];
    firstTasks[0].dependsOn.push('demo-only-change');
    expect(secondTasks[0].dependsOn).not.toContain('demo-only-change');
    expect(JSON.stringify(seed.constructionTasks)).toBe(before);
  });

  it('serves stored asset, vendor and investor registers through ordinary tenant scopes', () => {
    const state = createDemoWorkspaceState();
    const actor = actorForCompanyMember({ membershipId: 'demo-membership', userId: DEMO_ACCOUNTS[0].userId,
      companyId: DEMO_TENANT_ID, status: 'active', companyStatus: 'active', companyRole: 'member',
      modules: DEMO_MODULE_GRANTS, allEstates: true, estateIds: [] }, DEMO_ACCOUNTS[0].userId)!;
    runWithRecordContext({ state, domainTenantId: DEMO_TENANT_ID, mode: 'read' }, () => {
      expect(repos.assets.list(actor).items.length).toBeGreaterThan(0);
      expect(repos.vendors.list(actor).items.length).toBeGreaterThan(0);
      expect(() => repos.investorProjects.list(actor)).toThrow('Not found');
      expect(repos.assets.list({ ...actor, tenantId: 'another-company' }).items).toEqual([]);
    });
  });
});
