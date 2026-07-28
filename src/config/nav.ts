/**
 * Capability-gated navigation.
 *
 * Each item declares the §7 capability it needs; `visibleNav(actor)` drops any
 * item the actor holds no grant on, and drops emptied groups so no role sees an
 * orphan header. `proposed: true` marks an item whose capability mapping the PRD
 * does NOT supply (FM-04 spaces, FM-05 vendors, EM-07 directory, EM-08 docs,
 * SC-10 audit, §11.4 AI) — visible in code rather than buried.
 *
 * The affordance rule the shell enforces on top of this: at level V, mutating
 * controls are REMOVED (not disabled) and a "Read-only" chip shows; at level O,
 * there is no "show all" and KPI counts are computed under the same scope.
 */

import { effectiveLevel, type Actor, type Capability } from '@/lib/authz';
import type { Role } from '@/domain/enums';
import type { IconName } from '@/components/icon';
import type { Shell } from './shells';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  /** Serializable icon name (resolved to a component in the client shell). */
  icon: IconName;
  /** §7 capability that gates visibility. */
  capability: Capability;
  /**
   * Optional role restriction. The portal serves three personas whose
   * capabilities OVERLAP (a resident and a vendor both hold work_orders and
   * marketplace, via different ownership), so capability-gating alone would show
   * a resident the vendor's "My Jobs". Where the capability is not enough to
   * separate personas, name the roles the item is FOR.
   */
  roles?: readonly Role[];
  /** Capability mapping not supplied by the PRD — confirm at discovery. */
  proposed?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

/* --- OPS console (executive, estate/facility managers, technician, security) */

const OPS_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'gauge', capability: 'reports_analytics' }],
  },
  {
    label: 'Facility',
    items: [
      { id: 'work-orders', label: 'Work Orders', href: '/work-orders', icon: 'wrench', capability: 'work_orders' },
      { id: 'assets', label: 'Assets', href: '/assets', icon: 'boxes', capability: 'assets_ppm' },
      { id: 'ppm', label: 'Maintenance Plans', href: '/ppm', icon: 'calendar', capability: 'assets_ppm' },
      { id: 'inspections', label: 'Inspections', href: '/inspections', icon: 'clipboard', capability: 'inspections_compliance' },
      { id: 'spaces', label: 'Spaces', href: '/spaces', icon: 'grid', capability: 'assets_ppm', proposed: true },
      { id: 'vendors', label: 'Vendors', href: '/vendors', icon: 'truck', capability: 'work_orders', proposed: true },
    ],
  },
  {
    label: 'Estate',
    items: [
      { id: 'billing', label: 'Billing', href: '/billing', icon: 'banknote', capability: 'charges_invoicing' },
      { id: 'people', label: 'Residents', href: '/people', icon: 'users', capability: 'users_roles' },
      { id: 'announcements', label: 'Announcements', href: '/announcements', icon: 'bell', capability: 'announcements' },
      { id: 'bookings', label: 'Bookings', href: '/bookings', icon: 'calendar', capability: 'bookings_amenities' },
      { id: 'security', label: 'Security & SOS', href: '/security', icon: 'shield', capability: 'security_sos' },
      { id: 'marketplace', label: 'Marketplace', href: '/marketplace', icon: 'store', capability: 'marketplace' },
      { id: 'documents', label: 'Documents', href: '/documents', icon: 'file', capability: 'announcements', proposed: true },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', href: '/reports', icon: 'trending', capability: 'reports_analytics' },
      { id: 'investors', label: 'Investors', href: '/investors', icon: 'building', capability: 'investor_projects' },
    ],
  },
  {
    // Short-Let PMS (new module). Rides the §7 bookings capability (matrix is
    // CR-locked); role-restricted to operator personas so Security doesn't see it.
    label: 'Short-Let',
    items: [
      { id: 'sl-dash', label: 'Dashboard', href: '/shortlet', icon: 'gauge', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-calendar', label: 'Calendar', href: '/shortlet/calendar', icon: 'calendar', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-bookings', label: 'Bookings', href: '/shortlet/bookings', icon: 'receipt', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-inspections', label: 'Inspections', href: '/shortlet/inspections', icon: 'clipboard', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-expenses', label: 'Expenses', href: '/shortlet/expenses', icon: 'banknote', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-analytics', label: 'Analytics', href: '/shortlet/analytics', icon: 'trending', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-guests', label: 'Guests', href: '/shortlet/guests', icon: 'users', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-reviews', label: 'Reviews', href: '/shortlet/reviews', icon: 'clipboard', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-pricing', label: 'Dynamic pricing', href: '/shortlet/pricing', icon: 'trending', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-maintenance', label: 'Maintenance', href: '/shortlet/maintenance', icon: 'wrench', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-agents', label: 'Agents', href: '/shortlet/agents', icon: 'store', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-whatsapp', label: 'WhatsApp', href: '/shortlet/whatsapp', icon: 'bell', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-channels', label: 'Channels', href: '/shortlet/channels', icon: 'store', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-properties', label: 'Properties', href: '/shortlet/properties', icon: 'boxes', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-team', label: 'Team', href: '/shortlet/team', icon: 'users', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
      { id: 'sl-plan', label: 'Plan & billing', href: '/shortlet/plan', icon: 'banknote', capability: 'bookings_amenities', roles: ['executive', 'estate_manager', 'platform_admin'], proposed: true },
    ],
  },
  {
    label: 'Admin',
    items: [{ id: 'settings', label: 'Settings', href: '/settings', icon: 'settings', capability: 'tenant_config' }],
  },
];

