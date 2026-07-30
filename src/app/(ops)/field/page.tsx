import { requireCapability } from '@/server/guard';
import { repos, seed } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { TechnicianWorkspace, type Job } from '@/components/facility/technician-workspace';

/** My Day — the field technician's mobile-first job list. Their own assigned work
 *  (scoped to assigned_to_me), grouped On now / Up next / Waiting / Done, with big
 *  tap targets that fire the real §10 work-order transitions and live SLA counts. */
export default async function FieldPage() {
  const { actor } = await requireCapability('work_orders');
  const jobs = repos.workOrders.list(actor, { limit: 100 }).items;
  const sites = new Map<string, string>(repos.sites.all(actor).map((s) => [String(s.id), s.name]));
  const assets = new Map<string, string>(repos.assets.list(actor, { limit: 200 }).items.map((a) => [String(a.id), a.name]));
  const units = new Map<string, string>(seed.units.map((u) => [String(u.id), u.label]));
  const techName = seed.users.find((u) => u.id === actor.userId)?.name ?? 'there';

  const rows: Job[] = jobs.map((w) => ({
    ref: w.ref, title: w.title, priority: w.priority, status: w.status, origin: w.origin,
    dueISO: w.resolveDueAt ?? null,
    location: (w.unitId && units.get(String(w.unitId))) || sites.get(String(w.estateId)) || sites.get(String(w.siteId)) || 'Estate',
    assetName: w.assetId ? assets.get(String(w.assetId)) : undefined,
  }));

  return (
    <div className="max-w-[560px] mx-auto">
      <TechnicianWorkspace jobs={rows} techName={techName} nowMs={NOW_MS} />
    </div>
  );
}
