import { notFound } from 'next/navigation';
import { PropertyOperatingHub } from '@/components/workspaces/property-operating-hub';
import { withDurableRead } from '@/server/data/durable-records';
import { requireCapability } from '@/server/guard';
import { readEstatePropertyOperating } from '@/server/reads/estate-property-operating';

export const dynamic = 'force-dynamic';

export default async function EstatePropertyOperatingPage({ params }: { params: Promise<{ propertyId: string }> }) {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('assets_ppm', 'read', 'estate');
    const { propertyId } = await params;
    const { property, permissions } = readEstatePropertyOperating(actor, propertyId);
    if (!property) notFound();
    return <PropertyOperatingHub property={property} permissions={permissions} />;
  });
}
