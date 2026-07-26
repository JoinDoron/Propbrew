/**
 * Entity shapes for the Phase-1 Must surfaces. No framework imports.
 *
 * This is a focused subset of the ~55 tables the full domain implies — the ones
 * the Session-2 read screens render. Each carries `tenantId` (§8.2) and, where
 * it is location-bearing, the ownership columns the ScopeFilter matches on
 * (ownerUserId / requesterUserId / assigneeUserId / unitId / vendorOrgId /
 * projectId), so a seed row and a future SQL row scope identically.
 */

import type {
  AnnouncementId,
  AssetId,
  BuildingId,
  InvoiceId,
  PpmPlanId,
  ResidentId,
  SiteId,
  SosEventId,
  UnitId,
  UserId,
  VendorOrgId,
  WorkOrderId,
} from './ids';
import type { ISODate, ISODateTime, MediaRef, Money } from './primitives';
import type { Auditable, TenantScoped } from './tenancy';
import type {
  AnnouncementScope,
  BookingStatus,
  InvoiceStatus,
  Role,
  SiteKind,
  SosStatus,
  WorkOrderStatus,
} from './enums';
import type {
  AssetStatus,
  OccupancyStatus,
  ResidentStatus,
  VendorCompliance,
  WorkOrderPriority,
} from './enums.proposed';

/* --- spaces (§8.1, FM-04) ------------------------------------------------- */

export type Site = TenantScoped & {
  id: SiteId;
  kind: SiteKind; // estate | facility
  name: string;
  address: string;
  buildingCount: number;
  unitCount: number;
};

export type Building = TenantScoped & {
  id: BuildingId;
  siteId: SiteId;
  name: string;
  floors: number;
};

export type Unit = TenantScoped & {
  id: UnitId;
  siteId: SiteId;
  buildingId: BuildingId;
  label: string; // e.g. "Block C · 12B"
  type: string; // e.g. "3-bed apartment" — drives EM-01 charge setup
  occupancy: OccupancyStatus;
};

/* --- identity (SC-01, EM-02, FM-05) --------------------------------------- */

export type User = TenantScoped & {
  id: UserId;
  name: string;
  email: string;
  roles: readonly Role[];
  /** estates this user is scoped to; empty + allEstates=true means tenant-wide */
  estateIds: readonly SiteId[];
  allEstates: boolean;
  status: 'active' | 'invited' | 'suspended';
  lastActive: string;
};

export type Resident = TenantScoped & {
  id: ResidentId;
  userId: UserId;
  name: string;
  unitId: UnitId;
  siteId: SiteId;
  status: ResidentStatus;
  household: number;
  balance: Money; // outstanding across invoices
  moveInDate: ISODate;
};

export type Vendor = TenantScoped & {
  id: VendorOrgId;
  name: string;
  services: readonly string[];
  coverage: string;
  compliance: VendorCompliance; // documents valid / expiring / expired
  insuranceExpiry: ISODate;
  jobsCompleted: number;
  slaHitRate: number; // 0–100
  rating: number; // 0–5
};

/* --- facility (FM-01…03) -------------------------------------------------- */

export type Asset = TenantScoped &
  Auditable & {
    id: AssetId;
    name: string;
    category: string;
    serial: string;
    siteId: SiteId;
    buildingId?: BuildingId;
    unitId?: UnitId;
    locationLabel: string;
    status: AssetStatus;
    purchaseDate: ISODate;
    warrantyExpiry: ISODate;
    photos: readonly MediaRef[];
    /** FM-01: archive, never delete. */
    archivedAt: ISODateTime | null;
  };

export type PpmPlan = TenantScoped & {
  id: PpmPlanId;
  assetId: AssetId;
  assetName: string;
  siteId: SiteId;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'annual';
  nextDue: ISODate;
  overdue: boolean;
  checklistItems: number;
  assignee: string;
};

export type WorkOrder = TenantScoped &
  Auditable & {
    id: WorkOrderId;
    ref: string; // human ticket id, e.g. "WO-24817"
    title: string;
    siteId: SiteId;
    estateId: SiteId; // scope column mirror of siteId
    unitId?: UnitId;
    assetName?: string;
    status: WorkOrderStatus;
    priority: WorkOrderPriority;
    origin: 'resident_request' | 'manager' | 'ppm_schedule' | 'failed_inspection';
    requesterUserId: UserId;
    requesterName: string;
    assigneeUserId?: UserId;
    assigneeName: string;
    vendorOrgId?: VendorOrgId;
    /** SLA respond/resolve due; breach shown by SlaBadge. */
    respondDueAt: ISODateTime | null;
    resolveDueAt: ISODateTime | null;
    cost: Money | null;
  };

/* --- billing (EM-01, SC-02) ----------------------------------------------- */

export type Invoice = TenantScoped & {
  id: InvoiceId;
  ref: string;
  unitId: UnitId;
  estateId: SiteId;
  residentName: string;
  ownerUserId: UserId; // the resident who owns it (scope column)
  description: string;
  status: InvoiceStatus;
  amount: Money;
  paid: Money;
  dueDate: ISODate;
  /** days past due, for arrears aging; negative = not yet due. */
  agingDays: number;
};

/* --- estate (EM-04, EM-06) ------------------------------------------------ */

export type Announcement = TenantScoped & {
  id: AnnouncementId;
  title: string;
  body: string;
  estateId: SiteId;
  scope: AnnouncementScope;
  audience: string;
  sentAt: ISODateTime | null;
  delivered: number;
  read: number;
  /** EM-04: AI-drafted sends need manager approval first. */
  aiDrafted: boolean;
};

export type SosEvent = TenantScoped & {
  id: SosEventId;
  ref: string;
  estateId: SiteId;
  unitId: UnitId;
  residentName: string;
  ownerUserId: UserId;
  status: SosStatus;
  raisedAt: ISODateTime;
  acknowledgedAt: ISODateTime | null;
  /** seconds from raise to acknowledge; null while unacknowledged. */
  ackSeconds: number | null;
  responder: string | null;
  channel: 'in_app' | 'queued_offline' | 'sms_fallback';
};

/* --- a booking row for the resident portal (EM-05) ------------------------ */

export type Booking = TenantScoped & {
  id: string;
  amenity: string;
  estateId: SiteId;
  ownerUserId: UserId;
  residentName: string;
  status: BookingStatus;
  slot: ISODateTime;
  fee: Money | null;
};
