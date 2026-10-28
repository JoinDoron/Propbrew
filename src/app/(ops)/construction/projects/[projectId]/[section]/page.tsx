import { notFound } from 'next/navigation';
import { ScopedOperatingHub } from '@/components/workspaces/scoped-operating-hub';
import { requireCapability } from '@/server/guard';
import { withDurableRead } from '@/server/data/durable-records';
import { readConstructionProjectHub } from '@/server/reads/scoped-operating-hubs';

export const dynamic = 'force-dynamic';
const valid = new Set(['planning-controls', 'commercial-procurement', 'site-delivery', 'intelligence']);

export default async function ConstructionProjectSectionPage({ params }: { params: Promise<{ projectId: string; section: string }> }) {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
    const { projectId, section } = await params;
    if (!valid.has(section)) notFound();
    const data = readConstructionProjectHub(actor, projectId);
    if (!data) notFound();
    return <ScopedOperatingHub eyebrow={`${data.project.code} · ${data.project.status.replaceAll('_', ' ')}`} title={data.project.name} subtitle={`${data.project.location} · Project manager ${data.project.pmName}`} backHref="/construction/projects" backLabel="All projects" metrics={data.metrics} sections={data.sections} rows={data.rows} selectedSection={section} />;
  });
}
