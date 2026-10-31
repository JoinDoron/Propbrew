'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card, StatusPill } from '@/components/ui';
import type { Issue, QualityChecklistResult, QualityInspectionVisit } from '@/domain/construction/types';
import {
  recordConstructionInspectionVisit, scheduleConstructionInspection, scheduleConstructionReinspection, signOffConstructionQuality,
} from '@/server/actions/construction-quality';
import { QualityPhotoPicker } from './quality-photo-picker';
import styles from '../quality-workspace.module.css';

type ResultInput = Omit<QualityChecklistResult, 'result'> & { result: QualityChecklistResult['result'] | '' };
const defaultResult = (itemId: string): ResultInput => ({ itemId, result: '', finding: '', photoIds: [] });
const formatAppointment = (visit: QualityInspectionVisit) => `${visit.dateISO} at ${visit.timeWAT} WAT`;

export function InspectionFlow({ inspections, projectId, companyId, today, canCreate, canUpdate, canSignOff, packages }: {
  inspections: Issue[]; projectId: string; companyId: string; today: string; canCreate: boolean; canUpdate: boolean; canSignOff: boolean;
  packages: { id: string; name: string }[];
}) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [checklist, setChecklist] = useState<string[]>(['']);
  const [showForm, setShowForm] = useState(false);
  function submit(form: FormData) {
    start(async () => {
      const result = await scheduleConstructionInspection({
        projectId, title: String(form.get('title') ?? ''), location: String(form.get('location') ?? ''),
        owner: String(form.get('owner') ?? ''), authority: String(form.get('authority') ?? ''), dueISO: String(form.get('dueISO') ?? ''),
        workPackageId: String(form.get('workPackageId') ?? '') || undefined,
        checklist: checklist.map((row) => row.trim()).filter(Boolean),
        appointment: { dateISO: String(form.get('dateISO') ?? ''), timeWAT: String(form.get('timeWAT') ?? ''), inspector: String(form.get('inspector') ?? '') },
      });
      setMessage(result.ok ? 'Inspection appointment and checklist saved.' : result.error);
      if (result.ok) { setShowForm(false); setChecklist(['']); router.refresh(); }
    });
  }
  return <div className={styles.flow}>
    <div className={styles.sectionHeading}><div><h2>Authority inspections</h2><p>Schedule the visit, record every checklist result, track findings and record the authority decision.</p></div>{canCreate && <Button type="button" variant="primary" onClick={() => setShowForm((value) => !value)}>{showForm ? 'Close form' : 'Schedule inspection'}</Button>}</div>
    {message && <p className={styles.feedback} role="status">{message}</p>}
    {showForm && <Card><form className={styles.form} action={submit}>
      <label>Inspection title<input name="title" required minLength={4} maxLength={180} placeholder="Block A fire safety inspection" /></label>
      <label>Authority<input name="authority" required minLength={2} maxLength={160} placeholder="Lagos State Fire Service" /></label>
      <label>Inspector / contact<input name="inspector" required minLength={2} maxLength={120} /></label>
      <label>Appointment date<input name="dateISO" type="date" min={today} defaultValue={today} required /></label>
      <label>Time · WAT<input name="timeWAT" type="time" defaultValue="09:00" required /></label>
      <label>Location / zone<input name="location" required minLength={2} maxLength={160} /></label>
      <label>Corrective-work owner<input name="owner" required minLength={2} maxLength={100} /></label>
      <label>Correction deadline<input name="dueISO" type="date" min={today} defaultValue={today} required /></label>
      {packages.length > 0 && <label>Work package<select name="workPackageId"><option value="">Whole project</option>{packages.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>}
      <fieldset className={styles.wideField}><legend>Inspection checklist</legend><div className={styles.checklistEditor}>{checklist.map((label, index) => <div className={styles.checklistRow} key={index}><input aria-label={`Checklist item ${index + 1}`} value={label} minLength={4} maxLength={180} required onChange={(event) => setChecklist((rows) => rows.map((item, position) => position === index ? event.target.value : item))} placeholder="What must the inspector verify?" /><Button type="button" disabled={checklist.length === 1} onClick={() => setChecklist((rows) => rows.filter((_, position) => position !== index))}>Remove</Button></div>)}<Button type="button" disabled={checklist.length >= 25} onClick={() => setChecklist((rows) => [...rows, ''])}>Add checklist item</Button></div></fieldset>
      <div className={styles.formAction}><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Schedule inspection'}</Button></div>
    </form></Card>}
    {inspections.length ? inspections.map((issue) => <InspectionCard key={issue.id} issue={issue} companyId={companyId} today={today} canUpdate={canUpdate} canSignOff={canSignOff} />) : <Card><p className={styles.empty}>No authority inspection appointments for this project yet.</p></Card>}
  </div>;
}

