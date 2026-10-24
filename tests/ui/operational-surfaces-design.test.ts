import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AccessWorkspace } from '@/components/facility/access-workspace';
import { CommandCenter } from '@/components/construction/command-center';
import { ShortletDashboard } from '@/components/shortlet/dashboard';
import type { AccessPoint } from '@/domain/facility';
import { asId, type TenantId } from '@/domain/ids';
import { WalletCard } from '@/components/portal/wallet-card';
import { PromoBanner } from '@/components/portal/promo-banner';
import { money } from '@/domain/primitives';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/facility', () => ({}));
vi.mock('@/server/actions/construction', () => ({}));
vi.mock('@/server/actions/resident-home', () => ({ topUpWallet: vi.fn() }));

const nowMs = Date.parse('2026-10-23T09:00:00Z');
const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

function access(mode: AccessPoint['mode']) {
  return renderToStaticMarkup(createElement(AccessWorkspace, {
    points: [{ id: 'gate-1', tenantId: asId<TenantId>('tenant-1'), siteId: 'site-1', name: 'Main gate', kind: 'gate', status: 'online', mode, lastEventISO: '2026-10-23T09:00:00Z' }],
    passes: [], events: [], kpis: { onSite: 0, expectedToday: 0, online: 1, totalPoints: 1, threats: 0 }, nowMs,
  }));
}

