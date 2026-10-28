import { describe, expect, it } from 'vitest';
import { ForbiddenError, type Actor } from '@/lib/authz';
import { repos } from '@/server/data';
import { identityByKey, SEED } from '@/server/identities';
import type { Page } from '@/domain/primitives';
import type { Site, Unit } from '@/domain/entities';

function actor(key: string, overrides: Partial<Actor> = {}): Actor {
  return { ...identityByKey(key).actor, ...overrides };
}

function collect<T>(read: (cursor?: string | null) => Page<T>): T[] {
  const rows: T[] = [];
  let cursor: string | null | undefined;
  do {
    const page = read(cursor);
    rows.push(...page.items);
    cursor = page.cursor;
  } while (cursor !== null);
  return rows;
}

describe('Estate overview property and unit repositories', () => {
  it('returns only the assigned Gardens estate, never same-tenant Victoria or foreign Ikoyi', () => {
    const person = actor('estate_manager');
    const sites = repos.sites.list(person);
    expect(sites.total).toBe(1);
    expect(sites.items.map((site) => site.id)).toEqual([SEED.estateGardens]);
    expect(repos.sites.all(person)).toEqual(sites.items);

    const units = repos.units.list(person);
    expect(units.total).toBe(10);
    expect(units.items.every((unit) => unit.tenantId === SEED.tenantA && unit.siteId === SEED.estateGardens)).toBe(true);
    expect(units.items.some((unit) => unit.siteId === SEED.estateVictoria || unit.siteId === SEED.estateIkoyi)).toBe(false);
  });

  it('preserves both Gardens and Victoria for their assigned facility manager', () => {
    const person = actor('facility_manager');
    const sites = repos.sites.list(person);
    expect(sites.items.map((site) => site.id)).toEqual([SEED.estateGardens, SEED.estateVictoria]);
    expect(sites.total).toBe(2);
    expect(repos.sites.all(person)).toEqual(sites.items);

    const units = repos.units.list(person);
    expect(units.total).toBe(13);
    expect(new Set(units.items.map((unit) => unit.siteId))).toEqual(new Set([SEED.estateGardens, SEED.estateVictoria]));
    expect(units.items.every((unit) => unit.tenantId === SEED.tenantA)).toBe(true);
  });

  it('allows an executive every site in its own tenant, not another tenant', () => {
    const person = actor('executive');
    expect(person.allEstates).toBe(true);
    expect(person.estateIds).toEqual([]);
    expect(repos.sites.list(person).items.map((site) => site.id)).toEqual([SEED.estateGardens, 's-eko-pearl', 's-abuja-green', SEED.estateVictoria]);
    const units = repos.units.list(person);
    expect(units.total).toBe(21);
    expect(units.items.every((unit) => unit.tenantId === SEED.tenantA)).toBe(true);
    expect(units.items.some((unit) => unit.siteId === SEED.estateIkoyi)).toBe(false);
  });

  it('denies security access instead of exposing property or occupancy metadata', () => {
    const person = actor('security');
    expect(() => repos.sites.list(person)).toThrow(ForbiddenError);
    expect(() => repos.sites.all(person)).toThrow(ForbiddenError);
    expect(() => repos.units.list(person)).toThrow(ForbiddenError);
  });

  it.each(['estate_manager', 'facility_manager', 'technician'])('returns no entries for an unassigned %s', (key) => {
    const person = actor(key, { estateIds: [], allEstates: false });
    expect(repos.sites.list(person)).toEqual({ items: [], total: 0, cursor: null });
    expect(repos.sites.all(person)).toEqual([]);
    expect(repos.units.list(person)).toEqual({ items: [], total: 0, cursor: null });
  });

  it('never treats an assignment to an unknown or foreign estate as unrestricted', () => {
    for (const estateId of ['', 'unknown-estate', SEED.estateIkoyi]) {
      const person = actor('estate_manager', { estateIds: [estateId], allEstates: false });
      expect(repos.sites.list(person).items).toEqual([]);
      expect(repos.sites.all(person)).toEqual([]);
      expect(repos.units.list(person).items).toEqual([]);
    }
  });

  it.each([null, ''])('denies an operator without tenant context (%s)', (tenantId) => {
    const person = actor('estate_manager', { tenantId });
    expect(() => repos.sites.list(person)).toThrow(ForbiddenError);
    expect(() => repos.sites.all(person)).toThrow(ForbiddenError);
    expect(() => repos.units.list(person)).toThrow(ForbiddenError);
  });

  it('scopes before site pagination and keeps total/cursor accurate across pages', () => {
    const person = actor('facility_manager');
    const first = repos.sites.list(person, { limit: 1 });
    const second = repos.sites.list(person, { limit: 1, cursor: first.cursor });
    expect(first).toMatchObject({ total: 2, cursor: '1' });
    expect(first.items.map((site) => site.id)).toEqual([SEED.estateGardens]);
    expect(second).toMatchObject({ total: 2, cursor: null });
    expect(second.items.map((site) => site.id)).toEqual([SEED.estateVictoria]);

    const assigned = actor('estate_manager');
    expect(repos.sites.list(assigned, { limit: 1 })).toMatchObject({ total: 1, cursor: null });
  });

  it('paginates every scoped unit without duplicate, missing or foreign rows', () => {
    const person = actor('estate_manager');
    const first = repos.units.list(person, { limit: 3 });
    expect(first).toMatchObject({ total: 10, cursor: '3' });
    expect(first.items).toHaveLength(3);
    const all = collect((cursor) => repos.units.list(person, { limit: 3, cursor }));
    expect(all).toHaveLength(10);
    expect(new Set(all.map((unit) => unit.id)).size).toBe(10);
    expect(all.every((unit) => unit.tenantId === SEED.tenantA && unit.siteId === SEED.estateGardens)).toBe(true);
    expect(repos.units.list(person, { limit: 3, cursor: '9' })).toMatchObject({ total: 10, cursor: null });
  });

  it('keeps adapter-only scope columns out of returned Site and Unit records', () => {
    const sites: Page<Site> = repos.sites.list(actor('estate_manager'));
    const units: Page<Unit> = repos.units.list(actor('estate_manager'));
    for (const site of sites.items) {
      expect(site).not.toHaveProperty('siteId');
      expect(site).not.toHaveProperty('site');
      expect(site).toMatchObject({ id: SEED.estateGardens, name: 'Lekki Gardens Estate', kind: 'estate' });
    }
    for (const unit of units.items) {
      expect(unit).not.toHaveProperty('unitId');
      expect(unit).not.toHaveProperty('unit');
      expect(unit).toMatchObject({ siteId: SEED.estateGardens, tenantId: SEED.tenantA });
    }
  });

  it('does not mutate the actor or widen its estate assignment while enumerating pages', () => {
    const person = actor('estate_manager');
    Object.freeze(person.estateIds);
    Object.freeze(person.roles);
    Object.freeze(person);
    const original = structuredClone(person);
    collect((cursor) => repos.sites.list(person, { limit: 1, cursor }));
    collect((cursor) => repos.units.list(person, { limit: 2, cursor }));
    repos.sites.all(person);
    expect(person).toEqual(original);
  });
});
