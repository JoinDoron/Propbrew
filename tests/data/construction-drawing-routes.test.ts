import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAWING_MAX_BYTES } from '@/domain/construction/drawings';

const boundary = vi.hoisted(() => ({ store: vi.fn(), read: vi.fn() }));
vi.mock('@/server/construction/drawings', () => ({
  storeConstructionDrawing: boundary.store, readConstructionDrawing: boundary.read,
  ConstructionDrawingError: class extends Error { constructor(message: string, readonly status = 400) { super(message); } },
}));
import { ConstructionDrawingError } from '@/server/construction/drawings';
import { POST } from '@/app/api/construction/drawings/route';
import { GET as download } from '@/app/api/construction/drawings/[id]/route';

const origin = 'https://drawing-test.example';
const company = '46a4660b-90d2-478b-89b3-d516779bded2';
const id = '79df9bb2-3116-4d67-88b5-89f5e7b75108';
const bytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
function request() {
  const form = new FormData();
  form.set('expectedCompanyId', company); form.set('projectId', 'cp-cedar'); form.set('mode', 'new');
  form.set('number', 'CED-STR-101'); form.set('title', 'Foundation plan'); form.set('discipline', 'Structural'); form.set('folder', 'Drawings');
  form.set('locationIds', JSON.stringify(['block-a'])); form.set('workPackageIds', JSON.stringify(['structure']));
  form.set('file', new File([bytes], 'Foundation.pdf', { type: 'application/pdf' }));
  return new Request(`${origin}/api/construction/drawings`, { method: 'POST', headers: { Origin: origin, 'Idempotency-Key': id }, body: form });
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('BETTER_AUTH_URL', origin); vi.stubEnv('PROPBREW_AUTH_ORIGINS', ''); boundary.store.mockResolvedValue({ id, docId: 'doc-a', number: 'CED-STR-101', revision: 'A', url: `/api/construction/drawings/${id}` }); });
afterEach(() => vi.unstubAllEnvs());

describe('Construction drawing routes', () => {
  it('rejects foreign origins and oversized request bodies before storage', async () => {
    const foreign = request(); foreign.headers.set('Origin', 'https://other.example');
    expect((await POST(foreign)).status).toBe(403);
    expect(boundary.store).not.toHaveBeenCalled();
    const huge = new Request(`${origin}/api/construction/drawings`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'multipart/form-data; boundary=limit' }, body: new Uint8Array(DRAWING_MAX_BYTES + 65537) });
    expect((await POST(huge)).status).toBe(413);
    expect(boundary.store).not.toHaveBeenCalled();
  });
  it('binds the PDF to the company, project and requested package', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(boundary.store).toHaveBeenCalledWith(expect.objectContaining({ expectedCompanyId: company, projectId: 'cp-cedar', workPackageIds: ['structure'], key: id, bytes: expect.any(Uint8Array) }));
  });
  it('rejects duplicate and unknown form fields', async () => {
    const form = await request().formData();
    form.append('projectId', 'cp-other');
    expect((await POST(new Request(`${origin}/api/construction/drawings`, { method: 'POST', headers: { Origin: origin }, body: form }))).status).toBe(400);
    form.delete('projectId'); form.set('tenantId', company);
    expect((await POST(new Request(`${origin}/api/construction/drawings`, { method: 'POST', headers: { Origin: origin }, body: form }))).status).toBe(400);
  });
  it('downloads private PDFs as attachments and hides internal failures', async () => {
    boundary.read.mockResolvedValueOnce({ name: 'Foundation.pdf', bytes, size: bytes.length });
    const response = await download(new Request(`${origin}/api/construction/drawings/${id}`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    boundary.read.mockRejectedValueOnce(new ConstructionDrawingError('private project name', 404));
    const missing = await download(new Request(`${origin}/api/construction/drawings/${id}`), { params: Promise.resolve({ id }) });
    expect(missing.status).toBe(404); expect(await missing.text()).not.toContain('private project name');
  });
});
