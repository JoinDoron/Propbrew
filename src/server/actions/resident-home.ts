'use server';

/**
 * Resident-home actions: the active-unit context and the wallet top-up.
 *
 * The active unit is stored in a cookie and validated against the actor's own
 * unitIds on every read — a resident can never select a unit that is not theirs
 * (§8.2 / §7 O), no matter what the cookie says. Top-up funds the SELECTED
 * unit's wallet after confirming that unit belongs to the resident.
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { repos } from '@/server/data';
import { db, recordHistory, settleUnitFromWallet } from '@/server/data/store';
import { addMoney, money } from '@/domain/primitives';
import { ACTIVE_UNIT_COOKIE } from '@/server/active-unit';
import { nowISO } from '@/server/clock';

export async function setActiveUnit(unitId: string): Promise<void> {
  const actor = await getActor();
  if (!actor.unitIds.includes(unitId)) return; // not yours — ignore
  const store = await cookies();
  store.set(ACTIVE_UNIT_COOKIE, unitId, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  revalidatePath('/portal');
}

export type TopUpResult = { ok: true } | { ok: false; error: string };

/** Fund the selected unit's wallet (card/transfer flow simulated). */
export async function topUpWallet(unitId: string, amountNaira: number): Promise<TopUpResult> {
  const actor = await getActor();
  try {
    assertCan(actor, 'payments_in_app', 'create'); // resident-only (§7)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Only residents can fund a wallet.' };
    throw e;
  }
  if (!actor.unitIds.includes(unitId)) return { ok: false, error: 'That unit is not linked to your account.' };
  if (!(amountNaira > 0)) return { ok: false, error: 'Enter an amount greater than zero.' };

  const wallet = db.wallets.find((w) => w.unitId === unitId && w.ownerUserId === actor.userId);
  if (!wallet) return { ok: false, error: 'No wallet found for this unit.' };

  wallet.available = addMoney(wallet.available, money(Math.round(amountNaira * 100), wallet.available.currency));
  // Auto-deduct: new funds clear pending charges first (PRD open question #1).
  settleUnitFromWallet(unitId);

  ['/portal', '/portal/bills', '/billing', '/estate', '/dashboard'].forEach((p) => revalidatePath(p));
  return { ok: true };
}

/**
 * Pay a specific charge — the ONLY payment path now that the wallet is the
 * single source of funds. It tops the unit wallet up to cover the charge, then
 * clears that exact invoice from the wallet, recording a PAYMENT_CONFIRMED
 * (SC-02). Net wallet change is zero; the money flows resident → wallet → charge.
 */
export async function payChargeFromWallet(ref: string): Promise<TopUpResult> {
  const actor = await getActor();
  try {
    assertCan(actor, 'payments_in_app', 'create'); // resident-only (§7)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Only residents can pay in-app.' };
    throw e;
  }
  const inv = repos.invoices.getByRef(actor, ref); // scoped: only your own units
  if (!inv) return { ok: false, error: 'Charge not found.' };
  const live = db.invoices.find((i) => i.id === inv.id);
  if (!live) return { ok: false, error: 'Charge not found.' };
  if (live.status === 'paid' || live.status === 'draft') return { ok: false, error: 'Nothing to pay on this charge.' };

  const owed = live.amount.minor - live.paid.minor;
  if (owed <= 0) return { ok: false, error: 'Nothing to pay.' };

  const wallet = db.wallets.find((w) => w.unitId === live.unitId && w.ownerUserId === actor.userId);
  if (!wallet) return { ok: false, error: 'No wallet is linked to this unit.' };

  // A payment must be able to FAIL. This previously topped the wallet up by the
  // shortfall before deducting it, so any resident could clear any balance for
  // free and no code path downstream had ever seen a declined payment.
  if (wallet.available.minor < owed) {
    return {
      ok: false,
      error: `Wallet balance is short by ${'\u20a6'}${((owed - wallet.available.minor) / 100).toLocaleString('en-NG')}. Top up and try again.`,
    };
  }

  const from = live.status;
  live.paid = money(live.paid.minor + owed, live.amount.currency);
  live.status = 'paid';
  live.agingDays = Math.min(live.agingDays, 0);
  wallet.available = money(wallet.available.minor - owed, wallet.available.currency);

  recordHistory('service-charge', live.id, {
    at: nowISO(),
    event: 'PAYMENT_CONFIRMED',
    from,
    to: 'paid',
    actorId: actor.userId,
    actorName: 'Wallet payment (SC-02)',
    actorRole: 'system_webhook',
  });

  ['/portal/bills', '/portal', '/billing', '/estate', '/dashboard'].forEach((p) => revalidatePath(p));
  return { ok: true };
}
