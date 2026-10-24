import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboxOp } from '@/domain/sync';

const fake = vi.hoisted(() => ({
  effects: [] as (() => unknown)[],
  ops: new Map<string, OutboxOp[]>(),
  blobs: new Map<string, { opId: string; id: string; blob: Blob; name: string }[]>(),
  putBlob: vi.fn(), deleteBlobs: vi.fn(), sync: vi.fn(), abandon: vi.fn(), getOps: vi.fn(), clearOwner: vi.fn(),
}));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => unknown) => { fake.effects.push(fn); },
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('@/server/actions/sync', () => ({ syncOperation: fake.sync, abandonOperation: fake.abandon }));
vi.mock('@/lib/offline/idb', () => ({
  idbAvailable: () => true,
  idbGetOps: fake.getOps,
  idbPutOps: async (ops: OutboxOp[], owner: string) => { fake.ops.set(owner, structuredClone(ops)); },
  idbPutBlob: fake.putBlob,
  idbDeleteBlobsFor: fake.deleteBlobs,
  idbBlobsFor: async (opId: string, owner: string) => (fake.blobs.get(owner) ?? []).filter((file) => file.opId === opId),
  idbLegacyHasPending: async () => false,
  idbClearOwner: fake.clearOwner,
}));
const ownerA = JSON.stringify(['t-lekki', 'manager-A']), ownerB = JSON.stringify(['t-ikoyi', 'manager-B']);
let local: Map<string, string>;
const payload = { projectId: 'p-marina', title: 'Queued issue', severity: 'high' };
const pending = (over: Partial<OutboxOp> = {}): OutboxOp => ({ id: 'pending-id', kind: 'site_issue', label: 'Pending issue', capturedISO: '2026-07-26T09:00:00Z', payload, status: 'queued', attempts: 0, attachments: 0, ...over });
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); fake.effects = []; fake.ops.clear(); fake.blobs.clear(); local = new Map();
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value), removeItem: (key: string) => local.delete(key) }, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
  vi.stubGlobal('navigator', { onLine: true });
  fake.putBlob.mockImplementation(async (file, owner) => { fake.blobs.set(owner, [...(fake.blobs.get(owner) ?? []), file]); });
  fake.getOps.mockImplementation(async (owner) => fake.ops.get(owner) ?? []);
  fake.clearOwner.mockImplementation(async (owner) => { fake.ops.set(owner, []); fake.blobs.set(owner, []); });
  fake.deleteBlobs.mockImplementation(async (opId, owner) => { fake.blobs.set(owner, (fake.blobs.get(owner) ?? []).filter((f) => f.opId !== opId)); });
  fake.sync.mockImplementation(async (op) => ({ ok: true, id: op.id, duplicate: false })); fake.abandon.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllGlobals());

