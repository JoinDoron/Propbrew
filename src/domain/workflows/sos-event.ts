/**
 * PRD §10 SOS event — EM-06. Safety-critical. Strictly linear — the only §10
 * machine with no branch states. Every raised event must traverse the full
 * chain; there is no cancel / false-alarm exit (a safety-critical gap owned by
 * Q4). Escalation after 60s does NOT change state — adding an Escalated state
 * would break the §10 closed-world rule.
 */

import type { Machine, Transition } from './core';
import type { SosStatus } from '@/domain/enums';

const T: readonly Transition<SosStatus>[] = [
  { id: 'SOS-01', from: null, to: 'raised', event: 'RAISE',
    actors: ['resident'], guards: ['tenant + estate scope', 'resident linked to a unit (§8.1)'],
    effects: ['EM-06: alert the security desk AND designated responders with unit/location', 'start the 60s acknowledge clock', 'SC-10 security-event audit', 'accepted via in-app, queued-offline (§12.1) or SMS fallback (proposed)'],
    notify: ['security', 'designated_responders', 'estate_manager'], requirementIds: ['EM-06', 'SC-10'], provenance: 'prd_implied' },

  { id: 'SOS-02', from: 'raised', to: 'acknowledged', event: 'ACKNOWLEDGE',
    actors: ['security', 'estate_manager'],
    effects: ['stop the acknowledge clock and record hit/miss against the <60s target', 'notify the raising resident (EM-06: "know security has seen it")'],
    notify: ['resident', 'estate_manager'], requirementIds: ['EM-06'], provenance: 'prd_explicit' },

  { id: 'SOS-03', from: 'acknowledged', to: 'responding', event: 'RESPOND',
    actors: ['security', 'estate_manager'], effects: ['record responder identity and timestamp on the trail (§8.1)'],
    notify: ['resident', 'estate_manager'], requirementIds: ['EM-06'], provenance: 'prd_explicit', note: 'No SLA target given for this leg.' },

  { id: 'SOS-04', from: 'responding', to: 'resolved', event: 'RESOLVE',
    actors: ['security', 'estate_manager'], effects: ['create incident log entry (EM-06 "Patrol and incident logging")'],
    notify: ['resident', 'estate_manager'], requirementIds: ['EM-06'], provenance: 'prd_explicit', note: 'No SLA target given for this leg.' },

  { id: 'SOS-05', from: 'resolved', to: 'reviewed', event: 'REVIEW',
    actors: ['estate_manager'], effects: ['close out the post-incident review', '§10: "full timeline retained for review"'],
    notify: ['estate_manager', 'executive'], requirementIds: ['EM-06', 'SC-10'], provenance: 'prd_explicit' },
];

export const sosEventMachine: Machine<SosStatus> = {
  key: 'sos-event',
  prdSection: '§10 · EM-06',
  prdStatesVerbatim: 'Raised → Acknowledged → Responding → Resolved → Reviewed',
  prdRulesVerbatim: 'Acknowledge target < 60s during manned hours (proposed); unacknowledged alerts escalate to backup responders; full timeline retained for review.',
  states: ['raised', 'acknowledged', 'responding', 'resolved', 'reviewed'],
  initial: ['raised'],
  branch: [],
  terminal: ['reviewed'],
  transitions: T,
  timers: [
    { id: 'SOS-ACK', activeIn: ['raised'], startsOn: 'raise', defaultDuration: 'PT60S',
      onExpiry: { kind: 'escalate', audience: ['backup_responders', 'estate_manager'] },
      configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['EM-06'],
      note: '§10: "Acknowledge target < 60s during manned hours". Escalation sets a flag and notifies; state stays Raised. Manned-hours calendar and backup chain owned by Q4.' },
  ],
  ai: [],
  invariants: [
    'Strictly linear — the only §10 machine with no branch states.',
    'There is NO cancel / false-alarm state — a safety-critical gap (Q4).',
    'Escalation after 60s does NOT change state (§10 closed-world).',
    'Every SOS transition is a SECURITY EVENT for SC-10 audit.',
    'SOS must work on poor connectivity: queued write with visible sync status, plus SMS fallback (§12.1, both proposed).',
    'SC-09 quiet hours must NOT suppress SOS alerts — confirm (not stated).',
    'No AI feature may raise, acknowledge, respond to or resolve an SOS (§11.4).',
  ],
};
