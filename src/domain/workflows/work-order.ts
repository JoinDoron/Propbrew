/**
 * PRD §10 Work order — FM-03. Also the pipeline for EM-03 requests, the FM-02
 * PPM scheduler and FM-06 failed inspection items.
 *
 * §10 draws: New → Triaged → Assigned → In Progress → On Hold → Resolved →
 * Verified → Closed; branches Rejected, Cancelled. That arrow chain is NOT a
 * legal edge set — `in_progress` would only reach `on_hold`, and the branches
 * would have no in-edges. The edges below add the strictly-required inferred
 * moves (RESUME, direct RESOLVE, branch in-edges), each tagged `prd_implied`.
 */

import type { Machine, Transition } from './core';
import type { WorkOrderStatus } from '@/domain/enums';

const T: readonly Transition<WorkOrderStatus>[] = [
  { id: 'WO-01', from: null, to: 'new', event: 'CREATE',
    actors: ['resident', 'facility_manager', 'estate_manager', 'system_scheduler', 'system_rule'],
    guards: ['tenant + estate scope (§8.2)', 'category and description present (EM-03)'],
    effects: ['issue ticket ID visible to requester (EM-03)', 'request AI triage suggestion (AI-F-02 / AI-E-02)', 'start response + resolve SLA clocks', 'SC-10 audit entry'],
    notify: ['requester', 'dispatch_queue'],
    requirementIds: ['FM-03', 'EM-03', 'FM-02', 'FM-06'], provenance: 'prd_implied' },

  { id: 'WO-02', from: 'new', to: 'triaged', event: 'TRIAGE',
    actors: ['facility_manager', 'estate_manager'],
    guards: ['category set', 'priority set', 'assignee candidate chosen'],
    effects: ['AI suggestion accepted or overridden; override logged (§8.1, SC-10)', 'priority fixes the SLA profile'],
    notify: ['requester'], requirementIds: ['FM-03', 'AI-F-02', 'SC-10'], provenance: 'prd_explicit' },

  { id: 'WO-03', from: 'new', to: 'rejected', event: 'REJECT',
    actors: ['facility_manager', 'estate_manager'], guards: ['rejection reason (taxonomy not in PRD)'],
    effects: ['stop all SLA clocks'], notify: ['requester'], requirementIds: ['FM-03'], provenance: 'prd_explicit' },

  { id: 'WO-04', from: 'new', to: 'cancelled', event: 'CANCEL',
    actors: ['resident', 'facility_manager', 'estate_manager'],
    effects: ['stop all SLA clocks'], notify: ['requester'], requirementIds: ['FM-03'], provenance: 'prd_explicit' },

  { id: 'WO-05', from: 'triaged', to: 'assigned', event: 'ASSIGN',
    actors: ['facility_manager', 'estate_manager'],
    guards: ['assignee is an internal Technician OR a Vendor (FM-03)', 'vendor active with non-expired documents (FM-05)'],
    effects: ['push notification to assignee (FM-08)', 'vendor sees job in vendor portal (FM-05)'],
    notify: ['assignee', 'requester'], requirementIds: ['FM-03', 'FM-05', 'FM-08'], provenance: 'prd_explicit' },

  { id: 'WO-06', from: 'triaged', to: 'rejected', event: 'REJECT',
    actors: ['facility_manager', 'estate_manager'], notify: ['requester'], requirementIds: ['FM-03'], provenance: 'prd_explicit' },

  { id: 'WO-07', from: 'triaged', to: 'cancelled', event: 'CANCEL',
    actors: ['resident', 'facility_manager', 'estate_manager'], notify: ['requester'], requirementIds: ['FM-03'], provenance: 'prd_explicit' },

  { id: 'WO-08', from: 'assigned', to: 'assigned', event: 'REASSIGN',
    actors: ['facility_manager', 'estate_manager'], guards: ['new assignee differs from current'],
    effects: ['append to assignment history', 'SLA clocks NOT reset (proposed)'],
    notify: ['assignee', 'previous_assignee', 'requester'], requirementIds: ['FM-03'], provenance: 'prd_explicit',
    note: 'FM-03: "reassignment and every state change tracked and notified".' },

  { id: 'WO-09', from: 'assigned', to: 'in_progress', event: 'START',
    actors: ['technician', 'vendor'], guards: ['actor is the current assignee'],
    effects: ['work-start timestamp (feeds §14 mean time to resolve)', 'offline-capable per §12.1'],
    notify: ['requester'], requirementIds: ['FM-03', 'FM-08'], provenance: 'prd_explicit' },

  { id: 'WO-10', from: 'assigned', to: 'cancelled', event: 'CANCEL',
    actors: ['facility_manager', 'estate_manager'], notify: ['requester', 'assignee'], requirementIds: ['FM-03'], provenance: 'prd_explicit' },

  { id: 'WO-11', from: 'in_progress', to: 'on_hold', event: 'HOLD',
    actors: ['technician', 'vendor', 'facility_manager', 'estate_manager'],
    guards: ['hold reason required (reason taxonomy not in PRD)'],
    effects: ['whether the resolve SLA clock pauses is UNDEFINED in the PRD'],
    notify: ['requester'], requirementIds: ['FM-03'], provenance: 'prd_explicit' },

  { id: 'WO-12', from: 'on_hold', to: 'in_progress', event: 'RESUME',
    actors: ['technician', 'vendor', 'facility_manager', 'estate_manager'],
    notify: ['requester'], requirementIds: ['FM-03'], provenance: 'prd_implied',
    note: 'Without RESUME, On Hold is a trap. Not drawn in §10.' },

  { id: 'WO-13', from: 'in_progress', to: 'resolved', event: 'RESOLVE',
    actors: ['technician', 'vendor'],
    guards: ['photos, notes, parts and costs captured (FM-03)', 'PPM WOs: checklist complete + evidence photo (FM-02)'],
    effects: ['start the 5-day auto-close clock', 'open the verification window', 'costs roll into FM-07'],
    notify: ['requester'], requirementIds: ['FM-03', 'FM-02', 'FM-07'], provenance: 'prd_implied',
    note: 'The §10 chain literally routes in_progress → on_hold → resolved. Direct resolve is required.' },

  { id: 'WO-14', from: 'on_hold', to: 'resolved', event: 'RESOLVE',
    actors: ['technician', 'vendor'], guards: ['as WO-13'], effects: ['as WO-13'],
    notify: ['requester'], requirementIds: ['FM-03', 'FM-02'], provenance: 'prd_explicit' },

  { id: 'WO-15', from: 'in_progress', to: 'cancelled', event: 'CANCEL',
    actors: ['facility_manager', 'estate_manager'], notify: ['requester', 'assignee'], requirementIds: ['FM-03'], provenance: 'prd_explicit' },

  { id: 'WO-16', from: 'on_hold', to: 'cancelled', event: 'CANCEL',
    actors: ['facility_manager', 'estate_manager'], notify: ['requester', 'assignee'], requirementIds: ['FM-03'], provenance: 'prd_explicit' },

  { id: 'WO-17', from: 'resolved', to: 'verified', event: 'VERIFY',
    actors: ['resident', 'facility_manager', 'estate_manager'],
    guards: ['actor is the requester OR a manager (§10 verbatim)'],
    effects: ['cancel the auto-close timer', 'unlock resident rating (EM-03) feeding §14 and FM-05 vendor rating'],
    notify: ['assignee', 'requester'], requirementIds: ['FM-03', 'EM-03', 'FM-05'], provenance: 'prd_explicit' },

  { id: 'WO-18', from: 'resolved', to: 'closed', event: 'AUTO_CLOSE',
    actors: ['system_timer'], guards: ['5 days elapsed in Resolved with no verification'],
    effects: ['mark autoClosed so analytics separate verified from lapsed closures', 'record SLA hit/miss'],
    notify: ['requester', 'assignee'], requirementIds: ['FM-03'], provenance: 'prd_explicit',
    note: '§10: "auto-close after 5 days (proposed)". Configurable per tenant.' },

  { id: 'WO-19', from: 'verified', to: 'closed', event: 'CLOSE',
    actors: ['facility_manager', 'estate_manager', 'system_timer'],
    effects: ['freeze costs', 'record SLA hit/miss (FM-05 SLA hit rate, FM-07 dashboards)'],
    notify: ['requester', 'assignee'], requirementIds: ['FM-03', 'FM-05', 'FM-07'], provenance: 'prd_explicit' },

  { id: 'WO-20', from: 'verified', to: 'in_progress', event: 'REOPEN',
    actors: ['resident', 'facility_manager', 'estate_manager'],
    guards: ['verification rejected within the window'], effects: ['restart resolve SLA (proposed)'],
    notify: ['assignee', 'requester'], requirementIds: ['FM-03'], provenance: 'derived_proposed',
    note: 'NOT IN PRD. Under §10 closed-world this is currently illegal — build-blocking open issue (what happens when verification fails?).' },
];

