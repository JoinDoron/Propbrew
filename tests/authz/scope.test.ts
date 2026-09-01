import { describe, expect, it } from 'vitest';
import { matchesScope, toWhere } from '@/lib/authz/scope';
import type { ScopeFilter } from '@/lib/authz';

/**
 * `matchesScope` and `toWhere` are meant to be twins: one filters rows in
 * memory, the other compiles to a SQL/Prisma `where`. Nothing compared them,
 * and they diverged on NULL — `matchesScope` lets an estate-less row through,
 * while `estateId: { in: [...] }` excludes NULL in SQL.
 *
 * Construction and Short-Let rows carry no estate BY DESIGN (they span the
 * whole portfolio), so the divergence would have silently emptied the two
 * largest modules on the day persistence landed.
 */
describe('toWhere mirrors matchesScope on estate-less rows', () => {
  const scope: ScopeFilter = { tenantId: 't-a', estateIds: ['s-gardens'], ownership: null };

  it('lets an estate-less row through in memory, and scopes the rest', () => {
    expect(matchesScope({ tenantId: 't-a' }, scope)).toBe(true);
    expect(matchesScope({ tenantId: 't-a', estateId: 's-gardens' }, scope)).toBe(true);
    expect(matchesScope({ tenantId: 't-a', estateId: 's-other' }, scope)).toBe(false);
    expect(matchesScope({ tenantId: 't-b' }, scope)).toBe(false);
  });

  it('expresses that same NULL rule in the compiled where clause', () => {
    const where = toWhere(scope);
    const and = where.AND as { OR: unknown[] }[] | undefined;
    expect(and).toBeDefined();
    const branches = JSON.stringify(and![0].OR);
    expect(branches).toContain('"estateId":null'); // admits estate-less rows
    expect(branches).toContain('s-gardens');       // still constrains the rest
  });

  it('never emits a bare IN that would drop every estate-less row', () => {
    expect(toWhere(scope).estateId).toBeUndefined();
  });

  it('still refuses an empty ownership clause', () => {
    expect(() => toWhere({ tenantId: 't-a', estateIds: 'all', ownership: [] } as ScopeFilter)).toThrow();
  });
});
