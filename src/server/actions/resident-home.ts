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
import { db, settleUnitFromWallet } from '@/server/data/store';
import { addMoney, money } from '@/domain/primitives';
import { ACTIVE_UNIT_COOKIE } from '@/server/active-unit';

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

  ['/portal', '/portal/bills', '/billing', '/dashboard'].forEach((p) => revalidatePath(p));
  return { ok: true };
}
