import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { scoreAssets } from '@/server/data/ppm-risk';
import { CardHeader } from '@/components/ui';
import { ScopeBanner, formatMoney } from '@/components/domain';
import { AssetsExplorer, type AssetHealth } from '@/components/assets/assets-explorer';

/** FM-01 — asset register. Facility Manager can add (M); Executive/Technician are
 *  view-only (V). Assets are archived, never deleted. The register is
 *  interactive: filter by status/category, search, and drill into an asset's PPM
 *  plans and full work-order service history. */
export default async function AssetsPage() {
  const { actor } = await requireCapability('assets_ppm');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'assets_ppm'));
  const assets = repos.assets.list(actor).items;
  const ppm = repos.ppmPlans.list(actor).items;

  const jobs = repos.workOrders.list(actor).items
    .filter((w) => w.assetId)
    .map((w) => ({ id: w.id, ref: w.ref, title: w.title, status: w.status, assetId: w.assetId, costLabel: w.cost ? formatMoney(w.cost) : '—' }));

  // AI-F-01 asset-health from the PPM risk engine, keyed by asset for the cards.
  const health: Record<string, AssetHealth> = {};
  for (const r of scoreAssets(actor)) health[String(r.assetId)] = { score: r.score, band: r.band, topDriver: r.topDriver, confidence: r.confidence };

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title={`${assets.length} assets`} subtitle="The register of everything under management — filter, search and drill in" />
      <AssetsExplorer
        assets={assets.map((a) => ({ id: a.id, name: a.name, category: a.category, serial: a.serial, locationLabel: a.locationLabel, status: a.status, purchaseDate: a.purchaseDate, warrantyExpiry: a.warrantyExpiry }))}
        ppm={ppm.map((p) => ({ id: p.id, assetId: p.assetId, frequency: p.frequency, nextDue: p.nextDue, overdue: p.overdue, checklistItems: p.checklistItems, assignee: p.assignee }))}
        jobs={jobs}
        health={health}
        canMutate={canMutate}
      />
    </div>
  );
}
