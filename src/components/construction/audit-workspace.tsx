'use client';

import { useMemo, useState } from 'react';
import { ScrollText, Search, ShieldAlert, Banknote, BarChart3, Lock, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { AUDIT_ACTION_LABEL, AUDIT_TONE, REASON_DOMAIN_LABEL, fmtM, type AuditAction, type ReasonDomain } from '@/domain/construction';

export type AuditRow = {
  id: string; seq: number; atISO: string; actorName: string; actorRole: string;
  action: AuditAction; entity: string; entityRef: string; summary: string;
  amountMinor?: number; before?: string; after?: string; reasonLabel?: string; note?: string; sensitive: boolean;
};
export type ParetoRow = { code: string; label: string; category: string; count: number; sharePct: number; cumulativePct: number; impactMinor: number; impactDays: number; vital: boolean };

const naira = (m: number) => `₦${fmtM(m)}`;

export function AuditWorkspace({ entries, pareto, domains, summary }: {
  entries: AuditRow[];
  pareto: Record<string, ParetoRow[]>;
  domains: ReasonDomain[];
  summary: { total: number; sensitive: number; overrides: number; valueMovedMinor: number; actors: number };
}) {
  const [q, setQ] = useState('');
  const [action, setAction] = useState<'all' | AuditAction>('all');
  const [onlySensitive, setOnlySensitive] = useState(false);
  const [domain, setDomain] = useState<ReasonDomain>(domains[0] ?? 'delay');

  const shown = useMemo(() => entries.filter((e) =>
    (action === 'all' || e.action === action) &&
    (!onlySensitive || e.sensitive) &&
    (!q.trim() || `${e.summary} ${e.entityRef} ${e.actorName} ${e.entity}`.toLowerCase().includes(q.toLowerCase()))
  ), [entries, action, onlySensitive, q]);

  const rows = pareto[domain] ?? [];
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Audit entries" value={String(summary.total)} tone="info" icon={<ScrollText size={16} />} />
        <Kpi label="Sensitive actions" value={String(summary.sensitive)} tone={summary.sensitive ? 'warn' : 'success'} icon={<ShieldAlert size={16} />} />
        <Kpi label="Overrides" value={String(summary.overrides)} tone={summary.overrides ? 'danger' : 'success'} icon={<Lock size={16} />} />
        <Kpi label="Value touched" value={naira(summary.valueMovedMinor)} tone="progress" icon={<Banknote size={16} />} />
      </div>

      {/* Reason Pareto — why things actually go wrong */}
      <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <BarChart3 size={14} className="text-text-3" />
          <span className="text-[12.5px] font-semibold">Why it happens · Pareto</span>
          <select value={domain} onChange={(e) => setDomain(e.target.value as ReasonDomain)} className="ml-auto h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12px]">
            {domains.map((d) => <option key={d} value={d}>{REASON_DOMAIN_LABEL[d]}</option>)}
          </select>
        </div>
        <p className="text-[10.5px] text-text-3 mb-3">Coded reasons, ranked. The highlighted few account for the first 80% — those are the ones worth fixing.</p>
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.code}>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-text-2 truncate">
                  <span className="font-mono text-[10px] text-text-3">{r.code}</span> {r.label}
                  {r.vital && <span className="ml-1.5 text-[9px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 14%, transparent)`, color: toneVar('danger') }}>vital few</span>}
                </span>
                <span className="font-mono text-text-3 flex-none ml-2">
                  {r.count} · {r.sharePct}%
                  {r.impactDays > 0 && <span style={{ color: toneVar('warn') }}> · {r.impactDays}d</span>}
                  {r.impactMinor > 0 && <span style={{ color: toneVar('warn') }}> · {naira(r.impactMinor)}</span>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden relative">
                <div className="h-full rounded-full" style={{ width: `${(r.count / maxCount) * 100}%`, background: toneVar(r.vital ? 'danger' : 'muted') }} />
                <span className="absolute top-0 bottom-0 w-px bg-text-3 opacity-50" style={{ left: `${r.cumulativePct}%` }} title={`${r.cumulativePct}% cumulative`} />
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-[12px] text-text-3">Nothing coded in this domain yet.</p>}
        </div>
      </section>

      {/* Audit trail */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-wrap">
          <ScrollText size={14} className="text-text-3" />
          <span className="text-[12.5px] font-semibold">Audit trail</span>
          <span className="text-[10.5px] text-text-3">· append-only</span>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <button onClick={() => setOnlySensitive((v) => !v)} className="text-[11px] px-2.5 h-8 rounded-lg border font-medium" style={onlySensitive ? { borderColor: 'transparent', background: `color-mix(in srgb, ${toneVar('warn')} 14%, transparent)`, color: toneVar('warn') } : { borderColor: 'var(--border-2)' }}>Sensitive only</button>
            <select value={action} onChange={(e) => setAction(e.target.value as typeof action)} className="h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12px]">
              <option value="all">All actions</option>
              {(Object.keys(AUDIT_ACTION_LABEL) as AuditAction[]).map((a) => <option key={a} value={a}>{AUDIT_ACTION_LABEL[a]}</option>)}
            </select>
            <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border-2"><Search size={13} className="text-text-3" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="bg-transparent outline-none text-[12px] w-28" aria-label="Search the audit trail" /></div>
          </div>
        </div>
        <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
          {shown.map((e) => (
            <div key={e.id} className="px-4 py-3" style={e.action === 'override' ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
              <div className="flex items-start gap-2.5">
                <span className="text-[9.5px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full flex-none mt-0.5" style={{ background: `color-mix(in srgb, ${toneVar(AUDIT_TONE[e.action])} 14%, transparent)`, color: toneVar(AUDIT_TONE[e.action]) }}>{AUDIT_ACTION_LABEL[e.action]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium">{e.summary}</div>
                  <div className="text-[10.5px] text-text-3 mt-0.5">
                    <span className="font-mono">#{e.seq}</span> · {e.entity} <span className="font-mono">{e.entityRef}</span> · {e.actorName} <span className="opacity-70">({e.actorRole.replace('_', ' ')})</span> · {new Date(e.atISO).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {(e.before || e.after) && <div className="text-[10.5px] text-text-3 mt-0.5 font-mono">{e.before} → {e.after}</div>}
                  {e.reasonLabel && <div className="text-[11px] mt-0.5" style={{ color: toneVar('info') }}>Reason: {e.reasonLabel}</div>}
                  {e.note && <div className="text-[11px] text-text-3 mt-0.5">{e.note}</div>}
                </div>
                {e.amountMinor ? <span className="text-[12px] font-mono font-semibold flex-none">{naira(e.amountMinor)}</span> : null}
              </div>
            </div>
          ))}
          {shown.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-text-3">No entries match.</div>}
        </div>
      </section>

      <div className="text-[11px] text-text-3 flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 flex-none" />
        Entries are appended by the actions themselves and are never edited or deleted — {summary.actors} distinct actors are represented here. Sequence numbers are contiguous, so a gap would itself be evidence of tampering.
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
