'use client';

import styles from './construction-commercial-polish.module.css';

import { useConstructionSave, useConstructionReview, ConstructionPanel, ConstructionSummary, ConstructionToast, ConstructionKpi as Kpi, constructionNaira as naira, ConstructionDialog, ConstructionFrame, ConstructionPanelHeader } from './construction-ui';
import { Button, CardHeader, EmptyState, StatusPill } from '@/components/ui';

import { useId, useState } from 'react';
import { PageTabs } from '@/components/ui/page-tabs';
import { useRouter } from 'next/navigation';
import { GitBranch, Check, X, Clock, UserPlus, TriangleAlert, Inbox } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { APPROVAL_SUBJECT_LABEL, APPROVAL_TONE, type ApprovalSubject, type ApprovalStatus } from '@/domain/construction';
import { decideApproval, delegateApproval } from '@/server/actions/construction';

export type StepView = { order: number; role: string; label: string; slaHours: number; status: string; actedBy?: string; actedISO?: string; comment?: string; delegatedTo?: string; overdue: boolean };
export type ReqView = {
  id: string; ref: string; subject: ApprovalSubject; subjectRef: string; title: string;
  amountMinor: number; raisedBy: string; raisedISO: string; status: ApprovalStatus;
  ruleName: string; steps: StepView[]; progressPct: number; note?: string;
  mine: boolean; blockedReason?: string; overdue: boolean;
};
export type ReasonOption = { id: string; label: string; requiresNote: boolean };
export type RuleView = { id: string; name: string; subject: ApprovalSubject; thresholdMinor: number; steps: { order: number; label: string; role: string; slaHours: number }[] };

const STEP_TONE: Record<string, Tone> = { pending: 'warn', approved: 'success', rejected: 'danger', skipped: 'muted' };
const timestampLabel = (iso: string) => { const at = new Date(iso); return Number.isNaN(at.getTime()) ? iso : `${at.toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', ...(iso.includes('T') ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}), timeZone: 'Africa/Lagos' })} WAT`; };

