import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCopilotEvent, completedCopilotTurns, CopilotClientError, parseCopilotEvent, readCopilotStream, type CopilotExchange } from '@/lib/ai/copilot-client';
import { COPILOT_MAX_HISTORY, COPILOT_MAX_HISTORY_CHARS, type CopilotEvent, type CopilotModule } from '@/lib/ai/copilot-protocol';
import { useCopilotStream } from '@/components/ai/use-copilot-stream';

const hooks = vi.hoisted(() => ({ active: false, cursor: 0, slots: [] as unknown[], cleanups: [] as (() => void)[] }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
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
    useEffect(effect: () => void | (() => void)) {
      if (!hooks.active) return;
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) { hooks.slots[index] = true; const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); }
    },
  };
});

const start: CopilotEvent = { v: 1, type: 'start', requestId: 'request-a' };
const meta = (module: CopilotModule = 'shortlet'): Extract<CopilotEvent, { type: 'meta' }> => ({ v: 1, type: 'meta', source: 'llm', model: 'configured-test-model', scopeLabel: 'your authorised records', snapshotISO: '2026-10-24T11:30:00Z', coverage: [{ collection: 'records', loaded: 2, total: 3, complete: false }], sources: [{ id: 'source-a', label: 'Review the recorded register', href: module === 'facility' ? '/assets' : module === 'estate' ? '/billing' : `/${module}/bookings` }], notices: ['Recorded balances are not bank settlement evidence.'] });
const complete: CopilotEvent = { v: 1, type: 'complete', interactionId: 'interaction-a', usage: { inputTokens: 10, outputTokens: 8, estimatedCostMinorNgn: 1, recorded: true } };
const events = (answer = 'NGN ₦1,000.25 · Ẹ káàbọ̀ 👋'): CopilotEvent[] => [start, { v: 1, type: 'activity', activity: { id: 'records', label: 'Loading authorised records', status: 'complete' } }, meta(), { v: 1, type: 'delta', text: answer }, complete];
const serialise = (values: unknown[]) => values.map((event) => JSON.stringify(event)).join('\n') + '\n';
function response(values: unknown[] = events(), stride = 100000) {
  const bytes = new TextEncoder().encode(serialise(values));
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (let index = 0; index < bytes.length; index += stride) controller.enqueue(bytes.slice(index, index + stride)); controller.close(); } }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}
const exchange = (overrides: Partial<CopilotExchange> = {}): CopilotExchange => ({ id: 'turn-a', question: 'Please explain this record', text: '', status: 'submitted', activities: [], startedAt: 10, ...overrides });
const network = vi.fn<typeof fetch>();
const done = vi.fn();
function Harness() {
  return useCopilotStream({ endpoint: '/api/shortlet/copilot', module: 'shortlet', onComplete: done });
}
function tree() {
  hooks.active = true; hooks.cursor = 0;
  try { return Harness(); }
  finally { hooks.active = false; }
}
async function flush() { for (let count = 0; count < 12; count++) await Promise.resolve(); }
beforeEach(() => { vi.clearAllMocks(); hooks.active = false; hooks.cursor = 0; hooks.slots = []; hooks.cleanups = []; network.mockReset(); network.mockImplementation(async () => response()); vi.stubGlobal('fetch', network); });
afterEach(() => { for (const cleanup of hooks.cleanups) cleanup(); vi.unstubAllGlobals(); });

