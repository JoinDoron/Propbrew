import 'server-only';
import { withTenant } from '@/server/db';
import { canSpend, getTenantModel } from '@/server/copilot/metering';
import { featureControl } from './durable';

export type AiFeature = 'estate_copilot' | 'facility_copilot' | 'shortlet_copilot' | 'construction_copilot' | 'document_extraction';
export type GatewayInput = { tenantId: string; actorId: string; feature: AiFeature; prompt: string; grounding: string; maxTokens?: number };
export type GatewayResult = { text: string; source: 'llm' | 'builtin'; model: string; interactionId: string };

const killSwitch = (feature: AiFeature) => process.env[`REEVE_AI_DISABLE_${feature.toUpperCase()}`] === '1';
const redact = (value: string) => value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]').replace(/(?:\+?234|0)\d{10}/g, '[phone]').replace(/\b\d{10,16}\b/g, '[number]').slice(0, 12000);

async function persist(input: GatewayInput, result: GatewayResult, output: string): Promise<void> {
  if (!process.env.DATABASE_URL || !/^[0-9a-f-]{36}$/i.test(input.tenantId)) return;
  await withTenant(input.tenantId, (query) => query`insert into ai_interactions (id, tenant_id, actor_id, feature, model, source, prompt_redacted, grounding_redacted, output_redacted, created_at) values (${result.interactionId}::uuid, ${input.tenantId}::uuid, ${input.actorId}, ${input.feature}, ${result.model}, ${result.source}, ${redact(input.prompt)}, ${redact(input.grounding)}, ${redact(output)}, now())`);
}

export async function generate(input: GatewayInput, fallback: () => string): Promise<GatewayResult> {
  if (killSwitch(input.feature)) throw new Error(`AI feature ${input.feature} is disabled.`);
  const control = process.env.DATABASE_URL && /^[0-9a-f-]{36}$/i.test(input.tenantId) ? await featureControl(input.tenantId, input.feature) : { enabled: true, dailyCapMinorNgn: null };
  if (!control.enabled) throw new Error(`AI feature ${input.feature} is disabled for this tenant.`);
  const budget = canSpend(input.tenantId);
  if (!budget.allowed) throw new Error('AI budget exceeded for this tenant.');
  const model = getTenantModel(input.tenantId);
  const interactionId = crypto.randomUUID();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const text = fallback(); const result = { text, source: 'builtin' as const, model, interactionId };
    await persist(input, result, text); return result;
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: input.maxTokens ?? 400, system: `Use only the grounded facts below. If the answer is absent, say so.\n\n${redact(input.grounding)}`, messages: [{ role: 'user', content: redact(input.prompt) }] }) });
  if (!response.ok) { const text = fallback(); const result = { text, source: 'builtin' as const, model, interactionId }; await persist(input, result, text); return result; }
  const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = body.content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join(' ') || fallback();
  const result = { text, source: 'llm' as const, model, interactionId }; await persist(input, result, text); return result;
}
