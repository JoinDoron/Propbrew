import { nativeRequestOriginAllowed } from '@/server/auth/mode';
import { retryExternalTransmittal } from '@/server/construction/transmittal-delivery';

export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!nativeRequestOriginAllowed(request)) return Response.json({ error: 'Open this action from your Propbrew workspace.' }, { status: 403 });
  try {
    const result = await retryExternalTransmittal((await context.params).id);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'This delivery could not be retried.' }, { status: 503 }); }
}
