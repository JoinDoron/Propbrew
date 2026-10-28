import { describe, expect, it } from 'vitest';
import { actorForCompanyMember, type CompanyMembershipRecord } from '@/lib/auth/company-policy';
import { applyScope, can } from '@/lib/authz';

function membership(overrides: Partial<CompanyMembershipRecord> = {}): CompanyMembershipRecord {
  return {
    membershipId: 'cm-construction', userId: 'user-site', companyId: 'company-a', companyRole: 'member',
    status: 'active', companyStatus: 'active', modules: { construction: 'manage' },
    operationalProfileId: 'site-manager', estateIds: [], allEstates: false,
    constructionProjectIds: ['project-a'], allConstructionProjects: false,
    ...overrides,
  };
}

function scopeFor(record: CompanyMembershipRecord) {
  const actor = actorForCompanyMember(record, record.userId);
  expect(actor).not.toBeNull();
  const decision = can(actor!, 'reports_analytics', 'read');
  expect(decision.allowed).toBe(true);
  if (!decision.allowed) throw new Error('Expected construction read access');
  return { actor: actor!, scope: decision.scope };
}

describe('permanent Construction record assignments', () => {
  it('projects a permanent project membership and rejects another project and company', () => {
    const { actor, scope } = scopeFor(membership());
    expect(actor.constructionProjectIds).toEqual(['project-a']);
    expect(actor.allConstructionProjects).toBe(false);
    expect(applyScope([
      { id: 'own', tenantId: 'company-a', projectId: 'project-a' },
      { id: 'other-project', tenantId: 'company-a', projectId: 'project-b' },
      { id: 'other-company', tenantId: 'company-b', projectId: 'project-a' },
    ], scope).map((row) => row.id)).toEqual(['own']);
  });

  it('narrows package commercial records inside the assigned project', () => {
    const { actor, scope } = scopeFor(membership({
      operationalProfileId: 'site-engineer', constructionProjectIds: ['project-a'],
      constructionPackageIds: ['project-a:CC-STR'],
    }));
    expect(actor.constructionPackageIds).toEqual(['project-a:CC-STR']);
    expect(applyScope([
      { id: 'structure', tenantId: 'company-a', projectId: 'project-a', costCode: 'CC-STR' },
      { id: 'mep', tenantId: 'company-a', projectId: 'project-a', costCode: 'CC-MEP' },
      { id: 'other-project', tenantId: 'company-a', projectId: 'project-b', costCode: 'CC-STR' },
    ], scope).map((row) => row.id)).toEqual(['structure']);
  });

  it('narrows subcontractor records and claims to the assigned organisation', () => {
    const { scope } = scopeFor(membership({
      operationalProfileId: 'subcontractor', constructionProjectIds: ['project-a'],
      constructionSubcontractorIds: ['sub-a'],
    }));
    expect(applyScope([
      { id: 'own-claim', tenantId: 'company-a', projectId: 'project-a', subcontractorId: 'sub-a' },
      { id: 'other-claim', tenantId: 'company-a', projectId: 'project-a', subcontractorId: 'sub-b' },
    ], scope).map((row) => row.id)).toEqual(['own-claim']);
  });

  it('narrows field work to assigned task identities, not merely the project', () => {
    const { scope } = scopeFor(membership({
      operationalProfileId: 'construction-field-worker', constructionProjectIds: ['project-a'],
      constructionTaskIds: ['task-a'],
    }));
    expect(applyScope([
      { id: 'task-a', tenantId: 'company-a', projectId: 'project-a', constructionTaskId: 'task-a' },
      { id: 'task-b', tenantId: 'company-a', projectId: 'project-a', constructionTaskId: 'task-b' },
    ], scope).map((row) => row.id)).toEqual(['task-a']);
  });

  it('fails closed when a scoped Construction profile has no assigned projects', () => {
    const { scope } = scopeFor(membership({ constructionProjectIds: [] }));
    expect(applyScope([
      { id: 'project-a', tenantId: 'company-a', projectId: 'project-a' },
      { id: 'project-b', tenantId: 'company-a', projectId: 'project-b' },
    ], scope)).toEqual([]);
  });

  it('does not let a stored portfolio-wide flag override a scoped profile', () => {
    const { actor, scope } = scopeFor(membership({
      constructionProjectIds: ['project-a'], allConstructionProjects: true,
    }));
    expect(actor.allConstructionProjects).toBe(false);
    expect(applyScope([
      { id: 'own', tenantId: 'company-a', projectId: 'project-a' },
      { id: 'other', tenantId: 'company-a', projectId: 'project-b' },
    ], scope).map((row) => row.id)).toEqual(['own']);
  });
});
