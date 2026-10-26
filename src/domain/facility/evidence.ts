import { z } from 'zod';

export const FACILITY_EVIDENCE_MAX_BYTES = 2 * 1024 * 1024;
export const FACILITY_EVIDENCE_COMPANY_BYTES = 100 * 1024 * 1024;
export const FACILITY_EVIDENCE_COMPANY_FILES = 500;
export const facilityEvidenceResourceSchema = z.enum(['asset', 'obligation']);
export type FacilityEvidenceResource = z.infer<typeof facilityEvidenceResourceSchema>;
export const facilityEvidenceBindingSchema = z.object({
  expectedCompanyId: z.string().uuid(),
  resourceType: facilityEvidenceResourceSchema,
  resourceId: z.string().trim().min(1).max(200),
}).strict();
export type FacilityEvidence = {
  id: string; tenantId: string; siteId: string; resourceType: FacilityEvidenceResource; resourceId: string;
  name: string; contentType: string; size: number; kind: 'image' | 'document'; url: string; sha256: string;
  createdAt: string; createdBy: string;
};

/** A browser's MIME label alone never establishes a stored image. Active formats
 * such as SVG and HTML are intentionally outside this bounded evidence path. */
export function facilityEvidenceContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12 || bytes.length > FACILITY_EVIDENCE_MAX_BYTES) return null;
  const matches = (start: number, values: number[]) => values.every((value, index) => bytes[start + index] === value);
  if (matches(0, [137, 80, 78, 71, 13, 10, 26, 10]) && matches(12, [73, 72, 68, 82]) && bytes.length >= 33) return 'image/png';
  if (matches(0, [255, 216, 255]) && bytes.length >= 32 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return 'image/jpeg';
  if (matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80]) && bytes.length >= 30) return 'image/webp';
  if (matches(0, [37, 80, 68, 70, 45]) && bytes.length >= 32) return 'application/pdf';
  return null;
}

export function facilityEvidenceName(name: string, contentType: string): string {
  const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' } as Record<string, string>)[contentType];
  const base = name.split(/[\\/]/).at(-1)?.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9 _.-]/g, '_').replace(/\.{2,}/g, '.').trim().slice(0, 90) || 'Evidence';
  return `${base}.${extension}`;
}
