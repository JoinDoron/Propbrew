import { getActor } from '@/server/session';
import { assertCan, ForbiddenError } from '@/lib/authz';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { askCopilot, copilotInsights, estimateTokens, type CopilotWorld } from '@/domain/facility';
import { getTenantModel, checkRate } from '@/server/copilot/metering';

/**
 * Streaming facility-copilot Q&A.
 *
 * The deterministic engine (`askCopilot` / `copilotInsights`) is always the
 * ground truth and the grounding context. If an ANTHROPIC_API_KEY is present we
 * stream a real Claude answer written ONLY from that grounding (so it can never
 * hallucinate facility state); with no key we stream the deterministic answer
 * word-by-word, so the UX — and the numbers — are identical either way.
 *
 * Every call is rate-limited here (per-tenant sliding window). Metering is
 * recorded by the client via a server action after the stream completes — that
 * path shares the in-memory store with the pages, whereas a route handler's
 * module singletons are duplicated under the dev bundler. Response is a
 * text/plain token stream; input-token estimate rides `X-Copilot-In-Tokens`,
 * and `X-Copilot-Source` is `llm` or `builtin`.
 */

const encoder = new TextEncoder();

function buildWorld(actor: Parameters<typeof assertCan>[0]): CopilotWorld {
  return {
    systems: [...repos.buildingSystems.list(actor).items],
    alarms: [...repos.facilityAlarms.list(actor).items],
    generators: [...repos.facilityGenerators.list(actor).items],
    parts: [...repos.facilityParts.list(actor).items],
    contracts: [...repos.facilityContracts.list(actor).items],
    permits: [...repos.facilityPermits.list(actor).items],
    incidents: [...repos.facilityIncidents.list(actor).items],
    sensors: [...repos.facilitySensors.list(actor).items],
    nowMs: NOW_MS,
  };
}

function grounding(world: CopilotWorld, question: string): string {
  const det = askCopilot(question, world);
  const top = copilotInsights(world).slice(0, 8).map((i) => `- [${i.severity}] ${i.title} — ${i.detail}`);
  return `DETERMINISTIC ANSWER (already computed, correct):\n${det.answer}\n\nCURRENT OPEN ITEMS:\n${top.join('\n') || '- none'}`;
}

export async function POST(req: Request) {
  const actor = await getActor();
  try {
    assertCan(actor, 'assets_ppm', 'read');
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Not authorised.', { status: 403 });
    throw e;
  }

  const { question } = (await req.json().catch(() => ({}))) as { question?: string };
  if (!question || !question.trim()) return new Response('Ask a question.', { status: 400 });
  const q = question.trim();

  const tenantId = actor.tenantId ?? 't-lekki';

  // Rate limit — per-tenant sliding window (SC-guard against runaway spend).
  const rate = checkRate(tenantId, Date.now());
  if (!rate.allowed) {
    return new Response(`You've hit the copilot rate limit for this tenant. Give it about ${rate.retryAfterS}s and try again.`, { status: 429, headers: { 'Retry-After': String(rate.retryAfterS), 'X-Copilot-Source': 'builtin' } });
  }

  const model = getTenantModel(tenantId);
  const world = buildWorld(actor);
  const ctx = grounding(world, q);
  const inTokens = estimateTokens(ctx + q); // known before streaming; client meters output
  const meterHeaders = { 'X-Copilot-Model': model, 'X-Copilot-In-Tokens': String(inTokens) };
  const key = process.env.ANTHROPIC_API_KEY;

  // --- fallback: stream the deterministic answer word-by-word ---------------
  if (!key) {
    const answer = askCopilot(q, world).answer;
    const words = answer.split(' ');
    const stream = new ReadableStream({
      async pull(controller) {
        for (const w of words) { controller.enqueue(encoder.encode(w + ' ')); await new Promise((r) => setTimeout(r, 22)); }
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Copilot-Source': 'builtin', ...meterHeaders } });
  }

  // --- real LLM: stream Claude, grounded strictly on the deterministic facts --
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      stream: true,
      system: `You are Vesta's facility copilot for a Nigerian estate-management platform. Answer in 2–4 concise sentences, in a calm operational tone. Use ONLY the grounded facts below — never invent estate data. If the facts don't cover the question, say what you'd need. Money is Naira (₦).\n\n${ctx}`,
      messages: [{ role: 'user', content: q }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    // Degrade gracefully to the deterministic answer rather than erroring out.
    const answer = askCopilot(q, world).answer;
    return new Response(answer, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Copilot-Source': 'builtin', ...meterHeaders } });
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
