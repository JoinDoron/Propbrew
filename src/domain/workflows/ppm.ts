/**
 * PPM occurrence lifecycle (FM-02 / AI-F-01). Not one of the five §10 machines —
 * a minimal internal machine so PPM transitions get the same audited, graph-
 * checked treatment as everything else, and `recordHistory('ppm', …)` type-checks.
 */

import type { Machine, Transition } from './core';
import type { PpmOccurrenceStatus } from '@/domain/ppm';

const T: readonly Transition<PpmOccurrenceStatus>[] = [
  { id: 'PPM-01', from: null, to: 'scheduled', event: 'CREATE',
    actors: ['facility_manager', 'system_scheduler'],
    effects: ['project the plan forward into a dated occurrence'],
    requirementIds: ['FM-02'], provenance: 'prd_implied' },

  { id: 'PPM-02', from: 'ai_draft', to: 'scheduled', event: 'PROMOTE',
    actors: ['facility_manager'],
    guards: ['AI confidence ≥ 0.6 (not shadow mode)'],
    effects: ['approve the AI-F-01 suggestion into the live schedule; pull nextDue forward'],
    requirementIds: ['AI-F-01'], provenance: 'prd_implied',
    note: 'Approve of an AI pull-forward — HITL. The FM decides; the AI only proposed.' },

  { id: 'PPM-03', from: 'scheduled', to: 'scheduled', event: 'RESCHEDULE',
    actors: ['facility_manager'],
    guards: ['statutory plans cannot move past their legal deadline'],
    requirementIds: ['FM-02'], provenance: 'prd_implied' },

  { id: 'PPM-04', from: 'scheduled', to: 'overdue', event: 'LAPSE',
    actors: ['system_timer'], guards: ['due date passed with no work order'],
    requirementIds: ['FM-02'], provenance: 'prd_implied' },

  { id: 'PPM-05', from: 'overdue', to: 'scheduled', event: 'RESCHEDULE',
    actors: ['facility_manager'], requirementIds: ['FM-02'], provenance: 'prd_implied' },

  { id: 'PPM-06', from: 'scheduled', to: 'wo_generated', event: 'GENERATE',
    actors: ['facility_manager'],
    effects: ['spawn a work order (origin ppm_schedule) at lead time'],
    requirementIds: ['FM-02', 'FM-03'], provenance: 'prd_explicit' },

  { id: 'PPM-07', from: 'overdue', to: 'wo_generated', event: 'GENERATE',
    actors: ['facility_manager'], effects: ['spawn the overdue work order now'],
    requirementIds: ['FM-02', 'FM-03'], provenance: 'prd_explicit' },

  { id: 'PPM-08', from: 'wo_generated', to: 'in_progress', event: 'START',
    actors: ['facility_manager', 'technician'], requirementIds: ['FM-02'], provenance: 'prd_implied' },

  { id: 'PPM-09', from: 'in_progress', to: 'completed', event: 'COMPLETE',
    actors: ['facility_manager', 'technician'],
    guards: ['every checklist item ticked', 'evidence photo attached when evidenceRequired (FM-02)'],
    effects: ['stamp lastServicedAt; reset runtime/calendar stress'],
    requirementIds: ['FM-02'], provenance: 'prd_explicit' },

  { id: 'PPM-10', from: 'wo_generated', to: 'completed', event: 'COMPLETE',
    actors: ['facility_manager'],
    guards: ['checklist + evidence per FM-02'],
    requirementIds: ['FM-02'], provenance: 'prd_implied' },
];

export const ppmMachine: Machine<PpmOccurrenceStatus> = {
  key: 'ppm',
  prdSection: 'FM-02 · AI-F-01',
  prdStatesVerbatim: 'Scheduled → WO generated → In progress → Completed; branches: Overdue, AI draft',
  prdRulesVerbatim: 'Scheduler auto-generates work orders ahead of the due date; completion requires checklist + evidence photo (configurable). AI suggests pull-forward dates the FM approves.',
  states: ['scheduled', 'ai_draft', 'wo_generated', 'in_progress', 'completed', 'overdue'],
  initial: ['scheduled', 'ai_draft'],
  branch: ['overdue', 'ai_draft'],
  terminal: ['completed'],
  transitions: T,
  timers: [
    { id: 'PPM-LEAD', activeIn: ['scheduled'], startsOn: 'entry to Scheduled', defaultDuration: null,
      onExpiry: { kind: 'flag', flag: 'readyToGenerate' }, configurablePerTenant: true,
      source: 'prd_per_tenant_policy', requirementIds: ['FM-02'],
      note: 'FM-02: generate ahead of due date by leadTimeDays. No background scheduler here — surfaced as a lead-time queue + one-click generate (HITL).' },
  ],
  ai: [
    { featureId: 'AI-F-01', priority: 'Should', attachesTo: ['scheduled', 'ai_draft'],
      suggests: 'asset attributes, WO/failure history and runtime feed → ranked failure-risk + suggested pull-forward dates as DRAFT entries',
      humanInTheLoop: 'FM approves before any schedule change; shadow mode until data is sufficient.',
      fallback: 'the standard PPM calendar operates untouched',
      benchmark: 'precision ≥ 70% on a 30-day failure window (after 3–6 months of data)', mayFireTransition: false },
  ],
  invariants: [
    'AI never moves the live schedule autonomously — a draft only becomes scheduled via PROMOTE by the FM (§11.4).',
    'Statutory occurrences cannot be rescheduled past their legal deadline.',
    'Completion requires checklist + evidence when evidenceRequired (FM-02), re-validated server-side.',
    'Every occurrence is tenant/estate-scoped (§8.2); the risk engine reads only scoped repos.',
  ],
};
