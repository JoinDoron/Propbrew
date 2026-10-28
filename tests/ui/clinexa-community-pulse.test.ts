import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CommunityPulse } from '@/components/estate/community-pulse';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/estate', () => ({ acknowledgeFeedback: vi.fn(), resolveComplaint: vi.fn() }));

type Props = ComponentProps<typeof CommunityPulse>;
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const view = () => read('src/components/estate/community-pulse.tsx');
const styles = () => read('src/components/estate/community-pulse.module.css');
const fixtures: Props = {
  health: { score: 74, band: 'warn', label: 'Needs attention' },
  nps: 25,
  sentiment: { positive: 3, neutral: 1, negative: 2 },
  engagement: { appAdoptionPct: 72, announcementReadPct: 86, eventAttendancePct: 42, pollParticipationPct: 35, activeResidents: 36, totalResidents: 50 },
  feedback: [
    { id: 'feedback-open', residentName: 'Folake Bello', unitLabel: 'Block C · 12B', channel: 'app', sentiment: 'negative', topic: 'Lift', text: 'Please investigate the noisy lift.', atISO: '2026-10-23T08:00:00Z', acknowledged: false },
    { id: 'feedback-ack', residentName: 'Tobi Ade', unitLabel: 'Block C · 09A', channel: 'whatsapp', sentiment: 'positive', topic: 'Security', text: 'The gate response has improved.', atISO: '2026-10-23T07:00:00Z', acknowledged: true },
  ],
  complaints: [
    { id: 'complaint-open', building: 'Block C', category: 'Water supply', severity: 'high', status: 'open', atISO: '2026-10-23T08:00:00Z' },
    { id: 'complaint-resolved', building: 'Block D', category: 'Waste collection', severity: 'low', status: 'resolved', atISO: '2026-10-22T08:00:00Z' },
  ],
  hotspots: [{ building: 'Block C', open: 2, high: 1 }],
  atRisk: [{ name: 'Folake Bello', unitLabel: 'Block C · 12B', score: 82, band: 'danger', note: '2 negative signals' }],
  nowMs: Date.parse('2026-10-23T09:00:00Z'),
};
const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(CommunityPulse, { ...fixtures, ...overrides }));

