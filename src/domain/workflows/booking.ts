/**
 * PRD §10 Booking — EM-05. §10 writes "Approved / Auto-approved" as alternatives;
 * both are kept as distinct states (the enum lists both) with identical outgoing
 * edges. This machine has NO numeric SLA default anywhere in the PRD.
 */

import type { Machine, Transition } from './core';
import type { BookingStatus } from '@/domain/enums';

const T: readonly Transition<BookingStatus>[] = [
  { id: 'BK-01', from: null, to: 'requested', event: 'REQUEST',
    actors: ['resident'], guards: ['slot within amenity hours (EM-05)', 'capacity not exceeded', 'amenity rules satisfied'],
    effects: ['hold the slot on the availability calendar (EM-05)'], notify: ['resident', 'estate_manager'],
    requirementIds: ['EM-05'], provenance: 'prd_implied' },

  { id: 'BK-02', from: 'requested', to: 'approved', event: 'APPROVE',
    actors: ['estate_manager'], guards: ['amenity configured for manager approval'], notify: ['resident'],
    requirementIds: ['EM-05'], provenance: 'prd_explicit' },

  { id: 'BK-03', from: 'requested', to: 'auto_approved', event: 'AUTO_APPROVE',
    actors: ['system_rule'], guards: ['§10: auto-approval per amenity rules satisfied'], notify: ['resident', 'estate_manager'],
    requirementIds: ['EM-05'], provenance: 'prd_explicit' },

  { id: 'BK-04', from: 'requested', to: 'declined', event: 'DECLINE',
    actors: ['estate_manager'], effects: ['release the held slot'], notify: ['resident'],
    requirementIds: ['EM-05'], provenance: 'prd_explicit' },

  { id: 'BK-05', from: 'requested', to: 'cancelled', event: 'CANCEL',
    actors: ['resident', 'estate_manager'], effects: ['release the held slot'], notify: ['resident', 'estate_manager'],
    requirementIds: ['EM-05'], provenance: 'prd_explicit' },

  { id: 'BK-06', from: 'approved', to: 'confirmed', event: 'CONFIRM',
    actors: ['system_rule'], guards: ['amenity has NO fee'], effects: ['slot firmly booked'], notify: ['resident'],
    requirementIds: ['EM-05'], provenance: 'prd_explicit', note: '§10 "payment (if fees) required to confirm" implies fee-free bookings confirm without payment.' },

  { id: 'BK-07', from: 'approved', to: 'confirmed', event: 'PAYMENT_CONFIRMED',
    actors: ['system_webhook'], guards: ['amenity HAS a fee', 'SC-02 webhook confirms payment', 'served by SC-04 cart/order/payment'],
    effects: ['receipt', 'slot firmly booked'], notify: ['resident'], requirementIds: ['EM-05', 'SC-02', 'SC-04'], provenance: 'prd_explicit' },

  { id: 'BK-08', from: 'auto_approved', to: 'confirmed', event: 'CONFIRM',
    actors: ['system_rule', 'system_webhook'], guards: ['fee-free: confirm; fee-bearing: on webhook'],
    effects: ['slot firmly booked'], notify: ['resident'], requirementIds: ['EM-05', 'SC-02'], provenance: 'prd_implied',
    note: 'Auto-approved bookings confirm by the same rule as approved ones.' },

  { id: 'BK-09', from: 'approved', to: 'cancelled', event: 'CANCEL',
    actors: ['resident', 'estate_manager'], guards: ['Resident: within cancellation window (no PRD value)', 'EstateManager: any time'],
    effects: ['release slot'], notify: ['resident', 'estate_manager'], requirementIds: ['EM-05'], provenance: 'prd_explicit' },

  { id: 'BK-10', from: 'auto_approved', to: 'cancelled', event: 'CANCEL',
    actors: ['resident', 'estate_manager'], effects: ['release slot'], notify: ['resident', 'estate_manager'],
    requirementIds: ['EM-05'], provenance: 'prd_implied' },

  { id: 'BK-11', from: 'confirmed', to: 'completed', event: 'COMPLETE',
    actors: ['system_timer', 'estate_manager'], guards: ['TRIGGER UNSPECIFIED IN PRD — slot end / manager action'],
    effects: ['free the amenity', 'feed utilisation reporting'], notify: ['resident'],
    requirementIds: ['EM-05'], provenance: 'prd_explicit', note: 'State is prd_explicit; the completion trigger is derived.' },

  { id: 'BK-12', from: 'confirmed', to: 'cancelled', event: 'CANCEL',
    actors: ['resident', 'estate_manager'], guards: ['within the cancellation window per policy'],
    effects: ['if a fee was paid, refund per policy via SC-02 (policy not specified)', 'release slot'],
    notify: ['resident', 'estate_manager'], requirementIds: ['EM-05', 'SC-02'], provenance: 'prd_explicit' },
];

export const bookingMachine: Machine<BookingStatus> = {
  key: 'booking',
  prdSection: '§10 · EM-05',
  prdStatesVerbatim: 'Requested → Approved / Auto-approved → Confirmed → Completed; branches: Declined, Cancelled',
  prdRulesVerbatim: 'Auto-approval per amenity rules; payment (if fees) required to confirm; cancellation window per policy.',
  states: ['requested', 'approved', 'auto_approved', 'confirmed', 'completed', 'declined', 'cancelled'],
  initial: ['requested'],
  branch: ['declined', 'cancelled'],
  terminal: ['completed', 'declined', 'cancelled'],
  transitions: T,
  timers: [
    { id: 'BK-CANCEL-WINDOW', activeIn: ['approved', 'auto_approved', 'confirmed'], startsOn: 'slot start − window', defaultDuration: null, onExpiry: { kind: 'flag', flag: 'cancellationWindowClosed' }, configurablePerTenant: true, source: 'prd_per_tenant_policy', requirementIds: ['EM-05'], note: '§10 "cancellation window per policy". No value given.' },
    { id: 'BK-SLOT-END', activeIn: ['confirmed'], startsOn: 'booking slot end', defaultDuration: null, onExpiry: { kind: 'transition', to: 'completed', actor: 'system_timer' }, configurablePerTenant: false, source: 'not_in_prd', requirementIds: ['EM-05'] },
  ],
  ai: [
    { featureId: 'AI-E-01', priority: 'Should', attachesTo: 'workflow',
      suggests: 'resident booking questions answered from the estate RAG corpus with sources',
      humanInTheLoop: 'No source → refuse and escalate to a ticket (EM-03). Corpus curated by the Estate Manager.', fallback: 'FAQ + ticket',
      benchmark: 'Routine-query deflection ≥ 60%; grounded-answer accuracy ≥ 90%', mayFireTransition: false },
  ],
  invariants: [
    'A fee-bearing booking cannot reach Confirmed without a webhook-confirmed payment (§10, SC-02).',
    'Security holds V only on Bookings & amenities (§7) — it can see bookings but cannot transition them.',
    'This machine has NO numeric SLA default anywhere in the PRD.',
  ],
};
