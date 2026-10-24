import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstatePropertyEditor, EstateResidentEditor } from '@/components/workspaces/estate-record-editors';
import { AssetEditor } from '@/components/facility/asset-editor';
import { FacilityWorkOrderCreate } from '@/components/work-orders/facility-work-order-create';

const hooks = vi.hoisted(() => ({ states: [] as unknown[] }));
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useId: () => 'record-editor', useRef: (current: unknown) => ({ current }), useState: (initial: unknown) => [hooks.states.length ? hooks.states.shift() : initial, vi.fn()], useTransition: () => [false, vi.fn()] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/facility/facility-ui', () => ({ FacilityDialog: ({ title, children }: { title: string; children: ReactNode }) => createElement('section', { 'aria-label': title }, children) }));
vi.mock('@/server/actions/estate-registration', () => ({ updateEstateProperty: vi.fn(), updateEstateTenant: vi.fn() }));
vi.mock('@/server/actions/facility-registration', () => ({ createFacilityAsset: vi.fn(), updateFacilityAsset: vi.fn(), createFacilityWorkOrder: vi.fn() }));
beforeEach(() => { hooks.states = [true]; });
const asset = { id: 'asset-one', name: 'Main water pump', category: 'Plumbing', serial: 'PUMP-100', locationLabel: 'Pump room', status: 'operational', purchaseDate: '2025-01-01', warrantyExpiry: '2028-01-01' };

describe('Estate and Facility record editors', () => {
  it('corrects property details without exposing inventory or ownership controls', () => {
    const html = renderToStaticMarkup(createElement(EstatePropertyEditor, { property: { id: 'property-one', name: 'Palm Court', address: '10 Palm Road, Lagos' } }));
    for (const value of ['Edit property', 'name="name"', 'name="address"', 'Palm Court', '10 Palm Road, Lagos', 'Save property']) expect(html).toContain(value);
    for (const name of ['tenantId', 'userId', 'unitCount', 'status']) expect(html).not.toContain(`name="${name}"`);
  });
  it('offers the current residence and vacant units without offering another occupied unit', () => {
    const html = renderToStaticMarkup(createElement(EstateResidentEditor, { resident: { id: 'resident-one', name: 'QA resident', email: 'qa@sample.invalid', phone: '+2348000000000', household: 2, unitId: 'current', unitLabel: 'Unit 1' }, units: [{ id: 'current', label: 'Palm Court · Unit 1', occupancy: 'occupied' }, { id: 'vacant', label: 'Palm Court · Unit 2', occupancy: 'vacant' }, { id: 'busy', label: 'Another household', occupancy: 'occupied' }] }));
    for (const value of ['name="name"', 'name="email"', 'name="phone"', 'name="household"', 'name="unitId"', 'value="current"', 'value="vacant"', 'Save resident']) expect(html).toContain(value);
    expect(html).not.toContain('value="busy"'); expect(html).not.toContain('name="password"'); expect(html).not.toContain('name="status"');
  });
  it('registers assets with a location and supports scoped edits without moving the asset', () => {
    const create = renderToStaticMarkup(createElement(AssetEditor, { locations: [{ id: 'site-one', label: 'Palm Court' }] }));
    expect(create).toContain('name="siteId"'); expect(create).toContain('value="site-one"'); expect(create).toContain('name="serial"'); expect(create).toContain('name="warrantyExpiry"');
    hooks.states = [true];
    const edit = renderToStaticMarkup(createElement(AssetEditor, { asset }));
    expect(edit).toContain('Main water pump'); expect(edit).toContain('value="PUMP-100"'); expect(edit).toContain('Save asset'); expect(edit).not.toContain('name="siteId"');
  });
  it('keeps work-order creation in Facility and shows only assets at the selected location', () => {
    hooks.states = [true, 'site-one'];
    const html = renderToStaticMarkup(createElement(FacilityWorkOrderCreate, { locations: [{ id: 'site-one', label: 'Palm Court' }, { id: 'site-two', label: 'Other facility' }], assets: [{ id: 'pump', siteId: 'site-one', label: 'Main pump' }, { id: 'elsewhere', siteId: 'site-two', label: 'Elsewhere pump' }] }));
    for (const value of ['New facility work order', 'name="siteId"', 'name="assetId"', 'name="title"', 'name="priority"', 'value="pump"', 'Create work order']) expect(html).toContain(value);
    expect(html).not.toContain('value="elsewhere"'); expect(html).not.toContain('name="assigneeUserId"'); expect(html).not.toContain('name="status"');
  });
});
