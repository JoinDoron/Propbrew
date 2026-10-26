import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import type { Asset, ComplianceObligation, Site } from '@/domain/entities';
import type { FacilityEvidenceResource } from '@/domain/facility/evidence';
import type { CompanyPrincipal } from '@/server/auth/company';
import { blankCompanyWorkspaceState } from '@/server/data/store';
import type { WorkspaceRecordState } from '@/server/data/record-context';

const boundary = vi.hoisted(() => ({ principal: vi.fn(), recheck: vi.fn(), workspace: vi.fn(), query: vi.fn(), state: undefined as WorkspaceRecordState | undefined }));
vi.mock('@/server/auth/company', () => ({ getCompanyPrincipal: boundary.principal, recheckCompanyMembership: boundary.recheck }));
vi.mock('@/server/data/workspace-postgres', () => ({ withWorkspaceState: boundary.workspace }));
import { FacilityEvidenceError, storeFacilityEvidence } from '@/server/facility/evidence';

const tenantId = '77400000-0000-4000-8000-000000000001', userId = '77400000-0000-4000-8000-000000000002';
const siteA = 'original-location', siteB = 'new-location';
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1QAAAAASUVORK5CYII=', 'base64'));
function actAs(estateIds: string[]) {
  const membership = { membershipId: 'verified-evidence-member', userId, companyId: tenantId, companyRole: 'member' as const, status: 'active' as const, companyStatus: 'active' as const, estateIds, allEstates: false, modules: { facility: 'manage' as const } };
  const actor = actorForCompanyMember(membership, userId)!;
  const principal: CompanyPrincipal = { actor, user: { id: userId, name: 'Evidence operator', email: 'operator@example.invalid' }, session: { id: randomUUID() }, company: { id: tenantId, name: 'Evidence test company' }, sandbox: undefined, membership: { ...membership, version: '1' } };
  boundary.principal.mockResolvedValue(principal);
}
function upload(resourceType: FacilityEvidenceResource) {
  return { expectedCompanyId: tenantId, resourceType, resourceId: `${resourceType}-record`, key: randomUUID(), name: 'Private original location inspection.png', declaredType: 'image/png', bytes: png };
}
function moveResource(type: FacilityEvidenceResource) {
  if (type === 'asset') boundary.state!.collections.assets = (boundary.state!.collections.assets as Asset[]).map((row) => ({ ...row, siteId: siteB as Asset['siteId'] }));
  else boundary.state!.collections.complianceObligations = (boundary.state!.collections.complianceObligations as ComplianceObligation[]).map((row) => ({ ...row, siteId: siteB as ComplianceObligation['siteId'], estateId: siteB as ComplianceObligation['estateId'] }));
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('DATA_SOURCE', 'postgres');
  boundary.state = blankCompanyWorkspaceState();
  boundary.state.collections.sites = [siteA, siteB].map((id) => ({ tenantId, id, kind: 'estate', name: id, address: 'Synthetic location', buildingCount: 1, unitCount: 1 } as unknown as Site));
  boundary.state.collections.assets = [{ tenantId, id: 'asset-record', siteId: siteA, name: 'Original location pump', category: 'Water', status: 'operational', archivedAt: null } as unknown as Asset];
  boundary.state.collections.complianceObligations = [{ tenantId, id: 'obligation-record', siteId: siteA, estateId: siteA, name: 'Original location review', scopeLabel: 'Water system', criticality: 'routine', cadenceDays: 30, templateKey: 'general', validUntil: null } as unknown as ComplianceObligation];
  boundary.query.mockResolvedValue({ rows: [{ bytes: '0', files: 0 }], rowCount: 1 });
  boundary.workspace.mockImplementation(async (_tenantId, _domainTenantId, _mode, _initialize, fn, authorize) => {
    const client = { query: boundary.query } as unknown as PoolClient;
    await authorize(client);
    const working = structuredClone(boundary.state!);
    const result = await fn(working);
    if (result.commit !== false) boundary.state = result.payload;
    return result.value;
  });
  actAs([siteA]);
});
afterEach(() => vi.unstubAllEnvs());

describe('Facility evidence replay preserves the current resource and site binding', () => {
  it.each(['asset', 'obligation'] as const)('replays the same %s upload once while its original binding is still authorised', async (type) => {
    const input = upload(type), saved = await storeFacilityEvidence(input);
    expect(saved).toMatchObject({ tenantId, siteId: siteA, resourceType: type, resourceId: input.resourceId });
    expect(boundary.query.mock.calls.filter(([sql]) => String(sql).startsWith('insert into facility_evidence_files'))).toHaveLength(1);
    boundary.query.mockClear();
    expect(await storeFacilityEvidence(input)).toEqual(saved);
    expect(boundary.query).not.toHaveBeenCalled();
  });
  it.each(['asset', 'obligation'] as const)('rejects a %s replay after it moves and the uploader can access only its new site', async (type) => {
    const input = upload(type), saved = await storeFacilityEvidence(input);
    moveResource(type); actAs([siteB]);
    const before = structuredClone(boundary.state); boundary.query.mockClear();
    const rejected = await storeFacilityEvidence(input).then(() => null, (error: unknown) => error);
    expect(rejected).toBeInstanceOf(FacilityEvidenceError);
    expect(rejected).toMatchObject({ status: 409, message: expect.stringContaining('resource location changed') });
    expect(rejected).not.toHaveProperty('id'); expect(rejected).not.toHaveProperty('file'); expect(rejected).not.toHaveProperty('bytes');
    expect(String(rejected)).not.toContain(saved.name); expect(String(rejected)).not.toContain(saved.sha256); expect(String(rejected)).not.toContain(saved.url);
    expect(boundary.query).not.toHaveBeenCalled(); expect(boundary.state).toEqual(before);
  });
  it.each(['asset', 'obligation'] as const)('does not use a previous %s receipt to bypass revoked site access', async (type) => {
    const input = upload(type); await storeFacilityEvidence(input); actAs([siteB]); boundary.query.mockClear();
    await expect(storeFacilityEvidence(input)).rejects.toMatchObject({ status: 404, message: 'This asset or compliance obligation is unavailable.' });
    expect(boundary.query).not.toHaveBeenCalled();
  });
});
