'use client';

import { useMemo, useState } from 'react';
import { Search, Download, ShieldAlert, Wallet, ScrollText } from 'lucide-react';

export type AuditRow = { machine: string; machineLabel: string; recordId: string; event: string; from: string | null; to: string; actorName: string; actorRole: string; at: string; security: boolean; financial: boolean };

const fmt = (iso: string) => new Date(iso).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AuditWorkspace({ entries }: { entries: AuditRow[] }) {
  const [q, setQ] = useState('');
  const [machine, setMachine] = useState('all');
  const [lens, setLens] = useState<'all' | 'security' | 'financial'>('all');

  const machines = useMemo(() => ['all', ...Array.from(new Set(entries.map((e) => e.machine)))], [entries]);
  const filtered = useMemo(() => entries.filter((e) =>
    (machine === 'all' || e.machine === machine) &&
    (lens === 'all' || (lens === 'security' && e.security) || (lens === 'financial' && e.financial)) &&
    (!q.trim() || `${e.recordId} ${e.event} ${e.actorName} ${e.machineLabel}`.toLowerCase().includes(q.toLowerCase())),
  ), [entries, machine, lens, q]);

  const secCount = entries.filter((e) => e.security).length;
  const finCount = entries.filter((e) => e.financial).length;

  function exportCsv() {
    const head = 'when,record,event,from,to,actor,role,security,financial';
    const rows = filtered.map((e) => [e.at, `${e.machineLabel} ${e.recordId}`, e.event, e.from ?? '', e.to, e.actorName, e.actorRole, e.security, e.financial].map((v) => String(v).replace(/,/g, ' ')).join(','));
    const blob = new Blob([[head, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit-log.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[12px] text-text-3">
        Immutable · actor + tenant + timestamp on every entry (SC-10). {entries.length} events this session · <span className="text-negative font-semibold">{secCount} security</span> · <span className="text-primary font-semibold">{finCount} financial</span> · 12-month retention (proposed).
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border-2 bg-surface flex-1 min-w-[160px]">
          <Search size={15} className="text-text-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, records, actors…" className="flex-1 bg-transparent outline-none text-[13px]" aria-label="Search audit" />
        </div>
        <select value={machine} onChange={(e) => setMachine(e.target.value)} aria-label="Machine" className="h-9 px-2 rounded-xl border border-border-2 bg-surface text-[12.5px] outline-none focus:border-primary capitalize">
          {machines.map((m) => <option key={m} value={m}>{m === 'all' ? 'All records' : m.replace(/-/g, ' ')}</option>)}
        </select>
        <div className="inline-flex rounded-xl border border-border-2 overflow-hidden">
          {(['all', 'security', 'financial'] as const).map((l) => (
            <button key={l} onClick={() => setLens(l)} className={`text-[11.5px] px-2.5 h-9 capitalize ${lens === l ? (l === 'security' ? 'bg-[color:var(--tone-danger)] text-white' : l === 'financial' ? 'bg-primary text-white' : 'bg-surface-3 text-text') : 'text-text-3'}`}>{l}</button>
          ))}
        </div>
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-white text-[12.5px] font-medium"><Download size={14} /> Export</button>
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['When', 'Record', 'Event', 'Change', 'Actor'].map((h) => <th key={h} className="text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.slice(0, 150).map((e, i) => (
                <tr key={`${e.recordId}-${i}`} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 border-b border-border text-[12px] text-text-3 font-mono whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {e.security ? <ShieldAlert size={12} className="text-negative" /> : e.financial ? <Wallet size={12} className="text-primary" /> : <ScrollText size={12} className="text-text-3" />}
                      {fmt(e.at)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 border-b border-border"><div className="text-[12.5px] font-medium">{e.machineLabel}</div><span className="font-mono text-[11px] text-text-3">{e.recordId}</span></td>
                  <td className="px-4 py-2.5 border-b border-border text-[12.5px]">{e.event}{e.security && <span className="ml-1.5 text-[9px] font-bold text-negative">SEC</span>}{e.financial && <span className="ml-1.5 text-[9px] font-bold text-primary">FIN</span>}</td>
                  <td className="px-4 py-2.5 border-b border-border text-[12px] text-text-3 font-mono">{e.from ?? '∅'} → <span className="text-text-2">{e.to}</span></td>
                  <td className="px-4 py-2.5 border-b border-border text-[12.5px]">{e.actorName}<span className="text-text-3"> · {e.actorRole}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-[13px] text-text-3">No matching events.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
