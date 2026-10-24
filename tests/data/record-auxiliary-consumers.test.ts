import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/authz';
import type { WorkspaceRecordState } from '@/server/data/record-context';

const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

beforeEach(() => { vi.resetModules(); vi.stubEnv('DATA_SOURCE', 'memory'); });
afterEach(() => vi.unstubAllEnvs());
const reload = (state: WorkspaceRecordState): WorkspaceRecordState => JSON.parse(JSON.stringify(state));
async function workspace() {
  const { initialWorkspaceRecordState } = await import('@/server/data/store');
  const { runWithRecordContext } = await import('@/server/data/record-context');
  const { identityByKey } = await import('@/server/identities');
  const actor = identityByKey('estate_manager').actor;
  boundary.actor.mockResolvedValue(actor);
  const run = <T>(state: WorkspaceRecordState, work: () => T) => runWithRecordContext({ state, domainTenantId: 't-lekki', mode: 'write' }, work);
  return { state: initialWorkspaceRecordState('t-lekki'), run, actor };
}

describe('Serializable auxiliary records in a workspace transaction', () => {
  it('retains notification read flags, messages and thread read cursors after a JSON round trip and module reload', async () => {
    const { state, run } = await workspace();
    let inbox = await import('@/server/data/inbox');
    run(state, () => {
      const thread = inbox.getThreads('alice', ['resident'])[0];
      inbox.appendMessage('alice', ['resident'], thread.id, 'Recorded maintenance follow-up');
      inbox.pushNotification('alice', ['resident'], { title: 'Saved notice', body: 'Recorded event', kind: 'info' });
      inbox.markAllNotificationsRead('alice', ['resident']);
    });
    const restored = reload(state);
    vi.resetModules(); inbox = await import('@/server/data/inbox');
    run(restored, () => {
      expect(inbox.unreadNotificationCount('alice', ['resident'])).toBe(0);
      expect(inbox.getNotifications('alice', ['resident']).some((row) => row.title === 'Saved notice')).toBe(true);
      const thread = inbox.getThreads('alice', ['resident'])[0];
      expect(thread.messages.at(-1)?.text).toBe('Recorded maintenance follow-up');
      expect(thread.lastReadSeq).toBe(thread.messages.length);
      expect(JSON.stringify(inbox.getThreads('bob', ['resident']))).not.toContain('Recorded maintenance follow-up');
      inbox.pushNotification('alice', ['resident'], { title: 'Second notice', body: 'Another event', kind: 'info' });
      const ids = inbox.getNotifications('alice', ['resident']).filter((row) => row.id.includes('-push-')).map((row) => row.id);
      expect(ids).toEqual(expect.arrayContaining(['n-alice-push-1', 'n-alice-push-2']));
    });
    expect(restored.auxiliary.inbox).toMatchObject({ notifications: { 'user:alice': expect.any(Array) }, threads: { 'user:alice': expect.any(Array) } });
    expect(JSON.stringify(restored)).toContain('Recorded maintenance follow-up');
  });

  it('keeps auxiliary inbox records inside their current context and handles prototype-shaped user IDs as data', async () => {
    const { state, run } = await workspace();
    const separate = reload(state), inbox = await import('@/server/data/inbox');
    run(state, () => inbox.pushNotification('__proto__', ['resident'], { title: 'Private notice', body: 'Scoped record', kind: 'info' }));
    run(separate, () => expect(JSON.stringify(inbox.getNotifications('__proto__', ['resident']))).not.toContain('Private notice'));
    run(state, () => expect(JSON.stringify(inbox.getNotifications('__proto__', ['resident']))).toContain('Private notice'));
    expect(Object.getPrototypeOf(state.auxiliary)).toBe(Object.prototype);
  });

  it('retains nonseed Shortlet plan, booking-page and promotion settings after serialization without mixing tenants or contexts', async () => {
    const { state, run } = await workspace();
    let { shortletSettings } = await import('@/server/shortlet-settings');
    run(state, () => {
      const settings = shortletSettings('tenant-b');
      settings.planKey = 'starter'; settings.bookingPage.slug = 'abuja-stays'; settings.bookingPage.enabled = true;
      settings.bookingPage.promoCodes.push({ code: 'ABUJA10', pct: 10, active: true });
    });
    const restored = reload(state), separate = (await workspace()).state;
    vi.resetModules(); ({ shortletSettings } = await import('@/server/shortlet-settings'));
    run(restored, () => {
      expect(shortletSettings('tenant-b')).toMatchObject({ planKey: 'starter', bookingPage: { slug: 'abuja-stays', enabled: true, promoCodes: [{ code: 'ABUJA10', pct: 10, active: true }] } });
      expect(shortletSettings('tenant-c').bookingPage.slug).toBe('portfolio');
      expect(shortletSettings('__proto__').planKey).toBe('lite');
    });
    run(separate, () => expect(shortletSettings('tenant-b').planKey).toBe('lite'));
    expect(restored.auxiliary['shortlet:settings']).toHaveProperty('tenant:tenant-b');
  });

  it('preserves the seeded Shortlet settings accessors through the transaction collections', async () => {
    const { state, run } = await workspace();
    const { shortletSettings } = await import('@/server/shortlet-settings');
    run(state, () => { shortletSettings('t-lekki').planKey = 'starter'; shortletSettings('t-lekki').bookingPage.slug = 'lagos-review'; });
    run(reload(state), () => expect(shortletSettings('t-lekki')).toMatchObject({ planKey: 'starter', bookingPage: { slug: 'lagos-review' } }));
  });
});

