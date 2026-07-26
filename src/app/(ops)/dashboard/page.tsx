import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { addMoney, money, type Money as MoneyValue } from '@/domain/primitives';
import { Card, CardHeader, KpiCard, Table, Th, Td, TableRow, Mono } from '@/components/ui';
import { DomainStatus, Money, SlaBadge, ScopeBanner } from '@/components/domain';
import { Banknote, CircleAlert, ShieldAlert, Wrench } from 'lucide-react';

const NOW = '2026-07-26T09:00:00Z';
const CLOSED = ['closed', 'cancelled', 'rejected', 'verified'];

/**
 * FM-07 — portfolio dashboard. Every tile is computed under the SAME scope as
 * the list it summarises (a headline count above a scoped list is itself a
 * leak), and a tile only appears if the actor holds the capability behind it —
 * a facility manager has no charges_invoicing grant, so no collection tile.
 */
export default async function DashboardPage() {
  const { actor } = await requireCapability('reports_analytics');
  const scopeLabel = actor.tenantId ? (actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`) : 'all tenants';

  const seesWorkOrders = can(actor, 'work_orders', 'read').allowed;
  const seesInvoices = can(actor, 'charges_invoicing', 'read').allowed;
  const seesSos = can(actor, 'security_sos', 'read').allowed;

  const workOrders = seesWorkOrders ? repos.workOrders.list(actor).items : [];
  const invoices = seesInvoices ? repos.invoices.list(actor).items : [];
  const sos = seesSos ? repos.sosEvents.list(actor).items : [];

  const isOpen = (s: string) => !CLOSED.includes(s);
  const openWo = workOrders.filter((w) => isOpen(w.status)).length;
  const breached = workOrders.filter((w) => isOpen(w.status) && (w.respondDueAt ?? '') < NOW).length;

  const billed = invoices.reduce<MoneyValue>((a, i) => addMoney(a, i.amount), money(0));
  const collected = invoices.reduce<MoneyValue>((a, i) => addMoney(a, i.paid), money(0));
  const collectionRate = billed.minor > 0 ? Math.round((collected.minor / billed.minor) * 100) : 0;
  const arrears = invoices.filter((i) => ['overdue', 'in_arrears', 'escalated'].includes(i.status)).length;

  const activeSos = sos.filter((s) => s.status !== 'reviewed').length;
  const recent = workOrders.slice(0, 6);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={scopeLabel} />

      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 min-[1120px]:grid-cols-4 gap-3.5">
        {seesWorkOrders && (
          <KpiCard label="Open work orders" value={String(openWo)} delta={`${breached} breaching SLA`} positive={breached === 0} icon={<Wrench size={18} />} />
        )}
        {seesInvoices && (
          <KpiCard label="Collection rate" value={`${collectionRate}%`} delta={`${arrears} in arrears`} positive={arrears === 0} icon={<Banknote size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />
        )}
        {seesInvoices && (
          <KpiCard label="Billed this cycle" value={formatShort(billed)} icon={<Banknote size={18} />} iconBg="rgba(37,99,235,.12)" iconColor="#2563eb" />
        )}
        {seesSos && (
          <KpiCard label="Active SOS" value={String(activeSos)} delta={activeSos > 0 ? 'needs response' : 'all clear'} positive={activeSos === 0} icon={<ShieldAlert size={18} />} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" />
        )}
        {!seesWorkOrders && !seesInvoices && !seesSos && (
          <KpiCard label="Reports" value="—" delta="scoped to your role" positive icon={<CircleAlert size={18} />} />
        )}
      </div>

      {seesWorkOrders && (
        <Card padded={false}>
          <div className="p-4 sm:p-[18px] pb-0">
            <CardHeader title="Recent work orders" subtitle="Latest jobs across your estates" />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Ref</Th>
                <Th>Job</Th>
                <Th>Status</Th>
                <Th className="max-[720px]:hidden">Assignee</Th>
                <Th className="max-[560px]:hidden">SLA</Th>
                <Th className="text-right">Cost</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((w) => (
                <TableRow key={w.id}>
                  <Td><Mono className="font-semibold text-[13px]">{w.ref}</Mono></Td>
                  <Td className="text-[13px]">{w.title}</Td>
                  <Td><DomainStatus type="work_order" status={w.status} /></Td>
                  <Td className="max-[720px]:hidden text-[13px] text-text-2">{w.assigneeName}</Td>
                  <Td className="max-[560px]:hidden"><SlaBadge dueAt={w.respondDueAt} breached={isOpen(w.status) && (w.respondDueAt ?? '') < NOW} /></Td>
                  <Td className="text-right"><Money value={w.cost} /></Td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function formatShort(m: MoneyValue): string {
  const major = m.minor / 100;
  if (major >= 1_000_000) return `₦${(major / 1_000_000).toFixed(1)}M`;
  if (major >= 1_000) return `₦${(major / 1_000).toFixed(0)}k`;
  return `₦${major}`;
}
