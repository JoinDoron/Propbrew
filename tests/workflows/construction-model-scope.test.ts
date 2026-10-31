import { describe, expect, it } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import type { Project } from '@/domain/construction/types';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext } from '@/server/data/record-context';
import { constructionModelsFor, type StoredModel } from '@/server/construction/models';

const company = '46a4660b-90d2-478b-89b3-d516779bded2';
const model = (id: string, projectId: string, workPackageId?: string): StoredModel => ({ id, tenantId: company, projectId, workPackageId,
  name: `${id}.obj`, format: 'obj', discipline: 'Structure', size: 100, sha256: 'a'.repeat(64), componentCount: 1, uploadedAtISO: '2026-10-31T09:00:00Z', uploadedBy: 'author' });
const actor = (projectIds: string[], packageIds?: string[]) => actorForCompanyMember({ membershipId: 'member-1', userId: 'reader', companyId: company,
  companyRole: 'member', status: 'active', companyStatus: 'active', modules: { construction: 'manage' }, operationalProfileId: packageIds ? 'site-engineer' : 'project-manager',
  estateIds: [], allEstates: false, constructionProjectIds: projectIds, allConstructionProjects: false, constructionPackageIds: packageIds }, 'reader')!;

describe('Construction model register scope', () => {
  it('limits model and run metadata to the assigned company, project and work package', () => {
    const state = createDemoWorkspaceState(company);
    const own = (state.collections.constructionProjects as Project[]).find((row) => row.id === 'cp-marina')!;
    own.mobilisation = { workPackages: [{ id: 'structure', code: 'STR', name: 'Structure', status: 'active' }, { id: 'mep', code: 'MEP', name: 'MEP', status: 'active' }] } as Project['mobilisation'];
    state.auxiliary.constructionModels = { models: [model('structure-model', own.id, 'structure'), model('mep-model', own.id, 'mep'), model('other-project', 'cp-cedar')],
      runs: [{ id: 'run-1', projectId: own.id, modelAId: 'structure-model', modelBId: 'mep-model', toleranceMm: 5, compared: 1, candidates: 1, created: 1, runBy: 'author', runAtISO: '2026-10-31T09:00:00Z', method: 'component_envelope_v1' }], receipts: [] };
    const read = (user: ReturnType<typeof actor>, projectId: string) => runWithRecordContext({ state, domainTenantId: company, mode: 'read' }, () => constructionModelsFor(user, projectId));
    expect(read(actor([own.id], ['structure']), own.id).models.map((row) => row.id)).toEqual(['structure-model']);
    expect(read(actor([own.id], ['structure']), own.id).runs).toEqual([]);
    expect(read(actor(['cp-cedar']), own.id).models).toEqual([]);
    expect(read(actor([own.id]), own.id).models.map((row) => row.id)).toEqual(['structure-model', 'mep-model']);
    expect(read(actor([own.id]), own.id).runs).toHaveLength(1);
  });
});
