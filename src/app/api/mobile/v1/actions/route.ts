import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/server/session';
import { once } from '@/server/idempotency';
import { raiseRequest } from '@/server/actions/resident-requests';
import { createBooking } from '@/server/actions/resident-bookings';
import { payChargeFromWallet, topUpWallet } from '@/server/actions/resident-home';
import { raiseSos } from '@/server/actions/transitions';

export const runtime = 'nodejs';

const payload = z.discriminatedUnion('op', [
  z.object({ op: z.literal('request.create'), title: z.string().trim().min(2).max(160), description: z.string().trim().max(4000).optional() }),
  z.object({ op: z.literal('booking.create'), amenityId: z.string().min(1).max(160), slotISO: z.iso.datetime(), expectedUnitId: z.string().min(1).max(160) }),
  z.object({ op: z.literal('wallet.topup'), unitId: z.string().min(1).max(160), amountNaira: z.number().positive().max(10_000_000) }),
  z.object({ op: z.literal('invoice.pay'), ref: z.string().min(1).max(80) }),
  z.object({ op: z.literal('sos.raise') }),
]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (!session.actor.roles.includes('resident')) return NextResponse.json({ error: 'A resident profile is required.' }, { status: 403 });
  const key = request.headers.get('idempotency-key');
  if (!key || !z.uuid().safeParse(key).success) return NextResponse.json({ error: 'A valid Idempotency-Key is required.' }, { status: 400 });
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the submitted details.', issues: parsed.error.issues }, { status: 400 });
  try {
    const result = await once(session.actor.tenantId ?? session.actor.userId, key, async () => {
      const input = parsed.data;
      if (input.op === 'request.create') return raiseRequest({ title: input.title, description: input.description });
      if (input.op === 'booking.create') return createBooking(input.amenityId, input.slotISO, { expectedCompanyId: session.actor.tenantId!, expectedUnitId: input.expectedUnitId, idempotencyKey: key });
      if (input.op === 'wallet.topup') return topUpWallet(input.unitId, input.amountNaira);
      if (input.op === 'invoice.pay') return payChargeFromWallet(input.ref);
      return raiseSos();
    });
    return NextResponse.json(result, { status: result && typeof result === 'object' && 'ok' in result && result.ok === false ? 422 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The action could not be completed.' }, { status: 400 });
  }
}
