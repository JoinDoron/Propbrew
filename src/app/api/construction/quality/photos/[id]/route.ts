import { QualityPhotoError, readQualityPhoto } from '@/server/construction/quality-photos';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { file, bytes } = await readQualityPhoto((await context.params).id);
    return new Response(bytes as BodyInit, { headers: {
      'Content-Type': file.contentType, 'Content-Length': String(file.size),
      'Content-Disposition': `inline; filename="${file.name}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    } });
  } catch (error) {
    const status = error instanceof QualityPhotoError ? error.status : 503;
    return Response.json({ error: status === 401 ? 'Sign in and choose your company.' : 'Photo unavailable.' }, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
}
