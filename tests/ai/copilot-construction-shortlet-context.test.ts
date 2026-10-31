import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { buildConstructionCopilotContext } from '@/server/ai/context/construction';
import { buildShortletCopilotContext } from '@/server/ai/context/shortlet';
import { validCopilotSource } from '@/lib/ai/copilot-protocol';
import { ForbiddenError, type Actor, type Role } from '@/lib/authz';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { NOW } from '@/domain/ppm';
import { db } from '@/server/data/store';
import { rfiInScope } from '@/server/construction/rfi-access';

const store = vi.hoisted(() => {
  const names = ['constructionProjects', 'constructionPhases', 'constructionTasks', 'constructionMilestones', 'constructionOrders', 'constructionReports', 'constructionWarehouses', 'constructionWorkers', 'constructionAttendance', 'constructionIssues', 'constructionDocs', 'constructionRfis', 'constructionZones', 'constructionSafetyPermits', 'constructionSafetyEvents', 'constructionToolboxTalks', 'constructionStock', 'constructionMaterials', 'constructionMovements', 'constructionCostCodes', 'constructionRequests', 'constructionRfqs', 'constructionTimesheets', 'constructionSubcontractors', 'constructionApprovals', 'shortletApartments', 'shortletBookings', 'shortletInspections', 'shortletIssues', 'shortletReviews', 'shortletPricingRules'];
  return { names, reads: Object.fromEntries(names.map((name) => [name, vi.fn()])), rows: {} as Record<string, unknown[]>, handle: vi.fn(), provider: vi.fn() };
});
vi.mock('@/server/data', () => ({
  repos: Object.fromEntries(Object.entries(store.reads).map(([name, list]) => [name, { list }])),
  scopedConstructionProjectGet: (actor: Actor, id: string) => db.constructionProjects.find((project) =>
    project.id === id && project.tenantId === actor.tenantId
    && (actor.constructionProjectIds === undefined || actor.constructionProjectIds.includes(id))) ?? null,
}));
vi.mock('@/server/ai/copilot', () => ({ handleCopilot: store.handle }));

const tenantId = seed.constructionProjects[0].tenantId;
const actor = (role: Role = 'executive', overrides: Partial<Actor> = {}): Actor => ({ userId: 'context-reader', tenantId, roles: [role], estateIds: [], allEstates: true, unitIds: [], vendorOrgId: null, investorProjectIds: [], ...overrides });
const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const commercialCollections = ['constructionCostCodes', 'constructionRequests', 'constructionRfqs', 'constructionTimesheets', 'constructionSubcontractors', 'constructionApprovals'];
const shortletCollections = ['shortletApartments', 'shortletBookings', 'shortletInspections', 'shortletIssues', 'shortletReviews', 'shortletPricingRules'];
const protectedMoney = { currency: 'NGN', minor: 991122337 };

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of store.names) {
    store.rows[name] = structuredClone((seed as unknown as Record<string, unknown[]>)[name] ?? []);
    store.reads[name].mockImplementation((_actor: Actor, options: { cursor: string | null; limit: number }) => {
      const rows = store.rows[name], start = Number(options.cursor ?? 0), finish = start + options.limit;
      return { items: rows.slice(start, finish), total: rows.length, cursor: finish < rows.length ? String(finish) : null };
    });
  }
  store.handle.mockResolvedValue(new Response('shared AI transport'));
});

