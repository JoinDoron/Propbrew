/**
 * PRD v2.0 §7 — Roles & permissions matrix (page 3), transcribed verbatim and
 * verified cell-by-cell against the source (13 capabilities × 9 roles = 117
 * cells, zero corrections at verification).
 *
 * "Server-side, deny-by-default enforcement on every API (SC-01)."
 * "Fine-grained permissions per endpoint are finalised at design; this matrix
 *  is the authoritative baseline."
 *
 * DO NOT edit this table without a Change Request (PRD §19, Clause 10).
 * A golden-snapshot test guards it in CI.
 */

import { ROLES, type AccessLevel, type Role } from '@/domain/enums';

export { ROLES };
export type { Role };
/** The §7 legend level. Alias of the domain AccessLevel. */
export type Level = AccessLevel;

export const CAPABILITIES = [
  'tenant_config', // Tenant onboarding & config  — SC-07, §8.2
  'users_roles', // Users & roles               — SC-01, EM-02, FM-05
  'assets_ppm', // Assets & PPM plans          — FM-01, FM-02
  'work_orders', // Work orders                 — FM-03, EM-03
  'inspections_compliance', // Inspections & compliance    — FM-06
  'charges_invoicing', // Charges & invoicing         — EM-01
  'payments_in_app', // Payments (pay in-app)       — SC-02
  'announcements', // Announcements               — EM-04
  'bookings_amenities', // Bookings & amenities        — EM-05
  'security_sos', // Security & SOS              — EM-06, EM-02
  'marketplace', // Marketplace                 — EM-09, SC-04
  'investor_projects', // Investor projects           — SC-08
  'reports_analytics', // Reports & analytics         — FM-07, AI-S-02
] as const;
export type Capability = (typeof CAPABILITIES)[number];

type Row = Readonly<Record<Role, Level>>;

/**
 * Exhaustive by construction: `Record<Capability, Record<Role, Level>>` makes a
 * missing cell a TypeScript error, so "unspecified" can never mean "allowed".
 * This is the compile-time half of SC-01's deny-by-default.
 */
export const MATRIX: Readonly<Record<Capability, Row>> = {
  //                        Plat    Exec    EstM    FacM    Tech    Res     Sec     Ven     Inv
  tenant_config:          { platform_admin: 'F',    executive: 'none', estate_manager: 'V', facility_manager: 'none', technician: 'none', resident: 'none', security: 'none', vendor: 'none', investor: 'none' },
  users_roles:            { platform_admin: 'F',    executive: 'V',    estate_manager: 'M', facility_manager: 'M',    technician: 'none', resident: 'O',    security: 'none', vendor: 'O',    investor: 'O'    },
  assets_ppm:             { platform_admin: 'V',    executive: 'V',    estate_manager: 'V', facility_manager: 'M',    technician: 'V',    resident: 'none', security: 'none', vendor: 'none', investor: 'none' },
  work_orders:            { platform_admin: 'V',    executive: 'V',    estate_manager: 'M', facility_manager: 'M',    technician: 'O',    resident: 'O',    security: 'none', vendor: 'O',    investor: 'none' },
  inspections_compliance: { platform_admin: 'V',    executive: 'V',    estate_manager: 'V', facility_manager: 'M',    technician: 'O',    resident: 'none', security: 'none', vendor: 'none', investor: 'none' },
  charges_invoicing:      { platform_admin: 'V',    executive: 'V',    estate_manager: 'M', facility_manager: 'none', technician: 'none', resident: 'O',    security: 'none', vendor: 'none', investor: 'none' },
  payments_in_app:        { platform_admin: 'none', executive: 'none', estate_manager: 'none', facility_manager: 'none', technician: 'none', resident: 'O', security: 'none', vendor: 'none', investor: 'none' },
  announcements:          { platform_admin: 'V',    executive: 'V',    estate_manager: 'M', facility_manager: 'M',    technician: 'none', resident: 'V',    security: 'V',    vendor: 'none', investor: 'none' },
  bookings_amenities:     { platform_admin: 'V',    executive: 'V',    estate_manager: 'M', facility_manager: 'none', technician: 'none', resident: 'O',    security: 'V',    vendor: 'none', investor: 'none' },
  security_sos:           { platform_admin: 'V',    executive: 'V',    estate_manager: 'M', facility_manager: 'none', technician: 'none', resident: 'O',    security: 'M',    vendor: 'none', investor: 'none' },
  marketplace:            { platform_admin: 'V',    executive: 'V',    estate_manager: 'M', facility_manager: 'none', technician: 'none', resident: 'O',    security: 'none', vendor: 'O',    investor: 'none' },
  investor_projects:      { platform_admin: 'F',    executive: 'V',    estate_manager: 'none', facility_manager: 'none', technician: 'none', resident: 'none', security: 'none', vendor: 'none', investor: 'O' },
  reports_analytics:      { platform_admin: 'F',    executive: 'V',    estate_manager: 'M', facility_manager: 'M',    technician: 'none', resident: 'none', security: 'none', vendor: 'none', investor: 'V'    },
} as const;

export const CAPABILITY_LABELS: Readonly<Record<Capability, string>> = {
  tenant_config: 'Tenant onboarding & config',
  users_roles: 'Users & roles',
  assets_ppm: 'Assets & PPM plans',
  work_orders: 'Work orders',
  inspections_compliance: 'Inspections & compliance',
  charges_invoicing: 'Charges & invoicing',
  payments_in_app: 'Payments (pay in-app)',
  announcements: 'Announcements',
  bookings_amenities: 'Bookings & amenities',
  security_sos: 'Security & SOS',
  marketplace: 'Marketplace',
  investor_projects: 'Investor projects',
  reports_analytics: 'Reports & analytics',
};

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  platform_admin: 'Platform Admin',
  executive: 'Owner / Executive',
  estate_manager: 'Estate Manager',
  facility_manager: 'Facility Manager',
  technician: 'Technician',
  resident: 'Resident',
  security: 'Security',
  vendor: 'Vendor',
  investor: 'Investor',
};

/** Deny-by-default lookup. `?? 'none'` guards untyped input crossing the wire. */
export function levelFor(role: Role, capability: Capability): Level {
  return MATRIX[capability]?.[role] ?? 'none';
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value);
}