describe('Clinexa-adapted operational surfaces', () => {
  it('keeps the neutral access snapshot and globally available reviewed lockdown control', () => {
    const html = access('secured');
    expect(html).toContain('Perimeter &amp; visitor operations');
    expect(html).toContain('Standard access recorded');
    expect(html).toMatch(/class="[^"]*dangerAction[^"]*"/);
    expect(source('src/components/facility/facility-specialists.module.css')).toContain('.dangerAction');
    expect(source('src/components/facility/facility-specialists.module.css')).toContain('background: var(--tone-danger)');
    expect(html.indexOf('Lock down estate')).toBeLessThan(html.indexOf('role="tablist"'));
    expect(html).not.toContain('linear-gradient');
  });

  it('gives lockdown a distinct semantic emergency state without hiding the release control', () => {
    const html = access('lockdown');
    expect(html).toContain('Lockdown recorded');
    expect(html).toContain('not a connected gate controller');
    expect(html.indexOf('Release lockdown')).toBeLessThan(html.indexOf('role="tablist"'));
    expect(html).toContain('var(--tone-danger)');
  });

  it('uses neutral Construction hero and KPI surfaces while preserving naira, crew and risk context', () => {
    const html = renderToStaticMarkup(createElement(CommandCenter, {
      confidence: { score: 72, band: 'warn', label: 'Watch closely', nairaAtRiskMinor: 2_500_000 },
      projects: [], signals: [], deliveries: { late: [], today: [], upcoming: [] },
      kpis: { activeProjects: 2, onSite: 12, plannedCrew: 15, openPoValueMinor: 5_000_000, criticalSignals: 1 }, canMutate: false,
    }));
    expect(html).toContain('recorded snapshot');
    expect(html).toContain('Watch closely');
    expect(html).toContain('12/15');
    expect(html).toContain('₦');
    expect(html.match(/class="[^"]*kpiValue[^"]*"/g)).toHaveLength(4);
    for (const label of ['Active projects', 'Crew on site', 'Open PO value', 'Critical signals']) expect(html).toContain(label);
    expect(html).toContain('stroke="var(--border)"');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
  });

  it('keeps the Shortlet revenue, profit and guest operations in the new surface language', () => {
    const html = renderToStaticMarkup(createElement(ShortletDashboard, {
      kpis: { revenueMinor: 1_000_000, profitMinor: 500_000, occupancyPct: 50, bookings: 2, cautionHeldMinor: 10_000 },
      monthLabel: 'October 2026', arrivals: [], departures: [], staying: [], calendar: [], days: [], revExp: [], attention: [],
    }));
    expect(html.match(/class="[^"]*kpiValue[^"]*"/g)).toHaveLength(5);
    expect(html).toContain('not verified bank settlement');
    expect(html).toContain('October 2026');
    expect(html).toContain('Caution recorded as held');
    expect(html).toContain('Revenue vs expenses');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
  });

  it('keeps local KPI helpers aligned across all operational, admin and own-record modules', () => {
    const modules = ['construction', 'shortlet', 'facility', 'admin', 'portal', 'estate'];
    let helpers = 0;
    let shared = 0;
    for (const area of modules) {
      for (const file of readdirSync(resolve(process.cwd(), `src/components/${area}`)).filter((file) => file.endsWith('.tsx'))) {
        const view = source(`src/components/${area}/${file}`);
        if (view.includes('<KpiCard')) {
          shared++;
          expect(view).toMatch(/import[^;]+KpiCard[^;]+from '@\/components\/ui'/);
        }
        if (/\b(?:ConstructionKpi as Kpi|const Kpi = FacilityKpi)/.test(view)) {
          shared++;
          expect(view).toMatch(/from ['"](?:\.\/construction-ui|@\/components\/facility\/facility-ui)['"]/);
        }
        const start = view.indexOf('function Kpi(');
        if (start < 0) continue;
        helpers++;
        const helper = view.slice(start).split('\nfunction ')[0];
        if (helper.includes('pb-stat')) {
          for (const className of ['pb-stat', 'pb-stat-label', 'pb-stat-value']) expect(helper).toContain(className);
        } else {
          expect(helper).toMatch(/<(?:ShortletMetric|PortalKpi|ConstructionKpi|FacilityKpi)\b/);
          expect(helper).toContain('label={label}');
          expect(helper).toContain('value={value}');
        }
      }
    }
    expect(helpers + shared).toBeGreaterThan(40);
    expect(shared).toBeGreaterThanOrEqual(5);
  });

  it('scopes every surface rule to the application so the marketing website remains unaffected', () => {
    const css = source('src/components/ui/operational-surfaces.css');
    expect(css).toContain('.pb-app .pb-hero');
    expect(css).toContain('.pb-app .pb-stat');
    expect(css).toContain(".pb-app .pb-hero[data-emergency='true']");
    expect(css).not.toContain('!important');
  });

  it('keeps wallet amounts and financial actions on a theme-stable brand surface', () => {
    const html = renderToStaticMarkup(createElement(WalletCard, {
      unitId: 'u-101', available: money(1_250_000), pending: money(250_000), pendingCount: 2,
    }));
    expect(html).toContain('background:var(--brand-solid);color:var(--on-brand-solid)');
    expect(html).toContain('₦12,500');
    expect(html).toContain('₦2,500');
    expect(html).toContain('href="/portal/bills"');
    expect(html).toContain('Pending charges (2)');
    expect(html).toContain('Top Up');
    expect(html).toContain('aria-label="Hide balance"');
    expect(html).toContain('aria-label="Refresh balance"');
    expect(html).not.toContain('var(--primary)');
    expect(html).not.toContain('text-white/');
  });

  it('retains empty-wallet emphasis without making the top-up ink theme dependent', () => {
    const html = renderToStaticMarkup(createElement(WalletCard, {
      unitId: 'u-101', available: money(0), pending: money(0), pendingCount: 0,
    }));
    expect(html).toContain('ring-2 ring-white/60');
    expect(html).toContain('text-[color:var(--brand-solid)]');
    expect(html).not.toContain('text-primary');
    expect(source('src/components/portal/wallet-card.tsx')).toContain('rounded-lg bg-surface p-3 text-text');
  });

  it('keeps rotating promotional copy and the Ad disclosure on a stable contrast pair', () => {
    const html = renderToStaticMarkup(createElement(PromoBanner));
    expect(html).toContain('background:var(--brand-solid);color:var(--on-brand-solid)');
    expect(html).toContain('Get 5% off your next top-up');
    expect(html).toContain('Learn more');
    expect(html).toContain('>Ad</span>');
    expect(html).not.toContain('text-white/');
    expect(source('src/components/portal/promo-banner.tsx')).toContain('(n + 1) % PROMOS.length');
  });

  it('keeps white wallet ink above AA contrast even at its lightest hover overlay', () => {
    const linear = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    const brand = [0x42, 0x42, 0xee];
    const whiteHover = brand.map((channel) => (channel * 0.85 + 255 * 0.15) / 255);
    const luminance = whiteHover.reduce((sum, channel, index) => sum + linear(channel) * [0.2126, 0.7152, 0.0722][index], 0);
    expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
