import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember, type CompanyModuleGrants } from '@/lib/auth/company-policy';
import { can } from '@/lib/authz';
import { initialWorkspaceRecordState } from '@/server/data/store';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import type { CompanyPrincipal } from '@/server/auth/company';

const boundary = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { updateTaskProgress } from '@/server/actions/construction';
import { openMotion } from '@/server/actions/estate';
import { changePlan } from '@/server/actions/shortlet';
import { syncOperation } from '@/server/actions/sync';
import { fireWoTransition } from '@/server/actions/work-orders';
import { markNotificationsRead, sendMessage } from '@/server/actions/inbox';
import { askData } from '@/server/actions/ask-data';

let state: WorkspaceRecordState;
beforeEach(() => {
  vi.stubEnv('DATA_SOURCE', 'memory');
  state = initialWorkspaceRecordState('t-lekki');
  vi.stubEnv('DATA_SOURCE', 'postgres');
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

function run<T>(modules: CompanyModuleGrants, fn: () => T) {
  const actor = actorForCompanyMember({
    membershipId: 'verified-member', userId: 'company-operator', companyId: 't-lekki',
    companyRole: 'member', modules, estateIds: [], allEstates: true, status: 'active', companyStatus: 'active',
  }, 'company-operator')!;
  boundary.getActor.mockResolvedValue(actor);
  const companyPrincipal = { actor } as CompanyPrincipal;
  return runWithRecordContext({ state, domainTenantId: 't-lekki', mode: 'write', companyPrincipal }, fn);
}

describe('direct actions require their own module grant before executing', () => {
  it('cannot mutate Construction through an Estate-manager capability with Construction view access', async () => {
    const before = structuredClone(state);
    await expect(run({ estate: 'manage', construction: 'view' }, () => updateTaskProgress('task-id', 80))).rejects.toThrow('cannot perform this action');
    expect(boundary.getActor).not.toHaveBeenCalled();
    expect(state).toEqual(before);
  });

  it('cannot mutate Estate governance through a Facility-manager announcement capability', async () => {
    const before = structuredClone(state);
    await expect(run({ facility: 'manage', estate: 'view' }, () => openMotion('motion-id'))).rejects.toThrow('cannot perform this action');
    expect(boundary.getActor).not.toHaveBeenCalled();
    expect(state).toEqual(before);
  });

  it('cannot change Shortlet settings through Estate booking management with Shortlet view access', async () => {
    const before = structuredClone(state);
    await expect(run({ estate: 'manage', shortlet: 'view' }, () => changePlan('growth'))).rejects.toThrow('cannot perform this action');
    expect(boundary.getActor).not.toHaveBeenCalled();
    expect(state).toEqual(before);
  });

  it('does not accept an offline Construction operation from another module manager', async () => {
    await expect(run({ estate: 'manage' }, () => syncOperation({
      id: 'offline-module-check', owner: 'forged-client-module', kind: 'site_issue',
      capturedISO: '2026-10-24T12:00:00Z', payload: { projectId: 'project', title: 'Site issue', severity: 'high' },
    }))).rejects.toThrow('cannot perform this action');
    expect(boundary.getActor).not.toHaveBeenCalled();
    expect(state.collections.syncLedger).toEqual([]);
  });

  it('permits a legitimate shared work-order transition from Facility without Estate access', async () => {
    const orders = state.collections.workOrders as { id: string; ref: string; status: string }[];
    const order = orders[0];
    order.status = 'new';
    const historyKey = 't-lekki:work-order:' + order.id;
    const previousHistory = structuredClone(state.history[historyKey] ?? []);
    const result = await run({ facility: 'manage' }, async () => {
      expect(can(await boundary.getActor(), 'work_orders', 'transition').allowed).toBe(true);
      return fireWoTransition(order.ref, 'TRIAGE');
    });
    expect(result).toEqual({ ok: true, to: 'triaged' });
    expect(order.status).toBe('triaged');
    expect(state.history[historyKey]).toEqual([...previousHistory, expect.objectContaining({ event: 'TRIAGE', actorId: 'company-operator' })]);
  });

  it('allows a viewer to mark their own notices read while refusing message authoring', async () => {
    await expect(run({ construction: 'view' }, () => markNotificationsRead())).resolves.toBeUndefined();
    expect(boundary.getActor).toHaveBeenCalledOnce();
    await expect(run({ construction: 'view' }, () => sendMessage('some-thread', 'New message'))).rejects.toThrow('cannot perform this action');
  });

  it('does not expose the legacy Estate report query through shared Facility capabilities', async () => {
    const before = structuredClone(state);
    const response = await run({ facility: 'manage' }, () => askData('How many residents and units?'));
    expect(response).toEqual({
      matched: false, answer: 'Your account does not have access to Estate reports.',
      sources: [], confidence: 0, scopeLabel: 'Estate workspace unavailable',
    });
    expect(state).toEqual(before);
  });
});
