import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { addMoney, money, type Money as MoneyValue } from '@/domain/primitives';
import { Card, CardHeader, KpiCard, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus, Money } from '@/components/domain';
import { Receipt, Wrench } from 'lucide-react';

/** Resident home — everything scoped to THIS resident's own records (§7 O).
 *  The counts here are computed under the same ScopeFilter as the lists, so the
 *  home never shows a number the resident could not also see in a list. */
export default async function PortalHome() {
  const { actor } = await requireCapability('work_orders');

  const requests = repos.workOrders.list(actor).items;
  const bills = can(actor, 'charges_invoicing', 'read').allowed ? repos.invoices.list(actor).items : [];

  const openReq = requests.filter((w) => !['closed', 'cancelled', 'rejected', 'verified'].includes(w.status)).length;
  const outstanding = bills
    .filter((b) => b.status !== 'paid')
    .reduce<MoneyValue>((a, b) => addMoney(a, money(b.amount.minor - b.paid.minor)), money(0));

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-3.5">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3.5">
        <KpiCard label="Open requests" value={String(openReq)} icon={<Wrench size={18} />} />
        <KpiCard label="Outstanding balance" value={outstanding.minor > 0 ? formatShort(outstanding) : '₦0'} delta={outstanding.minor > 0 ? 'due' : 'all paid'} positive={outstanding.minor === 0} icon={<Receipt size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="My recent requests" subtitle="Maintenance you have raised" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Ref</Th>
              <Th>Job</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {requests.slice(0, 5).map((w) => (
              <TableRow key={w.id}>
                <Td><Mono className="font-semibold text-[13px]">{w.ref}</Mono></Td>
                <Td className="text-[13px]">{w.title}</Td>
                <Td><DomainStatus type="work_order" status={w.status} /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>

      {bills.length > 0 && (
        <Card padded={false}>
          <div className="p-4 sm:p-[18px] pb-0">
            <CardHeader title="My bills" subtitle="Your service charges" />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Due</Th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <TableRow key={b.id}>
                  <Td><Mono className="font-semibold text-[13px]">{b.ref}</Mono></Td>
                  <Td><DomainStatus type="invoice" status={b.status} /></Td>
                  <Td className="text-right"><Money value={b.amount} /></Td>
                  <Td className="text-right font-mono text-[12.5px] text-text-3">{b.dueDate}</Td>
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
  if (major >= 1_000) return `₦${(major / 1_000).toFixed(0)}k`;
  return `₦${major}`;
}
