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
import { pushNotification } from './inbox';
import { findTransition, workOrderMachine, type MachineKey } from '@/domain/workflows';
import { money } from '@/domain/primitives';
import type { Role } from '@/domain/enums';
import type { Resident } from '@/domain/entities';
import type { SystemActor } from '@/domain/workflows';

const clone = <T>(arr: readonly T[]): T[] => arr.map((x) => ({ ...x }));

/** Mutable working set, cloned from the immutable seed. */
export const db = {
  sites: clone(seed.sites),
  buildings: clone(seed.buildings),
  units: clone(seed.units),
  residents: seed.residents.map((resident): Resident => ({
    ...resident,
    email: resident.email ?? seed.users.find((user) => user.id === resident.userId && user.tenantId === resident.tenantId)?.email,
  })),
  /** Demo-only trusted assignments, created atomically with a property receipt. */
  estateCreatorAssignments: [] as {
    tenantId: string; userId: string; siteId: string; source: 'estate_property_registration'; createdAt: string;
  }[],
  estateRegistrationReceipts: [] as {
    tenantId: string; actorId: string; key: string; kind: 'property' | 'tenant';
    payloadHash: string; result: { id: string; name: string }; createdAt: string;
  }[],
  /** Attributed record-creation events; contains no contact details. */
  estateRegistrationAudit: [] as {
    tenantId: string; actorId: string; action: 'property.created' | 'resident.created';
    entityId: string; siteId: string; unitId?: string; at: string;
  }[],
  workOrders: clone(seed.workOrders),
  invoices: clone(seed.invoices),
  bookings: clone(seed.bookings),
  sosEvents: clone(seed.sosEvents),
  marketplaceOrders: clone(seed.marketplaceOrders),
  wallets: clone(seed.wallets),
  ppmPlans: clone(seed.ppmPlans),
  ppmOccurrences: clone(seed.ppmOccurrences),
  assetRuntime: clone(seed.assetRuntime),
  inspections: clone(seed.inspections),
  complianceObligations: clone(seed.complianceObligations),
  documents: clone(seed.documents),
  announcements: clone(seed.announcements),
  listings: clone(seed.listings),
  users: clone(seed.users),
  shortletProperties: clone(seed.shortletProperties),
  shortletApartments: clone(seed.shortletApartments),
  shortletBookings: clone(seed.shortletBookings),
  shortletExpenses: clone(seed.shortletExpenses),
  shortletInspections: clone(seed.shortletInspections),
  shortletTeam: clone(seed.shortletTeam),
  shortletPlanKey: seed.shortletPlanKey as string,
  shortletPricingRules: clone(seed.shortletPricingRules),
  shortletIssues: clone(seed.shortletIssues),
  shortletAgents: clone(seed.shortletAgents),
  shortletReviews: clone(seed.shortletReviews),
  shortletBookingPage: { ...seed.shortletBookingPage, promoCodes: seed.shortletBookingPage.promoCodes.map((p) => ({ ...p })) },
  buildingSystems: clone(seed.buildingSystems),
  facilitySensors: clone(seed.facilitySensors),
  facilityAlarms: clone(seed.facilityAlarms),
  facilityGenerators: clone(seed.facilityGenerators),
  facilityMeters: clone(seed.facilityMeters),
  facilityParts: clone(seed.facilityParts),
  facilityContracts: clone(seed.facilityContracts),
  facilityPermits: clone(seed.facilityPermits),
  facilityIncidents: clone(seed.facilityIncidents),
  accessPoints: clone(seed.accessPoints),
  visitorPasses: clone(seed.visitorPasses),
  accessEvents: clone(seed.accessEvents),
  sustainabilityTargets: clone(seed.sustainabilityTargets),
  emissionMonths: clone(seed.emissionMonths),
  // Copilot per-tenant model choice + a running usage meter (seeded with some
  // prior usage so the meter isn't empty on first view).
  copilotSettings: [{ tenantId: 't-lekki', model: 'gpt-6.1-sol' }] as { tenantId: string; model: string }[],
  copilotUsage: [{ tenantId: 't-lekki', requests: 24, inputTokens: 18000, outputTokens: 5200, costMinorNgn: 21120 }] as { tenantId: string; requests: number; inputTokens: number; outputTokens: number; costMinorNgn: number }[],
  residentFeedback: clone(seed.residentFeedback),
  engagementSnapshot: clone(seed.engagementSnapshot),
  complaints: clone(seed.complaints),
  collectionCases: clone(seed.collectionCases),
  tenancies: clone(seed.tenancies),
  lockers: clone(seed.lockers),
  parcels: clone(seed.parcels),
  motions: clone(seed.motions),
  communityEvents: clone(seed.communityEvents),
  rewardMembers: clone(seed.rewardMembers),
  perks: clone(seed.perks),
  boardMembers: clone(seed.boardMembers),
  meetings: clone(seed.meetings),
  // Deep-clone: candidate vote counts mutate, so the nested array must not alias the seed.
  boardElections: seed.boardElections.map((e) => ({ ...e, candidates: e.candidates.map((c) => ({ ...c })) })),
  proxyAssignments: clone(seed.proxyAssignments),
  // One-vote-per-resident ledgers for portal e-voting (userId keyed).
  residentVotes: [] as { motionId: string; userId: string; choice: string }[],
  electionVotes: [] as { electionId: string; userId: string; candidateId: string }[],
  // Notices to residents whose proxy was returned (e.g. a mid-chain link revoked).
  proxyReturnNotices: [] as { id: string; userId: string; motionId: string; motionRef: string; motionTitle: string; reason: string; atISO: string; seen: boolean }[],

  /* --- Construction (ConstructionOS delivery module) --------------------- */
  constructionProjects: clone(seed.constructionProjects),
  constructionPhases: clone(seed.constructionPhases),
  constructionTasks: seed.constructionTasks.map((t) => ({ ...t, dependsOn: [...t.dependsOn] })),
  constructionMilestones: clone(seed.constructionMilestones),
  constructionIssues: clone(seed.constructionIssues),
  // Reports hold several string[] fields — deep-clone so composing never aliases the seed.
  constructionReports: seed.constructionReports.map((r) => ({ ...r, completed: [...r.completed], ongoing: [...r.ongoing], delayed: [...r.delayed], plannedNext: [...r.plannedNext], deliveries: [...r.deliveries], incidents: [...r.incidents], constraints: [...r.constraints] })),
  constructionVendors: clone(seed.constructionVendors),
  constructionRequests: clone(seed.constructionRequests),
  // RFQ.quotes[] is nested — deep-clone (awarding mutates the RFQ, quotes stay intact).
  constructionRfqs: seed.constructionRfqs.map((r) => ({ ...r, quotes: r.quotes.map((q) => ({ ...q })) })),
  constructionOrders: clone(seed.constructionOrders),
  constructionMaterials: clone(seed.constructionMaterials),
  constructionWarehouses: clone(seed.constructionWarehouses),
  constructionStock: clone(seed.constructionStock),
  constructionMovements: clone(seed.constructionMovements),
  constructionCostCodes: clone(seed.constructionCostCodes),
  constructionVariations: clone(seed.constructionVariations),
  constructionWorkers: clone(seed.constructionWorkers),
  constructionAttendance: clone(seed.constructionAttendance),
  constructionDocs: clone(seed.constructionDocs),
  constructionRfis: clone(seed.constructionRfis),
  constructionZones: seed.constructionZones.map((z) => ({ ...z, layers: { ...z.layers } })),
  constructionSubcontractors: seed.constructionSubcontractors.map((x) => ({ ...x, projectIds: [...x.projectIds] })),
  constructionSafetyPermits: seed.constructionSafetyPermits.map((x) => ({ ...x, controls: [...x.controls] })),
  constructionSafetyEvents: clone(seed.constructionSafetyEvents),
  constructionToolboxTalks: clone(seed.constructionToolboxTalks),
  constructionTimesheets: clone(seed.constructionTimesheets),
  constructionTransmittals: clone(seed.constructionTransmittals),
  constructionReasonCodes: clone(seed.constructionReasonCodes),
  constructionReasonEvents: clone(seed.constructionReasonEvents),
  constructionApprovalRules: seed.constructionApprovalRules.map((r) => ({ ...r, steps: r.steps.map((x) => ({ ...x })) })),
  constructionApprovals: seed.constructionApprovals.map((a) => ({ ...a, steps: a.steps.map((x) => ({ ...x })) })),
  /** Append-only. Nothing in the app ever edits or deletes an audit entry. */
  constructionAudit: clone(seed.constructionAudit),
  constructionFxRates: clone(seed.constructionFxRates),
  /** Physical stock counts awaiting reconciliation. */
  constructionStockCounts: [] as { tenantId: string; id: string; ref: string; warehouseId: string; materialId: string; systemQty: number; countedQty: number; countedBy: string; countedISO: string; status: 'open' | 'reconciled'; reasonCodeId?: string; note?: string; approvedBy?: string }[],
  // Advisory risk-signal lifecycle (ack/snooze/escalate/dismiss), keyed by deterministic signal id.
  constructionSignalStates: [] as { tenantId: string; signalId: string; state: 'ack' | 'snoozed' | 'escalated' | 'dismissed'; atISO: string; escalatedIssueId?: string }[],
  /** Idempotency ledger for offline-captured mutations. The client's op id is
   *  the key: replaying it returns the ORIGINAL result instead of applying
   *  twice, which is what makes a retry after an ambiguous failure safe. */
  syncLedger: [] as { tenantId: string; opId: string; actorId: string; kind: string; payloadHash: string; status: 'pending' | 'applied' | 'abandoned'; appliedISO: string; ref?: string }[],
  // Copilot threads for the construction assistant (per-actor).
  constructionCopilotUsage: [{ tenantId: 't-lekki', requests: 11, inputTokens: 9200, outputTokens: 3100, costMinorNgn: 9840 }] as { tenantId: string; requests: number; inputTokens: number; outputTokens: number; costMinorNgn: number }[],
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

/** Notify a resident their proxy was returned — writes the portal-hub banner
 *  ledger AND mirrors it into the global 🔔 bell (SC-09). */
let prnSeq = 0;
export function recordProxyReturnNotice(userId: string, m: { id: string; ref: string; title: string } | undefined, reason: string): void {
  db.proxyReturnNotices.unshift({ id: `prn-${++prnSeq}`, userId, motionId: m?.id ?? '', motionRef: m?.ref ?? '', motionTitle: m?.title ?? '', reason, atISO: '2026-07-26T09:00:00Z', seen: false });
  pushNotification(userId, ['resident'], {
    title: 'Proxy returned',
    body: `${reason} Your vote${m ? ` on ${m.ref}` : ''} is yours again.`,
    kind: 'warn',
    href: '/portal/community',
  });
}

/* --- wallet auto-deduct (resident-home PRD, open question #1) -------------- */

const UNPAID_INV = ['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated'];

/**
 * Draw a unit's wallet balance down against its pending charges — most-overdue
 * first, then earliest due. Each cleared portion is a real §10 PAYMENT_CONFIRMED
 * transition, attributed to the wallet auto-deduct rule (SC-02), so the billing
 * ledger and the audit trail stay truthful. Called once at init and after every
 * top-up, which keeps the invariant "available and pending are never both
 * positive on the same unit" holding everywhere.
 */
export function settleUnitFromWallet(unitId: string, at = new Date().toISOString()): void {
  const wallet = db.wallets.find((w) => w.unitId === unitId);
  if (!wallet || wallet.available.minor <= 0) return;

  const invoices = db.invoices
    .filter((i) => i.unitId === unitId && UNPAID_INV.includes(i.status))
    .sort((a, b) => b.agingDays - a.agingDays || (a.dueDate < b.dueDate ? -1 : 1));

  let funds = wallet.available.minor;
  for (const inv of invoices) {
    if (funds <= 0) break;
    const owed = inv.amount.minor - inv.paid.minor;
    if (owed <= 0) continue;
    const pay = Math.min(funds, owed);
    const from = inv.status;
    inv.paid = money(inv.paid.minor + pay, inv.amount.currency);
    funds -= pay;
    const full = inv.paid.minor >= inv.amount.minor;
    inv.status = full ? 'paid' : 'partially_paid';
    if (full) inv.agingDays = Math.min(inv.agingDays, 0);
    recordHistory('service-charge', inv.id, {
      at,
      event: 'PAYMENT_CONFIRMED',
      from,
      to: inv.status,
      actorId: 'wallet',
      actorName: 'Wallet auto-deduct (SC-02)',
      actorRole: 'system_webhook',
    });
  }
  wallet.available = money(funds, wallet.available.currency);
}

function settleAllUnits() {
  const unitIds = Array.from(new Set(db.wallets.map((w) => w.unitId)));
  for (const u of unitIds) settleUnitFromWallet(u, '2026-07-25T20:00:00Z');
}
settleAllUnits();

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


/**
 * Allocate the next work-order reference.
 *
 * Two creation sites previously minted refs from separate bases
 * (`WO-${24810 + n}` and `WO-${24850 + n}`), so the series collided after 40
 * rows — and `repos.workOrders.getByRef` routes on ref, so a collision resolves
 * the wrong record. One allocator, seeded above the highest existing ref.
 */
export function nextWorkOrderRef(): string {
  const highest = db.workOrders.reduce((max, w) => {
    const n = Number.parseInt(String(w.ref).replace(/^WO-/, ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 24800);
  return `WO-${highest + 1}`;
}
