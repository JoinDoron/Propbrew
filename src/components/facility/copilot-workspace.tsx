'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Send, Zap, Package, ShieldAlert, FileText, AlertTriangle, ArrowRight, Fuel, CircleCheck, Loader2 } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { copilotInsights, askCopilot, type CopilotWorld, type Insight } from '@/domain/facility';
import { dispatchWoFromAlarm, acknowledgeAlarm, receiveStock, logRefuel } from '@/server/actions/facility';

const SEV_TONE: Record<Insight['severity'], Tone> = { critical: 'danger', warning: 'warn', info: 'info' };
const CAT_ICON: Record<string, React.ReactNode> = { Alarm: <AlertTriangle size={14} />, Energy: <Zap size={14} />, Inventory: <Package size={14} />, Contracts: <FileText size={14} />, Safety: <ShieldAlert size={14} /> };
const SUGGESTIONS = ['What needs me right now?', 'How is our diesel and fuel?', 'Which contracts are expiring?', 'Any parts below reorder?', "What's our carbon and spend?"];

type Msg = { q: string; a: string; sources: string[] };

export function CopilotWorkspace({ world, userName }: { world: CopilotWorld; userName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [thread, setThread] = useState<Msg[]>([]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const insights = useMemo(() => copilotInsights(world), [world]);
  const counts = useMemo(() => ({ critical: insights.filter((i) => i.severity === 'critical').length, warning: insights.filter((i) => i.severity === 'warning').length }), [insights]);
  const brief = insights.length === 0
    ? 'Everything is nominal — no open alarms, healthy fuel, and no lapsed cover. Nice and quiet.'
    : `I'm tracking ${insights.length} thing${insights.length === 1 ? '' : 's'} across the estate — ${counts.critical} critical and ${counts.warning} to act on. Top of the list: ${insights[0].title.toLowerCase()}.`;

  function ask(question: string) {
    const query = question.trim();
    if (!query) return;
    setQ(''); setThinking(true);
    setTimeout(() => {
      const res = askCopilot(query, world);
      setThread((t) => [{ q: query, a: res.answer, sources: res.sources }, ...t]);
      setThinking(false);
    }, 550);
  }

  function runAction(i: Insight) {
    start(async () => {
      let r: { ok: boolean; error?: string; ref?: string } = { ok: false, error: 'No action' };
      if (i.action.kind === 'dispatch_alarm' && i.action.refId) r = await dispatchWoFromAlarm(i.action.refId);
      else if (i.action.kind === 'ack_alarm' && i.action.refId) r = await acknowledgeAlarm(i.action.refId);
      else if (i.action.kind === 'reorder_part' && i.action.refId) { const p = world.parts.find((x) => x.id === i.action.refId); const qty = p ? Math.max(p.reorderPoint * 2 - p.stock, p.usedPerMonth) : 10; r = await receiveStock(i.action.refId, qty); }
      else if (i.action.kind === 'refuel_gen' && i.action.refId) { const g = world.generators.find((x) => x.id === i.action.refId); const litres = g ? Math.round((g.tankLitres * (100 - g.fuelPct)) / 100) : 200; r = await logRefuel(i.action.refId, litres); }
      if (r.ok) { router.refresh(); flash(r.ref ? `Done · ${r.ref}` : 'Done'); } else flash(r.error ?? 'Failed');
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero brief */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#1a1030 0%,#241b4d 55%,#2b1e63 100%)' }}>
        <div className="absolute -right-8 -top-8 w-52 h-52 rounded-full opacity-20" style={{ background: 'radial-gradient(circle,#a78bfa,transparent 70%)' }} />
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[11px] text-white/70"><Sparkles size={12} /> FACILITY COPILOT · <span className="relative flex h-2 w-2 ml-0.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a78bfa] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#a78bfa]" /></span> live</div>
          <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-1.5">Good day, {userName.split(' ')[0]}.</div>
          <p className="text-[13px] text-white/85 mt-1 max-w-[640px] leading-snug">{brief}</p>
          {/* Ask box */}
          <div className="mt-3.5 flex items-center gap-2 h-11 px-3 rounded-xl bg-white/10 border border-white/15 backdrop-blur max-w-[640px]">
            <Sparkles size={15} className="text-white/60" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(q)} placeholder="Ask about fuel, contracts, stock, safety, carbon…" className="flex-1 bg-transparent outline-none text-[13.5px] text-white placeholder:text-white/45" />
            <button onClick={() => ask(q)} disabled={!q.trim()} className="w-8 h-8 rounded-lg grid place-items-center bg-white text-[#241b4d] disabled:opacity-40"><Send size={15} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2 max-w-[640px]">
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} className="text-[11px] px-2.5 h-7 rounded-full bg-white/8 border border-white/12 text-white/80 hover:bg-white/15">{s}</button>)}
          </div>
        </div>
      </div>

      {/* Conversation */}
      {(thinking || thread.length > 0) && (
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-3">
          {thinking && <div className="flex items-center gap-2 text-[12.5px] text-text-3"><Loader2 size={14} className="animate-spin" /> Reading across your facility signals…</div>}
          {thread.map((m, i) => (
            <div key={i} className="flex flex-col gap-1.5 animate-fade">
              <div className="self-end max-w-[85%] text-[12.5px] bg-primary text-white rounded-2xl rounded-br-sm px-3 py-1.5">{m.q}</div>
              <div className="self-start max-w-[92%] text-[12.5px] bg-surface-2 rounded-2xl rounded-bl-sm px-3 py-2 leading-snug">
                <div className="flex items-center gap-1.5 text-[10px] text-text-3 mb-1"><Sparkles size={11} /> Copilot</div>
                {m.a}
                {m.sources.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{m.sources.slice(0, 4).map((s, j) => <span key={j} className="text-[9.5px] px-1.5 h-4 inline-flex items-center rounded-full bg-surface border border-border text-text-3">{s}</span>)}</div>}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Priority actions */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><ArrowRight size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Priority actions</span><span className="ml-auto text-[11px]" style={{ color: toneVar(insights.length ? 'warn' : 'success') }}>{insights.length ? `${insights.length} open` : 'all clear'}</span></div>
        {insights.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-text-3 flex flex-col items-center gap-2"><CircleCheck size={26} className="text-positive" /> Nothing needs you right now.</div>
        ) : (
          <div className="divide-y divide-border">
            {insights.map((i) => (
              <div key={i.id} className="px-4 py-3 flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg grid place-items-center flex-none mt-0.5" style={{ background: `color-mix(in srgb, ${toneVar(SEV_TONE[i.severity])} 13%, transparent)`, color: toneVar(SEV_TONE[i.severity]) }}>{CAT_ICON[i.category] ?? <Sparkles size={14} />}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium flex items-center gap-1.5">{i.title}<span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full uppercase tracking-wide" style={{ background: `color-mix(in srgb, ${toneVar(SEV_TONE[i.severity])} 14%, transparent)`, color: toneVar(SEV_TONE[i.severity]) }}>{i.severity}</span></div>
                  <div className="text-[11.5px] text-text-3 leading-snug mt-0.5">{i.detail}</div>
                </div>
                {i.action.kind !== 'none' && (
                  <button disabled={pending} onClick={() => runAction(i)} className="text-[11.5px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 flex-none disabled:opacity-50 mt-0.5">{i.action.kind === 'refuel_gen' ? <Fuel size={12} /> : i.action.kind === 'reorder_part' ? <Package size={12} /> : <Send size={12} />} {i.action.label}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}