describe('Verified public Copilot stream reader', () => {
  it.each([1, 2, 7, 100000])('decodes split Unicode and NDJSON frames at byte stride %s', async (stride) => {
    const received: CopilotEvent[] = [];
    await readCopilotStream(response(events(), stride), 'shortlet', new AbortController().signal, (event) => received.push(event));
    expect(received).toEqual(events());
  });

  it('accepts CRLF and a final frame without a newline', async () => {
    const received: CopilotEvent[] = [];
    await readCopilotStream(new Response(serialise(events()).trim().replaceAll('\n', '\r\n'), { headers: { 'Content-Type': 'application/x-ndjson' } }), 'shortlet', new AbortController().signal, (event) => received.push(event));
    expect(received.at(-1)?.type).toBe('complete');
  });

  it.each(['estate', 'facility', 'shortlet', 'construction'] as const)('permits only %s source paths in server metadata', (module) => {
    expect(parseCopilotEvent(meta(module), module)).toEqual(meta(module));
    for (const href of ['javascript:alert(1)', 'https://evil.invalid', '//evil.invalid', '/admin', '/shortlet/../../admin', '/construction/\\evil', '/assets secret', '/shortlet/%2fadmin']) expect(() => parseCopilotEvent({ ...meta(module), sources: [{ id: 'bad', label: 'Bad link', href }] }, module)).toThrow(CopilotClientError);
  });

  it('projects public fields and never keeps raw hidden-reasoning/provider payloads', () => {
    const projected = parseCopilotEvent({ ...meta(), reasoning: 'PRIVATE_REASONING', providerResponse: { secret: 'PRIVATE_PROVIDER' } }, 'shortlet');
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_REASONING|PRIVATE_PROVIDER|reasoning|providerResponse/);
    expect(() => parseCopilotEvent({ v: 1, type: 'reasoning', text: 'private' }, 'shortlet')).toThrow();
    expect(() => parseCopilotEvent({ ...meta(), source: 'builtin' }, 'shortlet')).toThrow();
  });

  it.each([null, [], {}, { v: 2, type: 'delta', text: 'bad version' }, { v: 1, type: 'delta', text: 4 }, { v: 1, type: 'activity', activity: { id: 'x', label: 'x', status: 'thinking' } }, { ...complete, usage: { inputTokens: -1, outputTokens: 2, estimatedCostMinorNgn: 0, recorded: true } }])('rejects malformed event %#', (value) => { expect(() => parseCopilotEvent(value, 'shortlet')).toThrow(CopilotClientError); });

  it.each([
    [start, meta(), { v: 1, type: 'delta', text: 'truncated answer' }],
    [{ v: 1, type: 'delta', text: 'before metadata' }],
    [start, meta(), complete],
    [start, meta(), { v: 1, type: 'delta', text: '   \n' }, complete],
    [start, start, meta()],
    [start, meta(), meta()],
    [...events(), { v: 1, type: 'delta', text: 'after completion' }],
  ].map((values) => [values]))('does not report an invalid or truncated sequence as complete %#', async (values) => {
    await expect(readCopilotStream(response(values), 'shortlet', new AbortController().signal, vi.fn())).rejects.toBeInstanceOf(CopilotClientError);
  });

  it('rejects invalid UTF-8, excessive frames, malformed JSON and wrong content types', async () => {
    for (const body of [new Uint8Array([0xff]), '{invalid-json}\n', 'x'.repeat(1000001)]) await expect(readCopilotStream(new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } }), 'shortlet', new AbortController().signal, vi.fn())).rejects.toBeInstanceOf(CopilotClientError);
    await expect(readCopilotStream(new Response('pretend answer', { headers: { 'Content-Type': 'text/plain' } }), 'shortlet', new AbortController().signal, vi.fn())).rejects.toBeInstanceOf(CopilotClientError);
  });

  it('reports safe JSON errors and retry delay without reflecting HTML/internal error pages', async () => {
    const limited = new Response(JSON.stringify({ error: 'Please wait for the request limit.', code: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } });
    await expect(readCopilotStream(limited, 'shortlet', new AbortController().signal, vi.fn())).rejects.toMatchObject({ failure: { message: 'Please wait for the request limit.', retryAfterS: 30, retryable: true } });
    await expect(readCopilotStream(new Response('<html>SECRET_INTERNAL_STACK</html>', { status: 503, headers: { 'Content-Type': 'text/html' } }), 'shortlet', new AbortController().signal, vi.fn())).rejects.toMatchObject({ failure: { message: 'The AI service could not answer this request. Please try again.' } });
  });

  it('preserves a structured server failure without inventing a built-in answer', async () => {
    const received: CopilotEvent[] = [];
    const error: CopilotEvent = { v: 1, type: 'error', code: 'provider_unavailable', message: 'AI provider is not configured.', retryable: false };
    await readCopilotStream(response([start, error]), 'shortlet', new AbortController().signal, (event) => received.push(event));
    expect(received).toEqual([start, error]);
    expect(received.some((event) => event.type === 'delta')).toBe(false);
  });
});

describe('Copilot exchange state and bounded conversation context', () => {
  it('updates actual activity in place and leaves earlier exchanges and terminal answers unchanged', () => {
    let current = exchange();
    current = applyCopilotEvent(current, { v: 1, type: 'activity', activity: { id: 'records', label: 'Loading authorised records', status: 'active' } });
    current = applyCopilotEvent(current, { v: 1, type: 'activity', activity: { id: 'records', label: 'Loaded authorised records', status: 'complete' } });
    expect(current.activities).toEqual([{ id: 'records', label: 'Loaded authorised records', status: 'complete' }]);
    expect(current.text).toBe('');
    current = applyCopilotEvent(applyCopilotEvent(current, meta()), { v: 1, type: 'delta', text: 'Exact NGN ₦10.01' });
    current = applyCopilotEvent(current, complete, 50);
    expect(current).toMatchObject({ id: 'turn-a', text: 'Exact NGN ₦10.01', status: 'complete', completedAt: 50 });
    expect(applyCopilotEvent(current, { v: 1, type: 'delta', text: 'late data' })).toBe(current);
  });

  it('retains native money text and admits only bounded, completed user/assistant pairs', () => {
    const turns = completedCopilotTurns(Array.from({ length: 20 }, (_, index) => exchange({ id: String(index), question: `Q${index}`, text: `Native USD 1,234.56 and NGN ₦10.01 #${index}`, status: 'complete' })));
    expect(turns).toHaveLength(COPILOT_MAX_HISTORY);
    expect(turns[0].content).toBe('Q14');
    expect(turns.at(-1)?.content).toContain('USD 1,234.56 and NGN ₦10.01');
    expect(completedCopilotTurns([exchange({ status: 'stopped', text: 'partial' }), exchange({ status: 'error', text: 'failed' }), exchange({ status: 'complete', text: 'x'.repeat(COPILOT_MAX_HISTORY_CHARS) })])).toEqual([]);
    expect(turns.every((turn) => Object.keys(turn).sort().join(',') === 'content,role')).toBe(true);
  });
});

