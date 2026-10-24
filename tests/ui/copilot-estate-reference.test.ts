import { createElement, isValidElement, type ComponentProps, type ElementType, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskData, EstateCopilotReply } from '@/components/reports/ask-data';
import { CopilotComposer, CopilotConversation, CopilotSuggestions } from '@/components/ai/copilot-reference';
import { PageTabs } from '@/components/ui/page-tabs';
import type { DataAnswer } from '@/server/actions/ask-data';

const boundary = vi.hoisted(() => ({ ask: vi.fn() }));

// Exercise the component's real event handlers without a browser, provider or record action.
const hooks = vi.hoisted(() => ({ active: false, cursor: 0, slots: [] as unknown[], pending: false, jobs: [] as Promise<unknown>[] }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState(initial: unknown) {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks.slots[index], (value: unknown) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value; }];
    },
    useRef(initial: unknown) {
      if (!hooks.active) return actual.useRef(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
      if (!hooks.active) return actual.useEffect(effect, dependencies);
    },
  };
});

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const source = () => read('src/components/reports/ask-data.tsx');
const answer: DataAnswer = { matched: true, answer: 'Recorded amount is ₦1,000.25; not verified bank settlement.', metric: '₦1,000.25', detail: ['Ada Okafor · INV-01 · ₦500.24 · 60d', 'Full second account reference'], sources: [{ label: 'Review the exact recorded invoices', href: '/billing' }, { label: 'Estate work order register', href: '/estate/work-orders' }], confidence: .95, scopeLabel: 'your 1 estate(s)' };
const render = (props?: ComponentProps<typeof AskData>) => renderToStaticMarkup(createElement(AskData, props ?? {}));
const reply = (value: DataAnswer) => renderToStaticMarkup(createElement(EstateCopilotReply, { answer: value }));

function tree() {
  hooks.active = true; hooks.cursor = 0;
  try { return AskData({}); } finally { hooks.active = false; }
}
function find<T extends ElementType>(root: ReactNode, type: T): ReactElement<ComponentProps<T>> {
  let found: ReactElement<ComponentProps<T>> | undefined;
  const seen = new Set<object>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (isValidElement(value) && value.type === type) { found = value as ReactElement<ComponentProps<T>>; return; }
    for (const child of Object.values(value)) visit(child);
  }
  visit(root);
  if (!found) throw new Error('Expected shared Copilot primitive was not composed.');
  return found;
}
async function settle() { await Promise.allSettled(hooks.jobs); for (let index = 0; index < 40; index++) await Promise.resolve(); }

