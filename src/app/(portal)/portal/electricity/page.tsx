import { requireCapability } from '@/server/guard';
import { getActiveUnitId } from '@/server/active-unit';
import { seed } from '@/server/data';
import { Button, Card, CardHeader, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { Zap } from 'lucide-react';

/** Electricity (resident-home PRD tile) — prepaid power for the active unit.
 *  A lightweight vend surface; live meter readings are out of scope (PRD §8). */
export default async function ElectricityPage() {
  const { actor } = await requireCapability('charges_invoicing');
  const activeUnitId = await getActiveUnitId(actor.unitIds);
  const unit = seed.units.find((u) => u.id === activeUnitId);

  const recent = [
    { date: 'Jul 22', amount: 5000, units: '38.4 kWh', token: '4471 8823 1094 5567' },
    { date: 'Jul 14', amount: 10000, units: '77.1 kWh', token: '9021 4410 7788 2231' },
    { date: 'Jul 03', amount: 5000, units: '38.9 kWh', token: '1120 9345 6612 4480' },
  ];

  return (
    <div className="max-w-[560px] mx-auto flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] text-text-3">Prepaid meter · {unit?.label ?? 'your unit'}</div>
            <div className="font-mono text-[15px] font-bold mt-0.5 text-text">04521 8890 233</div>
          </div>
          <span className="w-11 h-11 rounded-2xl grid place-items-center bg-[color:var(--tone-warn)]/15 text-[color:var(--tone-warn)]">
            <Zap size={22} />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-text-3">Estimated balance</div>
            <div className="text-[16px] font-semibold text-text">21.6 kWh</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-text-3">Tariff</div>
            <div className="text-[16px] font-semibold text-text">₦130 / kWh</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Buy power" subtitle="Vend to this unit's meter — token issued instantly" />
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[2000, 5000, 10000, 20000].map((a) => (
            <button key={a} className="h-11 rounded-xl border border-border text-[13px] font-semibold hover:bg-surface-2 transition">
              ₦{(a / 1000).toFixed(0)}k
            </button>
          ))}
        </div>
        <Button variant="primary" className="w-full mt-3">Buy power</Button>
      </Card>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0"><CardHeader title="Recent purchases" /></div>
        <Table>
          <thead><tr><Th>Date</Th><Th>Amount</Th><Th className="max-[480px]:hidden">Units</Th><Th>Token</Th></tr></thead>
          <tbody>
            {recent.map((r, i) => (
              <TableRow key={i}>
                <Td className="text-[13px]">{r.date}</Td>
                <Td className="text-[13px]">₦{r.amount.toLocaleString()}</Td>
                <Td className="max-[480px]:hidden text-[13px] text-text-2">{r.units}</Td>
                <Td><Mono className="text-[11.5px]">{r.token}</Mono></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
