'use server';

/**
 * Vendor listing management (EM-09, §7 O via my_vendor_org). A vendor may CREATE
 * a listing for its own org and toggle its own listings active/paused. Listings
 * are scoped to the vendor's org on read; writes re-check ownership so a vendor
 * can never edit another org's listing. Lands in the shared store.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { repos } from '@/server/data';
import { db } from '@/server/data/store';
import { money } from '@/domain/primitives';
import type { Listing } from '@/domain/entities';

export type ListingResult = { ok: true } | { ok: false; error: string };

let counter = 0;

export async function createListing(input: { title: string; category: string; priceNaira: number }): Promise<ListingResult> {
  const actor = await getActor();
  try {
    assertCan(actor, 'marketplace', 'create');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot create listings.' };
    throw e;
  }
  if (!actor.vendorOrgId) return { ok: false, error: 'Only vendors can list services.' };
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Give your service a name.' };
  if (!(input.priceNaira > 0)) return { ok: false, error: 'Set a price greater than zero.' };

  // A vendor's display name + estate come from its existing listings/scope.
  const mine = repos.listings.list(actor).items;
  const vendorName = mine[0]?.vendorName ?? 'My services';
  const estateId = mine[0]?.estateId ?? actor.estateIds[0] ?? 's-gardens';

  db.listings.unshift({
    tenantId: actor.tenantId,
    id: `lst-new-${++counter}`,
    vendorOrgId: actor.vendorOrgId,
    vendorName,
    title,
    category: input.category.trim() || 'General',
    price: money(Math.round(input.priceNaira * 100), 'NGN'),
    status: 'active',
    estateId,
  } as unknown as Listing);

  ['/portal/listings', '/portal/marketplace', '/marketplace'].forEach((p) => revalidatePath(p));
  return { ok: true };
}

export async function toggleListing(listingId: string): Promise<ListingResult> {
  const actor = await getActor();
  try {
    assertCan(actor, 'marketplace', 'update');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot edit listings.' };
    throw e;
  }
  // Scoped read first: only the vendor's own listings are visible here.
  const owned = repos.listings.list(actor).items.find((l) => l.id === listingId);
  if (!owned) return { ok: false, error: 'Listing not found.' };
  const live = db.listings.find((l) => l.id === listingId);
  if (!live) return { ok: false, error: 'Listing not found.' };

  live.status = live.status === 'active' ? 'paused' : 'active';
  ['/portal/listings', '/portal/marketplace', '/marketplace'].forEach((p) => revalidatePath(p));
  return { ok: true };
}
