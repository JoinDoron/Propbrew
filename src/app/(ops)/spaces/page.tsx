import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos, seed } from '@/server/data';
import { ScopeBanner } from '@/components/domain';
import { SpacesExplorer } from '@/components/spaces/spaces-explorer';

/** FM-04 — space management (Should). The estate → building → unit hierarchy,
 *  maintained once and shared with the Estate module. Sites come scoped; the
 *  buildings/units are filtered to those sites, and resident names are attached
 *  only if the actor may read them (§7). */
export default async function SpacesPage() {
  const { actor } = await requireCapability('assets_ppm');
  const sites = repos.sites.all(actor);
  const siteIds = new Set(sites.map((s) => s.id));
  const buildings = seed.buildings.filter((b) => siteIds.has(b.siteId));
  const units = seed.units.filter((u) => siteIds.has(u.siteId));

  const residentByUnit = new Map<string, string>();
  if (can(actor, 'users_roles', 'read').allowed) {
    for (const r of repos.residents.list(actor).items) residentByUnit.set(r.unitId, r.name);
  }

  const unitNodes = units.map((u) => ({
    id: u.id,
    siteId: u.siteId,
    buildingId: u.buildingId,
    label: u.label,
    type: u.type,
    occupancy: u.occupancy,
    residentName: residentByUnit.get(u.id),
  }));

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <SpacesExplorer
        sites={sites.map((s) => ({ id: s.id, name: s.name, address: s.address, kind: s.kind, buildingCount: s.buildingCount, unitCount: s.unitCount }))}
        buildings={buildings.map((b) => ({ id: b.id, siteId: b.siteId, name: b.name, floors: b.floors }))}
        units={unitNodes}
      />
    </div>
  );
}
