'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Menu, X, ArrowRight } from 'lucide-react';
import { brand } from '@/config/brand';

/** Public marketing header. Deliberately carries NO session call — the whole
 *  (marketing) group must stay statically renderable, so "Sign in" is a plain
 *  link to /login, which already forwards an existing session to its home. */

const LINKS = [
  { href: '#platform', label: 'Platform' },
  { href: '#modules', label: 'Modules' },
  { href: '#intelligence', label: 'Intelligence' },
  { href: '#why', label: 'Why Reeve' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock the page behind the mobile sheet.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50 transition-colors"
      style={{
        background: scrolled ? 'color-mix(in srgb, var(--app) 82%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'saturate(180%) blur(12px)' : undefined,
        borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
      }}
    >
      <div className="max-w-[1180px] mx-auto px-5 h-[72px] flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2.5 flex-none" aria-label={`${brand.name} home`}>
          <span className="w-9 h-9 rounded-xl grid place-items-center text-on-primary flex-none" style={{ background: 'var(--primary)' }}>
            <Building2 size={18} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[17px] font-semibold tracking-[-0.02em]">{brand.name}</span>
            <span className="text-[8.5px] text-text-3 font-medium tracking-[0.11em] mt-[3px]">{brand.tagline}</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-7 flex-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-[14px] text-text-2 hover:text-text transition-colors">{l.label}</a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3 flex-none">
          <Link href="/login" className="text-[14px] text-text-2 hover:text-text transition-colors">Sign in</Link>
          <Link
            href="/dashboard"
            className="h-10 px-5 rounded-full inline-flex items-center gap-1.5 text-[14px] font-medium text-on-primary transition-transform hover:-translate-y-px"
            style={{ background: 'var(--primary)' }}
          >
            Open the demo <ArrowRight size={14} />
          </Link>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="lg:hidden ml-auto w-10 h-10 rounded-xl grid place-items-center border border-border-2 flex-none"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-app animate-fade">
          <div className="px-5 py-4 flex flex-col gap-1">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-[15px] py-2.5 text-text-2">{l.label}</a>
            ))}
            <div className="h-px bg-border my-2" />
            <Link href="/login" onClick={() => setOpen(false)} className="text-[15px] py-2.5 text-text-2">Sign in</Link>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="mt-1 h-11 rounded-full inline-flex items-center justify-center gap-1.5 text-[14px] font-medium text-on-primary"
              style={{ background: 'var(--primary)' }}
            >
              Open the demo <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
