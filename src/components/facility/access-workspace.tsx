'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Car, DoorClosed, DoorOpen, LogIn, LogOut, Package, ScanLine, ShieldAlert, Siren, Truck, User, UserPlus, Users } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { FacilityDialog, FacilityFeedback, FacilityKpi } from './facility-ui';
import { type Tone } from '@/lib/status-tones';
import { accessPointTone, isOverstay, type AccessPoint, type VisitorPass, type AccessEvent } from '@/domain/facility';
import { preRegisterVisitor, checkInVisitor, checkOutVisitor, setAccessPointMode, setEstateLockdown, type PreRegisterInput } from '@/server/actions/facility';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './facility-specialists.module.css';

const KIND_ICON: Record<VisitorPass['kind'], React.ReactNode> = { guest: <User size={18} />, contractor: <Truck size={18} />, delivery: <Package size={18} />, ride_hail: <Car size={18} /> };
const KIND_LABEL: Record<VisitorPass['kind'], string> = { guest: 'Guest', contractor: 'Contractor', delivery: 'Delivery', ride_hail: 'Ride-hail' };
const V_STATUS_TONE: Record<VisitorPass['status'], Tone> = { expected: 'info', checked_in: 'progress', checked_out: 'muted', denied: 'danger' };
const EVENT_TONE: Record<AccessEvent['kind'], Tone> = { entry: 'success', exit: 'muted', denied: 'danger', forced: 'danger', held: 'warn' };
const date = (iso: string) => new Date(iso).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });
type AccessUpdate = { fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>; label: string };

