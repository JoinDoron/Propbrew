import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identityByKey, SEED } from '@/server/identities';
import { money } from '@/domain/primitives';
import type { TenantId } from '@/domain/ids';
import { db } from '@/server/data/store';
import { scanRisks, stockLedger, nextRevision } from '@/domain/construction';
import { NOW_MS } from '@/domain/ppm';
import { constructionWorld, signalStates, signalEscalations } from '@/server/reads/construction';
import { shortletSettings } from '@/server/shortlet-settings';
import * as shortlet from '@/server/actions/shortlet';
import * as construction from '@/server/actions/construction';

const session = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: session.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/clock', () => ({ nowISO: () => '2026-10-24T12:00:00.000Z' }));
const baseline = structuredClone({
  shortletApartments: db.shortletApartments, shortletBookings: db.shortletBookings,
  shortletInspections: db.shortletInspections, shortletIssues: db.shortletIssues,
  shortletTeam: db.shortletTeam, shortletPricingRules: db.shortletPricingRules,
  shortletExpenses: db.shortletExpenses, shortletPlanKey: db.shortletPlanKey,
  shortletBookingPage: db.shortletBookingPage,
  constructionOrders: db.constructionOrders, constructionRfqs: db.constructionRfqs,
  constructionRequests: db.constructionRequests, constructionCostCodes: db.constructionCostCodes,
  constructionStock: db.constructionStock, constructionMovements: db.constructionMovements,
  constructionReports: db.constructionReports, constructionTasks: db.constructionTasks,
  constructionProjects: db.constructionProjects, constructionVariations: db.constructionVariations,
  constructionAttendance: db.constructionAttendance, constructionDocs: db.constructionDocs,
  constructionRfis: db.constructionRfis, constructionAudit: db.constructionAudit,
  constructionReasonEvents: db.constructionReasonEvents, constructionStockCounts: db.constructionStockCounts,
  constructionSignalStates: db.constructionSignalStates, constructionFxRates: db.constructionFxRates,
  constructionTimesheets: db.constructionTimesheets,
  constructionApprovals: db.constructionApprovals, constructionReasonCodes: db.constructionReasonCodes,
  constructionIssues: db.constructionIssues,
});
const manager = () => structuredClone(identityByKey('estate_manager').actor);
const foreignTenant = SEED.tenantB as TenantId;
beforeEach(() => { Object.assign(db, structuredClone(baseline)); session.actor.mockResolvedValue(manager()); });
afterEach(() => { Object.assign(db, structuredClone(baseline)); });
const bookingInput = () => ({ apartmentId: db.shortletApartments[0].id, guestName: 'Workflow QA', guestPhone: '', checkIn: '2027-02-01', checkOut: '2027-02-03', source: 'direct' as const, status: 'confirmed', cautionNaira: 10000, paidNaira: 0 });

