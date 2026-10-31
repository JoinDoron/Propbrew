import { z } from 'zod';
import { nativeRequestOriginAllowed } from '@/server/auth/mode';
import { ConstructionModelError, exportConstructionBcf, importConstructionBcf } from '@/server/construction/models';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const failure = (error: unknown) => error instanceof ConstructionModelError ? json({ error: error.message }, error.status) : json({ error: 'BCF exchange is unavailable.' }, 503);
const schema = z.object({ expectedCompanyId: z.string().uuid(), projectId: z.string().min(1).max(200), workPackageId: z.string().min(1).max(200).optional() }).strict();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url), projectId = url.searchParams.get('projectId') ?? '';
    if (url.searchParams.size !== 1 || !projectId || projectId.length > 200) return json({ error: 'Choose a project.' }, 400);
    const result = await exportConstructionBcf(projectId);
    return new Response(Buffer.from(result.bytes), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${result.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-BCF-Topics': String(result.count) } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!nativeRequestOriginAllowed(request)) return json({ error: 'Import from your Propbrew workspace.' }, 403);
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return json({ error: 'Choose a BCFZIP file.' }, 400);
  const reader = request.body?.getReader(); if (!reader) return json({ error: 'Choose a BCFZIP file.' }, 400);
  try {
    let size = 0; const chunks: Uint8Array[] = [];
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > 4 * 1024 * 1024 + 65536) { await reader.cancel(); return json({ error: 'BCFZIP must be at most 4 MB.' }, 413); }
      chunks.push(part.value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': contentType } }).formData();
    const keys = [...form.keys()];
    if (keys.some((key) => !['expectedCompanyId', 'projectId', 'workPackageId', 'file'].includes(key)) || new Set(keys).size !== keys.length) return json({ error: 'Provide one BCFZIP file and its target project.' }, 400);
    const file = form.get('file'), parsed = schema.safeParse(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'file')));
    if (!parsed.success || !(file instanceof File) || !/\.bcfzip$/i.test(file.name) || file.size < 22 || file.size > 4 * 1024 * 1024) return json({ error: 'Choose a valid BCFZIP file of at most 4 MB.' }, 400);
    const result = await importConstructionBcf({ ...parsed.data, bytes: new Uint8Array(await file.arrayBuffer()) });
    return json({ ok: true, ...result }, 201);
  } catch (error) { return failure(error); }
  finally { reader.releaseLock(); }
}
