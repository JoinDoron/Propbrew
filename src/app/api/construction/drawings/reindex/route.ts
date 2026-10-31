import { z } from 'zod';
import { nativeRequestOriginAllowed } from '@/server/auth/mode';
import { ConstructionDrawingError, reindexConstructionDrawings } from '@/server/construction/drawings';

export const runtime = 'nodejs';
const schema = z.object({ projectId: z.string().min(1).max(200) }).strict();
export async function POST(request: Request) {
  if (!nativeRequestOriginAllowed(request)) return Response.json({ error: 'Index from your Propbrew workspace.' }, { status: 403 });
  try {
    if (Number(request.headers.get('Content-Length') ?? 0) > 1024) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const input = schema.safeParse(await request.json());
    if (!input.success) return Response.json({ error: 'Choose a project.' }, { status: 400 });
    return Response.json({ ok: true, ...await reindexConstructionDrawings(input.data.projectId) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof ConstructionDrawingError ? error.message : 'Document indexing is unavailable.' },
      { status: error instanceof ConstructionDrawingError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
