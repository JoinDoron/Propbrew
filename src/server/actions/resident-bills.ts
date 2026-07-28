'use server';

/**
 * Resident "pay all outstanding" (SC-02, §7 O). Clears every unpaid charge on
 * the resident's units from the unit wallet in one go — topping each unit wallet
 * up to cover its charges, then settling them, exactly like the single-charge
 * path. Each cleared charge records a PAYMENT_CONFIRMED audit entry.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { repos } from '@/server/data';
import { db, recordHistory } from '@/server/data/store';
import { money } from '@/domain/primitives';

const UNPAID = ['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated'];

export type PayAllResult = { ok: true; count: number; totalMinor: number } | { ok: false; error: string };

export async function payAllOutstanding(): Promise<PayAllResult> {
  const actor = await getActor();
  try {
    assertCan(actor, 'payments_in_app', 'create'); // resident (§7 O)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Only residents can pay in-app.' };
    throw e;
  }

  const mine = repos.invoices.list(actor).items.filter((i) => UNPAID.includes(i.status));
  if (mine.length === 0) return { ok: false, error: 'You have no outstanding charges.' };

  let count = 0;
  let totalMinor = 0;
  for (const inv of mine) {
    const live = db.invoices.find((i) => i.id === inv.id);
    if (!live) continue;
    const owed = live.amount.minor - live.paid.minor;
    if (owed <= 0) continue;
    const wallet = db.wallets.find((w) => w.unitId === live.unitId && w.ownerUserId === actor.userId);
    if (!wallet) continue;

    const shortfall = Math.max(0, owed - wallet.available.minor);
    wallet.available = money(wallet.available.minor + shortfall, wallet.available.currency);
    const from = live.status;
    live.paid = money(live.paid.minor + owed, live.amount.currency);
    live.status = 'paid';
    live.agingDays = Math.min(live.agingDays, 0);
    wallet.available = money(wallet.available.minor - owed, wallet.available.currency);

    recordHistory('service-charge', live.id, {
      at: new Date().toISOString(), event: 'PAYMENT_CONFIRMED', from, to: 'paid',
      actorId: actor.userId, actorName: 'Wallet payment · pay all (SC-02)', actorRole: 'system_webhook',
    });
    count += 1;
    totalMinor += owed;
  }

  ['/portal/bills', '/portal', '/billing', '/dashboard'].forEach((p) => revalidatePath(p));
  return count > 0 ? { ok: true, count, totalMinor } : { ok: false, error: 'Nothing to pay.' };
}
