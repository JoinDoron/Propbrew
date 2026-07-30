'use server';

/**
 * Facility Intelligence actions (gated by the §7 assets_ppm capability — the
 * facility manager holds M). Acknowledge/dispatch alarms (a dispatch raises a
 * real work order), log a refuel or meter reading, receive a part reorder, and
 * advance a permit. Estate managers/technicians hold V (view) → mutations are
 * correctly denied for them.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, type Role } from '@/lib/authz';
import { db, recordHistory } from '@/server/data/store';
import { NOW, NOW_MS } from '@/domain/ppm';
import type { WorkOrder } from '@/domain/entities';

const PATHS = ['/control-center', '/energy', '/inventory', '/contracts', '/safety', '/work-orders', '/dashboard'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

async function gate(action: 'create' | 'update' | 'transition'): Promise<{ actor: Awaited<ReturnType<typeof getActor>> } | { ok: false; error: string }> {
  const actor = await getActor();
  try { assertCan(actor, 'assets_ppm', action); return { actor }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You need facility-manager access for this.' }; throw e; }
}

let woSeq = 0;

/* --- alarms --------------------------------------------------------------- */
export async function acknowledgeAlarm(id: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const al = db.facilityAlarms.find((a) => a.id === id);
  if (!al) return { ok: false, error: 'Alarm not found.' };
  al.acknowledged = true;
  revalidate();
  return { ok: true };
}

/** Turn an alarm straight into a work order (the delight: one-tap dispatch). */
export async function dispatchWoFromAlarm(id: string): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  const al = db.facilityAlarms.find((a) => a.id === id);
  if (!al) return { ok: false, error: 'Alarm not found.' };
  if (al.woRef) return { ok: false, error: `Already dispatched as ${al.woRef}.` };

  const ref = `WO-${24850 + db.workOrders.length}`;
  const priority = al.severity === 'critical' ? 'emergency' : al.severity === 'warning' ? 'high' : 'routine';
  const hrs = (n: number) => new Date(NOW_MS + n * 3600 * 1000).toISOString();
  db.workOrders.unshift({
    tenantId: g.actor.tenantId, createdAt: NOW, createdBy: g.actor.userId, updatedAt: NOW, updatedBy: g.actor.userId,
    id: `wo-alarm-${++woSeq}`, ref, title: `${al.system}: ${al.message}`, siteId: al.siteId, estateId: al.siteId, assetId: al.assetId,
    status: 'new', priority, origin: 'sensor_alarm', requesterUserId: g.actor.userId, requesterName: 'Control Center', assigneeName: 'Unassigned',
    respondDueAt: hrs(priority === 'emergency' ? 1 : 4), resolveDueAt: hrs(priority === 'emergency' ? 8 : 48), cost: null,
  } as unknown as WorkOrder);
  al.acknowledged = true; al.woRef = ref;
  recordHistory('work-order', `wo-alarm-${woSeq}`, { at: NOW, event: 'CREATE', from: null, to: 'new', actorId: g.actor.userId, actorName: 'Control Center', actorRole: (g.actor.roles[0] as Role) ?? 'facility_manager', note: `Auto-dispatched from ${al.severity} alarm` });
  revalidate();
  return { ok: true, ref };
}

/* --- energy --------------------------------------------------------------- */
export async function logRefuel(generatorId: string, litres: number): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const gen = db.facilityGenerators.find((x) => x.id === generatorId);
  if (!gen) return { ok: false, error: 'Generator not found.' };
  if (!(litres > 0)) return { ok: false, error: 'Enter litres greater than zero.' };
  gen.fuelPct = Math.min(100, Math.round(gen.fuelPct + (litres / gen.tankLitres) * 100));
  gen.lastRefuelISO = NOW;
  revalidate();
  return { ok: true };
}

export async function logMeterReading(meterId: string, reading: number): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const m = db.facilityMeters.find((x) => x.id === meterId);
  if (!m) return { ok: false, error: 'Meter not found.' };
  if (reading < m.reading) return { ok: false, error: 'Reading cannot be lower than the last one.' };
  m.previous = m.reading; m.reading = reading; m.atISO = NOW;
  revalidate();
  return { ok: true };
}

/* --- inventory ------------------------------------------------------------ */
export async function receiveStock(partId: string, qty: number): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = db.facilityParts.find((x) => x.id === partId);
  if (!p) return { ok: false, error: 'Part not found.' };
  if (!(qty > 0)) return { ok: false, error: 'Enter a quantity greater than zero.' };
  p.stock += Math.round(qty);
  revalidate();
  return { ok: true };
}

/* --- safety --------------------------------------------------------------- */
export async function advancePermit(id: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = db.facilityPermits.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'Permit not found.' };
  p.status = p.status === 'requested' ? 'active' : p.status === 'active' ? 'closed' : 'closed';
  revalidate();
  return { ok: true };
}
