import { NextResponse } from 'next/server';
import { getSession } from '@/server/session';
import { withDurableRead } from '@/server/data/durable-records';
import { mobileTenantBootstrap } from '@/server/mobile/bootstrap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (!session.actor.roles.includes('resident')) return NextResponse.json({ error: 'A resident profile is required.' }, { status: 403 });
  const data = await withDurableRead(async () => mobileTenantBootstrap(session.actor, session.label));
  return NextResponse.json(data, { headers: { 'cache-control': 'private, no-store' } });
}
