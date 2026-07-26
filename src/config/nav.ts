/**
 * Navigation definition.
 *
 * The template grouped its modules as Overview / Operations / Admin. Redefine
 * this list to reshape the sidebar — the shell renders whatever is here.
 */

import {
  Building2,
  Fuel,
  Gauge,
  Settings,
  Truck,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/', icon: Gauge },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'loads', label: 'Loads', href: '/loads', icon: Truck, badge: '12' },
      { id: 'maintenance', label: 'Maintenance', href: '/maintenance', icon: Wrench },
      { id: 'carriers', label: 'Carriers & Brokers', href: '/carriers', icon: Users },
      { id: 'fuel', label: 'Fuel', href: '/fuel', icon: Fuel },
      { id: 'customers', label: 'Customers', href: '/customers', icon: Building2 },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'staff', label: 'Staff', href: '/staff', icon: UsersRound },
      { id: 'settings', label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

/** Header title + subtitle per route, mirroring the template's copy. */
export const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Your operation at a glance' },
  '/loads': { title: 'Loads', subtitle: 'Every move from draft to invoiced' },
  '/maintenance': { title: 'Maintenance', subtitle: 'Fleet, drivers & live positions' },
  '/carriers': { title: 'Carriers & Brokers', subtitle: 'Your hire, broker & carrier-for network' },
  '/fuel': { title: 'Fuel', subtitle: 'Cards, transactions, rebates & statements' },
  '/customers': { title: 'Customers', subtitle: 'Shippers you move freight for' },
  '/staff': { title: 'Staff', subtitle: 'Your team and their roles' },
  '/settings': { title: 'Settings', subtitle: 'Company profile, permissions & preferences' },
};
