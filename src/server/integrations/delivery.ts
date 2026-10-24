import 'server-only';
import crypto from 'node:crypto';
import { withTenant } from '@/server/db';
import { sendEmail, sendSms, sendWhatsApp } from './communications';

type Channel = 'sms' | 'email' | 'whatsapp';
type Consent = { subjectId: string; purpose: string; grantedAt: string; withdrawnAt?: string };
const hashRecipient = (recipient: string) => crypto.createHash('sha256').update(recipient).digest('hex');

export async function deliver(input: { tenantId: string; channel: Channel; recipient: string; body: string; purpose: string; consent?: Consent }): Promise<{ status: 'sent'; providerId: string }> {
  if (!input.body.trim() || input.body.length > 4000) throw new Error('Message body is invalid.');
  if (input.purpose === 'marketing' && (!input.consent?.grantedAt || input.consent.withdrawnAt)) throw new Error('Marketing consent is required.');
  let result: { id: string };
  if (input.channel === 'sms') result = await sendSms({ to: input.recipient, body: input.body, purpose: input.purpose });
  else if (input.channel === 'email') result = await sendEmail({ to: input.recipient, body: input.body, purpose: input.purpose });
  else result = await sendWhatsApp({ to: input.recipient, body: input.body, purpose: input.purpose });
  if (process.env.DATABASE_URL && /^[0-9a-f-]{36}$/i.test(input.tenantId)) {
    await withTenant(input.tenantId, (query) => query`insert into communication_deliveries (tenant_id, channel, recipient_hash, purpose, provider_id, status, delivered_at) values (${input.tenantId}::uuid, ${input.channel}, ${hashRecipient(input.recipient)}, ${input.purpose}, ${result.id}, 'sent', now())`);
  }
  return { status: 'sent', providerId: result.id };
}

export async function enqueueDelivery(input: { tenantId: string; channel: Channel; recipient: string; body: string; purpose: string; subjectId?: string; emergency?: boolean; requiresApproval?: boolean }): Promise<string> {
  const quiet = input.subjectId && !input.emergency ? await withTenant(input.tenantId, (query) => query`select enabled, quiet_start, quiet_end from communication_preferences where tenant_id = ${input.tenantId}::uuid and subject_id = ${input.subjectId} and channel = ${input.channel} limit 1`) as Array<{ enabled: boolean; quiet_start: string | null; quiet_end: string | null }> : [];
  if (quiet[0]?.enabled === false) throw new Error('Recipient has disabled this notification channel.');
  const rows = await withTenant(input.tenantId, (query) => query`
    insert into communication_queue (tenant_id, channel, recipient, body, purpose, requires_approval, status)
    values (${input.tenantId}::uuid, ${input.channel}, ${input.recipient}, ${input.body}, ${input.purpose}, ${input.requiresApproval ?? false}, ${input.requiresApproval ? 'blocked_approval' : 'queued'}) returning id
  `) as Array<{ id: string }>;
  return rows[0].id;
}

export async function approveQueuedDelivery(tenantId: string, id: string, actorId: string): Promise<void> {
  await withTenant(tenantId, (query) => query`update communication_queue set requires_approval = false, approved_by = ${actorId}, approved_at = now(), status = 'queued' where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'blocked_approval'`);
}

export async function recordDeliveryCallback(input: { tenantId: string; provider: string; providerEventId: string; status: string; payload: unknown }): Promise<void> {
  await withTenant(input.tenantId, (query) => query`
    insert into communication_delivery_events (tenant_id, provider, provider_event_id, status, payload)
    values (${input.tenantId}::uuid, ${input.provider}, ${input.providerEventId}, ${input.status}, ${JSON.stringify(input.payload)}::jsonb)
    on conflict (provider, provider_event_id) do nothing
  `);
}

export async function processDeliveryQueue(tenantId: string, limit = 25): Promise<{ sent: number; failed: number; deadLettered: number }> {
  const rows = await withTenant(tenantId, (query) => query`
    select id, channel, recipient, body, purpose, attempts from communication_queue
    where tenant_id = ${tenantId}::uuid and status = 'queued' and next_attempt_at <= now()
    order by created_at asc limit ${Math.max(1, Math.min(limit, 100))}
  `) as Array<{ id: string; channel: Channel; recipient: string; body: string; purpose: string; attempts: number }>;
  let sent = 0; let failed = 0; let deadLettered = 0;
  for (const row of rows) {
    try {
      await withTenant(tenantId, (query) => query`update communication_queue set status = 'processing', attempts = attempts + 1 where tenant_id = ${tenantId}::uuid and id = ${row.id}::uuid and status = 'queued'`);
      const result = await deliver({ tenantId, channel: row.channel, recipient: row.recipient, body: row.body, purpose: row.purpose });
      await withTenant(tenantId, (query) => query`update communication_queue set status = 'sent', sent_at = now() where tenant_id = ${tenantId}::uuid and id = ${row.id}::uuid`);
      sent++; void result;
    } catch (error) {
      const attempts = row.attempts + 1;
      const terminal = attempts >= 5;
      await withTenant(tenantId, (query) => query`update communication_queue set status = ${terminal ? 'dead_letter' : 'queued'}, last_error = ${error instanceof Error ? error.message : 'Delivery failed'}, next_attempt_at = now() + (${Math.min(3600, 2 ** attempts * 30)} || ' seconds')::interval where tenant_id = ${tenantId}::uuid and id = ${row.id}::uuid`);
      failed++; if (terminal) deadLettered++;
    }
  }
  return { sent, failed, deadLettered };
}
