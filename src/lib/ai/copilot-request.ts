import { COPILOT_MAX_HISTORY, COPILOT_MAX_HISTORY_CHARS, COPILOT_MAX_QUESTION, type CopilotRequest, type CopilotTurn } from './copilot-protocol';

/** Untrusted chat history can carry text only. Roles, tenant and permissions are server-owned. */
export function parseCopilotRequest(value: unknown): CopilotRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== 'question' && key !== 'turns') || typeof body.question !== 'string') return null;
  const question = body.question.trim();
  if (!question || question.length > COPILOT_MAX_QUESTION) return null;
  if (body.turns === undefined) return { question, turns: [] };
  if (!Array.isArray(body.turns) || body.turns.length > COPILOT_MAX_HISTORY || body.turns.length % 2 !== 0) return null;
  const turns: CopilotTurn[] = [];
  let chars = 0;
  for (const [index, item] of body.turns.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const turn = item as Record<string, unknown>;
    if (Object.keys(turn).some((key) => key !== 'role' && key !== 'content') || turn.role !== (index % 2 === 0 ? 'user' : 'assistant') || typeof turn.content !== 'string' || !turn.content.trim()) return null;
    chars += turn.content.length;
    if (chars > COPILOT_MAX_HISTORY_CHARS) return null;
    turns.push({ role: index % 2 === 0 ? 'user' : 'assistant', content: turn.content });
  }
  return { question, turns };
}
