import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { Card, CardHeader, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus, Money } from '@/components/domain';
import { PayButton } from '@/components/billing-actions';

/** EM-01 (resident view) — My Bills. Payments are the ONE mutation a resident may
 *  make (§7 Payments = O for Res only); everything else is read. */
export default async function MyBillsPage() {
  const { actor } = await requireCapability('charges_invoicing');
  const rows = repos.invoices.list(actor).items;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-3.5">
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[12px] text-text-3">
        Charges are settled from your unit wallet — paying tops the wallet up to cover the amount and clears the
        charge from it. Funds you add always clear pending charges first.
      </div>
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="My bills" subtitle="Your service charges and payments" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Description</Th>
              <Th>Status</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right"></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const owing = b.amount.minor - b.paid.minor;
              return (
                <TableRow key={b.id}>
                  <Td><Mono className="font-semibold text-[13px]">{b.ref}</Mono></Td>
                  <Td className="text-[13px]">{b.description}</Td>
                  <Td><DomainStatus type="invoice" status={b.status} /></Td>
                  <Td className="text-right"><Money value={b.amount} /></Td>
                  <Td className="text-right">
                    {owing > 0 && b.status !== 'draft' ? (
                      <PayButton invoiceRef={b.ref} />
                    ) : (
                      <span className="text-[12px] text-text-3">—</span>
                    )}
                  </Td>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
