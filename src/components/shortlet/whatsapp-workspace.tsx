'use client';

import { useState } from 'react';
import { MessageCircle, Send, Check, CheckCheck, Clock, Zap, Sparkles, Crown } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type Template = { key: string; label: string; trigger: string; body: string };
export type TimelineMsg = { key: string; label: string; whenISO: string; status: string; preview: string };
export type TimelineRow = { id: string; ref: string; guest: string; apt: string; messages: TimelineMsg[] };
export type WaStats = { sent: number; scheduled: number; delivered: number; read: number };

const STATUS_TONE: Record<string, Tone> = { sent: 'success', scheduled: 'info', pending: 'neutral', skipped: 'muted' };

export function WhatsappWorkspace({ stats, templates: initial, sampleVars, timeline }: { stats: WaStats; templates: Template[]; sampleVars: Record<string, string>; timeline: TimelineRow[] }) {
  const [templates, setTemplates] = useState(initial);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(Object.fromEntries(initial.map((t) => [t.key, true])));
  const [openId, setOpenId] = useState(timeline[0]?.id ?? '');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const render = (body: string) => body.replace(/\{\{(\w+)\}\}/g, (_, k) => sampleVars[k] ?? `{{${k}}}`);
  const active = timeline.find((t) => t.id === openId) ?? timeline[0];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-xl px-4 py-2.5 text-[12px] flex items-center gap-2 flex-wrap" style={{ background: 'color-mix(in srgb, #25D366 8%, transparent)', border: '1px solid color-mix(in srgb, #25D366 30%, transparent)' }}>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: '#25D366', color: '#fff' }}><Crown size={10} /> Starter tier+</span>
        <span className="text-text-2">Automated guest messaging via the WhatsApp Business API. Templated per booking, sent from your number. Per-conversation cost is metered.</span>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Sent" value={String(stats.sent)} tone="success" icon={<Send size={16} />} />
        <Kpi label="Scheduled" value={String(stats.scheduled)} tone="info" icon={<Clock size={16} />} />
        <Kpi label="Delivered" value={stats.sent ? `${Math.round((stats.delivered / stats.sent) * 100)}%` : '—'} tone="progress" icon={<Check size={16} />} />
        <Kpi label="Read" value={stats.sent ? `${Math.round((stats.read / stats.sent) * 100)}%` : '—'} tone="success" icon={<CheckCheck size={16} />} />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_360px] gap-3.5 items-start">
        {/* Templates + automations */}
        <div className="flex flex-col gap-2.5">
          {templates.map((t, i) => (
            <div key={t.key} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: 'color-mix(in srgb, #25D366 14%, transparent)', color: '#1da851' }}><MessageCircle size={15} /></span>
                <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">{t.label}</div><div className="text-[10.5px] text-text-3 flex items-center gap-1"><Zap size={10} /> {t.trigger}</div></div>
                <button role="switch" aria-checked={enabled[t.key]} onClick={() => { setEnabled((p) => ({ ...p, [t.key]: !p[t.key] })); flash(enabled[t.key] ? `${t.label} paused` : `${t.label} on`); }} className={`w-9 h-5 rounded-full relative flex-none transition-colors ${enabled[t.key] ? 'bg-[#25D366]' : 'bg-surface-3'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enabled[t.key] ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>
              <textarea value={t.body} onChange={(e) => setTemplates((prev) => prev.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} rows={2} className="w-full mt-2.5 px-2.5 py-2 rounded-lg border border-border-2 bg-surface text-[12px] leading-relaxed outline-none focus:border-primary resize-none" />
              <div className="mt-1.5 rounded-lg p-2.5 text-[11.5px] leading-relaxed" style={{ background: 'color-mix(in srgb, #25D366 7%, transparent)' }}>{render(t.body)}</div>
            </div>
          ))}
          <p className="text-[10.5px] text-text-3 flex items-center gap-1"><Sparkles size={11} /> Variables like <code className="font-mono">{'{{guest}}'}</code>, <code className="font-mono">{'{{wifi}}'}</code>, <code className="font-mono">{'{{link}}'}</code> auto-fill per booking.</p>
        </div>

        {/* Message timeline */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
            <MessageCircle size={14} className="text-text-3" />
            <select value={openId} onChange={(e) => setOpenId(e.target.value)} className="flex-1 h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12px] outline-none">
              {timeline.map((t) => <option key={t.id} value={t.id}>{t.guest} · {t.apt}</option>)}
            </select>
          </div>
          <div className="p-3 flex flex-col gap-2.5" style={{ background: 'color-mix(in srgb, var(--surface-2) 60%, transparent)' }}>
            {active?.messages.map((m) => (
              <div key={m.key} className="flex flex-col items-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-[11.5px] leading-relaxed shadow-sm" style={{ background: m.status === 'sent' ? '#DCF8C6' : 'var(--surface)', color: m.status === 'sent' ? '#0b1f14' : 'var(--text-2)', border: m.status !== 'sent' ? '1px dashed var(--border-2)' : 'none' }}>
                  {m.preview}
                  <div className="flex items-center gap-1 justify-end mt-1 text-[9px]" style={{ color: m.status === 'sent' ? '#3a7d54' : 'var(--text-3)' }}>
                    {m.whenISO.slice(5)}
                    {m.status === 'sent' ? <CheckCheck size={11} /> : m.status === 'scheduled' ? <Clock size={10} /> : null}
                  </div>
                </div>
                <span className="text-[9px] mt-0.5 font-semibold uppercase" style={{ color: toneVar(STATUS_TONE[m.status] ?? 'neutral') }}>{m.label} · {m.status}</span>
              </div>
            ))}
            {!active && <p className="text-[12px] text-text-3 text-center py-6">No bookings to message.</p>}
          </div>
        </div>
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