describe('Shortlet booking and money workflows', () => {
  it('creates a valid stay, preserves exact kobo in a partial payment, and rejects overpayment atomically', async () => {
    const created = await shortlet.createBooking(bookingInput());
    expect(created.ok).toBe(true);
    const booking = db.shortletBookings[0];
    expect(booking.total.minor).toBe(2 * db.shortletApartments[0].nightlyRate.minor);
    expect(booking.guestToken).not.toBe(`g-${booking.ref}`);
    expect(await shortlet.recordPayment(booking.id, 1000.01)).toEqual({ ok: true });
    expect(booking.paid).toEqual(money(100001));
    const before = structuredClone(booking);
    expect((await shortlet.recordPayment(booking.id, booking.total.minor / 100)).ok).toBe(false);
    expect(booking).toEqual(before);
  });

  it.each([
    { checkIn: 'bad-date' }, { checkIn: '2027-02-30' }, { checkOut: '2027-01-31' },
    { cautionNaira: -1 }, { cautionNaira: Infinity }, { paidNaira: NaN }, { paidNaira: Number.MAX_VALUE },
  ])('rejects malformed date or money inputs without creating a stay: %j', async (change) => {
    const count = db.shortletBookings.length;
    expect((await shortlet.createBooking({ ...bookingInput(), ...change })).ok).toBe(false);
    expect(db.shortletBookings).toHaveLength(count);
  });

  it('blocks overlapping recorded stays but permits same-day turnover', async () => {
    expect((await shortlet.createBooking(bookingInput())).ok).toBe(true);
    expect((await shortlet.createBooking({ ...bookingInput(), checkIn: '2027-02-02', checkOut: '2027-02-04' })).ok).toBe(false);
    expect((await shortlet.createBooking({ ...bookingInput(), checkIn: '2027-02-03', checkOut: '2027-02-04' })).ok).toBe(true);
  });

  it('does not relabel a foreign-currency apartment or payment as NGN', async () => {
    db.shortletApartments[0].nightlyRate = money(10000, 'USD');
    expect((await shortlet.createBooking(bookingInput())).ok).toBe(false);
    const booking = db.shortletBookings.find((row) => row.status === 'confirmed')!;
    booking.total = money(10000, 'USD'); booking.paid = money(0, 'USD');
    expect((await shortlet.recordPayment(booking.id, 10)).ok).toBe(false);
    expect(booking.paid).toEqual(money(0, 'USD'));
  });

  it('allows a late recorded payment without reopening a closed stay', async () => {
    const booking = db.shortletBookings[0]; booking.status = 'closed'; booking.total = money(10000); booking.paid = money(0);
    expect((await shortlet.recordPayment(booking.id, 10.01)).ok).toBe(true);
    expect(booking.paid.minor).toBe(1001); expect(booking.status).toBe('closed');
  });

  it('enforces confirmation overlap, stay-start and inspection-close guards', async () => {
    const booking = db.shortletBookings[0];
    booking.status = 'confirmed'; booking.checkIn = '2027-02-01'; booking.checkOut = '2027-02-03';
    expect((await shortlet.advanceBooking(booking.id, 'CHECK_IN')).ok).toBe(false);
    booking.status = 'checked_out';
    expect((await shortlet.advanceBooking(booking.id, 'CLOSE')).ok).toBe(false);
    const caution = booking.cautionFee.minor;
    expect((await shortlet.saveInspection(booking.id, [{ label: 'Living room', condition: 'damaged', chargeMinor: 10001 }], 'QA inspector')).ok).toBe(true);
    expect(booking.status).toBe('closed');
    expect(booking.cautionDeducted.minor).toBe(Math.min(10001, caution));
    const completed = structuredClone(booking);
    expect((await shortlet.saveInspection(booking.id, [{ label: 'Living room', condition: 'ok' }], 'QA')).ok).toBe(false);
    expect(booking).toEqual(completed);
  });

  it.each([NaN, Infinity, -1, 0.5])('rejects invalid inspection charges before changing caution: %s', async (chargeMinor) => {
    const booking = db.shortletBookings[0]; booking.status = 'checked_out';
    const before = structuredClone(booking);
    expect((await shortlet.saveInspection(booking.id, [{ label: 'Bedroom', condition: 'damaged', chargeMinor }], 'QA')).ok).toBe(false);
    expect(booking).toEqual(before);
  });

  it('isolates supplied booking, team, pricing and issue IDs by tenant', async () => {
    const booking = { ...structuredClone(db.shortletBookings[0]), id: 'foreign-booking', tenantId: foreignTenant, status: 'enquiry' as const };
    const member = { ...structuredClone(db.shortletTeam[1]), id: 'foreign-member', tenantId: foreignTenant, role: 'manager' as const };
    const rule = { ...structuredClone(db.shortletPricingRules[0]), id: 'foreign-rule', tenantId: foreignTenant };
    const issue = { ...structuredClone(db.shortletIssues[0]), id: 'foreign-issue', tenantId: foreignTenant };
    db.shortletBookings.push(booking); db.shortletTeam.push(member); db.shortletPricingRules.push(rule); db.shortletIssues.push(issue);
    expect((await shortlet.advanceBooking(booking.id, 'CONFIRM')).ok).toBe(false);
    expect((await shortlet.recordPayment(booking.id, 1)).ok).toBe(false);
    expect((await shortlet.saveInspection(booking.id, [{ label: 'Room', condition: 'ok' }], 'QA')).ok).toBe(false);
    expect((await shortlet.setMemberRole(member.id, 'housekeeper')).ok).toBe(false);
    expect((await shortlet.removeMember(member.id)).ok).toBe(false);
    expect((await shortlet.removePricingRule(rule.id)).ok).toBe(false);
    expect((await shortlet.advanceIssue(issue.id)).ok).toBe(false);
    expect(booking.status).toBe('enquiry'); expect(member.role).toBe('manager');
    expect(db.shortletPricingRules).toContain(rule); expect(db.shortletTeam).toContain(member);
  });

  it('validates apartment/property relationships and keeps same-day expense records uniquely identifiable', async () => {
    expect((await shortlet.logIssue({ apartmentId: 'foreign', title: 'Leak', description: '', priority: 'urgent' })).ok).toBe(false);
    expect((await shortlet.logExpense({ propertyId: 'foreign', amountNaira: 10, category: 'diesel', date: '2026-07-26', note: '' })).ok).toBe(false);
    const input = { propertyId: db.shortletApartments[0].propertyId, amountNaira: 10.01, category: 'diesel' as const, date: '2026-07-26', note: 'QA receipt' };
    expect((await shortlet.logExpense(input)).ok).toBe(true); expect((await shortlet.logExpense(input)).ok).toBe(true);
    expect(db.shortletExpenses[0].id).not.toBe(db.shortletExpenses[1].id);
    expect(db.shortletExpenses[0].amount.minor).toBe(1001);
  });

  it('keeps plan, booking-page and promotions configuration inside the acting tenant', async () => {
    const own = structuredClone(shortletSettings(manager().tenantId).bookingPage);
    const foreignActor = { ...manager(), tenantId: 'tenant-settings-regression' };
    session.actor.mockResolvedValue(foreignActor);
    expect((await shortlet.changePlan('starter')).ok).toBe(true);
    expect((await shortlet.saveBookingPage({ slug: 'other-portfolio', cancellationPolicy: 'Manual review', holdHours: 12 })).ok).toBe(true);
    expect((await shortlet.addPromoCode({ code: 'QA10', pct: 10 })).ok).toBe(true);
    expect(shortletSettings(foreignActor.tenantId).planKey).toBe('starter');
    expect(shortletSettings(manager().tenantId).bookingPage).toEqual(own);
    expect((await shortlet.inviteMember({ name: 'QA', phone: '', role: 'owner' })).ok).toBe(false);
  });
});

