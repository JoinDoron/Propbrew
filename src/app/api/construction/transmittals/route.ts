import { nativeRequestOriginAllowed } from '@/server/auth/mode';
import { issueExternalTransmittal } from '@/server/construction/transmittal-delivery';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!nativeRequestOriginAllowed(request)) return Response.json({ error: 'Open this action from your Propbrew workspace.' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Send JSON.' }, { status: 415 });
  try {
    const input = await request.json();
    const result = await issueExternalTransmittal(input);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'The transmittal could not be issued.' }, { status: 503 }); }
}
