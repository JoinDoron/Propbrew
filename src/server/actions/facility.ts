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
import { nextWorkOrderRef } from '@/server/data/store';
import { NOW, NOW_MS } from '@/domain/ppm';
import { COPILOT_MODELS, type CopilotModelId } from '@/domain/facility';
import { setTenantModel, recordUsage, getTenantModel } from '@/server/copilot/metering';
import type { WorkOrder } from '@/domain/entities';
import { nowISO } from '@/server/clock';

const PATHS = ['/control-center', '/energy', '/inventory', '/contracts', '/safety', '/access', '/sustainability', '/copilot', '/work-orders', '/dashboard'];
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

  const ref = nextWorkOrderRef();
  const priority = al.severity === 'critical' ? 'emergency' : al.severity === 'warning' ? 'high' : 'routine';
  const hrs = (n: number) => new Date(NOW_MS + n * 3600 * 1000).toISOString();
  db.workOrders.unshift({
    tenantId: g.actor.tenantId, createdAt: NOW, createdBy: g.actor.userId, updatedAt: NOW, updatedBy: g.actor.userId,
    id: `wo-alarm-${++woSeq}`, ref, title: `${al.system}: ${al.message}`, siteId: al.siteId, estateId: al.siteId, assetId: al.assetId,
    status: 'new', priority, origin: 'sensor_alarm', requesterUserId: g.actor.userId, requesterName: 'Control Center', assigneeName: 'Unassigned',
    respondDueAt: hrs(priority === 'emergency' ? 1 : 4), resolveDueAt: hrs(priority === 'emergency' ? 8 : 48), cost: null,
  } as unknown as WorkOrder);
  al.acknowledged = true; al.woRef = ref;
  recordHistory('work-order', `wo-alarm-${woSeq}`, { at: nowISO(), event: 'CREATE', from: null, to: 'new', actorId: g.actor.userId, actorName: 'Control Center', actorRole: (g.actor.roles[0] as Role) ?? 'facility_manager', note: `Auto-dispatched from ${al.severity} alarm` });
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

/* --- access & visitors ---------------------------------------------------- */
let vpSeq = 0, aeSeq = 0;
const nowIso = () => new Date(NOW_MS).toISOString();

function logAccess(siteId: string, pointName: string, kind: 'entry' | 'exit' | 'denied' | 'forced' | 'held', subjectName: string, credential: 'pass' | 'fob' | 'plate' | 'manual', passCode?: string) {
  db.accessEvents.unshift({ tenantId: db.visitorPasses[0]?.tenantId ?? 't-lekki', id: `ae-new-${++aeSeq}`, siteId, pointName, atISO: nowIso(), kind, subjectName, credential, passCode } as (typeof db.accessEvents)[number]);
}

export type PreRegisterInput = { visitorName: string; kind: 'guest' | 'contractor' | 'delivery' | 'ride_hail'; hostName: string; hostUnit: string; purpose: string; vehiclePlate?: string; validToISO?: string };

/** Pre-register an expected visitor — issues a gate pass code the guard can match. */
export async function preRegisterVisitor(input: PreRegisterInput): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!input.visitorName?.trim()) return { ok: false, error: 'Enter the visitor name.' };
  const code = `VP-${4830 + db.visitorPasses.length}`;
  const today = nowIso().slice(0, 10);
  db.visitorPasses.unshift({
    tenantId: g.actor.tenantId ?? 't-lekki', id: `vp-new-${++vpSeq}`, code, siteId: (g.actor.estateIds[0] as string) ?? 's-gardens',
    visitorName: input.visitorName.trim(), kind: input.kind, hostName: input.hostName.trim() || '—', hostUnit: input.hostUnit.trim() || '—',
    purpose: input.purpose.trim() || 'Visit', vehiclePlate: input.vehiclePlate?.trim() || undefined,
    status: 'expected', validFromISO: today, validToISO: input.validToISO || today,
  } as (typeof db.visitorPasses)[number]);
  revalidate();
  return { ok: true, ref: code };
}

export async function checkInVisitor(id: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = db.visitorPasses.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'Pass not found.' };
  if (p.status === 'checked_out') return { ok: false, error: 'This pass is already closed.' };
  p.status = 'checked_in'; p.checkedInISO = nowIso();
  logAccess(p.siteId, 'Main Gate', 'entry', p.visitorName, 'pass', p.code);
  revalidate();
  return { ok: true, ref: p.code };
}

export async function checkOutVisitor(id: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = db.visitorPasses.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'Pass not found.' };
  if (p.status !== 'checked_in') return { ok: false, error: 'Only a checked-in visitor can be checked out.' };
  p.status = 'checked_out'; p.checkedOutISO = nowIso();
  logAccess(p.siteId, 'Main Gate', 'exit', p.visitorName, 'pass', p.code);
  revalidate();
  return { ok: true, ref: p.code };
}

export async function setAccessPointMode(id: string, mode: 'secured' | 'unlocked' | 'lockdown'): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const ap = db.accessPoints.find((x) => x.id === id);
  if (!ap) return { ok: false, error: 'Access point not found.' };
  ap.mode = mode;
  if (mode === 'lockdown') { ap.status = 'online'; logAccess(ap.siteId, ap.name, 'held', 'Lockdown engaged', 'manual'); }
  revalidate();
  return { ok: true };
}

/** One-tap estate lockdown / release — sets every point at once (the red button). */
export async function setEstateLockdown(on: boolean): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  for (const ap of db.accessPoints) { ap.mode = on ? 'lockdown' : 'secured'; if (on && ap.status !== 'offline') ap.status = 'online'; }
  logAccess(db.accessPoints[0]?.siteId ?? 's-gardens', 'All points', 'held', on ? 'Estate lockdown engaged' : 'Lockdown released', 'manual');
  revalidate();
  return { ok: true };
}

/* --- copilot config (per-tenant model choice) ----------------------------- */
export async function setCopilotModel(modelId: string): Promise<Res> {
  const actor = await getActor();
  try { assertCan(actor, 'reports_analytics', 'update'); }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You need analytics-config access to change the model.' }; throw e; }
  if (!COPILOT_MODELS.some((m) => m.id === modelId)) return { ok: false, error: 'Unknown model.' };
  setTenantModel(actor.tenantId ?? 't-lekki', modelId as CopilotModelId);
  revalidatePath('/copilot');
  return { ok: true };
}

/** Record one copilot call's tokens against the tenant meter. Called by the
 *  client after the stream completes — server actions share the store with the
 *  page, so the meter updates on refresh (the /api route's singleton does not). */
export async function recordCopilotUsage(inputTokens: number, outputTokens: number): Promise<Res> {
  const actor = await getActor();
  try { assertCan(actor, 'assets_ppm', 'read'); }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'Not authorised.' }; throw e; }
  const tid = actor.tenantId ?? 't-lekki';
  recordUsage(tid, Math.max(0, Math.round(inputTokens || 0)), Math.max(0, Math.round(outputTokens || 0)), getTenantModel(tid));
  revalidatePath('/copilot');
  return { ok: true };
}

/* --- sustainability ------------------------------------------------------- */
export async function setSustainabilityTarget(id: string, targetValue: number): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const t = db.sustainabilityTargets.find((x) => x.id === id);
  if (!t) return { ok: false, error: 'Target not found.' };
  if (!Number.isFinite(targetValue) || targetValue < 0) return { ok: false, error: 'Enter a valid target.' };
  t.targetValue = Math.round(targetValue);
  revalidate();
  return { ok: true };
}
