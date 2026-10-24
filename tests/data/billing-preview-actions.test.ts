import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/server/data/store';
import { identityByKey, SEED } from '@/server/identities';
const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
import { sendReminderCampaign } from '@/server/actions/billing';
beforeEach(() => boundary.actor.mockResolvedValue(identityByKey('estate_manager').actor));

describe('Billing reminder preview boundaries', () => {
  it('deduplicates valid scoped recipients without sending or changing ledger records', async () => {
    const before = structuredClone(db);
    expect(await sendReminderCampaign(['user-tobi', 'user-tobi'])).toEqual({ ok: true, sent: 1 });
    expect(db).toEqual(before);
  });
  it('rejects foreign accounts, empty selections and invalid payloads', async () => {
    const foreign = db.invoices.find((row) => row.tenantId === SEED.tenantB)!.ownerUserId;
    for (const ids of [[foreign], [], ['unknown'], [null], null, Array.from({ length: 201 }, () => 'user-tobi')]) {
      expect(await sendReminderCampaign(ids as never)).toMatchObject({ ok: false });
    }
  });
  it('rejects a legitimate recipient when the actor lacks the assigned estate or campaign permission', async () => {
    boundary.actor.mockResolvedValue({ ...identityByKey('estate_manager').actor, estateIds: [SEED.estateVictoria] });
    expect(await sendReminderCampaign(['user-tobi'])).toMatchObject({ ok: false });
    boundary.actor.mockResolvedValue(identityByKey('executive').actor);
    expect(await sendReminderCampaign(['user-tobi'])).toMatchObject({ ok: false });
  });
});
