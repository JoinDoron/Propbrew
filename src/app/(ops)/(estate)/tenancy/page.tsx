import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { ScopeBanner } from '@/components/domain';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { depositExposureMinor, leaseRunwayDays } from '@/domain/estate';
import { TenancyWorkspace, type TenancyRow } from '@/components/estate/tenancy-workspace';

const IN_MOTION = new Set(['approved', 'moving_in', 'notice', 'moving_out']);

/** Tenancy — the move-in → move-out lifecycle: a stage pipeline, lease-renewal
 *  runway, deposit exposure and settlement. Gated by users_roles. */
export default async function TenancyPage() {
  const { actor } = await requireCapability('users_roles', 'read', 'estate');
  const tenancies = repos.tenancies.list(actor).items;

  const rows: TenancyRow[] = tenancies.map((t) => ({
    id: t.id, residentName: t.residentName, unitLabel: t.unitLabel, stage: t.stage, applicationISO: t.applicationISO,
    moveInISO: t.moveInISO, leaseEndISO: t.leaseEndISO, moveOutISO: t.moveOutISO, rentMinor: t.rentMinor, depositMinor: t.depositMinor, depositStatus: t.depositStatus,
  }));

  return (
    <div className="pb-page">
      <PageHeader title="Tenancy" subtitle="A clear view of residents, lease stages and deposit records."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />} />
      <TenancyWorkspace
        tenancies={rows}
        kpis={{
          active: tenancies.filter((t) => t.stage === 'active').length,
          inMotion: tenancies.filter((t) => IN_MOTION.has(t.stage)).length,
          renewalsSoon: tenancies.filter((t) => { const d = leaseRunwayDays(t, NOW_MS); return t.stage === 'active' && d !== null && d <= 45; }).length,
          depositExposureMinor: depositExposureMinor(tenancies),
        }}
        nowMs={NOW_MS}
        canMutate={can(actor, 'users_roles', 'update').allowed}
      />
    </div>
  );
}
