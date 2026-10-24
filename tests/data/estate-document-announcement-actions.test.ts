import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/server/data/store';
import { identityByKey, SEED } from '@/server/identities';
import type { Actor } from '@/lib/authz';
import type { EstateDocument } from '@/domain/entities';

const boundary = vi.hoisted(() => ({ actor: vi.fn(), refresh: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.refresh }));
import { saveDocumentFields, searchDocuments, uploadDocument } from '@/server/actions/documents';
import { sendAnnouncement, type SendInput } from '@/server/actions/announcements';
import { estateTargetOptions } from '@/server/reads/estate-target-options';
import { scopedDocumentRecords } from '@/server/reads/documents';
import { createEvent, createMotion, logParcel } from '@/server/actions/estate';

const initial = structuredClone(db);
const manager = () => identityByKey('estate_manager').actor;
const actAs = (overrides: Partial<Actor>) => boundary.actor.mockResolvedValue({ ...manager(), ...overrides });
const notice = (): SendInput => ({ title: 'Water maintenance', body: 'The supply will pause during the recorded works.', scope: 'estate', audience: 'All residents', channels: ['in_app'], aiDrafted: false, approved: false });
const document = () => ({ name: 'Fire certificate', folder: 'Compliance', type: 'certificate' as const, audience: 'Managers', extracted: [{ label: 'Expiry date', value: '2027-07-26' }], scanned: true });
const ownDoc = () => db.documents.find((row) => row.tenantId === SEED.tenantA && row.estateId === SEED.estateGardens)!;
function secondEstate() {
  const estate = { ...db.sites.find((row) => row.id === SEED.estateGardens)!, id: 's-second-estate', name: 'New Abuja estate', unitCount: 23 } as (typeof db.sites)[number];
  db.sites.push(estate);
  const actor = { ...manager(), estateIds: [SEED.estateGardens, estate.id] };
  boundary.actor.mockResolvedValue(actor);
  return { estate, actor };
}
beforeEach(() => { vi.clearAllMocks(); Object.assign(db, structuredClone(initial)); boundary.actor.mockResolvedValue(manager()); });
afterEach(() => { Object.assign(db, structuredClone(initial)); vi.useRealTimers(); });