export function AccessWorkspace({ points, passes, events, kpis, nowMs, canCreate = false, canUpdate = false }: {
  points: AccessPoint[]; passes: VisitorPass[]; events: AccessEvent[];
  kpis: { onSite: number; expectedToday: number; online: number; totalPoints: number; threats: number }; nowMs: number; canCreate?: boolean; canUpdate?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [confirmation, setConfirmation] = useState<AccessUpdate | null>(null);
  const [showReg, setShowReg] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const lockedDown = points.length > 0 && points.every((point) => point.mode === 'lockdown');
  const orderedPasses = [...passes.filter((pass) => pass.status === 'expected'), ...passes.filter((pass) => pass.status === 'checked_in'), ...passes.filter((pass) => ['checked_out', 'denied'].includes(pass.status))];

  function act(fn: AccessUpdate['fn'], label: string) {
    if (!canUpdate || pending || inFlight.current) return;
    setFeedback(null);
    setConfirmation({ fn, label });
  }
  function confirm() {
    if (!confirmation || !canUpdate || pending || inFlight.current) return;
    inFlight.current = true;
    start(async () => {
      try {
        const result = await confirmation.fn();
        if (!result.ok) { setFeedback(result.error ?? 'The update was not saved.'); return; }
        setConfirmation(null);
        router.refresh();
        setFeedback(confirmation.label + ' recorded' + (result.ref ? ' · ' + result.ref : '') + '. Physical gate/controller operation is not confirmed.');
      } catch { setFeedback('The update could not be confirmed. Refresh the record before trying again.'); }
      finally { inFlight.current = false; }
    });
  }

  return <div className={styles.stack}>
    <Card className={styles.panel}>
      <CardHeader title="Perimeter & visitor operations" subtitle="Recorded access snapshot · not a connected gate controller or live emergency channel" action={<StatusPill status={lockedDown ? 'Lockdown recorded' : 'Standard access recorded'} tone={lockedDown ? 'danger' : 'info'} />} />
      <div className={styles.toolbar}>
        <div className={styles.rowContent}><h2 className={styles.title}>{kpis.onSite} visitor{kpis.onSite === 1 ? '' : 's'} recorded on site</h2><p className={styles.body}>{kpis.expectedToday} expected today · {kpis.online} of {kpis.totalPoints} points marked online.</p><p className={styles.metadata}>Snapshot · {date(new Date(nowMs).toISOString())} WAT. Follow your site procedure for immediate danger.</p></div>
        <Button icon={<Siren size={16} />} className={lockedDown ? undefined : styles.dangerAction} disabled={pending || !canUpdate} onClick={() => act(() => setEstateLockdown(!lockedDown), lockedDown ? 'Lockdown released' : 'Estate locked down')}>{lockedDown ? 'Release lockdown' : 'Lock down estate'}</Button>
      </div>
    </Card>

    <PageTabs label="Access and visitor sections" defaultTab="visitors" items={[
      { id: 'overview', label: 'Access overview', content: <div className={layout.metrics}><FacilityKpi label="On site now" value={String(kpis.onSite)} tone="progress" icon={<Users size={18} />} /><FacilityKpi label="Expected today" value={String(kpis.expectedToday)} tone="info" icon={<UserPlus size={18} />} /><FacilityKpi label="Points online" value={kpis.online + '/' + kpis.totalPoints} tone={kpis.totalPoints > 0 && kpis.online === kpis.totalPoints ? 'success' : 'warn'} icon={<DoorClosed size={18} />} /><FacilityKpi label="Need attention" value={String(kpis.threats)} tone={kpis.threats ? 'danger' : 'success'} icon={<ShieldAlert size={18} />} /></div> },
      { id: 'points', label: 'Access points', content: points.length ? <div className={styles.recordGrid}>{points.map((point) => {
        const label = point.mode === 'lockdown' ? 'Lockdown' : point.status === 'held_open' ? 'Held open' : point.status === 'forced' ? 'Forced entry recorded' : point.status === 'offline' ? 'Offline' : point.mode;
        return <Card key={point.id} padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title={point.name} subtitle={point.kind.charAt(0).toUpperCase() + point.kind.slice(1) + ' · application record'} action={<StatusPill status={label} tone={accessPointTone(point)} />} /></div><div className={styles.panelBody}><dl className={styles.facts}><div><dt>Connection state</dt><dd>{point.status.replaceAll('_', ' ')}</dd></div><div><dt>Recorded mode</dt><dd>{point.mode}</dd></div><div><dt>Battery</dt><dd>{point.batteryPct === undefined ? 'Not recorded' : point.batteryPct + '%'}</dd></div><div><dt>Last event · WAT</dt><dd>{date(point.lastEventISO)}</dd></div></dl></div>{canUpdate && point.mode !== 'lockdown' && point.status !== 'offline' ? <div className={styles.footer}><div className={styles.actions}><Button disabled={pending} icon={point.mode === 'unlocked' ? <DoorClosed size={16} /> : <DoorOpen size={16} />} onClick={() => act(() => setAccessPointMode(point.id, point.mode === 'unlocked' ? 'secured' : 'unlocked'), point.mode === 'unlocked' ? 'Secured' : 'Unlocked')}>{point.mode === 'unlocked' ? 'Record secured mode' : 'Record unlocked mode'}</Button></div></div> : <p className={styles.footer}>{point.status === 'offline' ? 'No mode update is available while the point is recorded offline.' : point.mode === 'lockdown' ? 'Release the recorded estate lockdown before changing individual modes.' : 'Read-only access record.'}</p>}</Card>;
      })}</div> : <Card><EmptyState icon={<DoorClosed size={26} />} title="No access points recorded" description="No gates, doors or barriers are recorded in your current facility scope." /></Card> },
      { id: 'visitors', label: 'Visitor passes', count: passes.length, content: <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Visitor passes" subtitle="Expected visitors, current visits and completed pass records" action={<Button variant="primary" disabled={!canCreate || pending} icon={<UserPlus size={16} />} onClick={() => { setFeedback(null); setShowReg(true); }}>Pre-register</Button>} /></div>{orderedPasses.length ? <div className={styles.scroll} role="region" aria-label="Visitor pass register" tabIndex={0}><table className={'pb-data-table ' + styles.table}><thead><tr>{['Visitor', 'Host & destination', 'Visit details', 'Valid window · WAT', 'Status', 'Action'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{orderedPasses.map((pass) => <tr key={pass.id}><td><div className={styles.identity}><span className={styles.icon}>{KIND_ICON[pass.kind]}</span><div><p className={styles.rowTitle}>{pass.visitorName}</p><p className={styles.metadata}>{pass.code} · {KIND_LABEL[pass.kind]}</p></div></div></td><td><p className={styles.rowTitle}>{pass.hostName || 'Host not recorded'}</p><p className={styles.metadata}>{pass.hostUnit || 'Unit not recorded'}</p></td><td><p className={styles.body}>{pass.purpose || 'No purpose recorded'}</p><p className={styles.metadata}>{pass.vehiclePlate ? 'Vehicle · ' + pass.vehiclePlate : 'No vehicle plate recorded'}</p></td><td><p className={styles.body}>{date(pass.validFromISO)}</p><p className={styles.metadata}>Until {date(pass.validToISO)}</p></td><td><StatusPill status={isOverstay(pass, nowMs) ? 'Overstay · checked in' : pass.status.replaceAll('_', ' ')} tone={isOverstay(pass, nowMs) ? 'danger' : V_STATUS_TONE[pass.status]} /></td><td>{canUpdate && pass.status === 'expected' ? <Button variant="primary" disabled={pending} icon={<LogIn size={16} />} onClick={() => act(() => checkInVisitor(pass.id), 'Checked in')}>Check in</Button> : canUpdate && pass.status === 'checked_in' ? <Button disabled={pending} icon={<LogOut size={16} />} onClick={() => act(() => checkOutVisitor(pass.id), 'Checked out')}>Check out</Button> : <span className={styles.metadata}>{['checked_out', 'denied'].includes(pass.status) ? 'Completed record' : 'Read-only'}</span>}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState icon={<Users size={26} />} title="No visitor passes" description="Pre-register an expected visitor when their host and destination have been confirmed." /></div>}<p className={styles.footer}>Showing all {orderedPasses.length} scoped pass record(s). Check-in and check-out record a visit; they do not confirm identity verification or operate a physical gate.</p></Card> },
      { id: 'feed', label: 'Gate activity', content: <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Recorded gate activity" subtitle="Application events · not a connected live security feed" action={<ScanLine size={18} className="text-primary" />} /></div>{events.length ? <div className={styles.scroll} role="region" aria-label="Recorded gate activity register" tabIndex={0}><table className={'pb-data-table ' + styles.table}><thead><tr>{['Event', 'Access point', 'Subject', 'Credential', 'Recorded · WAT'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><StatusPill status={event.kind === 'forced' ? 'Forced entry' : event.kind === 'held' ? 'Held / manual' : event.kind} tone={EVENT_TONE[event.kind]} /></td><td>{event.pointName}</td><td>{event.subjectName}</td><td><p className={styles.body}>{event.credential}</p>{event.passCode ? <p className={styles.metadata}>{event.passCode}</p> : null}</td><td>{date(event.atISO)}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState icon={<ScanLine size={26} />} title="No gate activity recorded" description="No access events are recorded in this scope. An empty record is not a live security all-clear." /></div>}<p className={styles.footer}>Times are shown in West Africa Time. These records do not confirm a physical controller response or emergency dispatch.</p></Card> },
    ]} />

    {confirmation ? <FacilityDialog title="Confirm access update" pending={pending} onClose={() => setConfirmation(null)}><div className={styles.stack}><p className={styles.title}>{confirmation.label}</p><p className={styles.body}>Verify the visitor or access instruction before recording this change. This updates the application record only; no connected gate/controller operation is confirmed. Follow your site emergency procedure for immediate danger.</p>{feedback ? <p role="alert" className="text-[14px] text-negative">{feedback}</p> : null}<div className={styles.actions}><Button disabled={pending} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant="primary" disabled={pending} onClick={confirm}>{pending ? 'Saving…' : 'Confirm update'}</Button></div></div></FacilityDialog> : null}
    {showReg ? <PreRegisterDialog onClose={() => setShowReg(false)} onDone={(code) => { setShowReg(false); setFeedback('Visitor pass recorded · ' + code + '. Host and identity checks remain part of the site entry procedure.'); }} /> : null}
    {feedback && !confirmation && !showReg ? <FacilityFeedback message={feedback} onDismiss={() => setFeedback(null)} /> : null}
  </div>;
}

function PreRegisterDialog({ onClose, onDone }: { onClose: () => void; onDone: (code: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [form, setForm] = useState<PreRegisterInput>({ visitorName: '', kind: 'guest', hostName: '', hostUnit: '', purpose: '', vehiclePlate: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof PreRegisterInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  function submit() {
    if (pending || inFlight.current || !form.visitorName.trim()) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try {
        const result = await preRegisterVisitor(form);
        if (!result.ok) { setError(result.error); return; }
        router.refresh();
        onDone(result.ref ?? '');
      } catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); }
      finally { inFlight.current = false; }
    });
  }
  return <FacilityDialog title="Pre-register visitor" onClose={onClose} pending={pending}><form className={styles.stack} onSubmit={(event) => { event.preventDefault(); submit(); }}><p className={styles.body}>Record the expected visitor and their destination. A pass is an application record, not confirmation that identity or entry approval has been checked.</p><label className={styles.field}>Visitor name<input disabled={pending} required value={form.visitorName} onChange={(event) => set('visitorName', event.target.value)} className="pb-form-control" autoFocus placeholder="e.g. Ade Balogun" /></label><div className={styles.formGrid}><label className={styles.field}>Visit type<select disabled={pending} value={form.kind} onChange={(event) => set('kind', event.target.value)} className="pb-form-control"><option value="guest">Guest</option><option value="contractor">Contractor</option><option value="delivery">Delivery</option><option value="ride_hail">Ride-hail</option></select></label><label className={styles.field}>Vehicle plate · optional<input disabled={pending} value={form.vehiclePlate} onChange={(event) => set('vehiclePlate', event.target.value)} className="pb-form-control" placeholder="e.g. ABC 123 XY" /></label><label className={styles.field}>Host name<input disabled={pending} value={form.hostName} onChange={(event) => set('hostName', event.target.value)} className="pb-form-control" placeholder="Resident or responsible host" /></label><label className={styles.field}>Host unit<input disabled={pending} value={form.hostUnit} onChange={(event) => set('hostUnit', event.target.value)} className="pb-form-control" placeholder="Block C · 12B" /></label></div><label className={styles.field}>Visit purpose<input disabled={pending} value={form.purpose} onChange={(event) => set('purpose', event.target.value)} className="pb-form-control" placeholder="Family visit" /></label>{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || !form.visitorName.trim()}>{pending ? 'Recording…' : 'Issue gate pass'}</Button></div></form></FacilityDialog>;
}
