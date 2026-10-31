import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODEL_MAX_BYTES } from '@/domain/construction/model-clashes';

const boundary = vi.hoisted(() => ({ store: vi.fn(), read: vi.fn(), detect: vi.fn() }));
vi.mock('@/server/construction/models', () => ({ storeConstructionModel: boundary.store, readConstructionModel: boundary.read,
  detectConstructionClashes: boundary.detect,
  ConstructionModelError: class extends Error { constructor(message: string, readonly status = 400) { super(message); } } }));
import { ConstructionModelError } from '@/server/construction/models';
import { POST as upload } from '@/app/api/construction/models/route';
import { POST as detect } from '@/app/api/construction/models/detect/route';
import { GET as download } from '@/app/api/construction/models/[id]/route';

const origin = 'https://model-test.example', company = '46a4660b-90d2-478b-89b3-d516779bded2';
const first = '79df9bb2-3116-4d67-88b5-89f5e7b75108', second = '8aee9bb2-3116-4d67-88b5-89f5e7b75109';
const modelBytes = new TextEncoder().encode('o Beam\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 2 4\n');
function uploadRequest() {
  const form = new FormData(); form.set('expectedCompanyId', company); form.set('projectId', 'cp-cedar');
  form.set('workPackageId', 'pack-structure'); form.set('discipline', 'Structure'); form.set('file', new File([modelBytes], 'structure.obj'));
  return new Request(`${origin}/api/construction/models`, { method: 'POST', headers: { Origin: origin, 'Idempotency-Key': first }, body: form });
}
function detectRequest() { return new Request(`${origin}/api/construction/models/detect`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ expectedCompanyId: company, projectId: 'cp-cedar', modelAId: first, modelBId: second, toleranceMm: 5 }) }); }
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('BETTER_AUTH_URL', origin); vi.stubEnv('PROPBREW_AUTH_ORIGINS', '');
  boundary.store.mockResolvedValue({ id: first }); boundary.detect.mockResolvedValue({ id: 'run-1', candidates: 2, created: 2 }); });
afterEach(() => vi.unstubAllEnvs());

describe('Private construction model routes', () => {
  it('bounds uploads and binds the company, project and work package', async () => {
    expect((await upload(uploadRequest())).status).toBe(201);
    expect(boundary.store).toHaveBeenCalledWith(expect.objectContaining({ expectedCompanyId: company, projectId: 'cp-cedar', workPackageId: 'pack-structure', key: first, bytes: expect.any(Uint8Array) }));
    boundary.store.mockClear();
    const foreign = uploadRequest(); foreign.headers.set('Origin', 'https://other.example');
    expect((await upload(foreign)).status).toBe(403);
    const huge = new Request(`${origin}/api/construction/models`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'multipart/form-data; boundary=limit' }, body: new Uint8Array(MODEL_MAX_BYTES + 65537) });
    expect((await upload(huge)).status).toBe(413);
    expect(boundary.store).not.toHaveBeenCalled();
  });
  it('rejects cross-origin or malformed scan requests before geometry work', async () => {
    expect((await detect(detectRequest())).status).toBe(201);
    expect(boundary.detect).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'cp-cedar', modelAId: first, modelBId: second, toleranceMm: 5 }));
    boundary.detect.mockClear();
    const foreign = detectRequest(); foreign.headers.set('Origin', 'https://other.example');
    expect((await detect(foreign)).status).toBe(403);
    const malformed = detectRequest();
    const invalid = new Request(malformed, { body: JSON.stringify({ modelAId: first }) });
    expect((await detect(invalid)).status).toBe(400);
    expect(boundary.detect).not.toHaveBeenCalled();
  });
  it('serves private model bytes as attachments without exposing internal errors', async () => {
    boundary.read.mockResolvedValueOnce({ model: { id: first, name: 'structure.obj', format: 'obj', size: modelBytes.length }, bytes: modelBytes });
    const response = await download(new Request(`${origin}/api/construction/models/${first}`), { params: Promise.resolve({ id: first }) });
    expect(response.status).toBe(200); expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    boundary.read.mockRejectedValueOnce(new ConstructionModelError('private project name', 404));
    const missing = await download(new Request(`${origin}/api/construction/models/${first}`), { params: Promise.resolve({ id: first }) });
    expect(missing.status).toBe(404); expect(await missing.text()).not.toContain('private project name');
  });
});
