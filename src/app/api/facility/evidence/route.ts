import { z } from 'zod';
import { FACILITY_EVIDENCE_MAX_BYTES, facilityEvidenceBindingSchema, facilityEvidenceResourceSchema } from '@/domain/facility/evidence';
import { nativeRequestOriginAllowed } from '@/server/auth/mode';
import { FacilityEvidenceError, listStoredFacilityEvidence, storeFacilityEvidence } from '@/server/facility/evidence';
export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const failure = (error: unknown) => error instanceof FacilityEvidenceError ? reply({ error: error.message }, error.status) : reply({ error: 'The evidence service is unavailable. Your file has not been acknowledged as saved.' }, 503);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = z.object({ resourceType: facilityEvidenceResourceSchema, resourceId: z.string().trim().min(1).max(200) }).strict().safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return reply({ error: 'Choose an asset or compliance obligation.' }, 400);
  try { return reply({ ok: true, files: await listStoredFacilityEvidence(parsed.data.resourceType, parsed.data.resourceId) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!nativeRequestOriginAllowed(request)) return reply({ error: 'Upload from your Propbrew workspace.' }, 403);
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return reply({ error: 'A multipart file upload is required.' }, 400);
  const key = request.headers.get('Idempotency-Key') ?? '';
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'A file is required.' }, 400);
  try {
    let size = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > FACILITY_EVIDENCE_MAX_BYTES + 65536) { await reader.cancel(); return reply({ error: 'Choose a file of at most 2 MB.' }, 413); }
      chunks.push(part.value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': contentType } }).formData();
    const fields = Object.fromEntries([...form.entries()].filter(([name]) => name !== 'file'));
    const parsed = facilityEvidenceBindingSchema.safeParse(fields);
    const file = form.get('file');
    if (!parsed.success || [...form.keys()].length !== 4 || !(file instanceof File)) return reply({ error: 'Provide one file and its current company and resource binding.' }, 400);
    if (!file.size || file.size > FACILITY_EVIDENCE_MAX_BYTES) return reply({ error: 'Choose a non-empty file of at most 2 MB.' }, 413);
    const saved = await storeFacilityEvidence({ ...parsed.data, key, name: file.name, declaredType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return reply({ ok: true, file: saved }, 201);
  } catch (error) { return failure(error); }
  finally { reader.releaseLock(); }
}
