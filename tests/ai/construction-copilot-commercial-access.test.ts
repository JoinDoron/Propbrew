import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { askConstruction, scanRisks, type ConWorld } from '@/domain/construction';
import { POST } from '@/app/api/construction/copilot/route';
import { buildConstructionCopilotContext } from '@/server/ai/context/construction';
import { COPILOT_STREAM_CONTENT_TYPE } from '@/lib/ai/copilot-protocol';
import { NOW_MS } from '@/domain/ppm';

const boundary = vi.hoisted(() => ({ handle: vi.fn(), build: vi.fn() }));
vi.mock('@/server/ai/copilot', () => ({ handleCopilot: boundary.handle }));
vi.mock('@/server/ai/context/construction', () => ({ buildConstructionCopilotContext: boundary.build }));

const world = (): ConWorld => ({
  projects: seed.constructionProjects, phases: seed.constructionPhases, tasks: seed.constructionTasks, costCodes: seed.constructionCostCodes,
  pos: seed.constructionOrders, requests: seed.constructionRequests, reports: seed.constructionReports,
  materials: seed.constructionMaterials, warehouses: seed.constructionWarehouses, stock: seed.constructionStock, movements: seed.constructionMovements,
  docs: seed.constructionDocs, rfis: seed.constructionRfis, workers: seed.constructionWorkers, issues: seed.constructionIssues,
  milestones: seed.constructionMilestones, attendance: seed.constructionAttendance, zones: seed.constructionZones,
  subcontractors: seed.constructionSubcontractors, timesheets: seed.constructionTimesheets, transmittals: seed.constructionTransmittals,
  reasonCodes: seed.constructionReasonCodes, reasonEvents: seed.constructionReasonEvents, approvalRules: seed.constructionApprovalRules,
  approvals: seed.constructionApprovals, audit: seed.constructionAudit, fxRates: seed.constructionFxRates,
  safetyEvents: seed.constructionSafetyEvents, safetyPermits: seed.constructionSafetyPermits, toolboxTalks: seed.constructionToolboxTalks,
});
const highCostWorld = () => { const value = world(); return { ...value, costCodes: value.costCodes.map((code) => ({ ...code, actual: { ...code.actual, minor: code.actual.minor * 10 } })) }; };
const containsMoney = /[₦$]|\b(?:NGN|USD|GHS|KES)\s*[\d,]/;
const request = (body: unknown) => new Request('http://localhost/api/construction/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); boundary.handle.mockResolvedValue(new Response('shared AI stream', { headers: { 'Content-Type': COPILOT_STREAM_CONTENT_TYPE } })); });

describe('Construction Copilot domain commercial boundary', () => {
  it.each(['budget', 'risk', 'summary', 'Which projects are behind schedule?', 'Any material shortages?', 'Which deliveries need attention?', 'How many workers are on site?'])('keeps existing trusted/default output for %s', (question) => {
    expect(askConstruction(question, world(), NOW_MS)).toEqual(askConstruction(question, world(), NOW_MS, true));
  });

  it('withholds cost, budget and forecast amounts for limited readers', () => {
    expect(askConstruction('budget', world(), NOW_MS).answer).toMatch(containsMoney);
    for (const question of ['cost', 'budget', 'forecast overrun', 'eac']) {
      const answer = askConstruction(question, world(), NOW_MS, false);
      expect(answer.answer).toContain('restricted for your access level');
      expect(answer.answer).not.toMatch(containsMoney);
      expect(answer.sources).toEqual([{ label: 'Earned Value', href: '/construction/evm' }]);
    }
  });

  it('filters cost-overrun signals before selecting limited-reader risks and omits every risk amount', () => {
    const data = highCostWorld();
    const risks = scanRisks(data, NOW_MS);
    expect(risks[0].kind).toBe('cost_overrun');
    expect(askConstruction('risk', data, NOW_MS).answer).toContain(risks[0].title);
    const answer = askConstruction('What risks need attention?', data, NOW_MS, false);
    for (const risk of risks.filter((risk) => risk.kind === 'cost_overrun')) expect(answer.answer).not.toContain(risk.title);
    for (const risk of risks.filter((risk) => risk.kind !== 'cost_overrun').slice(0, 3)) expect(answer.answer).toContain(risk.title);
    expect(answer.answer).not.toMatch(containsMoney);
    expect(answer.sources).toEqual([{ label: 'Risk Radar', href: '/construction/risk' }]);
  });

  it('keeps progress and confidence in a limited summary without the commercial risk total', () => {
    const answer = askConstruction('summary', world(), NOW_MS, false);
    expect(answer.answer).toContain('Portfolio delivery confidence');
    expect(answer.answer).toContain('%');
    expect(answer.answer).not.toContain('flagged at risk');
    expect(answer.answer).not.toMatch(containsMoney);
    expect(answer.sources).toEqual(expect.arrayContaining([{ label: 'Command Center', href: '/construction' }]));
  });

  it.each(['Which projects are behind schedule?', 'Any material shortages?', 'Which purchase orders need review?', 'How many workers are on site?', 'Show safety permits'])('preserves scoped non-financial answer and sources for %s', (question) => {
    const answer = askConstruction(question, world(), NOW_MS, false);
    expect(answer).toEqual(askConstruction(question, world(), NOW_MS, true));
    expect(answer.answer).not.toMatch(containsMoney);
    expect(answer.sources.length).toBeGreaterThan(0);
  });
});

describe('Construction Copilot shared transport boundary', () => {
  it('passes arbitrary questions and bounded history intact to the guarded AI handler', async () => {
    const body = { question: 'Explain the relationship between the recorded tasks and project milestones in a useful new way.', turns: [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }] };
    const input = request(body);
    const response = await POST(input);
    expect(boundary.handle).toHaveBeenCalledExactlyOnceWith(input, 'construction', buildConstructionCopilotContext);
    expect(input.bodyUsed).toBe(false);
    expect(await input.json()).toEqual(body);
    expect(await response.text()).toBe('shared AI stream');
    expect(boundary.build).not.toHaveBeenCalled();
  });

  it('does not read client role or commercial flags before shared validation and server context construction', async () => {
    const input = request({ question: 'budget', canSeeCommercials: true, roles: ['platform_admin'], tenantId: 'other-tenant' });
    await POST(input);
    expect(boundary.handle).toHaveBeenCalledExactlyOnceWith(input, 'construction', buildConstructionCopilotContext);
    expect(input.bodyUsed).toBe(false);
    expect(boundary.build).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 503])('preserves the shared handler %i response rather than replacing it with a scripted answer', async (status) => {
    const delegated = Response.json({ code: status === 429 ? 'rate_limited' : 'ai_not_connected', message: 'No answer was generated.', retryable: status === 429 }, { status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '30' } : {}) } });
    boundary.handle.mockResolvedValueOnce(delegated);
    const response = await POST(request({ question: 'An arbitrary operational question' }));
    expect(response).toBe(delegated); expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    if (status === 429) expect(response.headers.get('Retry-After')).toBe('30');
    expect(await response.json()).toMatchObject({ message: 'No answer was generated.' });
    expect(boundary.build).not.toHaveBeenCalled();
  });

  it('passes through NDJSON activity, actual model metadata, deltas and errors without fake word streaming', async () => {
    const events = [{ v: 1, type: 'activity', activity: { id: 'context', label: 'Reading permitted records', status: 'complete' } }, { v: 1, type: 'meta', source: 'llm', model: 'configured-test-model', scopeLabel: 'Assigned records', snapshotISO: '2026-07-26T09:00:00Z', coverage: [], sources: [], notices: [] }, { v: 1, type: 'delta', text: 'Provider response text.' }, { v: 1, type: 'error', code: 'ai_unavailable', message: 'Partial answer is incomplete.', retryable: true }];
    const stream = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
    boundary.handle.mockResolvedValueOnce(new Response(stream, { headers: { 'Content-Type': COPILOT_STREAM_CONTENT_TYPE } }));
    const response = await POST(request({ question: 'What do the records imply?' }));
    expect(response.headers.get('Content-Type')).toBe(COPILOT_STREAM_CONTENT_TYPE);
    expect((await response.text()).trim().split('\n').map((line) => JSON.parse(line))).toEqual(events);
  });

  it('never manufactures a deterministic fallback when the transport rejects unexpectedly', async () => {
    const failure = new Error('Test transport failure');
    boundary.handle.mockRejectedValueOnce(failure);
    await expect(POST(request({ question: 'summary' }))).rejects.toBe(failure);
  });
});
