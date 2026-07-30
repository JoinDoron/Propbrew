/**
 * Facility Intelligence seed. Tied to the existing sites (Lekki Gardens, Victoria
 * Court) and generator/lift/pump/chiller assets. Late-July 2026. A deliberately
 * lively estate: a degraded chiller, a low water tank, a fuel-hungry generator,
 * an overdue contract, low spare stock, and an active hot-work permit.
 */

import { SEED } from '@/server/identities';
import { money } from '@/domain/primitives';
import type { BuildingSystem, Sensor, Alarm, Generator, MeterReading, Part, Contract, Permit, Incident, AccessPoint, VisitorPass, AccessEvent, SustainabilityTarget, EmissionMonth } from '@/domain/facility/types';

const A = SEED.tenantA;
const G = SEED.estateGardens; // s-gardens
const V = SEED.estateVictoria; // Victoria Court

export const buildingSystems: BuildingSystem[] = [
  { tenantId: A, id: 'bs-1', siteId: G, assetId: 'ast-gen-c', name: 'Generator — Block C (500kVA)', category: 'power', status: 'degraded', detail: 'On load · overheating alarm', lastCheckISO: '2026-07-28T08:40:00Z' },
  { tenantId: A, id: 'bs-2', siteId: G, assetId: 'ast-gen-d', name: 'Generator — Block D (250kVA)', category: 'power', status: 'standby', detail: 'Standby · auto-start armed', lastCheckISO: '2026-07-28T08:40:00Z' },
  { tenantId: A, id: 'bs-3', siteId: G, assetId: 'ast-lift-c1', name: 'Passenger Lift — Block C #1', category: 'vertical_transport', status: 'operational', detail: 'Normal service', lastCheckISO: '2026-07-28T07:10:00Z' },
  { tenantId: A, id: 'bs-4', siteId: G, assetId: 'ast-pump-d', name: 'Water Pump — Block D', category: 'water', status: 'operational', detail: 'Pressurised', lastCheckISO: '2026-07-28T06:00:00Z' },
  { tenantId: A, id: 'bs-5', siteId: V, assetId: 'ast-hvac-v1', name: 'Chiller — Victoria Tower 1', category: 'hvac', status: 'degraded', detail: 'Efficiency down 18% · service due', lastCheckISO: '2026-07-27T15:00:00Z' },
  { tenantId: A, id: 'bs-6', siteId: G, name: 'Fire Alarm Panel — Block C', category: 'safety', status: 'operational', detail: 'All zones healthy', lastCheckISO: '2026-07-28T05:30:00Z' },
  { tenantId: A, id: 'bs-7', siteId: G, assetId: 'ast-gate-1', name: 'Main Gate Barrier', category: 'access', status: 'operational', detail: 'Online', lastCheckISO: '2026-07-28T08:00:00Z' },
  { tenantId: A, id: 'bs-8', siteId: G, name: 'Borehole & Treatment', category: 'water', status: 'operational', detail: 'Treating · tank filling', lastCheckISO: '2026-07-28T04:00:00Z' },
] as unknown as BuildingSystem[];

export const facilitySensors: Sensor[] = [
  { tenantId: A, id: 'sn-1', siteId: G, name: 'Diesel tank — Block C', kind: 'fuel', value: 34, unit: '%', low: 25, drift: 0 },
  { tenantId: A, id: 'sn-2', siteId: G, name: 'Overhead tank — Block C', kind: 'water_tank', value: 38, unit: '%', low: 40, drift: 1 },
  { tenantId: A, id: 'sn-3', siteId: G, name: 'Power source', kind: 'power_source', value: 0, unit: '', text: 'Generator', drift: 0 },
  { tenantId: A, id: 'sn-4', siteId: V, name: 'Plant room temp', kind: 'temperature', value: 34, unit: '°C', high: 38, drift: 1 },
  { tenantId: A, id: 'sn-5', siteId: G, name: 'Estate occupancy', kind: 'occupancy', value: 71, unit: '%', drift: 3 },
] as unknown as Sensor[];

