/**
 * Deterministic seed world. TWO tenants — a single-tenant fixture cannot
 * demonstrate §8.2 isolation, which is release-blocking. Tenant A (Lekki) is the
 * rich demo world; Tenant B (Ikoyi) exists mainly so cross-tenant tests have a
 * foreign tenant a Lekki actor must never see.
 *
 * The ids match src/server/identities.ts so the dev actors' scope lines up with
 * these rows. Money is integer minor units (kobo), NGN.
 */

import { SEED } from '@/server/identities';
import { money, type Money } from '@/domain/primitives';
import type {
  Announcement,
  Asset,
  Booking,
  Building,
  Invoice,
  PpmPlan,
  Resident,
  Site,
  SosEvent,
  Unit,
  User,
  Vendor,
  WorkOrder,
} from '@/domain/entities';

const A = SEED.tenantA;
const B = SEED.tenantB;
const ngn = (major: number): Money => money(Math.round(major * 100), 'NGN');
const now = '2026-07-26T09:00:00Z';

// A tiny audit stub so Auditable entities typecheck; the real values come from
// the backend later.
const audit = { createdAt: now, createdBy: 'user-seed' as never, updatedAt: now, updatedBy: 'user-seed' as never };

export const sites = [
  { tenantId: A, id: SEED.estateGardens, kind: 'estate', name: 'Lekki Gardens Estate', address: 'Lekki Phase 1, Lagos', buildingCount: 6, unitCount: 240 },
  { tenantId: A, id: SEED.estateVictoria, kind: 'facility', name: 'Victoria Court', address: 'Victoria Island, Lagos', buildingCount: 2, unitCount: 48 },
  { tenantId: B, id: SEED.estateIkoyi, kind: 'estate', name: 'Ikoyi Heights', address: 'Ikoyi, Lagos', buildingCount: 4, unitCount: 120 },
] as unknown as Site[];

export const buildings = [
  { tenantId: A, id: 'b-gardens-c', siteId: SEED.estateGardens, name: 'Block C', floors: 8 },
  { tenantId: A, id: 'b-gardens-d', siteId: SEED.estateGardens, name: 'Block D', floors: 8 },
  { tenantId: A, id: 'b-victoria-1', siteId: SEED.estateVictoria, name: 'Tower 1', floors: 12 },
] as unknown as Building[];

export const units = [
  { tenantId: A, id: SEED.unitRes, siteId: SEED.estateGardens, buildingId: 'b-gardens-c', label: 'Block C · 12B', type: '3-bed apartment', occupancy: 'occupied' },
  { tenantId: A, id: 'u-c09a', siteId: SEED.estateGardens, buildingId: 'b-gardens-c', label: 'Block C · 09A', type: '2-bed apartment', occupancy: 'occupied' },
  { tenantId: A, id: 'u-d04c', siteId: SEED.estateGardens, buildingId: 'b-gardens-d', label: 'Block D · 04C', type: '3-bed apartment', occupancy: 'vacant' },
  { tenantId: B, id: 'u-ikoyi-1', siteId: SEED.estateIkoyi, buildingId: 'b-ikoyi', label: 'Tower A · 21', type: 'Penthouse', occupancy: 'occupied' },
] as unknown as Unit[];

export const users = [
  { tenantId: A, id: 'user-estate_manager', name: 'Ngozi Okafor', email: 'ngozi@lekkigardens.ng', roles: ['estate_manager'], estateIds: [SEED.estateGardens], allEstates: false, status: 'active', lastActive: 'now' },
  { tenantId: A, id: 'user-facility_manager', name: 'Bola Adeyemi', email: 'bola@lekkigardens.ng', roles: ['facility_manager'], estateIds: [SEED.estateGardens, SEED.estateVictoria], allEstates: false, status: 'active', lastActive: '12m ago' },
  { tenantId: A, id: 'user-technician', name: 'Emeka Nwosu', email: 'emeka@lekkigardens.ng', roles: ['technician'], estateIds: [SEED.estateGardens], allEstates: false, status: 'active', lastActive: '3m ago' },
  { tenantId: A, id: 'user-resident', name: 'Folake Bello', email: 'folake@gmail.com', roles: ['resident'], estateIds: [], allEstates: true, status: 'active', lastActive: '1h ago' },
  { tenantId: A, id: 'user-security', name: 'Musa Ibrahim', email: 'musa@lekkigardens.ng', roles: ['security'], estateIds: [SEED.estateGardens], allEstates: false, status: 'active', lastActive: 'now' },
  { tenantId: A, id: 'user-executive', name: 'Chidi Okonkwo', email: 'chidi@7fifteen.ng', roles: ['executive'], estateIds: [], allEstates: true, status: 'active', lastActive: '2h ago' },
  { tenantId: B, id: 'user-ikoyi-mgr', name: 'Zainab Yusuf', email: 'zainab@ikoyiheights.ng', roles: ['estate_manager'], estateIds: [SEED.estateIkoyi], allEstates: false, status: 'active', lastActive: '5h ago' },
] as unknown as User[];

