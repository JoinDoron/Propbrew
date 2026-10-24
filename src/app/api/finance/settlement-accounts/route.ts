import { NextResponse } from 'next/server';
import { getActor } from '@/server/session';
import { assertCan } from '@/lib/authz';
import { configureSettlementAccount } from '@/server/payments';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor.tenantId) return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  assertCan(actor, 'charges_invoicing', 'approve');
  const body = await req.json() as Record<string, unknown>;
  try {
    const id = await configureSettlementAccount({ tenantId: actor.tenantId, provider: String(body.provider ?? ''), accountName: String(body.accountName ?? ''), accountNumberLast4: String(body.accountNumberLast4 ?? ''), providerAccountRef: body.providerAccountRef ? String(body.providerAccountRef) : undefined });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid settlement account.' }, { status: 400 }); }
}
