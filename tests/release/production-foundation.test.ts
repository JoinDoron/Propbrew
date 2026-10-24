import { describe, expect, it } from 'vitest';
import { timingSafeSecret, timingSafeSignature } from '@/server/integrations/webhooks';
import { requiredString, boundedNumber } from '@/lib/request-validation';
import { createConsent } from '@/server/consent';
import { parseBankCsv } from '@/server/payments';
import { deliver } from '@/server/integrations/delivery';
import { FACILITY_EVALS, scoreGrounding } from '@/server/ai/evaluations';

describe('production foundation contracts', () => {
  it('validates webhook signatures and rejects tampering', () => {
    expect(timingSafeSecret('secret', 'secret')).toBe(true);
    expect(timingSafeSecret('wrong', 'secret')).toBe(false);
    expect(timingSafeSignature('{}', null, 'secret')).toBe(false);
  });
  it('rejects malformed mobile payload values', () => {
    expect(requiredString(' work-orders.list ', 'op')).toBe('work-orders.list');
    expect(() => requiredString('', 'op')).toThrow();
    expect(boundedNumber(5, 'amount', 0, 10)).toBe(5);
    expect(() => boundedNumber(11, 'amount', 0, 10)).toThrow();
  });
  it('creates NDPA consent with an explicit retention deadline', () => {
    const record = createConsent('resident-1', 'ai_assistance');
    expect(record.policyVersion).toBeTruthy();
    expect(Date.parse(record.retentionUntil)).toBeGreaterThan(Date.parse(record.grantedAt));
  });
  it('parses and validates a Nigerian bank statement contract', () => {
    const rows = parseBankCsv('date,reference,amount,direction,narration\n2026-09-30,INV-1,125000,credit,Service charge');
    expect(rows[0]).toMatchObject({ reference: 'INV-1', amountMinor: 125000, direction: 'credit' });
    expect(() => parseBankCsv('date,reference,amount,direction\nnope,,x,credit')).toThrow();
  });
  it('blocks marketing delivery without explicit consent', async () => {
    await expect(deliver({ tenantId: 'tenant-1', channel: 'sms', recipient: '08000000000', body: 'Offer', purpose: 'marketing' })).rejects.toThrow('Marketing consent');
  });
  it('ships AI evaluation cases with measurable grounding scores', () => {
    expect(FACILITY_EVALS.length).toBeGreaterThan(0);
    expect(scoreGrounding('SLA work order collection', ['SLA', 'work order'])).toBe(1);
  });
});
