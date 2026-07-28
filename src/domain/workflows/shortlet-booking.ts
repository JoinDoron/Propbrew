/**
 * Short-Let PMS booking lifecycle (new module; FR-BM / FR-CI). A booking moves
 * Enquiry → Confirmed → Checked-in → Checked-out → Closed, with Cancelled as the
 * branch. Payments are recorded off-platform (Assumption 2), so money never
 * gates a transition here — check-out drives the FR-CI inspection which drives
 * the caution-fee decision recorded at close.
 *
 * The module rides the CR-locked §7 matrix's closest capability (bookings), so
 * actors are the ops booking roles; a housekeeper is modelled as a team member
 * in-app, not an auth role.
 */

import type { Machine, Transition } from './core';
import type { ShortLetBookingStatus } from '@/domain/enums';

const T: readonly Transition<ShortLetBookingStatus>[] = [
  { id: 'SL-01', from: null, to: 'enquiry', event: 'CREATE',
    actors: ['estate_manager', 'executive'], guards: ['apartment available for the stay dates (FR-BM-01)'],
    effects: ['persist booking (FR-BM-05)', 'generate personalised guest link (FR-GL-01)'], notify: ['estate_manager'],
    requirementIds: ['FR-BM-01', 'FR-GL-01'], provenance: 'prd_explicit' },

  { id: 'SL-02', from: 'enquiry', to: 'confirmed', event: 'CONFIRM',
    actors: ['estate_manager', 'executive'], guards: ['deposit / caution fee arrangements agreed'],
    effects: ['block availability', 'send WhatsApp booking confirmation (FR-WA-01)'], notify: ['estate_manager'],
    requirementIds: ['FR-BM-01', 'FR-WA-01'], provenance: 'prd_explicit' },

  { id: 'SL-03', from: 'enquiry', to: 'cancelled', event: 'CANCEL',
    actors: ['estate_manager', 'executive'], effects: ['release the held dates'],
    requirementIds: ['FR-BM-01'], provenance: 'prd_implied' },

  { id: 'SL-04', from: 'confirmed', to: 'checked_in', event: 'CHECK_IN',
    actors: ['estate_manager', 'executive'], guards: ['stay start reached'],
    effects: ['mark unit occupied (FR-BM-04)'], requirementIds: ['FR-BM-04'], provenance: 'prd_implied' },

  { id: 'SL-05', from: 'confirmed', to: 'cancelled', event: 'CANCEL',
    actors: ['estate_manager', 'executive'], effects: ['release the held dates', 'refund per policy (off-platform)'],
    requirementIds: ['FR-BM-01'], provenance: 'prd_implied' },

  { id: 'SL-06', from: 'checked_in', to: 'checked_out', event: 'CHECK_OUT',
    actors: ['estate_manager', 'executive'], effects: ['open a checkout inspection (FR-CI-01)', 'trigger turnover/cleaning'],
    requirementIds: ['FR-CI-01'], provenance: 'prd_explicit' },

  { id: 'SL-07', from: 'checked_out', to: 'closed', event: 'CLOSE',
    actors: ['estate_manager', 'executive'], guards: ['caution-fee decision recorded from inspection (FR-CI-03)'],
    effects: ['refund or deduct caution fee', 'finalise booking for analytics (FR-BM-05)'],
    requirementIds: ['FR-CI-03', 'FR-BM-05'], provenance: 'prd_explicit' },
];

export const shortletBookingMachine: Machine<ShortLetBookingStatus> = {
  key: 'shortlet-booking',
  prdSection: 'FR-BM / FR-CI (Short-Let PMS)',
  prdStatesVerbatim: 'Enquiry → Confirmed → Checked-in → Checked-out → Closed; branch: Cancelled',
  prdRulesVerbatim: 'Payments off-platform (Assumption 2); checkout inspection drives the caution-fee decision (FR-CI-03).',
  states: ['enquiry', 'confirmed', 'checked_in', 'checked_out', 'closed', 'cancelled'],
  initial: ['enquiry'],
  branch: ['cancelled'],
  terminal: ['closed', 'cancelled'],
  transitions: T,
  timers: [
    { id: 'SL-PREARRIVAL', activeIn: ['confirmed'], startsOn: 'stay start − 1 day', defaultDuration: null, onExpiry: { kind: 'flag', flag: 'prearrivalReminderDue' }, configurablePerTenant: true, source: 'not_in_prd', requirementIds: ['FR-WA-02'], note: 'FR-WA-02 pre-arrival WhatsApp reminder.' },
  ],
  ai: [
    { featureId: 'SL-AI-RATE', priority: 'Could', attachesTo: 'workflow',
      suggests: 'advisory nightly-rate suggestion from occupancy, weekend and seasonality signals',
      humanInTheLoop: 'Advisory only — the operator sets the rate. The PRD explicitly excludes dynamic pricing.', fallback: 'operator-set base rate',
      benchmark: null, mayFireTransition: false },
  ],
  invariants: [
    'Payments never gate a transition — recorded off-platform after the fact (Assumption 2).',
    'Check-out opens an inspection; close cannot record until the caution-fee decision exists (FR-CI-03).',
    'Rate suggestions are advisory and never auto-applied (PRD excludes dynamic pricing).',
  ],
};
