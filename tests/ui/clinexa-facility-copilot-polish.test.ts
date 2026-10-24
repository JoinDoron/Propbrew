import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CopilotWorkspace } from '@/components/facility/copilot-workspace';
import { FacilityKpi } from '@/components/facility/facility-ui';
import type { CopilotWorld } from '@/domain/facility';
import { asId, type TenantId } from '@/domain/ids';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const actions = vi.hoisted(() => ({ dispatchWoFromAlarm: vi.fn(), acknowledgeAlarm: vi.fn(), receiveStock: vi.fn(), logRefuel: vi.fn(), setCopilotModel: vi.fn(), recordCopilotUsage: vi.fn() }));
vi.mock('@/server/actions/facility', () => actions);
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const source = () => read('src/components/facility/copilot-workspace.tsx');
const world: CopilotWorld = { systems: [], alarms: [], generators: [], parts: [], contracts: [], permits: [], incidents: [], sensors: [], nowMs: Date.parse('2026-07-26T09:00:00Z') };
const render = (overrides: Partial<Parameters<typeof CopilotWorkspace>[0]> = {}) => renderToStaticMarkup(createElement(CopilotWorkspace, { world, userName: 'Bola Adeyemi', model: 'claude-sonnet-5', usage: { requests: 2, inputTokens: 1234, outputTokens: 5678, costMinorNgn: 12345 }, canConfigure: false, ...overrides }));