export const residents = [
  { tenantId: A, id: 'res-folake', userId: 'user-resident', name: 'Folake Bello', unitId: SEED.unitRes, siteId: SEED.estateGardens, status: 'active', household: 4, balance: ngn(85000), moveInDate: '2024-03-01' },
  { tenantId: A, id: 'res-tobi', userId: 'user-tobi', name: 'Tobi Ade', unitId: 'u-c09a', siteId: SEED.estateGardens, status: 'active', household: 2, balance: ngn(0), moveInDate: '2023-11-15' },
  { tenantId: A, id: 'res-amina', userId: 'user-amina', name: 'Amina Sule', unitId: 'u-d04c', siteId: SEED.estateGardens, status: 'invited', household: 1, balance: ngn(0), moveInDate: '2026-08-01' },
  { tenantId: B, id: 'res-ikoyi', userId: 'user-ikoyi-res', name: 'Kunle Bakare', unitId: 'u-ikoyi-1', siteId: SEED.estateIkoyi, status: 'active', household: 3, balance: ngn(120000), moveInDate: '2025-01-10' },
] as unknown as Resident[];

export const vendors = [
  { tenantId: A, id: SEED.vendorOrg, name: 'Brightworks Facilities', services: ['HVAC', 'Electrical', 'Plumbing'], coverage: 'Lagos Mainland & Island', compliance: 'valid', insuranceExpiry: '2027-03-31', jobsCompleted: 142, slaHitRate: 96, rating: 4.8 },
  { tenantId: A, id: 'v-coolair', name: 'CoolAir Nigeria', services: ['HVAC', 'Refrigeration'], coverage: 'Lagos Island', compliance: 'expiring', insuranceExpiry: '2026-08-20', jobsCompleted: 57, slaHitRate: 88, rating: 4.1 },
  { tenantId: A, id: 'v-securenet', name: 'SecureNet Systems', services: ['CCTV', 'Access Control'], coverage: 'Lekki corridor', compliance: 'expired', insuranceExpiry: '2026-06-30', jobsCompleted: 31, slaHitRate: 82, rating: 3.6 },
  { tenantId: B, id: 'v-ikoyi', name: 'Ikoyi Maintenance Co', services: ['Plumbing'], coverage: 'Ikoyi', compliance: 'valid', insuranceExpiry: '2027-01-01', jobsCompleted: 20, slaHitRate: 90, rating: 4.0 },
] as unknown as Vendor[];

