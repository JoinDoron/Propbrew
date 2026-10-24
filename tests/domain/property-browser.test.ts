import { describe, expect, it } from 'vitest';
import type { EstatePropertySummary } from '@/domain/estate/properties';
import {
  filterEstateProperties, propertyAvailability,
  type PropertyAvailabilityFilter, type PropertySort,
} from '@/domain/estate/property-browser';
import type { OccupancyStatus } from '@/domain/enums.proposed';

function property(id: string, name: string, occupancies: OccupancyStatus[], overrides: Partial<EstatePropertySummary> = {}): EstatePropertySummary {
  const occupiedUnits = occupancies.filter((status) => status === 'occupied').length;
  return {
    id, name, address: '14 Example Road, Lagos', unitTypes: occupancies.length ? ['Apartment'] : [],
    unitCount: occupancies.length, occupiedUnits,
    vacantUnits: occupancies.filter((status) => status === 'vacant').length,
    reservedUnits: occupancies.filter((status) => status === 'reserved').length,
    unavailableUnits: occupancies.filter((status) => status === 'unavailable').length,
    occupancyPct: occupancies.length ? Math.round(occupiedUnits / occupancies.length * 100) : null,
    units: occupancies.map((occupancy, index) => ({ id: `${id}-unit-${index + 1}`, label: `Unit ${index + 1}`, type: 'Apartment', occupancy })),
    ...overrides,
  };
}

function fixtures() {
  return [
    property('marina', 'Marina Court 10', ['occupied', 'vacant'], {
      unitTypes: ['Apartment', 'Studio'],
      units: [
        { id: 'marina-unit-1', label: 'Penthouse 7', type: 'Apartment', occupancy: 'occupied' },
        { id: 'marina-unit-2', label: 'Garden studio', type: 'Studio', occupancy: 'vacant' },
      ],
    }),
    property('palm', 'Palm Court 2', ['occupied', 'occupied'], { address: '6 Example Avenue, Abuja' }),
    property('orchid', 'Orchid Gardens', ['reserved', 'reserved', 'unavailable'], { unitTypes: ['Terrace house'] }),
    property('empty', 'Empty plot', []),
    property('maple', 'Maple Lodge', ['vacant', 'vacant', 'vacant'], { unitTypes: ['Studio'] }),
  ];
}

const options = { query: '', unitType: 'all', availability: 'all' as PropertyAvailabilityFilter, sort: 'name' as PropertySort };
const ids = (properties: readonly EstatePropertySummary[]) => properties.map((row) => row.id);

describe('Estate property search and filters', () => {
  it('treats an empty or whitespace-only query as no search filter', () => {
    const rows = fixtures();
    const expected = ['empty', 'maple', 'marina', 'orchid', 'palm'];
    expect(ids(filterEstateProperties(rows, options))).toEqual(expected);
    expect(ids(filterEstateProperties(rows, { ...options, query: '  \n  ' }))).toEqual(expected);
  });

  it.each([
    [' MARINA COURT ', ['marina']],
    ['abuja', ['palm']],
    ['PENTHOUSE 7', ['marina']],
    ['garden studio', ['marina']],
    ['terrace HOUSE', ['orchid']],
    ['sTuDiO', ['maple', 'marina']],
  ])('searches names, addresses, mixed unit types and unit labels for %s', (query, expected) => {
    expect(ids(filterEstateProperties(fixtures(), { ...options, query }))).toEqual(expected);
  });

  it('does not invent a match when none of the allowed metadata contains the query', () => {
    expect(filterEstateProperties(fixtures(), { ...options, query: 'Never Registered Place' })).toEqual([]);
    expect(filterEstateProperties([], options)).toEqual([]);
  });

  it('matches unit types exactly, including a property containing multiple types', () => {
    expect(ids(filterEstateProperties(fixtures(), { ...options, unitType: 'Studio' }))).toEqual(['maple', 'marina']);
    expect(ids(filterEstateProperties(fixtures(), { ...options, unitType: 'Apartment' }))).toEqual(['marina', 'palm']);
    expect(filterEstateProperties(fixtures(), { ...options, unitType: 'apartment' })).toEqual([]);
    expect(filterEstateProperties(fixtures(), { ...options, unitType: 'Unknown type' })).toEqual([]);
  });

  it.each([
    ['all', ['empty', 'maple', 'marina', 'orchid', 'palm']],
    ['vacant', ['maple', 'marina']],
    ['occupied', ['palm']],
    ['reserved', ['orchid']],
    ['empty', ['empty']],
  ] as [PropertyAvailabilityFilter, string[]][])('applies the %s availability predicate', (availability, expected) => {
    expect(ids(filterEstateProperties(fixtures(), { ...options, availability }))).toEqual(expected);
  });

  it('combines query, unit type and availability with AND semantics', () => {
    expect(ids(filterEstateProperties(fixtures(), { ...options, query: 'Penthouse', unitType: 'Studio', availability: 'vacant' }))).toEqual(['marina']);
    expect(ids(filterEstateProperties(fixtures(), { ...options, query: 'ABUJA', unitType: 'Apartment', availability: 'occupied' }))).toEqual(['palm']);
    expect(filterEstateProperties(fixtures(), { ...options, query: 'ABUJA', unitType: 'Studio', availability: 'occupied' })).toEqual([]);
    expect(filterEstateProperties(fixtures(), { ...options, query: 'Penthouse', unitType: 'Studio', availability: 'occupied' })).toEqual([]);
  });

  it('does not classify an empty property as fully occupied or its reserved units as vacant', () => {
    const rows = [property('empty', 'Empty', []), property('reserved', 'Reserved', ['reserved']), property('unavailable', 'Unavailable', ['unavailable'])];
    expect(filterEstateProperties(rows, { ...options, availability: 'occupied' })).toEqual([]);
    expect(filterEstateProperties(rows, { ...options, availability: 'vacant' })).toEqual([]);
    expect(ids(filterEstateProperties(rows, { ...options, availability: 'reserved' }))).toEqual(['reserved']);
    expect(ids(filterEstateProperties(rows, { ...options, availability: 'empty' }))).toEqual(['empty']);
  });
});

