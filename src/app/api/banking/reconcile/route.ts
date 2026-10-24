import { NextResponse } from 'next/server';
import { getActor } from '@/server/session';
import { parseBankCsv, persistSettlementLines, reconcileStoredSettlements } from '@/server/payments';
import { repos } from '@/server/data';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await getActor();
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('text/csv')) return NextResponse.json({ error: 'Content-Type must be text/csv.' }, { status: 415 });
  try {
    const lines = parseBankCsv(await req.text());
    const durableTenant = actor.tenantId;
    const durable = Boolean(durableTenant && process.env.DATABASE_URL && /^[0-9a-f-]{36}$/i.test(durableTenant));
    if (durable && durableTenant) await persistSettlementLines(durableTenant, lines);
    if (durable && durableTenant) return NextResponse.json({ ok: true, total: lines.length, lines: await reconcileStoredSettlements(durableTenant) });
    const invoices = repos.invoices.list(actor, { limit: 5000 }).items;
    const matches = lines.map((line) => {
      const invoice = invoices.find((candidate) => candidate.ref === line.reference || candidate.id === line.reference);
      return { ...line, match: invoice ? { invoiceId: invoice.id, status: invoice.status, expectedMinor: invoice.amount.minor } : null };
    });
    return NextResponse.json({ ok: true, total: matches.length, matched: matches.filter((line) => line.match).length, unmatched: matches.filter((line) => !line.match).length, lines: matches });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid statement.' }, { status: 400 });
  }
}
