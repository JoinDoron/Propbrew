import type { Site, Unit } from '@/domain/entities';
import type { OccupancyStatus } from '@/domain/enums.proposed';

/** Explicit property DTO: no tenant identifiers, contacts, residents or money. */
export type EstatePropertySummary = {
  id: string;
  name: string;
  address: string;
  unitTypes: string[];
  unitCount: number;
  occupiedUnits: number;
  vacantUnits: number;
  reservedUnits: number;
  unavailableUnits: number;
  occupancyPct: number | null;
  units: { id: string; label: string; type: string; occupancy: OccupancyStatus }[];
};

const recordKey = (tenantId: string, id: string) => JSON.stringify([tenantId, id]);
const sortNames = new Intl.Collator('en-NG', { numeric: true, sensitivity: 'base' });

/**
 * Pure projection over already-authorised records, not an authorization gate.
 * Unit coverage reflects enumerated records, never the Site.unitCount estimate.
 */
export function buildEstateProperties(sites: readonly Site[], units: readonly Unit[]): EstatePropertySummary[] {
  const properties = new Map<string, EstatePropertySummary>();
  for (const site of sites) {
    if (site.kind !== 'estate') continue;
    const key = recordKey(site.tenantId, site.id);
    if (properties.has(key)) continue;
    properties.set(key, { id: String(site.id), name: site.name, address: site.address, unitTypes: [], unitCount: 0, occupiedUnits: 0, vacantUnits: 0, reservedUnits: 0, unavailableUnits: 0, occupancyPct: null, units: [] });
  }

  const seenUnits = new Set<string>();
  for (const unit of units) {
    const property = properties.get(recordKey(unit.tenantId, unit.siteId));
    if (!property) continue;
    const key = recordKey(unit.tenantId, unit.id);
    if (seenUnits.has(key)) continue;
    seenUnits.add(key);
    property.units.push({ id: String(unit.id), label: unit.label, type: unit.type, occupancy: unit.occupancy });
    property.unitCount++;
    switch (unit.occupancy) {
      case 'occupied': property.occupiedUnits++; break;
      case 'vacant': property.vacantUnits++; break;
      case 'reserved': property.reservedUnits++; break;
      case 'unavailable': property.unavailableUnits++; break;
    }
  }

  for (const property of properties.values()) {
    property.units.sort((a, b) => sortNames.compare(a.label, b.label) || sortNames.compare(a.id, b.id));
    property.unitTypes = [...new Set(property.units.map((unit) => unit.type.trim()).filter(Boolean))].sort(sortNames.compare);
    property.occupancyPct = property.unitCount > 0 ? Math.round(property.occupiedUnits / property.unitCount * 100) : null;
  }
  return [...properties.values()].sort((a, b) => sortNames.compare(a.name, b.name) || sortNames.compare(a.id, b.id));
}
