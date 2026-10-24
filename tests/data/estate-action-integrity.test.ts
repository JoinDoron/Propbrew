import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/server/data/store';
import { identityByKey, SEED } from '@/server/identities';
import type { Actor } from '@/lib/authz';

const boundary = vi.hoisted(() => ({ actor: vi.fn(), refresh: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.refresh }));
import * as actions from '@/server/actions/estate';

const initial = structuredClone(db);
beforeEach(() => { vi.clearAllMocks(); Object.assign(db, structuredClone(initial)); boundary.actor.mockResolvedValue(identityByKey('estate_manager').actor); });
afterEach(() => Object.assign(db, structuredClone(initial)));
const actAs = (overrides: Partial<Actor>) => boundary.actor.mockResolvedValue({ ...identityByKey('estate_manager').actor, ...overrides });

describe('Estate action boundaries and workflow integrity', () => {
  it.each([
    ['feedback', () => actions.acknowledgeFeedback('fb-1')],
    ['complaint', () => actions.resolveComplaint('cp-1')],
    ['collection reminder', () => actions.sendReminder('col-1')],
    ['collection stage', () => actions.advanceDunning('col-2')],
    ['payment promise', () => actions.recordPromise('col-2', 1000, '2026-08-01')],
    ['tenancy stage', () => actions.advanceTenancy('tn-1')],
    ['deposit', () => actions.settleDeposit('tn-1', 1000)],
    ['parcel collection', () => actions.collectParcel('pc-1')],
    ['parcel notification', () => actions.notifyResident('pc-1')],
    ['motion opening', () => actions.openMotion('mo-5')],
    ['motion vote', () => actions.castVote('mo-1', 'for')],
    ['motion closing', () => actions.closeMotion('mo-1')],
    ['event reservation', () => actions.rsvpEvent('ev-1')],
    ['event release', () => actions.cancelRsvp('ev-1')],
    ['meeting closure', () => actions.recordMeetingHeld('mt-1', 100)],
    ['points award', () => actions.awardPoints('rw-1', 'event')],
    ['perk redemption', () => actions.redeemPerk('rw-1', 'pk-1')],
    ['election nomination', () => actions.nominateCandidate('el-1', { name: 'New Candidate', unitLabel: '1A', statement: 'Community priorities' })],
    ['election opening', () => actions.openElectionVoting('el-1')],
    ['election decision', () => actions.decideElection('el-1')],
    ['proxy exercise', () => actions.exerciseProxies('mo-2')],
    ['proxy revocation', () => actions.revokeProxyLink('px-1')],
  ] as const)('rejects an unassigned-estate %s mutation without writes', async (_, invoke) => {
    actAs({ estateIds: [SEED.estateVictoria] });
    const before = structuredClone(db);
    expect(await invoke()).toMatchObject({ ok: false });
    expect(db).toEqual(before);
    expect(boundary.refresh).not.toHaveBeenCalled();
  });

  it('rejects a foreign tenant even if the estate id has been copied into its assignment', async () => {
    actAs({ tenantId: SEED.tenantB, estateIds: [SEED.estateGardens] });
    const before = structuredClone(db);
    expect(await actions.resolveComplaint('cp-1')).toMatchObject({ ok: false });
    expect(await actions.collectParcel('pc-1')).toMatchObject({ ok: false });
    expect(await actions.recordPromise('col-2', 1000, '2026-08-01')).toMatchObject({ ok: false });
    expect(db).toEqual(before);
  });

  it('creates records in the signed-in tenant and assigned estate instead of the first seed row', async () => {
    actAs({ tenantId: SEED.tenantB, estateIds: [SEED.estateIkoyi] });
    const parcel = await actions.logParcel({ residentName: 'New Resident', unitLabel: '21', courier: 'Courier', size: 'L' });
    const event = await actions.createEvent({ title: 'Community review', venue: 'Hall', host: 'Manager', category: 'meeting', startISO: '2026-08-01', capacity: 30 });
    const motion = await actions.createMotion({ title: 'Works proposal', summary: 'Review works', category: 'works', quorumPct: 33, thresholdPct: 50 });
    expect(parcel.ok && event.ok && motion.ok).toBe(true);
    expect(db.parcels[0]).toMatchObject({ tenantId: SEED.tenantB, estateId: SEED.estateIkoyi, status: 'received' });
    expect(db.communityEvents[0]).toMatchObject({ tenantId: SEED.tenantB, estateId: SEED.estateIkoyi });
    expect(db.motions.at(-1)).toMatchObject({ tenantId: SEED.tenantB, estateId: SEED.estateIkoyi, eligibleWeight: 120 });
    expect(db.lockers).toEqual(initial.lockers);
  });

  it('never fits a large parcel into a smaller or foreign locker, and chooses an available larger locker for a small parcel', async () => {
    for (const locker of db.lockers) if (locker.size === 'L') locker.parcelId = 'occupied';
    const result = await actions.logParcel({ residentName: 'Test Resident', unitLabel: '12B', courier: 'Courier', size: 'L' });
    expect(result.ok).toBe(true);
    expect(db.parcels[0]).toMatchObject({ size: 'L', status: 'received' });
    expect(db.parcels[0].lockerLabel).toBeUndefined();
    const medium = db.lockers.find((row) => row.size === 'M')!;
    for (const locker of db.lockers) locker.parcelId = 'occupied';
    medium.parcelId = undefined;
    expect((await actions.logParcel({ residentName: 'Small parcel', unitLabel: '12B', courier: 'Courier', size: 'S' })).ok).toBe(true);
    expect(db.parcels[0]).toMatchObject({ size: 'S', status: 'stored', lockerLabel: medium.label });
  });

  it.each([NaN, Infinity, -1, 0, Number.MAX_SAFE_INTEGER])('rejects invalid promise amount %s without writes', async (amount) => {
    const before = structuredClone(db.collectionCases);
    expect(await actions.recordPromise('col-2', amount, '2026-08-01')).toMatchObject({ ok: false });
    expect(db.collectionCases).toEqual(before);
  });

  it.each(['not-a-date', '2026-02-30', '2026-13-01', ''])('rejects invalid promise/event dates %s rather than throwing or saving invalid dates', async (date) => {
    expect(await actions.recordPromise('col-2', 1000, date)).toMatchObject({ ok: false });
    const before = db.communityEvents.length;
    expect(await actions.createEvent({ title: 'Invalid dated event', venue: '', host: '', category: 'social', startISO: date, capacity: 5 })).toMatchObject({ ok: false });
    expect(db.communityEvents).toHaveLength(before);
  });

  it('keeps a closed tenancy and settled deposit terminal, and rejects non-finite/negative deposit values', async () => {
    const tenancy = db.tenancies[0]; tenancy.stage = 'closed'; tenancy.depositStatus = 'held';
    expect(await actions.advanceTenancy(tenancy.id)).toMatchObject({ ok: false });
    for (const amount of [NaN, Infinity, -1]) expect(await actions.settleDeposit(tenancy.id, amount)).toMatchObject({ ok: false });
    expect(tenancy.depositStatus).toBe('held');
    expect(await actions.settleDeposit(tenancy.id, 10)).toMatchObject({ ok: true });
    const status = tenancy.depositStatus;
    expect(await actions.settleDeposit(tenancy.id, 0)).toMatchObject({ ok: false });
    expect(tenancy.depositStatus).toBe(status);
  });

  it('rejects invalid enums before they silently become abstentions or NaN reward points', async () => {
    const before = structuredClone(db);
    expect(await actions.castVote('mo-1', 'invalid' as never)).toMatchObject({ ok: false });
    expect(await actions.awardPoints('rw-1', 'invalid' as never)).toMatchObject({ ok: false });
    expect(await actions.logParcel({ residentName: 'Test', unitLabel: '', courier: '', size: 'XL' as never })).toMatchObject({ ok: false });
    expect(db).toEqual(before);
  });

  it('does not rewrite a held meeting or allow invalid attendee counts', async () => {
    const before = structuredClone(db.meetings);
    expect(await actions.recordMeetingHeld('mt-3', 99)).toMatchObject({ ok: false });
    expect(await actions.recordMeetingHeld('mt-1', NaN)).toMatchObject({ ok: false });
    expect(db.meetings).toEqual(before);
  });

  it.each([
    ['feedback', () => actions.acknowledgeFeedback('fb-1')],
    ['complaint', () => actions.resolveComplaint('cp-1')],
    ['reminder entry', () => actions.sendReminder('col-1')],
    ['collection stage', () => actions.advanceDunning('col-2')],
    ['promise', () => actions.recordPromise('col-2', 1000, '2026-08-01')],
    ['tenancy stage', () => actions.advanceTenancy('tn-1')],
    ['parcel collection', () => actions.collectParcel('pc-1')],
    ['motion opening', () => actions.openMotion('mo-5')],
    ['motion vote', () => actions.castVote('mo-1', 'for')],
    ['motion closure', () => actions.closeMotion('mo-1')],
    ['event reservation', () => actions.rsvpEvent('ev-1')],
    ['event release', () => actions.cancelRsvp('ev-1')],
    ['meeting closure', () => actions.recordMeetingHeld('mt-1', 100)],
    ['points award', () => actions.awardPoints('rw-1', 'event')],
    ['perk redemption', () => actions.redeemPerk('rw-1', 'pk-1')],
  ] as const)('preserves the authorised %s workflow', async (_, invoke) => {
    if (_ === 'collection stage' || _ === 'promise') {
      // An active matched case remains actionable after an invoice payment.
      const record = db.collectionCases.find((row) => row.id === 'col-2')!;
      const invoice = db.invoices.find((row) => row.ref === record.invoiceRef)!;
      record.amountMinor = invoice.amount.minor - invoice.paid.minor;
    }
    expect(await invoke()).toMatchObject({ ok: true });
    expect(boundary.refresh).toHaveBeenCalled();
  });

  it('blocks financial follow-up on paid or missing invoices and refuses promises above the actual invoice balance', async () => {
    const before = structuredClone(db.collectionCases);
    for (const id of ['col-4', 'col-5']) {
      expect(await actions.sendReminder(id)).toMatchObject({ ok: false });
      expect(await actions.advanceDunning(id)).toMatchObject({ ok: false });
      expect(await actions.recordPromise(id, 1000, '2026-08-01')).toMatchObject({ ok: false });
    }
    expect(await actions.recordPromise('col-2', 200_001, '2026-08-01')).toMatchObject({ ok: false });
    expect(db.collectionCases).toEqual(before);
  });

  it('keeps ended event reservations and exhausted vote counts unchanged', async () => {
    const past = db.communityEvents.find((row) => row.id === 'ev-6')!;
    const count = past.rsvps;
    expect(await actions.rsvpEvent(past.id)).toMatchObject({ ok: false });
    expect(await actions.cancelRsvp(past.id)).toMatchObject({ ok: false });
    expect(past.rsvps).toBe(count);
    const motion = db.motions[0]; motion.forWeight = motion.eligibleWeight; motion.againstWeight = 0; motion.abstainWeight = 0;
    expect(await actions.castVote(motion.id, 'for')).toMatchObject({ ok: false });
    expect(motion.forWeight).toBe(motion.eligibleWeight);
  });

  it('records a motion outcome notice without inventing external delivery receipts', async () => {
    expect(await actions.closeMotion('mo-1')).toMatchObject({ ok: true });
    expect(db.announcements[0]).toMatchObject({ estateId: SEED.estateGardens, delivered: 0, read: 0 });
    expect(db.announcements[0].title).toContain('AGM result');
  });

  it('attributes a decided election winner to that election estate and uses two calendar years for the term', async () => {
    const election = structuredClone(db.boardElections[0]);
    election.id = 'foreign-authorised-election'; election.tenantId = SEED.tenantB as typeof election.tenantId; election.estateId = SEED.estateIkoyi;
    election.candidates[0].votes = 100;
    db.boardElections.push(election);
    actAs({ tenantId: SEED.tenantB, estateIds: [SEED.estateIkoyi] });
    expect(await actions.decideElection(election.id)).toMatchObject({ ok: true });
    expect(db.boardMembers.at(-1)).toMatchObject({ tenantId: SEED.tenantB, estateId: SEED.estateIkoyi, name: election.candidates[0].residentName, termEndISO: '2028-07-26' });
    const count = db.boardMembers.length;
    expect(await actions.decideElection(election.id)).toMatchObject({ ok: false });
    expect(db.boardMembers).toHaveLength(count);
  });
});
