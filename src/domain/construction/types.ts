/**
 * Construction (ConstructionOS) — domain types for the new construction-operations
 * module: projects → phases → tasks → milestones/issues, daily site reports,
 * procurement (requests → RFQ → PO → delivery), inventory movements, cost codes +
 * variations (Earned-Value computed in the engine), workforce/attendance, and
 * documents/RFIs. No framework imports.
 *
 * Scoping: construction rows are TENANT-scoped only (no estateId/siteId) so they
 * pass the estate filter for a single-estate manager; `projectId` on the Project
 * equals its linked off-plan investor project id (the §7 investor `my_projects`
 * scope column) so an investor client view auto-narrows to their own build.
 */

import type { Money } from '@/domain/primitives';
import type { TenantScoped } from '@/domain/tenancy';

/* --- projects, phases, tasks --------------------------------------------- */

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'closing' | 'completed';
export type Project = TenantScoped & {
  id: string;
  /** scope column for the investor `my_projects` narrowing; = linked off-plan id when set. */
  projectId: string;
  investorProjectId?: string; // ties to the existing off-plan investorProjects (p-marina, p-cedar)
  code: string; name: string; location: string; clientName: string; pmName: string;
  status: ProjectStatus;
  contractValue: Money; approvedBudget: Money;
  startISO: string; plannedFinishISO: string; actualStartISO?: string;
  /** planned % is the schedule baseline to date; percentComplete is actual physical progress. */
  plannedPercent: number; percentComplete: number;
};

export type Phase = TenantScoped & {
  id: string; projectId: string; name: string; order: number;
  startISO: string; finishISO: string;
  /** share of the whole project (weights sum to ~100 across a project's phases). */
  weight: number; percentComplete: number;
};

export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done';
export type Task = TenantScoped & {
  id: string; projectId: string; phaseId: string; name: string; owner: string;
  plannedStartISO: string; plannedFinishISO: string; actualStartISO?: string; actualFinishISO?: string;
  percentComplete: number; status: TaskStatus; priority: 'low' | 'medium' | 'high';
  /** dependency task ids (finish-to-start) — drives the critical path. */
  dependsOn: string[];
  budget: Money;
};

export type MilestoneStatus = 'pending' | 'at_risk' | 'accepted' | 'missed';
export type Milestone = TenantScoped & {
  id: string; projectId: string; name: string; dueISO: string; status: MilestoneStatus; evidence?: string;
};

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';
export type Issue = TenantScoped & {
  id: string; projectId: string; category: string; title: string; severity: IssueSeverity;
  owner: string; raisedISO: string; dueISO: string; status: IssueStatus; correctiveAction?: string;
};

/* --- site operations ------------------------------------------------------ */

export type ReportStatus = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'returned';
export type DailyReport = TenantScoped & {
  id: string; projectId: string; dateISO: string; weather: string; shift: string; officer: string;
  workforceCount: number; completed: string[]; ongoing: string[]; delayed: string[]; plannedNext: string[];
  deliveries: string[]; incidents: string[]; constraints: string[]; photos: number; status: ReportStatus;
};

/* --- procurement ---------------------------------------------------------- */

export type Vendor = TenantScoped & {
  id: string; name: string; category: string; rating: number; onTimePct: number;
  qualityIncidents: number; complianceExpiryISO?: string; suspended?: boolean;
};

export type PRStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'rfq' | 'ordered';
export type PurchaseRequest = TenantScoped & {
  id: string; ref: string; projectId: string; item: string; qty: number; unit: string; costCode: string;
  estimate: Money; requiredISO: string; requestedBy: string; status: PRStatus; justification: string;
};

export type Quote = { vendorId: string; vendorName: string; price: Money; leadDays: number; warrantyMonths: number; compliancePct: number };
export type RFQStatus = 'open' | 'comparing' | 'awarded';
export type RFQ = TenantScoped & {
  id: string; ref: string; requestRef: string; projectId: string; item: string; qty: number; unit: string;
  status: RFQStatus; quotes: Quote[]; awardedVendorId?: string;
};

export type POStatus = 'draft' | 'approved' | 'issued' | 'acknowledged' | 'part_delivered' | 'delivered' | 'closed' | 'cancelled';
export type PurchaseOrder = TenantScoped & {
  id: string; ref: string; projectId: string; vendorId: string; vendorName: string; item: string;
  qty: number; unit: string; costCode: string; value: Money; status: POStatus;
  issuedISO: string; expectedISO: string; deliveredQty: number;
};

/* --- inventory & materials ------------------------------------------------ */

export type Material = TenantScoped & {
  id: string; sku: string; name: string; category: string; unit: string; reorderLevel: number; unitCost: Money;
};

export type Warehouse = TenantScoped & { id: string; name: string; kind: 'central' | 'site_store'; projectId?: string };

/** Per-material, per-warehouse stock position. available = onHand − reserved. */
export type StockItem = TenantScoped & {
  id: string; materialId: string; warehouseId: string; onHand: number; reserved: number; inTransit: number;
};

export type StockKind = 'receipt' | 'issue' | 'transfer' | 'return' | 'adjust';
export type StockMovement = TenantScoped & {
  id: string; materialId: string; kind: StockKind; qty: number; atISO: string;
  projectId?: string; costCode?: string; ref?: string; by: string;
};

/* --- cost control (EVM computed in engine) -------------------------------- */

export type CostCode = TenantScoped & {
  id: string; projectId: string; code: string; name: string; category: string;
  budget: Money; committed: Money; actual: Money;
  /** planned value share of the project baseline to date, for earned-value. */
  plannedPercent: number; earnedPercent: number;
};

export type VariationStatus = 'draft' | 'submitted' | 'client_review' | 'approved' | 'rejected';
export type Variation = TenantScoped & {
  id: string; ref: string; projectId: string; title: string; reason: string;
  costImpact: Money; scheduleImpactDays: number; status: VariationStatus; raisedISO: string;
};

/* --- workforce ------------------------------------------------------------ */

export type WorkerKind = 'employee' | 'subcontractor' | 'temp';
export type Worker = TenantScoped & {
  id: string; name: string; trade: string; kind: WorkerKind; projectId?: string; crew?: string; company?: string;
  dayRate: Money; certName?: string; certExpiryISO?: string;
};

export type AttendanceMethod = 'gps' | 'qr' | 'manual';
export type Attendance = TenantScoped & {
  id: string; workerId: string; projectId: string; dateISO: string; clockIn?: string; clockOut?: string;
  hours: number; overtime: number; method: AttendanceMethod; withinGeofence: boolean; status: 'present' | 'absent' | 'pending';
};

/* --- documents & RFIs ----------------------------------------------------- */

export type DocStatus = 'draft' | 'review' | 'approved' | 'superseded' | 'rejected';
export type ConstructionDoc = TenantScoped & {
  id: string; projectId: string; number: string; title: string; discipline: string; revision: string;
  status: DocStatus; effectiveISO: string; folder: string;
};

export type RFIStatus = 'open' | 'answered' | 'closed';
export type RFI = TenantScoped & {
  id: string; ref: string; projectId: string; question: string; discipline: string; drawingRef?: string;
  raisedBy: string; assignedTo: string; raisedISO: string; dueISO: string; status: RFIStatus;
  answer?: string; answeredISO?: string;
};
