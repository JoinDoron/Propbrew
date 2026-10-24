import { NextResponse } from 'next/server';
import { timingSafeSignature } from '@/server/integrations/webhooks';
import { persistPaymentEvent } from '@/server/payments';
import { durableAudit } from '@/server/audit';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const raw = await req.text();
  if (!timingSafeSignature(raw, req.headers.get('x-paystack-signature'), process.env.PAYSTACK_SECRET_KEY)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; amount?: number; currency?: string } };
  const eventId = req.headers.get('x-paystack-event-id') ?? `${event.event ?? 'unknown'}:${event.data?.reference ?? 'unknown'}`;
  const tenantId = process.env.PILOT_TENANT_UUID;
  if (!tenantId) return NextResponse.json({ error: 'Payment tenant is not configured.' }, { status: 503 });
  const result = await persistPaymentEvent({ provider: 'paystack', eventId, tenantId, reference: event.data?.reference ?? '', amountMinor: event.data?.amount ?? 0, currency: event.data?.currency ?? 'NGN', status: event.event ?? 'received', rawPayload: event }).catch(() => null);
  if (!result) return NextResponse.json({ error: 'Payment event could not be stored. Retry later.' }, { status: 503, headers: { 'Retry-After': '60' } });
  await durableAudit({ tenantId, actorSubject: `paystack:${eventId}`, action: 'payment.webhook_verified', entity: 'payment_event', entityId: eventId, payload: { reference: event.data?.reference, status: event.event, result } });
  console.log(JSON.stringify({ level: 'info', message: 'paystack_webhook_processed', event: event.event, reference: event.data?.reference, result }));
  return NextResponse.json({ received: true, duplicate: result === 'duplicate' });
}
