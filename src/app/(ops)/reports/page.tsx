import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { addMoney, money, type Money as MoneyValue } from '@/domain/primitives';
import { humanizeStatus, statusTone, toneVar } from '@/lib/status-tones';
import { Card, CardHeader, KpiCard } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { AskData } from '@/components/reports/ask-data';
import { Banknote, Wrench, Download } from 'lucide-react';

/** FM-07 / AI-S-02 — reporting & analytics. Every figure is scoped exactly as
 *  its source list, and the AI-S-02 NL-query card is the §11.4 assistive surface
 *  (grounded answers with the underlying records viewable). */
export default async function ReportsPage() {
  const { actor } = await requireCapability('reports_analytics');
  const workOrders = repos.workOrders.list(actor).items;
  const seesInvoices = can(actor, 'charges_invoicing', 'read').allowed;
  const invoices = seesInvoices ? repos.invoices.list(actor).items : [];

  const byStatus = workOrders.reduce<Record<string, number>>((a, w) => ((a[w.status] = (a[w.status] ?? 0) + 1), a), {});
  const total = workOrders.length || 1;
  const preventive = workOrders.filter((w) => w.origin === 'ppm_schedule').length;
  const reactive = workOrders.filter((w) => w.origin === 'resident_request').length;
  const ppmShare = Math.round((preventive / (preventive + reactive || 1)) * 100);

  const billed = invoices.reduce<MoneyValue>((a, i) => addMoney(a, i.amount), money(0));
  const collected = invoices.reduce<MoneyValue>((a, i) => addMoney(a, i.paid), money(0));
  const collectionRate = billed.minor ? Math.round((collected.minor / billed.minor) * 100) : 0;

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />

      <AskData />

      <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-3.5">
        <KpiCard label="Preventive vs reactive" value={`${ppmShare}%`} delta="PPM share" positive={ppmShare >= 50} icon={<Wrench size={18} />} />
        <KpiCard label="Open work orders" value={String(workOrders.filter((w) => !['closed', 'cancelled', 'rejected', 'verified'].includes(w.status)).length)} icon={<Wrench size={18} />} iconBg="rgba(99,102,241,.15)" iconColor="#6366f1" />
        {seesInvoices && <KpiCard label="Collection rate" value={`${collectionRate}%`} icon={<Banknote size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />}
      </div>

      <Card>
        <CardHeader title="Work orders by status" subtitle="Distribution across the §10 lifecycle" action={<span className="inline-flex items-center gap-1.5 text-[12px] text-text-3"><Download size={14} /> CSV / PDF</span>} />
        <div className="mt-4 flex flex-col gap-2.5">
          {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, n]) => (
            <div key={status} className="flex items-center gap-3">
              <span className="w-28 text-[12.5px] text-text-2 flex-none">{humanizeStatus(status)}</span>
              <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                <div className="h-full rounded-md flex items-center justify-end px-2" style={{ width: `${Math.max((n / total) * 100, 6)}%`, background: toneVar(statusTone('work-order', status)) }}>
                  <span className="text-[11px] font-bold text-white">{n}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