function stream(value: DataAnswer) {
  const events = [
    { v: 1, type: 'start', requestId: 'estate-test-request' },
    { v: 1, type: 'activity', activity: { id: 'records', label: 'Loaded authorised records', status: 'complete' } },
    { v: 1, type: 'meta', source: 'llm', model: 'test-model', scopeLabel: value.scopeLabel, snapshotISO: '2026-10-24T11:30:00Z', coverage: [], sources: value.sources.map((entry, index) => ({ ...entry, id: 'source-' + index })), notices: [] },
    { v: 1, type: 'delta', text: [value.answer, value.metric, ...value.detail ?? []].filter(Boolean).join('\n\n') },
    { v: 1, type: 'complete', interactionId: 'estate-test-interaction', usage: { inputTokens: 10, outputTokens: 20, estimatedCostMinorNgn: 1, recorded: true } },
  ];
  return new Response(events.map((event) => JSON.stringify(event)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
}

beforeEach(() => {
  vi.clearAllMocks(); hooks.active = false; hooks.cursor = 0; hooks.slots = []; hooks.pending = false; hooks.jobs = [];
  boundary.ask.mockReset(); boundary.ask.mockResolvedValue(answer);
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    expect(url).toBe('/api/estate/copilot');
    const body = JSON.parse(init.body as string) as { question: string };
    const job = Promise.resolve(boundary.ask(body.question)).then(stream);
    hooks.jobs.push(job);
    return job;
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('Estate shared Ask Copilot presentation', () => {
  it('uses the same summary, two-column conversation, suggestions and bottom composer primitives', () => {
    for (const name of ['CopilotFrame', 'CopilotSummary', 'CopilotLayout', 'CopilotPanel', 'CopilotConversation', 'CopilotMessage', 'CopilotComposer', 'CopilotSuggestions', 'CopilotSafeguards']) expect(source()).toContain('<' + name);
    const html = render();
    for (const text of ['Estate Copilot · scoped record context', 'Ask about your estate', 'Estate conversation', 'Suggested questions', 'Start with an estate question', 'Suggestions fill your draft. You choose when to ask.', 'Human review required']) expect(html).toContain(text);
    expect(html.indexOf('role="log"')).toBeLessThan(html.indexOf('<form'));
    expect(html.indexOf('<form')).toBeLessThan(html.indexOf('<aside'));
    expect(boundary.ask).not.toHaveBeenCalled();
  });

  it('keeps embedded Reports navigation local without adding nested tabs', () => {
    const html = render(); expect(html).not.toContain('role="tab"'); expect(html).not.toContain('role="tabpanel"');
    const outer = renderToStaticMarkup(createElement(PageTabs, { label: 'Reports sections', items: [{ id: 'metrics', label: 'Metrics & exports', content: createElement('p', null, 'Recorded metrics') }, { id: 'ask', label: 'Ask your data', content: createElement(AskData) }] }));
    expect(outer.match(/role="tab"/g)).toHaveLength(2); expect(outer.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(outer).toContain('How to review a Copilot answer');
  });

  it('gives standalone Estate Copilot exactly the assistant and safeguards sections, with both panels mounted', () => {
    const html = render({ standalone: true });
    expect(html.match(/role="tab"/g)).toHaveLength(2); expect(html.match(/role="tabpanel"/g)).toHaveLength(2); expect(html.match(/hidden=""/g)).toHaveLength(1);
    expect(html).toContain('Estate Copilot sections'); expect(html).toContain('Review &amp; safeguards');
    expect(source().indexOf("id: 'assistant'")).toBeLessThan(source().indexOf("id: 'safeguards'"));
  });

  it('provides a keyboard-reachable live conversation and an associated labelled textarea', () => {
    const html = render();
    expect(html).toContain('role="log" tabindex="0" aria-label="Estate copilot conversation" aria-live="polite" aria-busy="false"');
    expect(html).toMatch(/<label for="([^"]+)">Ask the estate copilot<\/label><textarea id="\1"/);
    expect(html).toMatch(/maxlength="2000"/i); expect(html).toContain('aria-describedby=');
    expect(html).toContain('type="submit" disabled=""');
  });

  it('preserves exact native-currency metrics, all details, scope and module-local record links', () => {
    const html = reply(answer);
    for (const value of [answer.answer, answer.metric!, ...answer.detail!, answer.scopeLabel, 'Rules-based answer', 'Rule matched']) expect(html).toContain(value);
    for (const entry of answer.sources) { expect(html).toContain(`href="${entry.href}"`); expect(html).toContain(entry.label); }
    expect(html).not.toContain('href="/work-orders"'); expect(html).not.toContain('95% confidence');
    expect(html).toContain('Rule-match scores are not calibrated AI confidence.');
  });

  it('shows an unsupported mixed-currency answer and its review link without inventing a financial metric', () => {
    const html = reply({ matched: false, answer: 'Mixed currencies cannot be combined. Review Billing by currency.', metric: 'DO NOT SHOW THIS UNSUPPORTED METRIC', sources: [{ label: 'Review Billing by currency', href: '/billing' }], confidence: 0, scopeLabel: 'all your estates' });
    expect(html).toContain('Mixed currencies cannot be combined.'); expect(html).toContain('No supported rule'); expect(html).toContain('href="/billing"');
    expect(html).not.toContain('DO NOT SHOW THIS UNSUPPORTED METRIC'); expect(html).not.toContain('₦0');
  });

  it('preserves access explanations and missing source evidence without showing confidence as permission', () => {
    const html = reply({ matched: true, answer: 'Your role does not have access to billing data.', sources: [], confidence: 1, scopeLabel: 'your 1 estate(s)' });
    expect(html).toContain('Your role does not have access to billing data.'); expect(html).toContain('No linked source records were supplied');
    expect(html).not.toContain('<a '); expect(html).not.toContain('100%'); expect(html).not.toContain('AI-assisted answer');
  });

  it('retains every detail and source even when several links share the same register', () => {
    const details = Array.from({ length: 8 }, (_, index) => `Full detail record ${index + 1}`);
    const sources = Array.from({ length: 7 }, (_, index) => ({ label: `Full source reference ${index + 1}`, href: '/billing' }));
    const html = reply({ ...answer, metric: '0', detail: details, sources });
    for (const detail of details) expect(html).toContain(detail);
    for (const entry of sources) expect(html).toContain(entry.label);
    expect(html.match(/href="\/billing"/g)).toHaveLength(7);
  });

  it('keeps claims honest about real AI, repository coverage, currency and emergency response', () => {
    const html = render();
    for (const text of ['A connected AI provider is required.', 'may not contain every record', 'mixed currencies require a separate Billing review', 'not verified emergency dispatch or SLA measurements', 'Questions never approve, publish, send reminders, change charges or dispatch emergency help', 'not private model reasoning', 'no rules answer is substituted']) expect(html).toContain(text);
    expect(source()).not.toMatch(/answer\.(?:confidence|reasoning|chainOfThought)|dangerouslySetInnerHTML/);
  });

  it('retains the current Reports guards and calls only the scoped real AI conversation endpoint', () => {
    const route = read('src/app/(ops)/(estate)/reports/page.tsx');
    expect(route).toContain("requireCapability('reports_analytics', 'read', 'estate')");
    expect(route).toContain("can(actor, 'charges_invoicing', 'read').allowed");
    expect(route).toContain("can(actor, 'work_orders', 'read').allowed");
    expect(source()).toContain("endpoint: '/api/estate/copilot', module: 'estate'");
    expect(source()).not.toContain('await askData(');
    expect(source()).not.toMatch(/fetch\(|sendAnnouncement\(|sendReminderCampaign\(|generate\(|fireWoTransition\(|dispatch[A-Z]\w*\(/);
  });
});

describe('Estate Copilot question and draft interaction', () => {
  it('fills and focuses a suggested draft without sending a request', () => {
    const initial = tree(); const focus = vi.fn();
    find(initial, CopilotComposer).props.inputRef!.current = { focus } as unknown as HTMLTextAreaElement;
    const suggestions = find(initial, CopilotSuggestions).props;
    suggestions.onSelect(suggestions.items[0]);
    expect(find(tree(), CopilotComposer).props.value).toBe(suggestions.items[0]);
    expect(focus).toHaveBeenCalledOnce(); expect(boundary.ask).not.toHaveBeenCalled();
  });

  it('ignores blank requests and sends only the trimmed question after explicit submission', async () => {
    find(tree(), CopilotComposer).props.onSubmit('   ');
    expect(boundary.ask).not.toHaveBeenCalled();
    find(tree(), CopilotComposer).props.onSubmit('  What is the collection rate?  ');
    expect(boundary.ask).toHaveBeenCalledExactlyOnceWith('What is the collection rate?');
    expect(find(tree(), CopilotComposer).props.value).toBe('');
    await settle();
    const html = renderToStaticMarkup(tree());
    expect(html).toContain('What is the collection rate?'); expect(html).toContain(answer.answer);
  });

  it('blocks duplicate submissions while pending and disables both drafting and the composer', async () => {
    let resolveAnswer!: (value: DataAnswer) => void;
    boundary.ask.mockReturnValue(new Promise<DataAnswer>((resolve) => { resolveAnswer = resolve; }));
    const submit = find(tree(), CopilotComposer).props.onSubmit;
    submit('Open work orders'); submit('Open work orders');
    expect(boundary.ask).toHaveBeenCalledTimes(1);
    expect(find(tree(), CopilotComposer).props.busy).toBe(true);
    expect(find(tree(), CopilotSuggestions).props.disabled).toBe(true);
    expect(find(tree(), CopilotConversation).props.busy).toBe(true);
    expect(renderToStaticMarkup(tree())).toContain('Waiting for the AI response…');
    resolveAnswer(answer); await settle();
    expect(find(tree(), CopilotComposer).props.busy).toBe(false);
  });

  it('keeps question/answer history chronological after subsequent requests', async () => {
    boundary.ask.mockResolvedValueOnce({ ...answer, answer: 'First recorded answer' }).mockResolvedValueOnce({ ...answer, answer: 'Second recorded answer' });
    find(tree(), CopilotComposer).props.onSubmit('First question'); await settle();
    find(tree(), CopilotComposer).props.onSubmit('Second question'); await settle();
    const html = renderToStaticMarkup(tree());
    expect(html.indexOf('First question')).toBeLessThan(html.indexOf('First recorded answer'));
    expect(html.indexOf('First recorded answer')).toBeLessThan(html.indexOf('Second question'));
    expect(html.indexOf('Second question')).toBeLessThan(html.indexOf('Second recorded answer'));
  });

  it('retains earlier answers through an error, announces failure and allows an explicit retry', async () => {
    boundary.ask.mockResolvedValueOnce(answer).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ ...answer, answer: 'Retry recorded answer' });
    find(tree(), CopilotComposer).props.onSubmit('Earlier question'); await settle();
    find(tree(), CopilotComposer).props.onSubmit('Failed question'); await settle();
    let html = renderToStaticMarkup(tree());
    expect(html).toContain(answer.answer); expect(html).toContain('role="alert"'); expect(html).toContain('Request unsuccessful');
    expect(html).toContain('Your source records have not changed.');
    expect(find(tree(), CopilotComposer).props.busy).toBe(false);
    find(tree(), CopilotComposer).props.onSubmit('Explicit retry'); await settle();
    html = renderToStaticMarkup(tree()); expect(html).toContain('Retry recorded answer'); expect(boundary.ask).toHaveBeenCalledTimes(3);
  });

  it('renders submitted text and returned details as text instead of executable markup', async () => {
    const question = '<img src=x onerror=alert(1)>';
    boundary.ask.mockResolvedValue({ ...answer, answer: '<script>untrusted response</script>', detail: ['<img src=x>'] });
    find(tree(), CopilotComposer).props.onSubmit(question); await settle();
    const html = renderToStaticMarkup(tree());
    expect(boundary.ask).toHaveBeenCalledExactlyOnceWith(question);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;'); expect(html).toContain('&lt;script&gt;untrusted response&lt;/script&gt;');
    expect(html).not.toContain('<img src=x'); expect(html).not.toContain('<script>');
  });
});