describe('account-bound durable device capture', () => {
  it('keeps two accounts queues separate without adopting or clearing unowned legacy work', async () => {
    local.set('vesta.outbox.v1', JSON.stringify([pending({ label: 'Unverified legacy record' })]));
    const outbox = await import('@/lib/offline/outbox');
    await outbox.capture(ownerA, 'site_issue', 'Account A', payload);
    await outbox.capture(ownerB, 'site_issue', 'Account B', payload);
    expect(outbox.useOutbox(ownerA).map((op) => op.label)).toEqual(['Account A']);
    expect(outbox.useOutbox(ownerB).map((op) => op.label)).toEqual(['Account B']);
    expect(outbox.useOutbox()).toEqual([]);
    expect(local.get('vesta.outbox.v1')).toContain('Unverified legacy record');
    expect(fake.ops.get(ownerA)?.[0].label).toBe('Account A');
    expect(fake.ops.get(ownerB)?.[0].label).toBe('Account B');
  });
  it('does not acknowledge or publish photo capture until its file transaction finishes', async () => {
    let release!: () => void;
    fake.putBlob.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const outbox = await import('@/lib/offline/outbox');
    const result = outbox.capture(ownerA, 'daily_report', 'Report with evidence', { projectId: 'p-marina', photos: 1 }, [new File(['photo'], 'site.jpg', { type: 'image/jpeg' })]);
    expect(outbox.useOutbox(ownerA)).toEqual([]);
    release(); const saved = await result;
    expect(saved.attachments).toBe(1); expect(outbox.useOutbox(ownerA)).toHaveLength(1);
  });
  it('rejects failed device photo/metadata storage without claiming a queued capture', async () => {
    const outbox = await import('@/lib/offline/outbox');
    fake.putBlob.mockRejectedValueOnce(new Error('Device photo storage full'));
    await expect(outbox.capture(ownerA, 'daily_report', 'Photo', { photos: 1 }, [new File(['photo'], 'site.jpg')])).rejects.toThrow('storage full');
    expect(outbox.useOutbox(ownerA)).toEqual([]); expect(fake.deleteBlobs).not.toHaveBeenCalled();
    window.localStorage.setItem = () => { throw new Error('Device metadata storage full'); };
    await expect(outbox.capture(ownerA, 'site_issue', 'Issue', payload)).rejects.toThrow('metadata storage full');
    expect(outbox.useOutbox(ownerA)).toEqual([]);
    await expect(outbox.capture(undefined, 'site_issue', 'Unsigned', payload)).rejects.toThrow('Sign in');
  });
  it('retains both record and files when the server refuses abandonment', async () => {
    const outbox = await import('@/lib/offline/outbox');
    const op = await outbox.capture(ownerA, 'daily_report', 'Photo', { photos: 1 }, [new File(['photo'], 'site.jpg')]);
    fake.abandon.mockResolvedValueOnce({ ok: false, error: 'No matching owned receipt' });
    await expect(outbox.abandon(ownerA, op.id)).rejects.toThrow('No matching owned receipt');
    expect(outbox.useOutbox(ownerA)).toHaveLength(1); expect(fake.blobs.get(ownerA)).toHaveLength(1); expect(fake.deleteBlobs).not.toHaveBeenCalled();
    await outbox.abandon(ownerA, op.id);
    expect(fake.abandon).toHaveBeenLastCalledWith(expect.objectContaining({ owner: ownerA, id: op.id }));
    expect(outbox.useOutbox(ownerA)).toEqual([]); expect(fake.deleteBlobs).toHaveBeenCalledWith(op.id, ownerA);
  });
  it('recovers interrupted sends only inside their owner namespace', async () => {
    fake.ops.set(ownerA, [pending({ status: 'sending' })]); fake.ops.set(ownerB, [pending({ label: 'Other owner' })]);
    const outbox = await import('@/lib/offline/outbox'); await outbox.hydrateFromIdb(ownerA);
    expect(outbox.useOutbox(ownerA)[0].status).toBe('queued'); expect(outbox.useOutbox(ownerB)).toEqual([]);
  });
  it('resets only the requested owner including queued media while preserving other and unowned work', async () => {
    local.set('vesta.outbox.v1', JSON.stringify([pending({ label: 'Unverified legacy record' })]));
    const outbox = await import('@/lib/offline/outbox');
    await outbox.capture(ownerA, 'daily_report', 'A photo', { photos: 1 }, [new File(['a'], 'a.jpg')]);
    await outbox.capture(ownerB, 'daily_report', 'B photo', { photos: 1 }, [new File(['b'], 'b.jpg')]);
    fake.blobs.get(ownerA)!.push({ opId: 'orphan-a', id: 'orphan-a-1', name: 'orphan.jpg', blob: new Blob(['orphan']) });
    await outbox.clearOwnerOutbox(ownerA);
    expect(outbox.useOutbox(ownerA)).toEqual([]); expect(fake.ops.get(ownerA)).toEqual([]); expect(fake.blobs.get(ownerA)).toEqual([]);
    expect(outbox.useOutbox(ownerB)).toHaveLength(1); expect(fake.ops.get(ownerB)).toHaveLength(1); expect(fake.blobs.get(ownerB)).toHaveLength(1);
    expect(fake.clearOwner).toHaveBeenCalledExactlyOnceWith(ownerA);
    expect(local.get('vesta.outbox.v1')).toContain('Unverified legacy record');
    await expect(outbox.clearOwnerOutbox('')).rejects.toThrow('owned device queue');
    expect(fake.clearOwner).toHaveBeenCalledTimes(1);
  });
  it('does not rehydrate old work that finishes loading after its owner was reset', async () => {
    let release!: (value: OutboxOp[]) => void;
    fake.getOps.mockImplementationOnce(() => new Promise<OutboxOp[]>((resolve) => { release = resolve; }));
    const outbox = await import('@/lib/offline/outbox');
    const hydrating = outbox.hydrateFromIdb(ownerA);
    await outbox.clearOwnerOutbox(ownerA);
    release([pending()]); await hydrating;
    expect(outbox.useOutbox(ownerA)).toEqual([]); expect(fake.ops.get(ownerA)).toEqual([]);
  });
  it('rejects a photo capture that completes after its sandbox reset instead of republishing it', async () => {
    let release!: () => void;
    fake.putBlob.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const outbox = await import('@/lib/offline/outbox');
    const capturing = outbox.capture(ownerA, 'daily_report', 'Old photo', { photos: 1 }, [new File(['a'], 'a.jpg')]);
    await outbox.clearOwnerOutbox(ownerA); release();
    await expect(capturing).rejects.toThrow('sandbox changed');
    expect(outbox.useOutbox(ownerA)).toEqual([]); expect(fake.ops.get(ownerA)).toEqual([]);
    expect(fake.deleteBlobs).toHaveBeenCalledWith(expect.any(String), ownerA);
  });
  it('reports device cleanup failure without deleting another owner queue', async () => {
    const outbox = await import('@/lib/offline/outbox');
    await outbox.capture(ownerA, 'site_issue', 'A', payload); await outbox.capture(ownerB, 'site_issue', 'B', payload);
    fake.clearOwner.mockRejectedValueOnce(new Error('Device transaction refused'));
    await expect(outbox.clearOwnerOutbox(ownerA)).rejects.toThrow('could not fully clear');
    expect(outbox.useOutbox(ownerA)).toEqual([]); expect(outbox.useOutbox(ownerB)).toHaveLength(1);
  });
});

