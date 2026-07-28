import { requireCapability } from '@/server/guard';
import { getAllHistory } from '@/server/data/store';
import { ROLE_LABELS, type Role } from '@/lib/authz';
import { isSecurityEvent, isFinancialEvent } from '@/domain/platform-admin';
import { AuditWorkspace, type AuditRow } from '@/components/admin/audit-workspace';

const MACHINE_LABEL: Record<string, string> = { 'work-order': 'Work order', 'service-charge': 'Service charge', booking: 'Booking', 'sos-event': 'SOS', 'marketplace-order': 'Order' };

/** SC-10 — audit log. Immutable record of who did what, when, across every §10
 *  machine this session. Search, filter by record type, a security/financial
 *  lens, and CSV export. Platform-Admin only, 12-month retention (proposed). */
export default async function AuditPage() {
  await requireCapability('tenant_config');
  const entries: AuditRow[] = getAllHistory().map((e) => ({
    machine: e.machine, machineLabel: MACHINE_LABEL[e.machine] ?? e.machine, recordId: e.recordId,
    event: e.event, from: e.from, to: e.to, actorName: e.actorName, actorRole: ROLE_LABELS[e.actorRole as Role] ?? e.actorRole, at: e.at,
    security: isSecurityEvent(e.machine, e.event), financial: isFinancialEvent(e.machine, e.event),
  }));

  return (
    <div className="max-w-[1100px] mx-auto">
      <AuditWorkspace entries={entries} />
    </div>
  );
}
