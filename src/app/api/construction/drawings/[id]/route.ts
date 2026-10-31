import { ConstructionDrawingError, readConstructionDrawing } from '@/server/construction/drawings';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const file = await readConstructionDrawing((await context.params).id);
    const inline = new URL(request.url).searchParams.toString() === 'view=1';
    return new Response(file.bytes as BodyInit, { headers: {
      'Content-Type': 'application/pdf', 'Content-Length': String(file.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${file.name}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    } });
  } catch (error) {
    const status = error instanceof ConstructionDrawingError ? error.status : 503;
    return Response.json({ error: status === 401 ? 'Sign in and choose your company.' : 'Drawing unavailable.' }, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
}