describe('Record sequence consumers survive module reloads', () => {
  it('allocates new Estate, document and Shortlet references after restoring their persisted sequences', async () => {
    const { state, run } = await workspace();
    async function create(state: WorkspaceRecordState, suffix: string, checkIn: string, checkOut: string) {
      const estate = await import('@/server/actions/estate'), documents = await import('@/server/actions/documents'), shortlet = await import('@/server/actions/shortlet');
      const { db } = await import('@/server/data/store');
      return run(state, async () => {
        expect(await estate.createEvent({ title: `Community review ${suffix}`, category: 'meeting', venue: 'Hall', host: 'Manager', startISO: '2027-02-01', capacity: 20 })).toMatchObject({ ok: true });
        expect(await documents.uploadDocument({ name: `Certificate ${suffix}`, folder: 'Compliance', type: 'certificate', audience: 'Managers', extracted: [], scanned: false })).toMatchObject({ ok: true });
        expect(await shortlet.createBooking({ apartmentId: db.shortletApartments[0].id, guestName: `Sample guest ${suffix}`, guestPhone: '', checkIn, checkOut, source: 'direct', cautionNaira: 0 })).toMatchObject({ ok: true });
        return { event: db.communityEvents[0].id, document: db.documents.at(-1)!.id, booking: db.shortletBookings[0].ref };
      });
    }
    const first = await create(state, 'one', '2027-02-01', '2027-02-03');
    const restored = reload(state);
    vi.resetModules();
    const second = await create(restored, 'two', '2027-02-04', '2027-02-06');
    expect(first).toEqual({ event: 'ev-new-1', document: 'doc-up-0', booking: 'SL-5200' });
    expect(second).toEqual({ event: 'ev-new-2', document: 'doc-up-1', booking: 'SL-5201' });
  });

  it('reuses the single allocated Facility sequence for the workorder ID and its attributed history', async () => {
    const { state, run, actor } = await workspace();
    boundary.actor.mockResolvedValue({ ...actor, roles: ['facility_manager'], estateIds: ['s-gardens', 's-victoria'] } satisfies Actor);
    const { dispatchWoFromAlarm } = await import('@/server/actions/facility');
    const { db, getHistory } = await import('@/server/data/store');
    await run(state, async () => {
      const alarm = db.facilityAlarms.find((row) => !row.woRef)!;
      expect(await dispatchWoFromAlarm(alarm.id)).toMatchObject({ ok: true });
      const order = db.workOrders.find((row) => row.ref === alarm.woRef)!;
      expect(order.id).toBe('wo-alarm-1');
      expect(getHistory('work-order', order.id)).toEqual([expect.objectContaining({ event: 'CREATE', actorId: actor.userId })]);
      expect(state.sequences['facility:woSeq']).toBe(1);
    });
  });
});
