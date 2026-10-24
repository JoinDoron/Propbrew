'use server';

import { withDurableMutation } from '@/server/data/durable-records';

/**
 * SC-01 — platform user administration. Only Platform Admin holds a cross-tenant
 * grant on users_roles; this action suspends or reactivates a user account.
 * Deny-by-default and server-enforced: the capability is re-checked here even
 * though the page is already gated.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { db } from '@/server/data/store';

export type UserAdminResult = { ok: true; status: string } | { ok: false; error: string };

export async function setUserStatus(userId: string, next: 'active' | 'suspended'): Promise<UserAdminResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  if (!actor.roles.includes('platform_admin') || actor.companyAccess !== undefined) return { ok: false, error: 'You cannot manage platform user accounts.' };
  if (next !== 'active' && next !== 'suspended') return { ok: false, error: 'Choose a valid account status.' };
  try {
    assertCan(actor, 'users_roles', 'update');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot manage user accounts.' };
    throw e;
  }
  const user = db.users.find((u) => u.id === userId);
  if (!user) return { ok: false, error: 'User not found.' };
  if (actor.userId === userId) return { ok: false, error: 'You cannot suspend your own account.' };

  user.status = next;
  revalidatePath('/admin/users');
  revalidatePath('/admin/overview');
  return { ok: true, status: next };

  }, ['estate', 'facility', 'shortlet', 'construction']);
}
