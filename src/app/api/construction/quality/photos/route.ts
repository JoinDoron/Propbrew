import { z } from 'zod';
import { QUALITY_PHOTO_MAX_BYTES, qualityPhotoBindingSchema } from '@/domain/construction/quality-photos';
import { nativeRequestOriginAllowed } from '@/server/auth/mode';
import { listQualityPhotos, QualityPhotoError, storeQualityPhoto } from '@/server/construction/quality-photos';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const failure = (error: unknown) => error instanceof QualityPhotoError ? reply({ error: error.message }, error.status) : reply({ error: 'Photo storage is unavailable. Your file has not been saved.' }, 503);

export async function GET(request: Request) {
  const parsed = z.object({ issueId: z.string().trim().min(1).max(200) }).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return reply({ error: 'Choose a quality record.' }, 400);
  try { return reply({ ok: true, files: await listQualityPhotos(parsed.data.issueId) }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!nativeRequestOriginAllowed(request)) return reply({ error: 'Upload from your Propbrew workspace.' }, 403);
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return reply({ error: 'A photo upload is required.' }, 400);
  const key = request.headers.get('Idempotency-Key') ?? '';
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: 'Choose a photo.' }, 400);
  try {
    let size = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > QUALITY_PHOTO_MAX_BYTES + 65536) { await reader.cancel(); return reply({ error: 'Choose a photo of at most 2 MB.' }, 413); }
      chunks.push(part.value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': contentType } }).formData();
    const fields = Object.fromEntries([...form.entries()].filter(([name]) => name !== 'file'));
    const parsed = qualityPhotoBindingSchema.safeParse(fields);
    const file = form.get('file');
    if (!parsed.success || [...form.keys()].length !== 3 || !(file instanceof File)) return reply({ error: 'Provide one photo and its company and quality-record binding.' }, 400);
    if (!file.size || file.size > QUALITY_PHOTO_MAX_BYTES) return reply({ error: 'Choose a non-empty photo of at most 2 MB.' }, 413);
    const saved = await storeQualityPhoto({ ...parsed.data, key, name: file.name, declaredType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return reply({ ok: true, file: saved }, 201);
  } catch (error) { return failure(error); }
  finally { reader.releaseLock(); }
}