export const workOrderMachine: Machine<WorkOrderStatus> = {
  key: 'work-order',
  prdSection: '§10 · FM-03',
  prdStatesVerbatim: 'New → Triaged → Assigned → In Progress → On Hold → Resolved → Verified → Closed; branches: Rejected, Cancelled',
  prdRulesVerbatim: 'AI triage suggests category/priority/assignee; human confirms. SLA timers per priority (e.g. Emergency: respond 2h / resolve 24h; Routine: 72h). Resolved → Verified by requester or manager; auto-close after 5 days (proposed).',
  states: ['new', 'triaged', 'assigned', 'in_progress', 'on_hold', 'resolved', 'verified', 'closed', 'rejected', 'cancelled'],
  initial: ['new'],
  branch: ['rejected', 'cancelled'],
  terminal: ['closed', 'rejected', 'cancelled'],
  transitions: T,
  timers: [
    { id: 'WO-SLA-RESPOND-EMERGENCY', activeIn: ['new', 'triaged'], startsOn: 'creation', defaultDuration: 'PT2H',
      onExpiry: { kind: 'escalate', audience: ['facility_manager', 'estate_manager'] },
      configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['FM-03', 'FM-08'], note: '§10: "Emergency: respond 2h".' },
    { id: 'WO-SLA-RESOLVE-EMERGENCY', activeIn: ['new', 'triaged', 'assigned', 'in_progress', 'on_hold'], startsOn: 'creation', defaultDuration: 'PT24H',
      onExpiry: { kind: 'escalate', audience: ['facility_manager', 'estate_manager'] },
      configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['FM-03'], note: '§10: "resolve 24h". Whether On Hold pauses this is UNDEFINED.' },
    { id: 'WO-SLA-RESOLVE-ROUTINE', activeIn: ['new', 'triaged', 'assigned', 'in_progress', 'on_hold'], startsOn: 'creation', defaultDuration: 'PT72H',
      onExpiry: { kind: 'escalate', audience: ['facility_manager', 'estate_manager'] },
      configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['FM-03'], note: '§10: "Routine: 72h". Respond-vs-resolve is not stated.' },
    { id: 'WO-AUTOCLOSE', activeIn: ['resolved'], startsOn: 'entry to Resolved', defaultDuration: 'P5D',
      onExpiry: { kind: 'transition', to: 'closed', actor: 'system_timer' },
      configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['FM-03'] },
  ],
  ai: [
    { featureId: 'AI-F-02', priority: 'Should', attachesTo: ['new', 'triaged'],
      suggests: 'request text/photos/category → suggested category, priority and best-fit assignee/vendor with confidence',
      humanInTheLoop: 'Dispatcher confirms or overrides; overrides logged for tuning.', fallback: 'manual triage queue',
      benchmark: 'Top-1 category accuracy ≥ 85%; assignee acceptance ≥ 70%', mayFireTransition: false },
    { featureId: 'AI-F-05', priority: 'Should', attachesTo: 'workflow',
      suggests: 'NL queries over tenant-scoped data → answers with sources; drafted actions (e.g. raise WO)',
      humanInTheLoop: 'Every drafted action requires explicit user confirmation.', fallback: 'normal navigation and search',
      benchmark: 'Grounded-answer accuracy ≥ 90%', mayFireTransition: false },
  ],
  invariants: [
    'Only listed transitions are legal (§10); unknown (from,event) pairs are denied (SC-01).',
    'Every transition is timestamped and actor-attributed and emits SC-09 (§10).',
    'Requester is notified on EVERY state change (FM-03, EM-03).',
    'Offline-queued transitions carry an idempotency key; conflicts are server-authoritative and surfaced (§12.1).',
    'A transition must be admissible with the AI suggestion absent (§11.4: core flows never block on AI).',
  ],
};
