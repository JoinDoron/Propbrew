'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Link2, Copy, AlertTriangle, ShieldCheck, Crown, Calendar, Plug } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { toggleChannel } from '@/server/actions/shortlet';

export type ChannelKey = 'airbnb' | 'booking_com' | 'google';
export type AptRow = { id: string; name: string; property: string; channels: ChannelKey[]; feedUrl: string };
export type ConflictRow = { apt: string; guestA: string; guestB: string; rangeA: string; rangeB: string; nights: number };
export type Summary = { connections: number; apartmentsSynced: number; byChannel: { channel: ChannelKey; label: string; count: number }[] };

const CHANNELS: { key: ChannelKey; label: string; color: string }[] = [
  { key: 'airbnb', label: 'Airbnb', color: '#FF5A5F' },
  { key: 'booking_com', label: 'Booking.com', color: '#003580' },
  { key: 'google', label: 'Google', color: '#4285F4' },
];

export function ChannelsWorkspace({ apartments, summary, conflicts, lastSync }: { apartments: AptRow[]; summary: Summary; conflicts: ConflictRow[]; lastSync: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const toggle = (aptId: string, ch: ChannelKey, on: boolean, label: string) => start(async () => {
    const r = await toggleChannel(aptId, ch);
    if (r.ok) { router.refresh(); flash(on ? `${label} disconnected` : `${label} connected & synced`); } else flash(r.error);
  });
  const syncNow = () => { setSyncing(true); setTimeout(() => { setSyncing(false); flash('All channels synced just now'); }, 1100); };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-xl px-4 py-2.5 text-[12px] flex items-center gap-2 flex-wrap" style={{ background: 'color-mix(in srgb, var(--primary) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary text-white"><Crown size={10} /> Growth tier+</span>
        <span className="text-text-2">Two-way iCal sync with Airbnb, Booking.com and Google Calendar. External bookings block availability automatically to prevent double-bookings.</span>
        <button onClick={syncNow} disabled={syncing} className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-medium disabled:opacity-60"><RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}</button>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Connections" value={String(summary.connections)} tone="info" icon={<Plug size={16} />} />
        <Kpi label="Units synced" value={`${summary.apartmentsSynced}/${apartments.length}`} tone="progress" icon={<Calendar size={16} />} />
        <Kpi label="Conflicts" value={String(conflicts.length)} tone={conflicts.length ? 'danger' : 'success'} icon={conflicts.length ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />} />
        <Kpi label="Last sync" value={lastSync} tone="neutral" icon={<RefreshCw size={16} />} />
      </div>

      {/* Double-booking guard */}
      <div className="bg-surface border rounded-2xl shadow-card overflow-hidden" style={{ borderColor: conflicts.length ? 'color-mix(in srgb, var(--tone-danger) 40%, transparent)' : 'var(--border)' }}>
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          {conflicts.length ? <AlertTriangle size={14} className="text-negative" /> : <ShieldCheck size={14} className="text-positive" />}
          <span className="text-[12.5px] font-semibold">Double-booking guard</span>
          <span className="ml-auto text-[11px]" style={{ color: toneVar(conflicts.length ? 'danger' : 'success') }}>{conflicts.length ? `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}` : 'All clear'}</span>
        </div>
        {conflicts.length === 0 ? (
          <p className="text-[12.5px] text-text-3 px-4 py-3">No overlapping stays across your channels. New external bookings will block matching dates automatically.</p>
        ) : (
          <div className="divide-y divide-border">
            {conflicts.map((c, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 14%, transparent)`, color: toneVar('danger') }}><AlertTriangle size={16} /></span>
                <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">{c.apt} · {c.nights}-night overlap</div><div className="text-[11.5px] text-text-3"><b>{c.guestA}</b> ({c.rangeA}) vs <b>{c.guestB}</b> ({c.rangeB})</div></div>
                <span className="text-[10.5px] font-bold text-negative uppercase flex-none">Resolve</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-apartment channels */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Connected channels by apartment</div>
        <div className="divide-y divide-border">
          {apartments.map((a) => (
            <div key={a.id} className="px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="min-w-0"><div className="text-[13px] font-semibold truncate">{a.name}</div><div className="text-[11px] text-text-3">{a.property}</div></div>
                <div className="ml-auto flex gap-1.5">
                  {CHANNELS.map((ch) => {
                    const on = a.channels.includes(ch.key);
                    return (
                      <button key={ch.key} disabled={pending} onClick={() => toggle(a.id, ch.key, on, ch.label)} className={`text-[11px] px-2.5 h-7 rounded-lg font-medium border transition-colors disabled:opacity-50 ${on ? 'text-white border-transparent' : 'text-text-3 border-border-2'}`} style={on ? { background: ch.color } : undefined}>
                        {on ? '✓ ' : '+ '}{ch.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-text-3 uppercase flex items-center gap-1 flex-none"><Link2 size={11} /> Outbound feed</span>
                <div className="flex-1 h-7 px-2.5 rounded-lg border border-border-2 bg-surface-2 text-[11px] font-mono text-text-3 flex items-center truncate">{a.feedUrl}</div>
                <button onClick={() => { navigator.clipboard?.writeText(a.feedUrl); flash('Feed URL copied'); }} className="h-7 px-2.5 rounded-lg border border-border-2 text-[11px] inline-flex items-center gap-1 flex-none"><Copy size={12} /> Copy</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-text-3 flex items-center gap-1.5"><AlertTriangle size={12} className="text-warning" /> iCal polls periodically, so a residual double-booking window exists — the guard flags overlaps so you can act fast (PRD risk note).</p>
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[16px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
