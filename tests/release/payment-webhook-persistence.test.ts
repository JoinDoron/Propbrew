import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ withTenant: vi.fn(), audit: vi.fn() }));
vi.mock('@/server/db', () => ({ withTenant: mocks.withTenant }));
vi.mock('@/server/audit', () => ({ durableAudit: mocks.audit }));

import { persistPaymentEvent, type PaymentEvent } from '@/server/payments';
import { POST as paystack } from '@/app/api/webhooks/paystack/route';
import { POST as flutterwave } from '@/app/api/webhooks/flutterwave/route';

const tenantId = '37b176f9-f106-49e4-904d-0821c8fa744e';
const event: PaymentEvent = { provider: 'paystack', eventId: 'event-1', tenantId, reference: 'payment-1', amountMinor: 125000, currency: 'NGN', status: 'charge.success', rawPayload: {} };
const webhookSecret = 'test-webhook-signature';

function webhookRequest(provider: 'paystack' | 'flutterwave'): Request {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: event.reference, tx_ref: event.reference, amount: 125000, currency: 'NGN' } });
  const headers: Record<string, string> = provider === 'paystack'
    ? { 'x-paystack-signature': createHmac('sha512', webhookSecret).update(body).digest('hex') }
    : { 'verif-hash': webhookSecret };
  return new Request(`https://propbrew.example/api/webhooks/${provider}`, { method: 'POST', headers, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DATABASE_URL', 'unit-test-connection');
  vi.stubEnv('PILOT_TENANT_UUID', tenantId);
  vi.stubEnv('PAYSTACK_SECRET_KEY', webhookSecret);
  vi.stubEnv('FLUTTERWAVE_WEBHOOK_SECRET', webhookSecret);
  mocks.withTenant.mockResolvedValue([{ event_id: event.eventId }]);
  mocks.audit.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('durable payment event persistence', () => {
  it('rejects missing production storage before acknowledging an event', async () => {
    vi.stubEnv('DATABASE_URL', '');
    await expect(persistPaymentEvent(event)).rejects.toThrow('Durable payment storage is not configured.');
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it.each(['t-lekki', '-'.repeat(36), '000000000000000000000000000000000000'])('rejects malformed production tenant %s', async (invalidTenant) => {
    await expect(persistPaymentEvent({ ...event, tenantId: invalidTenant })).rejects.toThrow('Durable payment storage is not configured.');
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('preserves the local demo fallback without claiming durable persistence', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATABASE_URL', '');
    expect(await persistPaymentEvent(event)).toBe('memory');
    vi.stubEnv('DATABASE_URL', 'unit-test-connection');
    expect(await persistPaymentEvent({ ...event, tenantId: 't-lekki' })).toBe('memory');
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it('distinguishes a stored event from an idempotent replay', async () => {
    expect(await persistPaymentEvent(event)).toBe('stored');
    mocks.withTenant.mockResolvedValueOnce([]);
    expect(await persistPaymentEvent(event)).toBe('duplicate');
    expect(mocks.withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
  });
});

describe.each([['paystack', paystack], ['flutterwave', flutterwave]] as const)('%s webhook persistence boundary', (provider, handle) => {
  it.each(['missing database', 'invalid tenant', 'database outage'] as const)('returns retryable 503 for %s without a success audit', async (failure) => {
    if (failure === 'missing database') vi.stubEnv('DATABASE_URL', '');
    if (failure === 'invalid tenant') vi.stubEnv('PILOT_TENANT_UUID', '-'.repeat(36));
    if (failure === 'database outage') mocks.withTenant.mockRejectedValueOnce(new Error('Private database details must stay on the server.'));
    const response = await handle(webhookRequest(provider));
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(await response.json()).toEqual({ error: 'Payment event could not be stored. Retry later.' });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('acknowledges a persisted event and its replay', async () => {
    const first = await handle(webhookRequest(provider));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, duplicate: false });
    mocks.withTenant.mockResolvedValueOnce([]);
    const replay = await handle(webhookRequest(provider));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
    expect(mocks.audit).toHaveBeenCalledTimes(2);
  });

  it('still rejects an unsigned request before any persistence attempt', async () => {
    const response = await handle(new Request('https://propbrew.example/api/webhooks/test', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(400);
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
