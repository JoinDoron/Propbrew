'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Gauge, CircleDollarSign, Power } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { aiUsage } from '@/domain/platform-admin';

export type AiFeature = { id: string; title: string; benchmark: string; priority: string; calls: number };
type Mode = 'on' | 'shadow' | 'off';

const PRIORITY_TONE: Record<string, Tone> = { Must: 'danger', Should: 'info', Could: 'muted' };
const MODES: { key: Mode; label: string }[] = [{ key: 'on', label: 'On' }, { key: 'shadow', label: 'Shadow' }, { key: 'off', label: 'Off' }];

function naira(minor: number): string {
  const n = minor / 100;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return `₦${Math.round(n)}`;
}

export function AiWorkspace({ features }: { features: AiFeature[] }) {
  const [modes, setModes] = useState<Record<string, Mode>>(() => Object.fromEntries(features.map((f) => [f.id, f.priority === 'Could' ? 'shadow' : 'on'])));
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const billedCalls = useMemo(() => features.reduce((n, f) => n + (modes[f.id] === 'on' ? f.calls : 0), 0), [features, modes]);
  const usage = aiUsage(billedCalls);
  const onCount = features.filter((f) => modes[f.id] === 'on').length;

  const setMode = (f: AiFeature, m: Mode) => {
    setModes((prev) => ({ ...prev, [f.id]: m }));
    flash(m === 'off' ? `${f.id} kill-switch ON — feature disabled` : m === 'shadow' ? `${f.id} in shadow mode (runs, not billed)` : `${f.id} enabled`);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-3">
        <Kpi label="Features on" value={`${onCount} / ${features.length}`} tone="success" icon={<Sparkles size={18} />} />
        <Kpi label="Billed calls" value={billedCalls.toLocaleString()} note="this month" tone="progress" icon={<Gauge size={18} />} />
        <Kpi label="Usage cost" value={naira(usage.costMinor)} note={`${usage.capPct}% of cap`} tone={usage.capPct >= 80 ? 'danger' : 'warn'} icon={<CircleDollarSign size={18} />} />
      </div>

      <div className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[12px] text-text-3">
        §11.4 release-blocking: tenant-scoped retrieval · provider abstraction with fallback · <b>per-feature kill-switch</b> · prompt-injection defence · human review of every suggestion. Usage billed to the client (§15). Toggling a feature <b>Off</b> flips its kill-switch instantly.
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Power size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">AI features & guardrails</span></div>
        <div className="divide-y divide-border">
          {features.map((f) => {
            const mode = modes[f.id];
            return (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                <span className="font-mono text-[11px] text-text-3 w-16 flex-none">{f.id}</span>
                <div className="flex-1 min-w-[160px]">
                  <div className="text-[13px] font-medium">{f.title}</div>
                  <div className="text-[11.5px] text-text-3 truncate">{f.benchmark}</div>
                </div>
                <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(PRIORITY_TONE[f.priority] ?? 'neutral')} 14%, transparent)`, color: toneVar(PRIORITY_TONE[f.priority] ?? 'neutral') }}>{f.priority}</span>
                <div className="inline-flex rounded-lg border border-border-2 overflow-hidden">
                  {MODES.map((m) => (
                    <button key={m.key} onClick={() => setMode(f, m.key)} className={`text-[11px] px-2.5 h-7 ${mode === m.key ? (m.key === 'off' ? 'bg-[color:var(--tone-danger)] text-white' : m.key === 'shadow' ? 'bg-[color:var(--tone-warn)] text-white' : 'bg-primary text-white') : 'text-text-3'}`}>{m.label}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note?: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[13px] text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[21px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      {note && <div className="text-[11px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>}
    </div>
  );
}
