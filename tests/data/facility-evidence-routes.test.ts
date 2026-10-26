import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FACILITY_EVIDENCE_MAX_BYTES } from '@/domain/facility/evidence';
const boundary = vi.hoisted(() => ({ store: vi.fn(), list: vi.fn(), read: vi.fn() }));
vi.mock('@/server/facility/evidence', () => ({
  storeFacilityEvidence: boundary.store, listStoredFacilityEvidence: boundary.list, readStoredFacilityEvidence: boundary.read,
  FacilityEvidenceError: class extends Error { constructor(message: string, readonly status = 400) { super(message); } },
}));
import { FacilityEvidenceError } from '@/server/facility/evidence';
import { POST, GET } from '@/app/api/facility/evidence/route';
import { GET as download } from '@/app/api/facility/evidence/[id]/route';

const origin = 'https://facility-evidence.example';
const company = '88100000-0000-4000-8000-000000000001', id = '88100000-0000-4000-8000-000000000002';
const saved = { id, tenantId: company, siteId: 'site-a', resourceType: 'asset', resourceId: 'asset-a', name: 'Pump.png', contentType: 'image/png', size: 12, kind: 'image', url: `/api/facility/evidence/${id}`, sha256: 'a'.repeat(64), createdAt: '2026-10-26T12:00:00Z', createdBy: 'manager-a' };
function upload() {
  const form = new FormData(); form.set('expectedCompanyId', company); form.set('resourceType', 'asset'); form.set('resourceId', 'asset-a');
  form.set('file', new File([new Uint8Array(12)], 'Pump.png', { type: 'image/png' }));
  return new Request(`${origin}/api/facility/evidence`, { method: 'POST', headers: { Origin: origin, 'Idempotency-Key': id }, body: form });
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('BETTER_AUTH_URL', origin); vi.stubEnv('PROPBREW_AUTH_ORIGINS', ''); boundary.store.mockResolvedValue(saved); boundary.list.mockResolvedValue([saved]); });
afterEach(() => vi.unstubAllEnvs());

describe('Facility evidence request boundary', () => {
  it('requires the configured workspace origin and never trusts a matching ingress host', async () => {
    const request = upload(); request.headers.set('Origin', 'https://untrusted.example'); request.headers.set('X-Forwarded-Host', 'untrusted.example');
    expect((await POST(request)).status).toBe(403); expect(boundary.store).not.toHaveBeenCalled();
    const cross = upload(); cross.headers.set('Sec-Fetch-Site', 'cross-site'); expect((await POST(cross)).status).toBe(403);
  });
  it('passes a bounded file and explicit company/resource binding to durable storage', async () => {
    const response = await POST(upload()); expect(response.status).toBe(201); expect(response.headers.get('cache-control')).toContain('no-store');
    expect(boundary.store).toHaveBeenCalledWith(expect.objectContaining({ expectedCompanyId: company, resourceType: 'asset', resourceId: 'asset-a', key: id, name: 'Pump.png', declaredType: 'image/png', bytes: expect.any(Uint8Array) }));
    expect((await response.json()).file).toEqual(saved);
  });
  it('rejects an oversized stream before multipart parsing or storage', async () => {
    const request = new Request(`${origin}/api/facility/evidence`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'multipart/form-data; boundary=limit' }, body: new Uint8Array(FACILITY_EVIDENCE_MAX_BYTES + 65537) });
    expect((await POST(request)).status).toBe(413); expect(boundary.store).not.toHaveBeenCalled();
  });
  it('requires exactly one file and rejects unrelated caller-controlled fields', async () => {
    const request = upload(); const form = await request.formData(); form.set('tenantId', 'different-company');
    expect((await POST(new Request(request.url, { method: 'POST', headers: { Origin: origin }, body: form }))).status).toBe(400); expect(boundary.store).not.toHaveBeenCalled();
  });
  it('lists only a valid resource query and gives storage errors no secret details', async () => {
    expect((await GET(new Request(`${origin}/api/facility/evidence?resourceType=asset&resourceId=asset-a`))).status).toBe(200);
    expect((await GET(new Request(`${origin}/api/facility/evidence?resourceType=tenant&resourceId=other`))).status).toBe(400);
    boundary.store.mockRejectedValue(new Error('PRIVATE-DATABASE-URL-or-secret'));
    const response = await POST(upload()); expect(response.status).toBe(503); expect(await response.text()).not.toContain('PRIVATE-DATABASE');
  });
  it('serves private bytes with restrictive headers and downloads PDFs as attachments', async () => {
    boundary.read.mockResolvedValueOnce({ file: saved, bytes: new Uint8Array(12) });
    const image = await download(new Request(`${origin}${saved.url}`), { params: Promise.resolve({ id }) });
    expect(image.status).toBe(200); expect(image.headers.get('cache-control')).toBe('private, no-store'); expect(image.headers.get('x-content-type-options')).toBe('nosniff'); expect(image.headers.get('content-security-policy')).toContain("default-src 'none'");
    boundary.read.mockResolvedValueOnce({ file: { ...saved, kind: 'document', name: 'Report.pdf', contentType: 'application/pdf' }, bytes: new Uint8Array(12) });
    const document = await download(new Request(`${origin}${saved.url}`), { params: Promise.resolve({ id }) });
    expect(document.headers.get('content-disposition')).toBe('attachment; filename="Report.pdf"');
    boundary.read.mockRejectedValueOnce(new FacilityEvidenceError('PRIVATE-RESOURCE', 404));
    const missing = await download(new Request(`${origin}${saved.url}`), { params: Promise.resolve({ id }) });
    expect(missing.status).toBe(404); expect(await missing.text()).not.toContain('PRIVATE-RESOURCE');
  });
});
