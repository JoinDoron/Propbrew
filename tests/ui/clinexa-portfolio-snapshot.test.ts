import { Children, createElement, isValidElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioPage from '@/app/(ops)/(estate)/portfolio/page';
import { PortfolioWorkspace, type PortfolioEstateVitals } from '@/components/facility/portfolio-workspace';
import { estateIndex, portfolioTotals } from '@/domain/facility';

const mocks = vi.hoisted(() => ({
  actor: { userId: 'manager', tenantId: 'tenant-a', roles: ['estate_manager'], estateIds: ['site-a', 'site-b'], allEstates: false, unitIds: [], vendorOrgId: null, investorProjectIds: [] },
  requireCapability: vi.fn(),
  sites: vi.fn(), systems: vi.fn(), alarms: vi.fn(), generators: vi.fn(), contracts: vi.fn(), workOrders: vi.fn(), invoices: vi.fn(),
}));
vi.mock('@/server/guard', () => ({ requireCapability: mocks.requireCapability }));
vi.mock('@/server/data', () => ({ repos: { sites: { all: mocks.sites }, buildingSystems: { list: mocks.systems }, facilityAlarms: { list: mocks.alarms }, facilityGenerators: { list: mocks.generators }, facilityContracts: { list: mocks.contracts }, workOrders: { list: mocks.workOrders }, invoices: { list: mocks.invoices } } }));
type Props = ComponentProps<typeof PortfolioWorkspace>;
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const measured: PortfolioEstateVitals = { siteId: 'site-a', name: 'Measured Estate', kind: 'estate', healthScore: 80, systemCount: 2, openWos: 3, overdueWos: 1, openAlarms: 1, dieselSpendMinor: 2000050, gensetPct: 40, contractsAtRisk: 0, arrearsMinor: 1000050 };
const unmeasured: PortfolioEstateVitals = { ...measured, siteId: 'site-b', name: 'Unmeasured Estate', healthScore: 100, systemCount: 0, openWos: 0, overdueWos: 0, openAlarms: 0, contractsAtRisk: 0, arrearsMinor: 0 };
const render = (estates: PortfolioEstateVitals[], overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(PortfolioWorkspace, { estates, totals: portfolioTotals(estates), canSeeMoney: true, ...overrides }));
async function readPageProps() {
  const page = await PortfolioPage();
  const workspace = Children.toArray(page.props.children).find((child) => isValidElement(child) && child.type === PortfolioWorkspace) as ReactElement<Props>;
  return workspace.props;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.roles = ['estate_manager'];
  mocks.requireCapability.mockResolvedValue({ actor: mocks.actor });
  mocks.sites.mockReturnValue([{ id: 'site-a', name: 'Measured Estate', kind: 'estate' }, { id: 'site-b', name: 'Unmeasured Estate', kind: 'estate' }]);
  mocks.systems.mockReturnValue({ items: [{ siteId: 'site-a', status: 'operational' }] });
  for (const repo of [mocks.alarms, mocks.generators, mocks.contracts, mocks.workOrders, mocks.invoices]) repo.mockReturnValue({ items: [] });
});

