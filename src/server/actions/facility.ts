'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

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
import { repos, scopedMutableGet } from '@/server/data';
import { nextWorkOrderRef } from '@/server/data/store';
import { operatingClock, operatingDateISO, operatingNowISO, operatingNowMs } from '@/server/operating-clock';
import { COPILOT_MODELS, type CopilotModelId } from '@/domain/facility';
import { setTenantModel } from '@/server/copilot/metering';
import type { WorkOrder } from '@/domain/entities';
import { nowISO } from '@/server/clock';
import { isFacilityDate } from '@/server/facility-guards';
import { CopilotConnectionError, resolveCopilotProvider } from '@/server/ai/copilot-provider';
import { nativeAuthEnabled } from '@/server/auth/mode';

const PATHS = ['/control-center', '/facility', '/energy', '/inventory', '/contracts', '/safety', '/access', '/sustainability', '/copilot', '/work-orders', '/dashboard'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

async function gate(action: 'create' | 'update' | 'transition'): Promise<{ actor: Awaited<ReturnType<typeof getActor>> } | { ok: false; error: string }> {
  const actor = await getActor();
  if (!actor.tenantId?.trim()) return { ok: false, error: 'An organisation is required for this action.' };
  try { assertCan(actor, 'assets_ppm', action); return { actor }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You need facility-manager access for this.' }; throw e; }
}


/* --- alarms --------------------------------------------------------------- */
export async function acknowledgeAlarm(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const al = scopedMutableGet(g.actor, 'assets_ppm', db.facilityAlarms, id, 'update');
  if (!al) return { ok: false, error: 'Alarm not found.' };
  al.acknowledged = true;
  revalidate();
  return { ok: true };

  }, 'facility');
}

/** Turn an alarm straight into a work order (the delight: one-tap dispatch). */
export async function dispatchWoFromAlarm(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('create'); if ('ok' in g) return g;
  const al = scopedMutableGet(g.actor, 'assets_ppm', db.facilityAlarms, id, 'create');
  if (!al) return { ok: false, error: 'Alarm not found.' };
  if (al.woRef) return { ok: false, error: `Already dispatched as ${al.woRef}.` };

  const woSeq = nextRecordSequence('facility:woSeq', 0, true);
  const ref = nextWorkOrderRef();
  const priority = al.severity === 'critical' ? 'emergency' : al.severity === 'warning' ? 'high' : 'routine';
  const clock = operatingClock();
  const hrs = (n: number) => new Date(clock.nowMs + n * 3600 * 1000).toISOString();
  db.workOrders.unshift({
    tenantId: g.actor.tenantId, createdAt: clock.iso, createdBy: g.actor.userId, updatedAt: clock.iso, updatedBy: g.actor.userId,
    id: `wo-alarm-${woSeq}`, ref, title: `${al.system}: ${al.message}`, siteId: al.siteId, estateId: al.siteId, assetId: al.assetId,
    status: 'new', priority, origin: 'sensor_alarm', requesterUserId: g.actor.userId, requesterName: 'Control Center', assigneeName: 'Unassigned',
    respondDueAt: hrs(priority === 'emergency' ? 1 : 4), resolveDueAt: hrs(priority === 'emergency' ? 8 : 48), cost: null,
  } as unknown as WorkOrder);
  al.acknowledged = true; al.woRef = ref;
  recordHistory('work-order', `wo-alarm-${woSeq}`, { at: nowISO(), event: 'CREATE', from: null, to: 'new', actorId: g.actor.userId, actorName: 'Control Center', actorRole: (g.actor.roles[0] as Role) ?? 'facility_manager', note: `Auto-dispatched from ${al.severity} alarm` });
  revalidate();
  revalidatePath('/estate');
  revalidatePath('/estate/work-orders');
  revalidatePath('/people');
  return { ok: true, ref };

  }, 'facility');
}

/* --- energy --------------------------------------------------------------- */
export async function logRefuel(generatorId: string, litres: number): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const gen = scopedMutableGet(g.actor, 'assets_ppm', db.facilityGenerators, generatorId, 'update');
  if (!gen) return { ok: false, error: 'Generator not found.' };
  if (!Number.isFinite(litres) || !(litres > 0)) return { ok: false, error: 'Enter finite litres greater than zero.' };
  gen.fuelPct = Math.min(100, Math.round(gen.fuelPct + (litres / gen.tankLitres) * 100));
  gen.lastRefuelISO = operatingNowISO();
  revalidate();
  return { ok: true };

  }, 'facility');
}

