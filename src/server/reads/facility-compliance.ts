import 'server-only';
import { createHash } from 'node:crypto';
import { assertCan, matchesScope, type Actor } from '@/lib/authz';
import { currentRecordContext, getRecordAuxiliary } from '@/server/data/record-context';
import { db } from '@/server/data/store';
import { repos } from '@/server/data';
import type { FacilityComplianceState, FacilityComplianceSetup, FacilityInspectionOperation } from '@/domain/facility/compliance';

export function facilityComplianceState(): FacilityComplianceState {
  const context = currentRecordContext();
  if (context?.mode === 'read' && context.state.auxiliary.facilityCompliance === undefined) return { configurations: [], runs: [], receipts: [], audit: [] };
  const state = getRecordAuxiliary<FacilityComplianceState>('facilityCompliance', () => ({ configurations: [], runs: [], receipts: [], audit: [] }));
  if (!state || !Array.isArray(state.configurations) || !Array.isArray(state.runs) || !Array.isArray(state.receipts) || !Array.isArray(state.audit)) throw new Error('The compliance configuration is unavailable.');
  const tenant = context?.domainTenantId;
  if (tenant && [...state.configurations, ...state.runs, ...state.receipts, ...state.audit].some((row) => !row || row.tenantId !== tenant)) throw new Error('Compliance configuration has an invalid company scope.');
  return state;
}
export const complianceHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function facilityComplianceConfiguration(actor: Actor, obligationId: string) {
  const scope = assertCan(actor, 'inspections_compliance', 'read');
  const record = db.complianceObligations.find((row) => row.id === obligationId && matchesScope(row, scope));
  return record ? facilityComplianceState().configurations.find((row) => row.tenantId === actor.tenantId && row.obligationId === record.id && row.siteId === record.siteId) : undefined;
}
export function facilityInspectionOperation(actor: Actor, inspectionId: string) {
  const scope = assertCan(actor, 'inspections_compliance', 'read');
  const record = db.inspections.find((row) => row.id === inspectionId && matchesScope(row, scope));
  if (!record) return undefined;
  const state = facilityComplianceState();
  const saved = state.runs.find((row) => row.tenantId === actor.tenantId && row.inspectionId === record.id && row.obligationId === record.obligationId);
  if (saved) return saved;
  if (!nativeComplianceActor(actor) && !state.configurations.some((row) => row.tenantId === actor.tenantId && row.obligationId === record.obligationId)) return undefined;
  const obligation = db.complianceObligations.find((row) => row.tenantId === actor.tenantId && row.id === record.obligationId);
  if (!obligation) return undefined;
  return { tenantId: actor.tenantId!, inspectionId: record.id, obligationId: record.obligationId, version: 1, obligationVersion: state.configurations.find((row) => row.tenantId === actor.tenantId && row.obligationId === obligation.id)?.version ?? 1, checklistHash: complianceChecklistHash(record.checklist), scopeHash: complianceHash([obligation.siteId, obligation.estateId, obligation.assetId ?? null]), scheduledDate: record.scheduledDate, cadenceDays: obligation.cadenceDays, evidenceIds: [] } satisfies FacilityInspectionOperation;
}
export function facilityComplianceSetup(actor: Actor): FacilityComplianceSetup {
  const scope = assertCan(actor, 'inspections_compliance', 'read');
  const sites = db.sites.filter((row) => matchesScope({ ...row, siteId: row.id }, scope)).map((row) => ({ id: String(row.id), name: row.name }));
  const allowed = new Set(sites.map((row) => row.id));
  const assets = [] as FacilityComplianceSetup['assets'];
  let cursor: string | null | undefined;
  do {
    const page = repos.assets.list(actor, { cursor, limit: 200 });
    assets.push(...page.items.filter((row) => allowed.has(row.siteId) && row.status !== 'archived' && !row.archivedAt).map((row) => ({ id: String(row.id), name: row.name, siteId: String(row.siteId) })));
    cursor = page.cursor;
  } while (cursor !== null);
  return { companyId: actor.tenantId ?? '', sites, assets };
}

export const nativeComplianceActor = (actor: Actor) => Boolean(actor.companyAccess && actor.tenantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor.tenantId));
export const complianceChecklistHash = (items: readonly { id: string; label: string; severity: string; requiresPhoto: boolean }[]) => complianceHash(items.map(({ id, label, severity, requiresPhoto }) => ({ id, label, severity, requiresPhoto })));

export function facilityComplianceHistory(actor: Actor) {
  const scope = assertCan(actor, 'inspections_compliance', 'read');
  const visible = new Set(db.complianceObligations.filter((row) => matchesScope(row, scope)).map((row) => row.id));
  return structuredClone(facilityComplianceState().audit.filter((row) => row.tenantId === actor.tenantId && visible.has(row.obligationId)).slice().reverse().slice(0, 200));
}
