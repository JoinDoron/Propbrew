import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { revalidatePath } from 'next/cache';
import { assertCan, type Actor } from '@/lib/authz';
import { canUseCompanyModule } from '@/lib/auth/company-policy';
import { getCompanyPrincipal, recheckCompanyMembership, type CompanyPrincipal } from '@/server/auth/company';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { currentRecordContext, runWithRecordContext } from '@/server/data/record-context';
import { db, validateWorkspaceRecordState } from '@/server/data/store';
import { withWorkspaceState } from '@/server/data/workspace-postgres';
import { qualityIssueVisible } from './quality-access';
import { QUALITY_PHOTO_MAX_BYTES, qualityPhotoContentType, qualityPhotoName, type QualityPhoto } from '@/domain/construction/quality-photos';

type Registry = { files: QualityPhoto[]; receipts: { key: string; actorId: string; hash: string; id: string }[] };
export class QualityPhotoError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
function registry(write = false): Registry {
  const context = currentRecordContext();
  if (!context) return { files: [], receipts: [] };
  if (write && context.mode !== 'write') throw new Error('A write transaction is required.');
  const stored = context.state.auxiliary.constructionQualityPhotos as Registry | undefined;
  if (stored === undefined) {
    if (write) return context.state.auxiliary.constructionQualityPhotos = { files: [], receipts: [] };
    return { files: [], receipts: [] };
  }
  if (!stored || !Array.isArray(stored.files) || !Array.isArray(stored.receipts)) throw new Error('Quality photo register unavailable.');
  return stored;
}
function visibleIssue(actor: Actor, id: string, action: 'read' | 'create') {
  const issue = db.constructionIssues.find((row) => row.id === id && row.tenantId === actor.tenantId);
  if (!issue || !['Punch list', 'Authority inspection'].includes(issue.category) || !qualityIssueVisible(actor, issue, action)) return null;
  return issue;
}
export function qualityPhotosFor(actor: Actor, issueId: string): QualityPhoto[] {
  if (!visibleIssue(actor, issueId, 'read') || currentRecordContext()?.domainTenantId !== actor.tenantId) return [];
  return structuredClone(registry().files.filter((file) => file.tenantId === actor.tenantId && file.issueId === issueId));
}
export function resolveQualityPhotos(actor: Actor, issueId: string, ids: readonly string[]): QualityPhoto[] | null {
  if (!Array.isArray(ids) || ids.length > 12 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== 'string')) return null;
  const available = qualityPhotosFor(actor, issueId);
  const resolved = ids.map((id) => available.find((file) => file.id === id));
  return resolved.some((file) => !file) ? null : resolved as QualityPhoto[];
}
async function principal(write: boolean): Promise<CompanyPrincipal> {
  if (!nativeAuthEnabled() || process.env.DATA_SOURCE !== 'postgres') throw new QualityPhotoError('Stored photos require a signed-in company workspace with database storage.', 503);
  const identity = await getCompanyPrincipal();
  if (!identity) throw new QualityPhotoError('Sign in and choose your company.', 401);
  if (!canUseCompanyModule(identity.actor, 'construction', write ? 'create' : 'read')) throw new QualityPhotoError('Your company role cannot access Construction photos.', 403);
  try { assertCan(identity.actor, 'reports_analytics', write ? 'create' : 'read'); }
  catch { throw new QualityPhotoError('Your Construction profile cannot access photos.', 403); }
  return identity;
}
async function inWorkspace<T>(identity: CompanyPrincipal, fn: (client: PoolClient) => Promise<{ value: T; commit?: boolean }>): Promise<T> {
  let connection: PoolClient | undefined;
  return withWorkspaceState(identity.company.id, identity.company.id, 'write', () => { throw new Error('Company records are unavailable.'); }, async (payload) => {
    if (!connection) throw new Error('Photo transaction unavailable.');
    const state = validateWorkspaceRecordState(payload, identity.company.id);
    return runWithRecordContext({ state, domainTenantId: identity.company.id, mode: 'write', companyPrincipal: identity }, async () => ({ ...await fn(connection!), payload: state }));
  }, async (client) => { connection = client; await recheckCompanyMembership(client, identity); });
}
export async function storeQualityPhoto(input: { expectedCompanyId: string; issueId: string; key: string; name: string; declaredType: string; bytes: Uint8Array }): Promise<QualityPhoto> {
  const identity = await principal(true);
  if (identity.company.id !== input.expectedCompanyId) throw new QualityPhotoError('Your company changed. Reopen this inspection.', 409);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.key)) throw new QualityPhotoError('A valid upload request identifier is required.');
  if (!input.bytes.length || input.bytes.length > QUALITY_PHOTO_MAX_BYTES) throw new QualityPhotoError('Choose a photo of at most 2 MB.', 413);
  const contentType = qualityPhotoContentType(input.bytes);
  if (!contentType || contentType !== input.declaredType) throw new QualityPhotoError('Choose a valid PNG, JPEG or WebP photo of at most 2 MB.');
  const name = qualityPhotoName(input.name, contentType);
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const requestHash = createHash('sha256').update(JSON.stringify([input.issueId, name, contentType, sha256])).digest('hex');
  const saved = await inWorkspace(identity, async (client) => {
    const issue = visibleIssue(identity.actor, input.issueId, 'create');
    if (!issue || issue.status === 'resolved') throw new QualityPhotoError('This quality record cannot receive a photo.', 404);
    const ledger = registry(true);
    const replay = ledger.receipts.find((row) => row.actorId === identity.user.id && row.key === input.key);
    if (replay) {
      const file = ledger.files.find((row) => row.id === replay.id && row.issueId === issue.id);
      if (replay.hash !== requestHash || !file) throw new QualityPhotoError('This upload request changed. Reopen the inspection.', 409);
      return { value: structuredClone(file), commit: false };
    }
    const id = randomUUID(), at = new Date().toISOString();
    const packageIds = issue.workPackageId ? [issue.workPackageId] : [];
    const project = db.constructionProjects.find((row) => row.tenantId === identity.company.id && row.id === issue.projectId);
    const costCode = project?.mobilisation?.workPackages.find((row) => row.id === issue.workPackageId)?.costCode;
    if (costCode) packageIds.push(`${issue.projectId}:${costCode}`);
    const file: QualityPhoto = { id, tenantId: identity.company.id, projectId: issue.projectId, issueId: issue.id, name, contentType, size: input.bytes.length, sha256, url: `/api/construction/quality/photos/${id}`, createdAt: at, createdBy: identity.user.id };
    await client.query('insert into construction_quality_photos(id,tenant_id,project_id,issue_id,package_scope_ids,name,content_type,size_bytes,sha256,bytes,created_by) values($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::uuid)', [id, identity.company.id, issue.projectId, issue.id, JSON.stringify(packageIds), name, contentType, input.bytes.length, sha256, Buffer.from(input.bytes), identity.user.id]);
    ledger.files.push(file);
    ledger.receipts.push({ key: input.key, actorId: identity.user.id, hash: requestHash, id });
    await client.query('insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload) values($1::uuid,$2,$3,$4,$5,$6::jsonb)', [identity.company.id, identity.user.id, 'construction.quality.photo.stored', 'construction_quality_photo', id, JSON.stringify({ projectId: issue.projectId, issueId: issue.id, sha256, size: file.size })]);
    return { value: structuredClone(file) };
  }).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'P0001' && error.message === 'Company quality photo storage limit reached') throw new QualityPhotoError('This company has reached its quality photo storage limit.', 413);
    throw error;
  });
  revalidatePath('/construction/quality');
  return saved;
}
export async function listQualityPhotos(issueId: string): Promise<QualityPhoto[]> {
  const identity = await principal(false);
  return inWorkspace(identity, async () => {
    if (!visibleIssue(identity.actor, issueId, 'read')) throw new QualityPhotoError('Quality record unavailable.', 404);
    return { value: qualityPhotosFor(identity.actor, issueId), commit: false };
  });
}
export async function readQualityPhoto(id: string): Promise<{ file: QualityPhoto; bytes: Uint8Array }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new QualityPhotoError('Photo unavailable.', 404);
  const identity = await principal(false);
  return inWorkspace(identity, async (client) => {
    const file = registry().files.find((row) => row.id === id && row.tenantId === identity.company.id);
    if (!file || !visibleIssue(identity.actor, file.issueId, 'read')) throw new QualityPhotoError('Photo unavailable.', 404);
    const found = await client.query<{ bytes: Buffer; sha256: string }>('select bytes,sha256 from construction_quality_photos where id=$1::uuid and tenant_id=$2::uuid and project_id=$3 and issue_id=$4', [id, identity.company.id, file.projectId, file.issueId]);
    const bytes = found.rows[0]?.bytes;
    if (!bytes || bytes.length !== file.size || found.rows[0].sha256 !== file.sha256 || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new QualityPhotoError('Photo unavailable.', 404);
    return { value: { file: structuredClone(file), bytes: new Uint8Array(bytes) }, commit: false };
  });
}
