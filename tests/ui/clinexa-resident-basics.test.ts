import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  actor: { userId: 'resident-ada', tenantId: 'tenant-lagos', roles: ['resident'], estateIds: ['estate-lagos'], allEstates: false, unitIds: ['unit-ada'], vendorOrgId: null, investorProjectIds: [] },
  users: [{ id: 'resident-ada', tenantId: 'other-tenant', name: 'Wrong tenant user', email: 'wrong@example.test' }, { id: 'resident-ada', tenantId: 'tenant-lagos', name: 'Ada Obi', email: 'ada@example.test' }],
  residents: [{ id: 'resident-record-ada', userId: 'resident-ada', tenantId: 'tenant-lagos', unitId: 'unit-ada', name: 'Ada Obi', phone: '+234 800 000 0000', household: 2, moveInDate: '2026-01-03' }],
  units: [{ id: 'unit-ada', tenantId: 'tenant-lagos', siteId: 'estate-lagos', label: 'Block A · 4B', type: '2-bed apartment', occupancy: 'occupied' }],
  sites: [{ id: 'estate-lagos', tenantId: 'tenant-lagos', name: 'Lagos Estate' }],
  invoices: [
    { id: 'invoice-ngn', unitId: 'unit-ada', status: 'issued', amount: { minor: 12346, currency: 'NGN' }, paid: { minor: 1, currency: 'NGN' } },
    { id: 'invoice-usd', unitId: 'unit-ada', status: 'issued', amount: { minor: 20000, currency: 'USD' }, paid: { minor: 500, currency: 'USD' } },
    { id: 'invoice-invalid', unitId: 'unit-ada', status: 'issued', amount: { minor: 10000, currency: 'NGN' }, paid: { minor: 100, currency: 'USD' } },
  ],
}));

vi.mock('@/server/guard', () => ({ requireCapability: async () => ({ actor: fixture.actor }) }));
vi.mock('@/server/active-unit', () => ({ getActiveUnitId: async () => fixture.actor.unitIds[0] ?? null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/server/data', () => ({
  seed: { get users() { return fixture.users; }, get residents() { return fixture.residents; }, get units() { return fixture.units; }, get sites() { return fixture.sites; } },
  repos: {
    wallets: { list: () => ({ items: [{ unitId: 'unit-ada', available: { minor: 100000, currency: 'NGN' } }] }) },
    invoices: { list: () => ({ items: fixture.invoices }) },
    workOrders: { list: () => ({ items: [] }) }, bookings: { list: () => ({ items: [] }) }, marketplaceOrders: { list: () => ({ items: [] }) },
    announcements: { list: () => ({ items: [] }) }, sosEvents: { list: () => ({ items: [] }) },
  },
}));
vi.mock('@/server/actions/resident-home', () => ({ topUpWallet: vi.fn(), setActiveUnit: vi.fn() }));

import Home from '@/app/(portal)/portal/page';
import Profile from '@/app/(portal)/portal/profile/page';
import Electricity from '@/app/(portal)/portal/electricity/page';
import { AnnouncementsWorkspace } from '@/components/portal/announcements-workspace';
import { EstateStatus, AttentionList, ActivityTimeline } from '@/components/portal/home-hub';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

beforeEach(() => { fixture.actor.userId = 'resident-ada'; });

