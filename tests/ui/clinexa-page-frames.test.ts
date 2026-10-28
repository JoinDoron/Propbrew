import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '@/components/ui/page-header';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const framedRoutes = [
  '(ops)/(estate)/announcements', '(ops)/(estate)/billing', '(ops)/(estate)/bookings',
  '(ops)/(estate)/investors', '(ops)/(estate)/marketplace', '(ops)/(estate)/people',
  '(ops)/(estate)/reports', '(ops)/(estate)/security', '(ops)/(facility)/assets',
  '(ops)/(facility)/inspections', '(ops)/(facility)/ppm', '(ops)/(facility)/vendors',
  '(ops)/(facility)/work-orders', '(ops)/(facility)/spaces',
];

describe('Clinexa-derived authenticated page framing', () => {
  it('stays server-compatible with no state or client-only dependencies', () => {
    const component = read('src/components/ui/page-header.tsx');
    expect(component).not.toMatch(/['"]use client['"]|useState|useEffect|window\.|localStorage/);
    expect(component).toContain('import type { ReactNode }');
  });

  it('uses a page heading beneath the shell landmark, without making another h1', () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { title: 'Residents', subtitle: 'People & households' }));
    expect(html).toContain('data-page-header="true"');
    expect(html).toContain('>Residents</h2>');
    expect(html).toContain('People &amp; households');
    expect(html).not.toContain('<h1');
  });

  it('renders only supplied actions and scope while keeping their actual controls intact', () => {
    const basic = renderToStaticMarkup(createElement(PageHeader, { title: 'Assets' }));
    expect(basic).not.toContain('<p');
    expect(basic).not.toContain('<button');
    const detailed = renderToStaticMarkup(createElement(PageHeader, {
      title: 'Residents',
      scope: createElement('span', null, 'Viewing 1 estate'),
      actions: createElement('button', { type: 'button', disabled: true }, 'Add tenant'),
    }));
    expect(detailed).toContain('Viewing 1 estate');
    expect(detailed).toContain('type="button" disabled=""');
    expect(detailed).toContain('Add tenant');
  });

  it('keeps the platform heading hierarchy, whitespace and theme-aware inks in one shared module', () => {
    const css = read('src/components/ui/page-header.module.css');
    expect(css).toContain('--page-heading-size: clamp(22px, 2vw, 28px)');
    expect(css).toContain('font-size: var(--page-heading-size)');
    expect(css).toContain('font-weight: 600');
    expect(css).toContain('--page-supporting-size: 13px');
    expect(css).toContain('font-size: var(--page-supporting-size)');
    expect(css).toContain('gap: 4px');
    expect(css).toContain('gap: 12px');
    expect(css).toContain('color: var(--text)');
    expect(css).toContain('color: var(--text-3)');
    expect(css).not.toMatch(/#[a-f\d]{3,8}\b/i);
    expect(css).toContain('@media (max-width: 639px)');
    expect(css).toContain('flex-wrap: wrap');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('.scope > *');
    expect(css).toMatch(/\}\s*\/\*[\s\S]*?\*\/\s*\.scope > \*\s*\{\s*margin: 0;/);
  });

  it.each(framedRoutes)('frames %s without replacing its scoped server guard', (route) => {
    const page = read(`src/app/${route}/page.tsx`);
    expect(page).toContain("from '@/components/ui/page-header'");
    expect(page).toContain('<PageHeader');
    expect(page).toContain('scope={<ScopeBanner');
    expect(page).toContain('await requireCapability(');
    expect(page.indexOf('await requireCapability(')).toBeLessThan(page.indexOf('return ('));
    expect(page).not.toContain('<CardHeader');
    expect(page).toContain('className="pb-page"');
  });

  it('keeps residents capability-filtered and serializes no new ledger or person fields', () => {
    const page = read('src/app/(ops)/(estate)/people/page.tsx');
    expect(page).toContain('title="Residents"');
    expect(page).toContain('subtitle="The people, households and tenancies across your estate."');
    for (const property of ['seesBills', 'seesRequests', 'seesBookings', 'canMutate']) {
      expect(page).toContain(`${property}={${property}}`);
    }
    expect(page).toContain("balanceLabel: !seesBills ? '—'");
    expect(page).toContain('residents={rows}');
  });

  it('removes conflicting broad page centering and composes resident cards with responsive grids', () => {
    const findPages = (directory: URL): URL[] => readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => entry.isDirectory() ? findPages(new URL(`${entry.name}/`, directory)) : entry.name === 'page.tsx' ? [new URL(entry.name, directory)] : []);
    for (const root of ['(ops)', '(admin)', '(portal)']) {
      for (const file of findPages(new URL(`../../src/app/${root}/`, import.meta.url))) {
        expect(readFileSync(file, 'utf8')).not.toMatch(/max-w-\[(?:1100|1200)px\] mx-auto/);
      }
    }
    for (const route of ['electricity', 'profile']) {
      const page = read(`src/app/(portal)/portal/${route}/page.tsx`);
      expect(page).toContain('layout.analytics');
      expect(page).toContain('<PageTabs label=');
      expect(page).not.toMatch(/max-w-\[\d+px\]/);
    }
  });

  it('retains nested panel headings rather than turning every card into a page title', () => {
    expect(read('src/app/(admin)/admin/requirements/page.tsx')).toContain('<CardHeader title="Requirements"');
    expect(read('src/app/(ops)/(estate)/settings/page.tsx')).toContain('<CardHeader title="Organisation profile"');
    expect(read('src/app/(portal)/portal/profile/page.tsx')).toContain('<CardHeader title="My units"');
  });
});