describe('Facility Clinexa copilot and contract deep polish', () => {
  it('retains priority and usage panels and opens on the shared Ask Copilot conversation', () => {
    const html = render();
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    expect(html.match(/hidden=""/g)).toHaveLength(3);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Ask Copilot/);
    expect(html).toContain('Context &amp; controls');
    expect(html).toContain('Start with a question');
  });
  it('keeps the composer inside its conversation panel instead of above the priority register', () => {
    expect(source()).toContain('conversation={<CopilotPanel title="Facility conversation"');
    expect(source().indexOf('<CopilotConversation')).toBeLessThan(source().indexOf('<CopilotComposer'));
    expect(source()).toContain('maxLength={2000}');
    expect(source()).toContain('label="Ask the facility copilot"');
    expect(read('src/components/ai/copilot-reference.tsx')).toContain('htmlFor={`${id}-question`}');
  });
  it('uses quiet shared KPI cards with exact monetary values and no fake trend', () => {
    const html = render();
    expect(html.match(/class="[^"]*kpiValue_[^"]*"/g)).toHaveLength(8);
    expect(html).toContain('₦123.45');
    expect(html).toContain('not a provider invoice');
    expect(html).toContain('5,678');
    expect(html).not.toContain('↑');
  });
  it('composes the shared Facility KPI instead of maintaining a second card vocabulary', () => {
    const html = renderToStaticMarkup(createElement(FacilityKpi, { label: 'Recorded stock', value: '42', note: 'Snapshot only', tone: 'warn' }));
    expect(html).toMatch(/class="[^"]*kpiHeader_[^"]*"/);
    expect(html).toMatch(/class="[^"]*kpiValue_[^"]*"/);
    expect(html).toContain('Snapshot only');
    expect(read('src/components/facility/facility-ui.tsx')).toContain('<KpiCard label={label} value={value}');
  });
  it('provides named filters, scoped counts and readable severity labels', () => {
    const html = render({ world: { ...world, alarms: [{ id: 'a1', tenantId: asId<TenantId>('tenant-1'), siteId: 'site-1', system: 'Lagos generator', message: 'Overheat', severity: 'critical', atISO: '2026-07-26T09:00:00Z', acknowledged: false }] } });
    expect(html).toContain('Search copilot priorities');
    expect(html).toContain('Priority severity');
    expect(html).toContain('Lagos generator: Overheat');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('critical');
    expect(html).not.toContain('Review action for');
  });
  it('shows record actions only for the corresponding create or update grant', () => {
    const alarmWorld: CopilotWorld = { ...world, alarms: [{ id: 'a1', tenantId: asId<TenantId>('tenant-1'), siteId: 'site-1', system: 'Generator', message: 'Overheat', severity: 'critical', atISO: '2026-07-26T09:00:00Z', acknowledged: false }] };
    expect(render({ world: alarmWorld, canUpdate: true })).not.toContain('Review action for Generator');
    expect(render({ world: alarmWorld, canCreate: true })).toContain('Review action for Generator');
  });
  it('keeps the table horizontally scrollable and keyboard reachable without hiding columns', () => {
    expect(source()).toContain('aria-label="Facility copilot priority register"');
    expect(source()).toContain('tabIndex={0}');
    expect(source().match(/<th scope="col">/g)).toHaveLength(4);
    expect(read('src/components/facility/copilot-workspace.module.css')).toContain('min-width: 820px');
    expect(source()).not.toContain('hidden md:table-cell');
  });
  it('distinguishes priority rule context from verified real-provider responses without fabricated citations', () => {
    expect(source()).toContain('CopilotStreamReply');
    expect(source()).toContain('Rule context labels are not independent citations.');
    expect(source()).toContain('AI answers are labelled only after the server confirms the provider');
    expect(read('src/lib/ai/copilot-client.ts')).toContain('validCopilotSource(module, source)');
    expect(source()).not.toContain('dangerouslySetInnerHTML');
    expect(source()).not.toContain('Reading across your facility signals');
  });
  it('prepares suggested questions without automatically calling a provider', () => {
    expect(source()).toContain('setQ(suggestion); composer.current?.focus()');
    expect(source()).not.toContain('onClick={() => ask(s)');
    expect(source()).toContain('Selecting a suggestion prepares a question');
    expect(source()).toContain('if (!query || asking || pending) return');
    expect(read('src/components/ai/use-copilot-stream.ts')).toContain('question.length > COPILOT_MAX_QUESTION || active.current');
  });
  it('keeps failed requests out of usage records and distinguishes meter failures from answer failures', () => {
    expect(source()).not.toContain('recordCopilotUsage(');
    expect(source()).toContain('if (exchange.usage?.recorded) router.refresh()');
    expect(read('src/components/ai/copilot-stream-reply.tsx')).toContain('usage record was not confirmed');
    expect(read('src/components/ai/copilot-stream-reply.tsx')).toContain("error={exchange.status === 'error'}");
    expect(read('src/components/ai/copilot-reference.tsx')).toContain("role={error ? 'alert' : undefined}");
  });
  it('keeps both operational and model changes reviewed with in-dialog errors', () => {
    expect(source()).toContain('Review copilot recommendation');
    expect(source()).toContain('Review tenant model selection');
    expect(source()).toContain('Review model change');
    expect(source()).toContain('if (!canConfigure || inFlight.current) return');
    expect(source()).toContain('role="alert"');
    expect(source()).toContain('it does not place a supplier order');
    expect(source()).not.toContain(' : 200;');
  });
  it('does not send, mutate records or meter usage during rendering', () => {
    render({ canCreate: true, canUpdate: true, canConfigure: true });
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });
  it('supports narrow screens through stacking, wrapping and safe answer whitespace', () => {
    const css = read('src/components/ai/copilot-reference.module.css');
    expect(css).toContain('grid-template-columns:minmax(0,2fr) minmax(260px,1fr)');
    expect(css).toContain('@media(max-width:1100px)');
    expect(css).toContain('@media(max-width:640px)');
    expect(css).toContain('white-space:pre-wrap');
    expect(css).toContain('overflow-wrap:anywhere');
  });
  it('preserves contract scope, native currency totals and both tabs while upgrading every inner card', () => {
    const page = read('src/app/(ops)/(facility)/contracts/page.tsx');
    expect(page).toContain("requireCapability('assets_ppm', 'read', 'facility')");
    expect(page).toContain('annualValues.set(contract.value.currency');
    expect(page).toContain("id: 'overview'"); expect(page).toContain("id: 'register'");
    expect(page).toContain('<CardHeader title={c.service}');
    expect(page).toContain('scope');
    expect(page).toContain('No contracts in your scope');
    expect(page).toContain('<progress max={100}');
    expect(page).not.toContain('className="- p-4"');
  });
});
