import 'server-only';
import { withTenant } from '@/server/db';

export type PaymentEvent = { provider: 'paystack' | 'flutterwave'; eventId: string; tenantId: string; reference: string; amountMinor: number; currency: string; status: string; rawPayload: unknown };

/** Persist a verified provider event. The database primary key makes retries safe. */
export async function persistPaymentEvent(event: PaymentEvent): Promise<'stored' | 'duplicate' | 'memory'> {
  const validTenant = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.tenantId);
  if (!process.env.DATABASE_URL || !validTenant) {
    if (process.env.NODE_ENV === 'production') throw new Error('Durable payment storage is not configured.');
    return 'memory';
  }
  const result = await withTenant(event.tenantId, (query) => query`
    insert into payment_events (provider, event_id, tenant_id, reference, amount_minor, currency, status, raw_payload)
    values (${event.provider}, ${event.eventId}, ${event.tenantId}::uuid, ${event.reference}, ${event.amountMinor}, ${event.currency}, ${event.status}, ${JSON.stringify(event.rawPayload)}::jsonb)
    on conflict (provider, event_id) do nothing returning event_id
  `) as Array<{ event_id: string }>;
  return result.length ? 'stored' : 'duplicate';
}

export type BankLine = { date: string; reference: string; amountMinor: number; direction: 'credit' | 'debit'; narration: string };
export function parseBankCsv(csv: string): BankLine[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || lines.length > 10001) throw new Error('Bank statement must contain a header and up to 10,000 rows.');
  const header = lines.shift()!.toLowerCase().split(',').map((x) => x.trim());
  const required = ['date', 'reference', 'amount', 'direction'];
  if (required.some((field) => !header.includes(field))) throw new Error('Statement requires date, reference, amount, and direction columns.');
  const index = (field: string) => header.indexOf(field);
  return lines.map((line, row) => {
    const cells = line.split(',').map((x) => x.trim());
    const direction = cells[index('direction')] as BankLine['direction'];
    const amount = Number(cells[index('amount')]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[index('date')]) || !cells[index('reference')] || !Number.isInteger(amount) || amount < 0 || !['credit', 'debit'].includes(direction)) throw new Error(`Invalid bank statement row ${row + 2}.`);
    return { date: cells[index('date')], reference: cells[index('reference')], amountMinor: amount, direction, narration: cells[header.indexOf('narration')] ?? '' };
  });
}

export type ReconciliationMatch = BankLine & { settlementId?: string; paymentEventId?: string; status: 'matched' | 'unmatched' };

/** Store an uploaded statement line; approval is deliberately separate. */
export async function persistSettlementLines(tenantId: string, lines: BankLine[]): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error('A real tenant UUID is required for settlement reconciliation.');
  await withTenant(tenantId, (query) => query`
    insert into settlement_lines (tenant_id, statement_ref, statement_date, amount_minor, direction, narration)
    select ${tenantId}::uuid, x.reference, x.date::date, x.amount_minor, x.direction, x.narration
    from jsonb_to_recordset(${JSON.stringify(lines)}::jsonb) as x(date text, reference text, amount_minor bigint, direction text, narration text)
    on conflict (tenant_id, statement_ref) do nothing
  `);
}

export async function reconcileStoredSettlements(tenantId: string): Promise<unknown[]> {
  return withTenant(tenantId, (query) => query`
    select s.id, s.statement_ref, s.statement_date, s.amount_minor, s.direction, s.narration,
      p.provider, p.event_id, p.status as payment_status,
      case when p.event_id is null then 'unmatched' else 'matched' end as match_status
    from settlement_lines s
    left join payment_events p on p.tenant_id = s.tenant_id and p.reference = s.statement_ref and p.amount_minor = s.amount_minor
    where s.tenant_id = ${tenantId}::uuid
    order by s.statement_date desc, s.created_at desc
  `);
}

export async function approveSettlement(tenantId: string, settlementId: string, actorId: string, approve: boolean): Promise<void> {
  await withTenant(tenantId, (query) => query`
    update settlement_lines set status = ${approve ? 'approved' : 'rejected'}, approved_by = ${actorId}, approved_at = now()
    where tenant_id = ${tenantId}::uuid and id = ${settlementId}::uuid and status in ('matched','unmatched')
  `);
}

export async function requestPaymentAdjustment(input: { tenantId: string; provider: string; reference: string; kind: 'refund' | 'chargeback' | 'partial_payment'; amountMinor: number; reason: string; requestedBy: string }): Promise<string> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('Adjustment amount must be a positive integer in minor units.');
  const rows = await withTenant(input.tenantId, (query) => query`
    insert into payment_adjustments (tenant_id, provider, reference, kind, amount_minor, reason, requested_by)
    values (${input.tenantId}::uuid, ${input.provider}, ${input.reference}, ${input.kind}, ${input.amountMinor}, ${input.reason}, ${input.requestedBy})
    returning id
  `) as Array<{ id: string }>;
  return rows[0].id;
}

export async function approvePaymentAdjustment(tenantId: string, id: string, actorId: string): Promise<void> {
  await withTenant(tenantId, (query) => query`
    update payment_adjustments set status = 'approved', approved_by = ${actorId}, approved_at = now()
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'pending'
  `);
}

export async function configureSettlementAccount(input: { tenantId: string; provider: string; accountName: string; accountNumberLast4: string; providerAccountRef?: string; currency?: string }): Promise<string> {
  if (!/^\d{4}$/.test(input.accountNumberLast4)) throw new Error('Only the final four account digits may be stored.');
  const rows = await withTenant(input.tenantId, (query) => query`
    insert into tenant_settlement_accounts (tenant_id, provider, account_name, account_number_last4, provider_account_ref, currency)
    values (${input.tenantId}::uuid, ${input.provider}, ${input.accountName}, ${input.accountNumberLast4}, ${input.providerAccountRef ?? null}, ${input.currency ?? 'NGN'})
    on conflict (tenant_id, provider, provider_account_ref) do update set account_name = excluded.account_name, account_number_last4 = excluded.account_number_last4, is_active = true
    returning id
  `) as Array<{ id: string }>;
  return rows[0].id;
}
