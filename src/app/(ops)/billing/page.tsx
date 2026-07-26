import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { addMoney, money, type Money as MoneyValue } from '@/domain/primitives';
import { Button, Card, CardHeader, KpiCard, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus, Money, ReadOnlyChip, ScopeBanner } from '@/components/domain';
import { IssueButton } from '@/components/billing-actions';
import { Banknote, Plus, TriangleAlert } from 'lucide-react';

/** EM-01 — service charge & billing. Arrears aging is derived from the invoice
 *  status track (Overdue → In arrears → Escalated) and the days-past-due field. */
export default async function BillingPage() {
  const { actor } = await requireCapability('charges_invoicing');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'charges_invoicing'));
  const rows = repos.invoices.list(actor).items;

  const billed = rows.reduce<MoneyValue>((a, i) => addMoney(a, i.amount), money(0));
  const collected = rows.reduce<MoneyValue>((a, i) => addMoney(a, i.paid), money(0));
  const outstanding = money(billed.minor - collected.minor);
  const rate = billed.minor ? Math.round((collected.minor / billed.minor) * 100) : 0;
  const arrears = rows.filter((i) => ['overdue', 'in_arrears', 'escalated'].includes(i.status));

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />

      <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-3.5">
        <KpiCard label="Collection rate" value={`${rate}%`} icon={<Banknote size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />
        <KpiCard label="Outstanding" value={short(outstanding)} delta={`${arrears.length} in arrears`} positive={arrears.length === 0} icon={<TriangleAlert size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
        <KpiCard label="Billed this cycle" value={short(billed)} icon={<Banknote size={18} />} />
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title="Invoices"
            subtitle="Service charges, collection and arrears aging"
            action={canMutate ? <Button variant="primary" icon={<Plus size={16} />}>Issue charge</Button> : <ReadOnlyChip />}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Resident</Th>
              <Th>Status</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right max-[560px]:hidden">Paid</Th>
              <Th className="text-right">Aging</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <Td><Mono className="font-semibold text-[13px]">{i.ref}</Mono></Td>
                <Td className="text-[13px]">{i.residentName}</Td>
                <Td><DomainStatus type="invoice" status={i.status} /></Td>
                <Td className="text-right"><Money value={i.amount} /></Td>
                <Td className="text-right max-[560px]:hidden"><Money value={i.paid} /></Td>
                <Td className="text-right">
                  {i.agingDays > 0 ? (
                    <span className="font-mono text-[12.5px] text-warning">{i.agingDays}d</span>
                  ) : (
                    <span className="font-mono text-[12.5px] text-text-3">—</span>
                  )}
                </Td>
                <Td className="text-right">
                  {canMutate && i.status === 'draft' ? <IssueButton invoiceRef={i.ref} /> : <span className="text-text-3 text-[12px]">—</span>}
                </Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function short(m: MoneyValue): string {
  const major = m.minor / 100;
  if (major >= 1_000_000) return `₦${(major / 1_000_000).toFixed(1)}M`;
  if (major >= 1_000) return `₦${(major / 1_000).toFixed(0)}k`;
  return `₦${major}`;
}
