/**
 * PRD §10 Marketplace order — EM-09, on the SC-04 shared catalog/order/payment
 * substrate. `expired` is implied by "auto-expires" but is NOT one of the two
 * listed branches (Declined, Refunded). Closed must NOT imply the vendor has
 * been settled — payout is a separate lifecycle blocked by Q3.
 */

import type { Machine, Transition } from './core';
import type { OrderStatus } from '@/domain/enums';

const T: readonly Transition<OrderStatus>[] = [
  { id: 'MK-01', from: null, to: 'placed', event: 'PLACE',
    actors: ['resident'], guards: ['listing active', 'vendor approved (EM-07)', 'PAYMENT TIMING UNDEFINED — at place or at accept'],
    effects: ['start the vendor accept SLA clock', 'served by SC-04 catalog/cart/order/payment'],
    notify: ['vendor', 'resident'], requirementIds: ['EM-09', 'SC-02', 'SC-04'], provenance: 'prd_implied' },

  { id: 'MK-02', from: 'placed', to: 'accepted', event: 'ACCEPT',
    actors: ['vendor'], guards: ['within the vendor accept SLA (value not given)'],
    effects: ['stop the accept clock and record hit/miss (feeds FM-05 SLA hit rate)'], notify: ['resident'],
    requirementIds: ['EM-09', 'FM-05'], provenance: 'prd_explicit' },

  { id: 'MK-03', from: 'placed', to: 'declined', event: 'DECLINE',
    actors: ['vendor'], effects: ['if already paid, refund via SC-02 (idempotent)'], notify: ['resident'],
    requirementIds: ['EM-09', 'SC-02'], provenance: 'prd_explicit' },

  { id: 'MK-04', from: 'placed', to: 'expired', event: 'AUTO_EXPIRE',
    actors: ['system_timer'], guards: ['§10: "Vendor must accept within SLA or order auto-expires" — SLA value not given'],
    effects: ['release/refund if paid', 'count against vendor performance metrics (FM-05)'],
    notify: ['resident', 'vendor', 'estate_manager'], requirementIds: ['EM-09', 'SC-02', 'FM-05'], provenance: 'prd_explicit',
    note: 'The RULE is prd_explicit; the STATE NAME is not among the §10 branches.' },

  { id: 'MK-05', from: 'accepted', to: 'fulfilled', event: 'FULFIL',
    actors: ['vendor'], notify: ['resident'], requirementIds: ['EM-09'], provenance: 'prd_explicit' },

  { id: 'MK-06', from: 'fulfilled', to: 'closed', event: 'CLOSE',
    actors: ['resident', 'estate_manager', 'system_timer'], guards: ['TRIGGER UNSPECIFIED IN PRD'],
    effects: ['Closed does NOT imply the vendor has been paid — payout is a separate lifecycle blocked by Q3'],
    notify: ['resident', 'vendor'], requirementIds: ['EM-09'], provenance: 'prd_explicit', note: 'State is prd_explicit; the close trigger is derived.' },

  { id: 'MK-07', from: 'accepted', to: 'refunded', event: 'REFUND', actors: ['estate_manager'], guards: ['idempotent gateway refund (SC-02)'], effects: ['SC-10 financial-action audit entry'], notify: ['resident', 'vendor'], requirementIds: ['EM-09', 'SC-02', 'SC-10'], provenance: 'prd_explicit', note: 'Branch is prd_explicit; the authorising actor is derived — §7 gives PlatformAdmin only V on Marketplace.' },
  { id: 'MK-08', from: 'fulfilled', to: 'refunded', event: 'REFUND', actors: ['estate_manager'], guards: ['idempotent gateway refund'], effects: ['SC-10 audit entry'], notify: ['resident', 'vendor'], requirementIds: ['EM-09', 'SC-02'], provenance: 'prd_explicit' },
  { id: 'MK-09', from: 'closed', to: 'refunded', event: 'REFUND', actors: ['estate_manager'], guards: ['idempotent gateway refund', 'refund window not specified'], effects: ['SC-10 audit entry'], notify: ['resident', 'vendor'], requirementIds: ['EM-09', 'SC-02'], provenance: 'prd_explicit', note: 'Which states permit Refunded is not specified; all post-payment states assumed.' },
];

export const marketplaceOrderMachine: Machine<OrderStatus> = {
  key: 'marketplace-order',
  prdSection: '§10 · EM-09',
  prdStatesVerbatim: 'Placed → Accepted → Fulfilled → Closed; branches: Declined, Refunded',
  prdRulesVerbatim: 'Vendor must accept within SLA or order auto-expires; refunds via gateway; payout model pending Q3.',
  states: ['placed', 'accepted', 'fulfilled', 'closed', 'declined', 'refunded', 'expired'],
  initial: ['placed'],
  branch: ['declined', 'refunded', 'expired'],
  // `closed` is the happy end but is NOT strictly terminal: MK-09 allows a
  // refund after close (refund windows outlast completion). Only declined,
  // refunded and expired admit no further transition. This divergence from
  // §10's "Closed is the end" is the MK-09 assumption — confirm at discovery.
  terminal: ['declined', 'refunded', 'expired'],
  transitions: T,
  timers: [
    { id: 'MK-ACCEPT-SLA', activeIn: ['placed'], startsOn: 'order placed', defaultDuration: null, onExpiry: { kind: 'transition', to: 'expired', actor: 'system_timer' }, configurablePerTenant: true, source: 'prd_per_tenant_policy', requirementIds: ['EM-09'], note: '§10 says only "within SLA". No value proposed — the machine cannot be completed without it.' },
  ],
  ai: [
    { featureId: 'AI-E-05', priority: 'Could', attachesTo: 'workflow',
      suggests: 'listing auto-generation, personalised recommendations, fraud flags',
      humanInTheLoop: 'Fraud flags go to a human review queue — never auto-block.', fallback: 'manual listings, no recommendations',
      benchmark: 'Fraud-flag precision ≥ 60% at review (pilot)', mayFireTransition: false },
  ],
  invariants: [
    'Closed must NOT imply the vendor has been settled — Q3 blocks the payout build.',
    'A fraud flag from AI-E-05/AI-S-05 must never auto-decline or block an order — human review queue only.',
    'All refunds go through the SC-02 gateway abstraction, idempotent; every refund is an SC-10 financial action.',
    'Vendor acts only on its own orders (§7 Marketplace: Ven = O); Resident places only its own (Res = O); EstateManager manages (M).',
  ],
};
