/**
 * Shared primitives for the five PRD §10 state machines. No framework imports.
 *
 * PRD §10 (verbatim): "State machines below are the contract between backend,
 * mobile and QA. Only the listed transitions are legal; every transition is
 * timestamped, actor-attributed and notified via SC-09. SLA values are proposed
 * defaults, configurable per tenant."
 *
 * The graphs are encoded as explicit EDGE TABLES, not the happy-path arrow chain
 * §10 draws — transcribed literally, the work-order chain forces every job
 * through On Hold and leaves Rejected/Cancelled unreachable. Every edge carries
 * a `provenance` so QA can see exactly what the PRD stated versus what had to be
 * inferred for the machine to function.
 */

import type { Role } from '@/domain/enums';

export type { Role };

/** Non-human principals that may fire a transition. Still actor-attributed (§10). */
export type SystemActor =
  | 'system_timer' // SLA, reminder and auto-close clocks
  | 'system_scheduler' // FM-02 PPM work-order generation
  | 'system_webhook' // SC-02 gateway payment confirmation
  | 'system_rule'; // per-tenant configured rule (e.g. EM-05 auto-approval)

export type Actor = Role | SystemActor;

/**
 * Provenance of each edge. §10 is a closed world, so anything not `prd_explicit`
 * or `prd_implied` must be confirmed (Change Request, Clause 10) before shipping.
 */
export type Provenance =
  | 'prd_explicit' // written verbatim in the PRD
  | 'prd_implied' // strictly required for a prd_explicit rule to function
  | 'derived_proposed'; // NOT in the PRD — proposed, needs client sign-off

/** Only these may ship without a Change Request. Asserted in CI. */
export const CONTRACTED_PROVENANCE: readonly Provenance[] = ['prd_explicit', 'prd_implied'];

/** SC-09 notification audiences: roles plus relationship-derived audiences. */
export type NotifyAudience =
  | Role
  | 'requester'
  | 'assignee'
  | 'previous_assignee'
  | 'designated_responders'
  | 'backup_responders'
  | 'dispatch_queue';

export type Transition<S extends string> = {
  id: string;
  /** null = creation. */
  from: S | null;
  to: S;
  event: string;
  /** Who may fire it (SC-01 deny-by-default; §7 authoritative baseline). */
  actors: readonly Actor[];
  /** Server-side preconditions, evaluated before the transition is admitted. */
  guards?: readonly string[];
  /** Effects applied atomically with the transition. */
  effects?: readonly string[];
  /** SC-09 recipients for this transition. */
  notify?: readonly NotifyAudience[];
  requirementIds: readonly string[];
  provenance: Provenance;
  note?: string;
};

export type TimerValueSource =
  | 'prd_proposed_default' // §10 proposes a number (configurable per tenant)
  | 'prd_per_tenant_policy' // PRD says "per tenant" / "per policy", no number
  | 'not_in_prd'; // no PRD guidance at all — open issue

export type Timer<S extends string> = {
  id: string;
  activeIn: readonly S[];
  startsOn: string;
  /** ISO-8601 duration, or null when the PRD proposes no value. */
  defaultDuration: string | null;
  onExpiry:
    | { kind: 'transition'; to: S; actor: SystemActor }
    | { kind: 'notify'; audience: readonly NotifyAudience[] }
    | { kind: 'escalate'; audience: readonly NotifyAudience[] }
    | { kind: 'flag'; flag: string };
  configurablePerTenant: boolean;
  source: TimerValueSource;
  requirementIds: readonly string[];
  note?: string;
};

/**
 * §11.4 (release-blocking): "every suggestion is review/approve/override — AI is
 * assistive, not autonomous." `mayFireTransition` is typed to the literal `false`
 * so no AI touchpoint can ever be declared as a transition actor.
 */
export type AiTouchpoint<S extends string> = {
  featureId: string; // e.g. 'AI-F-02'
  priority: 'Must' | 'Should' | 'Could';
  attachesTo: readonly S[] | 'workflow';
  suggests: string;
  humanInTheLoop: string;
  fallback: string;
  benchmark: string | null;
  mayFireTransition: false;
};

export type Machine<S extends string> = {
  key: string;
  prdSection: string;
  prdStatesVerbatim: string;
  prdRulesVerbatim: string;
  states: readonly S[];
  initial: readonly S[];
  branch: readonly S[];
  terminal: readonly S[];
  transitions: readonly Transition<S>[];
  timers: readonly Timer<S>[];
  ai: readonly AiTouchpoint<S>[];
  invariants: readonly string[];
};

/* ------------------------------------------------------------------ */
/* Engine — the same functions the backend and mobile will call        */
/* ------------------------------------------------------------------ */

export type TransitionRejection =
  | { kind: 'illegal_transition'; from: string; event: string }
  | { kind: 'permission_denied'; actor: Actor; allowed: readonly Actor[] }
  | { kind: 'terminal_state'; state: string };

/** Every legal edge out of `state`. */
export function outgoing<S extends string>(machine: Machine<S>, state: S): readonly Transition<S>[] {
  return machine.transitions.filter((t) => t.from === state);
}

/** States reachable from `state` in one legal transition. */
export function nextStates<S extends string>(machine: Machine<S>, state: S): readonly S[] {
  return Array.from(new Set(outgoing(machine, state).map((t) => t.to)));
}

/** Legal transitions out of `state` that `actor` is permitted to fire. */
export function legalTransitionsFor<S extends string>(
  machine: Machine<S>,
  state: S,
  actor: Actor,
): readonly Transition<S>[] {
  return outgoing(machine, state).filter((t) => (t.actors as readonly string[]).includes(actor));
}

/** The specific edge for a (from, event) pair, or undefined if none is legal.
 *  `from` may be null to match creation edges. */
export function findTransition<S extends string>(
  machine: Machine<S>,
  from: S | null,
  event: string,
): Transition<S> | undefined {
  return machine.transitions.find((t) => t.from === from && t.event === event);
}

export function isTerminal<S extends string>(machine: Machine<S>, state: S): boolean {
  return machine.terminal.includes(state);
}

/**
 * Decide whether `actor` may drive `machine` from `from` via `event`. Pure and
 * total: returns a typed rejection rather than throwing, so the UI can
 * distinguish "not allowed" from "illegal move" (§12.1 offline conflict UX).
 */
export function canTransition<S extends string>(
  machine: Machine<S>,
  from: S,
  event: string,
  actor: Actor,
): { ok: true; transition: Transition<S> } | { ok: false; rejection: TransitionRejection } {
  if (isTerminal(machine, from)) {
    return { ok: false, rejection: { kind: 'terminal_state', state: from } };
  }
  const transition = findTransition(machine, from, event);
  if (!transition) {
    return { ok: false, rejection: { kind: 'illegal_transition', from, event } };
  }
  if (!(transition.actors as readonly string[]).includes(actor)) {
    return { ok: false, rejection: { kind: 'permission_denied', actor, allowed: transition.actors } };
  }
  return { ok: true, transition };
}

export class IllegalTransitionError extends Error {
  constructor(readonly rejection: TransitionRejection) {
    super(`Illegal transition: ${rejection.kind}`);
    this.name = 'IllegalTransitionError';
  }
}

/** Throwing form for server actions. Returns the admitted transition. */
export function assertTransition<S extends string>(
  machine: Machine<S>,
  from: S,
  event: string,
  actor: Actor,
): Transition<S> {
  const result = canTransition(machine, from, event, actor);
  if (!result.ok) throw new IllegalTransitionError(result.rejection);
  return result.transition;
}
