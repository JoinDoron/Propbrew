'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, Bell, Sparkles, TrendingUp, TriangleAlert, X } from 'lucide-react';
import { KpiCard, StatusPill, Button } from '@/components/ui';
import { DomainStatus, formatMoney } from '@/components/domain';
import { toneVar, type Tone } from '@/lib/status-tones';
import { assessDefaulters, collectionsForecast, agingBuckets, BAND_TONE, type DefaulterRisk } from '@/domain/billing';
import type { Invoice } from '@/domain/entities';
import type { InvoiceStatus } from '@/domain/enums';
import { sendReminderCampaign } from '@/server/actions/billing';

const naira = (minor: number) => '₦' + Math.round(minor / 100).toLocaleString('en-NG');
const shortNaira = (minor: number) => {
  const n = minor / 100;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return `₦${Math.round(n)}`;
};

export function BillingWorkspace({ invoices, canMutate }: { invoices: Invoice[]; canMutate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<DefaulterRisk[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const defaulters = useMemo(() => assessDefaulters(invoices), [invoices]);
  const forecast = useMemo(() => collectionsForecast(invoices), [invoices]);
  const buckets = useMemo(() => agingBuckets(invoices), [invoices]);
  const bucketTotal = buckets.reduce((a, b) => a + b.minor, 0) || 1;

  const highRisk = defaulters.filter((d) => d.band !== 'ok');
  const sel = defaulters.find((d) => d.ownerUserId === selected) ?? null;
  const selInvoices = sel ? invoices.filter((i) => String(i.ownerUserId) === sel.ownerUserId) : [];

  const runCampaign = (targets: DefaulterRisk[]) => {
    start(async () => {
      const r = await sendReminderCampaign(targets.map((t) => t.ownerUserId));
      setCampaign(null);
      if (r.ok) { setToast(`Reminders queued to ${r.sent} resident${r.sent === 1 ? '' : 's'} — no penalty applied.`); router.refresh(); }
      else setToast(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Collections health + KPIs */}
      <div className="grid grid-cols-1 min-[900px]:grid-cols-[300px_1fr] gap-3.5">
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4 flex items-center gap-4">
          <Dial pct={forecast.rate} projected={forecast.projectedRate} />
          <div className="min-w-0">
            <div className="text-[11px] text-text-3 uppercase tracking-wide">Collection rate</div>
            <div className="text-[13px] font-semibold mt-0.5">now {forecast.rate}% · forecast {forecast.projectedRate}%</div>
            <div className="text-[11.5px] text-text-3 mt-1">{shortNaira(forecast.projectedMinor - forecast.collectedMinor)} more expected this cycle</div>
          </div>
        </div>
        <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-3">
          <KpiCard label="Outstanding" value={shortNaira(forecast.outstandingMinor)} icon={<Banknote size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
          <KpiCard label="At-risk (AI-E-03)" value={shortNaira(forecast.atRiskMinor)} delta={`${highRisk.length} resident(s)`} positive={highRisk.length === 0} icon={<Sparkles size={18} />} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" />
          <KpiCard label="Forecast inflow" value={shortNaira(forecast.projectedMinor)} delta="this cycle" positive icon={<TrendingUp size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />
          <KpiCard label="Billed" value={shortNaira(forecast.billedMinor)} icon={<Banknote size={18} />} />
        </div>
      </div>

      {/* Aging waterfall */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-3"><TriangleAlert size={14} className="text-warning" /><span className="text-[12.5px] font-semibold">Arrears aging</span><span className="text-[11px] text-text-3 ml-auto">{shortNaira(bucketTotal)} outstanding</span></div>
        <div className="h-3 rounded-full overflow-hidden flex mb-2.5 bg-surface-2">
          {buckets.map((b) => b.minor > 0 && <span key={b.key} title={`${b.label}: ${naira(b.minor)}`} style={{ width: `${(b.minor / bucketTotal) * 100}%`, background: toneVar(b.tone) }} />)}
        </div>
        <div className="grid grid-cols-2 min-[720px]:grid-cols-5 gap-2">
          {buckets.map((b) => (
            <div key={b.key} className="rounded-lg bg-surface-2 p-2">
              <div className="flex items-center gap-1.5 text-[10.5px] text-text-3"><span className="w-2 h-2 rounded-sm" style={{ background: toneVar(b.tone) }} />{b.label}</div>
              <div className="text-[14px] font-semibold font-mono mt-0.5">{shortNaira(b.minor)}</div>
              <div className="text-[10.5px] text-text-3">{b.count} invoice{b.count === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Defaulter watchlist + invoices */}
      <div className="grid grid-cols-1 min-[900px]:grid-cols-[360px_1fr] gap-3.5 items-start">
        <div className="bg-surface border border-border rounded-2xl shadow-card">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
            <Sparkles size={14} className="text-primary" /><span className="text-[12.5px] font-semibold">Defaulter watchlist</span>
            {canMutate && highRisk.length > 0 && <button onClick={() => setCampaign(highRisk)} className="ml-auto text-[11.5px] text-primary hover:underline inline-flex items-center gap-1"><Bell size={12} /> Remind all</button>}
          </div>
          {defaulters.length === 0 ? <div className="p-6 text-center text-[13px] text-text-3">No outstanding balances — all clear.</div> : defaulters.map((d) => (
            <button key={d.ownerUserId} onClick={() => setSelected(d.ownerUserId)} className={`flex items-center gap-3 w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors ${selected === d.ownerUserId ? 'bg-primary-weak/40' : 'hover:bg-surface-2'}`}>
              <ScoreDial score={d.score} band={d.band} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">{d.residentName}</div>
                <div className="text-[11.5px] text-text-3 truncate">{d.drivers[0].value} · {d.drivers[1].value}</div>
              </div>
              <div className="text-right flex-none">
                <div className="text-[12.5px] font-mono font-semibold text-warning">{shortNaira(d.outstandingMinor)}</div>
                <StatusPill status={`${d.band === 'ok' ? 'low' : d.band} risk`} tone={BAND_TONE[d.band]} />
              </div>
            </button>
          ))}
        </div>

        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Invoices</div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr>{['Invoice', 'Resident', 'Status', 'Amount', 'Owed', 'Aging'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap ${i >= 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} onClick={() => setSelected(String(i.ownerUserId))} className="hover:bg-surface-2 transition-colors cursor-pointer">
                    <td className="px-4 py-2.5 border-b border-border font-mono font-semibold text-[13px]">{i.ref}</td>
                    <td className="px-4 py-2.5 border-b border-border text-[13px]">{i.residentName}</td>
                    <td className="px-4 py-2.5 border-b border-border"><DomainStatus type="invoice" status={i.status as InvoiceStatus} /></td>
                    <td className="px-4 py-2.5 border-b border-border text-right font-mono text-[12.5px]">{formatMoney(i.amount)}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right font-mono text-[12.5px]">{i.amount.minor - i.paid.minor > 0 ? naira(i.amount.minor - i.paid.minor) : '—'}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right font-mono text-[12.5px]">{i.agingDays > 0 ? <span className="text-warning">{i.agingDays}d</span> : <span className="text-text-3">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Statement drawer */}
      {sel && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          <div className="absolute inset-0 bg-[rgba(10,12,20,.4)]" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-[420px] h-full bg-surface border-l border-border shadow-float overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-start gap-2 z-10">
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold truncate">{sel.residentName}</h3>
                <div className="flex items-center gap-2 mt-1"><StatusPill status={`${sel.band === 'ok' ? 'low' : sel.band} risk · ${sel.score}`} tone={BAND_TONE[sel.band]} /><span className="text-[11.5px] text-text-3">pays ~{Math.round(sel.payProbability * 100)}%</span></div>
              </div>
              <button onClick={() => setSelected(null)} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-surface-2 flex-none"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-2">
                {sel.drivers.map((d) => <div key={d.label} className="rounded-lg bg-surface-2 p-2.5"><div className="text-[10px] text-text-3 uppercase tracking-wide">{d.label}</div><div className="text-[12.5px] font-semibold mt-0.5 capitalize">{d.value}</div></div>)}
              </div>
              <div className="rounded-lg bg-surface-2 p-2.5 flex items-center justify-between"><span className="text-[11px] text-text-3 uppercase tracking-wide">Outstanding</span><span className="text-[16px] font-semibold font-mono text-warning">{naira(sel.outstandingMinor)}</span></div>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3 mb-2">Statement</div>
                <div className="flex flex-col gap-1.5">
                  {selInvoices.map((i) => (
                    <div key={i.id} className="flex items-center gap-2 text-[12px]">
                      <span className="font-mono font-semibold flex-none">{i.ref}</span>
                      <DomainStatus type="invoice" status={i.status as InvoiceStatus} />
                      <span className="ml-auto font-mono text-text-2">{formatMoney(i.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {canMutate && (
                <Button variant="primary" icon={<Bell size={15} />} disabled={pending} onClick={() => runCampaign([sel])}>Send payment reminder</Button>
              )}
              <p className="text-[11px] text-text-3">AI-E-03: reminders only — penalties are never applied automatically.</p>
            </div>
          </div>
        </div>
      )}

      {/* Campaign confirm */}
      {campaign && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[rgba(10,12,20,.45)]" onClick={() => setCampaign(null)} />
          <div className="relative w-full max-w-[400px] bg-surface border border-border rounded-2xl shadow-float p-4">
            <div className="flex items-center gap-2 mb-2"><Bell size={16} className="text-primary" /><h3 className="text-[15px] font-semibold">Reminder campaign</h3></div>
            <p className="text-[12.5px] text-text-2">Queue payment reminders to <strong>{campaign.length}</strong> at-risk resident(s) via in-app, SMS and email. This applies no penalty — the AI only suggests timing (AI-E-03).</p>
            <ul className="mt-2.5 flex flex-col gap-1 max-h-40 overflow-y-auto">
              {campaign.map((c) => <li key={c.ownerUserId} className="flex items-center gap-2 text-[12px]"><StatusPill status={c.band} tone={BAND_TONE[c.band]} /><span>{c.residentName}</span><span className="ml-auto font-mono text-text-3">{shortNaira(c.outstandingMinor)}</span></li>)}
            </ul>
            <div className="flex items-center gap-2 justify-end mt-3">
              <Button variant="secondary" onClick={() => setCampaign(null)} disabled={pending}>Cancel</Button>
              <Button variant="primary" onClick={() => runCampaign(campaign)} disabled={pending}>Send {campaign.length} reminder(s)</Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] bg-surface border border-border rounded-xl shadow-float px-4 py-2.5 text-[12.5px] flex items-center gap-2 animate-fade">
          <Bell size={14} className="text-primary" />{toast}
          <button onClick={() => setToast(null)} className="ml-2 text-text-3 hover:text-text-2"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}

function Dial({ pct, projected }: { pct: number; projected: number }) {
  const tone: Tone = pct >= 80 ? 'success' : pct >= 55 ? 'warn' : 'danger';
  const color = toneVar(tone);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-3)" strokeWidth="3.5" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={`color-mix(in srgb, ${color} 40%, transparent)`} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(projected / 100) * 97.4} 97.4`} />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono font-bold text-[20px] leading-none" style={{ color }}>{pct}%</span></div>
    </div>
  );
}

function ScoreDial({ score, band }: { score: number; band: string }) {
  const color = toneVar(BAND_TONE[band as keyof typeof BAND_TONE]);
  return (
    <div className="relative flex-none" style={{ width: 38, height: 38 }}>
      <svg width={38} height={38} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(score / 100) * 94.2} 94.2`} /></svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-[11px]" style={{ color }}>{score}</span>
    </div>
  );
}