export const assets = [
  { tenantId: A, ...audit, id: 'ast-gen-c', name: 'Generator — Block C (500kVA)', category: 'Power', serial: 'GEN-500-0091', siteId: SEED.estateGardens, buildingId: 'b-gardens-c', locationLabel: 'Block C · Plant room', status: 'operational', purchaseDate: '2022-05-10', warrantyExpiry: '2027-05-10', photos: [], archivedAt: null },
  { tenantId: A, ...audit, id: 'ast-lift-c1', name: 'Passenger Lift — Block C #1', category: 'Elevators', serial: 'LFT-OTIS-2231', siteId: SEED.estateGardens, buildingId: 'b-gardens-c', locationLabel: 'Block C · Core', status: 'degraded', purchaseDate: '2021-02-01', warrantyExpiry: '2026-02-01', photos: [], archivedAt: null },
  { tenantId: A, ...audit, id: 'ast-hvac-v1', name: 'Chiller — Victoria Tower 1', category: 'HVAC', serial: 'CHL-2200-0043', siteId: SEED.estateVictoria, buildingId: 'b-victoria-1', locationLabel: 'Tower 1 · Rooftop', status: 'under_maintenance', purchaseDate: '2023-08-15', warrantyExpiry: '2028-08-15', photos: [], archivedAt: null },
  { tenantId: A, ...audit, id: 'ast-pump-d', name: 'Water Pump — Block D', category: 'Plumbing', serial: 'PMP-GRUND-7781', siteId: SEED.estateGardens, buildingId: 'b-gardens-d', locationLabel: 'Block D · Basement', status: 'out_of_service', purchaseDate: '2020-01-20', warrantyExpiry: '2025-01-20', photos: [], archivedAt: null },
  { tenantId: A, ...audit, id: 'ast-gate-1', name: 'Main Gate Barrier', category: 'Access', serial: 'GTE-CAME-1120', siteId: SEED.estateGardens, locationLabel: 'Estate · Main entrance', status: 'operational', purchaseDate: '2023-03-01', warrantyExpiry: '2026-03-01', photos: [], archivedAt: null },
  { tenantId: B, ...audit, id: 'ast-ikoyi-gen', name: 'Generator — Ikoyi (750kVA)', category: 'Power', serial: 'GEN-750-0012', siteId: SEED.estateIkoyi, locationLabel: 'Ikoyi · Plant room', status: 'operational', purchaseDate: '2024-01-01', warrantyExpiry: '2029-01-01', photos: [], archivedAt: null },
] as unknown as Asset[];

export const ppmPlans = [
  { tenantId: A, id: 'ppm-gen-c', assetId: 'ast-gen-c', assetName: 'Generator — Block C', siteId: SEED.estateGardens, frequency: 'monthly', nextDue: '2026-08-02', overdue: false, checklistItems: 12, assignee: 'Emeka Nwosu' },
  { tenantId: A, id: 'ppm-lift-c1', assetId: 'ast-lift-c1', assetName: 'Passenger Lift — Block C #1', siteId: SEED.estateGardens, frequency: 'quarterly', nextDue: '2026-07-18', overdue: true, checklistItems: 20, assignee: 'CoolAir Nigeria' },
  { tenantId: A, id: 'ppm-hvac-v1', assetId: 'ast-hvac-v1', assetName: 'Chiller — Victoria', siteId: SEED.estateVictoria, frequency: 'monthly', nextDue: '2026-08-05', overdue: false, checklistItems: 15, assignee: 'Brightworks Facilities' },
  { tenantId: A, id: 'ppm-pump-d', assetId: 'ast-pump-d', assetName: 'Water Pump — Block D', siteId: SEED.estateGardens, frequency: 'weekly', nextDue: '2026-07-14', overdue: true, checklistItems: 6, assignee: 'Emeka Nwosu' },
] as unknown as PpmPlan[];

const wo = (
  id: string,
  ref: string,
  title: string,
  siteId: string,
  status: WorkOrder['status'],
  priority: WorkOrder['priority'],
  origin: WorkOrder['origin'],
  assigneeUserId: string | undefined,
  assigneeName: string,
  requesterUserId: string,
  requesterName: string,
  cost: Money | null,
  breach: boolean,
  vendorOrgId?: string,
  unitId?: string,
): WorkOrder =>
  ({
    tenantId: A,
    ...audit,
    id,
    ref,
    title,
    siteId,
    estateId: siteId,
    unitId,
    status,
    priority,
    origin,
    assigneeUserId,
    assigneeName,
    vendorOrgId,
    requesterUserId,
    requesterName,
    respondDueAt: breach ? '2026-07-25T09:00:00Z' : '2026-07-27T09:00:00Z',
    resolveDueAt: breach ? '2026-07-25T18:00:00Z' : '2026-07-28T12:00:00Z',
    cost,
  }) as unknown as WorkOrder;

