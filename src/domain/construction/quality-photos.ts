import { z } from 'zod';
import { facilityEvidenceContentType, facilityEvidenceName } from '@/domain/facility/evidence';

export const QUALITY_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const qualityPhotoBindingSchema = z.object({
  expectedCompanyId: z.string().uuid(),
  issueId: z.string().trim().min(1).max(200),
}).strict();

export type QualityPhoto = {
  id: string; tenantId: string; projectId: string; issueId: string;
  name: string; contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  size: number; sha256: string; url: string; createdAt: string; createdBy: string;
};

export function qualityPhotoContentType(bytes: Uint8Array): QualityPhoto['contentType'] | null {
  const kind = facilityEvidenceContentType(bytes);
  return kind === 'image/png' || kind === 'image/jpeg' || kind === 'image/webp' ? kind : null;
}
export const qualityPhotoName = facilityEvidenceName;
