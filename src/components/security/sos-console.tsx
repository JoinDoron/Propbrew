'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MapPin, QrCode, Radio, Shield, ShieldAlert, ShieldCheck, Timer, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { DomainStatus } from '@/components/domain';
import type { SosStatus } from '@/domain/enums';
import { toneVar, type Tone } from '@/lib/status-tones';
import { transition } from '@/server/actions/transitions';

const ACK_TARGET = 60; // seconds (EM-06)
const ACTION_META: Record<string, { label: string; variant: 'primary' | 'default' | 'danger' }> = {
  ACKNOWLEDGE: { label: 'Acknowledge', variant: 'primary' },
  RESPOND: { label: 'Dispatch responder', variant: 'primary' },
  RESOLVE: { label: 'Resolve', variant: 'default' },
  REVIEW: { label: 'Close & review', variant: 'default' },
};

export type SosView = {
  id: string; ref: string; residentName: string; unitId: string; estateId: string;
  status: string; ackSeconds: number | null; responder: string | null; channel: string; raisedAt: string; actions: string[];
};
type Pass = { id: string; visitor: string; code: string; unit: string; expires: string };

export function SosConsole({ events, canMutate }: { events: SosView[]; canMutate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    const active = events.some((e) => e.status === 'raised');
    if (!active) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [events]);

  const active = events.filter((e) => e.status !== 'reviewed');
  const unack = events.filter((e) => e.status === 'raised').length;
  const acked = events.filter((e) => e.ackSeconds !== null);
  const avgAck = acked.length ? Math.round(acked.reduce((a, e) => a + (e.ackSeconds ?? 0), 0) / acked.length) : 0;
  const resolved = events.filter((e) => ['resolved', 'reviewed'].includes(e.status)).length;

  const fire = (id: string, event: string) => start(async () => { await transition('sos-event', id, event); router.refresh(); });

  // live elapsed for an unacknowledged alert (starts "just now" and climbs)
  const elapsed = () => 14 + tick;

  return (
    <div className="flex flex-col gap-3.5">
      {/* KPIs */}
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Kpi label="Active alerts" value={String(active.length)} tone={unack ? 'danger' : 'success'} icon={<ShieldAlert size={18} />} note={unack ? `${unack} unacknowledged` : 'all acknowledged'} />
        <Kpi label="Avg acknowledge" value={`${avgAck}s`} tone={avgAck <= ACK_TARGET ? 'success' : 'warn'} icon={<Timer size={18} />} note={`target < ${ACK_TARGET}s`} />
        <Kpi label="Unacknowledged" value={String(unack)} tone={unack ? 'danger' : 'success'} icon={<Radio size={18} />} note={unack ? 'respond now' : 'clear'} />
        <Kpi label="Resolved" value={String(resolved)} tone="success" icon={<ShieldCheck size={18} />} note="this shift" />
      </div>

      {/* Active alerts */}
      {active.length > 0 && (
        <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3">
          {active.map((e) => {
            const raised = e.status === 'raised';
            const secs = raised ? elapsed() : e.ackSeconds ?? 0;
            const over = secs > ACK_TARGET;
            return (
              <div key={e.id} className={`rounded-2xl border p-4 ${raised ? 'border-[color:var(--tone-danger)]/50 bg-[color:var(--tone-danger)]/[0.05]' : 'border-border bg-surface'} shadow-card`}>
                <div className="flex items-start gap-3">
                  <div className={raised ? 'animate-[tms-pulse_1.4s_ease-in-out_infinite]' : ''}><AckRing secs={secs} over={over} raised={raised} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[13px] font-bold">{e.ref}</span>
                      <DomainStatus type="sos" status={e.status as SosStatus} />
                      {e.channel === 'sms_fallback' && <span className="text-[10px] text-warning">SMS fallback</span>}
                    </div>
                    <div className="text-[14px] font-semibold mt-1">{e.residentName}</div>
                    <div className="text-[11.5px] text-text-3 flex items-center gap-1"><MapPin size={11} /> Unit {e.unitId}{e.responder ? ` · ${e.responder}` : ''}</div>
                    {raised && <div className={`text-[11.5px] mt-1 font-medium ${over ? 'text-negative' : 'text-warning'}`}>{over ? `⚠ ${secs}s — escalate to backup responder` : `live · ${secs}s elapsed (target ${ACK_TARGET}s)`}</div>}
                  </div>
                </div>
                {canMutate && e.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {e.actions.filter((a) => ACTION_META[a]).map((a) => (
                      <Button key={a} disabled={pending} variant={ACTION_META[a].variant === 'primary' ? 'primary' : 'secondary'} className="!h-8 !text-[12px]" onClick={() => fire(e.id, a)}>{ACTION_META[a].label}</Button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* Incident register */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Shield size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Incident register</span></div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr>{['Ref', 'Resident · Unit', 'Status', 'Ack', 'Responder', 'Channel'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap ${i === 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2.5 border-b border-border font-mono font-semibold text-[13px]">{e.ref}</td>
                    <td className="px-4 py-2.5 border-b border-border"><div className="text-[13px] font-medium">{e.residentName}</div><div className="text-[11px] text-text-3 font-mono">{e.unitId}</div></td>
                    <td className="px-4 py-2.5 border-b border-border"><DomainStatus type="sos" status={e.status as SosStatus} /></td>
                    <td className="px-4 py-2.5 border-b border-border text-right font-mono text-[12.5px]">{e.ackSeconds === null ? <span className="text-negative">pending</span> : <span className={e.ackSeconds <= ACK_TARGET ? 'text-positive' : 'text-warning'}>{e.ackSeconds}s</span>}</td>
                    <td className="px-4 py-2.5 border-b border-border text-[12.5px] text-text-2">{e.responder ?? '—'}</td>
                    <td className="px-4 py-2.5 border-b border-border text-[12px] text-text-3">{e.channel.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          {/* Response SLA */}
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-3"><Timer size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Acknowledge performance</span></div>
            <div className="flex flex-col gap-2">
              {acked.map((e) => (
                <div key={e.id}>
                  <div className="flex items-center justify-between text-[11.5px] mb-0.5"><span className="text-text-2">{e.ref}</span><span className={`font-mono ${(e.ackSeconds ?? 0) <= ACK_TARGET ? 'text-positive' : 'text-warning'}`}>{e.ackSeconds}s</span></div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, ((e.ackSeconds ?? 0) / ACK_TARGET) * 100)}%`, background: toneVar((e.ackSeconds ?? 0) <= ACK_TARGET ? 'success' : 'warn') }} /></div>
                </div>
              ))}
              <div className="text-[10.5px] text-text-3 mt-1">Sub-60s target met on {acked.filter((e) => (e.ackSeconds ?? 99) <= ACK_TARGET).length}/{acked.length}</div>
            </div>
          </div>

          {/* Visitor passes */}
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-2.5"><QrCode size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Visitor passes</span>{canMutate && <button onClick={() => setShowPass(true)} className="ml-auto text-[11.5px] text-primary hover:underline">Issue</button>}</div>
            {passes.length === 0 ? <p className="text-[12px] text-text-3">No active passes.</p> : (
              <div className="flex flex-col gap-1.5">{passes.map((p) => <div key={p.id} className="flex items-center gap-2 text-[12px]"><QrCode size={13} className="text-text-3" /><span className="flex-1 truncate">{p.visitor}</span><span className="font-mono text-text-2">{p.code}</span></div>)}</div>
            )}
          </div>

          {/* Patrol log */}
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-2.5"><UserCheck size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Patrol log</span></div>
            <div className="flex flex-col gap-1.5">
              {[['Block C perimeter', '08:30'], ['Main gate & barrier', '07:45'], ['Block D basement', '06:20']].map(([zone, time]) => (
                <div key={zone} className="flex items-center gap-2 text-[12px]"><CheckCircle2 size={13} className="text-success flex-none" /><span className="flex-1 truncate">{zone}</span><span className="text-text-3 font-mono">{time}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showPass && <IssuePassDialog onClose={() => setShowPass(false)} onIssue={(p) => { setPasses((x) => [p, ...x]); setShowPass(false); }} />}
    </div>
  );
}

function IssuePassDialog({ onClose, onIssue }: { onClose: () => void; onIssue: (p: Pass) => void }) {
  const [visitor, setVisitor] = useState('');
  const [unit, setUnit] = useState('C-12B');
  const code = 'VP-' + Math.abs(hash(visitor + unit)).toString(36).slice(0, 6).toUpperCase();
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)]" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Issue visitor pass</h3><button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-surface-2"><X size={16} /></button></div>
        <input value={visitor} onChange={(e) => setVisitor(e.target.value)} placeholder="Visitor name" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary mb-2" />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Host unit" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary mb-3" />
        {visitor && (
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3 mb-3">
            <div className="w-16 h-16 rounded-lg bg-surface grid grid-cols-4 grid-rows-4 gap-0.5 p-1.5 flex-none">{Array.from({ length: 16 }).map((_, i) => <span key={i} className="rounded-[1px]" style={{ background: (hash(visitor + i) & 1) ? 'var(--text)' : 'transparent' }} />)}</div>
            <div><div className="font-mono text-[15px] font-bold">{code}</div><div className="text-[11px] text-text-3">valid 24h · verified at gate</div></div>
          </div>
        )}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!visitor} onClick={() => onIssue({ id: code, visitor, code, unit, expires: '24h' })}>Issue pass</Button></div>
      </div>
    </div>
  );
}

function AckRing({ secs, over, raised }: { secs: number; over: boolean; raised: boolean }) {
  const tone: Tone = raised ? (over ? 'danger' : 'warn') : 'success';
  const color = toneVar(tone);
  const pct = raised ? Math.min(100, (secs / ACK_TARGET) * 100) : 100;
  return (
    <div className="relative flex-none" style={{ width: 48, height: 48 }}>
      <svg width={48} height={48} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 94.2} 94.2`} /></svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-[11px]" style={{ color }}>{raised ? `${secs}s` : '✓'}</span>
    </div>
  );
}

function Kpi({ label, value, tone, icon, note }: { label: string; value: string; tone: Tone; icon: React.ReactNode; note: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <div className="flex items-start justify-between"><span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span></div>
      <div className="text-[13px] text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[24px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[11px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
