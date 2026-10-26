import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { assertCan, matchesScope, type Actor } from '@/lib/authz';
import { canUseCompanyModule } from '@/lib/auth/company-policy';
import { getCompanyPrincipal, recheckCompanyMembership, type CompanyPrincipal } from '@/server/auth/company';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { currentRecordContext, runWithRecordContext } from '@/server/data/record-context';
import { db, validateWorkspaceRecordState } from '@/server/data/store';
import { repos } from '@/server/data';
import { withWorkspaceState } from '@/server/data/workspace-postgres';
import { FACILITY_EVIDENCE_COMPANY_BYTES, FACILITY_EVIDENCE_COMPANY_FILES, facilityEvidenceContentType, facilityEvidenceName, type FacilityEvidence, type FacilityEvidenceResource } from '@/domain/facility/evidence';

type Registry = { files: FacilityEvidence[]; receipts: { key: string; actorId: string; hash: string; id: string }[] };
export class FacilityEvidenceError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
function registry(write = false): Registry {
  const context = currentRecordContext();
  if (!context) return { files: [], receipts: [] };
  if (write && context.mode !== 'write') throw new Error('Evidence requires a write transaction.');
  const stored = context.state.auxiliary.facilityEvidence as Registry | undefined;
  if (stored === undefined) {
    if (write) return context.state.auxiliary.facilityEvidence = { files: [], receipts: [] };
    return { files: [], receipts: [] };
  }
  if (!stored || !Array.isArray(stored.files) || !Array.isArray(stored.receipts)) throw new Error('Evidence register is unavailable.');
  return stored;
}
export function facilityEvidenceSite(actor: Actor, type: FacilityEvidenceResource, id: string, action: 'read' | 'create' = 'read'): string | null {
  if (!actor.tenantId || !canUseCompanyModule(actor, 'facility', action)) return null;
  const capability = type === 'asset' ? 'assets_ppm' : 'inspections_compliance';
  const scope = assertCan(actor, capability, action);
  const asset = type === 'asset' ? repos.assets.get(actor, id) : null;
  const resource = type === 'asset' ? asset && (action === 'read' || !asset.archivedAt) ? asset : null : db.complianceObligations.find((row) => row.id === id);
  if (!resource || resource.tenantId !== actor.tenantId || !matchesScope(resource, scope)) return null;
  const site = db.sites.find((row) => row.tenantId === actor.tenantId && String(row.id) === String(resource.siteId));
  return site && matchesScope({ ...site, siteId: String(site.id) }, scope) ? String(site.id) : null;
}
export function facilityEvidenceFor(actor: Actor, type: FacilityEvidenceResource, id: string): FacilityEvidence[] {
  const siteId = facilityEvidenceSite(actor, type, id);
  if (!siteId || currentRecordContext()?.domainTenantId !== actor.tenantId) return [];
  return structuredClone(registry().files.filter((row) => row.tenantId === actor.tenantId && row.siteId === siteId && row.resourceType === type && row.resourceId === id));
}
export function resolveFacilityEvidence(actor: Actor, type: FacilityEvidenceResource, id: string, ids: string[]): FacilityEvidence[] | null {
  if (!Array.isArray(ids) || ids.length > 20 || new Set(ids).size !== ids.length || ids.some((value) => typeof value !== 'string')) return null;
  const files = facilityEvidenceFor(actor, type, id);
  const resolved = ids.map((value) => files.find((row) => row.id === value));
  return resolved.some((row) => !row) ? null : resolved as FacilityEvidence[];
}
async function principal(write: boolean): Promise<CompanyPrincipal> {
  if (!nativeAuthEnabled() || process.env.DATA_SOURCE !== 'postgres') throw new FacilityEvidenceError('Stored evidence is available in company workspaces with database storage.', 503);
  const result = await getCompanyPrincipal();
  if (!result) throw new FacilityEvidenceError('Sign in and choose your company.', 401);
  if (!canUseCompanyModule(result.actor, 'facility', write ? 'create' : 'read')) throw new FacilityEvidenceError('Your company role cannot access Facility evidence.', 403);
  return result;
}
async function inWorkspace<T>(identity: CompanyPrincipal, fn: (client: PoolClient) => Promise<{ value: T; commit?: boolean }>): Promise<T> {
  let connection: PoolClient | undefined;
  return withWorkspaceState(identity.company.id, identity.company.id, 'write', () => { throw new Error('Company records are unavailable.'); }, async (payload) => {
    if (!connection) throw new Error('Evidence transaction is unavailable.');
    const state = validateWorkspaceRecordState(payload, identity.company.id);
    return runWithRecordContext({ state, domainTenantId: identity.company.id, mode: 'write', companyPrincipal: identity }, async () => ({ ...await fn(connection!), payload: state }));
  }, async (client) => { connection = client; await recheckCompanyMembership(client, identity); });
}
export async function storeFacilityEvidence(input: { expectedCompanyId: string; resourceType: FacilityEvidenceResource; resourceId: string; key: string; name: string; declaredType: string; bytes: Uint8Array }): Promise<FacilityEvidence> {
  const identity = await principal(true);
  if (identity.company.id !== input.expectedCompanyId) throw new FacilityEvidenceError('Your company changed. Reopen this form.', 409);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.key)) throw new FacilityEvidenceError('A valid upload request identifier is required.');
  const contentType = facilityEvidenceContentType(input.bytes);
  if (!contentType || input.declaredType !== contentType) throw new FacilityEvidenceError('Choose a valid PNG, JPEG, WebP or PDF file of at most 2 MB.');
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const name = facilityEvidenceName(input.name, contentType);
  const hash = createHash('sha256').update(JSON.stringify([input.resourceType, input.resourceId, name, contentType, sha256])).digest('hex');
  return inWorkspace(identity, async (client) => {
    const siteId = facilityEvidenceSite(identity.actor, input.resourceType, input.resourceId, 'create');
    if (!siteId) throw new FacilityEvidenceError('This asset or compliance obligation is unavailable.', 404);
    const ledger = registry(true);
    const replay = ledger.receipts.find((row) => row.actorId === identity.user.id && row.key === input.key);
    if (replay) {
      const saved = ledger.files.find((row) => row.id === replay.id && row.tenantId === identity.company.id);
      if (replay.hash !== hash || !saved || saved.siteId !== siteId || saved.resourceType !== input.resourceType || saved.resourceId !== input.resourceId) throw new FacilityEvidenceError('This upload request or resource location changed. Reopen the record before uploading.', 409);
      return { value: structuredClone(saved), commit: false };
    }
    const totals = await client.query<{ bytes: string; files: number }>('select coalesce(sum(size_bytes),0)::text bytes,count(*)::int files from facility_evidence_files where tenant_id=$1::uuid', [identity.company.id]);
    if (Number(totals.rows[0].bytes) + input.bytes.byteLength > FACILITY_EVIDENCE_COMPANY_BYTES || totals.rows[0].files >= FACILITY_EVIDENCE_COMPANY_FILES) throw new FacilityEvidenceError('This company has reached its evidence storage limit. Contact support before uploading more files.', 413);
    const id = randomUUID(), at = new Date().toISOString();
    const saved: FacilityEvidence = { id, tenantId: identity.company.id, siteId, resourceType: input.resourceType, resourceId: input.resourceId, name, contentType, size: input.bytes.byteLength, kind: contentType.startsWith('image/') ? 'image' : 'document', url: `/api/facility/evidence/${id}`, sha256, createdAt: at, createdBy: identity.user.id };
    await client.query('insert into facility_evidence_files(id,tenant_id,site_id,resource_type,resource_id,content_type,size_bytes,sha256,bytes,created_by) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::uuid)', [id, identity.company.id, siteId, input.resourceType, input.resourceId, contentType, input.bytes.byteLength, sha256, Buffer.from(input.bytes), identity.user.id]);
    ledger.files.push(saved); ledger.receipts.push({ key: input.key, actorId: identity.user.id, hash, id });
    await client.query('insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload) values($1::uuid,$2,$3,$4,$5,$6::jsonb)', [identity.company.id, identity.user.id, 'facility.evidence.stored', 'facility_evidence', id, JSON.stringify({ siteId, resourceType: input.resourceType, resourceId: input.resourceId, contentType, size: saved.size, sha256 })]);
    return { value: structuredClone(saved) };
  }).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'P0001' && error.message === 'Company evidence storage limit reached') throw new FacilityEvidenceError('This company has reached its evidence storage limit. Contact support before uploading more files.', 413);
    throw error;
  });
}
export async function listStoredFacilityEvidence(type: FacilityEvidenceResource, id: string): Promise<FacilityEvidence[]> {
  const identity = await principal(false);
  return inWorkspace(identity, async () => {
    if (!facilityEvidenceSite(identity.actor, type, id)) throw new FacilityEvidenceError('This evidence register is unavailable.', 404);
    return { value: facilityEvidenceFor(identity.actor, type, id), commit: false };
  });
}
export async function readStoredFacilityEvidence(id: string): Promise<{ file: FacilityEvidence; bytes: Uint8Array }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new FacilityEvidenceError('File unavailable.', 404);
  const identity = await principal(false);
  return inWorkspace(identity, async (client) => {
    const saved = registry().files.find((row) => row.id === id && row.tenantId === identity.company.id);
    if (!saved || !facilityEvidenceSite(identity.actor, saved.resourceType, saved.resourceId)) throw new FacilityEvidenceError('File unavailable.', 404);
    const result = await client.query<{ bytes: Buffer; sha256: string }>('select bytes,sha256 from facility_evidence_files where tenant_id=$1::uuid and id=$2::uuid and site_id=$3 and resource_type=$4 and resource_id=$5', [identity.company.id, id, saved.siteId, saved.resourceType, saved.resourceId]);
    const bytes = result.rows[0]?.bytes;
    if (!bytes || bytes.byteLength !== saved.size || result.rows[0].sha256 !== saved.sha256 || createHash('sha256').update(bytes).digest('hex') !== saved.sha256) throw new FacilityEvidenceError('File unavailable.', 404);
    return { value: { file: structuredClone(saved), bytes: new Uint8Array(bytes) }, commit: false };
  });
}
