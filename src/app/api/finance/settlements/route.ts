import { NextResponse } from 'next/server';
import { getActor } from '@/server/session';
import { assertCan } from '@/lib/authz';
import { approveSettlement } from '@/server/payments';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const actor = await getActor();
  if (!actor.tenantId) return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  assertCan(actor, 'charges_invoicing', 'approve');
  const body = await req.json() as { id?: string; approve?: boolean };
  if (!body.id || typeof body.approve !== 'boolean') return NextResponse.json({ error: 'id and approve are required.' }, { status: 400 });
  await approveSettlement(actor.tenantId, body.id, actor.userId, body.approve);
  return NextResponse.json({ ok: true });
}
