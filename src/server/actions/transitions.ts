'use server';

import { withDurableMutation } from '@/server/data/durable-records';

/**
 * Transition actions for the role-driven machines (booking, SOS, marketplace)
 * plus the special billing/create actions. Same contract as the work-order
 * action: two server-side gates (§7 capability + §10 machine legality for one of
 * the actor's roles), then a mutation and an attributed audit entry.
 *
 * Billing is special: SC-02 payments are applied by the gateway webhook, never
 * by a role. `payInvoice` therefore authorises the resident's *initiation*
 * (payments_in_app) but fires PAYMENT_CONFIRMED as the system_webhook actor —
 * the model's honest account of who moves the money.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, ROLE_LABELS, type Capability } from '@/lib/authz';
import { repos, scopedMutableGet, seed } from '@/server/data';
import { db, recordHistory } from '@/server/data/store';
import {
  bookingMachine,
  marketplaceOrderMachine,
  serviceChargeMachine,
  sosEventMachine,
  type Machine,
} from '@/domain/workflows';
import type { Role } from '@/domain/enums';
import { nowISO } from '@/server/clock';

export type TxResult = { ok: true; to: string } | { ok: false; error: string };

type Row = { id: string; status: string; [k: string]: unknown };

const REGISTRY: Record<
  'booking' | 'sos-event' | 'marketplace-order',
  { machine: Machine<string>; rows: () => Row[]; capability: Capability; paths: string[] }
> = {
  booking: { machine: bookingMachine as Machine<string>, rows: () => db.bookings as unknown as Row[], capability: 'bookings_amenities', paths: ['/bookings', '/portal/bookings', '/estate'] },
  'sos-event': { machine: sosEventMachine as Machine<string>, rows: () => db.sosEvents as unknown as Row[], capability: 'security_sos', paths: ['/security', '/portal/security', '/estate', '/dashboard'] },
  'marketplace-order': { machine: marketplaceOrderMachine as Machine<string>, rows: () => db.marketplaceOrders as unknown as Row[], capability: 'marketplace', paths: ['/marketplace', '/portal/marketplace', '/portal/listings'] },
};

function displayName(userId: string, role: Role): string {
  return seed.users.find((u) => u.id === userId)?.name ?? ROLE_LABELS[role] ?? userId;
}

/** Generic role-driven transition for booking / SOS / marketplace. */
export async function transition(machineKey: 'booking' | 'sos-event' | 'marketplace-order', id: string, event: string): Promise<TxResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const reg = REGISTRY[machineKey];

  try {
    assertCan(actor, reg.capability, 'transition');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You do not have permission for this action.' };
    throw e;
  }

  // Scoped visibility: the row must be one this actor can read.
  const visible = repos[readerFor(machineKey)].list(actor).items as unknown as Row[];
  const row = visible.find((r) => r.id === id);
  if (!row) return { ok: false, error: 'Record not found.' };

  const t = reg.machine.transitions.find(
    (x) => x.from === row.status && x.event === event && x.actors.some((a) => (actor.roles as Role[]).includes(a as Role)),
  );
  if (!t) return { ok: false, error: `“${event}” is not a legal move from “${row.status}” for your role.` };

  const from = row.status;
  const firingRole = (actor.roles as Role[]).find((r) => (t.actors as string[]).includes(r)) ?? actor.roles[0];

  // Live row in the store (visible list may be a scoped copy of the same object).
  const live = reg.rows().find((r) => r.id === id)!;
  live.status = t.to;

  // Machine-specific effects.
  if (machineKey === 'sos-event' && event === 'ACKNOWLEDGE') {
    live.acknowledgedAt = new Date().toISOString();
    live.ackSeconds = (live.ackSeconds as number | null) ?? 42;
    live.responder = displayName(actor.userId, firingRole);
  }
  if (machineKey === 'sos-event' && event === 'RESPOND') {
    live.responder = displayName(actor.userId, firingRole);
  }

  recordHistory(machineKey, id, {
    at: nowISO(),
    event,
    from,
    to: t.to,
    actorId: actor.userId,
    actorName: displayName(actor.userId, firingRole),
    actorRole: firingRole,
  });

  reg.paths.forEach((p) => revalidatePath(p));
  return { ok: true, to: t.to };

  });
}

