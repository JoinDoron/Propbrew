import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FacilityInventorySetup } from '@/components/facility/inventory-setup';
import type { FacilityPartView } from '@/server/reads/facility-inventory';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/facility-inventory', () => ({ createFacilityPart: vi.fn(), updateFacilityPart: vi.fn(), recordFacilityStockMovement: vi.fn(), archiveFacilityPart: vi.fn() }));
const site = { id: 'site', name: 'Victoria Court' };
const part = { tenantId: 'company', siteId: 'site', id: 'part', name: 'Generator fuel filter', sku: 'FILTER-1', category: 'Generator parts', location: 'Store A', stock: 5, reorderPoint: 2, usedPerMonth: 1, unitCost: { minor: 29, currency: 'NGN' }, metadata: { tenantId: 'company', partId: 'part', siteId: 'site', unitOfMeasure: 'pieces', version: 1, status: 'active', createdAt: '2026-10-26T12:00:00.000Z', createdBy: 'operator', updatedAt: '2026-10-26T12:00:00.000Z', updatedBy: 'operator' }, snapshot: '[]', siteName: site.name } as FacilityPartView;
const props = { parts: [], movements: [], totalMovements: 0, nextBefore: null, sites: [site], expectedCompanyId: 'company', canCreate: true, canMutate: true };
describe('native Facility stock setup presentation', () => {
  it('shows an honest empty register and configured stock/movement tabs', () => {
    const html = renderToStaticMarkup(createElement(FacilityInventorySetup, props));
    for (const label of ['Add part', 'Stock overview', 'Parts &amp; stock', 'Movement history', 'No inventory parts yet', 'No stock movements recorded']) expect(html).toContain(label);
    expect(html).not.toContain('Generator fuel filter'); expect(html).not.toContain('supplier availability');
  });
  it('renders recorded quantities, NGN kobo and all relevant manager controls', () => {
    const html = renderToStaticMarkup(createElement(FacilityInventorySetup, { ...props, parts: [part] }));
    for (const label of ['Generator fuel filter', 'Victoria Court', 'Store A', 'pieces', '0.29', 'Receive stock for Generator fuel filter', 'Issue stock for Generator fuel filter', 'Adjust stock for Generator fuel filter']) expect(html).toContain(label);
    expect(html).not.toContain('Archive inventory part Generator fuel filter');
  });
  it('keeps viewers out of inventory mutation controls', () => {
    const html = renderToStaticMarkup(createElement(FacilityInventorySetup, { ...props, parts: [part], canCreate: false, canMutate: false }));
    expect(html).toContain('Read-only');
    for (const label of ['Add part', 'Edit inventory part Generator fuel filter', 'Receive stock for Generator fuel filter', 'Issue stock for Generator fuel filter']) expect(html).not.toContain(label);
  });
  it('shows actual movement evidence without claiming payment or supplier ordering', () => {
    const html = renderToStaticMarkup(createElement(FacilityInventorySetup, { ...props, parts: [part], totalMovements: 1, movements: [{ id: 'movement', tenantId: 'company', partId: part.id, siteId: 'site', kind: 'receipt', delta: 2, quantity: 2, stockBefore: 3, stockAfter: 5, unitCostMinor: 29, currency: 'NGN', reason: 'Physically delivered', reference: 'DN-201', at: '2026-10-26T12:00:00.000Z', actorId: 'operator', actorName: 'Stock operator' }] }));
    for (const label of ['DN-201', 'Physically delivered', 'Stock operator', '3 → 5', 'WAT', 'No supplier order, invoice, payment or external transfer is created.']) expect(html).toContain(label);
  });
});
