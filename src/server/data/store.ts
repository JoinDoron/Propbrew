import 'server-only';

/**
 * In-memory mutable store — the write side of the data layer.
 *
 * The seed fixtures are the immutable ground truth; this clones the mutable
 * entities out of them once per server process so transitions have somewhere to
 * land. It is the exact seam a real database slots into: the repos and actions
 * talk to `db` and `woHistory`, never to a fixture directly, so swapping this
 * file for a Prisma/SQL client changes nothing above it.
 *
 * Dev caveat: module state resets on server restart / HMR reload — fine for a
 * demo, and the reset is itself a reminder that this is not persistence.
 */

import * as seed from './seed/fixtures';
import { findTransition, workOrderMachine } from '@/domain/workflows';
import type { WorkOrder } from '@/domain/entities';
import type { WorkOrderStatus } from '@/domain/enums';
import type { Role } from '@/domain/enums';
import type { SystemActor } from '@/domain/workflows';

export type WoHistoryEntry = {
  seq: number;
  at: string; // ISO
  event: string;
  from: WorkOrderStatus | null;
  to: WorkOrderStatus;
  actorId: string;
  actorName: string;
  actorRole: Role | SystemActor;
  note?: string;
};

/** Mutable working set, cloned from the immutable seed. */
export const db = {
  workOrders: seed.workOrders.map((w) => ({ ...w })) as WorkOrder[],
};

/** Per-work-order audit trail (§10: every transition timestamped + attributed). */
export const woHistory = new Map<string, WoHistoryEntry[]>();

/* --- seed a plausible back-history so timelines are not empty --------------- */

// The canonical event prefix that lands a work order in each status. Walked
// through the real machine, so a bad seed path fails loudly rather than lying.
const PATH_TO: Record<WorkOrderStatus, string[]> = {
  new: ['CREATE'],
  triaged: ['CREATE', 'TRIAGE'],
  assigned: ['CREATE', 'TRIAGE', 'ASSIGN'],
  in_progress: ['CREATE', 'TRIAGE', 'ASSIGN', 'START'],
  on_hold: ['CREATE', 'TRIAGE', 'ASSIGN', 'START', 'HOLD'],
  resolved: ['CREATE', 'TRIAGE', 'ASSIGN', 'START', 'RESOLVE'],
  verified: ['CREATE', 'TRIAGE', 'ASSIGN', 'START', 'RESOLVE', 'VERIFY'],
  closed: ['CREATE', 'TRIAGE', 'ASSIGN', 'START', 'RESOLVE', 'VERIFY', 'CLOSE'],
  rejected: ['CREATE', 'REJECT'],
  cancelled: ['CREATE', 'TRIAGE', 'CANCEL'],
};

const SYSTEM_LABEL: Record<string, { name: string; role: Role | SystemActor }> = {
  CREATE: { name: 'System', role: 'system_scheduler' },
  TRIAGE: { name: 'Ngozi Okafor', role: 'estate_manager' },
  ASSIGN: { name: 'Bola Adeyemi', role: 'facility_manager' },
  START: { name: 'Emeka Nwosu', role: 'technician' },
  HOLD: { name: 'Emeka Nwosu', role: 'technician' },
  RESOLVE: { name: 'Emeka Nwosu', role: 'technician' },
  VERIFY: { name: 'Ngozi Okafor', role: 'estate_manager' },
  CLOSE: { name: 'Ngozi Okafor', role: 'estate_manager' },
  REJECT: { name: 'Bola Adeyemi', role: 'facility_manager' },
  CANCEL: { name: 'Ngozi Okafor', role: 'estate_manager' },
};

function seedHistory() {
  for (const wo of db.workOrders) {
    const events = PATH_TO[wo.status] ?? ['CREATE'];
    const entries: WoHistoryEntry[] = [];
    let state: WorkOrderStatus | null = null;
    // stagger timestamps: earliest first, ~6h apart, ending "recently"
    const start = Date.parse('2026-07-24T06:00:00Z');
    events.forEach((event, i) => {
      const t = findTransition(workOrderMachine, state, event);
      const to = (t?.to ?? state ?? 'new') as WorkOrderStatus;
      const who = SYSTEM_LABEL[event] ?? { name: 'System', role: 'system_timer' as SystemActor };
      entries.push({
        seq: i,
        at: new Date(start + i * 6 * 3600 * 1000).toISOString(),
        event,
        from: state,
        to,
        actorId: `seed-${who.role}`,
        actorName: who.name,
        actorRole: who.role,
      });
      state = to;
    });
    woHistory.set(wo.id, entries);
  }
}
seedHistory();

/** Append an entry to a work order's audit trail. */
export function recordWoHistory(woId: string, entry: Omit<WoHistoryEntry, 'seq'>): void {
  const list = woHistory.get(woId) ?? [];
  list.push({ ...entry, seq: list.length });
  woHistory.set(woId, list);
}

export function getWoHistory(woId: string): WoHistoryEntry[] {
  return woHistory.get(woId) ?? [];
}
