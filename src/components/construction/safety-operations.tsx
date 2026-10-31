'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, StatusPill } from '@/components/ui';
import { PERMIT_LABEL, type SafetyPermitType } from '@/domain/construction';
import { activateSafetyPermit, assignSafetyCorrectiveAction, closeSafetyPermit, decideSafetyPermit, escalateOverdueSafetyAction, recordToolboxTalk, requestSafetyPermit, reviewSafetyCorrectiveAction, startSafetyCorrectiveAction, submitSafetyCorrectiveAction } from '@/server/actions/construction-safety';
import type { EventRow, PermitRow } from './safety-workspace';
import styles from './construction-delivery-polish.module.css';

type Result = { ok: true; message?: string; ref?: string } | { ok: false; error: string };
const permitTypes: SafetyPermitType[] = ['hot_work', 'height', 'excavation', 'confined_space', 'lifting', 'electrical'];

function useSafetyAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  function run(action: () => Promise<Result>, onSuccess?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) { setFeedback({ ok: false, text: result.error }); return; }
        setFeedback({ ok: true, text: result.message ?? `${result.ref ?? 'Record'} saved.` });
        onSuccess?.();
        router.refresh();
      } catch { setFeedback({ ok: false, text: 'Could not save this safety record. Try again.' }); }
    });
  }
  return { pending, feedback, run };
}

function Feedback({ value }: { value: { ok: boolean; text: string } | null }) {
  return value ? <p role="status" className={value.ok ? styles.text : styles.error}>{value.text}</p> : null;
}

