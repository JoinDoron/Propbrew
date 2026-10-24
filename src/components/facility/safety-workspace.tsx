'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertOctagon, ArrowUpFromLine, Box, FileWarning, Flame, ShieldCheck, TriangleAlert, Zap } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { FacilityDialog, FacilityFeedback, FacilityKpi } from './facility-ui';
import { type Tone } from '@/lib/status-tones';
import { permitConflicts, type Permit, type PermitType, type Incident } from '@/domain/facility';
import { advancePermit } from '@/server/actions/facility';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './facility-specialists.module.css';

const TYPE_META: Record<PermitType, { label: string; icon: React.ReactNode }> = {
  hot_work: { label: 'Hot work', icon: <Flame size={18} /> },
  height: { label: 'Work at height', icon: <ArrowUpFromLine size={18} /> },
  electrical: { label: 'Electrical', icon: <Zap size={18} /> },
  confined_space: { label: 'Confined space', icon: <Box size={18} /> },
};
const STATUS_TONE: Record<Permit['status'], Tone> = { requested: 'info', active: 'progress', closed: 'muted' };
const INC_TONE: Record<Incident['severity'], Tone> = { near_miss: 'info', minor: 'warn', major: 'danger' };
const NEXT_LABEL: Record<Permit['status'], string | null> = { requested: 'Approve & activate', active: 'Close permit', closed: null };
const date = (iso: string) => new Date(iso).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });

