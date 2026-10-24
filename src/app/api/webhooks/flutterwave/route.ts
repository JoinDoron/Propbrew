import { NextResponse } from 'next/server';
import { timingSafeSecret } from '@/server/integrations/webhooks';
import { persistPaymentEvent } from '@/server/payments';
import { durableAudit } from '@/server/audit';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('verif-hash');
  if (!timingSafeSecret(signature, process.env.FLUTTERWAVE_WEBHOOK_SECRET)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  const event = JSON.parse(raw) as { event?: string; data?: { tx_ref?: string; amount?: number; currency?: string } };
  const eventId = req.headers.get('x-flutterwave-event-id') ?? `${event.event ?? 'unknown'}:${event.data?.tx_ref ?? 'unknown'}`;
  const tenantId = process.env.PILOT_TENANT_UUID;
  if (!tenantId) return NextResponse.json({ error: 'Payment tenant is not configured.' }, { status: 503 });
  const result = await persistPaymentEvent({ provider: 'flutterwave', eventId, tenantId, reference: event.data?.tx_ref ?? '', amountMinor: Math.round((event.data?.amount ?? 0) * 100), currency: event.data?.currency ?? 'NGN', status: event.event ?? 'received', rawPayload: event }).catch(() => null);
  if (!result) return NextResponse.json({ error: 'Payment event could not be stored. Retry later.' }, { status: 503, headers: { 'Retry-After': '60' } });
  await durableAudit({ tenantId, actorSubject: `flutterwave:${eventId}`, action: 'payment.webhook_verified', entity: 'payment_event', entityId: eventId, payload: { reference: event.data?.tx_ref, status: event.event, result } });
  console.log(JSON.stringify({ level: 'info', message: 'flutterwave_webhook_processed', event: event.event, reference: event.data?.tx_ref, result }));
  return NextResponse.json({ received: true, duplicate: result === 'duplicate' });
}