export const facilityAlarms: Alarm[] = [
  { tenantId: A, id: 'al-1', siteId: G, system: 'Generator — Block C', severity: 'critical', message: 'Coolant temperature high — sustained overheating', atISO: '2026-07-28T08:12:00Z', acknowledged: false, assetId: 'ast-gen-c' },
  { tenantId: A, id: 'al-2', siteId: G, system: 'Overhead tank — Block C', severity: 'warning', message: 'Water level below 40% threshold', atISO: '2026-07-28T07:35:00Z', acknowledged: false },
  { tenantId: A, id: 'al-3', siteId: V, system: 'Chiller — Victoria Tower 1', severity: 'warning', message: 'Efficiency degraded 18% vs baseline', atISO: '2026-07-27T15:02:00Z', acknowledged: false, assetId: 'ast-hvac-v1' },
  { tenantId: A, id: 'al-4', siteId: G, system: 'Grid feed', severity: 'info', message: 'Grid power lost — generator took load', atISO: '2026-07-28T06:20:00Z', acknowledged: true },
] as unknown as Alarm[];

export const facilityGenerators: Generator[] = [
  { tenantId: A, id: 'gn-c', siteId: G, assetId: 'ast-gen-c', name: 'Block C generator', capacityKva: 500, status: 'fault', fuelPct: 34, tankLitres: 1000, litresPerHour: 62, baselineLph: 52, runtimeHoursToday: 9, runtimeHoursMonth: 214, lastRefuelISO: '2026-07-24' },
  { tenantId: A, id: 'gn-d', siteId: G, assetId: 'ast-gen-d', name: 'Block D generator', capacityKva: 250, status: 'standby', fuelPct: 78, tankLitres: 600, litresPerHour: 28, baselineLph: 27, runtimeHoursToday: 3, runtimeHoursMonth: 96, lastRefuelISO: '2026-07-26' },
  { tenantId: A, id: 'gn-v', siteId: V, name: 'Victoria generator', capacityKva: 350, status: 'running', fuelPct: 61, tankLitres: 800, litresPerHour: 38, baselineLph: 40, runtimeHoursToday: 7, runtimeHoursMonth: 168, lastRefuelISO: '2026-07-25' },
] as unknown as Generator[];

export const facilityMeters: MeterReading[] = [
  { tenantId: A, id: 'mt-1', siteId: G, kind: 'grid', label: 'Grid meter — Block C', unit: 'kWh', reading: 184200, previous: 182050, atISO: '2026-07-28' },
  { tenantId: A, id: 'mt-2', siteId: G, kind: 'genset', label: 'Genset kWh — Block C', unit: 'kWh', reading: 42800, previous: 41100, atISO: '2026-07-28' },
  { tenantId: A, id: 'mt-3', siteId: G, kind: 'water', label: 'Bulk water — Estate', unit: 'm³', reading: 9120, previous: 8890, atISO: '2026-07-28' },
] as unknown as MeterReading[];

const P = (id: string, name: string, cat: string, sku: string, loc: string, stock: number, reorder: number, used: number, cost: number): Part =>
  ({ tenantId: A, id, name, category: cat, sku, location: loc, stock, reorderPoint: reorder, usedPerMonth: used, unitCost: money(cost * 100, 'NGN') } as unknown as Part);

export const facilityParts: Part[] = [
  P('pt-1', 'AC gas (R410a) — 1kg', 'HVAC', 'HVAC-R410', 'Store A · Shelf 2', 6, 8, 9, 18000),
  P('pt-2', 'Generator oil filter', 'Generator', 'GEN-OF-500', 'Store A · Shelf 1', 4, 6, 5, 12000),
  P('pt-3', 'Diesel fuel filter', 'Generator', 'GEN-FF-500', 'Store A · Shelf 1', 11, 6, 4, 9000),
  P('pt-4', 'Lift door roller', 'Lift', 'LIFT-DR', 'Store B · Bin 4', 3, 2, 1, 26000),
  P('pt-5', 'Water pump seal kit', 'Plumbing', 'PMP-SEAL', 'Store B · Bin 1', 9, 4, 2, 15000),
  P('pt-6', 'LED panel 40W', 'Electrical', 'ELE-LED40', 'Store A · Shelf 5', 42, 20, 18, 4500),
  P('pt-7', 'Fire extinguisher (refill)', 'Safety', 'SAF-EXT', 'Store C', 5, 6, 2, 8000),
] as unknown as Part[];

