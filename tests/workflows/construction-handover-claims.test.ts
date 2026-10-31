import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import type { ConstructionDoc } from '@/domain/construction/types';
import { constructionControl } from '@/server/construction-control';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { financeControl } from '@/server/finance-control';
import {
  approveConstructionHandoverPack, assessConstructionClaim, confirmConstructionClaimPayment,
  confirmConstructionRetentionPayment, decideConstructionClaim, decideConstructionRetentionRelease,
  importConstructionBankDebits, requestConstructionRetentionRelease, reviewConstructionBankDebit,
  saveConstructionHandoverPack, submitConstructionClaim, submitConstructionHandoverPack,
} from '@/server/actions/construction-control';
import { issueWhtCertificate } from '@/server/actions/finance-control';
import { HANDOVER_REQUIREMENTS } from '@/domain/construction/control';

const boundary = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const tenant = '46a4660b-90d2-478b-89b3-d516779bded2';
let state: WorkspaceRecordState;
const run = <T>(fn: () => T) => runWithRecordContext({ state, domainTenantId: tenant, mode: 'write' }, fn);
const projects = () => state.collections.constructionProjects as { id: string }[];
const docs = () => state.collections.constructionDocs as ConstructionDoc[];
const control = () => run(() => constructionControl(tenant));
const as = (userId: string, role: string, projectIds = ['cp-marina'], companyId = tenant) => boundary.actor.mockResolvedValue(actorForCompanyMember({
  membershipId: userId, userId, companyId, companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' },
  operationalProfileId: role, estateIds: [], allEstates: false, constructionProjectIds: projectIds, allConstructionProjects: false,
}, userId));

beforeEach(() => { vi.stubEnv('DATA_SOURCE', 'memory'); state = createDemoWorkspaceState(tenant); as('pm-1', 'project-manager'); });

