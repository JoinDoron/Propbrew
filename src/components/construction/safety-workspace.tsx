'use client';

import { HardHat, ShieldAlert, AlertOctagon, CalendarCheck, Users, Flame, ArrowUpFromLine, Shovel, Box, Truck, Zap } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { PERMIT_LABEL, SAFETY_EVENT_LABEL, type SafetyPermitType, type SafetyEventKind } from '@/domain/construction';

export type PermitRow = { id: string; ref: string; type: SafetyPermitType; location: string; requestedBy: string; supervisor: string; status: string; validFromISO: string; validToISO: string; controls: string[]; expired: boolean; clash: boolean };
export type EventRow = { id: string; kind: SafetyEventKind; title: string; atISO: string; reportedBy: string; lostDays: number; closed: boolean; action?: string; zoneLabel?: string };
export type TalkRow = { id: string; topic: string; atISO: string; attendees: number; deliveredBy: string };

const PERMIT_ICON: Record<SafetyPermitType, React.ReactNode> = {
  hot_work: <Flame size={15} />, height: <ArrowUpFromLine size={15} />, excavation: <Shovel size={15} />,
  confined_space: <Box size={15} />, lifting: <Truck size={15} />, electrical: <Zap size={15} />,
};
const EVENT_TONE: Record<SafetyEventKind, Tone> = { near_miss: 'warn', first_aid: 'info', lost_time: 'danger', observation: 'muted' };
const STATUS_TONE: Record<string, Tone> = { requested: 'info', active: 'progress', closed: 'muted', expired: 'danger' };

