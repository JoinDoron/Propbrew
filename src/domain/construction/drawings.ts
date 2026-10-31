import { z } from 'zod';

export const DRAWING_MAX_BYTES = 15 * 1024 * 1024;
export const DRAWING_COMPANY_BYTES = 300 * 1024 * 1024;
export const DRAWING_COMPANY_FILES = 500;
export const validDrawingFileId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const drawingUploadSchema = z.object({
  expectedCompanyId: z.string().uuid(),
  projectId: z.string().min(1).max(200),
  mode: z.enum(['new', 'revision', 'attach']),
  docId: z.string().max(200).optional(),
  number: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).optional(),
  title: z.string().trim().min(3).max(180).optional(),
  discipline: z.string().trim().min(2).max(80).optional(),
  folder: z.string().trim().min(2).max(120).optional(),
  changeNote: z.string().trim().max(1000).optional(),
  locationIds: z.array(z.string().min(1).max(200)).max(30),
  workPackageIds: z.array(z.string().min(1).max(200)).max(30),
}).strict();
export type DrawingUploadInput = z.infer<typeof drawingUploadSchema>;

/** Check the bytes, not the browser's MIME label. PDFs are downloaded, never
 * embedded in the application origin, so active PDF content cannot run there. */
export function validDrawingPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 32 || bytes.length > DRAWING_MAX_BYTES) return false;
  const header = [37, 80, 68, 70, 45]; // %PDF-
  if (!header.every((byte, index) => bytes[index] === byte)) return false;
  const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024)));
  return tail.includes('%%EOF');
}

export function drawingFileName(value: string): string {
  const base = value.split(/[\\/]/).at(-1)?.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9 _.-]/g, '_').replace(/\.{2,}/g, '.').trim().slice(0, 100) || 'Drawing';
  return `${base}.pdf`;
}
