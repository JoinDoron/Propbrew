'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Timer, Sparkles, Users, Wallet, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { formatMoney } from '@/components/domain';
import { toneVar, type Tone } from '@/lib/status-tones';
import { slaState, workload, triageSuggestions, costRollup, isOpen, type Sla } from '@/domain/work-orders';
import type { WorkOrder } from '@/domain/entities';

const PRIORITY_TONE: Record<string, Tone> = { emergency: 'danger', high: 'danger', routine: 'warn', low: 'neutral' };

function fmtRemaining(ms: number): string {
  const past = ms < 0;
  const a = Math.abs(ms);
  const h = Math.floor(a / 3_600_000);
  const m = Math.floor((a % 3_600_000) / 60_000);
  const s = Math.floor((a % 60_000) / 1000);
  const core = h >= 1 ? `${h}h ${m}m` : m >= 1 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
  return past ? `${core} over` : core;
}

export function WorkOrdersIntel({ wos, nowMs, canMutate }: { wos: WorkOrder[]; nowMs: number; canMutate: boolean }) {
  const [now, setNow] = useState(nowMs);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const open = wos.filter(isOpen);
  const withSla = open.map((w) => ({ w, sla: slaState(w, now) })).filter((x) => x.sla.state !== 'none');
  const breaching = withSla.filter((x) => x.sla.state !== 'ok');
  const unassigned = open.filter((w) => !w.assigneeName || w.assigneeName === 'Unassigned' || w.assigneeName === '—').length;
  const loads = workload(wos);
  const maxLoad = Math.max(...loads.map((l) => l.open), 1);
  const triage = triageSuggestions(wos).filter((t) => !dismissed.has(t.id));
  const cost = costRollup(wos);
  const money = (minor: number) => formatMoney({ minor, currency: 'NGN' } as Parameters<typeof formatMoney>[0]);

  const watch = [...withSla].sort((a, b) => (a.sla.msRemaining ?? 0) - (b.sla.msRemaining ?? 0)).slice(0, 5);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Kpi label="Open" value={String(open.length)} note={`${wos.length} total`} tone="info" icon={<Timer size={18} />} />
        <Kpi label="SLA breaching" value={String(breaching.length)} note="live · respond/resolve" tone={breaching.length ? 'danger' : 'success'} icon={<AlertTriangle size={18} />} />
        <Kpi label="Unassigned" value={String(unassigned)} note={unassigned ? 'needs an owner' : 'all assigned'} tone={unassigned ? 'warn' : 'success'} icon={<Users size={18} />} />
        <Kpi label="Spend" value={money(cost.totalMinor)} note={`${cost.withCost} costed · avg ${money(cost.avgMinor)}`} tone="progress" icon={<Wallet size={18} />} />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* AI triage queue */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Sparkles size={14} className="text-primary" /><span className="text-[12.5px] font-semibold">AI triage suggestions</span><span className="text-[10.5px] text-text-3 ml-auto">AI-F-02 · advisory, you decide</span></div>
          {triage.length === 0 ? (
            <p className="text-[12.5px] text-text-3 px-4 py-4">Every open job is triaged and assigned. Nothing waiting.</p>
          ) : (
            <div className="divide-y divide-border">
              {triage.map((t) => (
                <div key={t.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/work-orders/${t.ref}`} className="font-mono text-[12.5px] font-bold hover:text-primary">{t.ref}</Link>
                    <span className="text-[13px] font-medium truncate">{t.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap text-[11.5px]">
                    <span className="text-text-3">Suggest:</span>
                    <span className="px-1.5 h-[20px] inline-flex items-center rounded-md font-semibold capitalize" style={{ background: `color-mix(in srgb, ${toneVar(PRIORITY_TONE[t.suggestedPriority])} 14%, transparent)`, color: toneVar(PRIORITY_TONE[t.suggestedPriority]) }}>{t.suggestedPriority}{t.escalate && ' ↑'}</span>
                    <span className="text-text-2">→ {t.suggestedAssignee}</span>
                    <span className="text-text-3">· {t.reason}</span>
                  </div>
                  {canMutate && (
                    <div className="flex gap-2 mt-2">
                      <Link href={`/work-orders/${t.ref}`} className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1">Open to assign <ArrowUpRight size={12} /></Link>
                      <button onClick={() => setDismissed((s) => new Set(s).add(t.id))} className="text-[11.5px] text-text-3 hover:text-text-2">Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          {/* SLA watch — live countdown */}
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-3"><Timer size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">SLA watch</span><span className="ml-auto text-[10px] text-text-3 tabular-nums">live</span></div>
            <div className="flex flex-col gap-2">
              {watch.length === 0 && <p className="text-[12px] text-text-3">No open SLAs.</p>}
              {watch.map(({ w, sla }) => (
                <SlaRow key={w.id} ref_={w.ref} title={w.title} sla={sla} />
              ))}
            </div>
          </div>

          {/* Workload balancer */}
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-3"><Users size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Workload</span></div>
            <div className="flex flex-col gap-2.5">
              {loads.length === 0 && <p className="text-[12px] text-text-3">No assigned open jobs.</p>}
              {loads.map((l) => (
                <div key={l.assignee}>
                  <div className="flex items-center justify-between text-[11.5px] mb-0.5"><span className="text-text-2 truncate">{l.assignee}</span><span className="font-mono text-text-3">{l.open}{l.critical ? ` · ${l.critical}⚠` : ''}</span></div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(l.open / maxLoad) * 100}%`, background: toneVar(l.tone) }} /></div>
                </div>
              ))}
              {loads.some((l) => l.tone === 'danger') && <p className="text-[10.5px] text-warning mt-1">Rebalance: someone is carrying 4+ open jobs.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlaRow({ ref_, title, sla }: { ref_: string; title: string; sla: Sla }) {
  return (
    <Link href={`/work-orders/${ref_}`} className="flex items-center gap-2.5 group">
      <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: toneVar(sla.tone) }} />
      <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate group-hover:text-primary">{ref_}</div><div className="text-[10.5px] text-text-3 truncate">{title}</div></div>
      <span className="font-mono text-[12px] font-semibold tabular-nums flex-none" style={{ color: toneVar(sla.tone) }}>{sla.msRemaining === null ? '—' : fmtRemaining(sla.msRemaining)}</span>
    </Link>
  );
}

function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[13px] text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[21px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[11px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}