export function SafetyWorkspace({ permits, incidents, kpis, canMutate = false }: {
  permits: Permit[]; incidents: Incident[];
  kpis: { activePermits: number; openIncidents: number; safetyScore: number }; canMutate?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [selected, setSelected] = useState<Permit | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const conflicts = permitConflicts(permits);
  const conflictIds = new Set(conflicts.flatMap((conflict) => [conflict.a.id, conflict.b.id]));
  const sorted = [...permits].sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || Date.parse(a.validFromISO) - Date.parse(b.validFromISO));

  function advance() {
    if (!selected || !canMutate || pending || inFlight.current || selected.status === 'closed') return;
    inFlight.current = true;
    setFeedback(null);
    start(async () => {
      try {
        const result = await advancePermit(selected.id);
        if (!result.ok) { setFeedback(result.error); return; }
        setSelected(null);
        router.refresh();
        setFeedback(selected.status === 'requested' ? 'Permit activation recorded.' : 'Permit closure recorded.');
      } catch { setFeedback('The permit update could not be confirmed. Refresh before trying again.'); }
      finally { inFlight.current = false; }
    });
  }

  return <div className={styles.stack}>
    <div className={layout.metrics}><FacilityKpi label="Active permits" value={String(kpis.activePermits)} tone="progress" icon={<FileWarning size={18} />} /><FacilityKpi label="Conflicts" value={String(conflicts.length)} tone={conflicts.length ? 'danger' : 'success'} icon={<AlertOctagon size={18} />} /><FacilityKpi label="Open incidents" value={String(kpis.openIncidents)} tone={kpis.openIncidents ? 'warn' : 'success'} icon={<TriangleAlert size={18} />} /><FacilityKpi label="Safety score" value={String(kpis.safetyScore)} sub="Rules-based record indicator" tone={kpis.safetyScore >= 90 ? 'success' : 'warn'} icon={<ShieldCheck size={18} />} /></div>

    {conflicts.length ? <Card padded={false} className={styles.emergency}><div className={styles.panelHeader}><CardHeader title="Permit clash detected" subtitle="Overlapping work in the same location needs human coordination" action={<StatusPill status={conflicts.length + ' conflict(s)'} tone="danger" />} /></div><ul className={styles.list}>{conflicts.map((conflict) => <li key={conflict.a.id + '-' + conflict.b.id} className={styles.row}><div className={styles.rowContent}><h3 className={styles.rowTitle}>{conflict.a.location}</h3><p className={styles.body}>{conflict.a.ref} · {TYPE_META[conflict.a.type].label} overlaps {conflict.b.ref} · {TYPE_META[conflict.b.type].label}.</p><p className={styles.metadata}>Coordinate the permit owners, timing and isolation arrangements before allowing overlapping work.</p></div><StatusPill status="Review required" tone="danger" /></li>)}</ul></Card> : null}

    <PageTabs label="Facility safety sections" items={[
      { id: 'permits', label: 'Permits to work', count: permits.length, content: <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Permits to work" subtitle="Scope, validity, responsible person and approval state" action={<StatusPill status={kpis.activePermits + ' active'} tone="progress" />} /></div>{sorted.length ? <div className={styles.scroll} role="region" aria-label="Facility permit register" tabIndex={0}><table className={'pb-data-table ' + styles.table}><thead><tr>{['Permit', 'Location & requester', 'Validity · WAT', 'Work notes', 'Status', 'Action'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{sorted.map((permit) => <tr key={permit.id}><td><div className={styles.identity}><span className={styles.icon}>{TYPE_META[permit.type].icon}</span><div><p className={styles.rowTitle}>{permit.ref}</p><p className={styles.metadata}>{TYPE_META[permit.type].label}</p></div></div></td><td><p className={styles.body}>{permit.location}</p><p className={styles.metadata}>{permit.requestedBy}</p></td><td><p className={styles.body}>{date(permit.validFromISO)}</p><p className={styles.metadata}>Until {date(permit.validToISO)}</p></td><td><p className={styles.body}>{permit.note || 'No work note recorded.'}</p></td><td><div className={styles.stack}><StatusPill status={permit.status} tone={STATUS_TONE[permit.status]} />{conflictIds.has(permit.id) ? <StatusPill status="Location / time clash" tone="danger" /> : null}</div></td><td>{canMutate && NEXT_LABEL[permit.status] ? <Button disabled={pending} onClick={() => { setFeedback(null); setSelected(permit); }}>{NEXT_LABEL[permit.status]}</Button> : <span className={styles.metadata}>{permit.status === 'closed' ? 'Terminal record' : 'Read-only'}</span>}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState icon={<FileWarning size={26} />} title="No permits recorded" description="No permits to work are recorded in your current facility scope." /></div>}<p className={styles.footer}>Activation records a supervisor decision. It does not replace an on-site permit briefing, isolation check or safety inspection. Closed permits are terminal records.</p></Card> },
      { id: 'incidents', label: 'Incident log', count: incidents.length, content: <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Incident log" subtitle="Recorded events and review status · not an emergency reporting channel" action={<StatusPill status={kpis.openIncidents + ' open'} tone={kpis.openIncidents ? 'warn' : 'muted'} />} /></div>{incidents.length ? <div className={styles.scroll} role="region" aria-label="Facility incident register" tabIndex={0}><table className={'pb-data-table ' + styles.table}><thead><tr>{['Incident category', 'Location', 'Severity', 'Status', 'Recorded · WAT'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{incidents.map((incident) => <tr key={incident.id}><td><p className={styles.rowTitle}>{incident.category}</p></td><td>{incident.location}</td><td><StatusPill status={incident.severity.replaceAll('_', ' ')} tone={INC_TONE[incident.severity]} /></td><td><StatusPill status={incident.status} tone={incident.status === 'open' ? 'warn' : 'muted'} /></td><td>{date(incident.atISO)}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState icon={<ShieldCheck size={26} />} title="No incidents logged." description="No incidents are recorded in this scope. This does not certify that the facility is safe." /></div>}<p className={styles.footer}>For immediate danger, follow the facility emergency procedure. This register does not dispatch emergency responders.</p></Card> },
    ]} />

    {selected ? <FacilityDialog title={NEXT_LABEL[selected.status] ?? 'Review permit'} onClose={() => setSelected(null)} pending={pending}><div className={styles.stack}><div className={styles.notice}><p className={styles.title}>{selected.ref} · {TYPE_META[selected.type].label}</p><p>{selected.location} · requested by {selected.requestedBy}</p></div><p className={styles.body}>{selected.status === 'requested' ? 'Confirm the responsible supervisor has checked the permit, isolation and site conditions before activation.' : 'Confirm work is complete and the work area has been made safe before closing this permit. This is a terminal status.'}</p>{conflictIds.has(selected.id) ? <p className={styles.notice}>A location/time conflict is recorded. Coordinate the overlapping work before proceeding.</p> : null}{feedback ? <p role="alert" className="text-[14px] text-negative">{feedback}</p> : null}<div className={styles.actions}><Button disabled={pending} onClick={() => setSelected(null)}>Cancel</Button><Button variant="primary" disabled={pending} onClick={advance}>{pending ? 'Saving…' : 'Confirm ' + (selected.status === 'requested' ? 'activation' : 'closure')}</Button></div></div></FacilityDialog> : feedback ? <FacilityFeedback message={feedback} onDismiss={() => setFeedback(null)} /> : null}
  </div>;
}