describe('Construction AI context commercial and record boundaries', () => {
  it('allows a limited executive to receive meaningful non-financial context without querying commercial-only collections', async () => {
    const context = await buildConstructionCopilotContext(actor());
    expect(context.module).toBe('construction'); expect(context.facts.commercialAccess).toBe('limited');
    expect(context.facts).not.toHaveProperty('commercials');
    expect(JSON.stringify(context.facts)).toContain(seed.constructionProjects[0].name);
    expect(JSON.stringify(context.facts)).toContain(seed.constructionTasks[0].name);
    for (const collection of commercialCollections) expect(store.reads[collection]).not.toHaveBeenCalled();
    for (const key of ['contractValue', 'approvedBudget', 'budget', 'dayRate', 'unitCost', 'value', 'foreignMinor', 'postedMinor', 'amountMinor', 'costConfidence', 'cpi', 'eac', 'nairaAtRiskMinor']) expect(JSON.stringify(context.facts)).not.toContain('"' + key + '"');
    expect(context.notices.join(' ')).toContain('Commercial figures are withheld');
  });

  it('excludes nested financial sentinels and freeform notes before the limited context reaches AI', async () => {
    store.rows.constructionProjects = seed.constructionProjects.map((p) => ({ ...p, contractValue: protectedMoney, approvedBudget: protectedMoney, clientName: 'PRIVATE_CLIENT_NAME', pmName: 'PRIVATE_PM_NAME' }));
    store.rows.constructionTasks = seed.constructionTasks.map((t) => ({ ...t, budget: protectedMoney, crash: { crashableDays: 4, crashCostPerDay: protectedMoney } }));
    store.rows.constructionOrders = seed.constructionOrders.map((p) => ({ ...p, value: protectedMoney, fx: { currency: 'USD', foreignMinor: 991122338, bookedRate: 991122339 } }));
    store.rows.constructionMaterials = seed.constructionMaterials.map((m) => ({ ...m, unitCost: protectedMoney }));
    store.rows.constructionWorkers = seed.constructionWorkers.map((w) => ({ ...w, dayRate: protectedMoney }));
    store.rows.constructionReports = seed.constructionReports.map((r) => ({ ...r, completed: ['PRIVATE_COST_NARRATIVE'], constraints: ['PRIVATE_COST_NOTE'], mediaRefs: ['PRIVATE_MEDIA_URL'] }));
    store.rows.constructionIssues = seed.constructionIssues.map((i) => ({ ...i, title: 'PRIVATE_COMMERCIAL_ISSUE_TITLE', correctiveAction: 'PRIVATE_COST_CORRECTIVE_ACTION' }));
    store.rows.constructionRfis = seed.constructionRfis.map((r) => ({ ...r, question: 'PRIVATE_RFI_COMMERCIAL_CONTENT', answer: 'PRIVATE_RFI_RESPONSE' }));
    store.rows.constructionDocs = seed.constructionDocs.map((d) => ({ ...d, title: 'PRIVATE_DOCUMENT_CONTENT', changeNote: 'PRIVATE_DOCUMENT_CHANGE_NOTE' }));
    const value = JSON.stringify((await buildConstructionCopilotContext(actor())).facts);
    for (const secret of ['991122337', '991122338', '991122339', 'PRIVATE_CLIENT_NAME', 'PRIVATE_PM_NAME', 'PRIVATE_COST_NARRATIVE', 'PRIVATE_COST_NOTE', 'PRIVATE_MEDIA_URL', 'PRIVATE_COMMERCIAL_ISSUE_TITLE', 'PRIVATE_COST_CORRECTIVE_ACTION', 'PRIVATE_RFI_COMMERCIAL_CONTENT', 'PRIVATE_RFI_RESPONSE', 'PRIVATE_DOCUMENT_CONTENT', 'PRIVATE_DOCUMENT_CHANGE_NOTE']) expect(value).not.toContain(secret);
  });

  it.each(['estate_manager', 'facility_manager'] as const)('includes exact explicit commercial Money fields for an authorised %s', async (role) => {
    store.rows.constructionProjects = [{ ...seed.constructionProjects[0], approvedBudget: { currency: 'USD', minor: 12345 }, contractValue: { currency: 'NGN', minor: 100025 } }];
    const context = await buildConstructionCopilotContext(actor(role));
    expect(context.facts.commercialAccess).toBe('authorised');
    const commercial = context.facts.commercials as { projects: { approvedBudget: unknown; contractValue: unknown }[] };
    expect(commercial.projects[0].approvedBudget).toEqual({ currency: 'USD', minor: 12345 });
    expect(commercial.projects[0].contractValue).toEqual({ currency: 'NGN', minor: 100025 });
    for (const name of commercialCollections) expect(store.reads[name]).toHaveBeenCalled();
    expect(JSON.stringify(context.facts)).not.toContain('"eac"'); expect(JSON.stringify(context.facts)).not.toContain('"cpi"');
    expect(context.notices.join(' ')).toContain('no FX conversion or cross-currency totals');
  });

  it('derives the commercial tier from combined server roles, never supplied question fields', async () => {
    const context = await buildConstructionCopilotContext(actor('executive', { roles: ['executive', 'estate_manager'] }));
    expect(context.facts.commercialAccess).toBe('authorised');
    expect(context.facts).toHaveProperty('commercials');
  });

  it('bounds nested bid rows with explicit coverage instead of serialising an unlimited quote array', async () => {
    store.rows.constructionRfqs = [{ ...seed.constructionRfqs[0], quotes: Array.from({ length: 150 }, (_, index) => ({ ...seed.constructionRfqs[0].quotes[0], vendorName: 'Bid vendor ' + index })) }];
    const context = await buildConstructionCopilotContext(actor('estate_manager'));
    expect((context.facts.commercials as { quotations: unknown[] }).quotations).toHaveLength(100);
    expect(context.coverage.find((row) => row.collection === 'Construction quotation bid rows')).toEqual({ collection: 'Construction quotation bid rows', loaded: 100, total: 150, complete: false });
  });

  it('re-checks tenant and parent project scope even if a repository supplies unrelated rows', async () => {
    const project = seed.constructionProjects[0];
    store.rows.constructionProjects = [project, { ...project, id: 'other-project', tenantId: 'other-tenant', name: 'OTHER_TENANT_PROJECT' }];
    store.rows.constructionTasks = [seed.constructionTasks[0], { ...seed.constructionTasks[0], id: 'other-task', tenantId: 'other-tenant', name: 'OTHER_TENANT_TASK' }, { ...seed.constructionTasks[0], id: 'unlinked-task', projectId: 'not-in-authorised-projects', name: 'UNLINKED_PROJECT_TASK' }];
    const context = await buildConstructionCopilotContext(actor());
    expect(JSON.stringify(context)).not.toContain('OTHER_TENANT'); expect(JSON.stringify(context)).not.toContain('UNLINKED_PROJECT_TASK');
    expect(context.facts.tasks).toHaveLength(1);
    for (const name of store.names.filter((name) => name.startsWith('construction'))) for (const [currentActor] of store.reads[name].mock.calls) expect(currentActor).toEqual(actor());
  });

  it('keeps AI retrieval inside permanent company project membership', async () => {
    const own = seed.constructionProjects[0];
    const other = { ...own, id: 'project-private-b', projectId: 'project-private-b', name: 'PRIVATE PROJECT B' };
    store.rows.constructionProjects = [own, other];
    store.rows.constructionTasks = [
      { ...seed.constructionTasks[0], id: 'task-own', projectId: own.id, name: 'OWN PROJECT TASK' },
      { ...seed.constructionTasks[0], id: 'task-private-b', projectId: other.id, name: 'PRIVATE PROJECT B TASK' },
    ];
    const scopedActor = actorForCompanyMember({
      membershipId: 'membership-ai', userId: 'context-reader', companyId: tenantId,
      companyRole: 'member', status: 'active', companyStatus: 'active',
      modules: { construction: 'view' }, operationalProfileId: 'client-investor',
      estateIds: [], allEstates: false, constructionProjectIds: [own.id], allConstructionProjects: false,
    }, 'context-reader')!;
    const context = await buildConstructionCopilotContext(scopedActor);
    const serialised = JSON.stringify(context.facts);
    expect(serialised).toContain(own.name);
    expect(serialised).toContain('OWN PROJECT TASK');
    expect(serialised).not.toContain('PRIVATE PROJECT B');
    expect(context.scopeLabel).toContain('assigned Construction projects');
  });

  it('omits RFI and drawing metadata from other work packages', async () => {
    const project = db.constructionProjects.find((row) => row.id === seed.constructionProjects[0].id)!;
    const previous = project.mobilisation;
    project.mobilisation = {
      calendar: { name: 'Site', workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8, timeZone: 'Africa/Lagos', holidays: [] },
      baselines: [], team: [], locations: [], parties: [], lifecycle: [],
      workPackages: [
        { id: 'package-own', code: 'OWN', name: 'Assigned package', status: 'active' },
        { id: 'package-private', code: 'PRIVATE', name: 'Other package', status: 'active' },
      ],
    };
    store.rows.constructionRfis = [
      { ...seed.constructionRfis[0], id: 'rfi-own', ref: 'RFI-OWN', workPackageId: 'package-own' },
      { ...seed.constructionRfis[0], id: 'rfi-private', ref: 'RFI-PRIVATE', workPackageId: 'package-private' },
    ];
    store.rows.constructionDocs = [
      { ...seed.constructionDocs[0], id: 'doc-own', number: 'DRAWING-OWN', workPackageIds: ['package-own'] },
      { ...seed.constructionDocs[0], id: 'doc-private', number: 'DRAWING-PRIVATE', workPackageIds: ['package-private'] },
    ];
    store.rows.constructionIssues = [
      { ...seed.constructionIssues[0], id: 'quality-own', category: 'Punch list', workPackageId: 'package-own' },
      { ...seed.constructionIssues[0], id: 'quality-private', category: 'Authority inspection', workPackageId: 'package-private' },
    ];
    const scopedActor = actorForCompanyMember({
      membershipId: 'membership-package-ai', userId: 'context-reader', companyId: tenantId,
      companyRole: 'member', status: 'active', companyStatus: 'active',
      modules: { construction: 'manage' }, operationalProfileId: 'site-engineer',
      estateIds: [], allEstates: false,
      constructionProjectIds: [project.id], allConstructionProjects: false,
      constructionPackageIds: ['package-own'],
    }, 'context-reader')!;
    try {
      expect(scopedActor.constructionPackageIds).toEqual(['package-own']);
      expect(rfiInScope(scopedActor, store.rows.constructionRfis[0] as typeof seed.constructionRfis[number])).toBe(true);
      const context = await buildConstructionCopilotContext(scopedActor);
      expect(context.facts.rfis).toEqual([expect.objectContaining({ ref: 'RFI-OWN' })]);
      expect(context.facts.documents).toEqual([expect.objectContaining({ number: 'DRAWING-OWN' })]);
      expect(context.facts.issues).toEqual([expect.objectContaining({ id: 'quality-own' })]);
    } finally {
      project.mobilisation = previous;
    }
  });

  it('does not repair absent investor child ownership by reading tenant-wide project data', async () => {
    const context = await buildConstructionCopilotContext(actor('investor', { investorProjectIds: [seed.constructionProjects[0].projectId] }));
    expect(context.facts.projects).toHaveLength(1);
    expect(context.facts.tasks).toHaveLength(0); expect(context.facts.deliveries).toHaveLength(0);
    expect(context.facts.commercialAccess).toBe('limited');
  });

  it('caps task context at 100, exposes pagination coverage and never silently claims all rows', async () => {
    store.rows.constructionTasks = Array.from({ length: 205 }, (_, index) => ({ ...seed.constructionTasks[0], id: 'task-' + index, name: 'Task record ' + index }));
    const context = await buildConstructionCopilotContext(actor());
    expect(context.facts.tasks).toHaveLength(100);
    expect(store.reads.constructionTasks).toHaveBeenCalledTimes(2);
    expect(context.coverage.find((row) => row.collection === 'Construction tasks')).toEqual({ collection: 'Construction tasks', loaded: 100, total: null, complete: false });
  });

  it('marks dependent context incomplete when a bounded parent project page is incomplete', async () => {
    store.rows.constructionProjects = Array.from({ length: 105 }, (_, index) => ({ ...seed.constructionProjects[0], id: 'project-' + index }));
    store.rows.constructionTasks = [{ ...seed.constructionTasks[0], projectId: 'project-0' }];
    const context = await buildConstructionCopilotContext(actor());
    expect(context.coverage.find((row) => row.collection === 'Construction projects')?.complete).toBe(false);
    expect(context.coverage.find((row) => row.collection === 'Construction tasks')).toMatchObject({ loaded: 1, total: null, complete: false });
  });

  it('provides only server-owned module-local source IDs and excludes financial context sources for limited readers', async () => {
    const context = await buildConstructionCopilotContext(actor());
    expect(new Set(context.sources.map((s) => s.id)).size).toBe(context.sources.length);
    expect(context.sources.every((s) => validCopilotSource('construction', s))).toBe(true);
    expect(context.sources.some((s) => s.href === '/construction/evm')).toBe(false);
    expect(context.notices.join(' ')).toContain('cost-derived scores');
    expect(context.snapshotISO).toBe(NOW);
  });

  it.each(['resident', 'security', 'technician', 'vendor'] as const)('rejects %s before any Construction record read', async (role) => {
    await expect(buildConstructionCopilotContext(actor(role))).rejects.toBeInstanceOf(ForbiddenError);
    for (const read of Object.values(store.reads)) expect(read).not.toHaveBeenCalled();
  });

  it('rejects a missing tenant rather than substituting a demonstration tenant', async () => {
    await expect(buildConstructionCopilotContext(actor('platform_admin', { tenantId: null }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(store.reads.constructionProjects).not.toHaveBeenCalled();
  });
});

describe('Shortlet AI curated context and bounded coverage', () => {
  it('links every seeded inspection and review to the booking in the same tenant and apartment', () => {
    for (const row of [...seed.shortletInspections, ...seed.shortletReviews]) {
      const booking = seed.shortletBookings.find((candidate) => candidate.id === row.bookingId && candidate.tenantId === row.tenantId);
      expect(booking, `${row.id} must refer to an existing stay`).toBeDefined();
      expect(booking?.apartmentId, `${row.id} must refer to the same apartment`).toBe(row.apartmentId);
      if ('guestName' in row) expect(booking?.guestName).toBe(row.guestName);
    }
  });

  it('uses the linked completed inspection for its stay without marking an unrelated checkout inspected', async () => {
    const inspected = seed.shortletBookings.find((booking) => booking.ref === 'SL-4212')!;
    const unrelated = seed.shortletBookings.find((booking) => booking.ref === 'SL-4213')!;
    store.rows.shortletBookings = [inspected, unrelated].map((booking) => ({ ...booking, status: 'checked_out' }));
    const context = await buildShortletCopilotContext(actor('estate_manager'));
    expect(context.facts.bookings).toEqual([
      expect.objectContaining({ ref: 'SL-4212', apartment: 'Diplomat Duplex', inspectionPending: false }),
      expect.objectContaining({ ref: 'SL-4213', apartment: 'Unit 1A', inspectionPending: true }),
    ]);
  });

  it('loads all six authorised collections with the server actor and no intent matcher', async () => {
    const currentActor = actor('estate_manager'); const context = await buildShortletCopilotContext(currentActor);
    expect(context.module).toBe('shortlet'); expect(context.snapshotISO).toBe(NOW);
    expect(context.facts).toHaveProperty('apartments'); expect(context.facts).toHaveProperty('bookings');
    for (const name of shortletCollections) expect(store.reads[name]).toHaveBeenCalledWith(currentActor, { cursor: null, limit: 50 });
    expect(read('src/server/ai/context/shortlet.ts')).not.toContain('askShortlet(');
  });

  it('excludes guest, credential, bank and narrative sentinels while retaining safe booking references', async () => {
    store.rows.shortletApartments = seed.shortletApartments.map((a) => ({ ...a, wifiPassword: 'SECRET_WIFI_PASSWORD', accessInstructions: 'SECRET_ACCESS_INSTRUCTIONS', wifiSsid: 'SECRET_WIFI_SSID', houseRules: ['SECRET_RULE_NOTE'] }));
    store.rows.shortletBookings = seed.shortletBookings.map((b) => ({ ...b, guestName: 'PRIVATE_GUEST_NAME', guestPhone: 'PRIVATE_GUEST_PHONE', guestEmail: 'PRIVATE_GUEST_EMAIL', guestToken: 'SECRET_GUEST_TOKEN', specialRequests: 'PRIVATE_HEALTH_REQUEST', accountNumber: 'SECRET_BANK_ACCOUNT' }));
    store.rows.shortletReviews = seed.shortletReviews.map((r) => ({ ...r, guestName: 'PRIVATE_REVIEW_NAME', comment: 'PRIVATE_REVIEW_COMMENT' }));
    store.rows.shortletIssues = seed.shortletIssues.map((i) => ({ ...i, description: 'PRIVATE_ISSUE_DESCRIPTION' }));
    store.rows.shortletInspections = seed.shortletInspections.map((i) => ({ ...i, notes: 'PRIVATE_INSPECTION_NOTE', items: [{ label: 'PRIVATE_INSPECTION_ITEM', photo: true }] }));
    const value = JSON.stringify(await buildShortletCopilotContext(actor('estate_manager')));
    for (const secret of ['SECRET_WIFI_PASSWORD', 'SECRET_ACCESS_INSTRUCTIONS', 'SECRET_WIFI_SSID', 'SECRET_RULE_NOTE', 'PRIVATE_GUEST_NAME', 'PRIVATE_GUEST_PHONE', 'PRIVATE_GUEST_EMAIL', 'SECRET_GUEST_TOKEN', 'PRIVATE_HEALTH_REQUEST', 'SECRET_BANK_ACCOUNT', 'PRIVATE_REVIEW_NAME', 'PRIVATE_REVIEW_COMMENT', 'PRIVATE_ISSUE_DESCRIPTION', 'PRIVATE_INSPECTION_NOTE', 'PRIVATE_INSPECTION_ITEM']) expect(value).not.toContain(secret);
    expect(value).toContain(seed.shortletBookings[0].ref);
  });

  it('keeps native kobo and foreign currencies exact and mismatched balances unavailable', async () => {
    store.rows.shortletApartments = [{ ...seed.shortletApartments[0], nightlyRate: { currency: 'USD', minor: 12345 } }];
    store.rows.shortletBookings = [{ ...seed.shortletBookings[0], total: { currency: 'USD', minor: 10001 }, paid: { currency: 'NGN', minor: 100 }, cautionFee: { currency: 'GHS', minor: 25 } }];
    const context = await buildShortletCopilotContext(actor('estate_manager'));
    expect(context.facts.apartments).toEqual([expect.objectContaining({ base: { currency: 'USD', minor: 12345 }, proposed: null, effective: null })]);
    expect(context.facts.bookings).toEqual([expect.objectContaining({ outstanding: null, caution: { currency: 'GHS', minor: 25 } })]);
    expect(context.notices.join(' ')).toContain('no FX conversion or cross-currency totals');
  });

  it('caps booking context and discloses partial/looping pages without inventing a complete tenant total', async () => {
    store.rows.shortletBookings = Array.from({ length: 205 }, (_, index) => ({ ...seed.shortletBookings[0], id: 'booking-' + index, ref: 'SL-PAGE-' + index }));
    const context = await buildShortletCopilotContext(actor('estate_manager'));
    expect(context.facts.bookings).toHaveLength(100); expect(store.reads.shortletBookings).toHaveBeenCalledTimes(2);
    expect(context.coverage.find((row) => row.collection === 'Shortlet bookings')).toMatchObject({ loaded: 100, total: null, complete: false });
    store.reads.shortletBookings.mockReturnValue({ items: [seed.shortletBookings[0]], total: 5000, cursor: 'repeated' });
    const looping = await buildShortletCopilotContext(actor('estate_manager'));
    expect(looping.facts.bookings).toHaveLength(1); expect(looping.coverage.find((row) => row.collection === 'Shortlet bookings')?.complete).toBe(false);
  });

  it('bounds derived overlap pairs and reports the exact omitted-pair count', async () => {
    store.rows.shortletBookings = Array.from({ length: 20 }, (_, index) => ({ ...seed.shortletBookings[0], id: 'same-day-' + index, ref: 'SL-OVERLAP-' + index, status: 'confirmed' }));
    const context = await buildShortletCopilotContext(actor('estate_manager'));
    expect(context.facts.conflicts).toHaveLength(100);
    expect(context.coverage.find((row) => row.collection === 'Derived Shortlet overlap pairs')).toEqual({ collection: 'Derived Shortlet overlap pairs', loaded: 100, total: 190, complete: false });
  });

  it('never treats another tenant record returned by a faulty adapter as context', async () => {
    for (const name of shortletCollections) store.rows[name] = [...store.rows[name], ...(store.rows[name].slice(0, 1).map((row) => ({ ...(row as object), tenantId: 'other-tenant', id: 'other-id', name: 'OTHER_TENANT_SECRET', ref: 'OTHER_TENANT_SECRET', title: 'OTHER_TENANT_SECRET' })))];
    const context = await buildShortletCopilotContext(actor('estate_manager'));
    expect(JSON.stringify(context)).not.toContain('OTHER_TENANT_SECRET');
    expect(context.sources.every((s) => validCopilotSource('shortlet', s))).toBe(true);
  });

  it('keeps zero-review observations explicitly unavailable rather than inferring a zero-star rating', async () => {
    store.rows.shortletReviews = [];
    const context = await buildShortletCopilotContext(actor('estate_manager'));
    expect(context.facts.reviews).toMatchObject({ stats: { count: 0, avg: null } });
  });

  it('propagates denied repository reads to the guarded handler instead of hiding incomplete access', async () => {
    store.reads.shortletIssues.mockRejectedValueOnce(new ForbiddenError('bookings_amenities', 'read', 'no_grant'));
    await expect(buildShortletCopilotContext(actor('estate_manager'))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(buildShortletCopilotContext(actor('facility_manager'))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(buildShortletCopilotContext(actor('platform_admin', { tenantId: null }))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('Construction and Shortlet thin AI transport adapters', () => {
  it.each([['construction', buildConstructionCopilotContext], ['shortlet', buildShortletCopilotContext]] as const)('delegates %s guards, arbitrary questions/history and AI-only streaming to the shared handler', async (module, build) => {
    const { POST: post } = module === 'construction' ? await import('@/app/api/construction/copilot/route') : await import('@/app/api/shortlet/copilot/route');
    const request = new Request('http://localhost/api/' + module + '/copilot', { method: 'POST', body: JSON.stringify({ question: 'Explain the dependencies between the recorded facts in an original way.', turns: [{ role: 'user', content: 'Earlier question' }] }) });
    const response = await post(request);
    expect(store.handle).toHaveBeenCalledExactlyOnceWith(request, module, build);
    expect(await response.text()).toBe('shared AI transport');
    for (const read of Object.values(store.reads)) expect(read).not.toHaveBeenCalled();
    const code = read('src/app/api/' + module + '/copilot/route.ts');
    expect(code).not.toMatch(/askConstruction|askShortlet|ANTHROPIC|fetch\(|setTimeout|builtin|t-lekki/);
  });
});