export const facilityContracts: Contract[] = [
  { tenantId: A, id: 'ct-1', vendorName: 'CoolAir Systems', service: 'HVAC preventive maintenance (AMC)', coversCategory: 'hvac', startISO: '2025-09-01', endISO: '2026-08-31', value: money(240000000, 'NGN'), slaTargetPct: 95, slaActualPct: 91, siteId: V },
  { tenantId: A, id: 'ct-2', vendorName: 'PowerGen Ltd', service: 'Generator servicing & call-out', coversCategory: 'power', startISO: '2026-01-01', endISO: '2026-12-31', value: money(360000000, 'NGN'), slaTargetPct: 98, slaActualPct: 99, siteId: G },
  { tenantId: A, id: 'ct-3', vendorName: 'LiftCare Nigeria', service: 'Lift maintenance & 24/7 rescue', coversCategory: 'vertical_transport', startISO: '2025-08-01', endISO: '2026-08-10', value: money(180000000, 'NGN'), slaTargetPct: 97, slaActualPct: 88, siteId: G },
  { tenantId: A, id: 'ct-4', vendorName: 'SafeGuard Fire', service: 'Fire systems certification', coversCategory: 'safety', startISO: '2025-06-01', endISO: '2026-07-20', value: money(90000000, 'NGN'), slaTargetPct: 100, slaActualPct: 100, siteId: G },
] as unknown as Contract[];

export const facilityPermits: Permit[] = [
  { tenantId: A, id: 'pm-1', ref: 'PTW-3001', type: 'hot_work', location: 'Block C · Plant room', siteId: G, requestedBy: 'Emeka Nwosu', status: 'active', validFromISO: '2026-07-28', validToISO: '2026-07-29', note: 'Welding on generator exhaust bracket' },
  { tenantId: A, id: 'pm-2', ref: 'PTW-3002', type: 'height', location: 'Block C · Rooftop', siteId: G, requestedBy: 'CoolAir Systems', status: 'requested', validFromISO: '2026-07-29', validToISO: '2026-07-30', note: 'Condenser coil clean' },
  { tenantId: A, id: 'pm-3', ref: 'PTW-3003', type: 'electrical', location: 'Block C · Plant room', siteId: G, requestedBy: 'PowerGen Ltd', status: 'active', validFromISO: '2026-07-28', validToISO: '2026-07-29', note: 'ATS panel inspection' },
  { tenantId: A, id: 'pm-4', ref: 'PTW-2990', type: 'confined_space', location: 'Estate · Water treatment', siteId: G, requestedBy: 'AquaPure', status: 'closed', validFromISO: '2026-07-20', validToISO: '2026-07-20', note: 'Tank cleaning' },
] as unknown as Permit[];

export const facilityIncidents: Incident[] = [
  { tenantId: A, id: 'in-1', siteId: G, category: 'Slip / trip', severity: 'minor', location: 'Block C · Lobby', atISO: '2026-07-22', status: 'closed' },
  { tenantId: A, id: 'in-2', siteId: G, category: 'Electrical near-miss', severity: 'near_miss', location: 'Block C · Plant room', atISO: '2026-07-26', status: 'open' },
] as unknown as Incident[];

/* --- access & visitors ---------------------------------------------------- */

