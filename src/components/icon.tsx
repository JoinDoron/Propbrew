'use client';

/**
 * Icon registry. Nav is built on the server (getActor) and rendered in the
 * client shell, so nav items carry a string icon NAME (serializable) rather
 * than a component reference (not serializable across the RSC boundary). This
 * maps the name back to a Lucide icon.
 */

import {
  Banknote,
  Bell,
  Boxes,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Gauge,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const ICONS = {
  banknote: Banknote,
  bell: Bell,
  boxes: Boxes,
  building: Building2,
  calendar: CalendarCheck,
  clipboard: ClipboardCheck,
  file: FileText,
  gauge: Gauge,
  grid: LayoutGrid,
  lifebuoy: LifeBuoy,
  checks: ListChecks,
  package: Package,
  receipt: Receipt,
  scroll: ScrollText,
  settings: Settings,
  shield: ShieldAlert,
  shop: ShoppingBag,
  sparkles: Sparkles,
  store: Store,
  trending: TrendingUp,
  truck: Truck,
  users: Users,
  wrench: Wrench,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const Cmp: LucideIcon = ICONS[name];
  return <Cmp size={size} className={className} />;
}