describe('Estate property sorting', () => {
  it('sorts names naturally, placing Court 2 before Court 10', () => {
    const rows = [property('10', 'Court 10', []), property('2', 'Court 2', []), property('1', 'Court 1', [])];
    expect(ids(filterEstateProperties(rows, options))).toEqual(['1', '2', '10']);
  });

  it('uses property ID as a deterministic name tie-breaker, independent of input order', () => {
    const rows = [property('property-10', 'PALM COURT', []), property('property-2', 'Palm Court', [])];
    expect(ids(filterEstateProperties(rows, options))).toEqual(['property-2', 'property-10']);
    expect(ids(filterEstateProperties([...rows].reverse(), options))).toEqual(['property-2', 'property-10']);
  });

  it('sorts vacant-unit counts descending with a name fallback', () => {
    expect(ids(filterEstateProperties(fixtures(), { ...options, sort: 'vacant' }))).toEqual(['maple', 'marina', 'empty', 'orchid', 'palm']);
  });

  it('sorts registered-unit counts descending with a natural name fallback', () => {
    expect(ids(filterEstateProperties(fixtures(), { ...options, sort: 'units' }))).toEqual(['maple', 'orchid', 'marina', 'palm', 'empty']);
  });

  it('sorts occupancy descending and places null after zero, not alongside it', () => {
    expect(ids(filterEstateProperties(fixtures(), { ...options, sort: 'occupancy' }))).toEqual(['palm', 'marina', 'maple', 'orchid', 'empty']);
  });

  it('uses names and IDs to order equal occupancy and null values stably', () => {
    const rows = [
      property('null-2', 'No units 2', []), property('null-1', 'No units 1', []),
      property('equal-2', 'Alpha', ['occupied']), property('equal-1', 'Alpha', ['occupied']),
    ];
    const expected = ['equal-1', 'equal-2', 'null-1', 'null-2'];
    expect(ids(filterEstateProperties(rows, { ...options, sort: 'occupancy' }))).toEqual(expected);
    expect(ids(filterEstateProperties([...rows].reverse(), { ...options, sort: 'occupancy' }))).toEqual(expected);
  });

  it('never mutates the original array, summaries, unit types or unit records', () => {
    const rows = fixtures();
    const original = structuredClone(rows);
    for (const row of rows) {
      row.units.forEach(Object.freeze);
      Object.freeze(row.units);
      Object.freeze(row.unitTypes);
      Object.freeze(row);
    }
    Object.freeze(rows);
    for (const sort of ['name', 'vacant', 'occupancy', 'units'] as const) {
      const result = filterEstateProperties(rows, { ...options, sort });
      expect(result).not.toBe(rows);
      expect(result).toHaveLength(rows.length);
      result.forEach((row) => expect(rows.includes(row)).toBe(true));
      rows.forEach(propertyAvailability);
    }
    expect(rows).toEqual(original);
  });
});

describe('property availability labels', () => {
  it.each([
    [[], 'No registered units'],
    [['occupied'], 'Fully occupied'],
    [['occupied', 'occupied'], 'Fully occupied'],
    [['occupied', 'vacant'], 'Part occupied'],
    [['occupied', 'reserved'], 'Part occupied'],
    [['occupied', 'unavailable'], 'Part occupied'],
    [['vacant'], 'Vacant'],
    [['vacant', 'reserved'], 'Vacant'],
    [['reserved'], 'Reserved or unavailable'],
    [['unavailable'], 'Reserved or unavailable'],
    [['reserved', 'unavailable'], 'Reserved or unavailable'],
  ] as [OccupancyStatus[], string][])('describes %j as %s', (occupancies, expected) => {
    expect(propertyAvailability(property('example', 'Example', occupancies))).toBe(expected);
  });
});