describe('Estate document metadata integrity', () => {
  it('edits the scoped document when a foreign tenant has the same id earlier in the store', async () => {
    const doc = ownDoc();
    const foreign = { ...structuredClone(doc), tenantId: SEED.tenantB, estateId: SEED.estateIkoyi } as EstateDocument;
    db.documents.unshift(foreign);
    const before = structuredClone(foreign);
    expect(await saveDocumentFields(doc.id, [{ label: 'Reviewed by', value: 'Ada Okafor' }])).toEqual({ ok: true });
    expect(foreign).toEqual(before);
    expect(doc.extracted).toEqual([{ label: 'Reviewed by', value: 'Ada Okafor' }]);
    expect(doc.expiryDate).toBeUndefined();
  });

  it('can edit an authorised document beyond the first 50 records', async () => {
    const template = structuredClone(ownDoc());
    db.documents = Array.from({ length: 65 }, (_, index) => ({ ...structuredClone(template), id: `doc-page-${index}` }));
    expect(await saveDocumentFields('doc-page-64', [{ label: 'Expiry date', value: '2028-02-29' }])).toEqual({ ok: true });
    expect(db.documents[64].expiryDate).toBe('2028-02-29');
  });

  it('searches every scoped index page without returning foreign documents', async () => {
    const template = structuredClone(ownDoc());
    db.documents = Array.from({ length: 205 }, (_, index) => ({ ...structuredClone(template), id: `doc-page-${index}`, name: `Routine record ${index}`, keywords: [], extracted: [] }));
    db.documents[204].name = 'Abujasentinel certificate.pdf';
    db.documents.unshift({ ...structuredClone(template), id: 'foreign-search', tenantId: SEED.tenantB, estateId: SEED.estateIkoyi, name: 'Abujasentinel foreign.pdf' } as EstateDocument);
    const result = await searchDocuments('Abujasentinel');
    expect(result.hits.map((hit) => hit.docId)).toEqual(['doc-page-204']);
    expect(scopedDocumentRecords(manager())).toHaveLength(205);
    expect(scopedDocumentRecords(manager()).at(-1)?.id).toBe('doc-page-204');
  });

  it.each([
    [{ label: 'Expiry date', value: '2027-02-29' }],
    [{ label: 'Issue date', value: '31/12/2026' }],
    [{ label: '', value: 'Value' }],
    [{ label: 'Insurer', value: 123 }],
  ])('rejects invalid extracted fields before changing any record', async (...fields) => {
    const before = structuredClone(db.documents);
    expect(await saveDocumentFields(ownDoc().id, fields as never)).toMatchObject({ ok: false });
    expect(db.documents).toEqual(before);
    expect(boundary.refresh).not.toHaveBeenCalled();
  });

  it('clears an expired date when its reviewed value is cleared', async () => {
    const doc = ownDoc(); doc.expiryDate = '2025-01-01';
    expect(await saveDocumentFields(doc.id, [{ label: 'Expiry date', value: '' }])).toEqual({ ok: true });
    expect(doc.expiryDate).toBeUndefined();
  });

  it('does not confuse an Updated by label with a date', async () => {
    expect(await saveDocumentFields(ownDoc().id, [{ label: 'Updated by', value: 'Ada' }])).toEqual({ ok: true });
  });

  it('creates metadata using the assigned tenant and estate with no invented file size or OCR confidence', async () => {
    actAs({ tenantId: SEED.tenantB, estateIds: [SEED.estateIkoyi] });
    const result = await uploadDocument(document());
    expect(result.ok).toBe(true);
    expect(db.documents.at(-1)).toMatchObject({ tenantId: SEED.tenantB, estateId: SEED.estateIkoyi, name: 'Fire certificate.pdf', sizeKb: 0, extractionConfidence: 0, expiryDate: '2027-07-26' });
  });

  it.each([
    { type: 'javascript' }, { audience: 'Everyone on the internet' }, { scanned: 'true' },
    { extracted: [{ label: 'Expiry date', value: '2026-13-01' }] }, { name: '   ' },
    { estateId: SEED.estateIkoyi },
  ])('rejects invalid metadata or foreign property before creating a record', async (changes) => {
    const before = structuredClone(db.documents);
    expect(await uploadDocument({ ...document(), ...changes } as never)).toMatchObject({ ok: false });
    expect(db.documents).toEqual(before);
    expect(boundary.refresh).not.toHaveBeenCalled();
  });

  it('never borrows ownership from the first document when no estate is assigned', async () => {
    actAs({ estateIds: [] });
    const before = structuredClone(db.documents);
    expect(await uploadDocument(document())).toMatchObject({ ok: false });
    expect(db.documents).toEqual(before);
  });

  it('rejects foreign mutations, malformed search queries and read-only document edits', async () => {
    actAs({ estateIds: [SEED.estateVictoria] });
    expect(await saveDocumentFields(ownDoc().id, [{ label: 'Author', value: 'Unauthorised' }])).toMatchObject({ ok: false });
    boundary.actor.mockResolvedValue(identityByKey('resident').actor);
    expect(await uploadDocument(document())).toMatchObject({ ok: false });
    await expect(searchDocuments('x'.repeat(2001))).rejects.toThrow('2,000');
  });
});

