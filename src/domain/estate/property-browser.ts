import type { EstatePropertySummary } from './properties';

export type PropertyAvailabilityFilter = 'all' | 'vacant' | 'occupied' | 'reserved' | 'empty';
export type PropertySort = 'name' | 'vacant' | 'occupancy' | 'units';

type BrowserOptions = {
  query: string;
  unitType: string;
  availability: PropertyAvailabilityFilter;
  sort: PropertySort;
};

const names = new Intl.Collator('en-NG', { numeric: true, sensitivity: 'base' });
const normalize = (value: string) => value.toLocaleLowerCase('en-NG');

function byName(left: EstatePropertySummary, right: EstatePropertySummary): number {
  return names.compare(left.name, right.name) || names.compare(left.id, right.id)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function matchesAvailability(property: EstatePropertySummary, availability: PropertyAvailabilityFilter): boolean {
  switch (availability) {
    case 'all': return true;
    case 'vacant': return property.vacantUnits > 0;
    case 'occupied': return property.unitCount > 0 && property.occupiedUnits === property.unitCount;
    case 'reserved': return property.reservedUnits > 0;
    case 'empty': return property.unitCount === 0;
    default: return false;
  }
}

/** Filter an already-authorised DTO snapshot; never expands access or edits it. */
export function filterEstateProperties(properties: readonly EstatePropertySummary[], options: BrowserOptions): EstatePropertySummary[] {
  const query = normalize(options.query.trim());
  const result = properties.filter((property) => {
    if (options.unitType !== 'all' && !property.unitTypes.includes(options.unitType)) return false;
    if (!matchesAvailability(property, options.availability)) return false;
    if (!query) return true;
    return [property.name, property.address, ...property.unitTypes, ...property.units.map((unit) => unit.label)]
      .some((value) => normalize(value).includes(query));
  });

  return result.sort((left, right) => {
    switch (options.sort) {
      case 'vacant': return right.vacantUnits - left.vacantUnits || byName(left, right);
      case 'units': return right.unitCount - left.unitCount || byName(left, right);
      case 'occupancy':
        if (left.occupancyPct === null && right.occupancyPct !== null) return 1;
        if (right.occupancyPct === null && left.occupancyPct !== null) return -1;
        return (right.occupancyPct ?? 0) - (left.occupancyPct ?? 0) || byName(left, right);
      case 'name': default: return byName(left, right);
    }
  });
}

/** Availability describes enumerated unit records, never declared capacity. */
export function propertyAvailability(property: EstatePropertySummary): string {
  if (property.unitCount === 0) return 'No registered units';
  if (property.occupiedUnits === property.unitCount) return 'Fully occupied';
  if (property.occupiedUnits > 0) return 'Part occupied';
  if (property.vacantUnits > 0) return 'Vacant';
  return 'Reserved or unavailable';
}
