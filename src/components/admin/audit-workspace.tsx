'use client';

import { useState } from 'react';
import { Search, Download, ShieldAlert, ScrollText } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './admin-workspaces.module.css';

export type AuditRow = { machine: string; machineLabel: string; recordId: string; event: string; from: string | null; to: string; actorName: string; actorRole: string; at: string; security: boolean; financial: boolean };
const fmt = (iso: string) => Number.isNaN(Date.parse(iso)) ? iso : new Date(iso).toLocaleString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
export const auditCsvCell = (value: unknown) => `"${String(value).replace(/^[\s]*[=+@-]/, (match) => `'${match}`).replace(/"/g, '""')}"`;

export function AuditWorkspace({ entries }: { entries: AuditRow[] }) {
  const [query, setQuery] = useState('');
  const [machine, setMachine] = useState('all');
  const [lens, setLens] = useState<'all' | 'security' | 'financial'>('all');
  const machines = [...new Set(entries.map((e) => e.machine))];
  const filtered = entries.filter((e) => (machine === 'all' || e.machine === machine) && (lens === 'all' || e[lens]) && `${e.recordId} ${e.event} ${e.actorName} ${e.machineLabel}`.toLowerCase().includes(query.trim().toLowerCase()));
  function exportCsv() {
    const rows = filtered.map((e) => [e.at, `${e.machineLabel} ${e.recordId}`, e.event, e.from ?? '', e.to, e.actorName, e.actorRole, e.security, e.financial].map(auditCsvCell).join(','));
    const url = URL.createObjectURL(new Blob([['when,record,event,from,to,actor,role,security,financial', ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'audit-log.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className={common.layout}>
    <div className={common.notice}><ShieldAlert size={18} /><p>Session activity register<span>{entries.length} recorded events · {entries.filter((e) => e.security).length} security · {entries.filter((e) => e.financial).length} financial. This view reads the application’s session history, not a complete durable PostgreSQL audit trail. Twelve-month retention remains a proposed policy.</span></p></div>
    <PageTabs label="Platform audit sections" items={[{ id: 'trail', label: 'Audit trail', content: <Card padded={false} className={common.panel}>
      <div className={common.registerHeader}><CardHeader title="Audit trail" subtitle="Filter attributable events and export all matching records, with timestamps in WAT." action={<Button type="button" variant="primary" icon={<Download size={16} />} onClick={exportCsv}>Export CSV</Button>} />
        <div className={`${common.toolbar} pb-register-toolbar`}><label className={common.search}><Search size={16} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search records, events or actors…" aria-label="Search audit" /></label><div className={common.filters}><select className={common.select} value={machine} onChange={(e) => setMachine(e.target.value)} aria-label="Machine"><option value="all">All records</option>{machines.map((m) => <option key={m} value={m}>{m.replace(/-/g, ' ')}</option>)}</select><div className={common.filters} aria-label="Audit lens">{(['all', 'security', 'financial'] as const).map((l) => <Button type="button" key={l} aria-pressed={lens === l} onClick={() => setLens(l)}>{l === 'all' ? 'All events' : l === 'security' ? 'Security' : 'Financial'}</Button>)}</div></div></div>
      </div>
      {filtered.length ? <div className="pb-table-scroll" role="region" aria-label="Platform audit register" tabIndex={0}><table className={`pb-data-table ${common.table}`}><thead><tr>{['When · WAT', 'Record', 'Event', 'State change', 'Actor'].map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{filtered.slice(0, 150).map((e, i) => <tr key={`${e.recordId}-${i}`}><td className={styles.date}>{fmt(e.at)}</td><td><span className={common.title}>{e.machineLabel}</span><span className={common.metadata}>{e.recordId}</span></td><td><span className={common.title}>{e.event}</span><div className={common.filters}>{e.security && <StatusPill status="Security" tone="danger" />}{e.financial && <StatusPill status="Financial" tone="info" />}</div></td><td>{e.from ?? 'None'} → {e.to}</td><td><span className={common.title}>{e.actorName}</span><span className={common.metadata}>{e.actorRole}</span></td></tr>)}</tbody></table></div> : <EmptyState icon={<ScrollText size={24} />} title="No matching events." description="Try another filter or search term." />}
      <p className={common.registerFooter}>Showing {Math.min(filtered.length, 150)} of {filtered.length} matching events · CSV includes all matching session records.</p>
    </Card> }]} />
  </div>;
}
