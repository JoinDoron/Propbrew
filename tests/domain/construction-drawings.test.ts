import { describe, expect, it } from 'vitest';
import { DRAWING_MAX_BYTES, drawingFileName, drawingUploadSchema, validDrawingFileId, validDrawingPdf } from '@/domain/construction/drawings';

function pdf() {
  return new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
}
describe('construction drawing file boundary', () => {
  it('accepts complete stored-file UUIDs and rejects truncated IDs', () => {
    expect(validDrawingFileId('1db771aa-68db-4bd7-942f-e63bd7f1b4d0')).toBe(true);
    expect(validDrawingFileId('1db771aa-68db-4bd7-e63bd7f1b4d0')).toBe(false);
  });
  it('accepts bounded PDF bytes and rejects spoofed, empty and oversized files', () => {
    expect(validDrawingPdf(pdf())).toBe(true);
    expect(validDrawingPdf(new TextEncoder().encode('<script>%PDF-1.7%%EOF</script>'))).toBe(false);
    expect(validDrawingPdf(new TextEncoder().encode('%PDF-1.7 without end marker'))).toBe(false);
    expect(validDrawingPdf(new Uint8Array(DRAWING_MAX_BYTES + 1))).toBe(false);
  });
  it('sanitises the download name and validates project links strictly', () => {
    expect(drawingFileName('../Block A\r\n.pdf')).toBe('Block A__.pdf');
    const input = { expectedCompanyId: '46a4660b-90d2-478b-89b3-d516779bded2', projectId: 'cp-cedar', mode: 'new', number: 'CED-STR-101', title: 'Foundation plan', discipline: 'Structural', folder: 'Drawings', locationIds: ['block-a'], workPackageIds: ['structure'] };
    expect(drawingUploadSchema.safeParse(input).success).toBe(true);
    expect(drawingUploadSchema.safeParse({ ...input, tenantId: 'other' }).success).toBe(false);
    expect(drawingUploadSchema.safeParse({ ...input, locationIds: ['block-a', 1] }).success).toBe(false);
  });
});
