import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvestorPortfolioWorkspace, investorCurrency } from '@/components/portal/investor-portfolio-workspace';
import { InvestorReturnsWorkspace } from '@/components/portal/investor-returns-workspace';
import { InvestorUpdatesWorkspace } from '@/components/portal/investor-updates-workspace';
import { portalMoney } from '@/components/portal/portal-patterns';
import { holdingOf, projectReturns } from '@/domain/investor-portal';
import type { InvestorProject } from '@/domain/entities';
import { money, type CurrencyCode } from '@/domain/primitives';

const render = <Props extends object>(component: ComponentType<Props>, props: Props) => renderToStaticMarkup(createElement(component, props));
const source = (name: string) => readFileSync(resolve(process.cwd(), `src/components/portal/${name}.tsx`), 'utf8');
const project = (id: string, currency: CurrencyCode = 'NGN'): InvestorProject => ({ tenantId: 'tenant-investor', id, projectId: id, name: `${id} (off-plan)`, location: 'Lekki, Lagos', status: 'construction', unitsTotal: 10, unitsSold: 3, salesTarget: money(2000010, currency), salesToDate: money(600003, currency), occupancyPct: 0, projectedRoiPct: 12, handoverDate: '2027-06-30' }) as InvestorProject;

describe('Clinexa investor workspace completeness and honesty', () => {
  it.each([
    ['Portfolio', InvestorPortfolioWorkspace],
    ['Returns', InvestorReturnsWorkspace],
    ['Updates', InvestorUpdatesWorkspace],
  ] as const)('%s preserves two mounted sections and responsive shared composition', (_label, component) => {
    const html = render(component, { projects: [project('Lagos Heights')] });
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('hidden=""');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('text-[8.5px]');
    expect(html).not.toContain('pb-hero');
  });

  it.each([InvestorPortfolioWorkspace, InvestorReturnsWorkspace, InvestorUpdatesWorkspace])('renders empty scoped projects honestly', (component) => {
    const html = render(component, { projects: [] });
    expect(html).toContain('No ');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('NaN');
  });

  it('keeps source currencies and exact kobo rather than compacting or converting holdings', () => {
    const nairaProject = project('NGN-Holding');
    const dollarProject = project('USD-Holding', 'USD');
    expect(investorCurrency(nairaProject)).toBe('NGN');
    expect(investorCurrency(dollarProject)).toBe('USD');
    const html = render(InvestorPortfolioWorkspace, { projects: [nairaProject, dollarProject] });
    expect(html).toContain(portalMoney(holdingOf(nairaProject).investedMinor, 'NGN'));
    expect(html).toContain(portalMoney(holdingOf(dollarProject).investedMinor, 'USD'));
    expect(html).not.toContain(portalMoney(holdingOf(nairaProject).investedMinor + holdingOf(dollarProject).investedMinor, 'NGN'));
    expect(source('investor-portfolio-workspace')).toContain('investorCurrency(project) === currency');
    expect(source('investor-portfolio-workspace')).not.toContain('Math.round(n / 1e3)');
  });

  it('models returns only within the selected native currency', () => {
    const nairaProject = project('NGN-Return');
    const dollarProject = project('USD-Return', 'USD');
    const html = render(InvestorReturnsWorkspace, { projects: [nairaProject, dollarProject] });
    expect(html).toContain(portalMoney(projectReturns(holdingOf(nairaProject).investedMinor, 5, 12, 6).totalValueMinor));
    expect(source('investor-returns-workspace')).toContain('holding.currency === currency');
    expect(source('investor-returns-workspace')).toContain('setSelected(\'all\')');
    expect(source('investor-returns-workspace')).toContain('Currencies are never combined or converted');
  });

  it('does not represent generated ownership, build percentages, milestone dates or payment states as verified', () => {
    const portfolio = source('investor-portfolio-workspace');
    expect(portfolio).toContain('not verified ownership');
    expect(portfolio).toContain('deterministic project identifier');
    expect(portfolio).toContain('not a signed construction inspection');
    expect(portfolio).toContain('Paid/due/upcoming labels are modelled');
    expect(portfolio).toContain('Payment not connected');
    expect(portfolio).not.toContain('paidToast');
    expect(portfolio).not.toContain('setPaidToast');
    expect(portfolio).not.toContain('useTransition');
    expect(portfolio).toContain('Scheduled date passed · completion unverified');
    expect(portfolio).toContain('Insufficient recorded sales pace');
  });

  it('uses a native readable project drawer and vertical milestones', () => {
    const portfolio = source('investor-portfolio-workspace');
    expect(portfolio).toContain('<PortalDialog');
    expect(portfolio).toContain('width={680} drawer');
    expect(portfolio).toContain('progress.milestones.map');
    expect(portfolio).toContain('list-none space-y-4');
    expect(portfolio).toContain('Modelled: ${milestone.state}');
    expect(portfolio).not.toContain('text-[8.5px]');
  });

  it('retains adjustable scenarios with named 44px sliders, excludes advice and states missing costs', () => {
    const html = render(InvestorReturnsWorkspace, { projects: [project('Scenario')] });
    expect(html.match(/type="range"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Hold period"');
    expect(html).toContain('aria-label="Annual appreciation"');
    expect(html).toContain('aria-label="Rental yield"');
    expect(html).toContain('aria-valuetext=');
    expect(source('investor-returns-workspace')).toContain('w-full min-h-11');
    expect(html).toContain('does not simulate losses');
    expect(html).toContain('not risk assessments or recommendations');
  });

  it('provides keyboard-native accordion controls with unique content relationships and mounted contents', () => {
    const html = render(InvestorUpdatesWorkspace, { projects: [project('First'), project('Second')] });
    expect(html.match(/aria-expanded="/g)).toHaveLength(4);
    expect(html.match(/aria-controls="[^"]+-content"/g)).toHaveLength(4);
    expect(html.match(/role="region"/g)).toHaveLength(4);
    const controls = [...html.matchAll(/aria-controls="([^"]+-content)"/g)].map((match) => match[1]);
    expect(new Set(controls).size).toBe(4);
    for (const id of controls) expect(html).toContain(`id="${id}"`);
    expect(source('investor-updates-workspace')).toContain('hidden={!open}');
    expect(source('investor-updates-workspace')).not.toContain('{open &&');
  });

  it('labels every download as a non-legal sample before the user downloads it', () => {
    const html = render(InvestorUpdatesWorkspace, { projects: [project('Documents')] });
    expect(html.match(/Download sample only:/g)).toHaveLength(4);
    expect(html).toContain('sample only');
    const updates = source('investor-updates-workspace');
    expect(updates).toContain('PROPBREW — SAMPLE ONLY — NOT A LEGAL OR FINANCIAL DOCUMENT');
    expect(updates).toContain('SAMPLE-ONLY-');
    expect(updates).toContain('No original or signed document is attached');
    expect(updates).toContain('not from dated site evidence');
  });
});
