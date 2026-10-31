import { createHmac } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { reportHash, reportPdf, reportSpreadsheet } from '@/server/construction/report-export';
import { signTransmittalClaim, verifyTransmittalClaim } from '@/server/construction/transmittal-tokens';
import { verifyResendSignature } from '@/server/integrations/resend-signature';

const originalSecret = process.env.CONSTRUCTION_TRANSMITTAL_SECRET;
afterEach(() => { if (originalSecret === undefined) delete process.env.CONSTRUCTION_TRANSMITTAL_SECRET; else process.env.CONSTRUCTION_TRANSMITTAL_SECRET = originalSecret; });

describe('External document distribution and traceable reports', () => {
  it('accepts only an untampered, unexpired receipt for its tenant and issue', () => {
    process.env.CONSTRUCTION_TRANSMITTAL_SECRET = 'a'.repeat(48);
    const claim = { tenantId: '11111111-1111-4111-8111-111111111111', id: 'tr-new-42', expiresISO: '2027-01-01T00:00:00.000Z' };
    const token = signTransmittalClaim(claim);
    expect(verifyTransmittalClaim(token, Date.parse('2026-12-31'))).toEqual(claim);
    expect(verifyTransmittalClaim(token, Date.parse('2027-01-01'))).toBeNull();
    expect(verifyTransmittalClaim(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBeNull();
  });

  it('verifies provider signatures against the raw body and rejects replayed timestamps', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    const secret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
    const body = '{"type":"email.delivered"}';
    const timestamp = String(Math.floor(now / 1000));
    const signature = createHmac('sha256', Buffer.alloc(32, 7)).update(`evt_1.${timestamp}.${body}`).digest('base64');
    const headers = new Headers({ 'svix-id': 'evt_1', 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` });
    expect(verifyResendSignature(body, headers, secret, now)).toBe(true);
    expect(verifyResendSignature(body + ' ', headers, secret, now)).toBe(false);
    expect(verifyResendSignature(body, headers, secret, now + 6 * 60_000)).toBe(false);
  });

  it('writes inspectable PDF and XLSX exports with identical provenance and escaped source data', async () => {
    const table = { title: 'Document distribution', columns: ['Drawing', 'Recipient'], rows: [['D-01', 'A & B <Contractors>'], ['D-02', 'Client']] };
    const meta = { company: 'Company 1', project: 'P-01', report: 'documents', generatedISO: '2026-10-31T12:00:00Z', exportId: 'exp-1', generatedBy: 'Ada', sourceHash: reportHash(table) };
    const xlsx = unzipSync(reportSpreadsheet(table, meta));
    expect(strFromU8(xlsx['xl/worksheets/sheet1.xml'])).toContain(meta.sourceHash);
    expect(strFromU8(xlsx['xl/worksheets/sheet2.xml'])).toContain('A &amp; B &lt;Contractors&gt;');
    expect(strFromU8(xlsx['xl/worksheets/sheet2.xml'])).toContain('D-02');
    const pdf = await PDFDocument.load(await reportPdf(table, meta));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdf.getSubject()).toContain(meta.sourceHash);
  });
});
