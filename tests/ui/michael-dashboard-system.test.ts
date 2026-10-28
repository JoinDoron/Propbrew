import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_MOTION,
  MichaelDashboardSystem,
  type DashboardActivity,
  type DashboardMetric,
} from '@/components/dashboard/michael-dashboard-system';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const componentCss = read('src/components/dashboard/michael-dashboard-system.module.css');
const workspaceCss = read('src/components/ui/workspace-layout.module.css');
const pageHeaderCss = read('src/components/ui/page-header.module.css');

const metrics: DashboardMetric[] = [
  {
    id: 'collections',
    label: 'Collections',
    value: '₦4.2m',
    detail: 'Recorded this period',
    trend: { direction: 'up', label: '8% improvement', tone: 'success' },
    visual: { type: 'sparkline', points: [1, 3, 2, 5], label: 'Collections trend' },
  },
];

const activities: DashboardActivity[] = [
  {
    id: 'invoice-1',
    primary: 'Service charge invoice',
    secondary: 'Property A · Unit 4',
    category: 'Receivable',
    status: 'Issued',
    statusTone: 'info',
    amount: '₦250,000',
    timestamp: 'Today, 09:40',
    href: '/finance',
    actionLabel: 'Open invoice',
  },
];

describe('Michael-inspired dashboard system', () => {
  it('publishes named timing constants and feeds them into component tokens', () => {
    expect(DASHBOARD_MOTION).toEqual({
      enterMs: 220,
      hoverMs: 160,
      pressMs: 90,
      stateMs: 180,
      staggerMs: 40,
      easing: 'cubic-bezier(.4, 0, .2, 1)',
    });
    const source = read('src/components/dashboard/michael-dashboard-system.tsx');
    expect(source).toContain("'--dashboard-enter-duration': `${DASHBOARD_MOTION.enterMs}ms`");
    expect(source).toContain("'--dashboard-stagger-duration': `${DASHBOARD_MOTION.staggerMs}ms`");
  });

  it.each(['loading', 'empty', 'error'] as const)('renders an explicit accessible %s state', (state) => {
    const html = renderToStaticMarkup(createElement(MichaelDashboardSystem, {
      title: 'Operations',
      state,
      onRetry: vi.fn(),
    }));
    expect(html).toContain(`data-state="${state}"`);
    expect(html).toMatch(state === 'error' ? /role="alert"/ : /role="status"/);
    expect(html).not.toContain('Service charge invoice');
  });

  it('renders interactive metric states and an accessible labelled visual', () => {
    const html = renderToStaticMarkup(createElement(MichaelDashboardSystem, {
      title: 'Operations',
      metrics,
      activities,
      activeMetricId: 'collections',
      onMetricSelect: vi.fn(),
    }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('role="img"');
    expect(html).toContain('<title>Collections trend</title>');
    expect(html).toContain('8% improvement');
  });

  it('keeps a semantic desktop table and a semantic mobile card list', () => {
    const html = renderToStaticMarkup(createElement(MichaelDashboardSystem, {
      title: 'Finance',
      metrics,
      activities,
    }));
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
    expect(html).toContain('<th scope="col">Record</th>');
    expect(html).toContain('<ol');
    expect(html).toContain('<dt>Category</dt>');
    expect(html).toContain('aria-label="Open invoice"');
    expect(componentCss).toContain('@media (max-width: 640px)');
    expect(componentCss).toMatch(/\.desktopActivityViewport\s*\{\s*display: none;/);
    expect(componentCss).toMatch(/\.activityCards\s*\{\s*display: block;/);
  });

  it('uses 44px control targets, reduced motion and token-driven surfaces', () => {
    expect(componentCss).toContain('width: var(--control-height)');
    expect(componentCss).toContain('min-height: var(--control-height)');
    expect(componentCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(componentCss).toContain('background: var(--surface)');
    expect(componentCss).toContain('border-radius: var(--radius-dashboard-panel)');
    expect(componentCss).not.toMatch(/#[\da-f]{3,8}/i);
  });

  it('carries the spacious register and page hierarchy into shared workspaces', () => {
    expect(workspaceCss).toContain('gap: var(--dashboard-grid-gap)');
    expect(workspaceCss).toContain('height: var(--dashboard-register-row-height)');
    expect(workspaceCss).toContain('min-height: var(--control-height)');
    expect(workspaceCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(pageHeaderCss).toContain('border-bottom: 1px solid var(--border)');
    expect(pageHeaderCss).toContain('min-height: var(--control-height)');
  });
});
