'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { PropbrewLogo } from '@/components/brand/propbrew-logo';
import { brand } from '@/config/brand';

const LINKS = [
  { href: '#platform', label: 'Platform' },
  { href: '#intelligence', label: 'Intelligence' },
  { href: '#why', label: 'Why Propbrew' },
  { href: '#faq', label: 'FAQ' },
];

/** Public navigation stays independent of authentication and tenant state. */
export function SiteHeader({ websiteOnly = false }: { websiteOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = menuRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex="0"]',
      );
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', onResize);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onResize);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      else trigger?.focus();
    };
  }, [open]);

  return (
    <header className="pb-header">
      <div className="pb-header-inner">
        <Link href="/" className="pb-home-link" aria-label={`${brand.name} home`}>
          <PropbrewLogo />
        </Link>

        <nav className="pb-nav" aria-label="Primary navigation">
          {LINKS.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>

        <div className="pb-header-actions">
          {!websiteOnly && <Link href="/login" className="pb-sign-in">Sign in</Link>}
          <Link href={websiteOnly ? '/#platform' : '/dashboard'} className="pb-button pb-button-primary">
            {websiteOnly ? 'Explore the preview' : 'Explore the demo'} <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="pb-menu-button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="propbrew-mobile-menu"
        >
          <Menu size={23} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div
          ref={menuRef}
          id="propbrew-mobile-menu"
          className="pb-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="pb-mobile-menu-top">
            <Link href="/" onClick={() => setOpen(false)} aria-label={`${brand.name} home`}>
              <PropbrewLogo />
            </Link>
            <button ref={closeRef} type="button" className="pb-menu-button" onClick={() => setOpen(false)} aria-label="Close navigation menu">
              <X size={23} aria-hidden="true" />
            </button>
          </div>
          <nav className="pb-mobile-nav" aria-label="Mobile navigation">
            {LINKS.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
          </nav>
          <div className="pb-mobile-actions">
            {!websiteOnly && <Link href="/login" className="pb-sign-in" onClick={() => setOpen(false)}>Sign in</Link>}
            <Link href={websiteOnly ? '/#platform' : '/dashboard'} className="pb-button pb-button-primary" onClick={() => setOpen(false)}>
              {websiteOnly ? 'Explore the preview' : 'Explore the demo'} <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