function InspectionCard({ issue, companyId, today, canUpdate, canSignOff }: { issue: Issue; companyId: string; today: string; canUpdate: boolean; canSignOff: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inspection = issue.inspection;
  if (!inspection) return <Card className={styles.issue}><div className={styles.issueHead}><h3>{issue.title}</h3><StatusPill status="Legacy register" tone="warn" /></div><p className={styles.meta}>This older authority item has no appointment or checklist. Keep its reference for the project audit.</p></Card>;
  const latest = inspection.visits.at(-1)!;
  const failed = latest.results?.filter((row) => row.result === 'fail') ?? [];
  const clear = Boolean(latest.recordedAtISO && latest.results?.every((row) => row.result !== 'fail'));
  const stage = issue.status === 'resolved' ? 'Signed off' : !latest.recordedAtISO ? latest.kind === 'initial' ? 'Visit scheduled' : 'Reinspection scheduled' : failed.length ? 'Corrective work' : 'Awaiting sign-off';
  function run(work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => { const result = await work(); setMessage(result.ok ? success : result.error ?? 'Could not save.'); if (result.ok) router.refresh(); });
  }
  return <Card className={styles.issue}>
    <div className={styles.issueHead}><div><p className={styles.meta}>{issue.location} · {issue.authority}</p><h3>{issue.title}</h3></div><StatusPill status={stage} tone={issue.status === 'resolved' ? 'success' : failed.length ? 'warn' : 'info'} /></div>
    <div className={styles.details}><span>Appointment: {formatAppointment(latest)}</span><span>Inspector: {latest.inspector}</span><span>Owner: {issue.owner}</span></div>
    <Button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={`inspection-${issue.id}`}>{expanded ? 'Hide inspection details' : 'Open inspection'}</Button>
    {expanded && <div id={`inspection-${issue.id}`} className={styles.editor}>
      <ol className={styles.timeline}>{inspection.visits.map((visit) => <li key={visit.id}><strong>{visit.kind === 'initial' ? 'Initial inspection' : 'Reinspection'} · {formatAppointment(visit)}</strong><span>{visit.recordedAtISO ? `Recorded ${visit.recordedAtISO.slice(0, 10)} · ${visit.results?.filter((row) => row.result === 'fail').length ?? 0} finding(s)` : 'Awaiting site visit'}</span>{visit.notes && <p>{visit.notes}</p>}</li>)}</ol>
      {latest.recordedAtISO && <ul className={styles.checklistResults}>{inspection.checklist.map((line) => { const result = latest.results?.find((row) => row.itemId === line.id); return <li key={line.id}><span><strong>{line.label}</strong>{result?.finding && <small>{result.finding}</small>}</span><StatusPill status={result?.result.replaceAll('_', ' ') ?? 'Pending'} tone={result?.result === 'fail' ? 'danger' : 'success'} />{result?.photoIds.map((id) => <a key={id} href={`/api/construction/quality/photos/${id}`} target="_blank" rel="noopener noreferrer">View photo</a>)}</li>; })}</ul>}
      {inspection.signOff && <div className={styles.signoff}><strong>Recorded authority sign-off</strong><p>{inspection.signOff.signer} · {inspection.signOff.role} · {inspection.signOff.reference}</p><p>{inspection.signOff.decision}</p><small>Recorded by company member {inspection.signOff.recordedBy} on {inspection.signOff.recordedAtISO.slice(0, 10)}. This is a recorded decision, not independent verification by Propbrew.</small></div>}
      {message && <p className={styles.feedback} role="status">{message}</p>}
      {canUpdate && issue.status !== 'resolved' && !latest.recordedAtISO && <VisitForm issue={issue} visit={latest} companyId={companyId} pending={pending} onSubmit={(input) => run(() => recordConstructionInspectionVisit(issue.id, input), 'Inspection results recorded. Failed checks are now punch items.')} />}
      {canUpdate && issue.status !== 'resolved' && latest.recordedAtISO && failed.length > 0 && <form className={styles.inlineForm} action={(form) => run(() => scheduleConstructionReinspection(issue.id, { dateISO: String(form.get('dateISO')), timeWAT: String(form.get('timeWAT')), inspector: String(form.get('inspector')) }), 'Reinspection scheduled.')}><h4>Schedule reinspection</h4><p className={styles.meta}>Corrective work and photos must be submitted for each finding first.</p><label>Date<input type="date" name="dateISO" min={today} defaultValue={today} required /></label><label>Time · WAT<input type="time" name="timeWAT" defaultValue="09:00" required /></label><label>Inspector<input name="inspector" required minLength={2} maxLength={120} defaultValue={latest.inspector} /></label><Button type="submit" disabled={pending}>Schedule reinspection</Button></form>}
      {canSignOff && issue.status !== 'resolved' && clear && <SignOffForm pending={pending} authority={issue.authority} onSubmit={(input) => run(() => signOffConstructionQuality(issue.id, input), 'Sign-off recorded. The inspection and linked punch items are closed.')} />}
    </div>}
  </Card>;
}

