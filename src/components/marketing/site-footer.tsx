import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { brand } from '@/config/brand';

/** Public footer. Every link resolves to something that exists — anchors on this
 *  page, /login, or a real app route. No dead legal stubs. */

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Platform',
    links: [
      { href: '#platform', label: 'How it works' },
      { href: '#modules', label: 'Every module' },
      { href: '#intelligence', label: 'Intelligence' },
      { href: '#why', label: 'Why Reeve' },
      { href: '#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Modules',
    links: [
      { href: '/construction', label: 'Construction' },
      { href: '/control-center', label: 'Facilities' },
      { href: '/collections', label: 'Estate' },
      { href: '/shortlet', label: 'Short-Let' },
      { href: '/portfolio', label: 'Portfolio & investors' },
    ],
  },
  {
    title: 'Access',
    links: [
      { href: '/dashboard', label: 'Open the demo' },
      { href: '/login', label: 'Sign in' },
      { href: '/portal', label: 'Resident portal' },
      { href: '/admin/overview', label: 'Platform admin' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-[1180px] mx-auto px-5 py-14">
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10 md:gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl grid place-items-center text-on-primary flex-none" style={{ background: 'var(--primary)' }}>
                <Building2 size={18} />
              </span>
              <span className="text-[17px] font-semibold tracking-[-0.02em]">{brand.name}</span>
            </div>
            <p className="text-[13.5px] text-text-2 leading-relaxed mt-3.5 max-w-[300px]">
              One operating system for the property lifecycle — develop, operate, occupy, invest.
              Built for how real estate actually runs in Nigeria.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-3">{col.title}</div>
              <ul className="mt-3.5 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-[13.5px] text-text-2 hover:text-text transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-border flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[12.5px] text-text-3">
            © {new Date().getFullYear()} {brand.name}. Built for {brand.client}.
          </p>
          <p className="text-[12.5px] text-text-3">Lagos, Nigeria · figures shown are demo data</p>
        </div>
      </div>
    </footer>
  );
}