/* --- PORTAL (resident, vendor, investor) — own-records-only surfaces ------- */

const PORTAL_NAV: NavGroup[] = [
  {
    label: 'My home',
    items: [
      { id: 'portal-home', label: 'Home', href: '/portal', icon: 'gauge', capability: 'work_orders', roles: ['resident'] },
      { id: 'requests', label: 'My Requests', href: '/portal/requests', icon: 'checks', capability: 'work_orders', roles: ['resident'] },
      { id: 'bills', label: 'My Bills', href: '/portal/bills', icon: 'receipt', capability: 'charges_invoicing', roles: ['resident'] },
      { id: 'p-bookings', label: 'Bookings', href: '/portal/bookings', icon: 'calendar', capability: 'bookings_amenities', roles: ['resident'] },
      { id: 'sos', label: 'Safety & SOS', href: '/portal/security', icon: 'lifebuoy', capability: 'security_sos', roles: ['resident'] },
      { id: 'shop', label: 'Marketplace', href: '/portal/marketplace', icon: 'shop', capability: 'marketplace', roles: ['resident'] },
      { id: 'p-news', label: 'Announcements', href: '/portal/announcements', icon: 'bell', capability: 'announcements', roles: ['resident'] },
    ],
  },
  {
    label: 'Vendor',
    items: [
      { id: 'jobs', label: 'My Jobs', href: '/portal/jobs', icon: 'wrench', capability: 'work_orders', roles: ['vendor'] },
      { id: 'orders', label: 'Orders', href: '/portal/orders', icon: 'receipt', capability: 'marketplace', roles: ['vendor'] },
      { id: 'listings', label: 'My Listings', href: '/portal/listings', icon: 'package', capability: 'marketplace', roles: ['vendor'] },
    ],
  },
  {
    label: 'Investor',
    items: [
      { id: 'projects', label: 'My Projects', href: '/portal/projects', icon: 'building', capability: 'investor_projects', roles: ['investor'] },
      { id: 'returns', label: 'Returns', href: '/portal/returns', icon: 'trending', capability: 'investor_projects', roles: ['investor'] },
      { id: 'updates', label: 'Updates', href: '/portal/updates', icon: 'bell', capability: 'investor_projects', roles: ['investor'] },
    ],
  },
];

/* --- ADMIN console (platform_admin only) ---------------------------------- */

const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      { id: 'overview', label: 'Overview', href: '/admin/overview', icon: 'gauge', capability: 'tenant_config' },
      { id: 'tenants', label: 'Tenants', href: '/admin/tenants', icon: 'building', capability: 'tenant_config' },
      { id: 'users', label: 'Users & Roles', href: '/admin/users', icon: 'users', capability: 'users_roles' },
      { id: 'investor-projects', label: 'Investor Projects', href: '/admin/investors', icon: 'trending', capability: 'investor_projects' },
      { id: 'admin-reports', label: 'Reports', href: '/admin/reports', icon: 'gauge', capability: 'reports_analytics' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { id: 'audit', label: 'Audit Log', href: '/admin/audit', icon: 'scroll', capability: 'tenant_config', proposed: true },
      { id: 'ai', label: 'AI & Usage', href: '/admin/ai', icon: 'sparkles', capability: 'tenant_config', proposed: true },
      { id: 'requirements', label: 'Requirements', href: '/admin/requirements', icon: 'checks', capability: 'tenant_config' },
    ],
  },
];

const NAV_BY_SHELL: Record<Shell, NavGroup[]> = {
  ops: OPS_NAV,
  portal: PORTAL_NAV,
  admin: ADMIN_NAV,
};

