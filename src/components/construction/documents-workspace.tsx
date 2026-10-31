'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, FileText, HelpCircle, Layers, ShieldCheck } from 'lucide-react';
import { Button, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';
import { useConstructionSave, useConstructionReview, ConstructionPanel, ConstructionToast, ConstructionKpi as Kpi, ConstructionDialog, ConstructionFrame } from './construction-ui';
import { DOC_STATUS_TONE, type DocStatus } from '@/domain/construction';
import { type Tone } from '@/lib/status-tones';
import { issueRevision, approveRevision, sendTransmittal } from '@/server/actions/construction';
import type { RFI } from '@/domain/construction/types';
import { RfiWorkspace, type RfiMemberOption, type RfiDrawingOption } from './rfi-workspace';
import { DrawingControls } from './drawing-controls';
import styles from './construction-insights-polish.module.css';

export type DocRev = { id: string; revision: string; status: DocStatus; effectiveISO: string; changeNote?: string; uploadedBy?: string; approvedBy?: string; approvedISO?: string; fileName?: string; fileUrl?: string; fileSizeBytes?: number; fileSha256?: string; requiresFile?: boolean; locationIds?: string[]; workPackageIds?: string[]; transmittals: { toParty: string; sentISO: string; purpose: string; acknowledged: boolean }[] };
export type RegisterRow = { number: string; title: string; discipline: string; folder: string; currentRevision: string | null; currentId: string | null; inReview: number; revisions: DocRev[] };
export type RfiRow = Omit<Partial<RFI>, 'tenantId'> & Required<Pick<RFI, 'id' | 'ref' | 'question' | 'discipline' | 'raisedBy' | 'assignedTo' | 'raisedISO' | 'dueISO' | 'status'>> & { daysOpen: number; overdueDays: number; band: Tone };
const date = (value?: string) => {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parsed.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : parsed.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) + ' WAT';
};

