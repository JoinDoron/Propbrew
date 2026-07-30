/**
 * Facility Intelligence — domain types for the new FM surfaces (no framework
 * imports). Built on the existing sites/assets: a live control center, energy &
 * generator intelligence (Nigeria-first — diesel is the dominant cost), spare-
 * parts inventory, service contracts/SLAs, and safety permits.
 */

import type { Money } from '@/domain/primitives';
import type { TenantScoped } from '@/domain/tenancy';

/* --- control center ------------------------------------------------------- */

export type SystemCategory = 'power' | 'vertical_transport' | 'water' | 'hvac' | 'safety' | 'access';
export type SystemStatus = 'operational' | 'degraded' | 'down' | 'standby';

export type BuildingSystem = TenantScoped & {
  id: string; siteId: string; assetId?: string;
  name: string; category: SystemCategory; status: SystemStatus;
  detail: string; lastCheckISO: string;
};

export type SensorKind = 'water_tank' | 'temperature' | 'power_source' | 'fuel' | 'occupancy';
export type Sensor = TenantScoped & {
  id: string; siteId: string; name: string; kind: SensorKind;
  value: number; unit: string; low?: number; high?: number; drift?: number; text?: string;
};

export type AlarmSeverity = 'critical' | 'warning' | 'info';
export type Alarm = TenantScoped & {
  id: string; siteId: string; system: string; severity: AlarmSeverity; message: string; atISO: string;
  acknowledged: boolean; assetId?: string; woRef?: string;
};

/* --- energy & utilities --------------------------------------------------- */

export type GenStatus = 'running' | 'standby' | 'fault';
export type Generator = TenantScoped & {
  id: string; siteId: string; assetId?: string; name: string; capacityKva: number;
  status: GenStatus; fuelPct: number; tankLitres: number; litresPerHour: number; baselineLph: number;
  runtimeHoursToday: number; runtimeHoursMonth: number; lastRefuelISO: string;
};

export type MeterKind = 'grid' | 'genset' | 'water';
export type MeterReading = TenantScoped & {
  id: string; siteId: string; kind: MeterKind; label: string; unit: string; reading: number; previous: number; atISO: string;
};

/* --- inventory ------------------------------------------------------------ */

export type Part = TenantScoped & {
  id: string; name: string; category: string; sku: string; location: string;
  stock: number; reorderPoint: number; usedPerMonth: number; unitCost: Money;
};

/* --- contracts & SLAs ----------------------------------------------------- */

export type ContractStatus = 'active' | 'expiring' | 'expired';
export type Contract = TenantScoped & {
  id: string; vendorName: string; service: string; coversCategory: SystemCategory | 'general';
  startISO: string; endISO: string; value: Money; slaTargetPct: number; slaActualPct: number; siteId: string;
};

/* --- safety & permits ----------------------------------------------------- */

export type PermitType = 'hot_work' | 'height' | 'electrical' | 'confined_space';
export type PermitStatus = 'requested' | 'active' | 'closed';
export type Permit = TenantScoped & {
  id: string; ref: string; type: PermitType; location: string; siteId: string;
  requestedBy: string; status: PermitStatus; validFromISO: string; validToISO: string; note: string;
};

export type IncidentSeverity = 'near_miss' | 'minor' | 'major';
export type Incident = TenantScoped & {
  id: string; siteId: string; category: string; severity: IncidentSeverity; location: string; atISO: string; status: 'open' | 'closed';
};
