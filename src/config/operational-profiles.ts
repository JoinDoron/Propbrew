import type { Role } from '@/domain/enums';
import type { Capability } from '@/lib/authz/matrix';
import type { Action } from '@/lib/authz/policy';
import type { WorkspaceId } from './workspaces';

export type AssignmentScope = 'company' | 'estate' | 'building' | 'unit' | 'vendor';
export type ProfileAccess = 'manage' | 'view';

export type OperationalProfile = {
  id: string;
  workspace: WorkspaceId;
  label: string;
  description: string;
  home: string;
  access: ProfileAccess;
  roles: readonly Role[];
  scope: AssignmentScope;
  capabilities?: Readonly<Partial<Record<Capability, ProfileAccess>>>;
  capabilityActions?: Readonly<Partial<Record<Capability, readonly Action[]>>>;
};

const profile = (value: OperationalProfile) => Object.freeze(value);
const cap = (value: Partial<Record<Capability, ProfileAccess>>) => Object.freeze(value);
const verbs = (value: Partial<Record<Capability, readonly Action[]>>) => Object.freeze(value);

export const OPERATIONAL_PROFILES = Object.freeze([
  // Estate
  profile({ id: 'portfolio-manager', workspace: 'estate', label: 'Portfolio / Regional manager', description: 'Company-wide portfolio performance and Estate operations', home: '/estate', access: 'manage', roles: ['estate_manager'], scope: 'company' }),
  profile({ id: 'property-manager', workspace: 'estate', label: 'Property / Block manager', description: 'Residents, property operations and assigned-site delivery', home: '/estate', access: 'manage', roles: ['estate_manager'], scope: 'building', capabilities: cap({ users_roles: 'manage', assets_ppm: 'view', work_orders: 'manage', inspections_compliance: 'view', charges_invoicing: 'view', announcements: 'manage', bookings_amenities: 'manage', security_sos: 'manage', marketplace: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'finance-officer', workspace: 'estate', label: 'Finance / Accounts officer', description: 'Invoices, receivables, reconciliation and financial reporting', home: '/finance', access: 'manage', roles: ['estate_manager'], scope: 'company', capabilities: cap({ users_roles: 'view', charges_invoicing: 'manage', reports_analytics: 'view' }) }),
  profile({ id: 'collections-officer', workspace: 'estate', label: 'Collections officer', description: 'Arrears, payment follow-up and collection records', home: '/collections', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilities: cap({ users_roles: 'view', charges_invoicing: 'manage', announcements: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'leasing-officer', workspace: 'estate', label: 'Leasing / Tenancy officer', description: 'Resident onboarding, tenancies, renewals and move workflows', home: '/tenancy', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilities: cap({ tenant_config: 'view', users_roles: 'manage', charges_invoicing: 'view', announcements: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'community-officer', workspace: 'estate', label: 'Community / Resident experience officer', description: 'Announcements, amenities, events and resident engagement', home: '/community', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilities: cap({ users_roles: 'view', announcements: 'manage', bookings_amenities: 'manage', security_sos: 'view', marketplace: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'concierge', workspace: 'estate', label: 'Front desk / Concierge', description: 'Visitors, parcels, bookings and resident assistance', home: '/bookings', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilities: cap({ users_roles: 'view', announcements: 'view', bookings_amenities: 'manage', security_sos: 'manage', marketplace: 'view' }), capabilityActions: verbs({ security_sos: ['read', 'create', 'update', 'transition'] }) }),
  profile({ id: 'security-supervisor', workspace: 'estate', label: 'Security supervisor', description: 'SOS command, incidents, access operations and response oversight', home: '/security', access: 'manage', roles: ['security'], scope: 'estate', capabilities: cap({ announcements: 'view', bookings_amenities: 'view', security_sos: 'manage' }) }),
  profile({ id: 'security-guard', workspace: 'estate', label: 'Security guard', description: 'Assigned gate, patrol, visitor and incident execution', home: '/security', access: 'manage', roles: ['security'], scope: 'estate', capabilities: cap({ announcements: 'view', security_sos: 'manage' }), capabilityActions: verbs({ security_sos: ['read', 'create', 'update', 'transition'] }) }),
  profile({ id: 'board-approver', workspace: 'estate', label: 'Board / Committee approver', description: 'Governance review and bounded approval decisions', home: '/board', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilities: cap({ users_roles: 'view', charges_invoicing: 'view', announcements: 'manage', bookings_amenities: 'manage', security_sos: 'view', reports_analytics: 'view' }), capabilityActions: verbs({ announcements: ['read', 'approve'], bookings_amenities: ['read', 'approve'] }) }),
  profile({ id: 'auditor', workspace: 'estate', label: 'Auditor / Compliance viewer', description: 'Read-only evidence, controls, reports and audit review', home: '/reports', access: 'view', roles: ['executive'], scope: 'company' }),
  profile({ id: 'landlord', workspace: 'estate', label: 'Property owner / Landlord', description: 'Assigned-property income, tenancy and maintenance visibility', home: '/portfolio', access: 'view', roles: ['executive'], scope: 'estate', capabilities: cap({ users_roles: 'view', work_orders: 'view', charges_invoicing: 'view', announcements: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'resident', workspace: 'estate', label: 'Resident / Tenant', description: 'Own home, bills, requests, bookings and community services', home: '/portal', access: 'manage', roles: ['resident'], scope: 'unit', capabilities: cap({ users_roles: 'manage', work_orders: 'manage', charges_invoicing: 'view', payments_in_app: 'manage', announcements: 'view', bookings_amenities: 'manage', security_sos: 'manage', marketplace: 'manage' }) }),

  // Facility
  profile({ id: 'facility-manager', workspace: 'facility', label: 'Facility manager', description: 'Building operations, service delivery and team oversight', home: '/facility', access: 'manage', roles: ['facility_manager'], scope: 'company' }),
  profile({ id: 'maintenance-supervisor', workspace: 'facility', label: 'Maintenance supervisor', description: 'Work-order triage, technicians, schedules and SLA delivery', home: '/work-orders', access: 'manage', roles: ['facility_manager'], scope: 'estate', capabilities: cap({ users_roles: 'view', assets_ppm: 'manage', work_orders: 'manage', inspections_compliance: 'view', announcements: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'asset-ppm-officer', workspace: 'facility', label: 'Asset & PPM officer', description: 'Asset register, preventive plans and service history', home: '/assets', access: 'manage', roles: ['facility_manager'], scope: 'estate', capabilities: cap({ assets_ppm: 'manage', work_orders: 'view', inspections_compliance: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'facility-helpdesk', workspace: 'facility', label: 'Helpdesk coordinator', description: 'Requests, dispatch, resident updates and SLA follow-up', home: '/work-orders', access: 'manage', roles: ['facility_manager'], scope: 'estate', capabilities: cap({ users_roles: 'view', work_orders: 'manage', announcements: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'field-technician', workspace: 'facility', label: 'Field technician', description: 'Assigned jobs, evidence capture and mobile execution', home: '/field', access: 'manage', roles: ['technician'], scope: 'estate', capabilities: cap({ assets_ppm: 'view', work_orders: 'manage', inspections_compliance: 'manage' }) }),
  profile({ id: 'inventory-storekeeper', workspace: 'facility', label: 'Inventory / Storekeeper', description: 'Parts, stock issues, reorder levels and evidence', home: '/inventory', access: 'manage', roles: ['facility_manager'], scope: 'estate', capabilities: cap({ assets_ppm: 'manage', work_orders: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'facility-hse', workspace: 'facility', label: 'HSE / Compliance officer', description: 'Permits, inspections, incidents and compliance evidence', home: '/safety', access: 'manage', roles: ['facility_manager'], scope: 'estate', capabilities: cap({ assets_ppm: 'view', work_orders: 'view', inspections_compliance: 'manage', announcements: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'energy-utilities-officer', workspace: 'facility', label: 'Energy & Utilities officer', description: 'Power, water, diesel, meters and sustainability records', home: '/energy', access: 'manage', roles: ['facility_manager'], scope: 'estate', capabilities: cap({ assets_ppm: 'manage', work_orders: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'vendor-manager', workspace: 'facility', label: 'Vendor / Contract manager', description: 'Vendor onboarding, compliance, contracts and performance', home: '/vendors', access: 'manage', roles: ['facility_manager'], scope: 'company', capabilities: cap({ users_roles: 'manage', work_orders: 'manage', inspections_compliance: 'view', reports_analytics: 'view' }) }),
  profile({ id: 'vendor-technician', workspace: 'facility', label: 'Vendor technician / Contractor', description: 'Only jobs assigned to the selected vendor organisation', home: '/portal/jobs', access: 'manage', roles: ['vendor'], scope: 'vendor', capabilities: cap({ users_roles: 'manage', work_orders: 'manage' }) }),
  profile({ id: 'facility-auditor', workspace: 'facility', label: 'Facility auditor / Viewer', description: 'Read-only operations, compliance and performance review', home: '/facility', access: 'view', roles: ['executive'], scope: 'company' }),

  // Shortlet
  profile({ id: 'shortlet-owner', workspace: 'shortlet', label: 'Shortlet owner / Executive', description: 'Portfolio visibility, approvals and performance', home: '/shortlet', access: 'view', roles: ['executive'], scope: 'company' }),
  profile({ id: 'shortlet-manager', workspace: 'shortlet', label: 'Shortlet operations manager', description: 'Properties, bookings, guests and operating performance', home: '/shortlet', access: 'manage', roles: ['estate_manager'], scope: 'company' }),
  profile({ id: 'reservations-agent', workspace: 'shortlet', label: 'Reservations agent', description: 'Availability, bookings, deposits and modifications', home: '/shortlet/bookings', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'guest-experience', workspace: 'shortlet', label: 'Guest experience / Concierge', description: 'Guest verification, check-in, messages and service recovery', home: '/shortlet/guests', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'revenue-manager', workspace: 'shortlet', label: 'Revenue / Pricing manager', description: 'Rates, occupancy forecasting and revenue strategy', home: '/shortlet/pricing', access: 'manage', roles: ['estate_manager'], scope: 'company' }),
  profile({ id: 'housekeeping-supervisor', workspace: 'shortlet', label: 'Housekeeping supervisor', description: 'Turnover planning, inspections and team assignments', home: '/shortlet/operations', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'housekeeper', workspace: 'shortlet', label: 'Housekeeper', description: 'Assigned turnovers, checklists and evidence capture', home: '/shortlet/operations', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilityActions: verbs({ bookings_amenities: ['read', 'update', 'transition'] }) }),
  profile({ id: 'shortlet-maintenance', workspace: 'shortlet', label: 'Shortlet maintenance coordinator', description: 'Damage reports and maintenance handoff', home: '/shortlet/maintenance', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'shortlet-finance', workspace: 'shortlet', label: 'Shortlet finance officer', description: 'Deposits, refunds, expenses and reconciliation', home: '/shortlet/expenses', access: 'manage', roles: ['estate_manager'], scope: 'company' }),
  profile({ id: 'channel-manager', workspace: 'shortlet', label: 'Channel distribution manager', description: 'Airbnb, Booking.com and listing synchronisation', home: '/shortlet/channels', access: 'manage', roles: ['estate_manager'], scope: 'company' }),
  profile({ id: 'shortlet-property-owner', workspace: 'shortlet', label: 'Shortlet property owner', description: 'Assigned-property bookings, earnings and condition', home: '/shortlet/analytics', access: 'view', roles: ['executive'], scope: 'estate' }),
  profile({ id: 'shortlet-auditor', workspace: 'shortlet', label: 'Shortlet auditor / Viewer', description: 'Read-only guest, payment and operating evidence', home: '/shortlet/analytics', access: 'view', roles: ['executive'], scope: 'company' }),

  // Construction
  profile({ id: 'developer-executive', workspace: 'construction', label: 'Developer / Executive', description: 'Portfolio outcomes, cash exposure and project governance', home: '/construction', access: 'view', roles: ['executive'], scope: 'company' }),
  profile({ id: 'project-director', workspace: 'construction', label: 'Project director', description: 'Multi-project delivery, approvals and executive control', home: '/construction', access: 'manage', roles: ['estate_manager'], scope: 'company' }),
  profile({ id: 'project-manager', workspace: 'construction', label: 'Project manager', description: 'Scope, cost, programme, people and delivery decisions', home: '/construction/projects', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'site-manager', workspace: 'construction', label: 'Site manager', description: 'Daily site execution, labour, evidence and coordination', home: '/construction/site', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'quantity-surveyor', workspace: 'construction', label: 'Quantity surveyor / Cost controller', description: 'BOQ, valuations, variations, claims and cost reporting', home: '/construction/boq', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'procurement-officer', workspace: 'construction', label: 'Procurement officer', description: 'RFQs, purchase orders, vendors and delivery control', home: '/construction/procurement', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'construction-finance', workspace: 'construction', label: 'Construction finance officer', description: 'Payments, WHT, cash commitments and reconciliation', home: '/construction/operations', access: 'manage', roles: ['estate_manager'], scope: 'company' }),
  profile({ id: 'planning-engineer', workspace: 'construction', label: 'Planning / Schedule engineer', description: 'Programme, look-ahead, dependencies and delay forecasting', home: '/construction/schedule', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'construction-hse', workspace: 'construction', label: 'HSE / Safety officer', description: 'Safety observations, permits, incidents and compliance', home: '/construction/safety', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'quality-inspector', workspace: 'construction', label: 'Quality control / Inspector', description: 'Inspections, defects, evidence and close-out', home: '/construction/field', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'site-engineer', workspace: 'construction', label: 'Site engineer', description: 'Technical execution, progress evidence and field records', home: '/construction/field', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'materials-storekeeper', workspace: 'construction', label: 'Materials / Storekeeper', description: 'Receipts, issues, stock and material traceability', home: '/construction/stock', access: 'manage', roles: ['estate_manager'], scope: 'estate' }),
  profile({ id: 'subcontractor', workspace: 'construction', label: 'Subcontractor', description: 'Assigned packages, claims, evidence and compliance', home: '/construction/field', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilityActions: verbs({ reports_analytics: ['read', 'create', 'update', 'transition'] }) }),
  profile({ id: 'construction-field-worker', workspace: 'construction', label: 'Construction field worker', description: 'Assigned tasks, attendance and mobile evidence capture', home: '/construction/field', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilityActions: verbs({ reports_analytics: ['read', 'update', 'transition'] }) }),
  profile({ id: 'client-investor', workspace: 'construction', label: 'Client / Investor', description: 'Read-only authorised project progress and commercial view', home: '/construction/projects', access: 'view', roles: ['executive'], scope: 'estate' }),
  profile({ id: 'consultant-approver', workspace: 'construction', label: 'Consultant / Approver', description: 'Review evidence and record bounded approval decisions', home: '/construction/approvals', access: 'manage', roles: ['estate_manager'], scope: 'estate', capabilityActions: verbs({ reports_analytics: ['read', 'approve', 'export'] }) }),
] satisfies readonly OperationalProfile[]);

export type OperationalProfileId = (typeof OPERATIONAL_PROFILES)[number]['id'];

export function operationalProfileById(value: unknown): OperationalProfile | undefined {
  return typeof value === 'string' ? OPERATIONAL_PROFILES.find((entry) => entry.id === value) : undefined;
}

export const PROFILES_BY_WORKSPACE = Object.freeze(Object.fromEntries(
  (['estate', 'facility', 'shortlet', 'construction'] as const).map((workspace) =>
    [workspace, Object.freeze(OPERATIONAL_PROFILES.filter((profile) => profile.workspace === workspace))]),
) as Record<WorkspaceId, readonly OperationalProfile[]>);
