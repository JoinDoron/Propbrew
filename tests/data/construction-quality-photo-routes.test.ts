import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUALITY_PHOTO_MAX_BYTES, qualityPhotoContentType } from '@/domain/construction/quality-photos';
const boundary = vi.hoisted(() => ({ store: vi.fn(), list: vi.fn(), read: vi.fn() }));
vi.mock('@/server/construction/quality-photos', () => ({
  storeQualityPhoto: boundary.store, listQualityPhotos: boundary.list, readQualityPhoto: boundary.read,
  QualityPhotoError: class extends Error { constructor(message: string, readonly status = 400) { super(message); } },
}));
import { QualityPhotoError } from '@/server/construction/quality-photos';
import { POST, GET } from '@/app/api/construction/quality/photos/route';
import { GET as read } from '@/app/api/construction/quality/photos/[id]/route';

const origin = 'https://construction-quality.example';
const company = '88100000-0000-4000-8000-000000000001', id = '88100000-0000-4000-8000-000000000002';
const saved = { id, tenantId: company, projectId: 'project-a', issueId: 'inspection-a', name: 'Finding.png', contentType: 'image/png', size: 64, url: `/api/construction/quality/photos/${id}`, sha256: 'a'.repeat(64), createdAt: '2026-10-31T12:00:00Z', createdBy: 'inspector-a' };
function upload() {
  const form = new FormData(); form.set('expectedCompanyId', company); form.set('issueId', 'inspection-a'); form.set('file', new File([new Uint8Array(64)], 'Finding.png', { type: 'image/png' }));
  return new Request(`${origin}/api/construction/quality/photos`, { method: 'POST', headers: { Origin: origin, 'Idempotency-Key': id }, body: form });
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('BETTER_AUTH_URL', origin); vi.stubEnv('PROPBREW_AUTH_ORIGINS', ''); boundary.store.mockResolvedValue(saved); boundary.list.mockResolvedValue([saved]); });
afterEach(() => vi.unstubAllEnvs());

describe('Construction quality photo request boundary', () => {
  it('requires a same-origin, bounded upload with a company and quality-record binding', async () => {
    const foreign = upload(); foreign.headers.set('Origin', 'https://foreign.example');
    expect((await POST(foreign)).status).toBe(403);
    const good = await POST(upload()); expect(good.status).toBe(201);
    expect(boundary.store).toHaveBeenCalledWith(expect.objectContaining({ expectedCompanyId: company, issueId: 'inspection-a', key: id, bytes: expect.any(Uint8Array) }));
    const extra = upload(); const form = await extra.formData(); form.set('projectId', 'other-project');
    expect((await POST(new Request(extra.url, { method: 'POST', headers: { Origin: origin }, body: form }))).status).toBe(400);
  });
  it('rejects oversized streams and non-image content before acknowledging storage', async () => {
    const large = new Request(`${origin}/api/construction/quality/photos`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'multipart/form-data; boundary=limit' }, body: new Uint8Array(QUALITY_PHOTO_MAX_BYTES + 65537) });
    expect((await POST(large)).status).toBe(413);
    expect(qualityPhotoContentType(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(qualityPhotoContentType(new TextEncoder().encode('%PDF-1.4 sample document'))).toBeNull();
  });
  it('serves only private image bytes and hides storage errors', async () => {
    expect((await GET(new Request(`${origin}/api/construction/quality/photos?issueId=inspection-a`))).status).toBe(200);
    boundary.read.mockResolvedValueOnce({ file: saved, bytes: new Uint8Array(64) });
    const response = await read(new Request(`${origin}${saved.url}`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    boundary.read.mockRejectedValueOnce(new QualityPhotoError('SECRET-DETAIL', 404));
    const missing = await read(new Request(`${origin}${saved.url}`), { params: Promise.resolve({ id }) });
    expect(missing.status).toBe(404); expect(await missing.text()).not.toContain('SECRET-DETAIL');
  });
});
