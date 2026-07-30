'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Copy, ExternalLink, Plus, Ticket, TrendingUp, Sparkles, Check, X, Lock } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { toggleBookingPage, saveBookingPage, addPromoCode, togglePromoCode } from '@/server/actions/shortlet';

export type PromoCode = { code: string; pct: number; active: boolean };
export type Config = { enabled: boolean; slug: string; cancellationPolicy: string; holdHours: number; promoCodes: PromoCode[] };
export type Funnel = { visits: number; searches: number; views: number; enquiries: number; confirmed: number; conversionPct: number };
export type AptFunnel = { name: string; rateMinor: number; views: number; enquiries: number; confirmed: number; conversionPct: number };
export type PreviewApt = { name: string; type: string; rateMinor: number; property: string };

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;

export function BookingPageWorkspace({ config, funnel, aptFunnels, preview, businessName }: { config: Config; funnel: Funnel; aptFunnels: AptFunnel[]; preview: PreviewApt[]; businessName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [slug, setSlug] = useState(config.slug);
  const [policy, setPolicy] = useState(config.cancellationPolicy);
  const [hold, setHold] = useState(String(config.holdHours));
  const [showPreview, setShowPreview] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const url = `book.vesta.ng/${config.slug}`;

  const toggle = () => start(async () => { const r = await toggleBookingPage(); if (r.ok) { router.refresh(); flash(config.enabled ? 'Booking page turned off' : 'Booking page is live'); } else flash(r.error); });
  const save = () => start(async () => { const r = await saveBookingPage({ slug, cancellationPolicy: policy, holdHours: Number(hold) }); if (r.ok) { router.refresh(); flash('Settings saved'); } else flash(r.error); });
  const togglePromo = (code: string) => start(async () => { const r = await togglePromoCode(code); if (r.ok) router.refresh(); });

  const FUNNEL = [
    { label: 'Page visits', value: funnel.visits, tone: 'neutral' as Tone },
    { label: 'Date searches', value: funnel.searches, tone: 'info' as Tone },
    { label: 'Apartment views', value: funnel.views, tone: 'progress' as Tone },
    { label: 'Enquiries', value: funnel.enquiries, tone: 'warn' as Tone },
    { label: 'Confirmed', value: funnel.confirmed, tone: 'success' as Tone },
  ];
  const maxF = Math.max(...FUNNEL.map((f) => f.value), 1);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Header: status + link */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-10 h-10 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(config.enabled ? 'success' : 'neutral')} 14%, transparent)`, color: toneVar(config.enabled ? 'success' : 'neutral') }}><Globe size={20} /></span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold flex items-center gap-2">Your booking page {config.enabled ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('success')} 15%, transparent)`, color: toneVar('success') }}>LIVE</span> : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-3 text-text-3">OFF</span>}</div>
            <div className="text-[11.5px] text-text-3">A public link where guests browse your apartments, check availability, and book.</div>
          </div>
          <button onClick={toggle} disabled={pending} role="switch" aria-checked={config.enabled} className={`ml-auto w-11 h-6 rounded-full relative flex-none transition-colors disabled:opacity-50 ${config.enabled ? 'bg-[color:var(--tone-success)]' : 'bg-surface-3'}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${config.enabled ? 'left-[22px]' : 'left-0.5'}`} /></button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-9 px-3 rounded-lg border border-border-2 bg-surface-2 text-[12.5px] font-mono text-text-2 flex items-center truncate">{url}</div>
          <button onClick={() => { navigator.clipboard?.writeText(`https://${url}`); flash('Link copied'); }} className="h-9 px-3 rounded-lg border border-border-2 text-[12.5px] inline-flex items-center gap-1.5"><Copy size={14} /> Copy</button>
          <button onClick={() => setShowPreview(true)} className="h-9 px-3 rounded-lg bg-primary text-white text-[12.5px] font-medium inline-flex items-center gap-1.5"><ExternalLink size={14} /> Preview</button>
        </div>
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-3.5 items-start">
        {/* Settings */}
        <div className="flex flex-col gap-3.5">
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="text-[12.5px] font-semibold mb-2.5">Settings</div>
            <label className="lblb">Link name</label>
            <div className="flex items-center gap-1"><span className="text-[12px] text-text-3">book.vesta.ng/</span><input value={slug} onChange={(e) => setSlug(e.target.value)} className="inpb flex-1" /></div>
            <label className="lblb mt-2.5">Cancellation policy</label><textarea value={policy} onChange={(e) => setPolicy(e.target.value)} rows={2} className="inpb !h-auto py-2 resize-none" />
            <label className="lblb mt-2.5">Hold dates after a WhatsApp enquiry (hours)</label><input value={hold} onChange={(e) => setHold(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpb" />
            <button onClick={save} disabled={pending} className="mt-3 h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">Save settings</button>
            <style>{`.lblb{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpb{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpb:focus{border-color:var(--primary)}`}</style>
          </div>

          <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Ticket size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Promo codes</span><span className="text-[11px] text-text-3">{config.promoCodes.filter((p) => p.active).length} active</span><button onClick={() => setAdding(true)} className="ml-auto text-[11.5px] text-primary hover:underline inline-flex items-center gap-0.5"><Plus size={12} /> Add</button></div>
            <div className="divide-y divide-border">
              {config.promoCodes.map((p) => (
                <div key={p.code} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="font-mono text-[12.5px] font-bold px-2 py-0.5 rounded bg-surface-2">{p.code}</span>
                  <span className="text-[11.5px] text-text-3">{p.pct}% off</span>
                  <button onClick={() => togglePromo(p.code)} disabled={pending} className={`ml-auto text-[11px] px-2.5 h-6 rounded-full font-semibold ${p.active ? '' : 'text-text-3'}`} style={p.active ? { background: `color-mix(in srgb, ${toneVar('success')} 15%, transparent)`, color: toneVar('success') } : { background: 'var(--surface-3)' }}>{p.active ? 'Active' : 'Paused'}</button>
                </div>
              ))}
              {config.promoCodes.length === 0 && <p className="text-[12px] text-text-3 px-4 py-3">No promo codes yet.</p>}
            </div>
          </div>
        </div>

        {/* Performance */}
        <div className="flex flex-col gap-3.5">
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-2"><TrendingUp size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Booking page performance</span><span className="ml-auto text-[10px] text-text-3">last 30 days</span></div>
            <div className="text-[30px] font-bold tracking-[-0.02em] leading-none">{funnel.conversionPct}%</div>
            <div className="text-[11.5px] text-text-3 mb-3">of enquiries convert to a confirmed booking</div>
            <div className="flex flex-col gap-1.5">
              {FUNNEL.map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-24 text-text-2 flex-none">{f.label}</span>
                  <div className="flex-1 h-4 rounded bg-surface-2 overflow-hidden"><div className="h-full rounded" style={{ width: `${(f.value / maxF) * 100}%`, background: toneVar(f.tone) }} /></div>
                  <span className="w-8 text-right font-mono font-semibold">{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Performance by apartment</div>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr>{['Apartment', 'Views', 'Enq', 'Conf', 'Conv'].map((h, i) => <th key={h} className={`text-[10px] font-semibold uppercase text-text-3 px-3 py-2 border-b border-border ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {aptFunnels.map((a) => (
                    <tr key={a.name} className="hover:bg-surface-2">
                      <td className="px-3 py-2 border-b border-border text-[12.5px] font-medium">{a.name}</td>
                      <td className="px-3 py-2 border-b border-border text-[12px] text-right font-mono text-text-3">{a.views}</td>
                      <td className="px-3 py-2 border-b border-border text-[12px] text-right font-mono text-text-3">{a.enquiries}</td>
                      <td className="px-3 py-2 border-b border-border text-[12px] text-right font-mono text-text-3">{a.confirmed}</td>
                      <td className="px-3 py-2 border-b border-border text-[12px] text-right font-mono font-semibold" style={{ color: toneVar(a.conversionPct >= 50 ? 'success' : a.conversionPct >= 25 ? 'warn' : 'danger') }}>{a.conversionPct}%</td>
                    </tr>
                  ))}
                  {aptFunnels.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-[12px] text-text-3">No direct-booking activity yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-3 flex items-center gap-1.5"><Sparkles size={12} className="text-primary" /> Guests see the accommodation total, any promo discount and the caution — never your cost. Reviews from the Reviews page appear on the public page.</p>

      {showPreview && <PreviewModal apts={preview} businessName={businessName} url={url} onClose={() => setShowPreview(false)} />}
      {adding && <AddPromoDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); flash('Promo code added'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function PreviewModal({ apts, businessName, url, onClose }: { apts: PreviewApt[]; businessName: string; url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.5)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[460px] bg-surface border border-border rounded-2xl shadow-float overflow-hidden animate-[tms-slideup_.2s_ease] max-h-[90vh] flex flex-col">
        {/* browser chrome */}
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border-b border-border flex-none">
          <span className="flex gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" /><span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" /><span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" /></span>
          <div className="flex-1 h-6 rounded-md bg-surface border border-border-2 text-[10.5px] text-text-3 flex items-center gap-1 px-2 truncate"><Lock size={9} /> {url}</div>
          <button onClick={onClose} className="w-6 h-6 rounded grid place-items-center hover:bg-surface-3"><X size={15} /></button>
        </div>
        <div className="overflow-y-auto p-5" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--primary) 6%, var(--surface)), var(--surface))' }}>
          <div className="text-[11px] text-text-3">Book direct with</div>
          <div className="text-[20px] font-bold tracking-[-0.02em]">{businessName}</div>
          <div className="text-[11.5px] text-text-3 mt-0.5">Best rates, no platform fees. Pay by transfer.</div>
          <div className="flex flex-col gap-2.5 mt-4">
            {apts.map((a) => (
              <div key={a.name} className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3 shadow-card">
                <div className="w-12 h-12 rounded-lg flex-none" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 30%, transparent), color-mix(in srgb, var(--tone-info) 25%, transparent))' }} />
                <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold truncate">{a.name}</div><div className="text-[11px] text-text-3">{a.type} · {a.property}</div></div>
                <div className="text-right flex-none"><div className="text-[13px] font-bold font-mono">{money(a.rateMinor)}</div><div className="text-[9px] text-text-3">/night</div></div>
                <button className="h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-medium flex-none">Book</button>
              </div>
            ))}
          </div>
          <div className="text-center text-[10px] text-text-3 mt-4 inline-flex items-center gap-1 w-full justify-center"><Check size={10} className="text-positive" /> Secure · powered by Vesta Short-Let</div>
        </div>
      </div>
    </div>
  );
}

function AddPromoDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState(''); const [pct, setPct] = useState('10'); const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await addPromoCode({ code, pct: Number(pct) }); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[340px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Add promo code</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <label className="lblc">Code</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" className="inpc mb-2 font-mono" autoFocus />
        <label className="lblc">Discount (%)</label><input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpc" />
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !code.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Adding…' : 'Add code'}</button></div>
        <style>{`.lblc{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpc{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpc:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
