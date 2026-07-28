'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Fuel, TrendingUp, Wallet, PieChart, Sparkles } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { logExpense } from '@/server/actions/shortlet';

export type ExpenseRow = { id: string; property: string; propertyId: string; category: string; amountMinor: number; date: string; note: string };
export type Insight = { totalMinor: number; dieselPctOfRevenue: number; costPerOccupiedNightMinor: number; byCategory: { category: string; minor: number; pct: number }[] };

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;
const CATS = ['diesel', 'salary', 'repairs', 'supplies', 'cleaning', 'utilities', 'marketing', 'other'];
const CAT_TONE: Record<string, Tone> = { diesel: 'danger', salary: 'progress', repairs: 'warn', supplies: 'info', cleaning: 'success', utilities: 'neutral', marketing: 'info', other: 'muted' };

export function ExpensesWorkspace({ expenses, properties, insight, revenueMinor }: { expenses: ExpenseRow[]; properties: { id: string; name: string }[]; insight: Insight; revenueMinor: number }) {
  const [logging, setLogging] = useState(false);
  const [prop, setProp] = useState('all');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const profit = revenueMinor - insight.totalMinor;
  const shown = expenses.filter((e) => prop === 'all' || e.propertyId === prop);
  const maxCat = Math.max(...insight.byCategory.map((c) => c.minor), 1);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Expenses" value={money(insight.totalMinor)} tone="danger" icon={<Wallet size={16} />} />
        <Kpi label="Profit" value={money(profit)} note={`${revenueMinor ? Math.round((profit / revenueMinor) * 100) : 0}% margin`} tone={profit >= 0 ? 'success' : 'danger'} icon={<TrendingUp size={16} />} />
        <Kpi label="Diesel / revenue" value={`${insight.dieselPctOfRevenue}%`} tone={insight.dieselPctOfRevenue > 12 ? 'warn' : 'success'} icon={<Fuel size={16} />} />
        <Kpi label="Cost / night" value={money(insight.costPerOccupiedNightMinor)} note="per occupied night" tone="progress" icon={<PieChart size={16} />} />
      </div>

      {insight.dieselPctOfRevenue > 0 && (
        <div className="rounded-xl border border-[color:var(--tone-warn)]/30 bg-[color:var(--tone-warn)]/[0.06] px-4 py-2.5 text-[12px] flex items-center gap-2">
          <Sparkles size={14} className="text-warning flex-none" />
          <span>Diesel is <b>{insight.dieselPctOfRevenue}%</b> of revenue this period — the largest controllable cost for Nigerian short-lets. Consider inverter/solar to protect margin.</span>
        </div>
      )}

      <div className="grid grid-cols-1 min-[720px]:grid-cols-[1fr_300px] gap-3.5 items-start">
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <span className="text-[12.5px] font-semibold">Expense log</span>
            <select value={prop} onChange={(e) => setProp(e.target.value)} className="ml-auto h-7 px-2 rounded-lg border border-border-2 bg-surface text-[11.5px]"><option value="all">All properties</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button onClick={() => setLogging(true)} className="h-7 px-2.5 rounded-lg bg-primary text-white text-[11.5px] font-medium inline-flex items-center gap-1"><Plus size={13} /> Log</button>
          </div>
          <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {shown.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: toneVar(CAT_TONE[e.category] ?? 'neutral') }} />
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium capitalize">{e.category} <span className="text-text-3 font-normal">· {e.note}</span></div><div className="text-[11px] text-text-3">{e.property} · {e.date}</div></div>
                <span className="text-[12.5px] font-mono font-semibold">{money(e.amountMinor)}</span>
              </div>
            ))}
            {shown.length === 0 && <p className="text-[12.5px] text-text-3 px-4 py-6 text-center">No expenses logged.</p>}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-3">By category</div>
          <div className="flex flex-col gap-2">
            {insight.byCategory.map((c) => (
              <div key={c.category}>
                <div className="flex items-center justify-between text-[11.5px] mb-0.5"><span className="capitalize text-text-2">{c.category}</span><span className="font-mono text-text-3">{money(c.minor)} · {c.pct}%</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.minor / maxCat) * 100}%`, background: toneVar(CAT_TONE[c.category] ?? 'neutral') }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {logging && <LogDialog properties={properties} onClose={() => setLogging(false)} onDone={() => { setLogging(false); flash('Expense logged.'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function LogDialog({ properties, onClose, onDone }: { properties: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [propId, setPropId] = useState(properties[0]?.id ?? '');
  const [category, setCategory] = useState('diesel');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('2026-07-26');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await logExpense({ propertyId: propId, category: category as never, amountNaira: Number(amount), date, note }); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[400px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Log expense</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><label className="lbl2">Property</label><select value={propId} onChange={(e) => setPropId(e.target.value)} className="inp2">{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="lbl2">Category</label><select value={category} onChange={(e) => setCategory(e.target.value)} className="inp2 capitalize">{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="lbl2">Amount (₦)</label><input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inp2" placeholder="0" autoFocus /></div>
          <div><label className="lbl2">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="inp2" /></div>
          <div><label className="lbl2">Note</label><input value={note} onChange={(e) => setNote(e.target.value)} className="inp2" placeholder="Optional" /></div>
        </div>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !amount} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : 'Log expense'}</button></div>
        <style>{`.lbl2{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inp2{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inp2:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}

function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note?: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>{note && <div className="text-[10.5px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>}</div>;
}
