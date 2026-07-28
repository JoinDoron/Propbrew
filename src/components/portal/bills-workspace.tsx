'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Check, Download, Zap, AlertCircle, PieChart } from 'lucide-react';
import { formatMoney, DomainStatus } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import type { InvoiceStatus } from '@/domain/enums';
import { billCategory, spendBreakdown } from '@/domain/resident-portal';
import { payChargeFromWallet } from '@/server/actions/resident-home';
import { payAllOutstanding } from '@/server/actions/resident-bills';

export type BillRow = { id: string; ref: string; description: string; status: InvoiceStatus; amountMinor: number; paidMinor: number; dueDate: string; agingDays: number; currency: string };

const UNPAID = ['issued', 'partially_paid', 'overdue', 'in_arrears', 'escalated'];
const money = (m: number, c = 'NGN') => formatMoney({ minor: m, currency: c } as Parameters<typeof formatMoney>[0]);

export function BillsWorkspace({ bills, walletMinor }: { bills: BillRow[]; walletMinor: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState<string | null>(null);
  const [autopay, setAutopay] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const outstanding = bills.filter((b) => UNPAID.includes(b.status));
  const paid = bills.filter((b) => b.status === 'paid');
  const owedTotal = outstanding.reduce((n, b) => n + (b.amountMinor - b.paidMinor), 0);
  const dueSoon = outstanding.filter((b) => b.agingDays >= -3 && b.agingDays <= 0).length;
  const overdue = outstanding.filter((b) => b.agingDays > 0).length;
  const breakdown = useMemo(() => spendBreakdown(paid.map((b) => ({ description: b.description, paidMinor: b.paidMinor }))), [paid]);
  const spendMax = Math.max(...breakdown.map((s) => s.minor), 1);

  const payOne = (ref: string) => { setPaying(ref); start(async () => { const r = await payChargeFromWallet(ref); setPaying(null); if (r.ok) { router.refresh(); flash('Charge paid — receipt saved.'); } else flash(r.error); }); };
  const payAll = () => start(async () => { const r = await payAllOutstanding(); if (r.ok) { router.refresh(); flash(`Cleared ${r.count} charge${r.count === 1 ? '' : 's'} · ${money(r.totalMinor)}.`); } else flash(r.error); });

  function receipt(b: BillRow) {
    const text = `VESTA — PAYMENT RECEIPT\n\nCharge: ${b.ref}\nDescription: ${b.description}\nCategory: ${billCategory(b.description)}\nAmount: ${money(b.amountMinor, b.currency)}\nStatus: PAID\nPaid from: unit wallet (SC-02)\n\nThank you.`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `receipt-${b.ref}.txt`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="rounded-2xl border border-border bg-surface shadow-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] text-text-3">Outstanding</div>
            <div className={`text-[28px] font-bold tracking-[-0.02em] leading-none mt-1 ${owedTotal > 0 ? 'text-warning' : ''}`}>{money(owedTotal)}</div>
            <div className="text-[11.5px] text-text-3 mt-1 flex items-center gap-1"><Wallet size={12} /> Wallet {money(walletMinor)}</div>
          </div>
          {owedTotal > 0 && (
            <button onClick={payAll} disabled={pending} className="h-10 px-4 rounded-xl bg-primary text-white text-[13px] font-semibold shadow-sm hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-1.5"><Check size={15} /> Pay all</button>
          )}
        </div>
        {(dueSoon > 0 || overdue > 0) && (
          <div className="mt-3 rounded-xl bg-[color:var(--tone-warn)]/[0.08] border border-[color:var(--tone-warn)]/30 px-3 py-2 text-[12px] flex items-center gap-2">
            <AlertCircle size={14} className="text-warning flex-none" />
            {overdue > 0 ? <span><b>{overdue}</b> charge{overdue === 1 ? ' is' : 's are'} overdue — clear soon to avoid late fees.</span> : <span><b>{dueSoon}</b> charge{dueSoon === 1 ? '' : 's'} due within 3 days.</span>}
          </div>
        )}
        {/* Autopay */}
        <label className="mt-3 flex items-center gap-2.5 cursor-pointer">
          <button type="button" role="switch" aria-checked={autopay} onClick={() => { setAutopay((v) => !v); flash(autopay ? 'Auto-pay off' : 'Auto-pay on — new charges clear from your wallet automatically'); }} className={`w-9 h-5 rounded-full transition-colors relative flex-none ${autopay ? 'bg-primary' : 'bg-surface-3'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${autopay ? 'left-4' : 'left-0.5'}`} />
          </button>
          <span className="text-[12.5px] flex items-center gap-1.5"><Zap size={13} className="text-primary" /> Auto-pay charges from my wallet</span>
        </label>
      </div>

      {/* Outstanding */}
      {outstanding.length > 0 && (
        <div>
          <h2 className="text-[13.5px] font-semibold mb-2">Charges to pay</h2>
          <div className="flex flex-col gap-2">
            {outstanding.map((b) => (
              <div key={b.id} className="bg-surface border border-border rounded-2xl shadow-card p-3.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">{b.description}</div>
                  <div className="text-[11px] text-text-3 font-mono">{b.ref} · due {b.dueDate}{b.agingDays > 0 ? ` · ${b.agingDays}d overdue` : ''}</div>
                </div>
                <div className="text-right"><div className="text-[14px] font-bold font-mono">{money(b.amountMinor - b.paidMinor, b.currency)}</div><DomainStatus type="invoice" status={b.status} /></div>
                <button onClick={() => payOne(b.ref)} disabled={pending} className="h-9 px-3.5 rounded-xl bg-primary text-white text-[12.5px] font-medium disabled:opacity-50">{paying === b.ref ? 'Paying…' : 'Pay'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spend breakdown */}
      {breakdown.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-3"><PieChart size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Where your money goes</span></div>
          <div className="flex flex-col gap-2">
            {breakdown.map((s) => (
              <div key={s.category}>
                <div className="flex items-center justify-between text-[11.5px] mb-0.5"><span className="text-text-2">{s.category}</span><span className="font-mono text-text-3">{money(s.minor)}</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${(s.minor / spendMax) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {paid.length > 0 && (
        <div>
          <h2 className="text-[13.5px] font-semibold mb-2">Payment history</h2>
          <div className="flex flex-col gap-1.5">
            {paid.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border">
                <span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('success')} 14%, transparent)`, color: toneVar('success') }}><Check size={14} /></span>
                <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{b.description}</div><div className="text-[11px] text-text-3 font-mono">{b.ref}</div></div>
                <span className="text-[13px] font-mono font-semibold">{money(b.amountMinor, b.currency)}</span>
                <button onClick={() => receipt(b)} className="text-text-3 hover:text-primary" aria-label="Download receipt" title="Download receipt"><Download size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}