describe('Clinexa-aligned Community Pulse', () => {
  it('uses the shared application primitives rather than a separate hero/widget system', () => {
    const source = view();
    for (const primitive of ['Card', 'CardHeader', 'KpiCard', 'StatusPill', 'Button', 'Avatar', 'EmptyState']) {
      expect(source).toMatch(new RegExp(`<${primitive}(?:\\s|>)`));
    }
    expect(source).not.toContain('pb-hero');
    expect(source).not.toMatch(/text-\[(?:8|12\.5)px\]|opacity-55/);
  });

  it('preserves the four mounted page sections and their stable selection IDs', () => {
    const html = render();
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    for (const id of ['overview', 'risk', 'feedback', 'complaints']) {
      expect(view()).toMatch(new RegExp(`id:\\s*'${id}'`));
    }
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain(' hidden=""');
  });

  it('keeps all supplied resident and complaint records, statuses and operational context', () => {
    const html = render();
    for (const text of ['Folake Bello', 'Tobi Ade', 'Block C', 'Block D', 'Please investigate the noisy lift.', 'The gate response has improved.', 'Water supply', 'Waste collection', '2 negative signals', '72%', '86%', '42%', '35%']) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/acknowledged/i);
    expect(html).toMatch(/resolved/i);
    expect(html).toContain('var(--tone-danger)');
  });

  it('retains guarded server actions, transition feedback and refreshed data after success', () => {
    const source = view();
    expect(source).toContain('acknowledgeFeedback(row.id)');
    expect(source).toContain('resolveComplaint(row.id)');
    expect(source).toContain('disabled={pending}');
    expect(source).toContain('router.refresh()');
    expect(source).toContain('role="status"');
    expect(source).toContain("flash(result.error ?? 'Unable to save. Please try again.')");
    // The status role already supplies polite live announcements implicitly.
    expect(source).toMatch(/catch\s*\{\s*flash\('Unable to save\. Please try again\.'/);
  });

  it('uses a semantic complaint register with local keyboard-accessible overflow', () => {
    const html = render();
    expect(html).toContain('<table');
    expect(html).toContain('pb-data-table');
    expect(html).toContain('pb-table-scroll');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('scope="col"');
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
  });

  it('provides named numerical progress values instead of colour-only chart information', () => {
    const html = render();
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="72"');
    expect(html).toMatch(/aria-label="[^"]*App adoption[^"]*"/i);
    expect(html).toMatch(/aria-label="[^"]*(?:health|experience)[^"]*"/i);
  });

  it('does not imply a live provider feed or provider-backed AI prediction', () => {
    const html = render();
    expect(html).not.toMatch(/AI-scored|animate-ping|animate-pulse|>\s*live\s*</i);
    expect(html).toMatch(/human review|review signal|review indicator|decision support/i);
  });

  it('reports an actual zero signal count without rendering a synthetic chart or invalid values', () => {
    const html = render({ sentiment: { positive: 0, neutral: 0, negative: 0 } });
    expect(html).toContain('0 signals');
    expect(html).not.toContain('1 signals');
    expect(html).toContain('No feedback signals recorded yet.');
    expect(html).not.toContain('aria-label="Resident sentiment:');
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it.each([
    ['hotspots', 'No complaint hotspots', 'There are no open complaints in your estate scope.'],
    ['atRisk', 'No retention signals', 'Recorded feedback and account signals will appear here when available.'],
    ['feedback', 'No resident feedback yet', 'Feedback recorded in your estate will appear here.'],
    ['complaints', 'No complaints recorded', 'Complaints in your estate scope will appear here.'],
  ] as const)('gives an honest empty state for %s inside the preserved section', (key, title, description) => {
    const html = render({ [key]: [] });
    expect(html).toContain(title);
    expect(html).toContain(description);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    expect(html.indexOf(title)).toBeGreaterThan(html.indexOf('role="tabpanel"'));
  });

  it('names each available action and omits mutation controls for already completed records', () => {
    const html = render();
    expect(html).toContain('aria-label="Acknowledge feedback from Folake Bello"');
    expect(html).not.toContain('aria-label="Acknowledge feedback from Tobi Ade"');
    expect(html).toContain('aria-label="Resolve Water supply in Block C"');
    expect(html).not.toContain('aria-label="Resolve Waste collection in Block D"');
    expect(html).toContain('No action needed');
    expect(html).toMatch(/datetime="2026-10-23T08:00:00Z"/i);
  });

  it('bounds accessible progress values and visual widths when a recorded percentage is out of range', () => {
    const html = render({ engagement: { ...fixtures.engagement, appAdoptionPct: 145, eventAttendancePct: -20 } });
    const bars = [...html.matchAll(/<div[^>]*role="progressbar"[^>]*>/g)].map((match) => match[0]);
    expect(bars.find((bar) => bar.includes('aria-label="App adoption"'))).toContain('aria-valuenow="100"');
    expect(bars.find((bar) => bar.includes('aria-label="Event attendance"'))).toContain('aria-valuenow="0"');
    expect(html).not.toMatch(/style="[^"]*width:(?:145|-20)%/);
  });

  it('keeps tenant-scoped inputs and capability-protected arrears separate from the client presentation', () => {
    const page = read('src/app/(ops)/(estate)/community/page.tsx');
    expect(page).toContain("requireCapability('announcements', 'read', 'estate')");
    for (const repository of ['residentFeedback', 'complaints', 'engagementSnapshot', 'collectionCases']) {
      expect(page).toContain(`repos.${repository}.list(actor)`);
    }
    expect(page).toMatch(/try\s*\{\s*arrears\s*=\s*repos\.collectionCases/);
    expect(view()).not.toMatch(/from ['"]@\/server\/(?:data|session)['"]/);
  });

  it('uses 24px desktop rhythm and explicit responsive analytics and metric layouts', () => {
    const css = styles();
    expect(css).toMatch(/\.metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.analytics\s*\{[^}]*grid-template-columns:/);
    expect(css).toMatch(/gap:\s*24px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*\d+px\)/);
    expect(css).toMatch(/\.metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.metrics\s*\{[^}]*grid-template-columns:\s*(?:minmax\(0,\s*1fr\)|1fr)/);
    expect(css).toMatch(/gap:\s*16px/);
    expect(css).not.toContain('!important');
  });

  it('keeps readable records, metadata and completed rows in the shared themed surface system', () => {
    const css = styles();
    expect(css).toMatch(/\.recordText\s*\{[^}]*font-size:\s*14px/);
    expect(css).toMatch(/\.metadata\s*\{[^}]*font-size:\s*12px/);
    expect(css).toMatch(/\.panelBody\s*\{[^}]*font-size:\s*14px/);
    expect(css).toContain('min-width: 0');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).not.toMatch(/\.record\s*\{[^}]*opacity:/);
    const primitives = read('src/components/ui/primitives.module.css');
    expect(primitives).toContain('.cardPadded { padding: var(--dashboard-panel-padding); }');
    expect(primitives).toContain('.cardPadded { padding: 16px; }');
    expect(primitives).toContain('.heading { color: var(--text); font-size: 16px;');
    expect(primitives).toContain('min-height: var(--control-height)');
    expect(primitives).toMatch(/\.iconButton\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
  });
});
