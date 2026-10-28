import { notFound } from 'next/navigation';
import { ScopedOperatingHub } from '@/components/workspaces/scoped-operating-hub';
import { requireCapability } from '@/server/guard';
import { withDurableRead } from '@/server/data/durable-records';
import { readShortletPropertyHub } from '@/server/reads/scoped-operating-hubs';

export const dynamic = 'force-dynamic';
const valid = new Set(['reservations', 'guest-operations', 'revenue-growth', 'intelligence']);

export default async function ShortletPropertySectionPage({ params }: { params: Promise<{ propertyId: string; section: string }> }) {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
    const { propertyId, section } = await params;
    if (!valid.has(section)) notFound();
    const data = readShortletPropertyHub(actor, propertyId);
    if (!data) notFound();
    return <ScopedOperatingHub eyebrow="Shortlet property hub" title={data.property.name} subtitle={`${data.property.area}, ${data.property.city}`} backHref="/shortlet/properties" backLabel="All properties" metrics={data.metrics} sections={data.sections} rows={data.rows} selectedSection={section} />;
  });
}
