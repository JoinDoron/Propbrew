/**
 * PRD §10 Service charge / invoice — EM-01. Two chains: the happy path and the
 * arrears track. §10 draws no return edges from the arrears states, so every
 * PAYMENT_CONFIRMED edge off Overdue/InArrears/Escalated is `prd_implied` —
 * without them a late payment has no legal target and EM-01's mandated partial
 * payments and auto-reconciliation cannot happen.
 */

import type { Machine, Transition } from './core';
import type { InvoiceStatus } from '@/domain/enums';

const T: readonly Transition<InvoiceStatus>[] = [
  { id: 'IN-01', from: null, to: 'draft', event: 'CREATE',
    actors: ['estate_manager'], guards: ['unit/resident bound', 'amount and due date set'],
    effects: ['EM-01: charge setup per unit type/size — recurring cycle or one-off levy; penalties/discounts configurable'],
    requirementIds: ['EM-01'], provenance: 'prd_implied' },

  { id: 'IN-02', from: 'draft', to: 'issued', event: 'ISSUE',
    actors: ['estate_manager'], guards: ['due date set', 'unit has a billable resident'],
    effects: ['EM-01: invoice generated and delivered in-app + email/SMS', 'arm reminder timers −3d/due/+7d/+21d', 'SC-10 financial-action audit entry'],
    notify: ['resident'], requirementIds: ['EM-01', 'SC-09', 'SC-10'], provenance: 'prd_explicit' },

  { id: 'IN-03', from: 'issued', to: 'partially_paid', event: 'PAYMENT_CONFIRMED',
    actors: ['system_webhook'], guards: ['SC-02 webhook confirmed, idempotent', '0 < amount < outstanding balance'],
    effects: ['auto-reconcile to invoice (EM-01)', 'issue receipt', 'recompute balance and arrears aging'],
    notify: ['resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_explicit',
    note: 'Resident is the ONLY role with in-app payment access (§7 Payments row).' },

  { id: 'IN-04', from: 'partially_paid', to: 'partially_paid', event: 'PAYMENT_CONFIRMED',
    actors: ['system_webhook'], guards: ['amount < remaining balance'], effects: ['receipt', 'recompute balance'],
    notify: ['resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_implied' },

  { id: 'IN-05', from: 'partially_paid', to: 'paid', event: 'PAYMENT_CONFIRMED',
    actors: ['system_webhook'], guards: ['payment settles the balance'],
    effects: ['cancel outstanding reminders', 'receipt', 'feeds §14 collection rate'],
    notify: ['resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_explicit' },

  { id: 'IN-06', from: 'issued', to: 'paid', event: 'PAYMENT_CONFIRMED',
    actors: ['system_webhook'], guards: ['payment covers full balance'],
    effects: ['cancel reminders', 'receipt', 'if on/before due date counts toward §14 on-time %'],
    notify: ['resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_explicit' },

  { id: 'IN-07', from: 'issued', to: 'overdue', event: 'DUE_DATE_PASSED',
    actors: ['system_timer'], guards: ['due date + grace period elapsed (grace has no PRD value)', 'balance > 0'],
    effects: ['begin arrears aging', 'a manager-configured penalty rule MAY apply (EM-01) — never AI-driven (AI-E-03)'],
    notify: ['resident', 'estate_manager'], requirementIds: ['EM-01', 'AI-E-03'], provenance: 'prd_explicit' },

  { id: 'IN-08', from: 'overdue', to: 'in_arrears', event: 'AGE',
    actors: ['system_timer'], guards: ['aging threshold per tenant — no PRD value'],
    notify: ['resident', 'estate_manager'], requirementIds: ['EM-01'], provenance: 'prd_explicit' },

  { id: 'IN-09', from: 'in_arrears', to: 'escalated', event: 'ESCALATE',
    actors: ['system_rule', 'estate_manager'], guards: ['per-tenant escalation policy (content undefined)'],
    effects: ['SC-10 financial-action audit entry'], notify: ['resident', 'estate_manager'],
    requirementIds: ['EM-01', 'SC-10'], provenance: 'prd_explicit' },

  // Arrears-track return edges — required, not drawn in §10.
  { id: 'IN-10', from: 'overdue', to: 'partially_paid', event: 'PAYMENT_CONFIRMED', actors: ['system_webhook'], guards: ['0 < amount < balance'], notify: ['resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_implied', note: 'Arrears track has no return edges in §10.' },
  { id: 'IN-11', from: 'overdue', to: 'paid', event: 'PAYMENT_CONFIRMED', actors: ['system_webhook'], guards: ['settles balance'], notify: ['resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_implied' },
  { id: 'IN-12', from: 'in_arrears', to: 'partially_paid', event: 'PAYMENT_CONFIRMED', actors: ['system_webhook'], guards: ['0 < amount < balance'], notify: ['resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_implied' },
  { id: 'IN-13', from: 'in_arrears', to: 'paid', event: 'PAYMENT_CONFIRMED', actors: ['system_webhook'], guards: ['settles balance'], notify: ['resident'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_implied' },
  { id: 'IN-14', from: 'escalated', to: 'partially_paid', event: 'PAYMENT_CONFIRMED', actors: ['system_webhook'], guards: ['0 < amount < balance'], notify: ['resident', 'estate_manager'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_implied' },
  { id: 'IN-15', from: 'escalated', to: 'paid', event: 'PAYMENT_CONFIRMED', actors: ['system_webhook'], guards: ['settles balance'], notify: ['resident', 'estate_manager'], requirementIds: ['EM-01', 'SC-02'], provenance: 'prd_implied', note: 'The PRD defines NO exit from Escalated. This is the minimum viable exit.' },
];

export const serviceChargeMachine: Machine<InvoiceStatus> = {
  key: 'service-charge',
  prdSection: '§10 · EM-01',
  prdStatesVerbatim: 'Draft → Issued → Partially paid → Paid; Issued → Overdue → In arrears → Escalated',
  prdRulesVerbatim: 'Reminder schedule (e.g. −3d, due, +7d, +21d) via SC-09; AI timing suggestions (AI-E-03) require manager approval. Escalation policy per tenant.',
  states: ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'in_arrears', 'escalated'],
  initial: ['draft'],
  branch: ['overdue', 'in_arrears', 'escalated'],
  terminal: ['paid'],
  transitions: T,
  timers: [
    { id: 'IN-REMINDER-1', activeIn: ['issued', 'partially_paid'], startsOn: 'due date − 3 days', defaultDuration: 'P3D', onExpiry: { kind: 'notify', audience: ['resident'] }, configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['EM-01', 'SC-09'] },
    { id: 'IN-REMINDER-2', activeIn: ['issued', 'partially_paid'], startsOn: 'due date', defaultDuration: 'PT0S', onExpiry: { kind: 'notify', audience: ['resident'] }, configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['EM-01', 'SC-09'] },
    { id: 'IN-REMINDER-3', activeIn: ['overdue', 'in_arrears', 'partially_paid'], startsOn: 'due date + 7 days', defaultDuration: 'P7D', onExpiry: { kind: 'notify', audience: ['resident'] }, configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['EM-01', 'SC-09'] },
    { id: 'IN-REMINDER-4', activeIn: ['overdue', 'in_arrears', 'escalated'], startsOn: 'due date + 21 days', defaultDuration: 'P21D', onExpiry: { kind: 'notify', audience: ['resident', 'estate_manager'] }, configurablePerTenant: true, source: 'prd_proposed_default', requirementIds: ['EM-01', 'SC-09'] },
    { id: 'IN-AGING', activeIn: ['overdue'], startsOn: 'entry to Overdue', defaultDuration: null, onExpiry: { kind: 'transition', to: 'in_arrears', actor: 'system_timer' }, configurablePerTenant: true, source: 'prd_per_tenant_policy', requirementIds: ['EM-01'] },
    { id: 'IN-ESCALATION', activeIn: ['in_arrears'], startsOn: 'entry to InArrears', defaultDuration: null, onExpiry: { kind: 'transition', to: 'escalated', actor: 'system_rule' }, configurablePerTenant: true, source: 'prd_per_tenant_policy', requirementIds: ['EM-01'], note: '§10: "Escalation policy per tenant".' },
  ],
  ai: [
    { featureId: 'AI-E-03', priority: 'Should', attachesTo: ['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated'],
      suggests: 'billing/payment history → anomaly flags, defaulter-risk scores, reminder-timing suggestions',
      humanInTheLoop: 'Managers approve reminder campaigns; NO automated penalties ever.', fallback: 'fixed −3d/due/+7d/+21d schedule',
      benchmark: 'Risk model AUC ≥ 0.75 after two billing cycles', mayFireTransition: false },
  ],
  invariants: [
    'Resident is the only role that can pay in-app (§7 Payments row).',
    'All payment application is webhook-confirmed and idempotent (SC-02).',
    'NO AUTOMATED PENALTIES EVER (AI-E-03). Manager-configured deterministic penalty rules (EM-01) are permitted; AI-influenced ones are not.',
    'Every transition is a FINANCIAL ACTION for SC-10 audit.',
    'What constitutes Paid depends on Q10 (gateway settlement vs bank statements) — unresolved.',
    'A charge raised in error has no legal exit state in §10 (no Void/Cancelled) — open issue.',
  ],
};
