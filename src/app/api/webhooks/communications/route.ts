import { NextResponse } from 'next/server';
import { recordDeliveryCallback } from '@/server/integrations/delivery';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const secret = process.env.COMMUNICATION_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-communication-secret') !== secret) return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  const body = await req.json() as { tenantId?: string; provider?: string; providerEventId?: string; status?: string } & Record<string, unknown>;
  if (!body.tenantId || !body.provider || !body.providerEventId || !body.status) return NextResponse.json({ error: 'Invalid callback.' }, { status: 400 });
  await recordDeliveryCallback({ tenantId: body.tenantId, provider: body.provider, providerEventId: body.providerEventId, status: body.status, payload: body });
  return NextResponse.json({ ok: true });
}
