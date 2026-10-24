import { describe, expect, it } from 'vitest';
import { buildEstateProperties } from '@/domain/estate/properties';
import type { Site, Unit } from '@/domain/entities';
import { asId } from '@/domain/ids';

function site(overrides: Partial<Site> = {}): Site {
  return { id: asId<Site['id']>('estate-a'), tenantId: asId<Site['tenantId']>('tenant-a'), kind: 'estate', name: 'Lekki Gardens', address: 'Lagos, Nigeria', unitCount: 500, buildingCount: 10, ...overrides };
}
function unit(overrides: Partial<Unit> = {}): Unit {
  return { id: asId<Unit['id']>('unit-a'), tenantId: asId<Unit['tenantId']>('tenant-a'), siteId: asId<Site['id']>('estate-a'), buildingId: asId<Unit['buildingId']>('building-a'), label: 'Unit 1', type: 'Apartment', occupancy: 'occupied', ...overrides };
}

describe('buildEstateProperties', () => {
  it('counts enumerated units across every occupancy state, not declared site capacity', () => {
    const result = buildEstateProperties([site()], [unit(), unit({ id: asId<Unit['id']>('vacant'), occupancy: 'vacant' }), unit({ id: asId<Unit['id']>('reserved'), occupancy: 'reserved' }), unit({ id: asId<Unit['id']>('unavailable'), occupancy: 'unavailable' })]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'estate-a', name: 'Lekki Gardens', address: 'Lagos, Nigeria', unitCount: 4, occupiedUnits: 1, vacantUnits: 1, reservedUnits: 1, unavailableUnits: 1, occupancyPct: 25 });
  });

  it('excludes facilities and their units rather than relabelling Facility spaces', () => {
    const facility = site({ id: asId<Site['id']>('facility-a'), kind: 'facility', name: 'Private facility' });
    const result = buildEstateProperties([site(), facility], [unit(), unit({ id: asId<Unit['id']>('facility-unit'), siteId: facility.id, label: 'Private facility unit' })]);
    expect(result.map((property) => property.id)).toEqual(['estate-a']);
    expect(JSON.stringify(result)).not.toContain('Private facility');
  });

  it('never joins a unit by property ID without also matching tenant identity', () => {
    const result = buildEstateProperties([site()], [unit(), unit({ id: asId<Unit['id']>('foreign-unit'), tenantId: asId<Unit['tenantId']>('foreign-tenant'), label: 'FOREIGN_UNIT_SECRET' })]);
    expect(result[0].unitCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain('FOREIGN_UNIT_SECRET');
  });

  it('keeps same-ID properties in different scoped tenants separate', () => {
    const otherTenant = asId<Site['tenantId']>('tenant-b');
    const result = buildEstateProperties([site(), site({ tenantId: otherTenant, name: 'Abuja Heights' })], [unit(), unit({ tenantId: otherTenant, label: 'Abuja unit', occupancy: 'vacant' })]);
    expect(result[0]).toMatchObject({ name: 'Abuja Heights', unitCount: 1, occupiedUnits: 0, vacantUnits: 1 });
    expect(result[0].units[0].label).toBe('Abuja unit');
    expect(result[1]).toMatchObject({ name: 'Lekki Gardens', unitCount: 1, occupiedUnits: 1 });
    expect(result[1].units[0].label).toBe('Unit 1');
  });

  it('returns null occupancy and zero counts when a property has no registered units', () => {
    expect(buildEstateProperties([site()], [])[0]).toMatchObject({ unitCount: 0, occupiedUnits: 0, vacantUnits: 0, reservedUnits: 0, unavailableUnits: 0, occupancyPct: null, units: [], unitTypes: [] });
  });

  it('deduplicates site and unit records without multiplying capacity', () => {
    const result = buildEstateProperties([site(), site()], [unit(), unit()]);
    expect(result).toHaveLength(1);
    expect(result[0].unitCount).toBe(1);
    expect(result[0].units).toHaveLength(1);
    expect(result[0].occupancyPct).toBe(100);
  });

  it('drops orphan units and never creates properties from unit records alone', () => {
    const orphan = unit({ siteId: asId<Site['id']>('unlisted-property'), label: 'ORPHAN_SECRET' });
    expect(buildEstateProperties([], [orphan])).toEqual([]);
    expect(buildEstateProperties([site()], [orphan])[0].unitCount).toBe(0);
  });

  it('sorts property names and unit labels naturally without mutating input ordering', () => {
    const sites = [site({ name: 'Property 10' }), site({ id: asId<Site['id']>('estate-b'), name: 'Property 2' })];
    const units = [unit({ id: asId<Unit['id']>('unit-10'), label: 'Unit 10' }), unit({ label: 'Unit 2' })];
    const result = buildEstateProperties(sites, units);
    expect(result.map((property) => property.name)).toEqual(['Property 2', 'Property 10']);
    expect(result[1].units.map((unit) => unit.label)).toEqual(['Unit 2', 'Unit 10']);
    expect(sites[0].name).toBe('Property 10');
    expect(units[0].label).toBe('Unit 10');
  });

  it('produces unique sorted unit types from registered records', () => {
    const result = buildEstateProperties([site()], [unit(), unit({ id: asId<Unit['id']>('studio'), type: 'Studio' }), unit({ id: asId<Unit['id']>('duplicate-type'), type: 'Apartment' }), unit({ id: asId<Unit['id']>('blank-type'), type: ' ' })]);
    expect(result[0].unitTypes).toEqual(['Apartment', 'Studio']);
  });

  it('uses a strict DTO instead of serializing tenant, building, financial or contact fields', () => {
    const rawSite = { ...site(), contactEmail: 'PRIVATE_CONTACT', revenueMinor: 9_999 };
    const rawUnit = { ...unit(), residentName: 'PRIVATE_PERSON', balanceMinor: 5_000, accessCode: 'PRIVATE_CODE' };
    const result = buildEstateProperties([rawSite], [rawUnit]);
    expect(Object.keys(result[0]).sort()).toEqual(['id', 'name', 'address', 'unitTypes', 'unitCount', 'occupiedUnits', 'vacantUnits', 'reservedUnits', 'unavailableUnits', 'occupancyPct', 'units'].sort());
    expect(Object.keys(result[0].units[0]).sort()).toEqual(['id', 'label', 'type', 'occupancy'].sort());
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|tenantId|buildingId|revenueMinor|balanceMinor/);
  });

  it('does not mutate frozen records and returns independent unit DTOs', () => {
    const rawSite = Object.freeze(site());
    const rawUnit = Object.freeze(unit());
    const sites = Object.freeze([rawSite]);
    const units = Object.freeze([rawUnit]);
    const result = buildEstateProperties(sites, units);
    result[0].units[0].label = 'Edited projection';
    expect(rawUnit.label).toBe('Unit 1');
    expect(rawSite.unitCount).toBe(500);
  });

  it('returns an empty portfolio without inventing sample properties', () => {
    expect(buildEstateProperties([], [])).toEqual([]);
  });
});
