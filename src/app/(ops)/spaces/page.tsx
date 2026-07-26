import { requireCapability } from '@/server/guard';
import { repos, seed } from '@/server/data';
import { Card, StatusPill } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { Building2 } from 'lucide-react';

/** FM-04 — space management (Should). The estate → building → unit hierarchy,
 *  maintained once and shared with the Estate module. Sites come scoped; the
 *  buildings/units are filtered to those sites. */
export default async function SpacesPage() {
  const { actor } = await requireCapability('assets_ppm');
  const sites = repos.sites.all(actor);
  const siteIds = new Set(sites.map((s) => s.id));
  const buildings = seed.buildings.filter((b) => siteIds.has(b.siteId));
  const units = seed.units.filter((u) => siteIds.has(u.siteId));

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      {sites.map((site) => {
        const siteBuildings = buildings.filter((b) => b.siteId === site.id);
        return (
          <Card key={site.id}>
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-lg bg-primary-weak text-primary flex items-center justify-center flex-none">
                <Building2 size={18} />
              </span>
              <div className="flex-1">
                <h3 className="text-[15px] font-semibold">{site.name}</h3>
                <p className="text-[12px] text-text-3">{site.address}</p>
              </div>
              <StatusPill status={site.kind} tone={site.kind === 'estate' ? 'info' : 'neutral'} />
            </div>

            <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-3 mt-3.5 pt-3.5 border-t border-border">
              <Stat label="Buildings" value={site.buildingCount} />
              <Stat label="Units" value={site.unitCount} />
              <Stat label="Occupied" value={units.filter((u) => u.siteId === site.id && u.occupancy === 'occupied').length} />
              <Stat label="Vacant" value={units.filter((u) => u.siteId === site.id && u.occupancy === 'vacant').length} />
            </div>

            {siteBuildings.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {siteBuildings.map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border-2 bg-surface-2 text-[12px]">
                    {b.name}<span className="text-text-3">· {b.floors}fl</span>
                  </span>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10.5px] text-text-3 uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-semibold mt-0.5">{value.toLocaleString()}</div>
    </div>
  );
}
