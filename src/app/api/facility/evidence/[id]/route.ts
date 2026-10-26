import { FacilityEvidenceError, readStoredFacilityEvidence } from '@/server/facility/evidence';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { file, bytes } = await readStoredFacilityEvidence((await context.params).id);
    return new Response(bytes as BodyInit, { headers: {
      'Content-Type': file.contentType, 'Content-Length': String(file.size),
      'Content-Disposition': `${file.kind === 'image' ? 'inline' : 'attachment'}; filename="${file.name}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    } });
  } catch (error) {
    const status = error instanceof FacilityEvidenceError ? error.status : 503;
    return Response.json({ error: status === 401 ? 'Sign in and choose your company.' : 'File unavailable.' }, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
}