export async function logMeterReading(meterId: string, reading: number): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const m = scopedMutableGet(g.actor, 'assets_ppm', db.facilityMeters, meterId, 'update');
  if (!m) return { ok: false, error: 'Meter not found.' };
  if (!Number.isFinite(reading) || reading < 0) return { ok: false, error: 'Enter a finite, non-negative meter reading.' };
  if (reading < m.reading) return { ok: false, error: 'Reading cannot be lower than the last one.' };
  m.previous = m.reading; m.reading = reading; m.atISO = operatingNowISO();
  revalidate();
  return { ok: true };

  }, 'facility');
}

/* --- inventory ------------------------------------------------------------ */
export async function receiveStock(partId: string, qty: number): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  if (nativeAuthEnabled()) return { ok: false, error: 'Record a stock movement in Inventory so the delivery has a reference and audit history.' };
  const p = scopedMutableGet(g.actor, 'assets_ppm', db.facilityParts, partId, 'update');
  if (!p) return { ok: false, error: 'Part not found.' };
  if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isSafeInteger(p.stock + qty)) return { ok: false, error: 'Enter a positive whole quantity within the stock limit.' };
  p.stock += qty;
  revalidate();
  return { ok: true };

  }, 'facility');
}

/* --- safety --------------------------------------------------------------- */
export async function advancePermit(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = scopedMutableGet(g.actor, 'assets_ppm', db.facilityPermits, id, 'update');
  if (!p) return { ok: false, error: 'Permit not found.' };
  if (!['requested', 'active'].includes(p.status)) return { ok: false, error: 'This permit is already closed.' };
  p.status = p.status === 'requested' ? 'active' : 'closed';
  revalidate();
  return { ok: true };

  }, 'facility');
}

/* --- access & visitors ---------------------------------------------------- */
const nowIso = () => new Date(operatingNowMs()).toISOString();

function logAccess(tenantId: string | null, siteId: string, pointName: string, kind: 'entry' | 'exit' | 'denied' | 'forced' | 'held', subjectName: string, credential: 'pass' | 'fob' | 'plate' | 'manual', passCode?: string) {
  db.accessEvents.unshift({ tenantId: tenantId ?? 't-lekki', id: `ae-new-${nextRecordSequence('facility:aeSeq', 0, true)}`, siteId, pointName, atISO: nowIso(), kind, subjectName, credential, passCode } as (typeof db.accessEvents)[number]);
}

export type PreRegisterInput = { visitorName: string; kind: 'guest' | 'contractor' | 'delivery' | 'ride_hail'; hostName: string; hostUnit: string; purpose: string; vehiclePlate?: string; validToISO?: string };

/** Pre-register an expected visitor — issues a gate pass code the guard can match. */
export async function preRegisterVisitor(input: PreRegisterInput): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!input.visitorName?.trim()) return { ok: false, error: 'Enter the visitor name.' };
  if (!['guest', 'contractor', 'delivery', 'ride_hail'].includes(input.kind)) return { ok: false, error: 'Choose a valid visitor type.' };
  const today = operatingDateISO();
  const validTo = input.validToISO || today;
  if (!isFacilityDate(validTo) || validTo < today) return { ok: false, error: 'Choose a valid pass expiry date on or after today.' };
  const site = repos.sites.list(g.actor).items[0];
  if (!site) return { ok: false, error: 'No authorised site is available for this visitor pass.' };
  const code = `VP-${4830 + db.visitorPasses.length}`;
  db.visitorPasses.unshift({
    tenantId: site.tenantId, id: `vp-new-${nextRecordSequence('facility:vpSeq', 0, true)}`, code, siteId: site.id,
    visitorName: input.visitorName.trim(), kind: input.kind, hostName: input.hostName.trim() || '—', hostUnit: input.hostUnit.trim() || '—',
    purpose: input.purpose.trim() || 'Visit', vehiclePlate: input.vehiclePlate?.trim() || undefined,
    status: 'expected', validFromISO: today, validToISO: validTo,
  } as (typeof db.visitorPasses)[number]);
  revalidate();
  return { ok: true, ref: code };

  }, 'facility');
}

