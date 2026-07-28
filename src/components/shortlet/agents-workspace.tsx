'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X, Users, CalendarCheck, Wallet, Percent, Trophy } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { toneVar, type Tone } from '@/lib/status-tones';
import { inviteAgent } from '@/server/actions/shortlet';

export type AgentRow = { id: string; name: string; phone: string; commissionPct: number; status: string; bookings: number; nights: number; revenueMinor: number; commissionMinor: number };

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;

export function AgentsWorkspace({ agents }: { agents: AgentRow[] }) {
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const totalBookings = agents.reduce((n, a) => n + a.bookings, 0);
  const totalRevenue = agents.reduce((n, a) => n + a.revenueMinor, 0);
  const totalCommission = agents.reduce((n, a) => n + a.commissionMinor, 0);
  const maxRev = Math.max(...agents.map((a) => a.revenueMinor), 1);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-text-3">Agents bring bookings for a commission — track their performance and what you owe.</div>
        <button onClick={() => setInviting(true)} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105 flex-none ml-3"><UserPlus size={16} /> Invite agent</button>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Agents" value={String(agents.length)} tone="info" icon={<Users size={16} />} />
        <Kpi label="Agent bookings" value={String(totalBookings)} tone="progress" icon={<CalendarCheck size={16} />} />
        <Kpi label="Agent revenue" value={money(totalRevenue)} tone="success" icon={<Wallet size={16} />} />
        <Kpi label="Commission owed" value={money(totalCommission)} tone="warn" icon={<Percent size={16} />} />
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Trophy size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Agent leaderboard · by revenue</span></div>
        {agents.length === 0 ? <p className="text-[12.5px] text-text-3 px-4 py-6 text-center">No agents yet — invite one to start tracking.</p> : (
          <div className="divide-y divide-border">
            {agents.map((a, i) => (
              <div key={a.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-[12px] font-bold text-text-3 flex-none text-center">{i + 1}</span>
                  <Avatar name={a.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="text-[13.5px] font-semibold truncate">{a.name}</span>{a.status === 'invited' && <span className="text-[9px] font-bold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 14%, transparent)`, color: toneVar('warn') }}>INVITED</span>}</div>
                    <div className="text-[11px] text-text-3">{a.phone} · {a.commissionPct}% commission · {a.bookings} bookings · {a.nights} nights</div>
                  </div>
                  <div className="text-right flex-none"><div className="text-[13.5px] font-mono font-semibold">{money(a.revenueMinor)}</div><div className="text-[10.5px]" style={{ color: toneVar('warn') }}>owe {money(a.commissionMinor)}</div></div>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-2 ml-8"><div className="h-full rounded-full bg-primary" style={{ width: `${(a.revenueMinor / maxRev) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {inviting && <InviteDialog onClose={() => setInviting(false)} onDone={(n) => { setInviting(false); flash(`Invite sent to ${n}`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function InviteDialog({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [pct, setPct] = useState('10');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await inviteAgent({ name, phone, commissionPct: Number(pct) }); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(name); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[360px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Invite agent</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <label className="lbla">Name</label><input value={name} onChange={(e) => setName(e.target.value)} className="inpa mb-2" placeholder="Agent or agency" autoFocus />
        <label className="lbla">Phone (WhatsApp)</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className="inpa mb-2" placeholder="+234…" />
        <label className="lbla">Commission (%)</label><input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpa" />
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !name.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Sending…' : 'Send invite'}</button></div>
        <style>{`.lbla{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpa{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpa:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[16px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
