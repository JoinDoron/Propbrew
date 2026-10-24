import { NextResponse } from 'next/server';
import { getActor } from '@/server/session';
import { searchAudit } from '@/server/audit';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor.tenantId || !actor.roles.includes('platform_admin')) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const url = new URL(req.url);
  const rows = await searchAudit(actor.tenantId, { entity: url.searchParams.get('entity') ?? undefined, action: url.searchParams.get('action') ?? undefined, before: url.searchParams.get('before') ?? undefined, limit: Number(url.searchParams.get('limit') ?? 100) });
  if (url.searchParams.get('format') === 'csv') {
    const csv = ['id,actor,action,entity,entity_id,created_at', ...rows.map((row) => { const x = row as Record<string, unknown>; return [x.id, x.actor_subject, x.action, x.entity, x.entity_id, x.created_at].map((v) => JSON.stringify(v ?? '')).join(','); })].join('\n');
    return new Response(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="audit-export.csv"' } });
  }
  return NextResponse.json({ rows });
}