describe('offline transport keeps evidence until server acknowledgement', () => {
  it('does not republish an old transport acknowledgement after that sandbox owner was reset', async () => {
    let release!: (value: { ok: true; id: string; duplicate: boolean }) => void;
    fake.ops.set(ownerA, [pending()]); fake.ops.set(ownerB, [pending({ label: 'B pending' })]);
    fake.sync.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const outbox = await import('@/lib/offline/outbox'); outbox.useOutboxSync(ownerA); fake.effects[0](); fake.effects[1](); await tick(); await tick();
    expect(fake.sync).toHaveBeenCalledOnce();
    await outbox.clearOwnerOutbox(ownerA); release({ ok: true, id: 'pending-id', duplicate: false }); await tick(); await tick();
    expect(outbox.useOutbox(ownerA)).toEqual([]); expect(fake.ops.get(ownerA)).toEqual([]);
    expect(fake.ops.get(ownerB)?.[0].label).toBe('B pending');
  });
  it('syncs a no-photo capture with its owner and deletes no foreign files', async () => {
    fake.ops.set(ownerA, [pending()]);
    const outbox = await import('@/lib/offline/outbox'); outbox.useOutboxSync(ownerA); fake.effects[0](); fake.effects[1](); await tick(); await tick();
    expect(fake.sync).toHaveBeenCalledWith(expect.objectContaining({ owner: ownerA, id: 'pending-id', payload }));
    expect(outbox.useOutbox(ownerA)[0].status).toBe('synced'); expect(fake.deleteBlobs).toHaveBeenCalledWith('pending-id', ownerA);
  });
  it('never syncs a report whose expected photo is missing and retains its metadata', async () => {
    fake.ops.set(ownerA, [pending({ kind: 'daily_report', attachments: 1, payload: { projectId: 'p-marina', photos: 1 } })]);
    const outbox = await import('@/lib/offline/outbox'); outbox.useOutboxSync(ownerA); fake.effects[0](); fake.effects[1](); await tick(); await tick();
    expect(fake.sync).not.toHaveBeenCalled(); expect(fake.deleteBlobs).not.toHaveBeenCalled();
    expect(outbox.useOutbox(ownerA)[0]).toMatchObject({ status: 'failed', attachments: 1, error: expect.stringContaining('missing from device storage') });
  });
  it('preserves originals and explains upload refusal rather than claiming a network outage', async () => {
    const op = pending({ kind: 'daily_report', attachments: 1, payload: { projectId: 'p-marina', photos: 1 } });
    fake.ops.set(ownerA, [op]); fake.blobs.set(ownerA, [{ opId: op.id, id: 'photo-1', blob: new Blob(['image']), name: 'site.jpg' }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const outbox = await import('@/lib/offline/outbox'); outbox.useOutboxSync(ownerA); fake.effects[0](); fake.effects[1](); await tick(); await tick();
    expect(fake.sync).not.toHaveBeenCalled(); expect(fake.deleteBlobs).not.toHaveBeenCalled(); expect(fake.blobs.get(ownerA)).toHaveLength(1);
    expect(outbox.useOutbox(ownerA)[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('Photo upload unavailable (403)') });
  });
  it('stores uploaded references before an ambiguous sync retry and keeps files on server conflict', async () => {
    const op = pending({ kind: 'daily_report', attachments: 1, payload: { projectId: 'p-marina', photos: 1 } });
    fake.ops.set(ownerA, [op]); fake.blobs.set(ownerA, [{ opId: op.id, id: 'photo-1', blob: new Blob(['image']), name: 'site.jpg' }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://storage.example/site.jpg' }) }));
    fake.sync.mockResolvedValue({ ok: false, id: op.id, conflict: true, error: 'Already submitted', serverState: 'submitted' });
    const outbox = await import('@/lib/offline/outbox'); outbox.useOutboxSync(ownerA); fake.effects[0](); fake.effects[1](); await tick(); await tick();
    expect(fake.sync).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ mediaRefs: ['https://storage.example/site.jpg'] }) }));
    expect(outbox.useOutbox(ownerA)[0]).toMatchObject({ status: 'conflict', payload: expect.objectContaining({ mediaRefs: ['https://storage.example/site.jpg'] }) });
    expect(fake.deleteBlobs).not.toHaveBeenCalled(); expect(fake.blobs.get(ownerA)).toHaveLength(1);
  });
});
