import { NextResponse } from 'next/server';
import { getActor } from '@/server/session';
import { assertCan } from '@/lib/authz';
import { approvePaymentAdjustment, requestPaymentAdjustment } from '@/server/payments';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor.tenantId) return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  assertCan(actor, 'charges_invoicing', 'approve');
  const body = await req.json() as Record<string, unknown>;
  try {
    const id = await requestPaymentAdjustment({ tenantId: actor.tenantId, provider: String(body.provider ?? ''), reference: String(body.reference ?? ''), kind: body.kind as 'refund' | 'chargeback' | 'partial_payment', amountMinor: Number(body.amountMinor), reason: String(body.reason ?? ''), requestedBy: actor.userId });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid adjustment.' }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const actor = await getActor();
  if (!actor.tenantId) return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  assertCan(actor, 'charges_invoicing', 'approve');
  const body = await req.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  await approvePaymentAdjustment(actor.tenantId, body.id, actor.userId);
  return NextResponse.json({ ok: true });
}