describe('Announcement approval and scheduling records', () => {
  it('retains the actual requested schedule and never records an unverified provider delivery', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    const result = await sendAnnouncement({ ...notice(), scheduleAt: '2026-10-25T09:30:00+01:00' });
    expect(result).toEqual({ ok: true, reach: 235, scheduled: true });
    expect(db.announcements[0]).toMatchObject({ estateId: SEED.estateGardens, scheduleAt: '2026-10-25T08:30:00.000Z', sentAt: null, delivered: 0, read: 0 });
    expect(boundary.refresh).toHaveBeenCalledWith('/announcements');
  });

  it('requires actual manager approval for a draft and does not accept a truthy string', async () => {
    const before = structuredClone(db.announcements);
    expect(await sendAnnouncement({ ...notice(), aiDrafted: true })).toMatchObject({ ok: false });
    expect(await sendAnnouncement({ ...notice(), aiDrafted: true, approved: 'false' } as never)).toMatchObject({ ok: false });
    expect(db.announcements).toEqual(before);
    expect(await sendAnnouncement({ ...notice(), aiDrafted: true, approved: true })).toMatchObject({ ok: true });
  });

  it.each([
    { scope: 'invalid' }, { audience: 'Unknown audience' }, { channels: ['fax'] },
    { channels: [] }, { scheduleAt: '2026-02-30T12:00:00Z' }, { scheduleAt: '2020-01-01T12:00:00Z' },
    { scope: 'building', block: 'Foreign tower' }, { estateId: SEED.estateIkoyi }, { title: '' },
  ])('rejects invalid announcements before writes', async (changes) => {
    const before = structuredClone(db.announcements);
    expect(await sendAnnouncement({ ...notice(), ...changes } as never)).toMatchObject({ ok: false });
    expect(db.announcements).toEqual(before);
    expect(boundary.refresh).not.toHaveBeenCalled();
  });

  it('does not inflate estimated reach when duplicate channels are submitted', async () => {
    expect(await sendAnnouncement({ ...notice(), channels: ['in_app', 'in_app'] })).toEqual({ ok: true, reach: 235, scheduled: false });
    expect(db.announcements[0]).toMatchObject({ delivered: 0, read: 0 });
  });

  it('keeps read-only and unassigned managers from recording notices', async () => {
    boundary.actor.mockResolvedValue(identityByKey('executive').actor);
    expect(await sendAnnouncement(notice())).toMatchObject({ ok: false });
    actAs({ estateIds: [] });
    expect(await sendAnnouncement(notice())).toMatchObject({ ok: false });
  });
});

describe('Explicit property targets across Estate creation workflows', () => {
  it('exposes only authorised estate properties for the exact action', () => {
    const { estate, actor } = secondEstate();
    expect(estateTargetOptions(actor, 'announcements', 'transition').map((option) => option.id)).toEqual([SEED.estateGardens, estate.id]);
    expect(() => estateTargetOptions(identityByKey('resident').actor, 'announcements', 'transition')).toThrow();
    expect(estateTargetOptions({ ...actor, tenantId: SEED.tenantB }, 'announcements', 'transition')).toEqual([]);
  });

  it('requires an explicit choice when multiple properties are assigned and creates all record types in the selected property', async () => {
    const { estate } = secondEstate();
    const parcel = { residentName: 'Ada Okafor', unitLabel: '01A', courier: 'Courier', size: 'S' as const };
    const event = { title: 'Abuja community meeting', category: 'meeting' as const, venue: 'Community hall', host: 'Estate office', startISO: '2027-01-10', capacity: 23 };
    const motion = { title: 'Approve estate budget', summary: 'Review the budget.', category: 'budget' as const, quorumPct: 33, thresholdPct: 50 };
    for (const result of [await logParcel(parcel), await createEvent(event), await createMotion(motion), await uploadDocument(document()), await sendAnnouncement(notice())]) expect(result).toMatchObject({ ok: false });
    for (const result of [await logParcel({ ...parcel, estateId: estate.id }), await createEvent({ ...event, estateId: estate.id }), await createMotion({ ...motion, estateId: estate.id }), await uploadDocument({ ...document(), estateId: estate.id }), await sendAnnouncement({ ...notice(), estateId: estate.id })]) expect(result).toMatchObject({ ok: true });
    for (const row of [db.parcels[0], db.communityEvents[0], db.motions.at(-1), db.documents.at(-1), db.announcements[0]]) expect(row).toMatchObject({ tenantId: estate.tenantId, estateId: estate.id });
    expect(db.motions.at(-1)?.eligibleWeight).toBe(23);
  });
});
