import 'server-only';

/**
 * The construction "world" — every capability-scoped collection the engine's
 * cross-entity scans (risk radar, digest, money-trail) need, loaded once. Each
 * repo re-checks `reports_analytics`, so this never widens access: an actor only
 * ever sees the rows their §7 scope admits.
 */

import { repos } from '@/server/data';
import { db } from '@/server/data/store';
import type { Actor } from '@/lib/authz';
import type { ConWorld } from '@/domain/construction';

export function constructionWorld(actor: Actor): ConWorld {
  return {
    projects: repos.constructionProjects.list(actor).items,
    phases: repos.constructionPhases.list(actor).items,
    tasks: repos.constructionTasks.list(actor).items,
    costCodes: repos.constructionCostCodes.list(actor).items,
    pos: repos.constructionOrders.list(actor).items,
    requests: repos.constructionRequests.list(actor).items,
    reports: repos.constructionReports.list(actor).items,
    materials: repos.constructionMaterials.list(actor).items,
    warehouses: repos.constructionWarehouses.list(actor).items,
    stock: repos.constructionStock.list(actor).items,
    movements: repos.constructionMovements.list(actor).items,
    docs: repos.constructionDocs.list(actor).items,
    rfis: repos.constructionRfis.list(actor).items,
    workers: repos.constructionWorkers.list(actor).items,
    issues: repos.constructionIssues.list(actor).items,
    milestones: repos.constructionMilestones.list(actor).items,
    attendance: repos.constructionAttendance.list(actor).items,
    zones: repos.constructionZones.list(actor).items,
    timesheets: repos.constructionTimesheets.list(actor).items,
    reasonCodes: repos.constructionReasonCodes.list(actor).items,
    reasonEvents: repos.constructionReasonEvents.list(actor).items,
    approvalRules: repos.constructionApprovalRules.list(actor).items,
    approvals: repos.constructionApprovals.list(actor).items,
    audit: repos.constructionAudit.list(actor).items,
    fxRates: repos.constructionFxRates.list(actor).items,
    transmittals: repos.constructionTransmittals.list(actor).items,
    subcontractors: repos.constructionSubcontractors.list(actor).items,
    safetyEvents: repos.constructionSafetyEvents.list(actor).items,
    safetyPermits: repos.constructionSafetyPermits.list(actor).items,
    toolboxTalks: repos.constructionToolboxTalks.list(actor).items,
  };
}

/** The acting user's display name. Segregation-of-duties and delegation both
 *  compare against it, so it must come from the same place everywhere. */
export function actorName(actor: Actor): string {
  return db.users.find((u) => u.id === actor.userId)?.name ?? 'Unknown';
}

/** Advisory risk-signal lifecycle states, keyed by the deterministic signal id. */
export function signalStates(actor: Actor): Map<string, string> {
  return new Map(db.constructionSignalStates.filter((s) => s.tenantId === actor.tenantId).map((s) => [s.signalId, s.state]));
}

/** Escalation receipts survive later acknowledgement, snoozing or dismissal. */
export function signalEscalations(actor: Actor): Map<string, string> {
  const issues = new Set(repos.constructionIssues.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.map((issue) => issue.id));
  return new Map(db.constructionSignalStates.filter((s) => s.tenantId === actor.tenantId && s.escalatedIssueId && issues.has(s.escalatedIssueId)).map((s) => [s.signalId, s.escalatedIssueId!]));
}
