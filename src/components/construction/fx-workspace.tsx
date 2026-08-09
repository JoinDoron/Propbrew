'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, TrendingDown, TrendingUp, ArrowRightLeft, RefreshCw, Scale, X, Check, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import {
  fmtM, fmtForeign, CURRENCY_SYMBOL, convertMinor, fxSensitivity,
  type FxExposureRow, type FxPosition, type FxTable,
} from '@/domain/construction';
import type { CurrencyCode } from '@/domain/primitives';
import { updateFxRate } from '@/server/actions/construction';

export type RatePanelRow = { currency: CurrencyCode; rate: number; priorRate?: number; movementPct: number | null; asOfISO: string; hasExposure: boolean };

const naira = (m: number) => `₦${fmtM(m)}`;
/** A payable revalued UP (positive unrealized) is a loss; DOWN is a gain. */
const pnl = (m: number) => (m > 0 ? { label: 'loss', tone: 'danger' as Tone } : m < 0 ? { label: 'gain', tone: 'success' as Tone } : { label: 'flat', tone: 'muted' as Tone });

export function FxWorkspace({ rows, positions, rates, table, unrealizedMinor, spotExposureMinor, canMutate }: {
  rows: FxExposureRow[]; positions: FxPosition[]; rates: RatePanelRow[]; table: FxTable;
  unrealizedMinor: number; spotExposureMinor: number; canMutate: boolean;
}) {
  const [display, setDisplay] = useState<CurrencyCode>('NGN');
  const [shock, setShock] = useState(10);
  const [rateFor, setRateFor] = useState<RatePanelRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3600); };

  // Reporting-currency toggle: reconvert the NGN headline into the chosen lens.
  const inDisplay = (ngnMinor: number) => convertMinor(ngnMinor, 'NGN', display, table);
  const fmtDisplay = (ngnMinor: number) => `${CURRENCY_SYMBOL[display]}${fmtM(inDisplay(ngnMinor))}`;

  const netPnl = pnl(unrealizedMinor);
  const sensitivity = useMemo(() => fxSensitivity(rows, shock), [rows, shock]);
  const displayCurrencies: CurrencyCode[] = ['NGN', 'USD', 'GHS', 'KES'];
  const maxPos = Math.max(1, ...positions.map((p) => Math.abs(p.unrealizedMinor)));

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#04141a 0%,#0a2a30 55%,#12414a 100%)' }}>
        <div className="relative flex items-center gap-3 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Coins size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">FX EXPOSURE · REPORTING IN NGN</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">
              {unrealizedMinor === 0 ? 'No open FX exposure' : <>{naira(Math.abs(unrealizedMinor))} unrealized FX <span style={{ color: toneVar(netPnl.tone) }}>{netPnl.label}</span></>}
            </div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{naira(spotExposureMinor)} of foreign commitments outstanding · booked in NGN, still floating until paid</div>
          </div>
          {/* Reporting-currency toggle */}
          <div className="ml-auto flex items-center gap-1 flex-none rounded-xl p-1" style={{ background: 'rgba(255,255,255,.1)' }}>
            {displayCurrencies.map((c) => (
              <button key={c} onClick={() => setDisplay(c)} className="text-[11px] px-2 h-7 rounded-lg font-semibold" style={display === c ? { background: 'rgba(255,255,255,.9)', color: '#0a2a30' } : { color: 'rgba(255,255,255,.8)' }}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs (respond to the reporting-currency toggle) */}
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label={`Outstanding (in ${display})`} value={fmtDisplay(spotExposureMinor)} tone="info" icon={<ArrowRightLeft size={16} />} />
        <Kpi label={`Unrealized (in ${display})`} value={fmtDisplay(unrealizedMinor)} tone={netPnl.tone} icon={unrealizedMinor > 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />} />
        <Kpi label="Currencies exposed" value={String(positions.length)} tone="progress" icon={<Coins size={16} />} />
        <Kpi label="Commitments" value={String(rows.length)} tone="neutral" icon={<Scale size={16} />} />
      </div>

      {/* Rates */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><RefreshCw size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Exchange rates</span><span className="text-[10.5px] text-text-3">· NGN per 1 unit · move shown vs the rate it replaced</span></div>
        <div className="divide-y divide-border">
          {rates.map((r) => {
            const up = (r.movementPct ?? 0) > 0;
            return (
              <div key={r.currency} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="w-9 h-9 rounded-xl grid place-items-center flex-none text-[13px] font-bold" style={{ background: 'var(--surface-2)' }}>{CURRENCY_SYMBOL[r.currency]}</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">{r.currency} <span className="text-text-3 font-normal">· ₦{r.rate.toLocaleString('en-NG')}</span></div>
                  <div className="text-[10.5px] text-text-3">as of {r.asOfISO}{!r.hasExposure && ' · no open exposure'}</div>
                </div>
                {r.movementPct !== null && (
                  <span className="text-[11px] font-semibold inline-flex items-center gap-0.5 flex-none" style={{ color: toneVar(up ? 'danger' : 'success') }}>
                    {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{up ? '+' : ''}{r.movementPct}%
                    <span className="text-text-3 font-normal ml-1">from ₦{r.priorRate}</span>
                  </span>
                )}
                {canMutate && <button onClick={() => setRateFor(r)} className="ml-auto text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 flex-none"><RefreshCw size={12} /> Reprice</button>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Positions by currency */}
      {positions.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-3">Net position by currency</div>
          <div className="flex flex-col gap-2.5">
            {positions.map((p) => {
              const pl = pnl(p.unrealizedMinor);
              return (
                <div key={p.currency}>
                  <div className="flex justify-between text-[11.5px] mb-0.5">
                    <span className="text-text-2 font-medium">{p.currency} · {fmtForeign(p.outstandingForeignMinor, p.currency)} outstanding <span className="text-text-3">({p.count})</span></span>
                    <span className="font-mono flex-none ml-2" style={{ color: toneVar(pl.tone) }}>{p.unrealizedMinor > 0 ? '−' : p.unrealizedMinor < 0 ? '+' : ''}{naira(Math.abs(p.unrealizedMinor))} {pl.label}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(Math.abs(p.unrealizedMinor) / maxPos) * 100}%`, background: toneVar(pl.tone) }} /></div>
                  <div className="text-[10px] text-text-3 mt-0.5 font-mono">booked {naira(p.bookedMinor)} → spot {naira(p.spotMinor)}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Sensitivity */}
      <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap"><Scale size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">If the naira moves further</span></div>
        <p className="text-[10.5px] text-text-3 mb-3">The outstanding foreign book is fixed, so the NGN cost moves linearly with the rate. Drag to see the extra (or saved) cost to settle.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="range" min={-20} max={20} step={1} value={shock} onChange={(e) => setShock(Number(e.target.value))} className="flex-1 min-w-[180px] accent-[color:var(--primary)]" aria-label="Naira move percentage" />
          <div className="text-right flex-none">
            <div className="text-[12px] text-text-3">naira {shock >= 0 ? 'weakens' : 'strengthens'} {Math.abs(shock)}%</div>
            <div className="text-[18px] font-bold tracking-[-0.02em] font-mono" style={{ color: toneVar(shock === 0 ? 'muted' : shock > 0 ? 'danger' : 'success') }}>{shock > 0 ? '+' : shock < 0 ? '−' : ''}{naira(Math.abs(sensitivity))}</div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          {[-10, -5, 5, 10, 15].map((s) => <button key={s} onClick={() => setShock(s)} className="text-[11px] px-2.5 h-7 rounded-lg border border-border-2" style={shock === s ? { borderColor: 'transparent', background: `color-mix(in srgb, ${toneVar('progress')} 15%, transparent)`, color: toneVar('progress') } : undefined}>{s > 0 ? '+' : ''}{s}%</button>)}
        </div>
      </section>

      {/* Exposure detail */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Foreign commitments <span className="text-[10.5px] text-text-3 font-normal">· revalued on the undelivered portion only</span></div>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[820px]">
            <thead><tr>{['Order', 'Currency', 'Outstanding', 'Booked ₦/fx', 'Spot ₦/fx', 'Booked NGN', 'Spot NGN', 'Unrealized'].map((h, i) => <th key={h} className={`text-[10px] font-semibold uppercase text-text-3 px-4 py-2.5 border-b border-border ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const pl = pnl(r.unrealizedMinor);
                return (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className="px-4 py-2.5 border-b border-border"><div className="text-[12.5px] font-medium">{r.item}</div><div className="text-[10.5px] text-text-3"><span className="font-mono">{r.ref}</span> · {r.vendorName}</div></td>
                    <td className="px-4 py-2.5 border-b border-border"><span className="text-[10.5px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full" style={{ background: 'var(--surface-2)' }}>{r.currency}</span></td>
                    <td className="px-4 py-2.5 border-b border-border text-right"><div className="text-[12px] font-mono">{fmtForeign(r.outstandingForeignMinor, r.currency)}</div><div className="text-[10px] text-text-3">{Math.round(r.outstandingFraction * 100)}% of {fmtForeign(r.foreignMinor, r.currency)}</div></td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono text-text-3">₦{r.bookedRate.toLocaleString('en-NG')}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono">₦{r.spotRate.toLocaleString('en-NG')}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono text-text-3">{naira(r.bookedMinor)}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono">{naira(r.spotMinor)}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono font-semibold" style={{ color: toneVar(pl.tone) }}>{r.unrealizedMinor > 0 ? '−' : r.unrealizedMinor < 0 ? '+' : ''}{naira(Math.abs(r.unrealizedMinor))}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-[13px] text-text-3">No foreign-currency commitments.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-[11px] text-text-3 flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 flex-none" />
        The books stay in NGN: each order posted its NGN value at the booking rate, so earned value and budgets are unaffected. This page revalues only what is still owed. Repricing a currency writes to the audit log and records a market-price variance.
      </div>

      {rateFor && <RepriceDialog key={rateFor.currency} row={rateFor} onClose={() => setRateFor(null)} onDone={(m) => { setRateFor(null); flash(m); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade max-w-[92vw]">{toast}</div>}
    </div>
  );
}

function RepriceDialog({ row, onClose, onDone }: { row: RatePanelRow; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rate, setRate] = useState(String(row.rate));
  const [error, setError] = useState<string | null>(null);
  const next = Number(rate);
  const movePct = next > 0 ? Math.round(((next - row.rate) / row.rate) * 1000) / 10 : 0;
  function submit() { setError(null); start(async () => { const r = await updateFxRate(row.currency, next); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Repriced · ${r.ref}`); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Reprice {row.currency}</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">Current: ₦{row.rate.toLocaleString('en-NG')} / {row.currency}</div><div className="text-text-3">Every outstanding {row.currency} commitment is revalued at the new rate.</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">New rate · NGN per {row.currency}</label>
        <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" autoFocus />
        {next > 0 && next !== row.rate && <div className="text-[11.5px] mt-1.5" style={{ color: toneVar(movePct > 0 ? 'danger' : 'success') }}>{movePct > 0 ? '+' : ''}{movePct}% — naira {movePct > 0 ? 'weakens' : 'strengthens'}, foreign payables cost {movePct > 0 ? 'more' : 'less'}</div>}
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !(next > 0) || next === row.rate} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Saving…' : 'Reprice'}</button></div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
