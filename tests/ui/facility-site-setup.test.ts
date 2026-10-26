import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FacilitySiteCreate, FacilitySiteForm } from '@/components/spaces/facility-site-create';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/facility-site-setup', () => ({ createFacilitySite: vi.fn() }));
const noop = () => {};
describe('Facility-only Spaces bootstrap UI', () => {
  it('exposes the native site entry only to allowed managers', () => {
    expect(renderToStaticMarkup(createElement(FacilitySiteCreate, { companyId: 'company', canCreate: true }))).toContain('Add facility site');
    expect(renderToStaticMarkup(createElement(FacilitySiteCreate, { companyId: 'company', canCreate: false }))).toBe('');
  });
  it('provides an accessible company-bound dialog and honest empty site description', () => {
    const html = renderToStaticMarkup(createElement(FacilitySiteForm, { expectedCompanyId: 'company', onClose: noop, onSaved: noop }));
    expect(html).toContain('aria-label="Add facility site"'); expect(html).toContain('Facility site name'); expect(html).toContain('Address'); expect(html).toContain('Create facility site'); expect(html).toContain('buildings, units and equipment are not invented'); expect(html.match(/<label/g)).toHaveLength(2);
    const source = readFileSync(new URL('../../src/components/spaces/facility-site-create.tsx', import.meta.url), 'utf8');
    for (const item of ['expectedCompanyId', 'idempotencyKey', 'pending={pending}', 'if (pending)', 'role="alert"', 'catch']) expect(source).toContain(item);
    expect(source).not.toContain('/estate');
  });
  it('keeps creation in Spaces and links an empty Facility overview to that location setup', () => {
    const page = readFileSync(new URL('../../src/app/(ops)/(facility)/spaces/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('actor.allEstates'); expect(page).toContain("can(actor, 'assets_ppm', 'create').allowed"); expect(page).toContain('FacilitySiteCreate');
    const overview = readFileSync(new URL('../../src/app/(ops)/(facility)/control-center/page.tsx', import.meta.url), 'utf8'); expect(overview).toContain('href="/spaces"'); expect(overview).toContain('sites.size === 0');
  });
});
