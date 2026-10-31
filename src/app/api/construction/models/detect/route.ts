import { z } from 'zod';
import { nativeRequestOriginAllowed } from '@/server/auth/mode';
import { ConstructionModelError, detectConstructionClashes } from '@/server/construction/models';

export const runtime = 'nodejs';
const schema = z.object({ expectedCompanyId: z.string().uuid(), projectId: z.string().min(1).max(200),
  modelAId: z.string().uuid(), modelBId: z.string().uuid(), toleranceMm: z.number().int().min(0).max(1000) }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function POST(request: Request) {
  if (!nativeRequestOriginAllowed(request)) return reply({ error: 'Start the scan from your Propbrew workspace.' }, 403);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Choose two models to compare.' }, 400);
  try {
    const text = await request.text(); if (text.length > 4096) return reply({ error: 'Scan request is too large.' }, 413);
    const parsed = schema.safeParse(JSON.parse(text)); if (!parsed.success) return reply({ error: 'Choose two models from one project and a valid tolerance.' }, 400);
    return reply({ ok: true, run: await detectConstructionClashes(parsed.data) }, 201);
  } catch (error) {
    return error instanceof ConstructionModelError ? reply({ error: error.message }, error.status) : reply({ error: 'The model scan could not complete.' }, 503);
  }
}