export const accessPoints: AccessPoint[] = [
  { tenantId: A, id: 'ap-1', siteId: G, name: 'Main Gate', kind: 'gate', status: 'online', mode: 'secured', batteryPct: 100, lastEventISO: '2026-07-25T21:40:00Z' },
  { tenantId: A, id: 'ap-2', siteId: G, name: 'Block C Lobby', kind: 'door', status: 'online', mode: 'secured', batteryPct: 92, lastEventISO: '2026-07-25T21:12:00Z' },
  { tenantId: A, id: 'ap-3', siteId: G, name: 'Block D Lobby', kind: 'door', status: 'held_open', mode: 'secured', batteryPct: 88, lastEventISO: '2026-07-25T20:05:00Z' },
  { tenantId: A, id: 'ap-4', siteId: G, name: 'Car Park Barrier', kind: 'barrier', status: 'online', mode: 'secured', batteryPct: 74, lastEventISO: '2026-07-25T21:33:00Z' },
  { tenantId: A, id: 'ap-5', siteId: G, name: 'Service Gate', kind: 'gate', status: 'offline', mode: 'secured', batteryPct: 12, lastEventISO: '2026-07-25T14:20:00Z' },
  { tenantId: A, id: 'ap-6', siteId: V, name: 'Victoria Tower Turnstile', kind: 'turnstile', status: 'online', mode: 'secured', batteryPct: 96, lastEventISO: '2026-07-25T19:50:00Z' },
] as unknown as AccessPoint[];

export const visitorPasses: VisitorPass[] = [
  { tenantId: A, id: 'vp-1', code: 'VP-4821', siteId: G, visitorName: 'Ade Balogun', kind: 'guest', hostName: 'Folake Bello', hostUnit: 'Block C · 12B', purpose: 'Family visit', vehiclePlate: 'LAG-221-KJA', status: 'expected', validFromISO: '2026-07-26', validToISO: '2026-07-26' },
  { tenantId: A, id: 'vp-2', code: 'VP-4818', siteId: G, visitorName: 'CoolAir technician', kind: 'contractor', hostName: 'Bola Adeyemi', hostUnit: 'Estate · Facilities', purpose: 'Chiller service', vehiclePlate: 'LAG-904-CAS', status: 'checked_in', validFromISO: '2026-07-25', validToISO: '2026-07-26', checkedInISO: '2026-07-25T18:30:00Z' },
  { tenantId: A, id: 'vp-3', code: 'VP-4805', siteId: G, visitorName: 'Chuka Eze', kind: 'guest', hostName: 'Tobi Ade', hostUnit: 'Block C · 09A', purpose: 'Overnight guest', status: 'checked_in', validFromISO: '2026-07-24', validToISO: '2026-07-25', checkedInISO: '2026-07-24T19:10:00Z' },
  { tenantId: A, id: 'vp-4', code: 'VP-4823', siteId: G, visitorName: 'Jumia delivery', kind: 'delivery', hostName: 'Kemi Adeyinka', hostUnit: 'Block C · 03B', purpose: 'Parcel drop-off', status: 'expected', validFromISO: '2026-07-26', validToISO: '2026-07-26' },
  { tenantId: A, id: 'vp-5', code: 'VP-4799', siteId: G, visitorName: 'Grace Umeh', kind: 'guest', hostName: 'David Okon', hostUnit: 'Block D · 07B', purpose: 'Day visit', status: 'checked_out', validFromISO: '2026-07-24', validToISO: '2026-07-24', checkedInISO: '2026-07-24T11:00:00Z', checkedOutISO: '2026-07-24T17:20:00Z' },
  { tenantId: A, id: 'vp-6', code: 'VP-4820', siteId: G, visitorName: 'Unknown caller', kind: 'guest', hostName: '—', hostUnit: 'No match', purpose: 'No host confirmation', status: 'denied', validFromISO: '2026-07-26', validToISO: '2026-07-26' },
  { tenantId: A, id: 'vp-7', code: 'VP-4824', siteId: G, visitorName: 'Bolt ride (Musa K.)', kind: 'ride_hail', hostName: 'Yusuf Bello', hostUnit: 'Block C · 11C', purpose: 'Pickup', vehiclePlate: 'LAG-771-BLT', status: 'expected', validFromISO: '2026-07-26', validToISO: '2026-07-26' },
] as unknown as VisitorPass[];

