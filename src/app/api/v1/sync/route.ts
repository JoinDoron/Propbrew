import { NextResponse } from 'next/server';
import { getActor } from '@/server/session';
import { once } from '@/server/idempotency';
import { requiredString } from '@/lib/request-validation';
import { repos } from '@/server/data';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const key = req.headers.get('idempotency-key');
  if (!key) return NextResponse.json({ error: 'Idempotency-Key is required.' }, { status: 400, headers: { 'x-request-id': requestId } });
  try {
    const actor = await getActor();
    const body = await req.json();
    const op = requiredString(body?.op, 'op', 80);
    const result = await once(actor.tenantId ?? 'platform', key, async () => {
      if (op === 'work-orders.list') return repos.workOrders.list(actor, { limit: 100 });
      if (op === 'assets.list') return repos.assets.list(actor, { limit: 100 });
      throw new Error('Unsupported sync operation.');
    });
    return NextResponse.json({ ok: true, result }, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed.' }, { status: 400, headers: { 'x-request-id': requestId } });
  }
}
