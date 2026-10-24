import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ stream: vi.fn(), gateway: vi.fn(), openai: vi.fn(), anthropic: vi.fn() }));
vi.mock('ai', () => ({ streamText: mocks.stream, createGateway: () => mocks.gateway }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => ({ responses: mocks.openai }) }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => mocks.anthropic }));
import { resolveCopilotProvider, streamCopilotAnswer, publicCopilotError } from '@/server/ai/copilot-provider';

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'VERCEL']) vi.stubEnv(name, '');
  mocks.openai.mockReturnValue('openai-model'); mocks.anthropic.mockReturnValue('anthropic-model'); mocks.gateway.mockReturnValue('gateway-model');
});
afterEach(() => vi.unstubAllEnvs());
describe('copilot provider configuration', () => {
  it('uses the chosen OpenAI model through Responses when an OpenAI key is configured', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-not-a-real-key');
    expect(resolveCopilotProvider('gpt-6.1-sol')).toMatchObject({ model: 'openai-model', modelName: 'gpt-6.1-sol', provider: 'openai' });
    expect(mocks.openai).toHaveBeenCalledWith('gpt-6.1-sol');
  });
  it('does not silently replace a tenant’s selected provider/model', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-not-a-real-key');
    expect(() => resolveCopilotProvider('claude-sonnet-5')).toThrow('Sonnet 5');
    expect(mocks.openai).not.toHaveBeenCalled();
  });
  it('maps a legacy Claude selection to its verified Gateway catalogue ID', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-not-a-real-key');
    expect(resolveCopilotProvider('claude-haiku-4-5-20251001').modelName).toBe('anthropic/claude-haiku-4.5');
    expect(mocks.gateway).toHaveBeenCalledWith('anthropic/claude-haiku-4.5');
  });
  it('rejects an expired local OIDC token instead of reporting AI as connected', () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url');
    vi.stubEnv('VERCEL_OIDC_TOKEN', `header.${payload}.signature`);
    expect(() => resolveCopilotProvider('gpt-6.1-sol')).toThrow('not connected');
  });
  it('supports an explicitly configured direct Anthropic connection without cross-provider fallback', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-not-a-real-key');
    expect(resolveCopilotProvider('claude-sonnet-5').provider).toBe('anthropic');
    expect(() => resolveCopilotProvider('gpt-6.1-sol')).toThrow('not connected');
  });
  it('disables OpenAI response storage, bounds generation, forwards abort and never requests private reasoning summaries', () => {
    const controller = new AbortController();
    streamCopilotAnswer({ model: 'test-model' as never, instructions: 'Scoped context', turns: [{ role: 'user', content: 'Earlier' }, { role: 'assistant', content: 'Answer' }], question: 'Now?', signal: controller.signal, maxOutputTokens: 4096 });
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: controller.signal, maxOutputTokens: 4096, maxRetries: 0, providerOptions: { openai: { store: false, reasoningEffort: 'low', reasoningSummary: null } }, messages: [{ role: 'user', content: 'Earlier' }, { role: 'assistant', content: 'Answer' }, { role: 'user', content: 'Now?' }] }));
  });
  it.each([401, 402, 429, 500])('translates provider %i errors without leaking provider bodies', (statusCode) => {
    const error = publicCopilotError({ statusCode, message: 'secret-provider-body' });
    expect(error.message).not.toContain('secret-provider-body'); expect(error.status).toBeGreaterThanOrEqual(400);
  });
});
