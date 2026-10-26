import 'server-only';
import { assertCan, matchesScope, type Actor } from '@/lib/authz';
import { billableResident, estateBillingState, nextRuleDate, type EstateRecurringRule } from '@/domain/estate/billing-setup';
import { currentRecordContext } from '@/server/data/record-context';
import { db } from '@/server/data/store';

export type EstateBillingResidentOption = { id: string; name: string; unitId: string; unitLabel: string; estateName: string };
export type EstateRecurringRuleView = EstateRecurringRule & { residentName: string; unitLabel: string; estateName: string; nextDate: string | null; needsReview: boolean };
export function estateBillingResidentOptions(actor: Actor): EstateBillingResidentOption[] {
  const context = currentRecordContext();
  if (!context || context.domainTenantId !== actor.tenantId) return [];
  const scope = assertCan(actor, 'charges_invoicing', 'read');
  return db.residents.flatMap((row) => {
    const found = billableResident(context.state, actor.tenantId!, String(row.id));
    return found && matchesScope({ ...row, estateId: row.siteId }, scope)
      ? [{ id: String(row.id), name: row.name, unitId: String(found.unit.id), unitLabel: found.unit.label, estateName: found.site.name }] : [];
  });
}
export function listEstateRecurringRules(actor: Actor): EstateRecurringRuleView[] {
  const context = currentRecordContext();
  if (!context || context.domainTenantId !== actor.tenantId) return [];
  const scope = assertCan(actor, 'charges_invoicing', 'read');
  return estateBillingState(context.state, actor.tenantId!).rules.filter((rule) => matchesScope(rule, scope)).map((rule) => {
    const bound = billableResident(context.state, actor.tenantId!, rule.residentId);
    return { ...rule, residentName: bound?.resident.name ?? 'Resident unavailable', unitLabel: bound?.unit.label ?? 'Unit unavailable', estateName: bound?.site.name ?? 'Property unavailable', nextDate: nextRuleDate(rule),
      needsReview: !bound || String(bound.unit.id) !== rule.unitId || String(bound.resident.userId) !== rule.ownerUserId || String(bound.site.id) !== rule.estateId };
  });
}