export function SafetyProjectSelector({ projectId, projects }: { projectId: string; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  return projects.length > 1 ? <label className={`${styles.field} mt-3 max-w-sm`}>
    Project
    <select value={projectId} onChange={(event) => router.push(`/construction/safety?projectId=${encodeURIComponent(event.target.value)}`)}>
      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
  </label> : null;
}

export function PermitRequestForm({ projectId, todayISO, zones }: { projectId: string; todayISO: string; zones: { id: string; label: string }[] }) {
  const { pending, feedback, run } = useSafetyAction();
  const [open, setOpen] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const zoneId = String(data.get('zoneId') ?? '');
    run(() => requestSafetyPermit({ projectId, type: String(data.get('type')) as SafetyPermitType, zoneId: zoneId || undefined,
      location: String(data.get('location') ?? ''), supervisor: String(data.get('supervisor') ?? ''),
      validFromISO: String(data.get('validFromISO') ?? ''), validToISO: String(data.get('validToISO') ?? ''),
      controls: String(data.get('controls') ?? '').split(/\n|;/).map((value) => value.trim()).filter(Boolean) }), () => { form.reset(); setOpen(false); });
  }
  return <Card className={styles.section}>
    <div className={styles.header}><CardHeader title="Permit requests" subtitle="New work remains on hold until an independent review and on-site activation." action={<Button type="button" variant="primary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? 'Cancel request' : 'Request permit'}</Button>} /></div>
    {open && <form onSubmit={submit} className={styles.body}>
      <div className={styles.formGrid}>
        <label className={styles.field}>Work type<select name="type" required>{permitTypes.map((type) => <option key={type} value={type}>{PERMIT_LABEL[type]}</option>)}</select></label>
        <label className={styles.field}>Zone<select name="zoneId"><option value="">No mapped zone</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></label>
        <label className={styles.field}>Exact work location<input name="location" required minLength={3} maxLength={160} placeholder="Block A · roof east" /></label>
        <label className={styles.field}>Responsible supervisor<input name="supervisor" required minLength={2} maxLength={120} /></label>
        <label className={styles.field}>Valid from<input name="validFromISO" type="date" defaultValue={todayISO} min={todayISO} required /></label>
        <label className={styles.field}>Valid until<input name="validToISO" type="date" defaultValue={todayISO} min={todayISO} required /></label>
      </div>
      <label className={`${styles.field} mt-4`}>Site controls · one per line<textarea name="controls" required minLength={3} maxLength={4800} placeholder="Isolation confirmed&#10;Fire watch assigned&#10;PPE and rescue plan checked" /></label>
      <div className={`${styles.actions} mt-4`}><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Submit for review'}</Button></div>
    </form>}
    <Feedback value={feedback} />
  </Card>;
}

export function PermitActions({ permit, actorId, canReview, canActivate }: { permit: PermitRow; actorId: string; canReview: boolean; canActivate: boolean }) {
  const { pending, feedback, run } = useSafetyAction();
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const reviewable = canReview && permit.status === 'requested' && permit.requestedById !== actorId;
  const activatable = canActivate && permit.status === 'approved' && !permit.expired;
  const closable = canActivate && (permit.status === 'active' || permit.status === 'approved');
  if (!reviewable && !activatable && !closable) return null;
  return <div className={`${styles.fieldSection} mt-4`}>
    {reviewable && <p className={styles.metadata}>Independent reviewer: check controls, site coordination and validity before approval. Overlaps require a coordination note.</p>}
    {activatable && <label className={styles.field}><span className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I checked these controls at the work area</span></label>}
    <label className={styles.field}>{reviewable ? 'Review / rejection note' : activatable ? 'On-site controls check' : 'Completion or withdrawal reason'}<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></label>
    <div className={styles.inline}>
      {reviewable && <><Button type="button" disabled={pending} onClick={() => run(() => decideSafetyPermit(permit.id, 'approved', note), () => setNote(''))}>Approve request</Button><Button type="button" disabled={pending} onClick={() => run(() => decideSafetyPermit(permit.id, 'rejected', note), () => setNote(''))}>Reject request</Button></>}
      {activatable && <Button type="button" variant="primary" disabled={pending || !confirmed} onClick={() => run(() => activateSafetyPermit(permit.id, confirmed, note), () => setNote(''))}>Activate on site</Button>}
      {closable && <Button type="button" disabled={pending} onClick={() => run(() => closeSafetyPermit(permit.id, note), () => setNote(''))}>Close permit</Button>}
    </div>
    <Feedback value={feedback} />
  </div>;
}

export function ToolboxTalkForm({ projectId, todayISO }: { projectId: string; todayISO: string }) {
  const { pending, feedback, run } = useSafetyAction();
  const [open, setOpen] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const location = String(data.get('location') ?? '').trim();
    run(() => recordToolboxTalk({ projectId, topic: String(data.get('topic') ?? ''), atISO: String(data.get('atISO') ?? ''), attendees: Number(data.get('attendees')), deliveredBy: String(data.get('deliveredBy') ?? ''), location: location || undefined }), () => { form.reset(); setOpen(false); });
  }
  return <div className={styles.row}>
    <Button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? 'Cancel' : 'Record toolbox talk'}</Button>
    {open && <form onSubmit={submit} className={`${styles.fieldSection} mt-4`}>
      <div className={styles.formGrid}>
        <label className={styles.field}>Topic<input name="topic" required minLength={3} maxLength={200} /></label>
        <label className={styles.field}>Date<input type="date" name="atISO" max={todayISO} defaultValue={todayISO} required /></label>
        <label className={styles.field}>Facilitator<input name="deliveredBy" required minLength={2} maxLength={120} /></label>
        <label className={styles.field}>Attendance count<input type="number" name="attendees" required min={1} max={5000} /></label>
        <label className={styles.field}>Work area<input name="location" minLength={3} maxLength={160} /></label>
      </div>
      <div className={styles.actions}><Button type="submit" variant="primary" disabled={pending}>Save talk record</Button></div>
    </form>}
    <Feedback value={feedback} />
  </div>;
}

