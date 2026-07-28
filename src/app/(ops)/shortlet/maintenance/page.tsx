import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { issueStats } from '@/domain/shortlet';
import { MaintenanceWorkspace, type IssueRow } from '@/components/shortlet/maintenance-workspace';

/** Maintenance issue tracker (flow idea) — log per-apartment issues with an
 *  auto-suggested priority, then drive Open → In progress → Resolved. */
export default async function ShortletMaintenancePage() {
  const { actor } = await requireCapability('bookings_amenities');
  const apts = repos.shortletApartments.list(actor).items;
  const aptName = new Map(apts.map((a) => [a.id, a.name]));
  const issues = repos.shortletIssues.list(actor).items;

  const rows: IssueRow[] = [...issues]
    .sort((a, b) => (a.status === b.status ? (a.createdAt < b.createdAt ? 1 : -1) : a.status === 'open' ? -1 : b.status === 'open' ? 1 : a.status === 'in_progress' ? -1 : 1))
    .map((i) => ({ id: i.id, apt: aptName.get(i.apartmentId) ?? '', apartmentId: i.apartmentId, title: i.title, description: i.description, priority: i.priority, status: i.status, createdAt: i.createdAt, resolvedAt: i.resolvedAt }));

  return (
    <div className="max-w-[820px] mx-auto">
      <MaintenanceWorkspace issues={rows} apartments={apts.map((a) => ({ id: a.id, name: a.name }))} stats={issueStats(issues, NOW_MS)} />
    </div>
  );
}