export function ApprovalsWorkspace({ requests, rules, reasons, kpis, canMutate }: {
  requests: ReqView[]; rules: RuleView[]; reasons: ReasonOption[];
  kpis: { inbox: number; inFlight: number; overdue: number; valueMinor: number };
  canMutate: boolean;
}) {
  const router = useRouter();

  const [rejectFor, setRejectFor] = useState<ReqView | null>(null);
  const [delegateFor, setDelegateFor] = useState<ReqView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3600); };
  const { act, confirmation, pending } = useConstructionReview(() => router.refresh(), flash);

  const inbox = requests.filter((r) => r.mine);

  const requestPanel = (rows: ReqView[], inboxOnly = false) => (
    <div className={styles.stack}>
      {rows.map((request) => <ConstructionPanel key={request.id}>
        <div className={styles.header}><CardHeader title={request.title} subtitle={request.ref + ' · ' + APPROVAL_SUBJECT_LABEL[request.subject] + ' ' + request.subjectRef} action={<div className={styles.actions}><StatusPill status={request.status.replace('_', ' ')} tone={APPROVAL_TONE[request.status]} />{request.overdue && <StatusPill status="Past SLA" tone="danger" />}{request.mine && <StatusPill status="Your step" tone="warn" />}</div>} /></div>
        <div className={styles.body}>
          <dl className={styles.facts}><div><dt>Amount under review · NGN</dt><dd>{naira(request.amountMinor)}</dd></div><div><dt>Raised by</dt><dd>{request.raisedBy}</dd></div><div><dt>Raised at</dt><dd><time dateTime={request.raisedISO}>{timestampLabel(request.raisedISO)}</time></dd></div><div><dt>Approval rule</dt><dd>{request.ruleName}</dd></div><div><dt>Recorded route progress</dt><dd>{request.progressPct}% through</dd></div></dl>
          {request.note && <p className={styles.text + ' mt-6'}>{request.note}</p>}
          <ol className={styles.stepGroups} aria-label={'Approval route for ' + request.ref}>
            {[...new Set(request.steps.map((step) => step.order))].sort((a, b) => a - b).map((order) => <li key={order}><p className={styles.title}>Step {order}{request.steps.filter((step) => step.order === order).length > 1 ? ' · parallel reviewers' : ''}</p><div className={styles.stepCards}>{request.steps.filter((step) => step.order === order).map((step) => <div key={step.role + step.label} className={styles.stepCard}><div className={styles.row}><h4 className={styles.rowMain}>{step.label}</h4><StatusPill status={step.status} tone={STEP_TONE[step.status] ?? 'muted'} /></div><dl className={styles.facts}><div><dt>Required role</dt><dd>{step.role}</dd></div><div><dt>Response SLA</dt><dd>{step.slaHours} hours{step.overdue ? ' · overdue' : ''}</dd></div>{step.delegatedTo && <div><dt>Delegated to</dt><dd>{step.delegatedTo}</dd></div>}{step.actedBy && <div><dt>Acted by</dt><dd>{step.actedBy}</dd></div>}{step.actedISO && <div><dt>Acted at</dt><dd><time dateTime={step.actedISO}>{timestampLabel(step.actedISO)}</time></dd></div>}</dl>{step.comment && <blockquote>{step.comment}</blockquote>}</div>)}</div></li>)}
          </ol>
          {!request.steps.length && <EmptyState title="No approval steps recorded" description="The source request does not contain an approval route. No authority is inferred from this view." />}
          {canMutate && request.status === 'in_flight' && <div className={styles.actions}>{request.mine ? <><Button variant="primary" type="button" disabled={pending} onClick={() => act(() => decideApproval(request.id, 'approved'), 'Approve ' + request.ref, request.title + ' · ' + request.subjectRef + ' · ' + naira(request.amountMinor) + '. Confirm your assigned approval step and supporting evidence. Segregation-of-duties checks remain enforced on the server.')}><Check size={16} /> Approve</Button><Button type="button" disabled={pending} onClick={() => setRejectFor(request)} style={{ color: toneVar('danger') }}><X size={16} /> Reject</Button><Button type="button" disabled={pending} onClick={() => setDelegateFor(request)}><UserPlus size={16} /> Delegate</Button></> : <p className={styles.text}>{request.blockedReason}</p>}</div>}
        </div><p className={styles.footer}>Recorded workflow evidence only. Approval does not verify physical delivery, execute a payment or change your authenticated authority.</p>
      </ConstructionPanel>)}
      {!rows.length && <ConstructionPanel><div className={styles.body}><EmptyState icon={<Inbox size={24} />} title={inboxOnly ? 'Your inbox is clear' : 'No requests'} description={inboxOnly ? 'No recorded request is assigned to you in this snapshot.' : 'No approval requests are visible in the current scope.'} /></div></ConstructionPanel>}
    </div>
  );

  return (
    <ConstructionFrame><div className={styles.workspace}>
      <ConstructionSummary>
        <div className="relative flex items-center gap-3 flex-wrap">
          <span className="construction-summary-icon" ><GitBranch size={22} /></span>
          <div className="min-w-0">
            <div className="text-[14px] text-text-3">APPROVALS · CONFIGURABLE ROUTES</div>
            <h2 className="text-[20px] font-medium tracking-[-0.02em] leading-tight mt-0.5">
              {kpis.inbox > 0 ? <>{kpis.inbox} waiting on <span style={{ color: toneVar('warn') }}>you</span></> : 'Nothing waiting on you'}
            </h2>
            <div className="text-[14px] text-text-3 mt-0.5">{kpis.inFlight} in flight · {naira(kpis.valueMinor)} of value under review{kpis.overdue > 0 && <> · <span style={{ color: toneVar('danger') }}>{kpis.overdue} past SLA</span></>}</div>
          </div>
        </div>
      </ConstructionSummary>

      <PageTabs label="Construction approval sections" items={[
        { id: 'inbox', label: 'My inbox', count: inbox.length, content: requestPanel(inbox, true) },
        { id: 'all', label: 'All requests', count: requests.length, content: requestPanel(requests) },
        {
          id: 'rules', label: 'Approval routes', content: (
            <ConstructionPanel >
              <ConstructionPanelHeader title="Approval routes"><span className="text-[12px] text-text-3">· highest matching threshold wins; steps sharing an order run in parallel</span></ConstructionPanelHeader>
              <div className="divide-y divide-border">
                {rules.map((r) => (
                  <div key={r.id} className={styles.record}>
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <h3 className={styles.title}>{r.name}</h3>
                      <p className={styles.text}>{APPROVAL_SUBJECT_LABEL[r.subject]} · from {naira(r.thresholdMinor)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {[...new Set(r.steps.map((s) => s.order))].sort((a, b) => a - b).map((order, i, arr) => {
                        const group = r.steps.filter((s) => s.order === order);
                        return (
                          <div key={order} className="flex items-center gap-1.5">
                            <span className="inline-flex flex-col gap-1">
                              {group.map((s) => (
                                <div key={s.role + s.label} className={styles.stepCard}><p className={styles.rowTitle}>{s.label}</p><dl className={styles.facts}><div><dt>Step order</dt><dd>{s.order}</dd></div><div><dt>Required role</dt><dd>{s.role}</dd></div><div><dt>Response SLA</dt><dd>{s.slaHours} hours</dd></div></dl></div>
                              ))}
                            </span>
                            {i < arr.length - 1 && <span className="text-text-3 text-[14px]">→</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {!rules.length && <div className={styles.body}><EmptyState title="No approval route definitions" description="No configured approval rules are visible in your current scope." /></div>}
            </ConstructionPanel>
          )
        },
        {
          id: 'overview', label: 'Overview', content: <div className="grid grid-cols-1 min-[520px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-6">
            <Kpi label="My inbox" value={String(kpis.inbox)} tone={kpis.inbox ? 'warn' : 'success'} icon={<Inbox size={16} />} />
            <Kpi label="In flight" value={String(kpis.inFlight)} tone="progress" icon={<GitBranch size={16} />} />
            <Kpi label="Past SLA" value={String(kpis.overdue)} tone={kpis.overdue ? 'danger' : 'success'} icon={<Clock size={16} />} />
            <Kpi label="Value under review" value={naira(kpis.valueMinor)} tone="info" icon={<TriangleAlert size={16} />} />
          </div>
        }
      ]} />

      {rejectFor && <RejectDialog req={rejectFor} reasons={reasons} onClose={() => setRejectFor(null)} onDone={(m) => { setRejectFor(null); flash(m); }} />}
      {delegateFor && <DelegateDialog req={delegateFor} onClose={() => setDelegateFor(null)} onDone={(m) => { setDelegateFor(null); flash(m); }} />}
      {confirmation}
      {toast && <ConstructionToast>{toast}</ConstructionToast>}
    </div></ConstructionFrame>
  );
}

function RejectDialog({ req, reasons, onClose, onDone }: { req: ReqView; reasons: ReasonOption[]; onClose: () => void; onDone: (m: string) => void }) {
  const fieldId = useId();
  const router = useRouter();
  const [codeId, setCodeId] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  const code = reasons.find((r) => r.id === codeId);
  function submit() { setError(null); start(async () => { const r = await decideApproval(req.id, 'rejected', comment, codeId); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Rejected · ${r.ref}`); }); }
  return (
    <Modal pending={pending} title="Reject request" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[14px]"><div className="font-medium">{req.title}</div><div className="text-text-3">{req.ref} · {naira(req.amountMinor)}</div></div>
      <label htmlFor={`${fieldId}-reason`} className="pb-form-label">Reason code · required</label>
      <select id={`${fieldId}-reason`} aria-label="Reason code · required" value={codeId} onChange={(e) => setCodeId(e.target.value)} className={styles.control}><option value="">Choose the rejection reason</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      <label htmlFor={`${fieldId}-comment`} className="pb-form-label">Comment {code?.requiresNote && <span style={{ color: toneVar('danger') }}>· required for this reason</span>}</label>
      <textarea id={`${fieldId}-comment`} aria-label="Comment" value={comment} onChange={(e) => setComment(e.target.value)} className="pb-form-control" style={{ minHeight: 120 }} />
      <p className="text-[12px] text-text-3 mt-1.5">Coding the reason is what lets the Pareto show which causes actually dominate — free text can&apos;t be counted.</p>
      {error && <div role="alert" className="text-[12px] text-negative mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><Button type="button" disabled={pending} onClick={onClose} >Cancel</Button><Button variant="primary" type="button" onClick={submit} disabled={pending || !codeId || (!!code?.requiresNote && !comment.trim())} >{pending ? 'Saving…' : 'Reject'}</Button></div>
    </Modal>
  );
}

function DelegateDialog({ req, onClose, onDone }: { req: ReqView; onClose: () => void; onDone: (m: string) => void }) {
  const fieldId = useId();
  const router = useRouter();
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useConstructionSave(setError);
  function submit() { setError(null); start(async () => { const r = await delegateApproval(req.id, to); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Delegated · ${r.ref}`); }); }
  return (
    <Modal pending={pending} title="Delegate this step" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[14px]"><div className="font-medium">{req.title}</div><div className="text-text-3">{req.ref}</div></div>
      <label htmlFor={fieldId} className="pb-form-label">Delegate to</label>
      <input id={fieldId} aria-label="Delegate to" value={to} onChange={(e) => setTo(e.target.value)} className={styles.control} placeholder="e.g. Bola Adeyemi" autoFocus />
      <p className="text-[12px] text-text-3 mt-1.5">They act in your place on this step only. The delegation is recorded in the audit trail.</p>
      {error && <div role="alert" className="text-[12px] text-negative mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><Button type="button" disabled={pending} onClick={onClose} >Cancel</Button><Button variant="primary" type="button" onClick={submit} disabled={pending || !to.trim()} >{pending ? 'Saving…' : 'Delegate'}</Button></div>
    </Modal>
  );
}
function Modal({ title, children, onClose, pending = false }: { title: string; children: React.ReactNode; onClose: () => void; pending?: boolean }) { return <ConstructionDialog title={title} onClose={onClose} pending={pending}>{children}</ConstructionDialog>; }