export function SafetyWorkspace({ permits, events, talks, clashes, stats, projectName }: {
  permits: PermitRow[]; events: EventRow[]; talks: TalkRow[];
  clashes: { aRef: string; bRef: string; location: string; aType: SafetyPermitType; bType: SafetyPermitType }[];
  stats: { daysSinceLTI: number | null; lostTimeEvents: number; nearMisses: number; activePermits: number; expiredPermits: number; talksThisMonth: number; score: number; band: Tone };
  projectName: string;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#16100a 0%,#2c1f10 55%,#453017 100%)' }}>
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${toneVar(stats.band)}, transparent 70%)` }} />
        <div className="relative flex items-center gap-5 flex-wrap">
          <Ring score={stats.score} band={stats.band} />
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5"><HardHat size={12} /> SITE SAFETY · {projectName.toUpperCase()}</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-1">
              {stats.daysSinceLTI === null ? 'No lost-time injury on record' : `${stats.daysSinceLTI} days since the last lost-time injury`}
            </div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{stats.activePermits} live permit{stats.activePermits === 1 ? '' : 's'} · {stats.nearMisses} near miss{stats.nearMisses === 1 ? '' : 'es'} reported · {stats.talksThisMonth} toolbox talk{stats.talksThisMonth === 1 ? '' : 's'} this month</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Live permits" value={String(stats.activePermits)} tone="progress" icon={<CalendarCheck size={16} />} />
        <Kpi label="Lapsed permits" value={String(stats.expiredPermits)} tone={stats.expiredPermits ? 'danger' : 'success'} icon={<ShieldAlert size={16} />} />
        <Kpi label="Permit clashes" value={String(clashes.length)} tone={clashes.length ? 'danger' : 'success'} icon={<AlertOctagon size={16} />} />
        <Kpi label="Toolbox talks (30d)" value={String(stats.talksThisMonth)} tone={stats.talksThisMonth >= 2 ? 'success' : 'warn'} icon={<Users size={16} />} />
      </div>

      {/* Clashes */}
      {clashes.length > 0 && (
        <div className="rounded-xl border px-4 py-3 animate-fade" style={{ borderColor: 'color-mix(in srgb, var(--tone-danger) 40%, transparent)', background: 'color-mix(in srgb, var(--tone-danger) 7%, transparent)' }}>
          <div className="flex items-center gap-2 text-[12.5px] font-semibold mb-1.5" style={{ color: toneVar('danger') }}><AlertOctagon size={14} /> Permit clash — same place, same window</div>
          {clashes.map((c, i) => (
            <div key={i} className="text-[12px] text-text-2">
              <span className="font-mono font-semibold">{c.aRef}</span> ({PERMIT_LABEL[c.aType].toLowerCase()}) and <span className="font-mono font-semibold">{c.bRef}</span> ({PERMIT_LABEL[c.bType].toLowerCase()}) are both live at <span className="font-medium">{c.location}</span> — hot work beside work at height needs coordinating before either starts.
            </div>
          ))}
        </div>
      )}

      {/* Permits */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Permits to work</div>
        <div className="divide-y divide-border">
          {permits.map((p) => (
            <div key={p.id} className="px-4 py-3" style={p.clash || p.expired ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex items-start gap-2.5">
                  <span className="w-8 h-8 rounded-lg grid place-items-center flex-none mt-0.5" style={{ background: `color-mix(in srgb, ${toneVar('progress')} 13%, transparent)`, color: toneVar('progress') }}>{PERMIT_ICON[p.type]}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">{p.ref}</span> · {PERMIT_LABEL[p.type]}
                      {p.clash && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 15%, transparent)`, color: toneVar('danger') }}>clash</span>}
                      {p.expired && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 15%, transparent)`, color: toneVar('danger') }}>lapsed</span>}
                    </div>
                    <div className="text-[10.5px] text-text-3">{p.location} · {p.requestedBy} → {p.supervisor} · {p.validFromISO.slice(5)}→{p.validToISO.slice(5)}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.controls.map((c) => <span key={c} className="text-[10px] px-1.5 h-5 inline-flex items-center rounded-full bg-surface-2 text-text-3">{c}</span>)}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-semibold px-2 h-6 inline-flex items-center rounded-full flex-none capitalize" style={{ background: `color-mix(in srgb, ${toneVar(p.expired ? 'danger' : STATUS_TONE[p.status] ?? 'muted')} 14%, transparent)`, color: toneVar(p.expired ? 'danger' : STATUS_TONE[p.status] ?? 'muted') }}>{p.expired ? 'expired' : p.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_300px] gap-3.5 items-start">
        {/* Events */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Safety events <span className="text-[10.5px] text-text-3 font-normal">· reporting near misses is a good sign, not a bad one</span></div>
          <div className="divide-y divide-border">
            {events.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(EVENT_TONE[e.kind])} 14%, transparent)`, color: toneVar(EVENT_TONE[e.kind]) }}>{SAFETY_EVENT_LABEL[e.kind]}</span>
                      {e.title}
                    </div>
                    <div className="text-[10.5px] text-text-3 mt-0.5">{e.atISO}{e.zoneLabel ? ` · ${e.zoneLabel}` : ''} · reported by {e.reportedBy}{e.lostDays ? ` · ${e.lostDays} days lost` : ''}</div>
                    {e.action && <div className="text-[11px] mt-1" style={{ color: toneVar('info') }}>→ {e.action}</div>}
                  </div>
                  <span className="text-[10px] font-semibold px-2 h-5 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(e.closed ? 'success' : 'warn')} 14%, transparent)`, color: toneVar(e.closed ? 'success' : 'warn') }}>{e.closed ? 'closed' : 'open'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Toolbox talks */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Toolbox talks</div>
          <div className="divide-y divide-border">
            {talks.map((t) => (
              <div key={t.id} className="px-4 py-2.5">
                <div className="text-[12px] font-medium">{t.topic}</div>
                <div className="text-[10.5px] text-text-3">{t.atISO} · {t.attendees} attended · {t.deliveredBy}</div>
              </div>
            ))}
            {talks.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">None recorded.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Ring({ score, band }: { score: number; band: Tone }) {
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-bold leading-none" style={{ color }}>{score}</span><span className="text-[8px] text-white/60 uppercase tracking-wide">safety</span></div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
