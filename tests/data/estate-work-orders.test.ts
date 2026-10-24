import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getHistory } from '@/server/data/store';
import { repos } from '@/server/data';
import { identityByKey, SEED } from '@/server/identities';
import { canEnterWorkspace } from '@/config/workspaces';
import type { Actor } from '@/lib/authz';

const boundary = vi.hoisted(() => ({ requireWorkspace: vi.fn(), devIdentityEnabled: vi.fn(), reviewActor: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/server/workspaces', () => ({ requireWorkspace: boundary.requireWorkspace }));
vi.mock('@/server/session', () => ({ devIdentityEnabled: boundary.devIdentityEnabled }));
vi.mock('@/server/review-auth', () => ({ isReviewActor: boundary.reviewActor, reviewModeEnabled: () => false }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidatePath }));
import { createEstateWorkOrder } from '@/server/actions/estate-work-orders';

const initialOrders = structuredClone(db.workOrders);
const request = () => ({ siteId: SEED.estateGardens, title: 'Repair gatehouse pipe', description: 'Leak near the entrance.\nPlease inspect safely.', priority: 'high', idempotencyKey: randomUUID() });

function actAs(key = 'estate_manager', overrides: Partial<Actor> = {}, sessionKey?: string) {
  const identity = identityByKey(key);
  const session = { ...identity, key: sessionKey ?? identity.key, actor: { ...identity.actor, ...overrides } };
  boundary.requireWorkspace.mockImplementation(async (workspace: unknown) => {
    if (!canEnterWorkspace(session.actor, workspace)) throw new Error('WORKSPACE_NOT_FOUND');
    return session;
  });
  return session;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DATA_SOURCE', '');
  db.workOrders.splice(0, db.workOrders.length, ...structuredClone(initialOrders));
  boundary.devIdentityEnabled.mockReturnValue(true);
  boundary.reviewActor.mockReturnValue(false);
  actAs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  db.workOrders.splice(0, db.workOrders.length, ...structuredClone(initialOrders));
});

describe('Estate-owned manager work-order creation', () => {
  it('creates a scoped new unassigned request, records actor-attributed CREATE and stays in Estate', async () => {
    const session = actAs();
    const input = request();
    const result = await createEstateWorkOrder(input);
    expect(result).toMatchObject({ ok: true, ref: expect.stringMatching(/^WO-\d+$/) });
    if (!result.ok) throw new Error(result.error);
    expect(boundary.requireWorkspace).toHaveBeenCalledWith('estate');
    const created = repos.workOrders.getByRef(session.actor, result.ref)!;
    expect(created).toMatchObject({ tenantId: session.actor.tenantId, siteId: input.siteId, estateId: input.siteId, title: input.title, description: input.description,
      priority: 'high', status: 'new', origin: 'manager', requesterUserId: session.actor.userId,
      createdBy: session.actor.userId, updatedBy: session.actor.userId, assigneeName: 'Unassigned', cost: null, respondDueAt: null, resolveDueAt: null });
    expect(created.assigneeUserId).toBeUndefined();
    expect(created.vendorOrgId).toBeUndefined();
    expect(created.createdAt).toBe(created.updatedAt);
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    expect(getHistory('work-order', created.id)).toEqual([expect.objectContaining({ event: 'CREATE', from: null, to: 'new', actorId: session.actor.userId, actorRole: 'estate_manager' })]);
    for (const path of ['/estate/work-orders', `/estate/work-orders/${result.ref}`, '/work-orders', `/work-orders/${result.ref}`, '/estate', '/facility', '/dashboard', '/portal', '/portal/requests']) expect(boundary.revalidatePath).toHaveBeenCalledWith(path);
  });

  it('accepts an optional scoped unit without making the manager its resident or assigning a technician', async () => {
    const result = await createEstateWorkOrder({ ...request(), unitId: SEED.unitRes });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(db.workOrders.find((row) => row.ref === result.ref)?.unitId).toBe(SEED.unitRes);
  });

  it('normalizes title whitespace and CRLF details, and accepts memory adapter explicitly', async () => {
    vi.stubEnv('DATA_SOURCE', 'memory');
    const result = await createEstateWorkOrder({ ...request(), title: '  Repair gatehouse pipe  ', description: '  Detail\r\nSecond line  ' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(db.workOrders.find((row) => row.ref === result.ref)).toMatchObject({ title: 'Repair gatehouse pipe', description: 'Detail\nSecond line' });
  });

  it.each(['emergency', 'high', 'routine', 'low'])('stores the manager-selected %s priority without auto-triage', async (priority) => {
    const result = await createEstateWorkOrder({ ...request(), priority });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(db.workOrders.find((row) => row.ref === result.ref)).toMatchObject({ priority, status: 'new', respondDueAt: null, resolveDueAt: null });
  });

  it('replays an identical submission exactly once, including its audit event', async () => {
    const input = request();
    const first = await createEstateWorkOrder(input);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error);
    const count = db.workOrders.length;
    expect(await createEstateWorkOrder({ ...input, title: ` ${input.title} ` })).toEqual(first);
    expect(db.workOrders).toHaveLength(count);
    expect(getHistory('work-order', db.workOrders.find((row) => row.ref === first.ref)!.id)).toHaveLength(1);
    expect(await createEstateWorkOrder({ ...input, title: 'Different work order' })).toMatchObject({ ok: false, error: expect.stringContaining('different details') });
    expect(db.workOrders).toHaveLength(count);
  });

  it('binds a browser submission key to the trusted actor and tenant', async () => {
    const input = request();
    const first = await createEstateWorkOrder(input);
    actAs('estate_manager', { userId: 'other-manager' });
    const second = await createEstateWorkOrder(input);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('Expected both authorised managers to create their own requests.');
    expect(first.ref).not.toBe(second.ref);
  });

  it('allocates a non-colliding reference even if rows are unordered', async () => {
    const source = db.workOrders[0];
    const maximum = Math.max(...db.workOrders.map((row) => Number(/^WO-(\d+)$/.exec(row.ref)?.[1] ?? 0))) + 777;
    db.workOrders.unshift({ ...source, id: 'fixture-high-reference' as typeof source.id, ref: `WO-${maximum}` });
    const first = await createEstateWorkOrder(request());
    const second = await createEstateWorkOrder(request());
    expect(first).toEqual({ ok: true, ref: `WO-${maximum + 1}` });
    expect(second).toEqual({ ok: true, ref: `WO-${maximum + 2}` });
    expect(new Set(db.workOrders.map((row) => row.ref)).size).toBe(db.workOrders.length);
  });

  it.each(['tenantId', 'actorId', 'userId', 'requesterUserId', 'estateId', 'roles', 'status', 'origin', 'assigneeUserId', 'cost', 'respondDueAt', 'id'])('rejects caller-owned %s fields without writes', async (field) => {
    const count = db.workOrders.length;
    expect(await createEstateWorkOrder({ ...request(), [field]: 'forged' })).toMatchObject({ ok: false });
    expect(db.workOrders).toHaveLength(count);
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    { title: 'Hi' }, { title: 'x'.repeat(161) }, { title: 'Broken\u0000pipe' }, { description: 'x'.repeat(3001) },
    { description: 'Detail\u0000text' }, { priority: 'critical' }, { priority: null }, { idempotencyKey: 'not-a-uuid' },
    { siteId: '' }, { unitId: '' },
  ])('rejects invalid input %j without writes', async (invalid) => {
    const count = db.workOrders.length;
    expect(await createEstateWorkOrder({ ...request(), ...invalid })).toMatchObject({ ok: false });
    expect(db.workOrders).toHaveLength(count);
  });

  it.each(['s-ikoyi', 's-victoria', 'missing-estate'])('rejects out-of-scope/non-estate property %s', async (siteId) => {
    const count = db.workOrders.length;
    expect(await createEstateWorkOrder({ ...request(), siteId })).toMatchObject({ ok: false });
    expect(db.workOrders).toHaveLength(count);
  });

  it('does not treat Facility property access as Estate ownership for a mixed-role operator', async () => {
    actAs('facility_manager', { roles: ['estate_manager', 'facility_manager'] });
    const count = db.workOrders.length;
    expect(await createEstateWorkOrder({ ...request(), siteId: SEED.estateVictoria })).toMatchObject({ ok: false });
    expect(db.workOrders).toHaveLength(count);
  });

  it.each(['u-v508', 'u-ikoyi-1', 'missing-unit'])('rejects a mismatched or foreign unit %s', async (unitId) => {
    const count = db.workOrders.length;
    expect(await createEstateWorkOrder({ ...request(), unitId })).toMatchObject({ ok: false });
    expect(db.workOrders).toHaveLength(count);
  });

  it('rejects the view-only executive even though they may enter Estate', async () => {
    actAs('executive');
    expect(await createEstateWorkOrder(request())).toMatchObject({ ok: false, error: expect.stringContaining('permission') });
    expect(db.workOrders).toHaveLength(initialOrders.length);
  });

  it.each(['resident', 'technician', 'vendor', 'platform_admin', 'investor'])('requires Estate workspace admission for %s', async (role) => {
    actAs(role);
    await expect(createEstateWorkOrder(request())).rejects.toThrow('WORKSPACE_NOT_FOUND');
    expect(db.workOrders).toHaveLength(initialOrders.length);
  });

  it.each(['http', 'postgres', 'unknown'])('refuses unsafe %s persistence rather than claiming a durable save', async (source) => {
    vi.stubEnv('DATA_SOURCE', source);
    if (source === 'postgres') {
      await expect(createEstateWorkOrder(request())).rejects.toThrow('Durable operational storage requires a configured, verified workspace identity.');
      expect(boundary.requireWorkspace).not.toHaveBeenCalled();
    } else expect(await createEstateWorkOrder(request())).toMatchObject({ ok: false, error: expect.stringContaining('No work order was created') });
    vi.stubEnv('DATA_SOURCE', 'memory');
    expect(db.workOrders).toHaveLength(initialOrders.length);
  });

  it('refuses production, real Clerk sessions and disabled demo identity writes', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await createEstateWorkOrder(request())).toMatchObject({ ok: false });
    vi.stubEnv('NODE_ENV', 'development');
    actAs('estate_manager', {}, 'clerk');
    expect(await createEstateWorkOrder(request())).toMatchObject({ ok: false });
    actAs();
    boundary.devIdentityEnabled.mockReturnValue(false);
    expect(await createEstateWorkOrder(request())).toMatchObject({ ok: false });
    expect(db.workOrders).toHaveLength(initialOrders.length);
  });

  it('permits a verified signed private review to create only scoped sample rows in hosted production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DATA_SOURCE', 'memory');
    boundary.devIdentityEnabled.mockReturnValue(false);
    const session = actAs('estate_manager', { userId: 'propbrew-private-review-estate-manager' }, 'private-review');
    boundary.reviewActor.mockImplementation((actor: Actor) => actor.userId === session.actor.userId && actor.tenantId === session.actor.tenantId);
    expect(await createEstateWorkOrder(request())).toMatchObject({ ok: true });
    expect(boundary.reviewActor).toHaveBeenCalledWith(session.actor);
    expect(await createEstateWorkOrder({ ...request(), siteId: SEED.estateVictoria })).toMatchObject({ ok: false });
    expect(await createEstateWorkOrder({ ...request(), siteId: SEED.estateIkoyi })).toMatchObject({ ok: false });
    vi.stubEnv('DATA_SOURCE', 'http');
    expect(await createEstateWorkOrder(request())).toMatchObject({ ok: false });
  });

  it('does not treat a private-review session label alone as verified review access', async () => {
    vi.stubEnv('NODE_ENV', 'production'); boundary.devIdentityEnabled.mockReturnValue(false);
    actAs('estate_manager', {}, 'private-review');
    expect(await createEstateWorkOrder(request())).toMatchObject({ ok: false });
    expect(db.workOrders).toHaveLength(initialOrders.length);
  });
});
