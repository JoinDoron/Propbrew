import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import type { Issue } from '@/domain/construction/types';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { operatingDateISO } from '@/server/operating-clock';
import {
  recordConstructionCorrectiveWork, recordConstructionInspectionVisit, scheduleConstructionInspection,
  scheduleConstructionReinspection, signOffConstructionQuality,
} from '@/server/actions/construction-quality';
import { recordConstructionQualityIssue, advanceConstructionQualityIssue } from '@/server/actions/construction';
import { resolveQualityPhotos } from '@/server/construction/quality-photos';

const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const tenant = '46a4660b-90d2-478b-89b3-d516779bded2';
let state: WorkspaceRecordState;
const projects = () => state.collections.constructionProjects as { id: string; tenantId: string }[];
const issues = () => state.collections.constructionIssues as Issue[];
const run = <T>(fn: () => T) => runWithRecordContext({ state, domainTenantId: tenant, mode: 'write' }, fn);
const manager = (projectId: string) => actorForCompanyMember({ membershipId: 'quality-manager', userId: 'quality-manager', companyId: tenant, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' }, operationalProfileId: 'site-manager', estateIds: [], allEstates: false, constructionProjectIds: [projectId], allConstructionProjects: false }, 'quality-manager')!;
const engineer = (projectId: string, packageId: string) => actorForCompanyMember({ membershipId: 'quality-engineer', userId: 'quality-engineer', companyId: tenant, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' }, operationalProfileId: 'site-engineer', estateIds: [], allEstates: false, constructionProjectIds: [projectId], allConstructionProjects: false, constructionPackageIds: [packageId] }, 'quality-engineer')!;
const schedule = (projectId: string) => ({ projectId, title: 'Block A statutory fire inspection', location: 'Block A, level 2', authority: 'Lagos State Fire Service', owner: 'Main contractor', dueISO: operatingDateISO(), checklist: ['Check exit signage', 'Check fire doors'], appointment: { dateISO: operatingDateISO(), timeWAT: '10:30', inspector: 'Authority inspector' } });
function photo(issue: Issue) {
  const id = randomUUID();
  const registry = (state.auxiliary.constructionQualityPhotos ??= { files: [], receipts: [] }) as { files: unknown[]; receipts: unknown[] };
  registry.files.push({ id, tenantId: tenant, projectId: issue.projectId, issueId: issue.id, name: 'Site evidence.jpg', contentType: 'image/jpeg', size: 128, sha256: 'a'.repeat(64), url: `/api/construction/quality/photos/${id}`, createdAt: new Date().toISOString(), createdBy: 'quality-manager' });
  return id;
}

beforeEach(() => { vi.stubEnv('DATA_SOURCE', 'memory'); state = createDemoWorkspaceState(tenant); boundary.actor.mockResolvedValue(manager(projects()[0].id)); });
afterEach(() => vi.unstubAllEnvs());

describe('Construction authority inspection and punch-list closeout', () => {
  it('requires a recorded appointment, finding photo, corrective work, reinspection and attributed sign-off', async () => {
    const projectId = projects()[0].id;
    const created = await run(() => scheduleConstructionInspection(schedule(projectId)));
    expect(created.ok).toBe(true);
    const inspection = issues().find((row) => row.id === (created.ok ? created.ref : ''))!;
    const [exit, doors] = inspection.inspection!.checklist;
    const initial = inspection.inspection!.visits[0];
    expect(initial).toMatchObject({ kind: 'initial', dateISO: operatingDateISO(), timeWAT: '10:30' });
    expect((await run(() => signOffConstructionQuality(inspection.id, { signer: 'Inspector', role: 'Authority', reference: 'LSFS-01', decision: 'Approved after review.' }))).ok).toBe(false);
    const finding = { itemId: exit.id, result: 'fail' as const, finding: 'Exit sign unlit at stair landing', photoIds: [] };
    const pass = { itemId: doors.id, result: 'pass' as const, photoIds: [] };
    expect((await run(() => recordConstructionInspectionVisit(inspection.id, { visitId: initial.id, notes: '', results: [finding, pass] }))).ok).toBe(false);
    const findingPhoto = photo(inspection);
    expect((await run(() => recordConstructionInspectionVisit(inspection.id, { visitId: initial.id, notes: 'Authority visit completed', results: [{ ...finding, photoIds: [findingPhoto] }, pass] }))).ok).toBe(true);
    expect((await run(() => recordConstructionInspectionVisit(inspection.id, { visitId: initial.id, notes: '', results: [{ ...finding, photoIds: [findingPhoto] }, pass] }))).ok).toBe(false);
    const punch = issues().find((row) => row.inspectionId === inspection.id)!;
    expect(punch).toMatchObject({ category: 'Punch list', status: 'open', owner: 'Main contractor', photoIds: [findingPhoto] });
    expect((await run(() => scheduleConstructionReinspection(inspection.id, schedule(projectId).appointment))).ok).toBe(false);
    expect((await run(() => advanceConstructionQualityIssue(punch.id, 'resolved', 'Replaced the exit sign', 'Photo-123'))).ok).toBe(false);
    const correctionPhoto = photo(punch);
    expect((await run(() => recordConstructionCorrectiveWork(punch.id, { description: 'Replaced the exit sign and tested it', photoIds: [correctionPhoto], owner: 'Electrical contractor', dueISO: operatingDateISO() }))).ok).toBe(true);
    expect(punch).toMatchObject({ owner: 'Electrical contractor', status: 'in_progress', remediation: { photoIds: [correctionPhoto] } });
    expect((await run(() => scheduleConstructionReinspection(inspection.id, schedule(projectId).appointment))).ok).toBe(true);
    const revisit = inspection.inspection!.visits.at(-1)!;
    expect(revisit.kind).toBe('reinspection');
    expect((await run(() => recordConstructionInspectionVisit(inspection.id, { visitId: revisit.id, notes: 'Exit sign checked', results: [{ itemId: exit.id, result: 'pass', photoIds: [] }, pass] }))).ok).toBe(false);
    const reinspectionPhoto = photo(inspection);
    expect((await run(() => recordConstructionInspectionVisit(inspection.id, { visitId: revisit.id, notes: 'Exit sign checked', results: [{ itemId: exit.id, result: 'pass', photoIds: [reinspectionPhoto] }, pass] }))).ok).toBe(true);
    const signed = await run(() => signOffConstructionQuality(inspection.id, { signer: 'A. Okafor', role: 'Lagos State Fire Service', reference: 'LSFS/2026/070', decision: 'The corrective works satisfy the fire safety inspection.' }));
    expect(signed.ok).toBe(true);
    expect(inspection).toMatchObject({ status: 'resolved', inspection: { signOff: { signer: 'A. Okafor', reference: 'LSFS/2026/070', recordedBy: 'quality-manager' } } });
    expect(punch.status).toBe('resolved');
    expect((await run(() => signOffConstructionQuality(inspection.id, { signer: 'Another', role: 'Authority', reference: 'LSFS-02', decision: 'Duplicate approval.' }))).ok).toBe(false);
    expect(state.collections.constructionAudit).toEqual(expect.arrayContaining([expect.objectContaining({ entity: 'construction_quality', entityRef: inspection.id, action: 'resolve' })]));
  });

  it('denies other projects and other issues’ photos, and refuses incomplete checklists', async () => {
    const own = projects()[0].id, other = projects()[1].id;
    expect((await run(() => scheduleConstructionInspection(schedule(other)))).ok).toBe(false);
    const created = await run(() => scheduleConstructionInspection(schedule(own)));
    const inspection = issues().find((row) => row.id === (created.ok ? created.ref : ''))!;
    const separate = await run(() => scheduleConstructionInspection({ ...schedule(own), title: 'Separate statutory inspection' }));
    const otherIssue = issues().find((row) => row.id === (separate.ok ? separate.ref : ''))!;
    const foreignPhoto = photo(otherIssue);
    expect(run(() => resolveQualityPhotos(manager(own), inspection.id, [foreignPhoto]))).toBeNull();
    const first = inspection.inspection!.checklist[0];
    expect((await run(() => recordConstructionInspectionVisit(inspection.id, { visitId: inspection.inspection!.visits[0].id, notes: '', results: [{ itemId: first.id, result: 'pass', photoIds: [] }] }))).ok).toBe(false);
    (inspection as unknown as { tenantId: string }).tenantId = '28a9827b-b864-4eb5-9c30-4635f64e2908';
    expect((await run(() => recordConstructionInspectionVisit(inspection.id, { visitId: inspection.inspection!.visits[0].id, notes: '', results: inspection.inspection!.checklist.map((row) => ({ itemId: row.id, result: 'pass' as const, photoIds: [] })) }))).ok).toBe(false);
  });

  it('signs off a standalone punch item only after photographed corrective work', async () => {
    const projectId = projects()[0].id;
    const created = await run(() => recordConstructionQualityIssue({ projectId, category: 'Punch list', title: 'Loose stair rail fixing', severity: 'high', owner: 'Builder', dueISO: operatingDateISO(), location: 'Block A stairwell' }));
    expect(created.ok).toBe(true);
    const punch = issues().find((row) => row.id === (created.ok ? created.ref : ''))!;
    expect((await run(() => signOffConstructionQuality(punch.id, { signer: 'Site manager', role: 'Project manager', reference: 'SNAG-01', decision: 'Work checked and accepted.' }))).ok).toBe(false);
    const image = photo(punch);
    expect((await run(() => recordConstructionCorrectiveWork(punch.id, { description: 'Reinstalled anchor bolts and tested rail', photoIds: [image], owner: 'Builder', dueISO: operatingDateISO() }))).ok).toBe(true);
    boundary.actor.mockResolvedValue(actorForCompanyMember({ membershipId: 'quality-procurement', userId: 'buyer', companyId: tenant, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' }, operationalProfileId: 'procurement-officer', estateIds: [], allEstates: false, constructionProjectIds: [projectId], allConstructionProjects: false }, 'buyer'));
    expect((await run(() => signOffConstructionQuality(punch.id, { signer: 'Site manager', role: 'Project manager', reference: 'SNAG-01', decision: 'Work checked and accepted.' }))).ok).toBe(false);
    boundary.actor.mockResolvedValue(actorForCompanyMember({ membershipId: 'quality-consultant', userId: 'external-consultant', companyId: tenant, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' }, operationalProfileId: 'consultant-approver', estateIds: [], allEstates: false, constructionProjectIds: [projectId], allConstructionProjects: false }, 'external-consultant'));
    expect((await run(() => signOffConstructionQuality(punch.id, { signer: 'Site manager', role: 'Project manager', reference: 'SNAG-01', decision: 'Work checked and accepted.' }))).ok).toBe(true);
    expect(punch.status).toBe('resolved');
    expect(punch.inspection?.signOff?.reference).toBe('SNAG-01');
  });

  it('limits inspection creation and updates to assigned work packages', async () => {
    const project = (state.collections.constructionProjects as { id: string; mobilisation?: { workPackages: { id: string; code: string; name: string; status: 'active' }[] } }[])[0];
    project.mobilisation = { workPackages: [{ id: 'pack-a', code: 'A', name: 'Electrical', status: 'active' }, { id: 'pack-b', code: 'B', name: 'Structural', status: 'active' }] };
    boundary.actor.mockResolvedValue(engineer(project.id, 'pack-a'));
    expect((await run(() => scheduleConstructionInspection({ ...schedule(project.id), workPackageId: 'pack-b' }))).ok).toBe(false);
    expect((await run(() => scheduleConstructionInspection(schedule(project.id)))).ok).toBe(false);
    const created = await run(() => scheduleConstructionInspection({ ...schedule(project.id), workPackageId: 'pack-a' }));
    expect(created.ok).toBe(true);
    const issue = issues().find((row) => row.id === (created.ok ? created.ref : ''))!;
    boundary.actor.mockResolvedValue(engineer(project.id, 'pack-b'));
    expect((await run(() => recordConstructionInspectionVisit(issue.id, { visitId: issue.inspection!.visits[0].id, notes: '', results: issue.inspection!.checklist.map((line) => ({ itemId: line.id, result: 'pass' as const, photoIds: [] })) }))).ok).toBe(false);
  });
});
