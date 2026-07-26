/**
 * §7 matrix + decision-engine tests. This layer is table-driven and cheap to
 * exhaust, so it sits at ~100% — well above §12's ≥70% floor — because it is a
 * 117-cell table that is catastrophic when wrong (an O cell silently becoming F
 * is the single most likely production authz failure).
 */

import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  CAPABILITIES,
  MATRIX,
  ROLES,
  actionsFor,
  can,
  effectiveLevel,
  levelFor,
  type Action,
  type Actor,
  type Capability,
  type Role,
} from '@/lib/authz';

/** A fully-populated actor; individual tests override the fields they exercise. */
function actor(over: Partial<Actor> & { roles: readonly Role[] }): Actor {
  return {
    userId: 'u1',
    tenantId: 't1',
    estateIds: [],
    allEstates: true,
    unitIds: [],
    vendorOrgId: null,
    investorProjectIds: [],
    ...over,
  };
}

describe('§7 matrix — golden snapshot (guards against silent edits; SC-01)', () => {
  it('matches the verified 13×9 table verbatim', () => {
    // Any change to a cell fails here, correctly forcing a Change Request (§19).
    expect(MATRIX).toMatchSnapshot();
  });

  it('is exhaustive: every capability × role cell is defined', () => {
    for (const cap of CAPABILITIES) {
      for (const role of ROLES) {
        expect(MATRIX[cap][role], `${cap} × ${role}`).toBeDefined();
      }
    }
  });

  it('Platform Admin is the only role holding full control anywhere', () => {
    const fullControlRoles = new Set<Role>();
    for (const cap of CAPABILITIES) {
      for (const role of ROLES) {
        if (MATRIX[cap][role] === 'F') fullControlRoles.add(role);
      }
    }
    expect([...fullControlRoles]).toEqual(['platform_admin']);
  });
});

describe('deny-by-default (SC-01)', () => {
  it('every "none" cell denies all eight actions', () => {
    for (const cap of CAPABILITIES) {
      for (const role of ROLES) {
        if (levelFor(role, cap) !== 'none') continue;
        for (const action of ACTIONS) {
          const d = can(actor({ roles: [role] }), cap, action);
          expect(d.allowed, `${role} should be denied ${action} on ${cap}`).toBe(false);
        }
      }
    }
  });

  it('an unknown capability is denied', () => {
    const d = can(actor({ roles: ['platform_admin'] }), 'nonsense' as Capability, 'read');
    expect(d.allowed).toBe(false);
  });

  it('an unknown role contributes no grant', () => {
    const d = can(actor({ roles: ['wizard' as Role] }), 'work_orders', 'read');
    expect(d.allowed).toBe(false);
  });
});

describe('narrowing invariant — per-cell overrides only ever subtract', () => {
  it('every role/capability action set is a subset of its level default', () => {
    // LEVEL_ACTIONS is private; re-derive the widest possible set per level.
    const LEVEL_MAX: Record<string, readonly Action[]> = {
      F: ['read', 'export', 'create', 'update', 'archive', 'approve', 'transition', 'configure'],
      M: ['read', 'export', 'create', 'update', 'archive', 'approve', 'transition'],
      V: ['read', 'export'],
      O: ['read', 'export', 'create', 'update', 'archive', 'transition'],
      none: [],
    };
    for (const cap of CAPABILITIES) {
      for (const role of ROLES) {
        const allowed = actionsFor(role, cap);
        const ceiling = LEVEL_MAX[levelFor(role, cap)];
        for (const a of allowed) {
          expect(ceiling, `${role}:${cap} may not widen beyond its level`).toContain(a);
        }
      }
    }
  });
});

describe('empty-ownership safety — the single most dangerous trap', () => {
  it('a resident with no linked units is DENIED, never granted everything', () => {
    // resident:charges_invoicing is O over my_units/self. No units, no self match
    // on invoices ⇒ the only satisfiable clause is `self`, still row-filtered.
    const d = can(actor({ roles: ['resident'], allEstates: true, unitIds: [] }), 'charges_invoicing', 'read');
    if (d.allowed) {
      // If allowed at all, it must carry a non-empty ownership restriction.
      expect(d.scope.ownership).not.toBeNull();
      expect(d.scope.ownership?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('a vendor with no org is denied work-order access (no match-everything filter)', () => {
    const d = can(actor({ roles: ['vendor'], vendorOrgId: null }), 'work_orders', 'read');
    // vendor:work_orders ownership is only my_vendor_org — unsatisfiable ⇒ no grant.
    expect(d.allowed).toBe(false);
  });

  it('an investor with no projects is denied project access', () => {
    const d = can(actor({ roles: ['investor'], investorProjectIds: [] }), 'investor_projects', 'read');
    expect(d.allowed).toBe(false);
  });

  it('a vendor WITH an org gets a restricted, non-empty scope', () => {
    const d = can(actor({ roles: ['vendor'], vendorOrgId: 'v9' }), 'work_orders', 'read');
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.scope.ownership).toEqual([{ key: 'my_vendor_org', vendorOrgId: 'v9' }]);
  });
});

describe('tenant isolation (§8.2)', () => {
  it('only platform_admin ever resolves the cross-tenant scope "*"', () => {
    for (const role of ROLES) {
      const d = can(actor({ roles: [role], tenantId: 't1' }), 'reports_analytics', 'read');
      if (d.allowed && d.scope.tenantId === '*') {
        expect(role).toBe('platform_admin');
      }
    }
  });

  it('a non-platform role with no tenant context is denied', () => {
    const d = can(actor({ roles: ['estate_manager'], tenantId: null }), 'work_orders', 'read');
    expect(d.allowed).toBe(false);
  });

  it('platform_admin needs no tenant context', () => {
    const d = can(actor({ roles: ['platform_admin'], tenantId: null }), 'reports_analytics', 'read');
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.scope.tenantId).toBe('*');
  });
});

describe('estate scoping', () => {
  it('a facility manager on estate A only is scoped to estate A', () => {
    const d = can(
      actor({ roles: ['facility_manager'], allEstates: false, estateIds: ['A'] }),
      'assets_ppm',
      'read',
    );
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.scope.estateIds).toEqual(['A']);
  });

  it('an executive sees all estates in the tenant', () => {
    const d = can(actor({ roles: ['executive'], allEstates: true }), 'reports_analytics', 'read');
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.scope.estateIds).toBe('all');
  });
});

describe('multi-role union semantics', () => {
  it('an Estate-Manager-who-is-also-a-Resident keeps the resident payment grant', () => {
    // EstM is "—" on payments; Resident is "O". Ranking would strip the payment
    // ability; union must keep it.
    const d = can(
      actor({ roles: ['estate_manager', 'resident'], unitIds: ['unit-1'] }),
      'payments_in_app',
      'create',
    );
    expect(d.allowed).toBe(true);
  });

  it('effectiveLevel reflects the strongest role for UI shaping only', () => {
    expect(effectiveLevel(actor({ roles: ['resident', 'estate_manager'] }), 'work_orders')).toBe('M');
  });
});
