import { getActor } from '@/server/session';
import { assertCan, ForbiddenError, effectiveLevel } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { NOW_MS } from '@/domain/ppm';
import { askConstruction, scanRisks, RISK_LABEL, fmtM } from '@/domain/construction';
import { estimateTokens } from '@/domain/facility';
import { getTenantModel, checkRate } from '@/server/copilot/metering';

/**
 * Streaming construction-copilot Q&A.
 *
 * `askConstruction` is always the ground truth AND the grounding: with an
 * ANTHROPIC_API_KEY we stream a Claude answer written ONLY from those computed
 * facts (so it cannot invent project state); without one we stream the
 * deterministic answer word-by-word. Same numbers either way.
 *
 * Scope is enforced twice: the capability check here, and the fact that the
 * grounding is built from capability-scoped repos. A V-level reader (executive,
 * investor) additionally gets commercially sensitive lines stripped.
 */

const encoder = new TextEncoder();

export async function POST(req: Request) {
  const actor = await getActor();
  try {
    assertCan(actor, 'reports_analytics', 'read');
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Not authorised.', { status: 403 });
    throw e;
  }

  const { question } = (await req.json().catch(() => ({}))) as { question?: string };
  if (!question?.trim()) return new Response('Ask a question.', { status: 400 });
  const q = question.trim();

  const tenantId = actor.tenantId ?? 't-lekki';
  const rate = checkRate(tenantId, Date.now());
  if (!rate.allowed) {
    return new Response(`Copilot rate limit reached for this tenant. Try again in about ${rate.retryAfterS}s.`, { status: 429, headers: { 'Retry-After': String(rate.retryAfterS), 'X-Copilot-Source': 'builtin' } });
  }

  const world = constructionWorld(actor);
  const det = askConstruction(q, world, NOW_MS);
  // V-level readers don't see vendor pricing or labour rates (PRD §15.2).
  const canSeeCommercials = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const risks = scanRisks(world, NOW_MS).slice(0, 6)
    .map((r) => `- [${r.severity}] ${RISK_LABEL[r.kind]}: ${r.title} — ${r.evidence}${canSeeCommercials && r.nairaAtRiskMinor ? ` (₦${fmtM(r.nairaAtRiskMinor)} at risk)` : ''}`);

  const ctx = `DETERMINISTIC ANSWER (already computed from the records, correct):\n${det.answer}\n\nCURRENT RISK SIGNALS:\n${risks.join('\n') || '- none'}\n\nSOURCES: ${det.sources.map((s) => s.label).join(', ') || 'none'}`;
  const inTokens = estimateTokens(ctx + q);
  const model = getTenantModel(tenantId);
  const meterHeaders = {
    'X-Copilot-Model': model,
    'X-Copilot-In-Tokens': String(inTokens),
    'X-Copilot-Sources': encodeURIComponent(JSON.stringify(det.sources)),
    'X-Copilot-Grounded': det.grounded ? '1' : '0',
  };
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    const words = det.answer.split(' ');
    const stream = new ReadableStream({
      async pull(controller) {
        for (const w of words) { controller.enqueue(encoder.encode(w + ' ')); await new Promise((r) => setTimeout(r, 20)); }
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Copilot-Source': 'builtin', ...meterHeaders } });
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      stream: true,
      system: `You are Reeve's construction copilot for a Nigerian developer. Answer in 2–4 concise sentences in a calm site-management tone. Use ONLY the grounded facts below — never invent project, cost or procurement data. If the facts don't cover the question, say what record you'd need. Money is Naira (₦).${canSeeCommercials ? '' : ' This reader is a view-only stakeholder: do not disclose vendor prices, bid amounts or labour rates.'}\n\n${ctx}`,
      messages: [{ role: 'user', content: q }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(det.answer, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Copilot-Source': 'builtin', ...meterHeaders } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const ev = JSON.parse(payload);
              if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') controller.enqueue(encoder.encode(ev.delta.text));
            } catch { /* keep partial SSE frames buffered */ }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Copilot-Source': 'llm', ...meterHeaders } });
}
