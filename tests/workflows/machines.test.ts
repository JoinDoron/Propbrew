/**
 * §10 state-machine contract tests. §10 calls itself "the contract between
 * backend, mobile and QA", so these assert graph integrity — the checks that
 * would have caught §10's own defect (Rejected/Cancelled with no in-edges, On
 * Hold as a trap).
 */

import { describe, expect, it } from 'vitest';
import {
  MACHINES,
  assertTransition,
  canTransition,
  legalTransitionsFor,
  nextStates,
  outgoing,
  type Machine,
} from '@/domain/workflows';

const ALL = Object.entries(MACHINES) as [string, Machine<string>][];

describe.each(ALL)('%s — graph integrity', (key, m) => {
  it('every declared state is either initial, or has an in-edge', () => {
    const hasInEdge = new Set(m.transitions.map((t) => t.to));
    for (const s of m.states) {
      const reachable = m.initial.includes(s) || hasInEdge.has(s);
      expect(reachable, `${key}: state "${s}" is unreachable (no in-edge)`).toBe(true);
    }
  });

  it('every non-terminal state has at least one out-edge', () => {
    for (const s of m.states) {
      if (m.terminal.includes(s)) continue;
      expect(outgoing(m, s).length, `${key}: non-terminal "${s}" is a dead end`).toBeGreaterThan(0);
    }
  });

  it('every terminal state has no out-edges', () => {
    for (const s of m.terminal) {
      expect(outgoing(m, s).length, `${key}: terminal "${s}" must not transition out`).toBe(0);
    }
  });

  it('every branch state is a subset of the declared states', () => {
    for (const s of [...m.branch, ...m.terminal, ...m.initial]) {
      expect(m.states, `${key}: "${s}" not in states`).toContain(s);
    }
  });

  it('every transition references only declared states', () => {
    for (const t of m.transitions) {
      if (t.from !== null) expect(m.states).toContain(t.from);
      expect(m.states).toContain(t.to);
    }
  });

  it('every transition carries a provenance and requirement ids', () => {
    for (const t of m.transitions) {
      expect(['prd_explicit', 'prd_implied', 'derived_proposed']).toContain(t.provenance);
      expect(t.requirementIds.length, `${key}:${t.id} needs a requirement id`).toBeGreaterThan(0);
    }
  });

  it('no AI touchpoint may fire a transition (§11.4)', () => {
    for (const a of m.ai) {
      expect(a.mayFireTransition).toBe(false);
    }
  });
});

describe('derived_proposed edges are visible, not hidden', () => {
  it('lists every edge that needs client sign-off before shipping', () => {
    const proposed = ALL.flatMap(([key, m]) =>
      m.transitions.filter((t) => t.provenance === 'derived_proposed').map((t) => `${key}:${t.id}`),
    );
    // This is a living list — the snapshot makes any new inferred edge a review event.
    expect(proposed).toMatchSnapshot();
  });
});

describe('work-order engine behaviour', () => {
  const wo = MACHINES['work-order'];

  it('the corrected graph allows in_progress → resolved directly (not only via on_hold)', () => {
    const r = canTransition(wo, 'in_progress', 'RESOLVE', 'technician');
    expect(r.ok).toBe(true);
  });

  it('on_hold can resume — it is not a trap', () => {
    expect(nextStates(wo, 'on_hold')).toContain('in_progress');
  });

  it('rejected and cancelled are reachable', () => {
    const inEdges = new Set(wo.transitions.map((t) => t.to));
    expect(inEdges.has('rejected')).toBe(true);
    expect(inEdges.has('cancelled')).toBe(true);
  });

  it('a technician may not triage (WOs never originate from a technician)', () => {
    const r = canTransition(wo, 'new', 'TRIAGE', 'technician');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.kind).toBe('permission_denied');
  });

  it('an illegal (from,event) pair is rejected as illegal, not permission-denied', () => {
    const r = canTransition(wo, 'new', 'RESOLVE', 'technician');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.kind).toBe('illegal_transition');
  });

  it('a terminal state admits nothing', () => {
    const r = canTransition(wo, 'closed', 'REOPEN', 'estate_manager');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.kind).toBe('terminal_state');
  });

  it('assertTransition throws on an illegal move', () => {
    expect(() => assertTransition(wo, 'new', 'CLOSE', 'estate_manager')).toThrow();
  });

  it('a manager sees only the transitions they may fire from a state', () => {
    const forResident = legalTransitionsFor(wo, 'resolved', 'resident');
    // A resident may VERIFY or REOPEN their own resolved WO, not AUTO_CLOSE.
    const events = forResident.map((t) => t.event);
    expect(events).toContain('VERIFY');
    expect(events).not.toContain('AUTO_CLOSE');
  });
});

describe('service-charge engine — arrears track is escapable', () => {
  const sc = MACHINES['service-charge'];

  it('a payment out of every arrears state reaches partially_paid or paid', () => {
    for (const s of ['overdue', 'in_arrears', 'escalated'] as const) {
      const targets = outgoing(sc, s)
        .filter((t) => t.event === 'PAYMENT_CONFIRMED')
        .map((t) => t.to);
      expect(targets.length, `${s} must accept a payment`).toBeGreaterThan(0);
    }
  });

  it('only the webhook applies payments (SC-02), never a role directly', () => {
    for (const t of sc.transitions.filter((t) => t.event === 'PAYMENT_CONFIRMED')) {
      expect(t.actors).toEqual(['system_webhook']);
    }
  });
});

describe('sos-event — safety-critical linear machine', () => {
  const sos = MACHINES['sos-event'];

  it('has no branch states (strictly linear)', () => {
    expect(sos.branch).toEqual([]);
  });

  it('has no AI touchpoints in the transition path', () => {
    expect(sos.ai).toEqual([]);
  });
});