export const workOrders: WorkOrder[] = [
  wo('wo-1', 'WO-24817', 'Lift making grinding noise', SEED.estateGardens, 'in_progress', 'high', 'resident_request', 'user-technician', 'Emeka Nwosu', 'user-resident', 'Folake Bello', ngn(45000), true, undefined, SEED.unitRes),
  wo('wo-2', 'WO-24816', 'Generator failed to auto-start', SEED.estateGardens, 'assigned', 'emergency', 'manager', 'user-technician', 'Emeka Nwosu', 'user-facility_manager', 'Bola Adeyemi', null, true),
  wo('wo-3', 'WO-24815', 'AC not cooling — Unit C-09A', SEED.estateGardens, 'triaged', 'routine', 'resident_request', undefined, 'Unassigned', 'user-tobi', 'Tobi Ade', null, false, undefined, 'u-c09a'),
  wo('wo-4', 'WO-24814', 'Quarterly chiller service', SEED.estateVictoria, 'new', 'routine', 'ppm_schedule', undefined, 'Unassigned', 'user-seed', 'PPM Scheduler', null, false),
  wo('wo-5', 'WO-24813', 'Water pump replacement', SEED.estateGardens, 'on_hold', 'high', 'failed_inspection', 'v-coolair', 'CoolAir Nigeria', 'user-facility_manager', 'Bola Adeyemi', ngn(180000), false, 'v-coolair'),
  wo('wo-6', 'WO-24812', 'Gate barrier stuck open', SEED.estateGardens, 'resolved', 'high', 'resident_request', 'user-technician', 'Emeka Nwosu', 'user-security', 'Musa Ibrahim', ngn(22000), false),
  wo('wo-7', 'WO-24811', 'Corridor lights out — Block D', SEED.estateGardens, 'verified', 'routine', 'resident_request', 'user-technician', 'Emeka Nwosu', 'user-amina', 'Amina Sule', ngn(8000), false, undefined, 'u-d04c'),
  wo('wo-8', 'WO-24810', 'Leaking pipe — Block C basement', SEED.estateGardens, 'closed', 'routine', 'manager', SEED.vendorOrg, 'Brightworks Facilities', 'user-facility_manager', 'Bola Adeyemi', ngn(64000), false, SEED.vendorOrg),
  wo('wo-9', 'WO-24809', 'CCTV camera offline — main gate', SEED.estateGardens, 'assigned', 'high', 'manager', SEED.vendorOrg, 'Brightworks Facilities', 'user-security', 'Musa Ibrahim', null, false, SEED.vendorOrg),
  wo('wo-10', 'WO-24808', 'Intercom fault — Unit C-12B', SEED.estateGardens, 'cancelled', 'routine', 'resident_request', undefined, 'Unassigned', 'user-resident', 'Folake Bello', null, false, undefined, SEED.unitRes),
  // Tenant B — must never appear for a Lekki actor.
  wo('wo-b1', 'WO-90001', 'Ikoyi generator oil change', SEED.estateIkoyi, 'assigned', 'routine', 'ppm_schedule', undefined, 'Ikoyi Maintenance Co', 'user-ikoyi-mgr', 'Zainab Yusuf', null, false, 'v-ikoyi'),
].map((x) => (x.tenantId === A ? x : ({ ...x, tenantId: B, estateId: SEED.estateIkoyi } as WorkOrder)));
// fix tenant B row's tenantId (wo() hard-codes tenant A)
workOrders[workOrders.length - 1] = { ...workOrders[workOrders.length - 1], tenantId: B } as WorkOrder;

const inv = (
  id: string,
  ref: string,
  unitId: string,
  residentName: string,
  ownerUserId: string,
  status: Invoice['status'],
  amount: number,
  paid: number,
  dueDate: string,
  agingDays: number,
  tenantId: string = A,
  estateId: string = SEED.estateGardens,
): Invoice =>
  ({ tenantId, id, ref, unitId, estateId, residentName, ownerUserId, description: 'Service charge — Q3 2026', status, amount: ngn(amount), paid: ngn(paid), dueDate, agingDays }) as unknown as Invoice;

export const invoices: Invoice[] = [
  inv('in-1', 'INV-3001', SEED.unitRes, 'Folake Bello', 'user-resident', 'partially_paid', 250000, 165000, '2026-07-15', 11),
  inv('in-2', 'INV-3002', 'u-c09a', 'Tobi Ade', 'user-tobi', 'paid', 180000, 180000, '2026-07-01', -20),
  inv('in-3', 'INV-3003', 'u-d04c', 'Amina Sule', 'user-amina', 'issued', 250000, 0, '2026-08-05', -10),
  inv('in-4', 'INV-3004', SEED.unitRes, 'Folake Bello', 'user-resident', 'overdue', 45000, 0, '2026-07-05', 21),
  inv('in-5', 'INV-2990', 'u-c09a', 'Tobi Ade', 'user-tobi', 'in_arrears', 250000, 50000, '2026-06-15', 41),
  inv('in-6', 'INV-2981', 'u-d04c', 'Amina Sule', 'user-amina', 'escalated', 250000, 0, '2026-05-30', 57),
  inv('in-7', 'INV-3005', SEED.unitRes, 'Folake Bello', 'user-resident', 'draft', 30000, 0, '2026-08-20', -25),
  // Tenant B
  inv('in-b1', 'INV-9001', 'u-ikoyi-1', 'Kunle Bakare', 'user-ikoyi-res', 'in_arrears', 500000, 120000, '2026-06-10', 46, B, SEED.estateIkoyi),
];

