import 'server-only';
import { createGateway, streamText, type LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { copilotModel } from '@/domain/facility/copilot-config';
import type { CopilotTurn } from '@/lib/ai/copilot-protocol';

export class CopilotConnectionError extends Error {
  constructor(public code: string, message: string, public status = 503, public retryable = false) { super(message); }
}

/** Only inspect expiry locally; the provider still verifies the credential's signature and scope. */
function usableOidc(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { exp?: unknown };
    return typeof payload.exp === 'number' && payload.exp * 1000 > now + 30_000;
  } catch { return false; }
}

export function resolveCopilotProvider(modelId: string): { model: LanguageModel; modelName: string; provider: 'gateway' | 'anthropic' | 'openai' } {
  const selected = copilotModel(modelId);
  if (selected.openaiId && process.env.OPENAI_API_KEY?.trim()) return { model: createOpenAI().responses(selected.openaiId), modelName: selected.openaiId, provider: 'openai' };
  if (selected.anthropicId && process.env.ANTHROPIC_API_KEY?.trim()) return { model: createAnthropic()(selected.anthropicId), modelName: selected.anthropicId, provider: 'anthropic' };
  if (process.env.AI_GATEWAY_API_KEY?.trim() || usableOidc(process.env.VERCEL_OIDC_TOKEN) || process.env.VERCEL === '1' && !process.env.VERCEL_OIDC_TOKEN) {
    return { model: createGateway()(selected.gatewayId), modelName: selected.gatewayId, provider: 'gateway' };
  }
  throw new CopilotConnectionError('ai_not_connected', `The AI provider for ${selected.label} is not connected in this environment. Ask an administrator to connect it or choose an available model, then retry. No answer was generated.`);
}

export function streamCopilotAnswer(input: { model: LanguageModel; instructions: string; turns: CopilotTurn[]; question: string; signal: AbortSignal; maxOutputTokens: number }) {
  return streamText({
    model: input.model,
    instructions: input.instructions,
    messages: [...input.turns, { role: 'user', content: input.question }],
    maxOutputTokens: input.maxOutputTokens,
    abortSignal: input.signal,
    maxRetries: 0,
    providerOptions: { openai: { store: false, reasoningEffort: 'low', reasoningSummary: null } },
    // Errors are translated to public codes by the shared handler. Never log provider bodies or prompts.
    onError: () => undefined,
  });
}

export function publicCopilotError(error: unknown): { code: string; message: string; retryable: boolean; status: number } {
  if (error instanceof CopilotConnectionError) return { code: error.code, message: error.message, retryable: error.retryable, status: error.status };
  const value = error && typeof error === 'object' ? error as { statusCode?: number; cause?: { statusCode?: number }; name?: string } : {};
  const status = value.statusCode ?? value.cause?.statusCode;
  if (status === 401 || status === 403) return { code: 'ai_authentication_failed', message: 'The AI provider rejected this environment’s connection. An administrator needs to reconnect it.', retryable: false, status: 503 };
  if (status === 402) return { code: 'ai_credits_required', message: 'The AI provider needs available credits before it can answer. Ask an administrator to review the provider account.', retryable: false, status: 503 };
  if (status === 429) return { code: 'ai_provider_busy', message: 'The AI provider is busy or has reached its limit. Wait a moment, then retry.', retryable: true, status: 429 };
  if (value.name === 'TimeoutError') return { code: 'ai_timeout', message: 'The AI response took too long. Any partial answer is incomplete. Please retry.', retryable: true, status: 504 };
  return { code: 'ai_unavailable', message: 'The AI connection did not complete this answer. Any partial answer is incomplete. Please retry.', retryable: true, status: 502 };
}
