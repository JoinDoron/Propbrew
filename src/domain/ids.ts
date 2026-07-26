/**
 * Branded id types.
 *
 * A bare `string` id lets you pass a `UnitId` where a `WorkOrderId` is expected;
 * branding makes that a compile error. The brand is erased at runtime — these
 * are still plain strings on the wire.
 *
 * This module has ZERO framework imports. `src/domain` is the package the
 * backend and the React Native app (SC-05) will consume verbatim; the moment it
 * imports `next/*` or `react` it stops being shareable.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Brand<string, 'TenantId'>;
export type SiteId = Brand<string, 'SiteId'>; // an Estate or a Facility (§8.1)
export type BuildingId = Brand<string, 'BuildingId'>;
export type FloorId = Brand<string, 'FloorId'>;
export type UnitId = Brand<string, 'UnitId'>;

export type UserId = Brand<string, 'UserId'>;
export type RoleAssignmentId = Brand<string, 'RoleAssignmentId'>;
export type ResidentId = Brand<string, 'ResidentId'>;
export type HouseholdMemberId = Brand<string, 'HouseholdMemberId'>;
export type StaffMemberId = Brand<string, 'StaffMemberId'>;
export type VendorOrgId = Brand<string, 'VendorOrgId'>;

export type AssetId = Brand<string, 'AssetId'>;
export type PpmPlanId = Brand<string, 'PpmPlanId'>;
export type WorkOrderId = Brand<string, 'WorkOrderId'>;
export type MaintenanceRequestId = Brand<string, 'MaintenanceRequestId'>;
export type InspectionId = Brand<string, 'InspectionId'>;
export type InspectionTemplateId = Brand<string, 'InspectionTemplateId'>;
export type ComplianceObligationId = Brand<string, 'ComplianceObligationId'>;

export type ChargeDefinitionId = Brand<string, 'ChargeDefinitionId'>;
export type InvoiceId = Brand<string, 'InvoiceId'>;
export type PaymentId = Brand<string, 'PaymentId'>;
export type StatementId = Brand<string, 'StatementId'>;

export type AmenityId = Brand<string, 'AmenityId'>;
export type BookingId = Brand<string, 'BookingId'>;
export type AnnouncementId = Brand<string, 'AnnouncementId'>;
export type VisitorPassId = Brand<string, 'VisitorPassId'>;

export type SosEventId = Brand<string, 'SosEventId'>;
export type PatrolLogId = Brand<string, 'PatrolLogId'>;
export type SecurityIncidentId = Brand<string, 'SecurityIncidentId'>;

export type ListingId = Brand<string, 'ListingId'>;
export type MarketplaceOrderId = Brand<string, 'MarketplaceOrderId'>;
export type PayoutId = Brand<string, 'PayoutId'>; // Q3 — shape not final

export type InvestorProjectId = Brand<string, 'InvestorProjectId'>;
export type LeadId = Brand<string, 'LeadId'>;

export type DocumentId = Brand<string, 'DocumentId'>;
export type FolderId = Brand<string, 'FolderId'>;

export type AuditLogId = Brand<string, 'AuditLogId'>;
export type NotificationId = Brand<string, 'NotificationId'>;
export type AiInteractionId = Brand<string, 'AiInteractionId'>;
export type AiSuggestionId = Brand<string, 'AiSuggestionId'>;

/** Mint a branded id from a plain string (e.g. an API response). Runtime no-op. */
export function asId<T extends string>(value: string): T {
  return value as T;
}
