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
  OrderStatus,
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
  /** Contact record only; does not create an authentication account or invite. */
  email?: string;
  phone?: string;
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

export type PpmFrequency = 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'annual';
export type PpmBasis = 'calendar' | 'runtime' | 'both';
export type ChecklistItem = { id: string; label: string; requiresPhoto: boolean };

export type PpmPlan = TenantScoped & {
  id: PpmPlanId;
  assetId: AssetId;
  assetName: string;
  category: string; // asset trade (Power/Elevators/HVAC/Plumbing/Access) — drives colour, season, risk
  siteId: SiteId;
  buildingId?: BuildingId;
  frequency: PpmFrequency;
  nextDue: ISODate;
  overdue: boolean;
  /** Days before nextDue the work order should be generated (the lead-time queue). */
  leadTimeDays: number;
  /** Trigger basis — generators/pumps are runtime-driven (whichever comes first). */
  basis: PpmBasis;
  /** Service interval in engine-hours, for runtime/both plans. */
  runtimeIntervalHours?: number;
  checklistItems: number; // display count (kept for the assets explorer)
  checklist: readonly ChecklistItem[];
  /** FM-02: completion requires an evidence photo when true. */
  evidenceRequired: boolean;
  lastServicedAt: ISODate | null;
  estimatedHours: number; // per-visit labour — feeds the workload heatmap
  assignee: string; // display fallback
  assigneeRule?: { kind: 'person' | 'vendor'; ref: string };
  /** Statutory inspections (lifts) cannot be pushed past their legal deadline. */
  statutory: boolean;
  statutoryDeadline?: ISODate;
  rescheduleCount: number;
};

export type WorkOrder = TenantScoped &
  Auditable & {
    id: WorkOrderId;
    ref: string; // human ticket id, e.g. "WO-24817"
    title: string;
    /** The requester's own words. Resident-raised jobs carry the typed detail
     *  through to the technician instead of arriving as a title only. */
    description?: string;
    siteId: SiteId;
    estateId: SiteId; // scope column mirror of siteId
    unitId?: UnitId;
    assetId?: AssetId;
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
  /** Requested publication time; retaining it does not claim a delivery worker exists. */
  scheduleAt?: ISODateTime | null;
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

/* --- wallet (resident home PRD) ------------------------------------------- */

/**
 * Per-unit estate wallet. `available` is funded balance the resident tops up;
 * `pending` (uncleared estate charges) is DERIVED at read time from the unit's
 * unpaid invoices, never stored, so the wallet and the billing ledger cannot
 * drift. One wallet per unit; a multi-unit resident has several.
 */
export type Wallet = TenantScoped & {
  id: string;
  unitId: UnitId;
  ownerUserId: UserId;
  available: Money;
};

/* --- documents (EM-08, Should) -------------------------------------------- */

export type DocType = 'certificate' | 'contract' | 'policy' | 'invoice' | 'handbook' | 'report' | 'notice' | 'other';
export type ExtractedField = { label: string; value: string };

export type EstateDocument = TenantScoped & {
  id: string;
  name: string;
  folder: string;
  type: DocType;
  estateId: SiteId;
  audience: string;
  sizeKb: number;
  updatedAt: ISODate;
  uploadedBy: string;
  /** EM-08 / AI-S-03: indexed for document intelligence. */
  indexed: boolean;
  /** AI-S-03: OCR field extraction (editable before save). */
  extracted: readonly ExtractedField[];
  /** How the OCR read: printed (high confidence) vs scanned (lower). */
  scanned: boolean;
  extractionConfidence: number; // 0–1
  /** Extra terms for semantic search beyond the name. */
  keywords: readonly string[];
  /** Certificates/contracts/policies expire — surfaced in the expiry radar. */
  expiryDate?: ISODate;
  /** Cross-link: this document evidences a compliance obligation (FM-06). */
  linkedObligationId?: string;
};

/* --- inspections (FM-06, Should) ------------------------------------------ */

export type InspectionSeverity = 'minor' | 'major' | 'critical';
export type InspectionResult = 'pass' | 'fail' | 'na' | null;
export type InspectionItem = {
  id: string;
  label: string;
  severity: InspectionSeverity;
  requiresPhoto: boolean;
  result: InspectionResult;
  note?: string;
};

export type Inspection = TenantScoped & {
  id: string;
  ref: string;
  template: string;
  /** The compliance obligation this run evidences (links to a ComplianceObligation). */
  obligationId: string;
  criticality: 'statutory' | 'important' | 'routine';
  siteId: SiteId;
  estateId: SiteId;
  assetId?: AssetId;
  assetName: string;
  status: 'scheduled' | 'in_progress' | 'passed' | 'failed' | 'overdue';
  scheduledDate: ISODate;
  completedDate?: ISODate;
  /** FM-06: checklist items with pass/fail/severity and photo capture. */
  checklist: readonly InspectionItem[];
  passItems: number;
  failItems: number;
  inspector: string;
  /** FM-06: failed items auto-raise work orders. */
  raisedWorkOrders: number;
  raisedWorkOrderRefs: readonly string[];
};

/** FM-06: "compliance register shows status and expiry per obligation." A
 *  standing legal/operational obligation, renewed by a passing inspection. */
export type ComplianceObligation = TenantScoped & {
  id: string;
  name: string;
  scopeLabel: string; // asset or area the obligation covers
  assetId?: AssetId;
  siteId: SiteId;
  estateId: SiteId;
  criticality: 'statutory' | 'important' | 'routine';
  cadenceDays: number; // renewal cadence
  /** Which inspection template a new run for this obligation uses. */
  templateKey: 'fire' | 'lift' | 'water' | 'generator' | 'electrical' | 'document' | 'general';
  /** When the current certificate/compliance lapses; null = never evidenced. */
  validUntil: ISODate | null;
  lastInspectionRef?: string;
  authority?: string; // e.g. Lagos State Safety Commission
};

/* --- investor off-plan projects (SC-08, Should) --------------------------- */

export type InvestorProject = TenantScoped & {
  id: string;
  /** Scope column: equals `id`; an investor sees a project iff it is in their
   *  investorProjectIds (§7 O). */
  projectId: string;
  name: string;
  location: string;
  status: 'planning' | 'selling' | 'construction' | 'completed';
  unitsTotal: number;
  unitsSold: number;
  salesTarget: Money;
  salesToDate: Money;
  occupancyPct: number;
  /** AI-S-04 projection — always shown as an estimate with assumptions. */
  projectedRoiPct: number;
  handoverDate: ISODate;
};

/* --- marketplace (EM-09, Should) ------------------------------------------ */

export type Listing = TenantScoped & {
  id: string;
  vendorOrgId: VendorOrgId;
  vendorName: string;
  title: string;
  category: string;
  price: Money;
  status: 'active' | 'paused';
  estateId: SiteId;
};

export type MarketplaceOrder = TenantScoped & {
  id: string;
  ref: string;
  ownerUserId: UserId;
  vendorOrgId: VendorOrgId;
  estateId: SiteId;
  residentName: string;
  listingTitle: string;
  status: OrderStatus;
  amount: Money;
  placedAt: ISODateTime;
};

/* --- a booking row for the resident portal (EM-05) ------------------------ */

export type Booking = TenantScoped & {
  id: string;
  amenity: string;
  /** New scoped registry and duration references; legacy bookings retain snapshots. */
  amenityId?: string;
  endISO?: ISODateTime;
  unitId?: UnitId;
  estateId: SiteId;
  ownerUserId: UserId;
  residentName: string;
  status: BookingStatus;
  slot: ISODateTime;
  fee: Money | null;
};
