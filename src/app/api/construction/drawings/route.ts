import { DRAWING_MAX_BYTES, drawingUploadSchema } from '@/domain/construction/drawings';
import { nativeRequestOriginAllowed } from '@/server/auth/mode';
import { ConstructionDrawingError, storeConstructionDrawing } from '@/server/construction/drawings';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const failure = (error: unknown) => error instanceof ConstructionDrawingError ? reply({ error: error.message }, error.status) : reply({ error: 'Drawing storage is unavailable. The file has not been saved.' }, 503);
const fieldNames = new Set(['expectedCompanyId', 'projectId', 'mode', 'docId', 'number', 'title', 'discipline', 'folder', 'changeNote', 'locationIds', 'workPackageIds', 'file']);

export async function POST(request: Request) {
  if (!nativeRequestOriginAllowed(request)) return reply({ error: 'Upload from your Propbrew workspace.' }, 403);
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return reply({ error: 'A multipart drawing upload is required.' }, 400);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'Choose a drawing PDF.' }, 400);
  try {
    let size = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > DRAWING_MAX_BYTES + 65536) { await reader.cancel(); return reply({ error: 'Choose a PDF of at most 15 MB.' }, 413); }
      chunks.push(part.value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': contentType } }).formData();
    const keys = [...form.keys()];
    if (keys.some((key) => !fieldNames.has(key)) || keys.filter((key) => key === 'file').length !== 1 || new Set(keys).size !== keys.length) return reply({ error: 'Provide one drawing and its project details.' }, 400);
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 32 || file.size > DRAWING_MAX_BYTES) return reply({ error: 'Choose a non-empty PDF of at most 15 MB.' }, 413);
    let locationIds: unknown; let workPackageIds: unknown;
    try { locationIds = JSON.parse(String(form.get('locationIds') ?? '[]')); workPackageIds = JSON.parse(String(form.get('workPackageIds') ?? '[]')); }
    catch { return reply({ error: 'Check the project location and package links.' }, 400); }
    const values = Object.fromEntries([...form.entries()].filter(([name]) => name !== 'file' && name !== 'locationIds' && name !== 'workPackageIds'));
    const parsed = drawingUploadSchema.safeParse({ ...values, locationIds, workPackageIds });
    if (!parsed.success) return reply({ error: 'Check the drawing details and project links.' }, 400);
    const saved = await storeConstructionDrawing({ ...parsed.data, key: request.headers.get('Idempotency-Key') ?? '', name: file.name, declaredType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return reply({ ok: true, drawing: saved }, 201);
  } catch (error) { return failure(error); }
  finally { reader.releaseLock(); }
}
