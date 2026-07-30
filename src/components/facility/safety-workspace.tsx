'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, AlertOctagon, FileWarning, Flame, ArrowUpFromLine, Zap, Box, ChevronRight, TriangleAlert } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { permitConflicts, type Permit, type PermitType, type Incident } from '@/domain/facility';
import { advancePermit } from '@/server/actions/facility';

const TYPE_META: Record<PermitType, { label: string; icon: React.ReactNode }> = {
  hot_work: { label: 'Hot work', icon: <Flame size={14} /> },
  height: { label: 'Work at height', icon: <ArrowUpFromLine size={14} /> },
  electrical: { label: 'Electrical', icon: <Zap size={14} /> },
  confined_space: { label: 'Confined space', icon: <Box size={14} /> },
};
const STATUS_TONE: Record<Permit['status'], Tone> = { requested: 'info', active: 'progress', closed: 'muted' };
const INC_TONE: Record<Incident['severity'], Tone> = { near_miss: 'info', minor: 'warn', major: 'danger' };
const NEXT_LABEL: Record<Permit['status'], string | null> = { requested: 'Approve & activate', active: 'Close permit', closed: null };

export function SafetyWorkspace({ permits, incidents, kpis }: {
  permits: Permit[]; incidents: Incident[];
  kpis: { activePermits: number; openIncidents: number; safetyScore: number };
}) {
  const conflicts = permitConflicts(permits);
  const conflictIds = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const sorted = [...permits].sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || Date.parse(a.validFromISO) - Date.parse(b.validFromISO));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Active permits" value={String(kpis.activePermits)} tone="progress" icon={<FileWarning size={16} />} />
        <Kpi label="Conflicts" value={String(conflicts.length)} tone={conflicts.length ? 'danger' : 'success'} icon={<AlertOctagon size={16} />} />
        <Kpi label="Open incidents" value={String(kpis.openIncidents)} tone={kpis.openIncidents ? 'warn' : 'success'} icon={<TriangleAlert size={16} />} />
        <Kpi label="Safety score" value={`${kpis.safetyScore}`} tone={kpis.safetyScore >= 90 ? 'success' : 'warn'} icon={<ShieldCheck size={16} />} />
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-xl border px-4 py-3 animate-fade" style={{ borderColor: 'color-mix(in srgb, var(--tone-danger) 40%, transparent)', background: 'color-mix(in srgb, var(--tone-danger) 7%, transparent)' }}>
          <div className="flex items-center gap-2 text-[12.5px] font-semibold mb-1.5" style={{ color: toneVar('danger') }}><AlertOctagon size={14} /> Permit clash detected</div>
          <div className="flex flex-col gap-1">
            {conflicts.map((c, i) => (
              <div key={i} className="text-[12px] text-text-2">
                <span className="font-mono font-semibold">{c.a.ref}</span> & <span className="font-mono font-semibold">{c.b.ref}</span> both live in <span className="font-medium">{c.a.location}</span> — {TYPE_META[c.a.type].label.toLowerCase()} beside {TYPE_META[c.b.type].label.toLowerCase()} needs coordination.
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold text-text-2">Permits to work</div>
        <div className="flex flex-col divide-y divide-border">
          {sorted.map((p) => <PermitRow key={p.id} permit={p} conflict={conflictIds.has(p.id)} onDone={flash} />)}
        </div>
      </section>

      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold text-text-2">Incident log</div>
        <div className="flex flex-col divide-y divide-border">
          {incidents.map((it) => (
            <div key={it.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-[13px] font-medium truncate">{it.category}</div><div className="text-[11px] text-text-3">{it.location} · {it.atISO.slice(0, 10)}</div></div>
              <div className="flex items-center gap-2 flex-none">
                <span className="text-[10.5px] font-semibold px-2 h-5 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(INC_TONE[it.severity])} 14%, transparent)`, color: toneVar(INC_TONE[it.severity]) }}>{it.severity.replace('_', ' ')}</span>
                <span className="text-[10.5px] font-semibold px-2 h-5 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(it.status === 'open' ? 'warn' : 'muted')} 14%, transparent)`, color: toneVar(it.status === 'open' ? 'warn' : 'muted') }}>{it.status}</span>
              </div>
            </div>
          ))}
          {incidents.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-text-3">No incidents logged.</div>}
        </div>
      </section>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function PermitRow({ permit, conflict, onDone }: { permit: Permit; conflict: boolean; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = NEXT_LABEL[permit.status];
  function advance() { start(async () => { const r = await advancePermit(permit.id); if (r.ok) { router.refresh(); onDone(permit.status === 'requested' ? 'Permit activated' : 'Permit closed'); } }); }
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3" style={conflict ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
      <div className="min-w-0 flex items-start gap-2.5">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none mt-0.5" style={{ background: `color-mix(in srgb, ${toneVar('progress')} 12%, transparent)`, color: toneVar('progress') }}>{TYPE_META[permit.type].icon}</span>
        <div className="min-w-0">
          <div className="text-[13px] font-medium flex items-center gap-1.5"><span className="font-mono">{permit.ref}</span> · {TYPE_META[permit.type].label}{conflict && <span className="text-[10px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 14%, transparent)`, color: toneVar('danger') }}>clash</span>}</div>
          <div className="text-[11px] text-text-3 truncate">{permit.location} · {permit.requestedBy} · {permit.validFromISO.slice(5)}→{permit.validToISO.slice(5)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-none">
        <span className="text-[10.5px] font-semibold px-2 h-5 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(STATUS_TONE[permit.status])} 14%, transparent)`, color: toneVar(STATUS_TONE[permit.status]) }}>{permit.status}</span>
        {next && <button onClick={advance} disabled={pending} className="text-[11.5px] px-2.5 h-7 rounded-lg font-medium border border-border-2 inline-flex items-center gap-1 disabled:opacity-50">{pending ? '…' : <>{next} <ChevronRight size={12} /></>}</button>}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