describe('Portfolio loaded-record coverage', () => {
  it('does not display absent system records as perfect health or a Healthy index', () => {
    const html = render([unmeasured]);
    expect(html).toContain('Health not measured'); expect(html).toContain('Index not measured');
    expect(html).not.toContain('100/100'); expect(html).not.toContain('Healthy');
    expect(html).toContain('0 of 1 estates have loaded system records');
    expect(html).toContain('No measured estates');
  });

  it('treats missing legacy coverage as unknown without changing the shared numeric domain shape', () => {
    const legacy = { ...unmeasured, systemCount: undefined };
    const html = render([legacy]);
    expect(html).toContain('Coverage not supplied'); expect(html).toContain('Health not measured');
    expect(html).not.toContain('100/100');
    expect(read('src/domain/facility/engine.ts')).toContain('healthScore: number');
  });

  it('averages and ranks only estates with loaded system coverage', () => {
    const html = render([measured, unmeasured]);
    const index = estateIndex(measured).score;
    expect(html).toContain(`>${index}/100</dd>`);
    expect(html).toContain('Average index · measured estates only');
    expect(html).toContain('1 of 2 estates have loaded system records');
    expect(html).toContain('Only estates with loaded system records contribute');
    expect(html).toContain('Missing data is not evidence of healthy systems');
  });

  it('preserves measured health and exact kobo in per-estate facts', () => {
    const html = render([measured]);
    expect(html).toContain('80/100'); expect(html).toContain('₦20,000.50'); expect(html).toContain('₦10,000.50');
    expect(html).toContain('Loaded system records');
  });

  it('labels arrears as NGN only and explains excluded records without implying exchange rates', () => {
    const html = render([measured], { excludedCurrencyInvoices: 2 });
    expect(html).toContain('Recorded arrears · NGN only');
    expect(html).toContain('Both the charge and paid amount must be in NGN');
    expect(html).toContain('2 loaded invoices are');
    expect(html).toContain('No FX conversion or cross-currency netting is applied');
  });

  it('does not reveal arrears or invoice coverage to viewers without billing read access', () => {
    const html = render([measured], { canSeeMoney: false, excludedCurrencyInvoices: 2, loadedRecordCounts: { estates: 1, systems: 2, alarms: 0, generators: 0, contracts: 0, workOrders: 3, invoices: 10 } });
    expect(html).not.toContain('₦10,000'); expect(html).not.toContain('2 loaded invoices'); expect(html).not.toContain('<dt>Invoices</dt>');
    expect(html).not.toContain('value="arrears"');
  });

  it('discloses loaded counts and capped single-page reads instead of claiming exhaustive totals', () => {
    const html = render([measured], { loadedRecordCounts: { estates: 1, systems: 2, alarms: 3, generators: 4, contracts: 5, workOrders: 6, invoices: 7 } });
    expect(html).toContain('Loaded-record snapshot'); expect(html).toContain('may undercount your complete portfolio');
    for (const number of [1, 2, 3, 4, 5, 6, 7]) expect(html).toContain(`${number} loaded`);
    expect(html).toContain('at most 100 estates'); expect(html).toContain('500 work orders and 500 invoices');
    expect(html).toContain('does not fetch subsequent pages'); expect(html).toContain('not an exhaustive estate audit');
  });

  it('keeps empty portfolios honest rather than showing the domain’s default 100 index', () => {
    const html = render([]);
    expect(html).toContain('No estates in your scope'); expect(html).toContain('Health not measured');
    expect(html).not.toContain('100/100'); expect(html).not.toMatch(/NaN|Infinity/);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
  });

  it('uses NGN charge and paid currencies together in the server read model', async () => {
    const invoice = (id: string, currency: string, paidCurrency = currency) => ({ id, estateId: 'site-a', status: 'overdue', amount: { minor: 1000050, currency }, paid: { minor: 50, currency: paidCurrency } });
    mocks.invoices.mockReturnValue({ items: [invoice('ngn', 'NGN'), invoice('usd', 'USD'), invoice('ghs', 'GHS'), invoice('mismatch', 'NGN', 'USD')] });
    const props = await readPageProps();
    expect(props.estates[0].arrearsMinor).toBe(1000000);
    expect(props.totals.arrearsMinor).toBe(1000000);
    expect(props.excludedCurrencyInvoices).toBe(3);
    expect(props.loadedRecordCounts?.invoices).toBe(4);
    expect(mocks.invoices).toHaveBeenCalledWith(mocks.actor, { limit: 500 });
  });

  it('copies per-estate loaded system counts and does not use perfect-health defaults when empty', async () => {
    const props = await readPageProps();
    expect(props.estates[0].systemCount).toBe(1);
    expect(props.estates[1].systemCount).toBe(0);
    expect(props.estates[1].healthScore).toBe(0);
    expect(props.loadedRecordCounts?.systems).toBe(1);
    expect(mocks.requireCapability).toHaveBeenCalledWith('reports_analytics', 'read', 'estate');
  });

  it('does not read invoices or return financial coverage without the exact read permission', async () => {
    mocks.actor.roles = ['facility_manager'];
    const props = await readPageProps();
    expect(props.canSeeMoney).toBe(false); expect(mocks.invoices).not.toHaveBeenCalled();
    expect(props.estates.every((estate) => estate.arrearsMinor === null)).toBe(true);
    expect(props.loadedRecordCounts?.invoices).toBeUndefined();
    expect(read('src/app/(ops)/(estate)/portfolio/page.tsx')).toContain("can(actor, 'charges_invoicing', 'read').allowed");
  });
});