function VisitForm({ issue, visit, companyId, pending, onSubmit }: {
  issue: Issue; visit: QualityInspectionVisit; companyId: string; pending: boolean;
  onSubmit: (input: { visitId: string; notes: string; results: QualityChecklistResult[] }) => void;
}) {
  const checklist = issue.inspection!.checklist;
  const [results, setResults] = useState<ResultInput[]>(() => checklist.map((item) => defaultResult(item.id)));
  const [notes, setNotes] = useState('');
  const update = (itemId: string, patch: Partial<ResultInput>) => setResults((rows) => rows.map((row) => row.itemId === itemId ? { ...row, ...patch } : row));
  return <form className={styles.visitForm} onSubmit={(event) => { event.preventDefault(); if (results.some((row) => !row.result)) return; onSubmit({ visitId: visit.id, notes, results: results as QualityChecklistResult[] }); }}>
    <h4>Record {visit.kind === 'initial' ? 'inspection' : 'reinspection'} results</h4>
    <p className={styles.meta}>Choose a result for every check. Failed checks need a finding and a stored photo.</p>
    {checklist.map((line) => { const row = results.find((item) => item.itemId === line.id)!; return <fieldset className={styles.resultRow} key={line.id}><legend>{line.label}</legend><label>Result<select value={row.result} required onChange={(event) => update(line.id, { result: event.target.value as ResultInput['result'], finding: '' })}><option value="">Choose result</option><option value="pass">Pass</option><option value="fail">Finding</option><option value="not_applicable">Not applicable</option></select></label>{row.result === 'fail' && <label>Finding<textarea value={row.finding} minLength={8} maxLength={1000} required onChange={(event) => update(line.id, { finding: event.target.value })} placeholder="Describe what was found and where" /></label>}{(row.result === 'fail' || visit.kind === 'reinspection' && Boolean(line.punchIssueId)) && <QualityPhotoPicker companyId={companyId} issueId={issue.id} selectedIds={row.photoIds} onChange={(ids) => update(line.id, { photoIds: ids })} disabled={pending} />}</fieldset>; })}
    <label>Visit notes<textarea value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} /></label>
    <Button type="submit" variant="primary" disabled={pending || results.some((row) => !row.result)}>{pending ? 'Saving…' : 'Record inspection results'}</Button>
  </form>;
}

export function SignOffForm({ pending, authority, onSubmit }: { pending: boolean; authority?: string; onSubmit: (input: { signer: string; role: string; reference: string; decision: string }) => void }) {
  return <form className={styles.inlineForm} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ signer: String(form.get('signer')), role: String(form.get('role')), reference: String(form.get('reference')), decision: String(form.get('decision')) }); }}>
    <h4>Record sign-off</h4><p className={styles.meta}>Enter the actual authority or project approver and their written decision. Propbrew records your attestation; it does not issue the approval.</p>
    <label>Signer<input name="signer" required minLength={2} maxLength={120} /></label><label>Role / authority<input name="role" required minLength={2} maxLength={100} defaultValue={authority} /></label><label>Approval reference<input name="reference" required minLength={3} maxLength={160} placeholder="Certificate or signed report reference" /></label><label>Decision<textarea name="decision" required minLength={8} maxLength={1000} placeholder="Summarise the signed decision" /></label><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Record sign-off and close'}</Button>
  </form>;
}