export function CorrectiveActions({ event, members, actorId, todayISO, canUpdate, canAssign, canVerify }: { event: EventRow; members: { userId: string; name: string }[]; actorId: string; todayISO: string; canUpdate: boolean; canAssign: boolean; canVerify: boolean }) {
  const { pending, feedback, run } = useSafetyAction();
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const work = event.corrective;
  const overdue = work && work.status !== 'verified' && work.dueISO < todayISO;
  if (event.closed && !work) return null;
  function assign(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault(); const form = submitEvent.currentTarget; const data = new FormData(form);
    run(() => assignSafetyCorrectiveAction(event.id, { ownerUserId: String(data.get('ownerUserId')), dueISO: String(data.get('dueISO')), description: String(data.get('description')) }));
  }
  return <div className={`${styles.fieldSection} mt-4`}>
    {!work && canAssign && !event.closed && <form onSubmit={assign} className={styles.fieldSection}>
      <h3 className={styles.title}>Assign corrective work</h3>
      <div className={styles.formGrid}>
        <label className={styles.field}>Project team member<select name="ownerUserId" required defaultValue=""><option value="" disabled>Select an owner</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
        <label className={styles.field}>Due date<input type="date" name="dueISO" min={todayISO} defaultValue={todayISO} required /></label>
      </div>
      <label className={styles.field}>Required correction<textarea name="description" required minLength={8} maxLength={1000} defaultValue={event.action ?? ''} /></label>
      <div className={styles.actions}><Button type="submit" disabled={pending || !members.length}>Assign and notify</Button></div>
    </form>}
    {work && <>
      <div className={styles.inline}><StatusPill status={work.status.replaceAll('_', ' ')} tone={work.status === 'verified' ? 'success' : overdue ? 'danger' : 'warn'} />{overdue && <StatusPill status="Overdue" tone="danger" />}{work.escalatedAtISO && <StatusPill status="Escalated" tone="danger" />}</div>
      <p className={styles.text}>Owner: {work.ownerName} · Due: {work.dueISO} · {work.description}</p>
      {work.evidenceReference && <p className={styles.text}>Evidence reference: {work.evidenceReference}</p>}
      {work.completionNote && <p className={styles.text}>Completion: {work.completionNote}</p>}
      {work.reviewNote && <p className={styles.text}>Review: {work.reviewNote}</p>}
      {canUpdate && work.ownerUserId === actorId && ['assigned', 'returned'].includes(work.status) && <Button type="button" disabled={pending} onClick={() => run(() => startSafetyCorrectiveAction(event.id))}>Start corrective work</Button>}
      {canUpdate && work.ownerUserId === actorId && work.status === 'in_progress' && <>
        <label className={styles.field}>Evidence reference<input value={evidence} onChange={(item) => setEvidence(item.target.value)} placeholder="Photo, report or document reference" maxLength={200} /></label>
        <label className={styles.field}>Completion details<textarea value={note} onChange={(item) => setNote(item.target.value)} maxLength={1000} /></label>
        <Button type="button" disabled={pending} onClick={() => run(() => submitSafetyCorrectiveAction(event.id, evidence, note), () => { setEvidence(''); setNote(''); })}>Submit for independent review</Button>
      </>}
      {canVerify && work.status === 'awaiting_review' && work.ownerUserId !== actorId && <>
        <label className={styles.field}>Verification finding<textarea value={note} onChange={(item) => setNote(item.target.value)} maxLength={1000} /></label>
        <div className={styles.inline}><Button type="button" disabled={pending} onClick={() => run(() => reviewSafetyCorrectiveAction(event.id, 'verified', note), () => setNote(''))}>Verify and close</Button><Button type="button" disabled={pending} onClick={() => run(() => reviewSafetyCorrectiveAction(event.id, 'returned', note), () => setNote(''))}>Return for rework</Button></div>
      </>}
      {canAssign && overdue && !work.escalatedAtISO && <>
        <label className={styles.field}>Escalation reason<textarea value={note} onChange={(item) => setNote(item.target.value)} maxLength={500} /></label>
        <Button type="button" disabled={pending} onClick={() => run(() => escalateOverdueSafetyAction(event.id, note), () => setNote(''))}>Escalate overdue action</Button>
      </>}
    </>}
    <Feedback value={feedback} />
  </div>;
}