describe('Shared hook request lifecycle without a browser or provider', () => {
  it('trims arbitrary questions, guards duplicates immediately and completes with server metadata', async () => {
    let resolve!: (value: Response) => void;
    network.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const request = tree().submit('  Explain my operations in your own words.  ');
    expect(await tree().submit('duplicate')).toBe(false);
    expect(tree().busy).toBe(true);
    expect(tree().exchanges[0]).toMatchObject({ question: 'Explain my operations in your own words.', status: 'submitted', activities: [] });
    expect(JSON.parse(network.mock.calls[0][1]?.body as string)).toEqual({ question: 'Explain my operations in your own words.' });
    expect(network.mock.calls[0][0]).toBe('/api/shortlet/copilot');
    expect(network.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    resolve(response()); await request;
    expect(tree().busy).toBe(false);
    expect(tree().exchanges[0].status).toBe('complete');
    expect(done).toHaveBeenCalledExactlyOnceWith(tree().exchanges[0]);
  });

  it('sends only completed turns and preserves chronological answers through a failed request', async () => {
    await tree().submit('First question');
    network.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Provider unavailable.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
    await tree().submit('Failed question');
    await tree().submit('Follow-up question');
    const body = JSON.parse(network.mock.calls[2][1]?.body as string);
    expect(body.turns).toEqual([{ role: 'user', content: 'First question' }, { role: 'assistant', content: 'NGN ₦1,000.25 · Ẹ káàbọ̀ 👋' }]);
    expect(tree().exchanges.map((entry) => entry.question)).toEqual(['First question', 'Failed question', 'Follow-up question']);
    expect(tree().exchanges[1].error?.message).toBe('Provider unavailable.');
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('stops a partially streamed answer, aborts transport and retries only when explicitly requested', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    network.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; controller.enqueue(new TextEncoder().encode(serialise([start, meta(), { v: 1, type: 'delta', text: 'Partial NGN ₦10.01' }]))); } }), { headers: { 'Content-Type': 'application/x-ndjson' } }));
    const request = tree().submit('Inspect this stay'); await flush();
    expect(tree().exchanges[0].text).toBe('Partial NGN ₦10.01');
    const id = tree().exchanges[0].id;
    tree().stop(); await request;
    expect(network.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(tree().exchanges[0]).toMatchObject({ id, text: 'Partial NGN ₦10.01', status: 'stopped' });
    expect(done).not.toHaveBeenCalled(); expect(network).toHaveBeenCalledTimes(1);
    expect(() => stream.enqueue(new Uint8Array())).toThrow();
    await tree().retry(id);
    expect(tree().exchanges).toHaveLength(2);
    expect(tree().exchanges[1]).toMatchObject({ question: 'Inspect this stay', retryOf: id, status: 'complete' });
    expect(JSON.parse(network.mock.calls[1][1]?.body as string).turns).toBeUndefined();
  });

  it('does not let an old aborted request overwrite a new request or its busy state', async () => {
    let resolveOld!: (value: Response) => void;
    network.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveOld = resolve; }));
    const old = tree().submit('Old'); tree().stop();
    const next = tree().submit('New');
    resolveOld(response(events('Late old answer'))); await old; await next;
    expect(tree().exchanges.map((entry) => [entry.question, entry.status])).toEqual([['Old', 'stopped'], ['New', 'complete']]);
    expect(tree().exchanges[1].text).not.toContain('Late old answer');
    expect(tree().busy).toBe(false);
  });

  it('blocks invalid submissions, non-retryable failures and requests during Retry-After', async () => {
    expect(await tree().submit(' ')).toBe(false); expect(await tree().submit('x'.repeat(2001))).toBe(false);
    network.mockResolvedValueOnce(response([start, { v: 1, type: 'error', code: 'provider_missing', message: 'AI is not configured.', retryable: false }]));
    await tree().submit('Missing provider');
    expect(await tree().retry(tree().exchanges[0].id)).toBe(false);
    network.mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }));
    await tree().submit('Limited');
    expect(await tree().retry(tree().exchanges[1].id)).toBe(false);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('marks a truncated answer incomplete, never invents fallback text, and aborts on unmount', async () => {
    network.mockResolvedValueOnce(response([start, meta(), { v: 1, type: 'delta', text: 'Incomplete real answer' }]));
    await tree().submit('Question');
    expect(tree().exchanges[0]).toMatchObject({ status: 'error', text: 'Incomplete real answer' });
    expect(done).not.toHaveBeenCalled();
    let resolve!: (value: Response) => void;
    network.mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; }));
    const request = tree().submit('Unmounted question');
    for (const cleanup of hooks.cleanups) cleanup();
    expect(network.mock.calls[1][1]?.signal?.aborted).toBe(true);
    resolve(response()); await request;
    expect(done).not.toHaveBeenCalled();
  });
});
