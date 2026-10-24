'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

/**
 * Resident marketplace order (EM-09, §7 O). A resident may CREATE an order
 * against an approved, active listing on their own account. It lands `placed`
 * in the shared store (visible to the resident and the marketplace desk) with a
 * PLACE audit entry. Fulfilment/refunds stay vendor/manager work.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { repos } from '@/server/data';
import { db, recordHistory } from '@/server/data/store';
import { operatingNowISO } from '@/server/operating-clock';
import type { MarketplaceOrder } from '@/domain/entities';
import { nowISO } from '@/server/clock';

export type OrderResult = { ok: true; ref: string } | { ok: false; error: string };


export async function placeOrder(listingId: string): Promise<OrderResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  try {
    assertCan(actor, 'marketplace', 'create'); // resident (§7 O)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot place an order.' };
    throw e;
  }
  const listing = repos.listings.catalog(actor).find((l) => l.id === listingId);
  if (!listing) return { ok: false, error: 'Listing not found.' };
  if (listing.status !== 'active') return { ok: false, error: 'This listing is not available right now.' };

  const me = repos.residents.list(actor).items.find((r) => r.userId === actor.userId);
  const estateId = actor.estateIds[0] ?? 's-gardens';
  const ref = `ORD-${5100 + db.marketplaceOrders.length}`;

  const order = {
    tenantId: actor.tenantId,
    id: `ord-res-${nextRecordSequence('resident-orders:counter', 0, true)}`,
    ref,
    ownerUserId: actor.userId,
    vendorOrgId: listing.vendorOrgId,
    estateId,
    residentName: me?.name ?? 'Resident',
    listingTitle: listing.title,
    status: 'placed',
    amount: listing.price,
    placedAt: operatingNowISO(),
  } as unknown as MarketplaceOrder;

  db.marketplaceOrders.unshift(order);
  recordHistory('marketplace-order', order.id, {
    at: nowISO(), event: 'PLACE', from: null, to: 'placed',
    actorId: actor.userId, actorName: me?.name ?? 'Resident', actorRole: 'resident',
    note: listing.title,
  });

  ['/portal/marketplace', '/portal', '/marketplace'].forEach((p) => revalidatePath(p));
  return { ok: true, ref };

  }, 'estate');
}