export const accessEvents: AccessEvent[] = [
  { tenantId: A, id: 'ae-1', siteId: G, pointName: 'Main Gate', atISO: '2026-07-25T21:40:00Z', kind: 'entry', subjectName: 'CoolAir technician', credential: 'pass', passCode: 'VP-4818' },
  { tenantId: A, id: 'ae-2', siteId: G, pointName: 'Main Gate', atISO: '2026-07-25T21:33:00Z', kind: 'denied', subjectName: 'Unknown caller', credential: 'manual', passCode: 'VP-4820' },
  { tenantId: A, id: 'ae-3', siteId: G, pointName: 'Block C Lobby', atISO: '2026-07-25T21:12:00Z', kind: 'entry', subjectName: 'Folake Bello', credential: 'fob' },
  { tenantId: A, id: 'ae-4', siteId: G, pointName: 'Block D Lobby', atISO: '2026-07-25T20:05:00Z', kind: 'held', subjectName: 'Door sensor', credential: 'manual' },
  { tenantId: A, id: 'ae-5', siteId: G, pointName: 'Car Park Barrier', atISO: '2026-07-25T19:58:00Z', kind: 'entry', subjectName: 'LAG-904-CAS', credential: 'plate' },
  { tenantId: A, id: 'ae-6', siteId: V, pointName: 'Victoria Tower Turnstile', atISO: '2026-07-25T19:50:00Z', kind: 'exit', subjectName: 'Chidi Okonkwo', credential: 'fob' },
  { tenantId: A, id: 'ae-7', siteId: G, pointName: 'Service Gate', atISO: '2026-07-25T14:20:00Z', kind: 'forced', subjectName: 'Tamper alert', credential: 'manual' },
] as unknown as AccessEvent[];

/* --- sustainability & ESG ------------------------------------------------- */

export const sustainabilityTargets: SustainabilityTarget[] = [
  { tenantId: A, id: 'st-carbon', metric: 'carbon', label: 'Cut diesel carbon', unit: 'kg CO₂/mo', baselineValue: 12000, currentValue: 9800, targetValue: 7000, dueISO: '2026-12-31' },
  { tenantId: A, id: 'st-genset', metric: 'genset_reliance', label: 'Reduce genset reliance', unit: '%', baselineValue: 45, currentValue: 30, targetValue: 20, dueISO: '2026-12-31' },
  { tenantId: A, id: 'st-water', metric: 'water', label: 'Lower water draw', unit: 'm³/mo', baselineValue: 260, currentValue: 230, targetValue: 200, dueISO: '2026-10-31' },
] as unknown as SustainabilityTarget[];

// Diesel litres/month track the live generator burn (~22,340 L in Jul from the
// generator run-hours), trending down ~16% over 6 months. gensetKwh = litres ×
// 3.5 (genset yield); gridKwh sized so the energy mix ≈ the 78% grid share.
export const emissionMonths: EmissionMonth[] = [
  { tenantId: A, id: 'em-1', monthLabel: 'Feb', dieselLitres: 26800, gridKwh: 332600, gensetKwh: 93800, waterM3: 258 },
  { tenantId: A, id: 'em-2', monthLabel: 'Mar', dieselLitres: 25900, gridKwh: 321400, gensetKwh: 90650, waterM3: 251 },
  { tenantId: A, id: 'em-3', monthLabel: 'Apr', dieselLitres: 24800, gridKwh: 307800, gensetKwh: 86800, waterM3: 244 },
  { tenantId: A, id: 'em-4', monthLabel: 'May', dieselLitres: 24100, gridKwh: 299100, gensetKwh: 84350, waterM3: 239 },
  { tenantId: A, id: 'em-5', monthLabel: 'Jun', dieselLitres: 23200, gridKwh: 287900, gensetKwh: 81200, waterM3: 234 },
  { tenantId: A, id: 'em-6', monthLabel: 'Jul', dieselLitres: 22340, gridKwh: 277200, gensetKwh: 78190, waterM3: 230 },
] as unknown as EmissionMonth[];
