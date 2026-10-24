import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CommandCenter, type SignalRow } from '@/components/construction/command-center';
import { CopilotWorkspace, constructionSources } from '@/components/construction/copilot-workspace';
import { ConstructionKpi, ConstructionPanelHeader } from '@/components/construction/construction-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/construction', () => ({ acknowledgeSignal: vi.fn() }));
const source = (name: string) => readFileSync(`src/components/construction/${name}`, 'utf8');
const render = (canMutate: boolean) => renderToStaticMarkup(createElement(CommandCenter, {
  confidence: { score: 42, band: 'danger', label: 'At risk', nairaAtRiskMinor: 100000025 },
  projects: [{ id: 'p-1', name: 'Lekki waterfront and residential development', code: 'LAG-01', status: 'active', percentComplete: 25, plannedPercent: 40, cpi: .8, spi: .7, costBand: 'warn', scheduleBand: 'danger', eacMinor: 200000025, bacMinor: 150000025, curve: [{ pv: 1, ev: 2 }], onSite: 3, planned: 5, forecastFinishISO: '2027-08-15', slipDays: 14 }],
  signals: Array.from({ length: 10 }, (_, index): SignalRow => ({ id: `signal-${index}`, kind: 'schedule_slip', projectName: 'Lekki waterfront', severity: 'danger', confidence: .8, title: `Recorded concern ${index}`, evidence: `Full evidence ${index}`, recommendation: `Human review ${index}`, nairaAtRiskMinor: 25, href: '/construction/schedule', state: index === 0 ? 'ack' : 'open' })),
  deliveries: { late: [], today: [], upcoming: Array.from({ length: 5 }, (_, index) => ({ ref: `PO-${index}`, item: `Reinforcement delivery ${index}`, vendorName: 'Lagos building materials supplier', expectedISO: '2026-09-08', qty: 10, deliveredQty: 3, unit: 'tonnes', late: false })) },
  kpis: { activeProjects: 1, onSite: 3, plannedCrew: 5, openPoValueMinor: 200000025, criticalSignals: 10 }, canMutate,
}));

describe('Construction portfolio records and source-first Copilot', () => {
  it('renders every supplied delivery and active signal without a hidden preview limit', () => {
    const html = render(false);
    for (const text of ['Recorded concern 9', 'Full evidence 9', 'Human review 9', 'PO-4', 'Reinforcement delivery 4', '3/10', '8 Sept 2026', '15 Aug 2027', '14d later than plan', 'Lekki waterfront and residential development']) expect(html).toContain(text);
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('Illustrative planned and earned value curve');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain('role="img" aria-label="Rules-based delivery score: 42 out of 100"');
    expect(source('command-center.tsx')).not.toMatch(/(?:activeSignals|deliveries\.upcoming)\.slice/);
  });

  it('preserves exact kobo and keeps acknowledgements behind the existing human review and grants', () => {
    const viewer = render(false), manager = render(true);
    for (const amount of ['₦1,000,000.25', '₦2,000,000.25', '₦1,500,000.25', '₦0.25']) expect(viewer).toContain(amount);
    expect(viewer).toContain('Acknowledged');
    expect(viewer).not.toContain('>Acknowledge</button>');
    expect(manager.match(/>Acknowledge<\/button>/g)).toHaveLength(9);
    const workspace = source('command-center.tsx');
    expect(workspace).toContain('act(() => acknowledgeSignal(id)');
    expect(workspace).toContain('disabled={pending}');
    expect(workspace).toContain('It does not resolve the underlying construction risk.');
  });

  it('uses shared card headers and readable financial KPIs without rounding amounts', () => {
    const html = renderToStaticMarkup(createElement(ConstructionKpi, { label: 'Open PO value', value: '₦2,000,000.25', tone: 'info' }));
    expect(html).toContain('₦2,000,000.25');
    expect(html).toContain('longMetric');
    const header = renderToStaticMarkup(createElement(ConstructionPanelHeader, { title: 'Delivery radar', subtitle: 'All recorded deliveries' }));
    expect(header).toContain('<h3');
    expect(header).toContain('All recorded deliveries');
  });

  it('accepts only well-formed Construction citations and handles malformed headers safely', () => {
    const citations = [{ label: 'Schedule', href: '/construction/schedule' }, { label: 'Portfolio', href: '/construction' }];
    expect(constructionSources(encodeURIComponent(JSON.stringify(citations)))).toEqual(citations);
    expect(constructionSources(null)).toEqual([]);
    expect(constructionSources('%broken')).toEqual([]);
    expect(constructionSources(JSON.stringify({ label: 'not an array' }))).toEqual([]);
    for (const href of ['javascript:alert(1)', 'https://example.org', '//example.org', '/admin', '/construction/../../admin', '/construction/\\example.org', '/construction/schedule bad']) expect(constructionSources(JSON.stringify([{ label: 'Bad source', href }]))).toEqual([]);
    expect(constructionSources(JSON.stringify([null, 'text', { label: 1, href: '/construction' }, { label: '', href: '/construction' }]))).toEqual([]);
  });

  it('makes suggestions editable drafts and keeps request errors distinct from missing supporting records', () => {
    const html = renderToStaticMarkup(createElement(CopilotWorkspace, { suggestions: ['What needs attention?'], canSeeCommercials: false }));
    for (const text of ['What needs attention?', 'commercial figures hidden for your access level', 'Suggestions fill your draft', 'Suggestions do not send a request', 'The copilot never transacts', 'type="submit"', 'aria-describedby=', 'role="log"']) expect(html).toContain(text);
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    const workspace = source('copilot-workspace.tsx');
    expect(workspace).toContain('setQuestion(value); composer.current?.focus()');
    expect(workspace).not.toContain('ask(suggestion)');
    expect(workspace).toContain('<CopilotStreamReply');
    const reply = readFileSync('src/components/ai/copilot-stream-reply.tsx', 'utf8');
    expect(reply).toContain('Request unsuccessful');
    expect(reply).toContain('partial answer is incomplete');
    expect(reply).not.toContain('No supporting record found');
    expect(readFileSync('src/components/ai/use-copilot-stream.ts', 'utf8')).toContain('question.length > COPILOT_MAX_QUESTION || active.current');
    expect(workspace).toContain("endpoint: '/api/construction/copilot', module: 'construction'");
    expect(workspace).toContain('onStop={stop}');
  });
});
