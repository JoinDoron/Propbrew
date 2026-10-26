import type { Role } from '@/domain/enums';
import type { Capability } from '@/lib/authz/matrix';
import type { Action } from '@/lib/authz/policy';
import type { WorkspaceId } from './workspaces';

export const DEMO_PERSONA_COOKIE = 'propbrew_demo_persona';

type DemoModuleAccess = 'manage' | 'view';

export type DemoPersona = {
  id: string;
  label: string;
  description: string;
  home: string;
  roles: readonly Role[];
  modules: Readonly<Partial<Record<WorkspaceId, DemoModuleAccess>>>;
  capabilities?: Readonly<Partial<Record<Capability, DemoModuleAccess>>>;
  capabilityActions?: Readonly<Partial<Record<Capability, readonly Action[]>>>;
  estateIds?: readonly string[];
  allEstates?: boolean;
  unitIds?: readonly string[];
};

const ALL_MANAGE = Object.freeze({ estate: 'manage', facility: 'manage', shortlet: 'manage', construction: 'manage' } as const);
const ALL_VIEW = Object.freeze({ estate: 'view', facility: 'view', shortlet: 'view', construction: 'view' } as const);
const ESTATE_MANAGE = Object.freeze({ estate: 'manage' } as const);
const ESTATE_VIEW = Object.freeze({ estate: 'view' } as const);
const ESTATE_SITE = 's-gardens';
const RESIDENT_UNIT = 'u-c12b';

const cap = (value: Partial<Record<Capability, DemoModuleAccess>>) => Object.freeze(value);
const verbs = (value: Partial<Record<Capability, readonly Action[]>>) => Object.freeze(value);

/**
 * Review personas are authorization projections inside a private demo sandbox.
 * They never create accounts, change a real membership or cross tenant scope.
 */