describe('Clinexa-aligned resident basics', () => {
  it('derives home greeting and unit display from the signed-in tenant and user', async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('Hi, Ada'); expect(html).toContain('Block A · 4B');
    expect(html).not.toContain('Wrong tenant user'); expect(html).not.toContain('Folake');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
  });

  it('keeps native currency totals separate and excludes mismatched payment currencies', async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('123.45'); expect(html).toContain('195');
    expect(html).toContain('Billing currency review needed');
    expect(html).toContain('no FX conversion');
    expect(html).toContain('Wallet pending charges are shown only in');
    expect(read('src/app/(portal)/portal/page.tsx')).not.toContain('addMoney');
  });

  it('does not invent utility uptime, safety clearance or external SOS notification', async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('No advisory recorded');
    expect(html).toContain('No active alert recorded');
    expect(html).not.toContain('On grid'); expect(html).not.toContain('security notified');
    const source = read('src/app/(portal)/portal/page.tsx');
    expect(source).toContain('response not confirmed');
    expect(source).toContain('Recorded snapshot');
  });

  it('does not claim that due dates or booking slots are payment-confirmation timestamps', () => {
    const html = renderToStaticMarkup(createElement(ActivityTimeline, { items: [{ kind: 'payment', text: 'Invoice marked paid', when: 'Jul 26' }] }));
    expect(html).toContain('not payment verification times');
    expect(html).toContain('Recorded activity');
    expect(read('src/app/(portal)/portal/page.tsx')).toContain('due date shown');
  });

  it('uses accessible shared announcement cards and honest local read/acknowledgement status', () => {
    const html = renderToStaticMarkup(createElement(AnnouncementsWorkspace, { storageKey: 'propbrew:notice-read:v1:tenant-lagos:ada', rows: [{ id: 'notice-one', title: 'Water advisory', body: 'Recorded supply maintenance notice.', audience: 'Residents', sentAt: '2026-07-26', aiDrafted: true, scope: 'estate' }] }));
    expect(html).toContain('aria-expanded="false"'); expect(html).toContain('aria-controls="announcement-notice-one"');
    expect(html).toContain('Mark all read locally'); expect(html).toContain('AI-assisted draft');
    expect(html).toContain('Local acknowledgements are not sent to management');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    const source = read('src/components/portal/announcements-workspace.tsx');
    expect(source).toContain('if (storageKey) localStorage.setItem(storageKey');
    expect(source).not.toContain('vesta_read_announcements');
    expect(source).not.toMatch(/<div key=\{r.id\} onClick/);
  });

  it('scopes device read-state keys to both tenant and signed-in user', () => {
    const route = read('src/app/(portal)/portal/announcements/page.tsx');
    expect(route).toContain('JSON.stringify([actor.tenantId, actor.userId])');
    expect(route).toContain('propbrew:notice-read:v1:');
    expect(read('src/components/portal/announcements-workspace.tsx')).toContain('typeof value === \'string\'');
  });

  it('shows no fabricated electricity meter, balance, tariff, successful vending or usable tokens', async () => {
    const html = renderToStaticMarkup(await Electricity());
    expect(html).toContain('Provider not connected'); expect(html).toContain('No connected purchase history');
    expect(html).toContain('Buy power · unavailable'); expect(html).toContain('disabled=""');
    expect(html).not.toContain('04521 8890 233'); expect(html).not.toContain('4471 8823'); expect(html).not.toContain('token issued instantly');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
  });

  it('uses the account’s real record fields and never substitutes a sample verified identity', async () => {
    const html = renderToStaticMarkup(await Profile());
    expect(html).toContain('Ada Obi'); expect(html).toContain('ada@example.test'); expect(html).toContain('+234 800 000 0000');
    expect(html).toContain('Lagos Estate'); expect(html).toContain('resident-record-ada'); expect(html).toContain('2 members');
    expect(html).toContain('Not an access credential'); expect(html).toContain('identity verification and gate credentials are not connected');
    expect(html).not.toContain('Folake'); expect(html).not.toContain('RES-014-2291'); expect(html).not.toContain('>Verified<');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    fixture.actor.userId = 'unknown-resident';
    const missing = renderToStaticMarkup(await Profile());
    expect(missing).toContain('No sample identity has been substituted'); expect(missing).not.toContain('ada@example.test');
  });

  it('keeps empty home sections useful without asserting that an estate is safe or fully paid', () => {
    const attention = renderToStaticMarkup(createElement(AttentionList, { items: [] }));
    expect(attention).toContain('Nothing listed in this snapshot'); expect(attention).toContain('not a live safety or account-clearance confirmation');
    expect(renderToStaticMarkup(createElement(ActivityTimeline, { items: [] }))).toContain('No activity records');
    const status = renderToStaticMarkup(createElement(EstateStatus, { chips: [{ key: 'water', label: 'Water', value: 'No advisory recorded', tone: 'neutral' }] }));
    expect(status).toContain('not live service status');
  });
});
