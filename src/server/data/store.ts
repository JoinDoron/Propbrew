import 'server-only';

/**
 * In-memory mutable store — the write side of the data layer.
 *
 * The seed fixtures are the immutable ground truth; this clones the mutable
 * entities out of them once per server process so transitions have somewhere to
 * land. It is the exact seam a real database slots into: the repos and actions
 * talk to `db` and the history map, never to a fixture directly, so swapping
 * this file for a Prisma/SQL client changes nothing above it.
 *
 * Dev caveat: module state resets on server restart / HMR reload — fine for a
 * demo, and the reset is itself a reminder that this is not persistence.
 */

import * as seed from './seed/fixtures';
import { findTransition, workOrderMachine, type MachineKey } from '@/domain/workflows';
import type { Role } from '@/domain/enums';
import type { SystemActor } from '@/domain/workflows';

const clone = <T>(arr: readonly T[]): T[] => arr.map((x) => ({ ...x }));

/** Mutable working set, cloned from the immutable seed. */
export const db = {
  workOrders: clone(seed.workOrders),
  invoices: clone(seed.invoices),
  bookings: clone(seed.bookings),
  sosEvents: clone(seed.sosEvents),
  marketplaceOrders: clone(seed.marketplaceOrders),
};

export type HistoryEntry = {
  seq: number;
  at: string; // ISO
  event: string;
  from: string | null;
  to: string;
  actorId: string;
  actorName: string;
  actorRole: Role | SystemActor;
  note?: string;
};

/** Audit trail keyed by `${machineKey}:${rowId}` (§10: every transition
 *  timestamped + attributed). One map serves all five machines. */
const history = new Map<string, HistoryEntry[]>();

const key = (machine: MachineKey, id: string) => `${machine}:${id}`;

export function recordHistory(machine: MachineKey, id: string, entry: Omit<HistoryEntry, 'seq'>): void {
  const list = history.get(key(machine, id)) ?? [];
  list.push({ ...entry, seq: list.length });
  history.set(key(machine, id), list);
}

export function getHistory(machine: MachineKey, id: string): HistoryEntry[] {
  return history.get(key(machine, id)) ?? [];
}

/** Flatten the entire audit trail across every machine — the SC-10 admin view.
 *  Platform-Admin-only in practice (the page gates it). */
export function getAllHistory(): (HistoryEntry & { machine: string; recordId: string })[] {
  const out: (HistoryEntry & { machine: string; recordId: string })[] = [];
  for (const [k, entries] of history) {
    const [machine, recordId] = k.split(/:(.+)/);
    for (const e of entries) out.push({ ...e, machine, recordId });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first
}

/* --- seed a plausible back-history for work orders ------------------------- */

const PATH_TO: Record<string, string[]> = {
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

const SEED_ACTOR: Record<string, { name: string; role: Role | SystemActor }> = {
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

function seedWorkOrderHistory() {
  const start = Date.parse('2026-07-24T06:00:00Z');
  for (const wo of db.workOrders) {
    const events = PATH_TO[wo.status] ?? ['CREATE'];
    let state: string | null = null;
    events.forEach((event, i) => {
      const t = findTransition(workOrderMachine, state as never, event);
      const to = (t?.to ?? state ?? 'new') as string;
      const who = SEED_ACTOR[event] ?? { name: 'System', role: 'system_timer' as SystemActor };
      recordHistory('work-order', wo.id, {
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
  }
}
seedWorkOrderHistory();
