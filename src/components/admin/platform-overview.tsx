import Link from 'next/link';
import { Building2, ShieldAlert, Sparkles, Activity, ArrowUpRight, ShieldCheck, Wallet } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type TenantRow = { id: string; label: string; plan: string; mrrMinor: number; units: number; users: number; score: number; band: Tone; healthLabel: string };
export type EventRow = { machine: string; event: string; actorName: string; at: string; recordId: string; security: boolean; financial: boolean };
export type SystemRow = { name: string; status: 'operational' | 'degraded' | 'down' | 'not_configured' };

function naira(minor: number): string {
  const n = minor / 100;
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return `₦${Math.round(n)}`;
}
const fmt = (iso: string) => new Date(iso).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const MACHINE_LABEL: Record<string, string> = { 'work-order': 'Work order', 'service-charge': 'Service charge', booking: 'Booking', 'sos-event': 'SOS', 'marketplace-order': 'Order' };

export function PlatformOverview({ totals, tenants, events, ai, systems }: {
  totals: { tenants: number; units: number; users: number; mrrMinor: number; incidents: number; aiCostMinor: number };
  tenants: TenantRow[];
  events: EventRow[];
  ai: { calls: number; capPct: number };
  systems: SystemRow[];
}) {
  const maxMrr = Math.max(...tenants.map((t) => t.mrrMinor), 1);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Kpi label="Tenants" value={String(totals.tenants)} note={`${totals.units.toLocaleString()} units`} tone="info" icon={<Building2 size={18} />} href="/admin/tenants" />
        <Kpi label="Platform MRR" value={naira(totals.mrrMinor)} note="recurring · estimate" tone="success" icon={<Wallet size={18} />} />
        <Kpi label="Active incidents" value={String(totals.incidents)} note={totals.incidents ? 'SOS in progress' : 'all clear'} tone={totals.incidents ? 'danger' : 'success'} icon={<ShieldAlert size={18} />} />
        <Kpi label="AI spend" value={naira(totals.aiCostMinor)} note={`${ai.capPct}% of cap`} tone={ai.capPct >= 80 ? 'danger' : 'progress'} icon={<Sparkles size={18} />} href="/admin/ai" />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* Tenant health leaderboard */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Building2 size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Tenant health</span><Link href="/admin/tenants" className="ml-auto text-[11.5px] text-primary hover:underline inline-flex items-center gap-0.5">All <ArrowUpRight size={12} /></Link></div>
          <div className="divide-y divide-border">
            {tenants.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <HealthDial score={t.score} band={t.band} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">{t.label}</div>
                  <div className="text-[11.5px] text-text-3">{t.plan} · {t.units} units · {t.users} users · <span style={{ color: toneVar(t.band) }}>{t.healthLabel}</span></div>
                  <div className="h-1 rounded-full bg-surface-2 overflow-hidden mt-1.5 max-w-[220px]"><div className="h-full rounded-full bg-primary" style={{ width: `${(t.mrrMinor / maxMrr) * 100}%` }} /></div>
                </div>
                <div className="text-right flex-none"><div className="text-[13px] font-mono font-semibold">{naira(t.mrrMinor)}</div><div className="text-[10.5px] text-text-3">MRR</div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          {/* AI spend gauge */}
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-2.5"><Sparkles size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">AI usage</span></div>
            <div className="flex items-end justify-between"><div><div className="text-[20px] font-bold tracking-[-0.02em] leading-none">{ai.calls.toLocaleString()}</div><div className="text-[11px] text-text-3">calls this month</div></div><div className="text-right"><div className="text-[14px] font-semibold">{naira(totals.aiCostMinor)}</div><div className="text-[11px] text-text-3">metered</div></div></div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-3"><div className="h-full rounded-full" style={{ width: `${ai.capPct}%`, background: toneVar(ai.capPct >= 80 ? 'danger' : 'progress') }} /></div>
            <div className="text-[10.5px] text-text-3 mt-1">{ai.capPct}% of monthly cap · billed to tenants (§15)</div>
          </div>

          {/* System status */}
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
            <div className="flex items-center gap-2 mb-2.5"><Activity size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">System status</span></div>
            <div className="flex flex-col gap-2">
              {systems.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: toneVar(s.status === 'operational' ? 'success' : s.status === 'degraded' ? 'warn' : s.status === 'not_configured' ? 'muted' : 'danger') }} />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-[11px] capitalize" style={{ color: toneVar(s.status === 'operational' ? 'success' : s.status === 'degraded' ? 'warn' : s.status === 'not_configured' ? 'muted' : 'danger') }}>{s.status === 'not_configured' ? 'not configured' : s.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity / security feed */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><ShieldCheck size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Recent activity</span><Link href="/admin/audit" className="ml-auto text-[11.5px] text-primary hover:underline inline-flex items-center gap-0.5">Audit log <ArrowUpRight size={12} /></Link></div>
        {events.length === 0 ? (
          <p className="text-[12.5px] text-text-3 px-4 py-4">No events yet this session.</p>
        ) : (
          <div className="divide-y divide-border">
            {events.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: toneVar(e.security ? 'danger' : e.financial ? 'progress' : 'neutral') }} />
                <div className="min-w-0 flex-1"><div className="text-[12.5px]"><span className="font-medium">{MACHINE_LABEL[e.machine] ?? e.machine}</span> · {e.event}{e.security && <span className="ml-1.5 text-[9.5px] font-bold text-negative">SECURITY</span>}{e.financial && <span className="ml-1.5 text-[9.5px] font-bold text-primary">FINANCIAL</span>}</div><div className="text-[11px] text-text-3">{e.actorName} · {e.recordId}</div></div>
                <span className="text-[11px] text-text-3 font-mono flex-none">{fmt(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HealthDial({ score, band }: { score: number; band: Tone }) {
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 40, height: 40 }}>
      <svg width={40} height={40} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(score / 100) * 94.2} 94.2`} /></svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-[11px]" style={{ color }}>{score}</span>
    </div>
  );
}
function Kpi({ label, value, note, tone, icon, href }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode; href?: string }) {
  const inner = (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4 h-full">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[13px] text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[22px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[11px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90 transition-opacity">{inner}</Link> : inner;
}
