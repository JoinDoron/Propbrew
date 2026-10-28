import { notFound } from 'next/navigation';
import { ScopedOperatingHub } from '@/components/workspaces/scoped-operating-hub';
import { requireCapability } from '@/server/guard';
import { withDurableRead } from '@/server/data/durable-records';
import { readFacilitySiteHub } from '@/server/reads/scoped-operating-hubs';

export const dynamic = 'force-dynamic';
const valid = new Set(['operations', 'asset-care', 'building-services', 'intelligence']);

export default async function FacilitySiteSectionPage({ params }: { params: Promise<{ siteId: string; section: string }> }) {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('assets_ppm', 'read', 'facility');
    const { siteId, section } = await params;
    if (!valid.has(section)) notFound();
    const data = readFacilitySiteHub(actor, siteId);
    if (!data) notFound();
    return <ScopedOperatingHub eyebrow="Facility operating hub" title={data.site.name} subtitle={data.site.address} backHref="/facility" backLabel="Facility overview" metrics={data.metrics} sections={data.sections} rows={data.rows} selectedSection={section} />;
  });
}
