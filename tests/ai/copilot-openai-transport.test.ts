import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelUsage } from 'ai';
import { publicCopilotError, resolveCopilotProvider, streamCopilotAnswer } from '@/server/ai/copilot-provider';

// Real ai@7 + @ai-sdk/openai@4. Only the HTTP transport is replaced.
// SSE shapes follow the installed src/responses/openai-responses-api.ts schema;
// usage follows src/responses/convert-openai-responses-usage.ts.
const MODEL = 'gpt-6.1-sol';
const TEST_KEY = 'local-transport-test-key-not-a-credential';
const encoder = new TextEncoder();
const transport = vi.fn<typeof fetch>();
type Part = { type: string; text?: string; error?: unknown; totalUsage?: LanguageModelUsage };

function frames({ usage = true, reasoning = false }: { usage?: boolean; reasoning?: boolean } = {}): unknown[] {
  const response: unknown[] = [{ type: 'response.created', response: { id: 'resp_local_fixture', created_at: 1785056400, model: MODEL } }];
  if (reasoning) response.push(
    { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'reason_local_fixture' } },
    { type: 'response.reasoning_summary_text.delta', item_id: 'reason_local_fixture', output_index: 0, summary_index: 0, delta: 'UNSOLICITED_PROVIDER_REASONING' },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'reasoning', id: 'reason_local_fixture' } },
  );
  const index = reasoning ? 1 : 0;
  response.push(
    { type: 'response.output_item.added', output_index: index, item: { type: 'message', id: 'msg_local_fixture' } },
    { type: 'response.output_text.delta', item_id: 'msg_local_fixture', output_index: index, delta: 'Recorded amount: ' },
    { type: 'response.output_text.delta', item_id: 'msg_local_fixture', output_index: index, delta: '₦123.45. Review the source.' },
    { type: 'response.output_item.done', output_index: index, item: { type: 'message', id: 'msg_local_fixture' } },
    { type: 'response.completed', response: { usage: usage ? { input_tokens: 123, output_tokens: 17, total_tokens: 140, input_tokens_details: { cached_tokens: 5 }, output_tokens_details: { reasoning_tokens: 4 } } : null } },
  );
  return response;
}

function sse(events = frames()): Response {
  const bytes = encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''));
  // Split both SSE boundaries and the multibyte naira sign to exercise the parser.
  const body = new ReadableStream<Uint8Array>({ start(controller) { for (let offset = 0; offset < bytes.length; offset += 17) controller.enqueue(bytes.slice(offset, offset + 17)); controller.close(); } });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'x-request-id': 'local-request-fixture' } });
}

function run(signal = new AbortController().signal) {
  const provider = resolveCopilotProvider(MODEL);
  const result = streamCopilotAnswer({ model: provider.model, instructions: 'Use the authorised recorded facts only. No actions are available.', turns: [{ role: 'user', content: 'Earlier completed question' }, { role: 'assistant', content: 'Earlier completed answer' }], question: 'What should the manager review?', signal, maxOutputTokens: 256 });
  return { provider, result };
}

async function consume(result: ReturnType<typeof streamCopilotAnswer>): Promise<Part[]> {
  const parts: Part[] = [];
  for await (const part of result.fullStream) parts.push(part);
  return parts;
}