export async function checkInVisitor(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = scopedMutableGet(g.actor, 'assets_ppm', db.visitorPasses, id, 'update');
  if (!p) return { ok: false, error: 'Pass not found.' };
  if (p.status !== 'expected') return { ok: false, error: 'Only an expected visitor can be checked in.' };
  const clock = operatingClock();
  // Date-only passes cover the Nigerian business day in native accounts.
  // Explicit timestamps keep their own offset; sample records retain UTC dates.
  const boundary = (value: string) => Date.parse(isFacilityDate(value) ? `${value}T00:00:00${clock.native ? '+01:00' : 'Z'}` : value);
  const start = boundary(p.validFromISO), end = boundary(p.validToISO) + (isFacilityDate(p.validToISO) ? 86_400_000 - 1 : 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || clock.nowMs < start || clock.nowMs > end) return { ok: false, error: 'This visitor pass is outside its valid entry window.' };
  p.status = 'checked_in'; p.checkedInISO = nowIso();
  logAccess(g.actor.tenantId, p.siteId, 'Main Gate', 'entry', p.visitorName, 'pass', p.code);
  revalidate();
  return { ok: true, ref: p.code };

  }, 'facility');
}

export async function checkOutVisitor(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = scopedMutableGet(g.actor, 'assets_ppm', db.visitorPasses, id, 'update');
  if (!p) return { ok: false, error: 'Pass not found.' };
  if (p.status !== 'checked_in') return { ok: false, error: 'Only a checked-in visitor can be checked out.' };
  p.status = 'checked_out'; p.checkedOutISO = nowIso();
  logAccess(g.actor.tenantId, p.siteId, 'Main Gate', 'exit', p.visitorName, 'pass', p.code);
  revalidate();
  return { ok: true, ref: p.code };

  }, 'facility');
}

export async function setAccessPointMode(id: string, mode: 'secured' | 'unlocked' | 'lockdown'): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  if (!['secured', 'unlocked', 'lockdown'].includes(mode)) return { ok: false, error: 'Choose a valid access-point mode.' };
  const ap = scopedMutableGet(g.actor, 'assets_ppm', db.accessPoints, id, 'update');
  if (!ap) return { ok: false, error: 'Access point not found.' };
  ap.mode = mode;
  if (mode === 'lockdown') { ap.status = 'online'; logAccess(g.actor.tenantId, ap.siteId, ap.name, 'held', 'Lockdown engaged', 'manual'); }
  revalidate();
  return { ok: true };

  }, 'facility');
}

/** One-tap estate lockdown / release — sets every point at once (the red button). */
export async function setEstateLockdown(on: boolean): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  if (typeof on !== 'boolean') return { ok: false, error: 'Choose whether to engage or release lockdown.' };
  const visible = repos.accessPoints.list(g.actor, { limit: db.accessPoints.length }).items;
  if (!visible.length) return { ok: false, error: 'No authorised access points are available.' };
  for (const ap of visible) { ap.mode = on ? 'lockdown' : 'secured'; if (on && ap.status !== 'offline') ap.status = 'online'; }
  logAccess(g.actor.tenantId, visible[0]?.siteId ?? g.actor.estateIds[0] ?? 's-gardens', 'All points', 'held', on ? 'Estate lockdown engaged' : 'Lockdown released', 'manual');
  revalidate();
  return { ok: true };

  }, 'facility');
}

/* --- copilot config (per-tenant model choice) ----------------------------- */
export async function setCopilotModel(modelId: string): Promise<Res> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  if (!actor.tenantId?.trim()) return { ok: false, error: 'An organisation is required to configure Copilot.' };
  try { assertCan(actor, 'reports_analytics', 'update'); }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You need analytics-config access to change the model.' }; throw e; }
  if (!COPILOT_MODELS.some((m) => m.id === modelId)) return { ok: false, error: 'Unknown model.' };
  // Do not replace a working tenant selection with a provider known to be
  // unavailable. This checks local configuration only; it makes no AI request.
  try { resolveCopilotProvider(modelId); }
  catch (error) {
    if (error instanceof CopilotConnectionError) return { ok: false, error: error.message };
    return { ok: false, error: 'The selected AI provider could not be prepared. The existing model is unchanged.' };
  }
  setTenantModel(actor.tenantId, modelId as CopilotModelId);
  ['/copilot', '/estate/copilot', '/shortlet/copilot', '/construction/copilot'].forEach((path) => revalidatePath(path));
  return { ok: true };

  }, 'facility');
}

/* --- sustainability ------------------------------------------------------- */
export async function setSustainabilityTarget(id: string, targetValue: number): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const t = scopedMutableGet(g.actor, 'assets_ppm', db.sustainabilityTargets, id, 'update');
  if (!t) return { ok: false, error: 'Target not found.' };
  if (!Number.isFinite(targetValue) || targetValue < 0) return { ok: false, error: 'Enter a valid target.' };
  t.targetValue = Math.round(targetValue);
  revalidate();
  return { ok: true };

  }, 'facility');
}
