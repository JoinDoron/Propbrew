'use server';

/**
 * Offline-sync endpoint. One entry point applies every kind of field-captured
 * mutation, with three guarantees the PRD asks for by name:
 *
 *  1. IDEMPOTENT — the client's op id is recorded in `db.syncLedger`. Replaying
 *     an id returns the original result instead of applying twice, so a retry
 *     after an ambiguous failure (the classic "did my POST land?" on a bad
 *     link) can never duplicate a report or double-count stock.
 *  2. SERVER-AUTHORITATIVE CONFLICTS — if the record moved on while the phone
 *     was offline (someone already approved that day's report), the write is
 *     REFUSED and the server's version is handed back for a human to reconcile.
 *     Nothing is silently clobbered in either direction.
 *  3. CAPABILITY-CHECKED — being offline never widens permission; the same §7
 *     check runs on arrival as if the user had been online.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, type Actor } from '@/lib/authz';
import { db } from '@/server/data/store';
import { money } from '@/domain/primitives';
import { NOW } from '@/domain/ppm';
import type { OpKind, SyncOutcome } from '@/domain/sync';

const PATHS = ['/construction', '/construction/site', '/construction/field', '/construction/workforce', '/construction/safety', '/construction/procurement', '/construction/schedule', '/construction/risk'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

const nameOf = (actor: Actor): string => db.users.find((u) => u.id === actor.userId)?.name ?? 'Site team';

export type SyncInput = { id: string; kind: OpKind; capturedISO: string; payload: Record<string, unknown> };

/** Apply one offline-captured operation. Safe to call repeatedly with the same id. */
export async function syncOperation(input: SyncInput): Promise<SyncOutcome> {
  const actor = await getActor();
  try {
    assertCan(actor, 'reports_analytics', 'create');
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, id: input.id, conflict: false, error: 'You no longer have permission to submit this.' };
    throw e;
  }

  // (1) Idempotency: already applied → report success without re-applying.
  const prior = db.syncLedger.find((l) => l.opId === input.id);
  if (prior) return { ok: true, id: input.id, duplicate: true, ref: prior.ref };

  const s = (k: string) => String(input.payload[k] ?? '');
  const n = (k: string) => Number(input.payload[k] ?? 0);
  const arr = (k: string) => (Array.isArray(input.payload[k]) ? (input.payload[k] as string[]) : []);

  let ref: string | undefined;

  switch (input.kind) {
    case 'daily_report': {
      const projectId = s('projectId'), dateISO = s('dateISO');
      // (2) Conflict: that day's report already exists and has moved past draft.
      const existing = db.constructionReports.find((r) => r.projectId === projectId && r.dateISO === dateISO);
      if (existing && existing.status !== 'draft') {
        return {
          ok: false, id: input.id, conflict: true,
          error: `A report for ${dateISO} was already submitted on the server and is now “${existing.status}”. Your offline copy was not applied.`,
          serverState: `${existing.status} · by ${existing.officer}`,
        };
      }
      const id = `dr-sync-${input.id.slice(0, 8)}`;
      const row = {
        tenantId: actor.tenantId, id, projectId, dateISO,
        weather: s('weather') || 'Fair', shift: s('shift') || 'day', officer: nameOf(actor),
        workforceCount: n('workforceCount'),
        completed: arr('completed'), ongoing: arr('ongoing'), delayed: arr('delayed'), plannedNext: arr('plannedNext'),
        deliveries: arr('deliveries'), incidents: arr('incidents'), constraints: arr('constraints'),
        photos: n('photos'), status: 'submitted',
      } as unknown as (typeof db.constructionReports)[number];
      if (existing) Object.assign(existing, row, { id: existing.id });
      else db.constructionReports.unshift(row);
      ref = `${dateISO} report`;
      break;
    }
    case 'site_issue': {
      const id = `is-sync-${input.id.slice(0, 8)}`;
      db.constructionIssues.unshift({
        tenantId: actor.tenantId, id, projectId: s('projectId'), category: s('category') || 'Site',
        title: s('title'), severity: (s('severity') || 'medium') as never, owner: nameOf(actor),
        raisedISO: input.capturedISO.slice(0, 10), dueISO: NOW.slice(0, 10), status: 'open',
        correctiveAction: s('correctiveAction') || 'To be agreed',
      } as unknown as (typeof db.constructionIssues)[number]);
      ref = s('title');
      break;
    }
    case 'attendance': {
      const workerId = s('workerId'), dateISO = s('dateISO');
      const existing = db.constructionAttendance.find((a) => a.workerId === workerId && a.dateISO === dateISO);
      if (existing) {
        // Attendance is last-write-wins on the same day — but only if the server
        // copy came from this same capture; otherwise flag it.
        if (existing.method !== 'offline') {
          return {
            ok: false, id: input.id, conflict: true,
            error: `${workerId} was already clocked ${existing.status} for ${dateISO} by a ${existing.method} punch.`,
            serverState: `${existing.status} · ${existing.method}`,
          };
        }
        existing.status = (s('status') || 'present') as never;
      } else {
        db.constructionAttendance.unshift({
          tenantId: actor.tenantId, id: `att-sync-${input.id.slice(0, 8)}`, workerId,
          projectId: s('projectId'), dateISO, status: (s('status') || 'present') as never,
          method: 'offline', withinGeofence: true, clockIn: s('clockIn') || '07:00',
        } as unknown as (typeof db.constructionAttendance)[number]);
      }
      ref = `${workerId} · ${dateISO}`;
      break;
    }
    case 'material_request': {
      const seq = db.constructionRequests.length + 1;
      ref = `PR-${4030 + seq}`;
      db.constructionRequests.unshift({
        tenantId: actor.tenantId, id: `pr-sync-${input.id.slice(0, 8)}`, ref, projectId: s('projectId'),
        item: s('item'), qty: n('qty'), unit: s('unit') || 'unit', costCode: s('costCode') || 'MAR-SUP',
        estimate: money(Math.round(n('estimateNaira') * 100)), requiredISO: s('requiredISO') || NOW.slice(0, 10),
        requestedBy: nameOf(actor), status: 'pending', justification: s('justification') || 'Raised from site',
      } as unknown as (typeof db.constructionRequests)[number]);
      break;
    }
    case 'task_progress': {
      const t = db.constructionTasks.find((x) => x.id === s('taskId'));
      if (!t) return { ok: false, id: input.id, conflict: false, error: 'That task no longer exists on the server.' };
      const pct = Math.max(0, Math.min(100, Math.round(n('percentComplete'))));
      // Conflict: someone already recorded MORE progress than the offline copy.
      if (t.percentComplete > pct) {
        return {
          ok: false, id: input.id, conflict: true,
          error: `“${t.name}” is already at ${t.percentComplete}% on the server — higher than the ${pct}% captured on this device.`,
          serverState: `${t.percentComplete}% complete`,
        };
      }
      t.percentComplete = pct;
      t.status = pct === 0 ? 'not_started' : pct >= 100 ? 'done' : 'in_progress';
      ref = t.name;
      break;
    }
    case 'safety_event': {
      db.constructionSafetyEvents.unshift({
        tenantId: actor.tenantId, id: `se-sync-${input.id.slice(0, 8)}`, projectId: s('projectId'),
        kind: (s('eventKind') || 'near_miss') as never, title: s('title'), zoneId: s('zoneId') || undefined,
        atISO: input.capturedISO.slice(0, 10), reportedBy: nameOf(actor), lostDays: n('lostDays'),
        closed: false, action: s('action') || undefined,
      } as unknown as (typeof db.constructionSafetyEvents)[number]);
      ref = s('title');
      break;
    }
    default:
      return { ok: false, id: input.id, conflict: false, error: `Unknown operation kind “${input.kind}”.` };
  }

  db.syncLedger.push({ opId: input.id, actorId: actor.userId, kind: input.kind, appliedISO: NOW, ref });
  revalidate();
  return { ok: true, id: input.id, duplicate: false, ref };
}

/** Discard a conflicted op: record the id so a later retry can't resurrect it. */
export async function abandonOperation(opId: string, kind: OpKind): Promise<{ ok: true }> {
  const actor = await getActor();
  if (!db.syncLedger.some((l) => l.opId === opId)) {
    db.syncLedger.push({ opId, actorId: actor.userId, kind, appliedISO: NOW, ref: 'abandoned' });
  }
  return { ok: true };
}
