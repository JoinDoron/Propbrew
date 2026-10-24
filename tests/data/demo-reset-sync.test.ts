import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_ACCOUNTS } from '@/server/auth/demo-config';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext } from '@/server/data/record-context';
import type { CompanyPrincipal } from '@/server/auth/company';
import { syncOperation, type SyncInput } from '@/server/actions/sync';
import { outboxOwnerKey } from '@/domain/sync';

const auth = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: auth.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
beforeEach(() => { vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('DATA_SOURCE', 'postgres'); vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '1'); vi.stubEnv('PROPBREW_DEMO_PASSWORD', 'synthetic-private-demo-reset-password-32'); });
afterEach(() => vi.unstubAllEnvs());

async function check(offset: number, demo = true) {
  const tenantId = randomUUID(), userId = demo ? DEMO_ACCOUNTS[0].userId : randomUUID();
  const state = createDemoWorkspaceState(tenantId, demo ? userId : undefined);
  const projects = state.collections.constructionProjects as { id: string }[];
  const actor = actorForCompanyMember({ membershipId: randomUUID(), userId, companyId: tenantId, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' }, estateIds: [], allEstates: true }, userId)!;
  const resetAt = Date.now() - 60000;
  state.auxiliary.demoResetAt = new Date(resetAt).toISOString();
  const principal: CompanyPrincipal = { user: { id: userId, name: 'Sample operator', email: 'sample@example.invalid' }, session: { id: randomUUID() }, actor, company: { id: tenantId, name: 'Sample' }, sandbox: demo ? { id: tenantId, expiresAt: new Date(Date.now() + 3600000).toISOString() } : undefined,
    membership: { membershipId: actor.companyAccess!.membershipId, userId, companyId: tenantId, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' }, estateIds: [], allEstates: true, version: '1' } };
  auth.actor.mockResolvedValue(actor);
  const before = structuredClone(state);
  const op: SyncInput = { id: randomUUID(), owner: outboxOwnerKey(tenantId, userId)!, kind: 'site_issue', capturedISO: new Date(resetAt + offset).toISOString(), payload: { projectId: projects[0].id, title: 'Offline sandbox capture', severity: 'low' } };
  const result = await runWithRecordContext({ state, domainTenantId: tenantId, mode: 'write', companyPrincipal: principal }, () => syncOperation(op));
  return { state, before, result };
}

describe('offline construction captures after a private sandbox reset', () => {
  it.each([-1000, 0])('refuses a capture %ims from reset without restoring old rows or receipts', async (offset) => {
    const { state, before, result } = await check(offset);
    expect(result).toMatchObject({ ok: false, conflict: true, serverState: 'Sandbox reset' }); expect(state).toEqual(before);
  });
  it('accepts a new capture made after reset', async () => {
    const { state, before, result } = await check(1000);
    expect(result).toMatchObject({ ok: true, duplicate: false });
    expect(state.collections.constructionIssues).toHaveLength((before.collections.constructionIssues as unknown[]).length + 1);
  });
  it('leaves normal company offline capture behavior unchanged', async () => {
    const { result } = await check(-1000, false); expect(result).toMatchObject({ ok: true, duplicate: false });
  });
});
