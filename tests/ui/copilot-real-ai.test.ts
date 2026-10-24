import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AskData } from '@/components/reports/ask-data';
import { CopilotWorkspace as FacilityCopilot } from '@/components/facility/copilot-workspace';
import { CopilotWorkspace as ConstructionCopilot, constructionSources } from '@/components/construction/copilot-workspace';
import { ShortletCopilotWorkspace } from '@/components/shortlet/copilot-workspace';
import { CopilotActivityPanel, CopilotComposer } from '@/components/ai/copilot-reference';
import { CopilotStreamReply } from '@/components/ai/copilot-stream-reply';
import type { CopilotExchange } from '@/lib/ai/copilot-client';
import type { CopilotModule } from '@/lib/ai/copilot-protocol';
import type { CopilotWorld } from '@/domain/facility';
import { asId, type TenantId } from '@/domain/ids';

const mocks = vi.hoisted(() => ({ exchanges: [] as CopilotExchange[], busy: false, submit: vi.fn(), stop: vi.fn(), retry: vi.fn(), hook: vi.fn(), refresh: vi.fn(), dispatchWoFromAlarm: vi.fn(), acknowledgeAlarm: vi.fn(), receiveStock: vi.fn(), logRefuel: vi.fn(), setCopilotModel: vi.fn(), recordCopilotUsage: vi.fn() }));
vi.mock('@/components/ai/use-copilot-stream', () => ({ useCopilotAutoScroll: vi.fn(), useCopilotStream: (options: unknown) => { mocks.hook(options); return { exchanges: mocks.exchanges, busy: mocks.busy, submit: mocks.submit, stop: mocks.stop, retry: mocks.retry }; } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/server/actions/facility', () => ({ dispatchWoFromAlarm: mocks.dispatchWoFromAlarm, acknowledgeAlarm: mocks.acknowledgeAlarm, receiveStock: mocks.receiveStock, logRefuel: mocks.logRefuel, setCopilotModel: mocks.setCopilotModel, recordCopilotUsage: mocks.recordCopilotUsage }));

const tenantId = asId<TenantId>('ui-copilot-tenant');
const world: CopilotWorld = { systems: [], alarms: [{ tenantId, id: 'alarm-a', siteId: 'site-a', system: 'Recorded generator', message: 'Recorded high temperature', severity: 'critical', acknowledged: false, atISO: '2026-10-24T09:00:00Z' }], generators: [], parts: [{ tenantId, id: 'part-a', name: 'Recorded generator filter', category: 'Consumables', sku: 'FILTER-A', location: 'Store A', stock: 1, reorderPoint: 5, usedPerMonth: 8, unitCost: { minor: 12345, currency: 'NGN' } }], contracts: [], permits: [], incidents: [], sensors: [], nowMs: Date.parse('2026-10-24T11:30:00Z') };
const usage = { requests: 3, inputTokens: 1200, outputTokens: 2400, costMinorNgn: 12345 };
const modules: CopilotModule[] = ['estate', 'facility', 'shortlet', 'construction'];
function render(module: CopilotModule, canCreate = false, canUpdate = false) {
  if (module === 'estate') return renderToStaticMarkup(createElement(AskData, { standalone: true }));
  if (module === 'facility') return renderToStaticMarkup(createElement(FacilityCopilot, { world, userName: 'Ngozi Adeyemi', model: 'test-model', usage, canConfigure: false, canCreate, canUpdate }));
  if (module === 'construction') return renderToStaticMarkup(createElement(ConstructionCopilot, { suggestions: ['Explain the recorded build'], canSeeCommercials: false }));
  return renderToStaticMarkup(createElement(ShortletCopilotWorkspace, { snapshotISO: '2026-10-24T11:30:00Z', suggestions: ['Explain the recorded stays'] }));
}
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const input = (overrides: Partial<CopilotExchange> = {}): CopilotExchange => ({ id: 'question-a', question: 'Please explain my recorded operations', text: '', status: 'submitted', activities: [], startedAt: 1000, ...overrides });
function result(module: CopilotModule): CopilotExchange {
  const href = module === 'estate' ? '/billing' : module === 'facility' ? '/assets' : `/${module}/bookings`;
  return input({ status: 'complete', text: '**Recorded balance:** NGN ₦1,000.25. USD US$20.01 remains separate.\n\n- Review before acting\n- No bank settlement is confirmed', completedAt: 5000, meta: { v: 1, type: 'meta', source: 'llm', model: 'server-confirmed-model', scopeLabel: 'Your authorised Lagos records', snapshotISO: '2026-10-24T11:30:00Z', sources: [{ id: 'record-a', label: 'Review exact recorded source', href }], coverage: [{ collection: 'records', loaded: 101, total: 120, complete: false }], notices: ['Recorded figures are not verified bank settlements.'] }, usage: { inputTokens: 10, outputTokens: 20, estimatedCostMinorNgn: 1, recorded: true } });
}
beforeEach(() => { vi.clearAllMocks(); mocks.exchanges = []; mocks.busy = false; });

describe('Every module uses real AI conversation and the same public activity contract', () => {
  it.each(modules)('keeps %s navigation, labelled log, draft suggestions and bottom composer', (module) => {
    const html = render(module);
    expect(html).toContain('A connected AI provider is required');
    expect(html).toContain('Suggested questions'); expect(html).toContain('role="log"'); expect(html).toContain('tabindex="0"'); expect(html).toContain('aria-live="polite"');
    expect(html.indexOf('role="log"')).toBeLessThan(html.indexOf('<form'));
    expect(html).toMatch(/maxlength="2000"/i); expect(html).toContain('aria-describedby=');
    expect(html).toMatch(/Suggestions do not send a request|Selecting a suggestion prepares a question/);
    const endpoints = { estate: '/api/estate/copilot', facility: '/api/copilot', shortlet: '/api/shortlet/copilot', construction: '/api/construction/copilot' };
    expect(mocks.hook).toHaveBeenCalledWith(expect.objectContaining({ endpoint: endpoints[module], module }));
    expect(html.match(/role="tabpanel"/g)).toHaveLength(module === 'facility' ? 4 : 2);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.recordCopilotUsage).not.toHaveBeenCalled();
    for (const action of [mocks.dispatchWoFromAlarm, mocks.acknowledgeAlarm, mocks.receiveStock, mocks.logRefuel, mocks.setCopilotModel]) expect(action).not.toHaveBeenCalled();
  });

  it.each(modules)('shows only actual %s application activity and does not call a pending response an AI answer', (module) => {
    mocks.exchanges = [input({ activities: [{ id: 'scope', label: 'Checking workspace access', status: 'complete' }, { id: 'records', label: 'Loading authorised records', status: 'active' }] })]; mocks.busy = true;
    const html = render(module);
    expect(html).toContain('<details'); expect(html).toContain('<summary');
    expect(html).toContain('Checking workspace access'); expect(html).toContain('Loading authorised records');
    expect(html).toContain('application steps, not the model’s private reasoning');
    expect(html).toContain('Stop response'); expect(html).toContain('type="button"');
    expect(html).not.toContain('>AI answer<'); expect(html).not.toContain('server-confirmed-model');
  });

  it.each(modules)('retains exact native figures, %s source links, snapshot, coverage and provider metadata', (module) => {
    mocks.exchanges = [result(module)];
    const html = render(module);
    for (const text of ['NGN ₦1,000.25', 'USD US$20.01', 'Your authorised Lagos records', 'server-confirmed-model', '101 loaded of 120', 'Partial record coverage', 'Review exact recorded source', '24 October 2026', 'WAT', 'AI answer', 'Worked for 4s', 'Recorded figures are not verified bank settlements.']) expect(html).toContain(text);
    expect(html).toContain(`href="${result(module).meta!.sources[0].href}"`);
    expect(html).toContain('<strong>Recorded balance:</strong>');
    expect(html).not.toContain('Rules-based answer'); expect(html).not.toContain('Built-in rules');
  });

  it.each(modules)('keeps %s partial text on Stop and offers an explicit retry without fabricating success', (module) => {
    mocks.exchanges = [input({ text: 'Partial answer with NGN ₦10.01', status: 'stopped', completedAt: 3000 })];
    const html = render(module);
    expect(html).toContain('Partial answer with NGN ₦10.01'); expect(html).toContain('Stopped · incomplete'); expect(html).toContain('partial answer is incomplete'); expect(html).toContain('Retry question');
    expect(html).not.toContain('>AI answer<'); expect(mocks.retry).not.toHaveBeenCalled();
  });

  it.each(modules)('shows %s provider configuration errors as errors instead of a rules fallback', (module) => {
    mocks.exchanges = [input({ status: 'error', completedAt: 2000, error: { code: 'provider_missing', message: 'An AI provider must be configured before this request can run.', retryable: false } })];
    const html = render(module);
    expect(html).toContain('role="alert"'); expect(html).toContain('An AI provider must be configured'); expect(html).toContain('Request unsuccessful');
    expect(html).not.toContain('Retry question'); expect(html).not.toContain('>AI answer<'); expect(html).not.toContain('Showing a built-in response');
  });

  it('preserves all Facility priorities, usage and independent create/update reviews', () => {
    const view = render('facility');
    for (const text of ['Priority actions', 'Usage &amp; cost', 'Recorded generator: Recorded high temperature', '₦123.45', 'Search copilot priorities', 'Priority severity', 'Review model change']) {
      if (text !== 'Review model change') expect(view).toContain(text);
      else expect(view).not.toContain(text);
    }
    expect(view).not.toContain('Review action for Recorded generator: Recorded high temperature');
    expect(render('facility', true, false)).toContain('Review action for Recorded generator: Recorded high temperature');
    expect(render('facility', false, true)).not.toContain('Review action for Recorded generator: Recorded high temperature');
    expect(render('facility', false, true)).toContain('Review action for Recorded generator filter below reorder point');
    expect(render('facility', true, false)).not.toContain('Review action for Recorded generator filter below reorder point');
    const source = read('src/components/facility/copilot-workspace.tsx');
    expect(source).toContain("insight.action.kind === 'dispatch_alarm' ? canCreate");
    expect(source).toContain('Confirm recorded action');
    expect(source).not.toContain('recordCopilotUsage(');
  });

  it('refreshes Facility usage only after the server confirms the usage record', () => {
    render('facility');
    const options = mocks.hook.mock.calls[0][0] as { onComplete: (exchange: CopilotExchange) => void };
    options.onComplete({ ...result('facility'), usage: { ...result('facility').usage!, recorded: false } });
    expect(mocks.refresh).not.toHaveBeenCalled();
    options.onComplete(result('facility'));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.recordCopilotUsage).not.toHaveBeenCalled();
  });

  it('shows unavailable Facility ledger totals explicitly without replacing them with zero or seeded spend', () => {
    const html = renderToStaticMarkup(createElement(FacilityCopilot, { world, userName: 'Ngozi', model: 'test-model', usage: null, canConfigure: false }));
    expect(html).toContain('Usage unavailable'); expect(html).toContain('No request, token or cost total is inferred.');
    expect(html).not.toContain('₦123.45'); expect(html).not.toContain('₦0.00');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
  });

  it('labels confirmed token counts and distinguishes conservative unknown cost from zero usage or an invoice', () => {
    const html = render('facility');
    for (const text of ['Confirmed input tokens', 'Confirmed output tokens', 'Confirmed provider-reported token counts', 'missing token counts are not evidence of zero usage', 'Interrupted calls without confirmed usage may retain a conservative cost charge', 'fixed planning FX', 'not a provider invoice or a current exchange-rate quote']) expect(html).toContain(text);
    expect(html).not.toContain('Input tokens · estimate'); expect(html).not.toContain('Estimated input and output tokens');
  });

  it('folds verbose context into a named native disclosure while source links and partial warnings stay outside', () => {
    const html = renderToStaticMarkup(createElement(CopilotStreamReply, { exchange: result('shortlet'), name: 'Shortlet Copilot', busy: false, onRetry: vi.fn() }));
    const summary = html.indexOf('<summary aria-label="Record context &amp; coverage"');
    const open = html.lastIndexOf('<details', summary), close = html.indexOf('</details>', summary);
    expect(summary).toBeGreaterThan(-1); expect(html.slice(open, summary)).not.toMatch(/\sopen(?:=|\s|>)/);
    expect(html.indexOf('server-confirmed-model')).toBeGreaterThan(summary);
    expect(html.indexOf('server-confirmed-model')).toBeLessThan(close);
    expect(html.indexOf('href="/shortlet/bookings"')).toBeGreaterThan(close);
    expect(html.indexOf('Partial record coverage')).toBeLessThan(open);
  });

  it('gives actual activity a named native summary, respects reduced motion and never renders hidden model data', () => {
    const activities = [{ id: 'records', label: 'Loading authorised records', status: 'active' as const, reasoning: 'PRIVATE_MODEL_REASONING', providerSecret: 'PRIVATE_PROVIDER_SECRET' }];
    const html = renderToStaticMarkup(createElement(CopilotActivityPanel, { activities, status: 'submitted', startedAt: 1000 }));
    expect(html).toContain('<summary aria-label="Loading authorised records — show request activity"');
    expect(html).not.toMatch(/PRIVATE_MODEL_REASONING|PRIVATE_PROVIDER_SECRET|reasoning=/);
    const css = read('src/components/ai/copilot-reference.module.css');
    expect(css).toMatch(/@media\(prefers-reduced-motion:reduce\)[\s\S]*animation:none/);
    expect(css).toMatch(/activityChevron\{transition:none/);
  });

  it('keeps Estate embedded in its existing parent tabs without introducing nested tabs', () => {
    const html = renderToStaticMarkup(createElement(AskData));
    expect(html).not.toContain('role="tab"'); expect(html).not.toContain('role="tabpanel"');
    expect(html).toContain('Estate conversation'); expect(html).toContain('How to review a Copilot answer');
    expect(read('src/components/reports/ask-data.tsx')).not.toContain('await askData(');
  });

  it('keeps generated Markdown links and HTML inert while citations remain separate', () => {
    const value = result('shortlet');
    value.text = '**Review** [bad link](javascript:alert(1)) <img src=x onerror=alert(1)>\n\n- Exact ₦1.01';
    const html = renderToStaticMarkup(createElement(CopilotStreamReply, { exchange: value, name: 'Shortlet Copilot', busy: false, onRetry: vi.fn() }));
    expect(html).toContain('<strong>Review</strong>'); expect(html).not.toContain('href="javascript:'); expect(html).not.toContain('<img src=x'); expect(html).toContain('&lt;img');
    expect(html).toContain('href="/shortlet/bookings"');
  });

  it('does not label an interrupted provider response as a completed AI answer', () => {
    const value = { ...result('shortlet'), status: 'error' as const, error: { code: 'disconnected', message: 'Connection interrupted.', retryable: true } };
    const html = renderToStaticMarkup(createElement(CopilotStreamReply, { exchange: value, name: 'Shortlet Copilot', busy: false, onRetry: vi.fn() }));
    expect(html).toContain('Partial AI response'); expect(html).toContain('Request unsuccessful');
    expect(html).not.toContain('>AI answer<');
  });

  it('keeps Stop an independent action rather than another submit, and leaves idle drafts unsent', () => {
    const submit = vi.fn(), stop = vi.fn();
    const html = renderToStaticMarkup(createElement(CopilotComposer, { label: 'Ask your module', value: 'Draft question', onChange: vi.fn(), onSubmit: submit, busy: true, onStop: stop }));
    expect(html).toMatch(/<button[^>]+type="button"/); expect(html).toContain('Stop response'); expect(html).not.toContain('type="submit"');
    expect(submit).not.toHaveBeenCalled(); expect(stop).not.toHaveBeenCalled();
  });

  it('retains safe legacy Construction citation parsing without using it as transport', () => {
    expect(constructionSources(JSON.stringify([{ label: 'Schedule', href: '/construction/schedule' }]))).toEqual([{ label: 'Schedule', href: '/construction/schedule' }]);
    for (const href of ['/construction/../../admin', 'https://other.invalid', '//other.invalid', 'javascript:alert(1)']) expect(constructionSources(JSON.stringify([{ label: 'Unsafe', href }]))).toEqual([]);
  });
});