export function DocumentsWorkspace({ register, rfis, kpis, canMutate, canCreate = false, canUpload = false, canApprove = false, isManager = false, actorId = '', members = [], drawings = [], initialTab, companyId = '', projectId = '', projects = [], locations = [], workPackages = [] }: { register: RegisterRow[]; rfis: RfiRow[]; kpis: { documents: number; approved: number; inReview: number; openRfis: number; overdueRfis: number }; canMutate: boolean; canCreate?: boolean; canUpload?: boolean; canApprove?: boolean; isManager?: boolean; actorId?: string; members?: RfiMemberOption[]; drawings?: RfiDrawingOption[]; initialTab?: string; companyId?: string; projectId?: string; projects?: { id: string; code: string; name: string }[]; locations?: { id: string; name: string; kind: string }[]; workPackages?: { id: string; code: string; name: string; costCode?: string }[] }) {
  const router = useRouter();
  const disclosureId = useId();
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [reviseFor, setReviseFor] = useState<RegisterRow | null>(null);
  const [issueFor, setIssueFor] = useState<{ row: RegisterRow; rev: DocRev } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (message: string) => { setToast(message); setTimeout(() => setToast(null), 3200); };
  const { act, confirmation, pending } = useConstructionReview(() => router.refresh(), flash);

  return <ConstructionFrame>
    <PageHeader title="Documents &amp; RFIs" subtitle="Control drawing revisions, formal issues and technical responses." />
    <PageTabs label="Construction document sections" defaultTab={initialTab === 'rfis' || initialTab === 'overview' ? initialTab : 'register'} onTabChange={(id) => { const query = new URLSearchParams(window.location.search); query.set('tab', id); router.replace(`${window.location.pathname}?${query.toString()}`, { scroll: false }); }} items={[
      { id: 'register', label: 'Document register', content: <div className={styles.stack}><DrawingControls register={register} companyId={companyId} projectId={projectId} projects={projects} locations={locations} workPackages={workPackages} canUpload={canUpload} /><ConstructionPanel><div className={styles.header}><CardHeader title="Drawing register" subtitle="An approved revision is never edited, only superseded · expand a document for complete revision and transmittal records" action={<StatusPill status={register.length + ' document(s)'} tone="info" />} /></div>{register.length ? register.map((row, rowIndex) => {
        const expanded = openDoc === row.number;
        const regionId = disclosureId + '-revision-' + rowIndex;
        return <section key={row.number} aria-label={row.number + ' document record'}><button type="button" aria-expanded={expanded} aria-controls={regionId} onClick={() => setOpenDoc(expanded ? null : row.number)} className={styles.disclosure}><span className="min-w-0 flex-1"><span className={styles.title + ' block'}>{row.number} · {row.title}</span><span className={styles.metadata + ' block mt-2'}>{row.discipline} · {row.folder} · {row.revisions.length} revision(s)</span></span><span className={styles.actions}>{row.currentRevision ? <StatusPill status={'Build to rev ' + row.currentRevision} tone="success" /> : <StatusPill status={row.inReview + ' in review · no approved issue'} tone="warn" />}<ChevronDown size={18} aria-hidden="true" className={expanded ? 'rotate-180' : undefined} /></span></button><div id={regionId} hidden={!expanded} role="region" aria-label={'Revisions for ' + row.number} className={styles.revisionBody}><div className={styles.stack}>{row.revisions.length ? row.revisions.map((revision) => <ConstructionPanel key={revision.id}><div className={styles.header}><CardHeader title={'Revision ' + revision.revision} subtitle={row.number + ' · controlled document revision'} action={<StatusPill status={revision.status} tone={DOC_STATUS_TONE[revision.status]} />} /></div><div className={styles.body}><div className={styles.stack}><dl className={styles.facts}><div><dt>Effective record date</dt><dd>{date(revision.effectiveISO)}</dd></div><div><dt>Uploaded by</dt><dd>{revision.uploadedBy || 'Not recorded'}</dd></div><div><dt>Approved by</dt><dd>{revision.approvedBy || 'Not recorded'}</dd></div><div><dt>Approval record date</dt><dd>{date(revision.approvedISO)}</dd></div></dl><div><h3 className={styles.rowTitle}>Change note</h3><p className={styles.text + ' mt-2'}>{revision.changeNote || 'No change note was recorded.'}</p></div></div></div><div className={styles.header}><CardHeader title="Transmittal records" subtitle="Recorded recipients and purposes · not email or external-delivery evidence" /></div>{revision.transmittals.length ? <div className={styles.scroll} role="region" tabIndex={0} aria-label={row.number + ' revision ' + revision.revision + ' transmittals'}><table className={'pb-data-table ' + styles.table}><thead><tr>{['Recipient', 'Recorded issue date', 'Purpose', 'Acknowledgement record'].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{revision.transmittals.map((transmittal, index) => <tr key={transmittal.toParty + '-' + index}><th scope="row">{transmittal.toParty}</th><td>{date(transmittal.sentISO)}</td><td>{transmittal.purpose.replaceAll('_', ' ')}</td><td><StatusPill status={transmittal.acknowledged ? 'Acknowledgement recorded' : 'No acknowledgement recorded'} tone={transmittal.acknowledged ? 'info' : 'neutral'} /></td></tr>)}</tbody></table></div> : <div className={styles.body}><p className={styles.text}>No transmittals are recorded for this revision.</p></div>}<div className={styles.footer}><div className={styles.actions}>{canMutate && (revision.status === 'draft' || revision.status === 'review') ? <Button type="button" disabled={pending} icon={<Check size={16} />} onClick={() => act(() => approveRevision(revision.id), 'Approved', 'Approve this controlled revision only after checking the technical content and your approval authority. The previously approved issue may be superseded; its record is retained.')}>Approve</Button> : null}{canMutate && revision.status !== 'superseded' ? <Button type="button" disabled={pending} onClick={() => setIssueFor({ row, rev: revision })}>Issue to…</Button> : null}</div></div></ConstructionPanel>) : <p className={styles.text}>No revision records were supplied for this document.</p>}{canCreate && canMutate && row.revisions.length > 0 ? <div className={styles.actions}><Button variant="primary" type="button" disabled={pending} onClick={() => setReviseFor(row)}>New revision</Button></div> : null}</div></div></section>;
      }) : <div className={styles.empty}><EmptyState icon={<FileText size={26} />} title="No controlled document records" description="Upload a project drawing PDF to start the controlled revision history." /></div>}<p className={styles.footer}>Stored PDFs are private downloads. Older sample revisions may have metadata without a file. Approved issues remain available when superseded.</p></ConstructionPanel></div> },
      { id: 'rfis', label: 'Requests for information', content: <RfiWorkspace rfis={rfis} projectId={projectId} projects={projects} workPackages={workPackages} members={members} drawings={drawings} actorId={actorId} canCreate={canCreate} canMutate={canMutate} canApprove={canApprove} isManager={isManager} /> },
      { id: 'overview', label: 'Overview', content: <div className={styles.stack}><div className={styles.metrics}><Kpi label="Documents" value={String(kpis.documents)} tone="info" icon={<FileText size={18} />} /><Kpi label="Current issues" value={String(kpis.approved)} tone="success" icon={<ShieldCheck size={18} />} /><Kpi label="Awaiting approval" value={String(kpis.inReview)} tone={kpis.inReview ? 'warn' : 'success'} icon={<Layers size={18} />} /><Kpi label="Overdue RFIs" value={String(kpis.overdueRfis)} tone={kpis.overdueRfis ? 'danger' : 'success'} icon={<HelpCircle size={18} />} /></div><ConstructionPanel><div className={styles.header}><CardHeader title="Document control policy" subtitle="Supersede controlled issues instead of rewriting approved records" /></div><div className={styles.body}><p className={styles.text}>Expand a document to inspect every supplied revision, approval and formal transmittal. Only approved revisions can be issued for construction. Check the source design and your authority before approval or a new revision.</p></div></ConstructionPanel></div> },
    ]} />
    {reviseFor ? <ReviseDialog row={reviseFor} onClose={() => setReviseFor(null)} onDone={(message) => { setReviseFor(null); flash(message); }} /> : null}
    {issueFor ? <TransmittalDialog doc={issueFor} onClose={() => setIssueFor(null)} onDone={(message) => { setIssueFor(null); flash(message); }} /> : null}
    {confirmation}
    {toast ? <ConstructionToast>{toast}</ConstructionToast> : null}
  </ConstructionFrame>;
}

function ReviseDialog({ row, onClose, onDone }: { row: RegisterRow; onClose: () => void; onDone: (message: string) => void }) {
  const router = useRouter();
  const head = row.revisions[0];
  const overApproved = head?.status === 'approved';
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  function submit() {
    if (pending || !head || (overApproved && !note.trim())) return;
    setError(null);
    start(async () => { const result = await issueRevision(head.id, note); if (!result.ok) { setError(result.error); return; } router.refresh(); onDone('New revision issued' + (result.ref ? ' · ' + result.ref : '')); });
  }
  return <ConstructionDialog pending={pending} title="New revision" onClose={onClose}><form className={styles.form} onSubmit={(event) => { event.preventDefault(); submit(); }}><div className={styles.notice}><p className={styles.title}>{row.number}</p><p>{row.title} · current supplied revision {head?.revision ?? 'Not recorded'} ({head?.status ?? 'Not recorded'})</p></div><label className={styles.field}>Change note{overApproved ? ' · required' : ''}<textarea aria-label="Change note" disabled={pending} required={overApproved} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed and why?" className="pb-form-control" autoFocus /></label>{overApproved ? <p className={styles.notice}>Rev {head.revision} is the approved issue. Issuing rev {nextLetter(head.revision)} supersedes it — the old revision is retained, never overwritten. Review the technical change before confirming.</p> : null}{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={pending || !head || (overApproved && !note.trim())}>{pending ? 'Issuing…' : 'Issue revision'}</Button></div></form></ConstructionDialog>;
}

function TransmittalDialog({ doc, onClose, onDone }: { doc: { row: RegisterRow; rev: DocRev }; onClose: () => void; onDone: (message: string) => void }) {
  const router = useRouter();
  const [party, setParty] = useState('');
  const [purpose, setPurpose] = useState<'for_construction' | 'for_review' | 'for_information'>(doc.rev.status === 'approved' && doc.rev.fileUrl ? 'for_construction' : 'for_review');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  const valid = party.trim() !== '' && (doc.rev.status === 'approved' && !!doc.rev.fileUrl || purpose !== 'for_construction');
  function submit() {
    if (pending || !valid) return;
    setError(null);
    start(async () => { const result = await sendTransmittal(doc.rev.id, party, purpose); if (!result.ok) { setError(result.error); return; } router.refresh(); onDone('Transmittal recorded' + (result.ref ? ' · ' + result.ref : '')); });
  }
  return <ConstructionDialog pending={pending} title="Issue revision" onClose={onClose}><form className={styles.form} onSubmit={(event) => { event.preventDefault(); submit(); }}><div className={styles.notice}><p className={styles.title}>{doc.row.number} · revision {doc.rev.revision}</p><p>{doc.row.title} · {doc.rev.status}</p></div><label className={styles.field}>Issue to<input aria-label="Issue to" disabled={pending} required value={party} onChange={(event) => setParty(event.target.value)} className="pb-form-control" placeholder="e.g. BuildRight Subs" autoFocus /></label><label className={styles.field}>Purpose<select aria-label="Purpose" disabled={pending} value={purpose} onChange={(event) => setPurpose(event.target.value as typeof purpose)} className="pb-form-control"><option value="for_construction" disabled={doc.rev.status !== 'approved' || !doc.rev.fileUrl}>For construction</option><option value="for_review">For review</option><option value="for_information">For information</option></select></label>{!doc.rev.fileUrl && <p className={styles.notice}>Attach the approved PDF before issuing this revision for construction.</p>}<p className={styles.text}>Records the recipient and purpose in the transmittal register. It does not email a file or confirm external delivery.</p>{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={pending || !valid}>{pending ? 'Recording…' : 'Confirm transmittal'}</Button></div></form></ConstructionDialog>;
}

function nextLetter(revision: string): string { return revision.length === 1 && revision < 'Z' ? String.fromCharCode(revision.charCodeAt(0) + 1) : revision + 'A'; }
