import Link from 'next/link';
import {
  BarChart3,
  CalendarCheck,
  IdCard,
  ShoppingBag,
  Siren,
  UserPlus,
  Wrench,
  Zap,
  Receipt,
  type LucideIcon,
} from 'lucide-react';

/** The 3×3 quick-action grid (PRD §5.5). Tiles are ≥44px tap targets, link to
 *  the relevant resident surface, and carry an optional "New" badge. */
type Tile = { label: string; icon: LucideIcon; href: string; badge?: 'New'; tint: string };

const TILES: Tile[] = [
  { label: 'Dashboard', icon: BarChart3, href: '/portal/requests', tint: '#2563eb' },
  { label: 'Visitors & Events', icon: UserPlus, href: '/portal/security', tint: '#7c3aed' },
  { label: 'Electricity', icon: Zap, href: '/portal/electricity', tint: '#f59e0b' },
  { label: 'Marketplace', icon: ShoppingBag, href: '/portal/marketplace', badge: 'New', tint: '#0e9f6e' },
  { label: 'Report Issues', icon: Wrench, href: '/portal/requests', tint: '#0891b2' },
  { label: 'Bills & Utilities', icon: Receipt, href: '/portal/bills', tint: '#db2777' },
  { label: 'Amenities', icon: CalendarCheck, href: '/portal/bookings', tint: '#6366f1' },
  { label: 'Emergency', icon: Siren, href: '/portal/security', tint: '#ef4444' },
  { label: 'Profile & IDs', icon: IdCard, href: '/portal/profile', tint: '#64748b' },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {TILES.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="relative flex flex-col items-center justify-center gap-2 min-h-[92px] rounded-2xl border border-border bg-surface p-3 text-center hover:bg-surface-2 hover:-translate-y-0.5 transition-all"
        >
          {t.badge && (
            <span className="absolute top-1.5 right-1.5 text-[9px] font-bold uppercase tracking-wide text-white bg-[color:var(--tone-success)] rounded px-1 py-0.5">
              {t.badge}
            </span>
          )}
          <span className="w-10 h-10 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${t.tint} 14%, transparent)`, color: t.tint }}>
            <t.icon size={19} />
          </span>
          <span className="text-[11.5px] font-medium leading-tight">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}
