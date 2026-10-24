import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstateCreateActions } from '@/components/workspaces/estate-create-actions';
import { EstateWorkOrderCreate } from '@/components/work-orders/estate-work-order-create';

const hooks = vi.hoisted(() => ({ states: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useId: () => 'native-estate-form', useRef: (current: unknown) => ({ current }), useEffect: () => {},
  useState: (initial: unknown) => [hooks.states.length ? hooks.states.shift() : initial, vi.fn()],
  useTransition: () => [false, vi.fn()],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/portal-dialog', () => ({ PortalDialog: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/server/actions/estate-registration', () => ({ addEstateProperty: vi.fn(), addEstateTenant: vi.fn() }));
vi.mock('@/server/actions/estate-work-orders', () => ({ createEstateWorkOrder: vi.fn() }));
beforeEach(() => { hooks.states = []; });

function property(native: boolean, demo = false) {
  hooks.states = ['property', null, null];
  return renderToStaticMarkup(createElement(EstateCreateActions, {
    canAddProperty: true, canAddTenant: true, units: [], demo, native, persistent: true, asOfDate: '2026-10-24',
  }));
}
function workOrder(native: boolean, demo = false) {
  hooks.states = [true, 'company-estate', null];
  return renderToStaticMarkup(createElement(EstateWorkOrderCreate, {
    sites: [{ id: 'company-estate', label: 'Registered estate' }], demo, native, persistent: true,
  }));
}

describe('native Estate forms are distinct from private sample forms', () => {
  it('opens native property registration with company copy and actual fields', () => {
    const html = property(true);
    expect(html).toContain('name="name"'); expect(html).toContain('name="unitCount"');
    expect(html).toContain('Records are saved to your company database');
    expect(html).not.toContain('Production registration is not activated');
    expect(html).not.toContain('use sample details only');
  });

  it('keeps unactivated production registration unavailable even with the persistent flag', () => {
    const html = property(false);
    expect(html).toContain('Production registration is not activated');
    expect(html).not.toContain('name="unitCount"');
  });

  it('opens native work-order creation without calling it a sample review', () => {
    const html = workOrder(true);
    expect(html).toContain('name="siteId"'); expect(html).toContain('name="title"');
    expect(html).toContain('This request is saved to your company database');
    expect(html).not.toContain('use sample information only');
    expect(html).not.toContain('creation is not connected yet');
  });

  it('keeps unactivated work-order creation unavailable even with the persistent flag', () => {
    const html = workOrder(false);
    expect(html).toContain('creation is not connected yet');
    expect(html).not.toContain('name="siteId"');
  });

  it('preserves explicit sample wording for the private-review forms', () => {
    expect(property(false, true)).toContain('Database-backed review');
    expect(workOrder(false, true)).toContain('Database-backed review');
  });
});