/** Nav groups visible to this actor in this shell — capability- and role-gated. */
export function visibleNav(shell: Shell, actor: Actor): NavGroup[] {
  return NAV_BY_SHELL[shell]
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => {
        if (effectiveLevel(actor, item.capability) === 'none') return false;
        // Where the capability does not separate personas, honour the role list.
        if (item.roles && !item.roles.some((r) => actor.roles.includes(r))) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

/** Page title + subtitle per route. */
export const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Your operation at a glance' },
  '/work-orders': { title: 'Work Orders', subtitle: 'Every maintenance job from request to close' },
  '/assets': { title: 'Assets', subtitle: 'The register of everything under management' },
  '/ppm': { title: 'Maintenance Plans', subtitle: 'Preventive maintenance, scheduled before failure' },
  '/inspections': { title: 'Inspections', subtitle: 'Compliance, evidenced not assumed' },
  '/spaces': { title: 'Spaces', subtitle: 'Estate → building → floor → unit' },
  '/vendors': { title: 'Vendors', subtitle: 'Your approved contractor network' },
  '/billing': { title: 'Billing', subtitle: 'Service charges, collection and arrears' },
  '/people': { title: 'Residents', subtitle: 'Who lives on the estate, and their units' },
  '/announcements': { title: 'Announcements', subtitle: 'Reach the right residents on the right channel' },
  '/bookings': { title: 'Bookings', subtitle: 'Amenity reservations and availability' },
  '/security': { title: 'Security & SOS', subtitle: 'Live alerts, patrols and incidents' },
  '/marketplace': { title: 'Marketplace', subtitle: 'Vendor listings and resident orders' },
  '/documents': { title: 'Documents', subtitle: 'Estate documents, shared by audience' },
  '/reports': { title: 'Reports', subtitle: 'Portfolio performance and KPIs' },
  '/investors': { title: 'Investors', subtitle: 'Off-plan projects, sales and returns' },
  '/settings': { title: 'Settings', subtitle: 'Estate configuration and preferences' },
  '/shortlet': { title: 'Short-Let', subtitle: 'Your short-let portfolio at a glance' },
  '/shortlet/calendar': { title: 'Calendar', subtitle: 'Occupancy across every unit' },
  '/shortlet/bookings': { title: 'Bookings', subtitle: 'Stays, payments and caution fees' },
  '/shortlet/inspections': { title: 'Inspections', subtitle: 'Checkout inspections and caution decisions' },
  '/shortlet/expenses': { title: 'Expenses', subtitle: 'Know your real profit — diesel included' },
  '/shortlet/analytics': { title: 'Analytics', subtitle: 'Revenue, occupancy and source performance' },
  '/shortlet/guests': { title: 'Guests', subtitle: 'Your guest CRM — repeat and VIP guests' },
  '/shortlet/reviews': { title: 'Reviews', subtitle: 'Guest feedback after their stay' },
  '/shortlet/pricing': { title: 'Dynamic pricing', subtitle: 'Seasonal rate rules per apartment' },
  '/shortlet/maintenance': { title: 'Maintenance', subtitle: 'Issue tracker across your units' },
  '/shortlet/agents': { title: 'Agents', subtitle: 'Agent performance and commission' },
  '/shortlet/whatsapp': { title: 'WhatsApp', subtitle: 'Automated guest messaging' },
  '/shortlet/channels': { title: 'Channels', subtitle: 'iCal sync and double-booking guard' },
  '/shortlet/team': { title: 'Team', subtitle: 'Members and role-based access' },
  '/shortlet/plan': { title: 'Plan & billing', subtitle: 'Your subscription and apartment usage' },
  '/shortlet/properties': { title: 'Properties', subtitle: 'Buildings, apartments and access details' },
  '/portal': { title: 'My Estate', subtitle: 'Everything for your home in one place' },
  '/portal/requests': { title: 'My Requests', subtitle: 'Maintenance you have raised' },
  '/portal/bills': { title: 'My Bills', subtitle: 'Your service charges and payments' },
  '/portal/bookings': { title: 'Bookings', subtitle: 'Book shared amenities' },
  '/portal/security': { title: 'Safety & SOS', subtitle: 'Raise an alert, manage visitor passes' },
  '/portal/marketplace': { title: 'Marketplace', subtitle: 'Buy from approved vendors' },
  '/portal/announcements': { title: 'Announcements', subtitle: 'Updates from your estate' },
  '/portal/jobs': { title: 'My Jobs', subtitle: 'Work assigned to you' },
  '/portal/orders': { title: 'Orders', subtitle: 'Accept and fulfil resident orders' },
  '/portal/listings': { title: 'My Listings', subtitle: 'Your marketplace products and services' },
  '/portal/projects': { title: 'My Projects', subtitle: 'Your off-plan investments' },
  '/portal/returns': { title: 'Returns', subtitle: 'Project your investment returns' },
  '/portal/updates': { title: 'Updates', subtitle: 'Construction progress and documents' },
  '/admin/overview': { title: 'Platform Overview', subtitle: 'Tenants, revenue, AI spend and system health' },
  '/admin/tenants': { title: 'Tenants', subtitle: 'Organisations on the platform' },
  '/admin/users': { title: 'Users & Roles', subtitle: 'Everyone across every tenant' },
  '/admin/investors': { title: 'Investor Projects', subtitle: 'Off-plan projects platform-wide' },
  '/admin/reports': { title: 'Reports', subtitle: 'Cross-tenant platform analytics' },
  '/admin/audit': { title: 'Audit Log', subtitle: 'Who did what, when (SC-10)' },
  '/admin/ai': { title: 'AI & Usage', subtitle: 'Feature flags, caps and metering' },
  '/admin/requirements': { title: 'Requirements', subtitle: 'PRD traceability — every screen to its ids' },
};