describe('Construction handover and claim closeout', () => {
  it('flags every missing file, blocks superseded revisions and requires independent pack sign-off', async () => {
    const projectId = projects()[0].id;
    const created = await run(() => saveConstructionHandoverPack({ projectId, title: 'Marina practical completion', items: [] }));
    expect(created.ok).toBe(true); if (!created.ok) return;
    expect(control().handoverPacks[0].items).toHaveLength(0);
    const missing = await run(() => submitConstructionHandoverPack(created.id!));
    expect(missing.ok).toBe(false);
    expect(missing.ok ? '' : missing.error).toContain('document missing');

    const source = docs().find((row) => row.projectId === projectId)!;
    const items = HANDOVER_REQUIREMENTS.map((requirement, index) => {
      const id = `handover-doc-${index}`;
      docs().push({ ...source, id, number: `HDP-${index}`, revision: 'A', status: 'approved', fileId: `file-${index}`, fileSha256: `sha-${index}` });
      return { requirement: requirement.key, docId: id };
    });
    control().fieldApprovals.push({ tenantId: tenant, id: 'handover-approval-1', projectId, kind: 'handover', subjectRef: 'PC-001', title: 'Practical completion', summary: 'Approved site evidence', evidencePackIds: [], status: 'approved', requestedBy: 'pm-1', requestedAtISO: '2026-10-01', decidedBy: 'director-1', decidedAtISO: '2026-10-02' });
    expect((await run(() => saveConstructionHandoverPack({ packId: created.id, projectId, title: 'Marina practical completion', approvalId: 'handover-approval-1', items }))).ok).toBe(true);
    docs().find((row) => row.id === items[0].docId)!.status = 'superseded';
    expect((await run(() => submitConstructionHandoverPack(created.id!))).ok).toBe(false);
    docs().find((row) => row.id === items[0].docId)!.status = 'approved';
    expect((await run(() => submitConstructionHandoverPack(created.id!))).ok).toBe(true);
    expect((await run(() => approveConstructionHandoverPack(created.id!))).ok).toBe(false);
    as('director-1', 'project-director');
    expect((await run(() => approveConstructionHandoverPack(created.id!))).ok).toBe(true);
    expect(control().handoverPacks[0].status).toBe('approved');
  });

  it('requires reviewed exact bank debits, prevents reuse, and records a separate retained liability and WHT proof', async () => {
    const projectId = projects()[0].id;
    const subcontractor = (state.collections.constructionSubcontractors as { id: string; projectIds: string[] }[]).find((row) => row.projectIds.includes(projectId))!;
    const created = await run(() => submitConstructionClaim({ projectId, subcontractorId: subcontractor.id, periodEndISO: '2026-10-25', description: 'Measured reinforced concrete work', claimedNaira: 1000, retentionPct: 5, whtPct: 5 }));
    expect(created.ok).toBe(true); if (!created.ok) return;
    const claim = control().claims.find((row) => row.id === created.id)!;
    as('qs-1', 'quantity-surveyor');
    expect((await run(() => assessConstructionClaim(claim.id, 1000))).ok).toBe(true);
    as('director-1', 'project-director');
    expect((await run(() => decideConstructionClaim(claim.id, 'approved'))).ok).toBe(true);
    as('finance-importer', 'construction-finance');
    expect((await run(() => importConstructionBankDebits(`date,reference,amount,direction,narration\n2026-10-26,BANK-IPC-001,${claim.certifiedMinor},debit,IPC payment\n2026-10-27,BANK-RET-001,${claim.retentionMinor},debit,Retention release`))).ok).toBe(true);
    const [retentionLine, claimLine] = control().bankDebits;
    expect((await run(() => confirmConstructionClaimPayment(claim.id, claimLine.id))).ok).toBe(false);
    expect((await run(() => reviewConstructionBankDebit(claimLine.id, 'approved'))).ok).toBe(false);
    as('finance-reviewer', 'construction-finance');
    expect((await run(() => reviewConstructionBankDebit(claimLine.id, 'approved'))).ok).toBe(true);
    expect((await run(() => reviewConstructionBankDebit(retentionLine.id, 'approved'))).ok).toBe(true);
    expect((await run(() => confirmConstructionClaimPayment(claim.id, retentionLine.id))).ok).toBe(false);
    expect((await run(() => confirmConstructionClaimPayment(claim.id, claimLine.id))).ok).toBe(true);
    expect(claim).toMatchObject({ status: 'paid', paymentReference: 'BANK-IPC-001' });
    const release = await run(() => requestConstructionRetentionRelease(claim.id, 50, 'Defects period complete'));
    expect(release.ok).toBe(true); if (!release.ok) return;
    expect((await run(() => requestConstructionRetentionRelease(claim.id, 1, 'Extra release'))).ok).toBe(false);
    expect((await run(() => decideConstructionRetentionRelease(release.id!, 'approved'))).ok).toBe(false);
    as('director-2', 'project-director');
    expect((await run(() => decideConstructionRetentionRelease(release.id!, 'approved'))).ok).toBe(true);
    as('finance-reviewer', 'construction-finance');
    expect((await run(() => confirmConstructionRetentionPayment(release.id!, claimLine.id))).ok).toBe(false);
    expect((await run(() => confirmConstructionRetentionPayment(release.id!, retentionLine.id))).ok).toBe(true);
    expect(control().retentionReleases[0].status).toBe('paid');
    expect((await run(() => issueWhtCertificate('construction_claim', claim.id, '2026-10-01'))).ok).toBe(false);
    expect((await run(() => issueWhtCertificate('construction_claim', claim.id, '2026-10-01', { externalCertificateRef: 'FIRS-IPC-001', remittanceRef: 'REMIT-IPC-001' }))).ok).toBe(true);
    expect(run(() => financeControl(tenant)).whtCertificates[0]).toMatchObject({ sourceId: claim.id, externalCertificateRef: 'FIRS-IPC-001', remittanceRef: 'REMIT-IPC-001' });
    expect((await run(() => issueWhtCertificate('construction_claim', claim.id, '2026-10-01', { externalCertificateRef: 'FIRS-IPC-002', remittanceRef: 'REMIT-IPC-002' }))).ok).toBe(false);
  });

  it('rejects actions on a different project and company', async () => {
    const otherProject = projects()[1].id;
    expect((await run(() => saveConstructionHandoverPack({ projectId: otherProject, title: 'Other project handover', items: [] }))).ok).toBe(false);
    expect((await run(() => importConstructionBankDebits('date,reference,amount,direction\n2026-10-26,BANK-FOREIGN,100,debit'))).ok).toBe(false);
    as('foreign-director', 'project-director', [projects()[0].id], 'b8e62128-130e-4975-b3be-48d45ca7d9a3');
    expect((await run(() => saveConstructionHandoverPack({ projectId: projects()[0].id, title: 'Foreign company pack', items: [] }))).ok).toBe(false);
  });
});
