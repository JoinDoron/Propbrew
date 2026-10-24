'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MapPin, QrCode, Radio, ShieldAlert, ShieldCheck, Timer, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { DomainStatus } from '@/components/domain';
import type { SosStatus } from '@/domain/enums';
import { toneVar } from '@/lib/status-tones';
import { transition } from '@/server/actions/transitions';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './safety-market.module.css';

const ACK_TARGET = 60;
const ACTION_META: Record<string, { label: string; primary?: boolean }> = {
  ACKNOWLEDGE: { label: 'Acknowledge', primary: true },
  RESPOND: { label: 'Record responder dispatch', primary: true },
  RESOLVE: { label: 'Resolve' },
  REVIEW: { label: 'Close & review' },
};

export type SosView = {
  id: string; ref: string; residentName: string; unitId: string; estateId: string;
  status: string; ackSeconds: number | null; responder: string | null; channel: string; raisedAt: string; actions: string[];
};
type Pass = { id: string; visitor: string; code: string; unit: string; expires: string };
type TerminalEvent = 'RESOLVE' | 'REVIEW';

export function sosNeedsConfirmation(event: string): event is TerminalEvent {
  return event === 'RESOLVE' || event === 'REVIEW';
}

export function sosElapsedSeconds(raisedAt: string, nowMs: number): number | null {
  const start = Date.parse(raisedAt);
  return Number.isFinite(start) ? Math.max(0, Math.floor((nowMs - start) / 1000)) : null;
}
export function sosElapsedLabel(seconds: number): string {
  if (seconds < 3600) return `${seconds}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function SosConsole({ events, canMutate }: { events: SosView[]; canMutate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [showPass, setShowPass] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<{ incident: SosView; event: TerminalEvent } | null>(null);
  const hasRaised = events.some((e) => e.status === 'raised');
  useEffect(() => {
    if (!hasRaised) return;
    const first = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [hasRaised]);

  const active = events.filter((e) => e.status !== 'reviewed');
  const unack = events.filter((e) => e.status === 'raised').length;
  const acked = events.filter((e) => e.ackSeconds !== null);
  const avgAck = acked.length ? Math.round(acked.reduce((sum, e) => sum + (e.ackSeconds ?? 0), 0) / acked.length) : null;
  const resolved = events.filter((e) => ['resolved', 'reviewed'].includes(e.status)).length;
  const metTarget = acked.filter((e) => (e.ackSeconds ?? Infinity) < ACK_TARGET).length;

  const fire = (id: string, event: string) => {
    if (!canMutate || pending) return;
    setMessage(null);
    start(async () => {
      try {
        const result = await transition('sos-event', id, event);
        if (!result.ok) { setMessage(result.error); return; }
        setTerminal(null);
        setMessage('Incident status recorded. Coordinate the response through your established emergency channels.');
        router.refresh();
      } catch { setMessage('Unable to update this incident. Use your established emergency channels and try again.'); }
    });
  };

  function requestAction(incident: SosView, event: string) {
    if (!canMutate || pending || !incident.actions.includes(event)) return;
    setMessage(null);
    if (sosNeedsConfirmation(event)) { setTerminal({ incident, event }); return; }
    fire(incident.id, event);
  }
  function closeTerminal() {
    if (pending) return;
    setTerminal(null);
    setMessage(null);
  }

  return <div className={layout.layout}>
    <div className={`${layout.notice} ${styles.emergencyNotice}`}>
      <ShieldAlert size={18} className={styles.danger} aria-hidden="true" />
      <div><p className={styles.body}>Acknowledge in under 60 seconds. Escalate unacknowledged alerts to the backup responder at 60 seconds.</p><p className={styles.meta}>Demo incident records, not a connected emergency dispatch service. Propbrew records workflow changes; it does not call emergency services or confirm responder delivery. No AI drives SOS decisions.</p></div>
    </div>
    {message && !terminal && <div role="status" className={layout.feedback}><span>{message}</span><IconButton aria-label="Dismiss security notification" onClick={() => setMessage(null)}><X size={16} /></IconButton></div>}
    {active.length > 0 ? <section aria-label="Active SOS incidents" className={styles.alerts}>
      {active.map((e) => {
        const raised = e.status === 'raised';
        const seconds = raised ? (nowMs === null ? null : sosElapsedSeconds(e.raisedAt, nowMs)) : e.ackSeconds;
        const over = seconds !== null && seconds >= ACK_TARGET;
        return <article key={e.id} className={`${styles.alert} ${raised ? styles.unacknowledged : ''}`}>
          <div className={styles.alertIdentity}>
            <AckRing seconds={seconds} raised={raised} over={over} />
            <div className={styles.alertContent}>
              <div className={styles.alertTitle}><span className="font-mono text-sm font-medium">{e.ref}</span><DomainStatus type="sos" status={e.status as SosStatus} />{e.channel === 'sms_fallback' && <StatusPill status="SMS fallback" tone="warn" />}</div>
              <h3 className={styles.resident}>{e.residentName}</h3>
              <p className={styles.meta}><MapPin size={12} className="inline" aria-hidden="true" /> Unit {e.unitId}{e.responder ? ` · ${e.responder}` : ' · No responder recorded'}</p>
              {raised && <p className={`${styles.body} ${over ? styles.danger : styles.warning}`}>{seconds === null ? 'Checking recorded alert age…' : over ? `${sosElapsedLabel(seconds)} since raised — escalate to backup responder` : `${seconds}s since raised · target under ${ACK_TARGET}s`}</p>}
            </div>
          </div>
          {canMutate && e.actions.length > 0 && <div className={`${layout.actions} mt-4`}>{e.actions.filter((a) => ACTION_META[a]).map((action) => <Button key={action} type="button" disabled={pending} variant={ACTION_META[action].primary ? 'primary' : 'secondary'} onClick={() => requestAction(e, action)} aria-label={`${ACTION_META[action].label} ${e.ref}`}>{ACTION_META[action].label}</Button>)}</div>}
        </article>;
      })}
    </section> : <Card className={layout.panel}><EmptyState icon={<ShieldCheck size={24} />} title="No active incidents in this view" description="Keep your response channels available. The incident register retains reviewed records." /></Card>}
    <PageTabs label="Security operations sections" items={[
      { id: 'register', label: 'Incident register', content: <Card className={layout.panel}>
        <CardHeader title="Incident register" subtitle="Demo incident records and recorded sample acknowledgement times—not verified response-SLA measurements." action={<StatusPill status={`${events.length} incidents`} tone="neutral" />} />
        {events.length ? <div className="pb-table-scroll" role="region" aria-label="Security incident register" tabIndex={0}><table className={`pb-data-table ${layout.table}`}><caption className="sr-only">SOS incident register</caption><thead><tr>{['Incident', 'Resident / unit', 'Status', 'Acknowledge', 'Responder', 'Channel'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{events.map((e) => <tr key={e.id}>
          <td><span className="font-mono">{e.ref}</span></td><td><div className={layout.person}><Avatar name={e.residentName} /><div><p className={layout.title}>{e.residentName}</p><p className={layout.metadata}>{e.unitId}</p></div></div></td>
          <td><DomainStatus type="sos" status={e.status as SosStatus} /></td><td>{e.ackSeconds === null ? <span className={styles.danger}>Pending</span> : <span style={{ color: toneVar(e.ackSeconds < ACK_TARGET ? 'success' : 'warn') }}>{e.ackSeconds}s</span>}</td><td>{e.responder ?? 'Not recorded'}</td><td>{e.channel.replace(/_/g, ' ')}</td>
        </tr>)}</tbody></table></div> : <EmptyState title="No incident records" description="Incidents will appear here when recorded for your estates." />}
      </Card> },
      { id: 'access', label: 'Response & access', content: <div className={layout.analytics}>
        <Card className={layout.panel}>
          <CardHeader title="Recorded acknowledgement samples" subtitle="Demo/sample durations shown against the under-60-second target. These values are not verified emergency response-SLA measurements." />
          {acked.length ? <>{acked.map((e) => <div key={e.id} className={styles.row}><div className={styles.rowContent}>
            <div className="flex justify-between gap-4 text-sm"><span className="font-mono">{e.ref}</span><span style={{ color: toneVar((e.ackSeconds ?? 0) < ACK_TARGET ? 'success' : 'warn') }}>{e.ackSeconds}s</span></div>
            <div className={styles.progress} role="img" aria-label={`${e.ref}: recorded demo sample ${e.ackSeconds} seconds; target under 60 seconds; not a verified response SLA`}><span style={{ width: `${Math.min(100, ((e.ackSeconds ?? 0) / ACK_TARGET) * 100)}%`, background: toneVar((e.ackSeconds ?? 0) < ACK_TARGET ? 'success' : 'warn') }} /></div>
          </div></div>)}<p className={styles.meta}>Recorded samples under target: {metTarget} of {acked.length}. Acknowledgement values may be generated by the demo workflow; they do not verify dispatch, arrival or emergency response.</p></> : <EmptyState title="No acknowledgement times yet" description="Recorded demo samples will appear after acknowledgement is recorded." />}
        </Card>
        <Card><CardHeader title="Visitor passes" subtitle="Local demonstration only. These previews are not valid access credentials." action={canMutate ? <Button onClick={() => setShowPass(true)} icon={<QrCode size={16} />}>Preview pass</Button> : undefined} />{passes.length ? passes.map((pass) => <div key={pass.id} className={styles.row}><Avatar name={pass.visitor} /><div className={styles.rowContent}><p className={layout.title}>{pass.visitor}</p><p className={styles.meta}>Host unit {pass.unit} · Local preview</p></div><span className="font-mono text-sm">{pass.code}</span></div>) : <EmptyState icon={<QrCode size={24} />} title="No local pass previews" description="Production pass issuance and gate verification are not connected here." />}</Card>
        <Card><CardHeader title="Patrol log" subtitle="Sample checkpoints for the demo, not a verified live patrol record." />{[['Block C perimeter', '08:30'], ['Main gate & barrier', '07:45'], ['Block D basement', '06:20']].map(([zone, time]) => <div key={zone} className={styles.row}><CheckCircle2 size={18} className="text-text-3" aria-hidden="true" /><span className={`${styles.rowContent} text-sm`}>{zone}</span><span className={styles.meta}>{time}</span></div>)}</Card>
      </div> },
      { id: 'overview', label: 'Shift summary', content: <div className={layout.layout}><div className={layout.metrics}>
        <KpiCard label="Active incidents" value={String(active.length)} icon={<ShieldAlert size={18} />} iconColor={toneVar(unack ? 'danger' : 'success')} />
        <KpiCard label="Demo average acknowledgement" value={avgAck === null ? 'N/A' : `${avgAck}s`} icon={<Timer size={18} />} />
        <KpiCard label="Unacknowledged" value={String(unack)} icon={<Radio size={18} />} iconColor={toneVar(unack ? 'danger' : 'success')} />
        <KpiCard label="Resolved / reviewed" value={String(resolved)} icon={<ShieldCheck size={18} />} />
      </div><p className={styles.meta}>Summary covers demo records in your current estate scope, not a verified shift reporting window. Acknowledgement durations are recorded demo/sample values, not verified response-SLA performance.{!canMutate ? ' Read-only access: incident actions are unavailable for this role.' : ''}</p></div> },
    ]} />
    {canMutate && showPass && <IssuePassDialog onClose={() => setShowPass(false)} onIssue={(pass) => { setPasses((current) => [pass, ...current]); setShowPass(false); }} />}
    {canMutate && terminal && <SosTerminalDialog incident={terminal.incident} event={terminal.event} pending={pending} message={message} onClose={closeTerminal} onConfirm={() => fire(terminal.incident.id, terminal.event)} onDismissMessage={() => setMessage(null)} />}
  </div>;
}

export function SosTerminalDialog({ incident, event, pending, message, onClose, onConfirm, onDismissMessage }: {
  incident: SosView; event: TerminalEvent; pending: boolean; message: string | null;
  onClose: () => void; onConfirm: () => void; onDismissMessage: () => void;
}) {
  const resolving = event === 'RESOLVE';
  const title = `${resolving ? 'Resolve incident' : 'Close and review incident'} ${incident.ref}`;
  return <PortalDialog label={title} onClose={onClose} canClose={!pending} width={520}>
    <form className={layout.modal} aria-busy={pending} onSubmit={(submitEvent) => { submitEvent.preventDefault(); if (pending) return; onConfirm(); }}>
      <div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>{title}</h2><IconButton type="button" aria-label={`Close confirmation for ${incident.ref}`} disabled={pending} onClick={onClose}><X size={18} /></IconButton></div>
      <div className={layout.dialogBody}>
        <div className={layout.person}><Avatar name={incident.residentName} /><div><p className={layout.title}>{incident.residentName}</p><p className={layout.metadata}>Unit {incident.unitId} · {incident.ref}</p></div></div>
        <DomainStatus type="sos" status={incident.status as SosStatus} />
        <p className={styles.body}>{resolving ? 'Confirm the incident has been resolved with the responsible response team before recording resolution. The record remains open for review.' : 'Confirm the incident review is complete before closing this record and removing it from the open incident view.'}</p>
        <p className={styles.meta}>This records a terminal workflow change only. It does not contact emergency services, verify a response or replace your emergency escalation procedure.</p>
        {message && <div role="alert" className={layout.feedback}><span>{message}</span><IconButton type="button" disabled={pending} aria-label={`Dismiss incident error for ${incident.ref}`} onClick={onDismissMessage}><X size={16} /></IconButton></div>}
      </div>
      <div className={styles.dialogFooter}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Recording…' : resolving ? 'Confirm resolution' : 'Confirm close & review'}</Button></div>
    </form>
  </PortalDialog>;
}

function IssuePassDialog({ onClose, onIssue }: { onClose: () => void; onIssue: (pass: Pass) => void }) {
  const id = useId();
  const [visitor, setVisitor] = useState('');
  const [unit, setUnit] = useState('');
  const code = 'DEMO-' + Math.abs(hash(visitor + unit)).toString(36).slice(0, 6).toUpperCase();
  return <PortalDialog label="Preview visitor pass" onClose={onClose} width={480}><form className={layout.modal} onSubmit={(event) => { event.preventDefault(); if (!visitor.trim() || !unit.trim()) return; onIssue({ id: `${code}-${visitor}-${unit}`, visitor: visitor.trim(), code, unit: unit.trim(), expires: 'Demo only' }); }}>
    <div className={layout.dialogHeader}><h2 className="pb-dialog-title">Preview visitor pass</h2><IconButton type="button" aria-label="Close visitor pass preview" onClick={onClose}><X size={18} /></IconButton></div>
    <div className={layout.dialogBody}><p className={styles.body}>This local preview is not issued to a visitor and cannot authorise gate access.</p><div><label htmlFor={`${id}-visitor`} className="pb-form-label">Visitor name</label><input id={`${id}-visitor`} className="pb-form-control" required maxLength={120} value={visitor} onChange={(event) => setVisitor(event.target.value)} /></div><div><label htmlFor={`${id}-unit`} className="pb-form-label">Host unit</label><input id={`${id}-unit`} className="pb-form-control" required maxLength={120} value={unit} onChange={(event) => setUnit(event.target.value)} /></div>{visitor.trim() && <div className={layout.notice}><QrCode size={24} aria-hidden="true" /><div><p className="font-mono text-sm">{code}</p><p className={styles.meta}>Demo reference only · no scannable QR credential</p></div></div>}</div>
    <div className={styles.dialogFooter}><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={!visitor.trim() || !unit.trim()}>Save local preview</Button></div>
  </form></PortalDialog>;
}

function AckRing({ seconds, raised, over }: { seconds: number | null; raised: boolean; over: boolean }) {
  const color = toneVar(raised ? (over ? 'danger' : 'warn') : 'success');
  const percent = raised ? Math.min(100, ((seconds ?? 0) / ACK_TARGET) * 100) : 100;
  return <div className={styles.ring} role="img" aria-label={raised ? `Unacknowledged. ${seconds === null ? 'Checking age.' : `${seconds} seconds since raised.`} Target under 60 seconds.` : `Recorded demo acknowledgement: ${seconds ?? 'unrecorded'} seconds. Not a verified response SLA.`}><svg width={64} height={64} viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(percent / 100) * 94.2} 94.2`} /></svg><span className={styles.ringValue} style={{ color }}>{raised ? (over ? '60s+' : seconds === null ? '—' : `${seconds}s`) : '✓'}</span></div>;
}
function hash(value: string): number { let result = 0; for (let i = 0; i < value.length; i++) result = (Math.imul(31, result) + value.charCodeAt(i)) | 0; return result; }