function readerFor(machineKey: 'booking' | 'sos-event' | 'marketplace-order'): 'bookings' | 'sosEvents' | 'marketplaceOrders' {
  return machineKey === 'booking' ? 'bookings' : machineKey === 'sos-event' ? 'sosEvents' : 'marketplaceOrders';
}

/* --- billing (EM-01 / SC-02) ---------------------------------------------- */

/** Manager issues a draft charge (Draft → Issued). */
export async function issueInvoice(ref: string): Promise<TxResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  try {
    assertCan(actor, 'charges_invoicing', 'transition');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot issue charges.' };
    throw e;
  }
  const inv = repos.invoices.getByRef(actor, ref);
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  const live = db.invoices.find((i) => i.id === inv.id)!;
  const t = fire(serviceChargeMachine, live.status, 'ISSUE', ['estate_manager'], actor.roles as Role[]);
  if (!t) return { ok: false, error: `Cannot issue from “${live.status}”.` };
  live.status = t as typeof live.status;
  recordHistory('service-charge', live.id, hist('ISSUE', inv.status, t, actor.userId, firing(actor.roles as Role[], ['estate_manager'])));
  ['/billing', '/estate', '/dashboard'].forEach((p) => revalidatePath(p));
  return { ok: true, to: t };

  });
}

// Resident payment lives in resident-home.ts (`payChargeFromWallet`): the wallet
// is the single funding source, so charges are paid by funding the unit wallet
// and clearing them from it — there is no direct gateway-to-invoice path.

/* --- creates -------------------------------------------------------------- */

/** Resident raises an SOS (EM-06). Creates a new event in `raised`. */
export async function raiseSos(): Promise<TxResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  try {
    assertCan(actor, 'security_sos', 'create');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot raise an SOS.' };
    throw e;
  }
  const unitId = actor.unitIds[0];
  // Residents cannot read the assets/space catalogue. Resolve only their linked
  // unit under the SOS create scope, including tenant and ownership predicates.
  const unit = unitId ? scopedMutableGet(actor, 'security_sos', db.units.map((row) => ({ ...row, unitId: row.id })), unitId, 'create') : null;
  if (!unit) return { ok: false, error: 'No unit is linked to your account.' };

  const id = `sos-${db.sosEvents.length + 1}-${unitId}`;
  const now = new Date().toISOString();
  db.sosEvents.push({
    tenantId: unit.tenantId,
    id,
    ref: `SOS-${String(1000 + db.sosEvents.length)}`,
    estateId: unit.siteId,
    unitId: unit.id,
    residentName: displayName(actor.userId, 'resident'),
    ownerUserId: actor.userId,
    status: 'raised',
    raisedAt: now,
    acknowledgedAt: null,
    ackSeconds: null,
    responder: null,
    channel: 'in_app',
  } as (typeof db.sosEvents)[number]);
  recordHistory('sos-event', id, {
    at: now,
    event: 'RAISE',
    from: null,
    to: 'raised',
    actorId: actor.userId,
    actorName: displayName(actor.userId, 'resident'),
    actorRole: 'resident',
  });
  ['/portal/security', '/security', '/estate', '/dashboard'].forEach((p) => revalidatePath(p));
  return { ok: true, to: 'raised' };

  });
}

/* --- helpers -------------------------------------------------------------- */

function fire(machine: Machine<string>, from: string, event: string, allowed: Role[], actorRoles: Role[]): string | null {
  const t = machine.transitions.find((x) => x.from === from && x.event === event && x.actors.some((a) => allowed.includes(a as Role) && actorRoles.includes(a as Role)));
  return t ? t.to : null;
}
function firing(actorRoles: Role[], allowed: Role[]): Role {
  return actorRoles.find((r) => allowed.includes(r)) ?? actorRoles[0];
}
function hist(event: string, from: string, to: string, userId: string, role: Role) {
  return { at: nowISO(), event, from, to, actorId: userId, actorName: displayName(userId, role), actorRole: role };
}
