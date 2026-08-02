'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Check, X, Clock, UserPlus, TriangleAlert, Inbox, Settings2 } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { APPROVAL_SUBJECT_LABEL, APPROVAL_TONE, fmtM, type ApprovalSubject, type ApprovalStatus } from '@/domain/construction';
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

const naira = (m: number) => `₦${fmtM(m)}`;
const STEP_TONE: Record<string, Tone> = { pending: 'warn', approved: 'success', rejected: 'danger', skipped: 'muted' };

export function ApprovalsWorkspace({ requests, rules, reasons, kpis, canMutate }: {
  requests: ReqView[]; rules: RuleView[]; reasons: ReasonOption[];
  kpis: { inbox: number; inFlight: number; overdue: number; valueMinor: number };
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<'inbox' | 'all' | 'rules'>('inbox');
  const [rejectFor, setRejectFor] = useState<ReqView | null>(null);
  const [delegateFor, setDelegateFor] = useState<ReqView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(r.ref ? `${ok} · ${r.ref}` : ok); } else flash(r.error ?? 'Failed'); });

  const inbox = requests.filter((r) => r.mine);
  const shown = tab === 'inbox' ? inbox : requests;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0e0a18 0%,#1c1430 55%,#2b1f4a 100%)' }}>
        <div className="relative flex items-center gap-3 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><GitBranch size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">APPROVALS · CONFIGURABLE ROUTES</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">
              {kpis.inbox > 0 ? <>{kpis.inbox} waiting on <span style={{ color: toneVar('warn') }}>you</span></> : 'Nothing waiting on you'}
            </div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{kpis.inFlight} in flight · {naira(kpis.valueMinor)} of value under review{kpis.overdue > 0 && <> · <span style={{ color: toneVar('danger') }}>{kpis.overdue} past SLA</span></>}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="My inbox" value={String(kpis.inbox)} tone={kpis.inbox ? 'warn' : 'success'} icon={<Inbox size={16} />} />
        <Kpi label="In flight" value={String(kpis.inFlight)} tone="progress" icon={<GitBranch size={16} />} />
        <Kpi label="Past SLA" value={String(kpis.overdue)} tone={kpis.overdue ? 'danger' : 'success'} icon={<Clock size={16} />} />
        <Kpi label="Value under review" value={naira(kpis.valueMinor)} tone="info" icon={<TriangleAlert size={16} />} />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {([['inbox', `My inbox${inbox.length ? ` (${inbox.length})` : ''}`], ['all', 'All requests'], ['rules', 'Routes']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="text-[12px] px-3 h-9 rounded-xl font-medium border"
            style={tab === k ? { borderColor: 'transparent', background: `color-mix(in srgb, ${toneVar('progress')} 15%, transparent)`, color: toneVar('progress') } : { borderColor: 'var(--border-2)', background: 'var(--surface)' }}>{label}</button>
        ))}
      </div>

      {tab === 'rules' ? (
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Settings2 size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Approval routes</span><span className="text-[10.5px] text-text-3">· highest matching threshold wins; steps sharing an order run in parallel</span></div>
          <div className="divide-y divide-border">
            {rules.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="text-[13px] font-medium">{r.name}</div>
                  <div className="text-[10.5px] text-text-3">{APPROVAL_SUBJECT_LABEL[r.subject]} · from {naira(r.thresholdMinor)}</div>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {[...new Set(r.steps.map((s) => s.order))].sort().map((order, i, arr) => {
                    const group = r.steps.filter((s) => s.order === order);
                    return (
                      <div key={order} className="flex items-center gap-1.5">
                        <span className="inline-flex flex-col gap-1">
                          {group.map((s) => (
                            <span key={s.role + s.label} className="text-[10.5px] px-2 h-6 inline-flex items-center rounded-full font-medium" style={{ background: `color-mix(in srgb, ${toneVar('progress')} 12%, transparent)`, color: toneVar('progress') }}>
                              {s.label} <span className="text-text-3 ml-1">{s.slaHours}h</span>
                            </span>
                          ))}
                        </span>
                        {i < arr.length - 1 && <span className="text-text-3 text-[11px]">→</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((r) => (
            <section key={r.id} className="bg-surface border rounded-2xl shadow-card p-4" style={{ borderColor: r.mine ? 'color-mix(in srgb, var(--tone-warn) 40%, transparent)' : 'var(--border)' }}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold flex items-center gap-1.5 flex-wrap">
                    {r.title}
                    <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(APPROVAL_TONE[r.status])} 14%, transparent)`, color: toneVar(APPROVAL_TONE[r.status]) }}>{r.status.replace('_', ' ')}</span>
                    {r.overdue && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full gap-1" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 15%, transparent)`, color: toneVar('danger') }}><Clock size={8} /> past SLA</span>}
                    {r.mine && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 15%, transparent)`, color: toneVar('warn') }}>your step</span>}
                  </div>
                  <div className="text-[10.5px] text-text-3 mt-0.5"><span className="font-mono">{r.ref}</span> · {APPROVAL_SUBJECT_LABEL[r.subject]} {r.subjectRef} · raised by {r.raisedBy} · {r.ruleName}</div>
                  {r.note && <div className="text-[11px] text-text-3 mt-1">{r.note}</div>}
                </div>
                <div className="text-right flex-none">
                  <div className="text-[16px] font-bold tracking-[-0.02em] leading-none font-mono">{naira(r.amountMinor)}</div>
                  <div className="text-[9.5px] text-text-3 mt-0.5">{r.progressPct}% through</div>
                </div>
              </div>

              {/* the route */}
              <div className="flex flex-col gap-1.5 mt-3">
                {[...new Set(r.steps.map((s) => s.order))].sort().map((order) => (
                  <div key={order} className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-text-3 w-4 flex-none">{order}</span>
                    {r.steps.filter((s) => s.order === order).map((s) => (
                      <span key={s.role + s.label} className="text-[10.5px] px-2 h-6 inline-flex items-center gap-1 rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(STEP_TONE[s.status] ?? 'muted')} 13%, transparent)`, color: toneVar(STEP_TONE[s.status] ?? 'muted') }}>
                        {s.status === 'approved' && <Check size={9} />}{s.status === 'rejected' && <X size={9} />}
                        {s.label}
                        {s.delegatedTo && <span className="text-text-3">→ {s.delegatedTo}</span>}
                        {s.actedBy && <span className="text-text-3">· {s.actedBy}</span>}
                        {s.overdue && <Clock size={9} />}
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              {canMutate && r.status === 'in_flight' && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {r.mine ? (
                    <>
                      <button disabled={pending} onClick={() => act(() => decideApproval(r.id, 'approved'), 'Approved')} className="text-[11.5px] px-3 h-8 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><Check size={12} /> Approve</button>
                      <button disabled={pending} onClick={() => setRejectFor(r)} className="text-[11.5px] px-3 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50" style={{ color: toneVar('danger') }}><X size={12} /> Reject</button>
                      <button disabled={pending} onClick={() => setDelegateFor(r)} className="text-[11.5px] px-3 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><UserPlus size={12} /> Delegate</button>
                    </>
                  ) : (
                    <span className="text-[11px] text-text-3">{r.blockedReason}</span>
                  )}
                </div>
              )}
            </section>
          ))}
          {shown.length === 0 && (
            <div className="bg-surface border border-border rounded-2xl p-10 text-center">
              <Inbox size={20} className="mx-auto mb-2 text-text-3" />
              <div className="text-[13px] font-medium">{tab === 'inbox' ? 'Your inbox is clear' : 'No requests'}</div>
              <div className="text-[11.5px] text-text-3 mt-1">{tab === 'inbox' ? 'Nothing is waiting on your approval right now.' : 'Nothing has been raised yet.'}</div>
            </div>
          )}
        </div>
      )}

      {rejectFor && <RejectDialog req={rejectFor} reasons={reasons} onClose={() => setRejectFor(null)} onDone={(m) => { setRejectFor(null); flash(m); }} />}
      {delegateFor && <DelegateDialog req={delegateFor} onClose={() => setDelegateFor(null)} onDone={(m) => { setDelegateFor(null); flash(m); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade max-w-[92vw]">{toast}</div>}
    </div>
  );
}

function RejectDialog({ req, reasons, onClose, onDone }: { req: ReqView; reasons: ReasonOption[]; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [codeId, setCodeId] = useState(reasons[0]?.id ?? '');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const code = reasons.find((r) => r.id === codeId);
  function submit() { setError(null); start(async () => { const r = await decideApproval(req.id, 'rejected', comment, codeId); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Rejected · ${r.ref}`); }); }
  return (
    <Modal title="Reject request" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{req.title}</div><div className="text-text-3">{req.ref} · {naira(req.amountMinor)}</div></div>
      <label className="lbla">Reason code · required</label>
      <select value={codeId} onChange={(e) => setCodeId(e.target.value)} className="inpa">{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      <label className="lbla mt-2.5">Comment {code?.requiresNote && <span style={{ color: toneVar('danger') }}>· required for this reason</span>}</label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="inpa" style={{ height: 60, padding: '8px 10px' }} />
      <p className="text-[10.5px] text-text-3 mt-1.5">Coding the reason is what lets the Pareto show which causes actually dominate — free text can&apos;t be counted.</p>
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !codeId || (!!code?.requiresNote && !comment.trim())} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : 'Reject'}</button></div>
      <style>{`.lbla{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpa{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none;font-family:inherit;resize:none}.inpa:focus{border-color:var(--primary)}`}</style>
    </Modal>
  );
}

function DelegateDialog({ req, onClose, onDone }: { req: ReqView; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await delegateApproval(req.id, to); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Delegated · ${r.ref}`); }); }
  return (
    <Modal title="Delegate this step" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{req.title}</div><div className="text-text-3">{req.ref}</div></div>
      <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Delegate to</label>
      <input value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" placeholder="e.g. Bola Adeyemi" autoFocus />
      <p className="text-[10.5px] text-text-3 mt-1.5">They act in your place on this step only. The delegation is recorded in the audit trail.</p>
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !to.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : 'Delegate'}</button></div>
    </Modal>
  );
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[380px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        {children}
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
