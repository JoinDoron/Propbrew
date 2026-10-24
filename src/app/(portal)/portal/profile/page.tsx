import { PageHeader } from '@/components/ui/page-header';
import { PageTabs } from '@/components/ui/page-tabs';
import { requireCapability } from '@/server/guard';
import { seed } from '@/server/data';
import { brand } from '@/config/brand';
import { Card, CardHeader, Avatar, EmptyState, StatusPill } from '@/components/ui';
import { BadgeHelp, Home, UserRound } from 'lucide-react';
import layout from '@/components/ui/workspace-layout.module.css';
import { withDurableRead } from '@/server/data/durable-records';

export default async function ProfilePage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('work_orders');
  const user = seed.users.find((record) => record.id === actor.userId && record.tenantId === actor.tenantId);
  const resident = seed.residents.find((record) => record.userId === actor.userId && record.tenantId === actor.tenantId && actor.unitIds.includes(record.unitId));
  const units = seed.units.filter((unit) => unit.tenantId === actor.tenantId && actor.unitIds.includes(unit.id));
  const sites = seed.sites.filter((site) => site.tenantId === actor.tenantId && units.some((unit) => unit.siteId === site.id));
  const name = user?.name ?? resident?.name ?? 'Resident';
  const residentId = resident?.id ?? 'Not recorded';
  const estateNames = sites.map((site) => site.name).join(', ') || 'No linked estate';
  const moveIn = resident?.moveInDate
    ? new Date(resident.moveInDate).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium' })
    : 'Not recorded';

  return <div className="pb-page">
    <PageHeader title="Profile & IDs" subtitle="Your account record and the units linked to your signed-in identity." />
    <PageTabs label="Resident profile sections" items={[
      { id: 'identity', label: 'Digital ID', content: <Card>
        <CardHeader title={brand.name + ' resident record'} subtitle="Account information only · identity verification and gate credentials are not connected" action={<BadgeHelp size={22} className="text-primary" aria-hidden="true" />} />
        <div className={layout.context}><div className={layout.person}><Avatar name={name} size={48} /><div><h2 className={layout.sectionTitle}>{name}</h2><p className={layout.metadata}>Resident record · {residentId}</p></div></div><StatusPill status="Not an access credential" tone="warn" /></div>
        <dl className={layout.analytics + ' mt-6'}><Field label="Linked estates" value={estateNames} /><Field label="Linked units" value={units.map((unit) => unit.label).join(', ') || 'None recorded'} /></dl>
        <p className={layout.footnote}>This screen does not verify identity, generate a scannable pass or authorise entry. Follow your estate’s approved visitor and resident access process.</p>
      </Card> },
      { id: 'profile', label: 'Personal details', content: <Card>
        <CardHeader title="Personal details" subtitle="Read-only account and resident records · contact your estate team to request corrections" />
        <dl className={layout.analytics}><Field label="Full name" value={name} /><Field label="Resident record ID" value={residentId} /><Field label="Email" value={resident?.email ?? user?.email ?? 'Not recorded'} /><Field label="Phone" value={resident?.phone ?? 'Not recorded'} /><Field label="Household" value={resident ? resident.household + ' member' + (resident.household === 1 ? '' : 's') : 'Not recorded'} /><Field label="Recorded move-in" value={moveIn} /></dl>
        {!user && !resident ? <p className={layout.footnote}>No matching profile record is available for this signed-in account. No sample identity has been substituted.</p> : null}
      </Card> },
      { id: 'units', label: 'My units', content: <Card>
        <CardHeader title="My units" subtitle="Only units linked to this signed-in account and tenant" />
        {units.length ? <ul className={layout.list}>{units.map((unit) => <li key={unit.id} className={layout.listRow}><Home size={20} className="text-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p className={layout.title}>{unit.label}</p><p className={layout.metadata}>{unit.type} · {sites.find((site) => site.id === unit.siteId)?.name ?? 'Estate not recorded'}</p></div><StatusPill status={unit.occupancy} tone={unit.occupancy === 'occupied' ? 'success' : unit.occupancy === 'reserved' ? 'info' : 'neutral'} /></li>)}</ul> : <EmptyState icon={<UserRound size={26} />} title="No units linked" description="Your estate team must link the correct unit before it appears here." />}
      </Card> },
    ]} />
  </div>;
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className={layout.metadata}>{label}</dt><dd className={layout.body + ' mt-1'}>{value}</dd></div>;
}