export const DEMO_PERSONAS = Object.freeze([
  Object.freeze({
    id: 'company-owner', label: 'Company owner', description: 'Full sandbox access across all four modules', home: '/workspaces',
    roles: Object.freeze(['estate_manager', 'facility_manager', 'technician', 'security'] as const), modules: ALL_MANAGE,
  }),
  Object.freeze({
    id: 'executive', label: 'Executive viewer', description: 'Portfolio visibility without operational changes', home: '/workspaces',
    roles: Object.freeze(['executive'] as const), modules: ALL_VIEW,
  }),
  Object.freeze({
    id: 'portfolio-manager', label: 'Portfolio / Regional manager', description: 'Company-wide portfolio performance and Estate operations', home: '/estate',
    roles: Object.freeze(['estate_manager'] as const), modules: ESTATE_MANAGE,
  }),
  Object.freeze({
    id: 'property-manager', label: 'Property / Block manager', description: 'Residents, property operations and assigned-site delivery', home: '/estate',
    roles: Object.freeze(['estate_manager'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ users_roles: 'manage', assets_ppm: 'view', work_orders: 'manage', inspections_compliance: 'view', charges_invoicing: 'view', announcements: 'manage', bookings_amenities: 'manage', security_sos: 'manage', marketplace: 'view', reports_analytics: 'view' }),
    estateIds: Object.freeze([ESTATE_SITE]), allEstates: false,
  }),
  Object.freeze({
    id: 'finance-officer', label: 'Finance / Accounts officer', description: 'Invoices, receivables, reconciliation and financial reporting', home: '/finance',
    roles: Object.freeze(['estate_manager'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ users_roles: 'view', charges_invoicing: 'manage', reports_analytics: 'view' }),
  }),
  Object.freeze({
    id: 'collections-officer', label: 'Collections officer', description: 'Arrears, payment follow-up and collection records', home: '/collections',
    roles: Object.freeze(['estate_manager'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ users_roles: 'view', charges_invoicing: 'manage', announcements: 'view', reports_analytics: 'view' }),
  }),
  Object.freeze({
    id: 'leasing-officer', label: 'Leasing / Tenancy officer', description: 'Resident onboarding, tenancies, renewals and move workflows', home: '/tenancy',
    roles: Object.freeze(['estate_manager'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ tenant_config: 'view', users_roles: 'manage', charges_invoicing: 'view', announcements: 'view', reports_analytics: 'view' }),
  }),
  Object.freeze({
    id: 'community-officer', label: 'Community / Resident experience officer', description: 'Announcements, amenities, events and resident engagement', home: '/community',
    roles: Object.freeze(['estate_manager'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ users_roles: 'view', announcements: 'manage', bookings_amenities: 'manage', security_sos: 'view', marketplace: 'view', reports_analytics: 'view' }),
  }),
  Object.freeze({
    id: 'concierge', label: 'Front desk / Concierge', description: 'Visitors, parcels, bookings and resident assistance', home: '/bookings',
    roles: Object.freeze(['estate_manager'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ users_roles: 'view', announcements: 'view', bookings_amenities: 'manage', security_sos: 'manage', marketplace: 'view' }),
    capabilityActions: verbs({ security_sos: ['read', 'create', 'update', 'transition'] }),
    estateIds: Object.freeze([ESTATE_SITE]), allEstates: false,
  }),
  Object.freeze({
    id: 'security-supervisor', label: 'Security supervisor', description: 'SOS command, incidents, access operations and response oversight', home: '/security',
    roles: Object.freeze(['security'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ announcements: 'view', bookings_amenities: 'view', security_sos: 'manage' }),
    estateIds: Object.freeze([ESTATE_SITE]), allEstates: false,
  }),
  Object.freeze({
    id: 'security-guard', label: 'Security guard', description: 'Assigned gate, patrol, visitor and incident execution', home: '/security',
    roles: Object.freeze(['security'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ announcements: 'view', security_sos: 'manage' }),
    capabilityActions: verbs({ security_sos: ['read', 'create', 'update', 'transition'] }),
    estateIds: Object.freeze([ESTATE_SITE]), allEstates: false,
  }),
  Object.freeze({
    id: 'board-approver', label: 'Board / Committee approver', description: 'Governance review and bounded approval decisions', home: '/board',
    roles: Object.freeze(['estate_manager'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ users_roles: 'view', charges_invoicing: 'view', announcements: 'manage', bookings_amenities: 'manage', security_sos: 'view', reports_analytics: 'view' }),
    capabilityActions: verbs({ announcements: ['read', 'approve'], bookings_amenities: ['read', 'approve'] }),
  }),
  Object.freeze({
    id: 'auditor', label: 'Auditor / Compliance viewer', description: 'Read-only evidence, controls, reports and audit review', home: '/reports',
    roles: Object.freeze(['executive'] as const), modules: ESTATE_VIEW,
    capabilities: cap({ tenant_config: 'view', users_roles: 'view', assets_ppm: 'view', work_orders: 'view', inspections_compliance: 'view', charges_invoicing: 'view', announcements: 'view', bookings_amenities: 'view', security_sos: 'view', marketplace: 'view', reports_analytics: 'view' }),
  }),
  Object.freeze({
    id: 'landlord', label: 'Property owner / Landlord', description: 'Read-only property, tenancy, income and maintenance visibility', home: '/portfolio',
    roles: Object.freeze(['executive'] as const), modules: ESTATE_VIEW,
    capabilities: cap({ users_roles: 'view', work_orders: 'view', charges_invoicing: 'view', announcements: 'view', reports_analytics: 'view' }),
    estateIds: Object.freeze([ESTATE_SITE]), allEstates: false,
  }),
  Object.freeze({
    id: 'resident', label: 'Resident / Tenant', description: 'Own home, bills, requests, bookings and community services', home: '/portal',
    roles: Object.freeze(['resident'] as const), modules: ESTATE_MANAGE,
    capabilities: cap({ users_roles: 'manage', work_orders: 'manage', charges_invoicing: 'view', payments_in_app: 'manage', announcements: 'view', bookings_amenities: 'manage', security_sos: 'manage', marketplace: 'manage' }),
    unitIds: Object.freeze([RESIDENT_UNIT]),
  }),
  Object.freeze({
    id: 'facility-manager', label: 'Facility manager', description: 'Assets, maintenance and building operations', home: '/facility',
    roles: Object.freeze(['facility_manager'] as const), modules: Object.freeze({ facility: 'manage' } as const),
  }),
  Object.freeze({
    id: 'technician', label: 'Field technician', description: 'Assigned maintenance work and field execution', home: '/facility',
    roles: Object.freeze(['technician'] as const), modules: Object.freeze({ facility: 'manage' } as const),
  }),
  Object.freeze({
    id: 'shortlet-manager', label: 'Shortlet manager', description: 'Properties, bookings and guest operations', home: '/shortlet',
    roles: Object.freeze(['estate_manager'] as const), modules: Object.freeze({ shortlet: 'manage' } as const),
  }),
  Object.freeze({
    id: 'construction-manager', label: 'Construction manager', description: 'Projects, controls and site delivery', home: '/construction',
    roles: Object.freeze(['estate_manager'] as const), modules: Object.freeze({ construction: 'manage' } as const),
  }),
] satisfies readonly DemoPersona[]);

export type DemoPersonaId = (typeof DEMO_PERSONAS)[number]['id'];
export const DEFAULT_DEMO_PERSONA_ID: DemoPersonaId = 'company-owner';

export function demoPersonaById(value: unknown): DemoPersona {
  return DEMO_PERSONAS.find((persona) => persona.id === value)
    ?? DEMO_PERSONAS.find((persona) => persona.id === DEFAULT_DEMO_PERSONA_ID)!;
}
