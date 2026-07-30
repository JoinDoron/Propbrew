'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PartyPopper, Dumbbell, Baby, Users, Sparkles, CalendarPlus, MapPin, CalendarDays, Ticket, X, Check } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { eventFillPct, eventState, type EventCategory } from '@/domain/estate';
import { rsvpEvent, cancelRsvp, createEvent, type CreateEventInput } from '@/server/actions/estate';

export type EventRow = { id: string; title: string; category: EventCategory; venue: string; host: string; startISO: string; endISO: string; capacity: number; rsvps: number; cancelled?: boolean };
export type AmenityRow = { venue: string; rsvps: number; events: number };

const CAT_ICON: Record<EventCategory, React.ReactNode> = { social: <PartyPopper size={15} />, fitness: <Dumbbell size={15} />, kids: <Baby size={15} />, meeting: <Users size={15} />, festive: <Sparkles size={15} /> };
const CAT_TONE: Record<EventCategory, Tone> = { social: 'info', fitness: 'success', kids: 'warn', meeting: 'progress', festive: 'danger' };
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });

export function EventsWorkspace({ events, amenities, kpis, nowMs }: {
  events: EventRow[]; amenities: AmenityRow[];
  kpis: { upcoming: number; totalRsvps: number; full: number; topVenue: string };
  nowMs: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(ok); } else flash(r.error ?? 'Failed'); });

  const upcoming = events.filter((e) => !e.cancelled && Date.parse(e.endISO) >= nowMs).sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
  const groups = new Map<string, EventRow[]>();
  for (const e of upcoming) { const k = dayKey(e.startISO); groups.set(k, [...(groups.get(k) ?? []), e]); }
  const maxLoad = Math.max(1, ...amenities.map((a) => a.rsvps));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#2a1033 0%,#45184a 55%,#63265e 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><PartyPopper size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5"><CalendarDays size={12} /> COMMUNITY EVENTS</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{kpis.upcoming} upcoming · {kpis.totalRsvps} RSVPs</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{upcoming[0] ? `Next: ${upcoming[0].title} · ${dayKey(upcoming[0].startISO)}` : 'No upcoming events'}</div>
          </div>
          <button onClick={() => setShowCreate(true)} className="ml-auto inline-flex items-center gap-2 h-10 px-4 rounded-xl font-semibold text-[13px] bg-white text-[#63265e]"><CalendarPlus size={15} /> New event</button>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Upcoming" value={String(kpis.upcoming)} tone="progress" icon={<CalendarDays size={16} />} />
        <Kpi label="Total RSVPs" value={String(kpis.totalRsvps)} tone="info" icon={<Ticket size={16} />} />
        <Kpi label="Full events" value={String(kpis.full)} tone={kpis.full ? 'warn' : 'success'} icon={<Users size={16} />} />
        <Kpi label="Busiest venue" value={kpis.topVenue} tone="success" icon={<MapPin size={16} />} />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_280px] gap-3.5 items-start">
        <div className="flex flex-col gap-3.5">
          {[...groups.entries()].map(([day, list]) => (
            <div key={day}>
              <div className="text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1.5">{day}</div>
              <div className="flex flex-col gap-2">
                {list.map((e) => {
                  const fill = eventFillPct(e); const state = eventState(e, nowMs); const full = state === 'full';
                  return (
                    <div key={e.id} className="bg-surface border border-border rounded-2xl shadow-card p-3.5 flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(CAT_TONE[e.category])} 14%, transparent)`, color: toneVar(CAT_TONE[e.category]) }}>{CAT_ICON[e.category]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold truncate">{e.title}</div>
                        <div className="text-[11px] text-text-3 truncate">{time(e.startISO)} · {e.venue} · {e.host}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden max-w-[180px]"><div className="h-full rounded-full" style={{ width: `${fill}%`, background: toneVar(full ? 'danger' : fill >= 70 ? 'warn' : 'success') }} /></div>
                          <span className="text-[10.5px] text-text-3">{e.rsvps}/{e.capacity}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-none">
                        <button disabled={pending || full} onClick={() => act(() => rsvpEvent(e.id), 'RSVP added')} className="text-[11.5px] px-2.5 h-7 rounded-lg font-medium bg-primary text-white disabled:opacity-40">{full ? 'Full' : 'RSVP'}</button>
                        <button disabled={pending || e.rsvps === 0} onClick={() => act(() => cancelRsvp(e.id), 'RSVP released')} className="text-[10.5px] px-2.5 h-6 rounded-lg border border-border-2 disabled:opacity-40">Release</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {upcoming.length === 0 && <div className="bg-surface border border-border rounded-2xl p-8 text-center text-[13px] text-text-3">No upcoming events. Create one to get the community together.</div>}
        </div>

        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-3 flex items-center gap-1.5"><MapPin size={14} className="text-text-3" /> Amenity demand</div>
          <div className="flex flex-col gap-2.5">
            {amenities.map((a) => (
              <div key={a.venue}>
                <div className="flex justify-between text-[11px] mb-0.5"><span className="text-text-2 truncate">{a.venue}</span><span className="font-mono text-text-3">{a.rsvps}</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round((a.rsvps / maxLoad) * 100)}%`, background: toneVar('progress') }} /></div>
                <div className="text-[10px] text-text-3 mt-0.5">{a.events} event{a.events === 1 ? '' : 's'}</div>
              </div>
            ))}
            {amenities.length === 0 && <p className="text-[12px] text-text-3">No amenity bookings yet.</p>}
          </div>
        </section>
      </div>

      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onDone={(t) => { setShowCreate(false); flash(`Event created · ${t}`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (t: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<CreateEventInput>({ title: '', category: 'social', venue: '', host: '', startISO: '2026-08-15', capacity: 30 });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CreateEventInput, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  function submit() { setError(null); start(async () => { const r = await createEvent(f); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(r.ref ?? f.title); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[380px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">New community event</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="flex flex-col gap-2.5">
          <div><label className="lble">Title</label><input value={f.title} onChange={(e) => set('title', e.target.value)} className="inpe" autoFocus placeholder="e.g. Movie Night on the Lawn" /></div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="lble">Category</label><select value={f.category} onChange={(e) => set('category', e.target.value)} className="inpe"><option value="social">Social</option><option value="fitness">Fitness</option><option value="kids">Kids</option><option value="meeting">Meeting</option><option value="festive">Festive</option></select></div>
            <div><label className="lble">Capacity</label><input value={String(f.capacity)} onChange={(e) => set('capacity', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)} inputMode="numeric" className="inpe" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className="lble">Venue</label><input value={f.venue} onChange={(e) => set('venue', e.target.value)} className="inpe" placeholder="Clubhouse Hall" /></div>
            <div><label className="lble">Date</label><input type="date" value={f.startISO} onChange={(e) => set('startISO', e.target.value)} className="inpe" /></div>
          </div>
          <div><label className="lble">Host</label><input value={f.host} onChange={(e) => set('host', e.target.value)} className="inpe" placeholder="Social Committee" /></div>
        </div>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !f.title.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Creating…' : 'Create'}</button></div>
        <style>{`.lble{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpe{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpe:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[15px] font-bold tracking-[-0.02em] leading-none mt-1 truncate">{value}</div></div>;
}
