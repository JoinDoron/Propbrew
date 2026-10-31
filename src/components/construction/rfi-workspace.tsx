'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileQuestion, Plus } from 'lucide-react';
import { Button, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { ConstructionDialog, ConstructionPanel } from './construction-ui';
import { createRfi, saveRfiDraft, submitRfi, assignRfiResponder, answerRfi, reviewRfiAnswer, distributeRfi, closeRfi, type RfiInput, type Res } from '@/server/actions/construction';
import type { RfiRow } from './documents-workspace';
import styles from './construction-insights-polish.module.css';

export type RfiMemberOption = { userId: string; name: string; canRespond: boolean; packageIds: string[]; profileId: string | null };
export type RfiDrawingOption = { id: string; label: string; fileUrl: string };
type Props = { rfis: RfiRow[]; projectId: string; projects: { id: string; code: string; name: string }[]; workPackages: { id: string; code: string; name: string; costCode?: string }[]; members: RfiMemberOption[]; drawings: RfiDrawingOption[]; actorId: string; canCreate: boolean; canMutate: boolean; canApprove: boolean; isManager: boolean };
type Dialog = { kind: 'new' | 'edit' | 'answer' | 'review' | 'distribute' | 'assign'; rfi?: RfiRow };

function todayPlus(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function date(value?: string) { return value ? new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not recorded'; }
function tone(status: string): 'neutral' | 'info' | 'warn' | 'success' { return status === 'closed' || status === 'distributed' ? 'success' : status === 'answered' || status === 'reviewed' ? 'info' : status === 'draft' ? 'neutral' : 'warn'; }
function memberCanSeePackage(member: RfiMemberOption, projectId: string, packageId: string | undefined, workPackages: Props['workPackages']) {
  if ((member.profileId === 'site-engineer' || member.profileId === 'subcontractor') && !member.packageIds.length) return false;
  if (!member.packageIds.length) return true;
  if (!packageId) return false;
  const costCode = workPackages.find((pack) => pack.id === packageId)?.costCode;
  return member.packageIds.includes(packageId) || Boolean(costCode && member.packageIds.includes(`${projectId}:${costCode}`));
}

export function RfiWorkspace({ rfis, projectId, projects, workPackages, members, drawings, actorId, canCreate, canMutate, canApprove, isManager }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, transition] = useTransition();
  const [search, setSearch] = useState('');
  const filtered = rfis.filter((rfi) => `${rfi.ref} ${rfi.title ?? ''} ${rfi.question} ${rfi.discipline}`.toLowerCase().includes(search.toLowerCase()));
  function open(next: Dialog) { setError(''); setMessage(''); setDialog(next); }
  function run(save: () => Promise<Res>, success: string) {
    if (pending) return;
    setError('');
    transition(async () => {
      try {
        const result = await save();
        if (!result.ok) { setError(result.error); return; }
        setDialog(null); setMessage(`${success}${result.ref ? ` · ${result.ref}` : ''}`); router.refresh();
      } catch { setError('The RFI could not be saved. Check your connection and try again.'); }
    });
  }
  return <ConstructionPanel>
    <div className={styles.header}><CardHeader title="Requests for information" subtitle="Ask, route, answer, review and distribute project questions" action={canCreate && projectId ? <Button variant="primary" type="button" icon={<Plus size={16} />} onClick={() => open({ kind: 'new' })}>New RFI</Button> : undefined} /></div>
    <div className={styles.body}><div className={styles.toolbar}><label className={styles.field}>Project<select className="pb-form-control" aria-label="RFI project" value={projectId} onChange={(event) => router.push(`/construction/documents?projectId=${encodeURIComponent(event.target.value)}&tab=rfis`)}>{projects.length ? projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>) : <option value="">No authorised project</option>}</select></label><label className={styles.field}>Find an RFI<input className="pb-form-control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, title or question" /></label><span className={styles.metadata}>{filtered.length} in this project</span></div>{message && <p role="status" className={styles.notice}>{message}</p>}</div>
    {filtered.length ? <ul className={styles.list}>{filtered.map((rfi) => {
      const owner = rfi.creatorUserId === actorId || !rfi.creatorUserId && isManager;
      const responder = rfi.responderUserId === actorId || !rfi.responderUserId && isManager;
      const waiting = rfi.status === 'submitted' || rfi.status === 'open';
      return <li key={rfi.id} className={styles.row}><div className={styles.rowContent}>
        <div className={styles.toolbar}><div><h3 className={styles.title}>{rfi.ref} · {rfi.title || 'Technical query'}</h3><p className={styles.metadata}>{rfi.discipline} · due {date(rfi.dueISO)} · {rfi.assignedTo || 'Unassigned responder'}</p></div><div className={styles.actions}><StatusPill status={rfi.status} tone={tone(rfi.status)} />{rfi.overdueDays > 0 && <StatusPill status={`${rfi.overdueDays}d overdue`} tone="danger" />}</div></div>
        <p className={styles.text + ' whitespace-pre-wrap'}>{rfi.question}</p>
        <div className={styles.facts}><div><dt>Raised by</dt><dd>{rfi.raisedBy} · {date(rfi.raisedISO)}</dd></div><div><dt>Work package</dt><dd>{workPackages.find((pack) => pack.id === rfi.workPackageId)?.name || 'Project-wide'}</dd></div><div><dt>Drawing revision</dt><dd>{rfi.drawingFileId ? <a className={styles.link} href={`/api/construction/drawings/${rfi.drawingFileId}`} target="_blank" rel="noopener noreferrer">{rfi.drawingRef || 'View drawing PDF'}</a> : rfi.drawingRef || 'None attached'}</dd></div><div><dt>Response drawing</dt><dd>{rfi.responseDrawingFileId ? <a className={styles.link} href={`/api/construction/drawings/${rfi.responseDrawingFileId}`} target="_blank" rel="noopener noreferrer">View approved PDF</a> : 'None attached'}</dd></div></div>
        {rfi.answer && <div className={styles.notice}><h4 className={styles.rowTitle}>Technical answer</h4><p className={styles.text + ' whitespace-pre-wrap'}>{rfi.answer}</p></div>}
        {rfi.distributionUserIds?.length ? <p className={styles.metadata}>Distributed in-app to {rfi.distributionUserIds.length} project member{rfi.distributionUserIds.length === 1 ? '' : 's'} · {date(rfi.distributedISO)}</p> : null}
        {rfi.activity?.length ? <details><summary className={styles.link}>Activity history · {rfi.activity.length} events</summary><ol className={styles.list}>{rfi.activity.map((event, index) => <li key={`${event.atISO}-${index}`} className={styles.metadata}>{date(event.atISO)} · {event.by} {event.action}{event.note ? ` · ${event.note}` : ''}</li>)}</ol>{rfi.responses?.length ? <div className={styles.notice}><h4 className={styles.rowTitle}>Response history</h4>{rfi.responses.map((response, index) => <p key={`${response.atISO}-${index}`} className={styles.text + ' whitespace-pre-wrap'}>{date(response.atISO)} · {response.text}</p>)}</div> : null}</details> : null}
        <div className={styles.actions}>
          {rfi.status === 'draft' && owner && canMutate && <><Button type="button" onClick={() => open({ kind: 'edit', rfi })}>Edit draft</Button><Button variant="primary" type="button" disabled={pending} onClick={() => run(() => submitRfi(rfi.id), 'RFI submitted')}>Submit RFI</Button></>}
          {waiting && isManager && canMutate && <Button type="button" onClick={() => open({ kind: 'assign', rfi })}>Assign responder</Button>}
          {waiting && responder && (canMutate || canApprove) && <Button variant="primary" type="button" onClick={() => open({ kind: 'answer', rfi })}>Answer</Button>}
          {rfi.status === 'answered' && canApprove && <Button variant="primary" type="button" onClick={() => open({ kind: 'review', rfi })}>Review answer</Button>}
          {rfi.status === 'reviewed' && isManager && canMutate && <Button variant="primary" type="button" onClick={() => open({ kind: 'distribute', rfi })}>Distribute answer</Button>}
          {rfi.status === 'distributed' && isManager && canMutate && <Button type="button" disabled={pending} onClick={() => run(() => closeRfi(rfi.id), 'RFI closed')}>Close RFI</Button>}
        </div>
      </div></li>;
    })}</ul> : <div className={styles.empty}><EmptyState icon={<FileQuestion size={26} />} title={rfis.length ? 'No matching RFIs' : 'No RFIs yet'} description={rfis.length ? 'Try another search.' : 'Create a draft to start a traceable project question.'} /></div>}
    <p className={styles.footer}>Drawing links open the approved, stored PDF revision. Distribution sends in-app notifications to selected project members; it does not claim email delivery.</p>
    {dialog && <RfiDialog dialog={dialog} projectId={projectId} workPackages={workPackages} members={members} drawings={drawings} pending={pending} error={error} onClose={() => setDialog(null)} run={run} />}
  </ConstructionPanel>;
}

function RfiDialog({ dialog, projectId, workPackages, members, drawings, pending, error, onClose, run }: { dialog: Dialog; projectId: string; workPackages: Props['workPackages']; members: Props['members']; drawings: Props['drawings']; pending: boolean; error: string; onClose: () => void; run: (save: () => Promise<Res>, success: string) => void }) {
  const row = dialog.rfi;
  const [title, setTitle] = useState(row?.title ?? '');
  const [question, setQuestion] = useState(row?.question ?? '');
  const [discipline, setDiscipline] = useState(row?.discipline ?? '');
  const [dueISO, setDueISO] = useState(row?.dueISO ?? todayPlus(7));
  const [responderUserId, setResponder] = useState(row?.responderUserId ?? '');
  const [drawingDocId, setDrawing] = useState(row?.drawingDocId ?? '');
  const [workPackageId, setPackage] = useState(row?.workPackageId ?? '');
  const [answer, setAnswer] = useState('');
  const [responseDrawingDocId, setResponseDrawing] = useState('');
  const [note, setNote] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const heading = { new: 'New RFI', edit: 'Edit RFI draft', answer: 'Answer RFI', review: 'Review technical answer', distribute: 'Distribute official answer', assign: 'Assign responder' }[dialog.kind];
  const input: RfiInput = { projectId, title, question, discipline, dueISO, responderUserId: responderUserId || undefined, drawingDocId: drawingDocId || undefined, workPackageId: workPackageId || undefined };
  const eligible = members.filter((member) => member.canRespond && memberCanSeePackage(member, projectId, workPackageId, workPackages));
  const recipientsForRfi = members.filter((member) => memberCanSeePackage(member, projectId, row?.workPackageId, workPackages));
  return <ConstructionDialog title={heading} onClose={onClose} pending={pending}><form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (dialog.kind === 'new') run(() => createRfi(input, true), 'RFI submitted'); else if (dialog.kind === 'edit' && row) run(() => saveRfiDraft(row.id, input), 'Draft saved'); else if (dialog.kind === 'answer' && row) run(() => answerRfi(row.id, answer, responseDrawingDocId || undefined), 'Answer recorded'); else if (dialog.kind === 'assign' && row) run(() => assignRfiResponder(row.id, responderUserId), 'Responder assigned'); else if (dialog.kind === 'distribute' && row) run(() => distributeRfi(row.id, recipients, note), 'Answer distributed'); }}>
    {(dialog.kind === 'new' || dialog.kind === 'edit') && <><label className={styles.field}>Title<input className="pb-form-control" required minLength={3} maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Confirm beam opening detail" /></label><label className={styles.field}>Question<textarea className="pb-form-control" required minLength={10} maxLength={3000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Describe the ambiguity and the decision needed." /></label><div className={styles.twoColumns}><label className={styles.field}>Discipline<input className="pb-form-control" required minLength={2} maxLength={80} value={discipline} onChange={(event) => setDiscipline(event.target.value)} placeholder="Structural, MEP…" /></label><label className={styles.field}>Response due<input className="pb-form-control" type="date" required min={todayPlus(0)} value={dueISO} onChange={(event) => setDueISO(event.target.value)} /></label></div><label className={styles.field}>Work package<select className="pb-form-control" value={workPackageId} onChange={(event) => setPackage(event.target.value)}><option value="">Project-wide</option>{workPackages.map((pack) => <option key={pack.id} value={pack.id}>{pack.code} · {pack.name}</option>)}</select></label><label className={styles.field}>Approved drawing PDF<select className="pb-form-control" value={drawingDocId} onChange={(event) => setDrawing(event.target.value)}><option value="">No drawing attached</option>{drawings.map((drawing) => <option key={drawing.id} value={drawing.id}>{drawing.label}</option>)}</select></label><label className={styles.field}>Assigned responder<select className="pb-form-control" required={dialog.kind === 'new'} value={responderUserId} onChange={(event) => setResponder(event.target.value)}><option value="">Choose a responder</option>{eligible.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label></>}
    {dialog.kind === 'answer' && <><div className={styles.notice}><strong>{row?.ref}</strong><p>{row?.question}</p></div><label className={styles.field}>Technical answer<textarea className="pb-form-control" required maxLength={5000} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="State the design decision and source evidence." /></label><label className={styles.field}>Response drawing<select className="pb-form-control" value={responseDrawingDocId} onChange={(event) => setResponseDrawing(event.target.value)}><option value="">No response drawing</option>{drawings.map((drawing) => <option key={drawing.id} value={drawing.id}>{drawing.label}</option>)}</select></label></>}
    {dialog.kind === 'assign' && <label className={styles.field}>Assigned responder<select className="pb-form-control" required value={responderUserId} onChange={(event) => setResponder(event.target.value)}><option value="">Choose a responder</option>{eligible.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>}
    {dialog.kind === 'review' && <><div className={styles.notice}><strong>{row?.ref} · answer</strong><p className="whitespace-pre-wrap">{row?.answer}</p></div><label className={styles.field}>Review note<textarea className="pb-form-control" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required when returning for revision" /></label><div className={styles.actions}><Button type="button" disabled={pending || !note.trim()} onClick={() => row && run(() => reviewRfiAnswer(row.id, 'return', note), 'Answer returned')}>Return for revision</Button><Button variant="primary" type="button" disabled={pending} onClick={() => row && run(() => reviewRfiAnswer(row.id, 'accept', note), 'Answer reviewed')}>Accept answer</Button></div></>}
    {dialog.kind === 'distribute' && <><p className={styles.text}>Select active project members who should receive the reviewed answer in Propbrew.</p><div className={styles.stack}>{recipientsForRfi.map((member) => <label key={member.userId} className={styles.choice}><input type="checkbox" checked={recipients.includes(member.userId)} onChange={(event) => setRecipients(event.target.checked ? [...recipients, member.userId] : recipients.filter((id) => id !== member.userId))} /> {member.name}</label>)}</div><label className={styles.field}>Distribution note<textarea className="pb-form-control" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context for the distribution record" /></label></>}
    {error && <p role="alert" className="text-negative">{error}</p>}
    <div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button>{dialog.kind === 'new' && <Button type="button" disabled={pending} onClick={() => run(() => createRfi(input), 'Draft saved')}>Save draft</Button>}{dialog.kind !== 'review' && <Button variant="primary" type="submit" disabled={pending || dialog.kind === 'distribute' && !recipients.length}>{pending ? 'Saving…' : dialog.kind === 'new' ? 'Submit RFI' : dialog.kind === 'edit' ? 'Save draft' : dialog.kind === 'answer' ? 'Record answer' : dialog.kind === 'distribute' ? 'Distribute' : 'Assign'}</Button>}</div>
  </form></ConstructionDialog>;
}
