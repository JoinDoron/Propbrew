/**
 * Inspections & compliance domain (FM-06). Pure — the RAG/expiry logic and the
 * audit-readiness score the register and workspace compute over. NOW is the
 * pinned demo date so everything is deterministic and testable.
 */

import { NOW_MS } from './ppm';
import type { ComplianceObligation, InspectionSeverity } from './entities';

export { NOW } from './ppm';

const DAY = 86_400_000;
export const EXPIRING_WINDOW_DAYS = 30; // amber threshold

export type ComplianceState = 'valid' | 'expiring' | 'expired' | 'never';

export function daysUntil(iso: string): number {
  return Math.round((Date.parse(iso) - NOW_MS) / DAY);
}

/** RAG state of an obligation from its expiry. */
export function complianceState(validUntil: string | null): ComplianceState {
  if (!validUntil) return 'never';
  const d = daysUntil(validUntil);
  if (d < 0) return 'expired';
  if (d <= EXPIRING_WINDOW_DAYS) return 'expiring';
  return 'valid';
}

export const STATE_TONE: Record<ComplianceState, 'success' | 'warn' | 'danger' | 'muted'> = {
  valid: 'success',
  expiring: 'warn',
  expired: 'danger',
  never: 'muted',
};

export const STATE_LABEL: Record<ComplianceState, string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  never: 'Not evidenced',
};

/** Criticality weights — a lapsed statutory cert hurts the audit score far more. */
export const CRITICALITY_WEIGHT: Record<string, number> = { statutory: 3, important: 2, routine: 1 };

/** Failed-item severity → the priority of the work order it raises. */
export const SEVERITY_PRIORITY: Record<InspectionSeverity, 'emergency' | 'high' | 'routine'> = {
  critical: 'emergency',
  major: 'high',
  minor: 'routine',
};

export const SEVERITY_TONE: Record<InspectionSeverity, 'danger' | 'warn' | 'neutral'> = {
  critical: 'danger',
  major: 'warn',
  minor: 'neutral',
};

/**
 * Audit-readiness — a 0–100 estate compliance health score. Each obligation
 * contributes its criticality weight; valid = full credit, expiring = 60%,
 * expired/never = 0. A single expired statutory obligation drags it down hard.
 */
export function auditReadiness(obligations: readonly ComplianceObligation[]): { score: number; valid: number; expiring: number; expired: number; total: number } {
  let earned = 0;
  let possible = 0;
  let valid = 0;
  let expiring = 0;
  let expired = 0;
  for (const o of obligations) {
    const w = CRITICALITY_WEIGHT[o.criticality] ?? 1;
    possible += w;
    const state = complianceState(o.validUntil);
    if (state === 'valid') { earned += w; valid++; }
    else if (state === 'expiring') { earned += w * 0.6; expiring++; }
    else { expired++; }
  }
  return { score: possible ? Math.round((earned / possible) * 100) : 100, valid, expiring, expired, total: obligations.length };
}

export function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
}
