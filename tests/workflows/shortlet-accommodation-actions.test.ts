import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identityByKey, SEED } from '@/server/identities';
import { money } from '@/domain/primitives';
import { db, initialWorkspaceRecordState } from '@/server/data/store';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { createProperty, updateProperty, createApartment, updateApartment, createBooking, type ApartmentDetailsInput } from '@/server/actions/shortlet';

const session = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: session.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
let state: WorkspaceRecordState;
const run = <T>(fn: () => T) => runWithRecordContext({ state, domainTenantId: SEED.tenantA, mode: 'write' }, fn);
const property = () => ({ name: 'QA Garden Court', city: 'Abuja', area: 'Maitama' });
const apartment = (): ApartmentDetailsInput => ({ name: 'QA Apartment 1', type: 'Studio', nightlyRateNaira: 1234.56, status: 'active', wifiSsid: 'QA guest network', wifiPassword: 'qa-only-wifi-password', accessInstructions: 'Ask the recorded host for arrival instructions.', houseRules: ['No parties'], amenities: ['Solar backup'] });
beforeEach(() => { vi.stubEnv('DATA_SOURCE', 'memory'); state = initialWorkspaceRecordState(SEED.tenantA); state.collections.shortletPlanKey = 'pro'; session.actor.mockResolvedValue(structuredClone(identityByKey('estate_manager').actor)); });
afterEach(() => vi.unstubAllEnvs());

describe('Shortlet property and apartment registration', () => {
  it('registers accommodation, creates a booking from it, then edits current records without rewriting booked rates or totals', async () => run(async () => {
    const created = await createProperty(property()); expect(created.ok).toBe(true);
    const record = db.shortletProperties[0]; expect(record).toMatchObject({ ...property(), tenantId: SEED.tenantA, bankName: '', accountName: '', accountNumber: '' });
    expect((await createApartment(record.id, apartment())).ok).toBe(true);
    const unit = db.shortletApartments[0]; expect(unit).toMatchObject({ propertyId: record.id, nightlyRate: money(123456), status: 'active', channels: [] });
    expect((await createBooking({ apartmentId: unit.id, guestName: 'Synthetic QA guest', guestPhone: '', checkIn: '2028-02-01', checkOut: '2028-02-04', source: 'direct', status: 'confirmed', cautionNaira: 100, paidNaira: 0 })).ok).toBe(true);
    const booking = structuredClone(db.shortletBookings[0]);
    const updates = { ...apartment() }; delete updates.wifiPassword;
    expect((await updateApartment(unit.id, { ...updates, name: 'QA Apartment Renovated', nightlyRateNaira: 4321.09, status: 'inactive' })).ok).toBe(true);
    expect(unit).toMatchObject({ name: 'QA Apartment Renovated', nightlyRate: money(432109), wifiPassword: 'qa-only-wifi-password', status: 'inactive' });
    expect(db.shortletBookings[0]).toEqual(booking);
    expect((await updateProperty(record.id, { name: 'QA Garden Court Updated', city: 'Lagos', area: 'Ikeja' })).ok).toBe(true);
    expect(record).toMatchObject({ name: 'QA Garden Court Updated', city: 'Lagos', area: 'Ikeja' });
    const audit = state.auxiliary['shortlet:accommodation:audit'] as { actorId: string; kind: string }[];
    expect(audit.map((event) => event.kind)).toEqual(['property.created', 'apartment.created', 'apartment.updated', 'property.updated']);
    expect(audit.every((event) => event.actorId === identityByKey('estate_manager').actor.userId)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('qa-only-wifi-password');
  }));

  it('preserves recorded settlement references and rejects callers trying to edit them through property registration', async () => run(async () => {
    const record = db.shortletProperties[0]; const before = structuredClone(record);
    expect((await updateProperty(record.id, { ...property(), bankName: 'forged bank' } as Parameters<typeof updateProperty>[1])).ok).toBe(false);
    expect(record).toEqual(before);
    expect((await updateProperty(record.id, property())).ok).toBe(true);
    expect([record.bankName, record.accountName, record.accountNumber]).toEqual([before.bankName, before.accountName, before.accountNumber]);
  }));

  it('rejects repeated property and apartment names without duplicate records', async () => run(async () => {
    expect((await createProperty(property())).ok).toBe(true);
    const id = db.shortletProperties[0].id;
    expect((await createProperty({ ...property(), name: '  qa GARDEN court  ' })).ok).toBe(false);
    expect(db.shortletProperties.filter((row) => row.id === id)).toHaveLength(1);
    expect((await createApartment(id, apartment())).ok).toBe(true);
    const count = db.shortletApartments.length;
    expect((await createApartment(id, { ...apartment(), name: 'qa APARTMENT 1' })).ok).toBe(false);
    expect(db.shortletApartments).toHaveLength(count);
  }));

  it.each([NaN, Infinity, -1, 0, 0.001, 12.345, Number.MAX_VALUE])('rejects invalid or sub-kobo nightly rates atomically: %s', async (rate) => run(async () => {
    const before = structuredClone(db.shortletApartments);
    expect((await createApartment(db.shortletProperties[0].id, { ...apartment(), nightlyRateNaira: rate })).ok).toBe(false);
    expect((await updateApartment(db.shortletApartments[0].id, { ...apartment(), nightlyRateNaira: rate })).ok).toBe(false);
    expect(db.shortletApartments).toEqual(before);
  }));

  it('rejects tenant or parent reassignment fields, foreign target records and non-NGN repricing', async () => run(async () => {
    const record = db.shortletApartments[0]; const before = structuredClone(record);
    expect((await updateApartment(record.id, { ...apartment(), tenantId: SEED.tenantB } as ApartmentDetailsInput)).ok).toBe(false);
    expect((await updateApartment(record.id, { ...apartment(), propertyId: 'foreign-parent' } as ApartmentDetailsInput)).ok).toBe(false);
    expect(record).toEqual(before);
    record.nightlyRate = money(1000, 'USD');
    expect((await updateApartment(record.id, apartment())).ok).toBe(false); expect(record.nightlyRate.currency).toBe('USD');
    session.actor.mockResolvedValue({ ...identityByKey('estate_manager').actor, tenantId: SEED.tenantB });
    expect((await updateProperty(db.shortletProperties[0].id, property())).ok).toBe(false);
    expect((await updateApartment(record.id, apartment())).ok).toBe(false);
    expect((await createApartment(db.shortletProperties[0].id, apartment())).ok).toBe(false);
  }));

  it('keeps normal plan capacity and module viewer restrictions in place', async () => run(async () => {
    db.shortletPlanKey = 'lite';
    const before = structuredClone(db.shortletApartments);
    expect((await createApartment(db.shortletProperties[0].id, apartment())).ok).toBe(false);
    expect(db.shortletApartments).toEqual(before);
    session.actor.mockResolvedValue(identityByKey('executive').actor);
    expect((await createProperty(property())).ok).toBe(false);
    expect((await updateProperty(db.shortletProperties[0].id, property())).ok).toBe(false);
    expect((await createApartment(db.shortletProperties[0].id, apartment())).ok).toBe(false);
    expect((await updateApartment(db.shortletApartments[0].id, apartment())).ok).toBe(false);
  }));
});
