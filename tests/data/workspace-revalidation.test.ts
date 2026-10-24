import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identityByKey, SEED } from '@/server/identities';
import { repos } from '@/server/data';
import { db } from '@/server/data/store';
import { money } from '@/domain/primitives';

const boundary = vi.hoisted(() => ({ getActor: vi.fn(), revalidatePath: vi.fn(), getActiveUnitId: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock('@/server/active-unit', () => ({ getActiveUnitId: boundary.getActiveUnitId, ACTIVE_UNIT_COOKIE: 'active-unit' }));

import { acknowledgeAlarm, dispatchWoFromAlarm } from '@/server/actions/facility';
import { acknowledgeFeedback } from '@/server/actions/estate';
import { decidePpmSuggestion, generatePpmWorkOrder } from '@/server/actions/ppm';
import { rescheduleInspection, runInspection } from '@/server/actions/inspections';
import { fireWoTransition } from '@/server/actions/work-orders';
import { raiseRequest } from '@/server/actions/resident-requests';
import { payAllOutstanding } from '@/server/actions/resident-bills';
import { payChargeFromWallet, topUpWallet } from '@/server/actions/resident-home';
import { issueInvoice, raiseSos, transition } from '@/server/actions/transitions';
import { createBooking } from '@/server/actions/resident-bookings';
import { sendAnnouncement } from '@/server/actions/announcements';

const initialStore = structuredClone(db);

function actAs(key: string) {
  const actor = identityByKey(key).actor;
  boundary.getActor.mockResolvedValue(actor);
  return actor;
}

function expectRefresh(...paths: string[]) {
  for (const path of paths) expect(boundary.revalidatePath).toHaveBeenCalledWith(path);
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(db, structuredClone(initialStore));
  boundary.getActiveUnitId.mockResolvedValue(SEED.unitRes);
});

afterEach(() => {
  Object.assign(db, structuredClone(initialStore));
});

describe('workspace overview cache refresh after existing mutations', () => {
  it('refreshes the Facility home after acknowledging a building alarm', async () => {
    const actor = actAs('facility_manager');
    const alarm = repos.facilityAlarms.list(actor).items[0];
    expect(alarm).toBeDefined();
    expect(await acknowledgeAlarm(alarm.id)).toEqual({ ok: true });
    expectRefresh('/control-center', '/facility', '/dashboard');
    expect(boundary.revalidatePath).not.toHaveBeenCalledWith('/estate');
  });

  it('refreshes the Estate home after an estate-management mutation', async () => {
    const actor = actAs('estate_manager');
    const feedback = repos.residentFeedback.list(actor).items[0];
    expect(feedback).toBeDefined();
    expect(await acknowledgeFeedback(feedback.id)).toEqual({ ok: true });
    expectRefresh('/community', '/estate', '/dashboard');
    expect(boundary.revalidatePath).not.toHaveBeenCalledWith('/facility');
  });

  it('refreshes Facility after a maintenance-plan decision', async () => {
    const actor = actAs('facility_manager');
    const plan = repos.ppmPlans.list(actor).items[0];
    expect(plan).toBeDefined();
    expect(await decidePpmSuggestion(String(plan.assetId), 'override', { reason: 'Keep the approved maintenance date.' })).toEqual({ ok: true });
    expectRefresh('/ppm', '/facility', '/dashboard');
  });

  it('refreshes Facility after an inspection is rescheduled', async () => {
    const actor = actAs('facility_manager');
    const inspection = repos.inspections.list(actor).items.find((row) => row.status === 'scheduled')!;
    expect(inspection).toBeDefined();
    expect(await rescheduleInspection(inspection.id, '2026-11-01')).toEqual({ ok: true });
    expectRefresh('/inspections', '/facility', '/dashboard');
  });

  it('refreshes Estate and Facility after a work-order transition while retaining detail and resident invalidations', async () => {
    const actor = actAs('facility_manager');
    const order = repos.workOrders.list(actor).items[0];
    expect(order).toBeDefined();
    order.status = 'new';
    expect(await fireWoTransition(order.ref, 'TRIAGE')).toEqual({ ok: true, to: 'triaged' });
    expectRefresh('/work-orders', `/work-orders/${order.ref}`, '/facility', '/estate', '/dashboard', '/portal/requests');
  });

  it('refreshes Estate and Facility when a resident raises a maintenance request', async () => {
    actAs('resident');
    expect(await raiseRequest({ title: 'Kitchen tap is leaking', description: 'Water drips beneath the sink.' })).toMatchObject({ ok: true });
    expectRefresh('/portal/requests', '/work-orders', '/facility', '/estate', '/dashboard');
  });

  it('refreshes Estate and Facility when a building alarm dispatches a work order', async () => {
    const actor = actAs('facility_manager');
    const alarm = repos.facilityAlarms.list(actor).items.find((row) => !row.woRef);
    expect(alarm).toBeDefined();
    const count = db.workOrders.length;
    expect(await dispatchWoFromAlarm(alarm!.id)).toMatchObject({ ok: true });
    expect(db.workOrders).toHaveLength(count + 1);
    expectRefresh('/control-center', '/work-orders', '/facility', '/estate', '/dashboard');
  });

  it('refreshes Estate and Facility when preventive maintenance creates a work order', async () => {
    const actor = actAs('facility_manager');
    const occurrence = repos.ppmOccurrences.list(actor).items.find((row) => !db.workOrders.some((order) =>
      order.assetId === row.assetId && order.origin === 'ppm_schedule' && !['closed', 'cancelled', 'rejected', 'verified'].includes(order.status)));
    expect(occurrence).toBeDefined();
    const count = db.workOrders.length;
    expect(await generatePpmWorkOrder(occurrence!.id)).toMatchObject({ ok: true });
    expect(db.workOrders).toHaveLength(count + 1);
    expectRefresh('/ppm', '/work-orders', '/facility', '/estate', '/dashboard');
  });

  it('refreshes Estate and Facility when failed inspection evidence raises a work order', async () => {
    const actor = actAs('facility_manager');
    const inspection = repos.inspections.list(actor).items.find((row) => row.status === 'scheduled' && row.checklist.length > 0);
    expect(inspection).toBeDefined();
    const results = inspection!.checklist.map((item, index) => ({ itemId: item.id, result: index === 0 ? 'fail' as const : 'pass' as const }));
    const count = db.workOrders.length;
    expect(await runInspection(inspection!.id, { results, photoCount: 1 })).toEqual({ ok: true, raised: 1, passed: false });
    expect(db.workOrders).toHaveLength(count + 1);
    expectRefresh('/inspections', '/work-orders', '/facility', '/estate', '/dashboard');
  });

  it('does not refresh Estate for a clean inspection that creates no work order', async () => {
    const actor = actAs('facility_manager');
    const inspection = repos.inspections.list(actor).items.find((row) => row.status === 'scheduled')!;
    expect(inspection).toBeDefined();
    const results = inspection.checklist.map((item) => ({ itemId: item.id, result: 'pass' as const }));
    const count = db.workOrders.length;
    expect(await runInspection(inspection.id, { results, photoCount: 1 })).toEqual({ ok: true, raised: 0, passed: true });
    expect(db.workOrders).toHaveLength(count);
    expectRefresh('/inspections', '/facility', '/dashboard');
    expect(boundary.revalidatePath).not.toHaveBeenCalledWith('/estate');
  });

  it('refreshes Estate when a manager issues a charge', async () => {
    const actor = actAs('estate_manager');
    const invoice = repos.invoices.list(actor).items[0];
    expect(invoice).toBeDefined();
    invoice.status = 'draft';
    expect(await issueInvoice(invoice.ref)).toEqual({ ok: true, to: 'issued' });
    expectRefresh('/billing', '/estate', '/dashboard');
  });

  it('refreshes Estate when a resident funds their wallet', async () => {
    actAs('resident');
    expect(await topUpWallet(SEED.unitRes, 1_000)).toEqual({ ok: true });
    expectRefresh('/portal/bills', '/billing', '/estate', '/dashboard');
  });

  it('refreshes Estate when a resident pays one charge from their wallet', async () => {
    const actor = actAs('resident');
    const invoice = repos.invoices.list(actor).items.find((row) => row.unitId === SEED.unitRes);
    const wallet = db.wallets.find((row) => row.ownerUserId === actor.userId && row.unitId === SEED.unitRes);
    expect(invoice).toBeDefined();
    expect(wallet).toBeDefined();
    invoice!.status = 'issued';
    invoice!.paid = money(0, invoice!.amount.currency);
    wallet!.available = money(invoice!.amount.minor, invoice!.amount.currency);
    expect(await payChargeFromWallet(invoice!.ref)).toEqual({ ok: true });
    expectRefresh('/portal/bills', '/billing', '/estate', '/dashboard');
  });

  it('refreshes Estate when a resident pays outstanding charges', async () => {
    const actor = actAs('resident');
    const invoice = repos.invoices.list(actor).items.find((row) => row.unitId === SEED.unitRes);
    const wallet = db.wallets.find((row) => row.ownerUserId === actor.userId && row.unitId === SEED.unitRes);
    expect(invoice).toBeDefined();
    expect(wallet).toBeDefined();
    invoice!.status = 'issued';
    invoice!.paid = money(0, invoice!.amount.currency);
    wallet!.available = money(1_000_000_000, invoice!.amount.currency);
    expect(await payAllOutstanding()).toMatchObject({ ok: true });
    expectRefresh('/portal/bills', '/billing', '/estate', '/dashboard');
  });

  it('refreshes Estate when an SOS is raised and acknowledged', async () => {
    actAs('resident');
    expect(await raiseSos()).toEqual({ ok: true, to: 'raised' });
    expectRefresh('/portal/security', '/security', '/estate', '/dashboard');
    const event = db.sosEvents.at(-1)!;
    boundary.revalidatePath.mockClear();
    actAs('security');
    expect(await transition('sos-event', event.id, 'ACKNOWLEDGE')).toEqual({ ok: true, to: 'acknowledged' });
    expectRefresh('/portal/security', '/security', '/estate', '/dashboard');
  });

  it('refreshes Estate when an amenity booking is created and cancelled', async () => {
    const actor = actAs('resident');
    const amenity = repos.bookings.list(actor).items[0]?.amenity;
    expect(amenity).toBeDefined();
    expect(await createBooking(amenity!, '2026-11-02T10:00:00.000Z')).toMatchObject({ ok: true });
    expectRefresh('/portal/bookings', '/bookings', '/estate');
    const booking = db.bookings[0];
    boundary.revalidatePath.mockClear();
    actAs('estate_manager');
    expect(await transition('booking', booking.id, 'CANCEL')).toEqual({ ok: true, to: 'cancelled' });
    expectRefresh('/portal/bookings', '/bookings', '/estate');
  });

  it('refreshes Estate after a manager publishes an announcement', async () => {
    actAs('estate_manager');
    expect(await sendAnnouncement({
      title: 'Community update', body: 'Water maintenance starts tomorrow morning.',
      scope: 'estate', audience: 'All residents', channels: ['in_app'],
      aiDrafted: false, approved: true,
    })).toMatchObject({ ok: true });
    expectRefresh('/announcements', '/estate');
  });

  it('does not invalidate either operator overview for a rejected mutation', async () => {
    actAs('executive');
    expect(await acknowledgeAlarm('unknown-alarm')).toMatchObject({ ok: false });
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });
});