function requestBody() {
  const [url, options] = transport.mock.calls[0];
  expect(String(url)).toBe('https://api.openai.com/v1/responses');
  expect(options?.method).toBe('POST');
  expect(new Headers(options?.headers).get('Authorization')).toBe(`Bearer ${TEST_KEY}`);
  return JSON.parse(options?.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OPENAI_API_KEY', TEST_KEY);
  vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('AI_GATEWAY_API_KEY', '');
  vi.stubEnv('VERCEL_OIDC_TOKEN', '');
  vi.stubEnv('VERCEL', '');
  transport.mockReset();
  transport.mockImplementation(async (url) => {
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    return sse();
  });
  // This fake never delegates to the original fetch, even if the URL is wrong.
  vi.stubGlobal('fetch', transport);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Installed OpenAI Responses transport for Propbrew Copilot', () => {
  it('resolves the configured OpenAI model and translates real SSE into text deltas and usage', async () => {
    const { provider, result } = run();
    expect(provider.provider).toBe('openai'); expect(provider.modelName).toBe(MODEL);
    const parts = await consume(result);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(parts.filter((part) => part.type === 'text-delta').map((part) => part.text).join('')).toBe('Recorded amount: ₦123.45. Review the source.');
    expect(parts.some((part) => part.type === 'error')).toBe(false);
    const finish = parts.find((part) => part.type === 'finish');
    expect(finish?.totalUsage).toMatchObject({ inputTokens: 123, outputTokens: 17, totalTokens: 140, inputTokenDetails: { noCacheTokens: 118, cacheReadTokens: 5 }, outputTokenDetails: { textTokens: 13, reasoningTokens: 4 } });
    expect(await result.text).toBe('Recorded amount: ₦123.45. Review the source.');
    expect(await result.totalUsage).toMatchObject({ inputTokens: 123, outputTokens: 17 });
    expect((await result.response).modelId).toBe(MODEL);
  });

  it('sends store:false, low reasoning effort, bounded output and no requested reasoning summary', async () => {
    await consume(run().result);
    const body = requestBody();
    expect(body).toMatchObject({ model: MODEL, store: false, stream: true, max_output_tokens: 256, reasoning: { effort: 'low' } });
    expect(body.reasoning).not.toHaveProperty('summary');
    expect(body).not.toHaveProperty('previous_response_id'); expect(body).not.toHaveProperty('conversation');
    const input = JSON.stringify(body.input);
    for (const text of ['Use the authorised recorded facts only.', 'Earlier completed question', 'Earlier completed answer', 'What should the manager review?']) expect(input).toContain(text);
    expect(input).toContain('developer');
  });

  it('keeps unsolicited provider reasoning separate from the final text answer', async () => {
    transport.mockResolvedValueOnce(sse(frames({ reasoning: true })));
    const { result } = run();
    const parts = await consume(result);
    expect(parts.some((part) => part.type === 'reasoning-delta')).toBe(true);
    expect(await result.text).toBe('Recorded amount: ₦123.45. Review the source.');
    expect(parts.filter((part) => part.type === 'text-delta').map((part) => part.text).join('')).not.toContain('UNSOLICITED_PROVIDER_REASONING');
    expect(requestBody().reasoning).not.toHaveProperty('summary');
  });

  it('retains missing provider usage as unknown instead of manufacturing zero tokens', async () => {
    transport.mockResolvedValueOnce(sse(frames({ usage: false })));
    const { result } = run();
    const parts = await consume(result);
    expect(parts.find((part) => part.type === 'finish')?.totalUsage).toMatchObject({ inputTokens: undefined, outputTokens: undefined });
    expect(await result.totalUsage).toMatchObject({ inputTokens: undefined, outputTokens: undefined });
  });

  it('classifies the real adapter authentication error without exposing the provider body or retrying', async () => {
    transport.mockResolvedValueOnce(Response.json({ error: { message: 'SECRET_PROVIDER_BODY_AND_KEY', type: 'invalid_request_error', code: 'invalid_api_key', param: null } }, { status: 401 }));
    const parts = await consume(run().result);
    const failure = parts.find((part) => part.type === 'error')?.error;
    expect(failure).toBeDefined();
    expect(publicCopilotError(failure)).toEqual({ code: 'ai_authentication_failed', message: 'The AI provider rejected this environment’s connection. An administrator needs to reconnect it.', retryable: false, status: 503 });
    expect(JSON.stringify(publicCopilotError(failure))).not.toContain('SECRET_PROVIDER_BODY_AND_KEY');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('passes cancellation to the actual HTTP request and stops without a retry', async () => {
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => { started = resolve; });
    let requestSignal: AbortSignal | null | undefined;
    const observed = vi.fn();
    transport.mockImplementationOnce(async (url, options) => {
      expect(String(url)).toBe('https://api.openai.com/v1/responses');
      requestSignal = options?.signal;
      started();
      return new Promise<Response>((_resolve, reject) => {
        if (requestSignal?.aborted) { observed(); reject(requestSignal.reason); return; }
        requestSignal?.addEventListener('abort', () => { observed(); reject(requestSignal?.reason); }, { once: true });
      });
    });
    const controller = new AbortController();
    const { result } = run(controller.signal);
    const output = consume(result).catch((error: unknown) => error);
    await requestStarted;
    expect(requestSignal).toBeDefined(); expect(requestSignal?.aborted).toBe(false);
    controller.abort(new DOMException('Local cancellation fixture', 'AbortError'));
    await output;
    expect(requestSignal?.aborted).toBe(true); expect(observed).toHaveBeenCalledOnce(); expect(transport).toHaveBeenCalledTimes(1);
  });
});
