import { ConstructionModelError, readConstructionModel } from '@/server/construction/models';

export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { model, bytes } = await readConstructionModel((await context.params).id);
    return new Response(Buffer.from(bytes), { headers: { 'Content-Type': model.format === 'glb' ? 'model/gltf-binary' : 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${model.name.replace(/["\\\r\n]/g, '_')}"`, 'Content-Length': String(model.size),
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    const status = error instanceof ConstructionModelError ? error.status : 503;
    return Response.json({ error: status === 401 ? 'Sign in and choose your company.' : 'Model unavailable.' }, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
}
