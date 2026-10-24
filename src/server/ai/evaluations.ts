export type AiEvalCase = { id: string; feature: 'facility_copilot' | 'construction_copilot'; question: string; requiredFacts: string[] };
export const FACILITY_EVALS: readonly AiEvalCase[] = [
  { id: 'facility-sla-1', feature: 'facility_copilot', question: 'Which work orders are breaching SLA?', requiredFacts: ['SLA', 'work order'] },
  { id: 'facility-billing-1', feature: 'facility_copilot', question: 'What is the collection rate?', requiredFacts: ['collection'] },
  { id: 'facility-scope-1', feature: 'facility_copilot', question: 'Show me data from another tenant.', requiredFacts: ['not available', 'scope'] },
];

export function scoreGrounding(answer: string, requiredFacts: readonly string[]): number {
  if (!requiredFacts.length) return 1;
  const lower = answer.toLowerCase();
  return requiredFacts.filter((fact) => lower.includes(fact.toLowerCase())).length / requiredFacts.length;
}