describe('Construction delivery, state and stock workflows', () => {
  it('awards one RFQ exactly once, with a unique reference and the request project cost code', async () => {
    const rfq = db.constructionRfqs[0], quote = rfq.quotes[0];
    const refs = new Set(db.constructionOrders.map((order) => order.ref));
    const created = await construction.awardRfq(rfq.id, quote.vendorId);
    expect(created.ok).toBe(true); if (!created.ok) return;
    expect(refs.has(created.ref!)).toBe(false);
    const count = db.constructionOrders.length;
    expect((await construction.awardRfq(rfq.id, quote.vendorId)).ok).toBe(false);
    expect(db.constructionOrders).toHaveLength(count);
    expect(db.constructionOrders[0].costCode).toBe(db.constructionRequests.find((row) => row.ref === rfq.requestRef)!.costCode);
  });

  it('receives quantities, project stock and exact cost together; rejects overreceipt and terminal replay', async () => {
    const order = db.constructionOrders.find((row) => row.ref === 'PO-3012')!;
    const stock = db.constructionStock.find((row) => row.materialId === 'mat-rebar' && row.warehouseId === 'wh-marina')!;
    const code = db.constructionCostCodes.find((row) => row.projectId === order.projectId && row.code === order.costCode)!;
    const oldStock = stock.onHand, oldCost = code.actual.minor;
    expect((await construction.receiveDelivery(order.id, 10)).ok).toBe(true);
    expect(db.constructionMovements[0].materialId).toBe('mat-rebar');
    expect(order.deliveredQty).toBe(10); expect(stock.onHand).toBe(oldStock + 10);
    expect(code.actual.minor - oldCost).toBe(order.value.minor / 4);
    expect((await construction.receiveDelivery(order.id, 31)).ok).toBe(false);
    expect((await construction.receiveDelivery(order.id, 30)).ok).toBe(true);
    const complete = structuredClone({ order, stock, code });
    expect((await construction.receiveDelivery(order.id, 1)).ok).toBe(false);
    expect((await construction.approvePurchaseOrder(order.id)).ok).toBe(false);
    expect({ order, stock, code }).toEqual(complete);
  });

  it('reconciles pro-rata rounding to the full order value across partial receipts', async () => {
    const order = db.constructionOrders.find((row) => row.ref === 'PO-3012')!;
    order.qty = 3; order.value = money(1); order.deliveredQty = 0;
    const code = db.constructionCostCodes.find((row) => row.projectId === order.projectId && row.code === order.costCode)!;
    const before = code.actual.minor;
    for (let index = 0; index < 3; index++) expect((await construction.receiveDelivery(order.id, 1)).ok).toBe(true);
    expect(code.actual.minor - before).toBe(1);
  });

  it.each([NaN, Infinity, -1, 0])('rejects invalid receipts without touching costs or inventory: %s', async (quantity) => {
    const before = structuredClone({ orders: db.constructionOrders, stock: db.constructionStock, codes: db.constructionCostCodes });
    expect((await construction.receiveDelivery('po-m1', quantity)).ok).toBe(false);
    expect({ orders: db.constructionOrders, stock: db.constructionStock, codes: db.constructionCostCodes }).toEqual(before);
  });

  it('does not reopen approved reports, completed tasks or closed RFIs', async () => {
    const report = db.constructionReports.find((row) => row.status === 'approved')!;
    const task = db.constructionTasks.find((row) => row.status === 'done')!;
    const rfi = db.constructionRfis[0]; rfi.status = 'closed';
    expect((await construction.returnDailyReport(report.id, 'QA return')).ok).toBe(false);
    expect((await construction.updateTaskProgress(task.id, 50)).ok).toBe(false);
    expect((await construction.answerRfi(rfi.id, 'replacement')).ok).toBe(false);
    expect(report.status).toBe('approved'); expect(task.status).toBe('done'); expect(rfi.status).toBe('closed');
  });

  it('approves a normal full weekly timesheet and posts its labour cost exactly once', async () => {
    const sheet = db.constructionTimesheets.find((row) => row.status === 'submitted')!;
    sheet.submittedBy = 'QA supervisor'; sheet.normalHours = 40; sheet.overtimeHours = 2;
    const code = db.constructionCostCodes.find((row) => row.projectId === sheet.projectId && row.code === sheet.costCode)!;
    const before = code.actual.minor;
    expect((await construction.approveTimesheet(sheet.id)).ok).toBe(true);
    expect(sheet.status).toBe('approved'); expect(sheet.postedMinor).toBeGreaterThan(0);
    expect(code.actual.minor - before).toBe(sheet.postedMinor);
    expect((await construction.approveTimesheet(sheet.id)).ok).toBe(false);
    expect(code.actual.minor - before).toBe(sheet.postedMinor);
  });

  it('does not progress blocked work ahead of its unfinished predecessor', async () => {
    expect((await construction.updateTaskProgress('tk-m3', 10)).ok).toBe(false);
    expect(db.constructionTasks.find((row) => row.id === 'tk-m3')!.status).toBe('blocked');
    expect((await construction.updateTaskProgress('tk-m2', NaN)).ok).toBe(false);
  });

  it('validates destination stores and count quantities before any stock mutation', async () => {
    const before = structuredClone(db.constructionStock);
    expect((await construction.transferStock('mat-cement', 'wh-marina', 'foreign-store', 1)).ok).toBe(false);
    expect((await construction.transferStock('mat-cement', 'wh-marina', 'wh-central', NaN)).ok).toBe(false);
    expect((await construction.recordStockCount('mat-cement', 'wh-marina', NaN)).ok).toBe(false);
    expect(db.constructionStock).toEqual(before); expect(db.constructionStockCounts).toHaveLength(0);
  });

  it('preserves total stock through transfers and writes negative count variances with the correct sign', async () => {
    const before = db.constructionStock.filter((row) => row.materialId === 'mat-cement').reduce((total, row) => total + row.onHand, 0);
    const ledgerBefore = stockLedger(db.constructionMovements, 'mat-cement').at(-1)!.runningQty;
    expect((await construction.transferStock('mat-cement', 'wh-marina', 'wh-central', 10)).ok).toBe(true);
    expect(db.constructionStock.filter((row) => row.materialId === 'mat-cement').reduce((total, row) => total + row.onHand, 0)).toBe(before);
    expect(stockLedger(db.constructionMovements, 'mat-cement').at(-1)!.runningQty).toBe(ledgerBefore);
    const line = db.constructionStock.find((row) => row.materialId === 'mat-cement' && row.warehouseId === 'wh-marina')!;
    const oldOnHand = line.onHand;
    expect((await construction.recordStockCount('mat-cement', 'wh-marina', oldOnHand - 5)).ok).toBe(true);
    // Preserve receipts made after the physical count rather than overwriting them.
    line.onHand += 2;
    const count = db.constructionStockCounts[0];
    const reason = db.constructionReasonCodes.find((row) => row.domain === 'stock_adjust' && row.active)!;
    expect((await construction.reconcileStockCount(count.id, reason.id, 'QA variance review')).ok).toBe(true);
    expect(line.onHand).toBe(oldOnHand - 3);
    expect(db.constructionMovements[0]).toMatchObject({ kind: 'adjust', qty: -5 });
    expect(stockLedger(db.constructionMovements, 'mat-cement').at(-1)!.runningQty).toBe(ledgerBefore - 5);
    expect((await construction.reconcileStockCount(count.id, reason.id, 'duplicate')).ok).toBe(false);
  });

  it('issues an aggregate quantity across authorised stores without making any store negative', async () => {
    expect((await construction.transferStock('mat-cement', 'wh-marina', 'wh-central', 400)).ok).toBe(true);
    expect((await construction.issueMaterials('mat-cement', 500, 'cp-marina')).ok).toBe(true);
    const stock = db.constructionStock.filter((row) => row.materialId === 'mat-cement');
    expect(stock.every((row) => row.onHand >= 0)).toBe(true);
    expect(stock.reduce((total, row) => total + row.onHand, 0)).toBe(140);
  });

  it('protects reserved stock atomically and permits an unreserved transfer without changing the aggregate ledger', async () => {
    const source = db.constructionStock.find((row) => row.materialId === 'mat-cement' && row.warehouseId === 'wh-marina')!;
    expect(source).toMatchObject({ onHand: 640, reserved: 200 });
    const before = structuredClone({ stock: db.constructionStock, movements: db.constructionMovements, audit: db.constructionAudit });
    expect((await construction.transferStock('mat-cement', 'wh-marina', 'wh-central', 441)).ok).toBe(false);
    expect({ stock: db.constructionStock, movements: db.constructionMovements, audit: db.constructionAudit }).toEqual(before);
    const balance = stockLedger(db.constructionMovements, 'mat-cement').at(-1)!.runningQty;
    expect((await construction.transferStock('mat-cement', 'wh-marina', 'wh-central', 440)).ok).toBe(true);
    expect(source).toMatchObject({ onHand: 200, reserved: 200 });
    expect(stockLedger(db.constructionMovements, 'mat-cement').at(-1)!.runningQty).toBe(balance);
  });

  it('records manual attendance without claiming geofence evidence and clears stale evidence on manual corrections', async () => {
    const worker = db.constructionWorkers.find((row) => !db.constructionAttendance.some((attendance) => attendance.workerId === row.id))!;
    expect(worker).toBeDefined();
    expect(worker.projectId).toBeDefined();
    expect((await construction.clockWorker(worker.id, worker.projectId!, true)).ok).toBe(true);
    const created = db.constructionAttendance.find((row) => row.workerId === worker.id)!;
    expect(created).toMatchObject({ method: 'manual', withinGeofence: false, status: 'present' });
    created.method = 'offline'; created.withinGeofence = true;
    expect((await construction.clockWorker(worker.id, worker.projectId!, false)).ok).toBe(true);
    expect(created).toMatchObject({ method: 'manual', withinGeofence: false, status: 'absent' });
    expect(created.clockIn).toBeUndefined();
  });

  it.each(['gps', 'qr'] as const)('does not silently replace recorded %s attendance evidence with manual attendance', async (method) => {
    const attendance = db.constructionAttendance.find((row) => row.method === method)!;
    const before = structuredClone(attendance);
    expect((await construction.clockWorker(attendance.workerId, attendance.projectId, false)).ok).toBe(false);
    expect(attendance).toEqual(before);
  });

  it('retains an escalation receipt through advisory-state changes without creating duplicate site issues', async () => {
    const signal = scanRisks(constructionWorld(manager()), NOW_MS)[0];
    const count = db.constructionIssues.length;
    const created = await construction.escalateSignalToIssue(signal.id, signal.projectId, signal.title);
    expect(created.ok).toBe(true); if (!created.ok) return;
    expect(db.constructionIssues).toHaveLength(count + 1);
    expect(signalEscalations(manager()).get(signal.id)).toBe(created.ref);
    for (const [action, state] of [[construction.acknowledgeSignal, 'ack'], [construction.snoozeSignal, 'snoozed'], [construction.dismissSignal, 'dismissed']] as const) {
      expect((await action(signal.id)).ok).toBe(true);
      expect(signalStates(manager()).get(signal.id)).toBe(state);
      expect(await construction.escalateSignalToIssue(signal.id, signal.projectId, signal.title)).toEqual({ ok: true, ref: created.ref });
      expect(db.constructionIssues).toHaveLength(count + 1);
    }
    // A stale or corrupt receipt cannot point through to another tenant's issue.
    const foreignIssue = { ...structuredClone(db.constructionIssues[0]), id: 'foreign-escalated-issue', tenantId: foreignTenant };
    db.constructionIssues.push(foreignIssue);
    db.constructionSignalStates.find((row) => row.tenantId === manager().tenantId && row.signalId === signal.id)!.escalatedIssueId = foreignIssue.id;
    expect(signalEscalations(manager()).has(signal.id)).toBe(false);
    expect((await construction.escalateSignalToIssue(signal.id, signal.projectId, signal.title)).ok).toBe(false);
    expect(db.constructionIssues).toHaveLength(count + 2);
  });

  it('creates only one proposed revision from an approved issue and refuses an already approved duplicate revision label', async () => {
    const prior = db.constructionDocs.find((row) => row.status === 'approved')!;
    db.constructionDocs.push({ ...structuredClone(prior), id: 'foreign-proposed-revision', tenantId: foreignTenant, revision: nextRevision(prior.revision), status: 'draft' });
    const before = db.constructionDocs.length;
    expect((await construction.issueRevision(prior.id, 'QA design correction')).ok).toBe(true);
    const proposed = db.constructionDocs[0];
    expect((await construction.issueRevision(prior.id, 'Repeated save')).ok).toBe(false);
    expect(db.constructionDocs).toHaveLength(before + 1);
    const legacyDuplicate = { ...structuredClone(proposed), id: 'legacy-duplicate-revision' };
    db.constructionDocs.push(legacyDuplicate);
    expect((await construction.approveRevision(proposed.id)).ok).toBe(true);
    expect((await construction.approveRevision(legacyDuplicate.id)).ok).toBe(false);
    expect(proposed.status).toBe('approved'); expect(legacyDuplicate.status).toBe('draft');
  });

  it('does not supersede another tenant or project document with the same document number', async () => {
    const doc = db.constructionDocs.find((row) => row.status === 'draft') ?? db.constructionDocs[0]; doc.status = 'draft';
    const foreign = { ...structuredClone(doc), id: 'foreign-doc', tenantId: foreignTenant, status: 'approved' as const };
    db.constructionDocs.push(foreign);
    expect((await construction.approveRevision(doc.id)).ok).toBe(true);
    expect(foreign.status).toBe('approved');
  });

  it('keeps advisory signal state tenant-scoped and validates signal ownership', async () => {
    const actor = manager(), signal = scanRisks(constructionWorld(actor), NOW_MS)[0];
    expect(signal).toBeDefined();
    db.constructionSignalStates.push({ tenantId: 'foreign', signalId: signal.id, state: 'dismissed', atISO: '2026-07-26' });
    expect(signalStates(actor).has(signal.id)).toBe(false);
    expect((await construction.acknowledgeSignal(signal.id)).ok).toBe(true);
    expect(signalStates(actor).get(signal.id)).toBe('ack');
    expect(db.constructionSignalStates.find((row) => row.tenantId === 'foreign')!.state).toBe('dismissed');
    expect((await construction.acknowledgeSignal('foreign-signal')).ok).toBe(false);
  });

  it('rejects foreign project references and invalid import or FX amounts atomically', async () => {
    const count = db.constructionVariations.length, rates = structuredClone(db.constructionFxRates);
    expect((await construction.raiseVariation({ projectId: 'foreign', title: 'QA', reason: '', costImpactNaira: 10, scheduleImpactDays: 1 })).ok).toBe(false);
    expect((await construction.importBoq('cp-marina', [{ code: 'QA', name: 'Invalid', category: 'Other', budgetMinor: NaN }])).ok).toBe(false);
    expect((await construction.updateFxRate('USD', Infinity)).ok).toBe(false);
    expect(db.constructionVariations).toHaveLength(count); expect(db.constructionFxRates).toEqual(rates);
  });

  it('preserves read-only executive permissions for both operational modules', async () => {
    session.actor.mockResolvedValue(identityByKey('executive').actor);
    expect((await shortlet.createBooking(bookingInput())).ok).toBe(false);
    expect((await construction.receiveDelivery('po-m1', 1)).ok).toBe(false);
  });

  it('applies an approval only to the scoped record when another tenant reuses its ID', async () => {
    const own = db.constructionApprovals[0];
    own.raisedBy = 'QA requester'; own.status = 'in_flight';
    own.steps = [{ order: 1, role: 'estate_manager', label: 'Review', slaHours: 24, status: 'pending' }];
    const foreign = { ...structuredClone(own), tenantId: foreignTenant };
    db.constructionApprovals.unshift(foreign);
    expect((await construction.decideApproval(own.id, 'approved')).ok).toBe(true);
    expect(db.constructionApprovals.find((row) => row.tenantId === foreignTenant && row.id === own.id)).toEqual(foreign);
    expect(db.constructionApprovals.find((row) => row.tenantId === manager().tenantId && row.id === own.id)?.status).toBe('approved');
  });

  it.each(['wrong-domain', 'inactive'])('requires an active rejection-domain reason before rejecting an approval: %s', async (invalid) => {
    const own = db.constructionApprovals[0];
    own.raisedBy = 'QA requester'; own.status = 'in_flight';
    own.steps = [{ order: 1, role: 'estate_manager', label: 'Review', slaHours: 24, status: 'pending' }];
    const reason = db.constructionReasonCodes.find((row) => row.domain === (invalid === 'wrong-domain' ? 'stock_adjust' : 'rejection'))!;
    if (invalid === 'inactive') reason.active = false;
    expect((await construction.decideApproval(own.id, 'rejected', 'QA reason', reason.id)).ok).toBe(false);
    expect(own.status).toBe('in_flight');
  });
});
