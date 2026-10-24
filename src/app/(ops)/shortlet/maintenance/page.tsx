import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { issueStats } from '@/domain/shortlet';
import { MaintenanceWorkspace, type IssueRow } from '@/components/shortlet/maintenance-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Maintenance issue tracker (flow idea) — log per-apartment issues with an
 *  auto-suggested priority, then drive Open → In progress → Resolved. */
export default async function ShortletMaintenancePage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const apts = repos.shortletApartments.list(actor).items;
  const aptName = new Map(apts.map((a) => [a.id, a.name]));
  const issues = repos.shortletIssues.list(actor).items;

  const rows: IssueRow[] = [...issues]
    .sort((a, b) => (a.status === b.status ? (a.createdAt < b.createdAt ? 1 : -1) : a.status === 'open' ? -1 : b.status === 'open' ? 1 : a.status === 'in_progress' ? -1 : 1))
    .map((i) => ({ id: i.id, apt: aptName.get(i.apartmentId) ?? '', apartmentId: i.apartmentId, title: i.title, description: i.description, priority: i.priority, status: i.status, createdAt: i.createdAt, resolvedAt: i.resolvedAt }));

  return (
    <div className="pb-page">
      <PageHeader title="Shortlet maintenance" subtitle="Keep apartments guest-ready with a clear issue workflow." />
      <MaintenanceWorkspace canCreate={can(actor, 'bookings_amenities', 'create').allowed} canUpdate={can(actor, 'bookings_amenities', 'update').allowed} issues={rows} apartments={apts.map((a) => ({ id: a.id, name: a.name }))} stats={issueStats(issues, NOW_MS)} />
    </div>
  );
  });
}
