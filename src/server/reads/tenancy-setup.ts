import 'server-only';
import type { Actor } from '@/lib/authz';
import { assertCan, matchesScope } from '@/lib/authz';
import { db } from '@/server/data/store';
import { currentRecordContext, getRecordAuxiliary } from '@/server/data/record-context';
import type { TenancyAgreementDetails, TenancyResidentOption, TenancySetupState } from '@/domain/estate/tenancy-setup';

export function tenancySetupState(): TenancySetupState {
  const state = getRecordAuxiliary<TenancySetupState>('estateTenancySetup', () => ({ agreements: [], receipts: [], audit: [] }));
  if (!state || !Array.isArray(state.agreements) || !Array.isArray(state.receipts) || !Array.isArray(state.audit)) throw new Error('The saved tenancy setup is unavailable.');
  const tenant = currentRecordContext()?.domainTenantId;
  if (tenant && [...state.agreements, ...state.receipts, ...state.audit].some((row) => !row || row.tenantId !== tenant)) throw new Error('The saved tenancy setup has a foreign company scope.');
  return state;
}
export function tenancyAgreementFor(actor: Actor, tenancyId: string): TenancyAgreementDetails | undefined {
  const scope = assertCan(actor, 'users_roles', 'read');
  const record = db.tenancies.find((row) => row.id === tenancyId && matchesScope(row, scope));
  if (!record) return undefined;
  const detail = tenancySetupState().agreements.find((row) => row.tenancyId === record.id && row.tenantId === actor.tenantId && row.estateId === record.estateId);
  return detail ? structuredClone(detail) : undefined;
}
export function tenancyResidentOptions(actor: Actor): TenancyResidentOption[] {
  const scope = assertCan(actor, 'users_roles', 'create');
  return db.residents.filter((resident) => matchesScope(resident, scope) && ['active', 'invited'].includes(resident.status)).flatMap((resident) => {
    const unit = db.units.find((row) => row.id === resident.unitId && row.tenantId === actor.tenantId && row.siteId === resident.siteId && matchesScope({ ...row, unitId: row.id }, scope));
    const site = unit && db.sites.find((row) => row.id === unit.siteId && row.kind === 'estate' && row.tenantId === actor.tenantId);
    return unit && site ? [{ id: String(resident.id), name: resident.name, unitId: String(unit.id), unitLabel: unit.label, estateName: site.name }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}
