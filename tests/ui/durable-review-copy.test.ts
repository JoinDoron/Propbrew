import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRecordState } from '@/server/data/record-context';
import { identityByKey } from '@/server/identities';
import { initialWorkspaceRecordState } from '@/server/data/store';

const boundary = vi.hoisted(() => ({ state: null as WorkspaceRecordState | null, session: vi.fn(), capability: vi.fn(), reviewActor: vi.fn(), openDialogs: false }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useState: ((value: unknown) => boundary.openDialogs && value === false ? [true, vi.fn()] : actual.useState(value)) as typeof actual.useState };
});
vi.mock('next/font/google', () => ({ Inter: () => ({ variable: 'font-inter' }), JetBrains_Mono: () => ({ variable: 'font-mono' }) }));
vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@clerk/nextjs', () => ({ ClerkProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/theme-provider', () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children, themeInitScript: '' }));
vi.mock('@/server/onboarding/identity', () => ({ clerkConfigured: () => false }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), notFound: () => { throw new Error('NOT_FOUND'); }, redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock('@/server/review-auth', () => ({ reviewModeEnabled: () => true, isReviewActor: boundary.reviewActor, getReviewSession: async () => null, REVIEW_CSRF_COOKIE: 'test-review-csrf' }));
vi.mock('@/server/session', () => ({ getSession: boundary.session, devIdentityEnabled: () => false }));
vi.mock('@/server/workspaces', () => ({ requireOperatorSession: boundary.session }));
vi.mock('@/server/guard', () => ({ requireCapability: boundary.capability }));
vi.mock('@/server/data/durable-records', () => ({ withDurableRead: async (work: () => unknown) => {
  const { runWithRecordContext } = await import('@/server/data/record-context');
  return runWithRecordContext({ state: boundary.state!, domainTenantId: 't-lekki', mode: 'read' }, work);
} }));
vi.mock('@/server/actions/estate-registration', () => ({ addEstateProperty: vi.fn(), addEstateTenant: vi.fn() }));
vi.mock('@/server/actions/estate-work-orders', () => ({ createEstateWorkOrder: vi.fn() }));

import RootLayout from '@/app/layout';
import ReviewLoginPage from '@/app/review/login/page';
import EstatePropertiesPage from '@/app/(ops)/(estate)/properties/page';
import PeoplePage from '@/app/(ops)/(estate)/people/page';
import EstateWorkOrdersPage from '@/app/(ops)/(estate)/estate/work-orders/page';
import { EstateHome } from '@/components/workspaces/estate-home';
import { EstateCreateActions } from '@/components/workspaces/estate-create-actions';
import { EstatePropertiesWorkspace } from '@/components/workspaces/estate-properties-workspace';
import { EstateWorkOrderCreate } from '@/components/work-orders/estate-work-order-create';

function propsFor(value: unknown, type: unknown, seen = new Set<unknown>()): Record<string, unknown>[] {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (isValidElement<Record<string, unknown>>(value) && value.type === type) return [value.props];
  return Object.values(value).flatMap((child) => propsFor(child, type, seen));
}
beforeEach(() => {
  vi.clearAllMocks(); boundary.openDialogs = false;
  vi.stubEnv('DATA_SOURCE', 'memory');
  boundary.state = initialWorkspaceRecordState('t-lekki');
  vi.stubEnv('NODE_ENV', 'production');
  const actor = identityByKey('estate_manager').actor;
  boundary.session.mockResolvedValue({ key: 'private-review', label: 'Private reviewer', tenantLabel: 'Sample portfolio', actor });
  boundary.capability.mockResolvedValue({ actor }); boundary.reviewActor.mockReturnValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe('Server-derived durable review labels', () => {
  it.each(['memory', 'postgres'])('matches the banner and login explanation to %s storage without promising permanent retention', async (source) => {
    vi.stubEnv('DATA_SOURCE', source);
    const banner = renderToStaticMarkup(createElement(RootLayout, null, 'Review content'));
    const login = renderToStaticMarkup(await ReviewLoginPage({ searchParams: Promise.resolve({}) }));
    for (const html of [banner, login]) {
      expect(html).toContain('Do not enter customer information.');
      expect(html).not.toContain('saved permanently');
      if (source === 'postgres') { expect(html).not.toContain('reset'); expect(html.toLowerCase()).toContain('database'); }
      else expect(html).toContain('reset');
    }
    if (source === 'postgres') { expect(banner).toContain('Database-backed review'); expect(banner).toContain('Saved to database'); }
  });

  it.each([false, true])('keeps property and tenant form copy consistent when persistent=%s', (persistent) => {
    const form = renderToStaticMarkup(createElement(EstateCreateActions, { canAddProperty: true, canAddTenant: true, units: [{ id: 'unit', propertyName: 'Estate', label: 'Unit 1' }], demo: true, persistent, asOfDate: '2026-07-26' }));
    const register = renderToStaticMarkup(createElement(EstatePropertiesWorkspace, { properties: [], demo: true, persistent }));
    for (const html of [form, register]) {
      if (persistent) { expect(html).toContain('saved to the database'); expect(html).not.toContain('reset'); }
      else expect(html).toContain('reset when the app restarts');
    }
    expect(form).toContain('does not create a login, send an invitation or issue a rent invoice');
  });

  it.each([false, true])('preserves emergency guidance while showing the opened workorder form storage mode persistent=%s', (persistent) => {
    boundary.openDialogs = true;
    const html = renderToStaticMarkup(createElement(EstateWorkOrderCreate, { sites: [{ id: 'estate', label: 'Estate' }], demo: true, persistent }));
    expect(html).toContain('For an immediate danger, follow your estate’s emergency procedure.');
    expect(html).toContain('New estate work order');
    if (persistent) { expect(html).toContain('saved to the database'); expect(html).not.toContain('Records reset'); }
    else expect(html).toContain('Records reset when the application restarts.');
  });

  it.each(['memory', 'postgres'])('passes server-derived flags through Estate, Properties, Residents and Workorders for %s', async (source) => {
    vi.stubEnv('DATA_SOURCE', source);
    const persistent = source === 'postgres';
    const properties = await EstatePropertiesPage();
    expect(propsFor(properties, EstatePropertiesWorkspace)[0]).toMatchObject({ persistent, demo: true });
    for (const tree of [await EstateHome(), properties, await PeoplePage()]) expect(propsFor(tree, EstateCreateActions)[0]).toMatchObject({ persistent, demo: true });
    expect(propsFor(await EstateWorkOrdersPage(), EstateWorkOrderCreate)[0]).toMatchObject({ persistent, demo: true });
  });

  it('does not activate workorder creation for an ordinary Clerk session merely because PostgreSQL is configured', async () => {
    vi.stubEnv('DATA_SOURCE', 'postgres');
    boundary.reviewActor.mockReturnValue(false);
    boundary.session.mockResolvedValue({ key: 'clerk', label: 'Customer manager', actor: identityByKey('estate_manager').actor });
    expect(propsFor(await EstateWorkOrdersPage(), EstateWorkOrderCreate)[0]).toMatchObject({ persistent: true, demo: false });
  });
});
