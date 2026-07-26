import { requireCapability } from '@/server/guard';
import { seed } from '@/server/data';
import { Button, Card, CardHeader, StatusPill, Table, Td, Th, TableRow } from '@/components/ui';
import { Building2, Plus } from 'lucide-react';

/** SC-07 — tenant management. Platform Admin is the ONLY role that reads across
 *  tenants (§8.2); this page groups the seed sites by their owning tenant. Every
 *  such cross-tenant read is an SC-10 audit event once audit logging lands. */
export default async function TenantsPage() {
  await requireCapability('tenant_config');

  // Platform Admin scope is '*', so we present the raw seed grouped by tenant —
  // the one place a cross-tenant view is legitimate.
  const tenants = Array.from(new Set(seed.sites.map((s) => s.tenantId))).map((tid) => ({
    id: tid,
    sites: seed.sites.filter((s) => s.tenantId === tid),
    units: seed.sites.filter((s) => s.tenantId === tid).reduce((a, s) => a + s.unitCount, 0),
  }));

  const TENANT_LABEL: Record<string, string> = { 't-lekki': 'Lekki Gardens Group', 't-ikoyi': 'Ikoyi Heights Ltd' };

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title={`${tenants.length} tenants`}
            subtitle="Organisations on the platform · cross-tenant view (Platform Admin only)"
            action={<Button variant="primary" icon={<Plus size={16} />}>Onboard tenant</Button>}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Tenant</Th>
              <Th>Estates / facilities</Th>
              <Th className="text-right">Units</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-primary-weak text-primary flex items-center justify-center flex-none">
                      <Building2 size={16} />
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold">{TENANT_LABEL[t.id] ?? t.id}</div>
                      <div className="text-[11.5px] text-text-3 font-mono">{t.id}</div>
                    </div>
                  </div>
                </Td>
                <Td className="text-[13px]">{t.sites.map((s) => s.name).join(', ')}</Td>
                <Td className="text-right font-mono text-[13px]">{t.units.toLocaleString()}</Td>
                <Td><StatusPill status="Active" tone="success" /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