export const announcements: Announcement[] = [
  { tenantId: A, id: 'an-1', title: 'Water supply interruption — Sat 08:00–12:00', body: 'Planned maintenance on the main pump. Store water in advance.', estateId: SEED.estateGardens, scope: 'estate', audience: 'All residents', sentAt: '2026-07-24T10:00:00Z', delivered: 238, read: 191, aiDrafted: false },
  { tenantId: A, id: 'an-2', title: 'Q3 service charge now due', body: 'Invoices have been issued. Pay in-app before 15 August to avoid penalties.', estateId: SEED.estateGardens, scope: 'broadcast', audience: 'All residents', sentAt: '2026-07-20T09:00:00Z', delivered: 240, read: 205, aiDrafted: true },
  { tenantId: A, id: 'an-3', title: 'Block C lift servicing Thursday', body: 'Lift #1 will be out of service 09:00–13:00 for its quarterly service.', estateId: SEED.estateGardens, scope: 'building', audience: 'Block C', sentAt: null, delivered: 0, read: 0, aiDrafted: false },
  { tenantId: B, id: 'an-b1', title: 'Ikoyi gym reopening', body: 'The gym reopens Monday.', estateId: SEED.estateIkoyi, scope: 'estate', audience: 'All residents', sentAt: '2026-07-22T09:00:00Z', delivered: 118, read: 90, aiDrafted: false },
] as unknown as Announcement[];

export const sosEvents: SosEvent[] = [
  { tenantId: A, id: 'sos-1', ref: 'SOS-0042', estateId: SEED.estateGardens, unitId: SEED.unitRes, residentName: 'Folake Bello', ownerUserId: 'user-resident', status: 'responding', raisedAt: '2026-07-26T08:41:00Z', acknowledgedAt: '2026-07-26T08:41:38Z', ackSeconds: 38, responder: 'Musa Ibrahim', channel: 'in_app' },
  { tenantId: A, id: 'sos-2', ref: 'SOS-0041', estateId: SEED.estateGardens, unitId: 'u-c09a', residentName: 'Tobi Ade', ownerUserId: 'user-tobi', status: 'reviewed', raisedAt: '2026-07-25T22:10:00Z', acknowledgedAt: '2026-07-25T22:10:52Z', ackSeconds: 52, responder: 'Musa Ibrahim', channel: 'in_app' },
  { tenantId: A, id: 'sos-3', ref: 'SOS-0043', estateId: SEED.estateGardens, unitId: 'u-d04c', residentName: 'Amina Sule', ownerUserId: 'user-amina', status: 'raised', raisedAt: '2026-07-26T08:58:00Z', acknowledgedAt: null, ackSeconds: null, responder: null, channel: 'sms_fallback' },
] as unknown as SosEvent[];

export const bookings: Booking[] = [
  { tenantId: A, id: 'bk-1', amenity: 'Clubhouse', estateId: SEED.estateGardens, ownerUserId: 'user-resident', residentName: 'Folake Bello', status: 'confirmed', slot: '2026-07-28T16:00:00Z', fee: ngn(15000) },
  { tenantId: A, id: 'bk-2', amenity: 'Tennis Court', estateId: SEED.estateGardens, ownerUserId: 'user-tobi', residentName: 'Tobi Ade', status: 'requested', slot: '2026-07-27T07:00:00Z', fee: null },
  { tenantId: A, id: 'bk-3', amenity: 'Pool (private session)', estateId: SEED.estateGardens, ownerUserId: 'user-resident', residentName: 'Folake Bello', status: 'completed', slot: '2026-07-20T10:00:00Z', fee: ngn(10000) },
] as unknown as Booking[];
