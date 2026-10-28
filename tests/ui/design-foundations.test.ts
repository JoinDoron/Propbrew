import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Avatar, Button, Card, FilterChip, KpiCard, StatusPill } from '@/components/ui';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const globals = read('src/app/globals.css');
const tokens = (selector: RegExp) => Object.fromEntries(
  [...(globals.match(selector)?.[1] ?? '').matchAll(/(--[\w-]+):\s*(#[a-f\d]{6})\s*;/gi)].map((match) => [match[1], match[2]]),
);
const light = tokens(/:root\s*\{([\s\S]*?)\}/);
const dark = { ...light, ...tokens(/\[data-theme='dark'\]\s*\{([\s\S]*?)\}/) };
function rgb(hex: string) { return hex.slice(1).match(/../g)!.map((part) => Number.parseInt(part, 16)); }
function luminance(channels: number[]) {
  return channels.map((channel) => channel / 255).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
}
function contrast(a: number[], b: number[]) {
  const pair = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (pair[0] + .05) / (pair[1] + .05);
}

describe('Propbrew platform foundations', () => {
  it('uses the inspected palette and Michael-inspired operating dimensions', () => {
    expect(light['--primary'].toLowerCase()).toBe('#4242ee');
    expect(light['--surface'].toLowerCase()).toBe('#ffffff');
    expect(light['--surface-2'].toLowerCase()).toBe('#f7f9fb');
    expect(light['--border'].toLowerCase()).toBe('#dde4e9');
    expect(light['--text'].toLowerCase()).toBe('#020817');
    expect(globals).toContain('--radius-card: 12px');
    expect(globals).toContain('--radius-control: 9px');
    expect(globals).toContain('--radius-dashboard-panel: 20px');
    expect(globals).toContain('--layout-gap: 20px');
    expect(globals).toContain('--control-height: 44px');
    expect(globals).toContain('--dashboard-register-row-height: 64px');
    expect(globals).not.toContain('--radius-card: var(--radius-card)');
  });

  it.each([['light', light], ['dark', dark]] as const)('%s provides readable text, actions and semantic status inks', (_theme, palette) => {
    for (const surface of ['--surface', '--surface-2']) {
      for (const ink of ['--text', '--text-2', '--text-3', '--primary']) {
        expect(contrast(rgb(palette[ink]), rgb(palette[surface])), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const ink of ['neutral', 'info', 'progress', 'warn', 'danger', 'success', 'muted']) {
        const foreground = rgb(palette[`--tone-${ink}`]);
        const background = rgb(palette[surface]).map((channel, index) => .86 * channel + .14 * foreground[index]);
        expect(contrast(foreground, background), `${ink} status badge`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(rgb(palette['--primary']), rgb(palette['--on-primary']))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(palette['--brand-solid']), rgb(palette['--on-brand-solid']))).toBeGreaterThanOrEqual(4.5);
  });

  it('self-hosts Neue Jothama, retains an extended-Latin fallback and keeps marketing independently scoped', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('Inter, JetBrains_Mono');
    expect(layout).toContain("subsets: ['latin', 'latin-ext']");
    expect(layout).toContain("display: 'swap'");
    expect(read('src/app/globals.css')).toContain("font-family: 'Neue Jothama'");
    expect(read('src/app/globals.css')).toContain("neue-jothama-variable.woff2");
    expect(read('src/components/ui/application-foundations.css')).toContain('font-family: var(--font-product)');
    expect(read('src/components/onboarding/owner-setup.module.css')).toContain('font-family: var(--font-product)');
    expect(read('src/app/(marketing)/marketing.css')).toContain('--pb-cobalt: #2346f0');
    expect(read('src/app/(marketing)/marketing.css')).toContain('font-family: var(--font-manrope)');
    expect(read('src/components/ui/application-foundations.css')).toContain('.pb-app thead th');
  });

  it('keeps touch targets, forced-colour selection and reduced motion', () => {
    const css = read('src/components/ui/primitives.module.css');
    expect(css).toContain('min-height: var(--control-height)');
    expect(css).toMatch(/\.iconButton\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
    expect(globals).toContain('--control-height: 44px');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(read('src/components/ui/application-foundations.css')).toContain('@media (forced-colors: active)');
    expect(read('src/components/ui/page-tabs.module.css')).toContain('border-bottom: 2px solid transparent');
  });

  it('shares register dimensions without overriding semantic table-cell inks', () => {
    const css = read('src/components/ui/application-foundations.css');
    expect(css).toContain('.pb-app .pb-page');
    expect(css).toContain('max-width: var(--dashboard-content-max)');
    expect(css).toContain('.pb-app .pb-filter');
    expect(css).toContain(".pb-filter[aria-pressed='true']");
    expect(css).toContain('min-height: var(--control-height)');
    expect(css).toContain('.pb-app .pb-table-frame');
    const cells = css.match(/\.pb-app \.pb-data-table tbody :where\(td, th\) \{([^}]+)\}/)?.[1] ?? '';
    expect(cells).toContain('height: var(--dashboard-register-row-height)');
    expect(cells).toContain('padding: 13px 18px');
    expect(cells).toContain('font-size: 13px');
    expect(cells).not.toMatch(/\bcolor:/);
  });

  it('preserves disabled, submit and accessible button contracts', () => {
    const html = renderToStaticMarkup(createElement(Button, { variant: 'primary', type: 'submit', disabled: true, 'aria-label': 'Save property' }, 'Save'));
    expect(html).toContain('type="submit"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Save property"');
    expect(renderToStaticMarkup(createElement(FilterChip, { label: 'Overdue', active: true, count: 0 }))).toContain('aria-pressed="true"');
  });

  it('retains factual KPI content without manufacturing a comparison', () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { label: 'Charges collected', value: '₦575,000' }));
    expect(html).toContain('Charges collected');
    expect(html).toContain('₦575,000');
    expect(html).not.toMatch(/last month|↑|↓|Figma|figma\.com/);
    const cardProps = { padded: false, children: 'Register' };
    expect(renderToStaticMarkup(createElement(Card, cardProps))).toContain('Register');
  });

  it('keeps statuses readable in text and uses initials instead of stock identities', () => {
    const html = renderToStaticMarkup(createElement(StatusPill, { status: 'Overdue', tone: 'warn' }));
    expect(html).toContain('Overdue');
    expect(html).toContain('var(--tone-warn)');
    expect(renderToStaticMarkup(createElement(Avatar, { name: 'Ngozi Adeyemi' }))).toContain('NA');
    expect(renderToStaticMarkup(createElement(Avatar, { name: '' }))).toContain('?');
  });
});
