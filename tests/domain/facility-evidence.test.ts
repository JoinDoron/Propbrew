import { describe, expect, it } from 'vitest';
import { facilityEvidenceContentType, facilityEvidenceName, FACILITY_EVIDENCE_MAX_BYTES } from '@/domain/facility/evidence';

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1QAAAAASUVORK5CYII=', 'base64'));
describe('bounded stored Facility evidence', () => {
  it('recognises PNG bytes and rejects caller-labelled HTML, SVG, empty and oversized data', () => {
    expect(facilityEvidenceContentType(png)).toBe('image/png');
    for (const bytes of [new Uint8Array(), new TextEncoder().encode('<svg onload="alert(1)"></svg>'), new TextEncoder().encode('<!doctype html><script>alert(1)</script>'), new Uint8Array(FACILITY_EVIDENCE_MAX_BYTES + 1)]) expect(facilityEvidenceContentType(bytes)).toBeNull();
  });
  it('uses a safe filename and the actual content extension for private downloads', () => {
    const name = facilityEvidenceName('../../pump\r\nContent-Type:text/html.svg', 'image/png');
    expect(name).toMatch(/\.png$/); expect(name).not.toMatch(/[\r\n/\\]/); expect(name).not.toContain('..');
    expect(facilityEvidenceName('', 'application/pdf')).toBe('Evidence.pdf');
    expect(facilityEvidenceName('x'.repeat(500), 'image/jpeg').length).toBeLessThanOrEqual(94);
  });
});
