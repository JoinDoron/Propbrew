'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Check, Send, History, HelpCircle, X, ShieldCheck, Layers, TriangleAlert } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { DOC_STATUS_TONE, type DocStatus } from '@/domain/construction';
import { issueRevision, approveRevision, sendTransmittal, answerRfi, closeRfi } from '@/server/actions/construction';

export type DocRev = { id: string; revision: string; status: DocStatus; effectiveISO: string; changeNote?: string; uploadedBy?: string; approvedBy?: string; approvedISO?: string; transmittals: { toParty: string; sentISO: string; purpose: string; acknowledged: boolean }[] };
export type RegisterRow = { number: string; title: string; discipline: string; folder: string; currentRevision: string | null; currentId: string | null; inReview: number; revisions: DocRev[] };
export type RfiRow = { id: string; ref: string; question: string; discipline: string; drawingRef?: string; raisedBy: string; assignedTo: string; raisedISO: string; dueISO: string; status: string; answer?: string; daysOpen: number; overdueDays: number; band: Tone };

export function DocumentsWorkspace({ register, rfis, kpis, canMutate }: {
  register: RegisterRow[]; rfis: RfiRow[];
  kpis: { documents: number; approved: number; inReview: number; openRfis: number; overdueRfis: number };
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [reviseFor, setReviseFor] = useState<RegisterRow | null>(null);
  const [issueFor, setIssueFor] = useState<{ row: RegisterRow; rev: DocRev } | null>(null);
  const [answerFor, setAnswerFor] = useState<RfiRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(r.ref ? `${ok} · ${r.ref}` : ok); } else flash(r.error ?? 'Failed'); });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Documents" value={String(kpis.documents)} tone="info" icon={<FileText size={16} />} />
        <Kpi label="Current issues" value={String(kpis.approved)} tone="success" icon={<ShieldCheck size={16} />} />
        <Kpi label="Awaiting approval" value={String(kpis.inReview)} tone={kpis.inReview ? 'warn' : 'success'} icon={<Layers size={16} />} />
        <Kpi label="Overdue RFIs" value={String(kpis.overdueRfis)} tone={kpis.overdueRfis ? 'danger' : 'success'} icon={<HelpCircle size={16} />} />
      </div>

      {/* Register */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <FileText size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Drawing register</span>
          <span className="text-[10.5px] text-text-3">· an approved revision is never edited, only superseded</span>
        </div>
        <div className="divide-y divide-border">
          {register.map((row) => {
            const expanded = openDoc === row.number;
            return (
              <div key={row.number}>
                <button onClick={() => setOpenDoc(expanded ? null : row.number)} className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono">{row.number}</span> · {row.title}
                        {!row.currentRevision && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 15%, transparent)`, color: toneVar('warn') }}>no approved issue</span>}
                      </div>
                      <div className="text-[10.5px] text-text-3">{row.discipline} · {row.folder} · {row.revisions.length} revision{row.revisions.length === 1 ? '' : 's'}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-none">
                      {row.currentRevision
                        ? <span className="text-[11px] font-semibold px-2 h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('success')} 14%, transparent)`, color: toneVar('success') }}>Build to rev {row.currentRevision}</span>
                        : <span className="text-[11px] font-semibold px-2 h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 14%, transparent)`, color: toneVar('warn') }}>{row.inReview} in review</span>}
                      <History size={13} className="text-text-3" />
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-3 bg-surface-2">
                    <div className="flex flex-col gap-2 pt-2">
                      {row.revisions.map((rev) => (
                        <div key={rev.id} className="bg-surface rounded-xl border border-border p-3">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold flex items-center gap-1.5">
                                Revision {rev.revision}
                                <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(DOC_STATUS_TONE[rev.status])} 14%, transparent)`, color: toneVar(DOC_STATUS_TONE[rev.status]) }}>{rev.status}</span>
                              </div>
                              <div className="text-[10.5px] text-text-3 mt-0.5">
                                effective {rev.effectiveISO}
                                {rev.uploadedBy ? ` · by ${rev.uploadedBy}` : ''}
                                {rev.approvedBy ? ` · approved by ${rev.approvedBy} on ${rev.approvedISO}` : ''}
                              </div>
                              {rev.changeNote && <div className="text-[11px] mt-1" style={{ color: toneVar('info') }}>Change: {rev.changeNote}</div>}
                              {rev.transmittals.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {rev.transmittals.map((t, i) => (
                                    <span key={i} className="text-[10px] px-1.5 h-5 inline-flex items-center gap-1 rounded-full bg-surface-2 text-text-3" title={`${t.purpose.replace(/_/g, ' ')} · ${t.sentISO}`}>
                                      <Send size={8} /> {t.toParty}{t.acknowledged ? ' ✓' : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {canMutate && (
                              <div className="flex items-center gap-1.5 flex-none">
                                {(rev.status === 'draft' || rev.status === 'review') && <button disabled={pending} onClick={() => act(() => approveRevision(rev.id), 'Approved')} className="text-[11px] px-2.5 h-7 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><Check size={11} /> Approve</button>}
                                {rev.status !== 'superseded' && <button disabled={pending} onClick={() => setIssueFor({ row, rev })} className="text-[11px] px-2.5 h-7 rounded-lg border border-border-2 disabled:opacity-50">Issue to…</button>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {canMutate && <button onClick={() => setReviseFor(row)} className="mt-2.5 text-[11.5px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium">New revision</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* RFIs */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><HelpCircle size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">RFIs</span><span className="ml-auto text-[11px]" style={{ color: toneVar(kpis.overdueRfis ? 'danger' : 'success') }}>{kpis.openRfis} open</span></div>
        <div className="divide-y divide-border">
          {rfis.map((r) => (
            <div key={r.id} className="px-4 py-3" style={r.overdueDays > 0 ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[11px]">{r.ref}</span> {r.question}
                    {r.overdueDays > 0 && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full gap-1" style={{ background: `color-mix(in srgb, ${toneVar('danger')} 15%, transparent)`, color: toneVar('danger') }}><TriangleAlert size={8} /> {r.overdueDays}d overdue</span>}
                  </div>
                  <div className="text-[10.5px] text-text-3 mt-0.5">{r.discipline}{r.drawingRef ? ` · ${r.drawingRef}` : ''} · {r.raisedBy} → {r.assignedTo} · raised {r.raisedISO}, due {r.dueISO}</div>
                  {r.answer && <div className="text-[11.5px] mt-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'color-mix(in srgb, var(--tone-success) 7%, transparent)', color: toneVar('success') }}>{r.answer}</div>}
                </div>
                <div className="flex items-center gap-1.5 flex-none">
                  <span className="text-[10px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(r.band)} 14%, transparent)`, color: toneVar(r.band) }}>{r.status}</span>
                  {canMutate && r.status === 'open' && <button onClick={() => setAnswerFor(r)} className="text-[11px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium">Answer</button>}
                  {canMutate && r.status === 'answered' && <button disabled={pending} onClick={() => act(() => closeRfi(r.id), 'RFI closed')} className="text-[11px] px-2.5 h-8 rounded-lg border border-border-2 disabled:opacity-50">Close</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {reviseFor && <ReviseDialog row={reviseFor} onClose={() => setReviseFor(null)} onDone={(m) => { setReviseFor(null); flash(m); }} />}
      {issueFor && <TransmittalDialog doc={issueFor} onClose={() => setIssueFor(null)} onDone={(m) => { setIssueFor(null); flash(m); }} />}
      {answerFor && <AnswerDialog rfi={answerFor} onClose={() => setAnswerFor(null)} onDone={(m) => { setAnswerFor(null); flash(m); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade max-w-[92vw]">{toast}</div>}
    </div>
  );
}

function ReviseDialog({ row, onClose, onDone }: { row: RegisterRow; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const head = row.revisions[0];
  const overApproved = head?.status === 'approved';
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await issueRevision(head.id, note); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`New revision issued · ${r.ref}`); }); }
  return (
    <Modal title="New revision" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold font-mono">{row.number}</div><div className="text-text-3">{row.title} · current rev {head?.revision} ({head?.status})</div></div>
      <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Change note {overApproved && <span style={{ color: toneVar('danger') }}>· required</span>}</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why?" className="w-full h-16 p-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary resize-none" autoFocus />
      {overApproved && <p className="text-[10.5px] text-text-3 mt-1.5">Rev {head.revision} is the approved issue. Issuing rev {nextLetter(head.revision)} supersedes it — the old revision is retained, never overwritten.</p>}
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || (overApproved && !note.trim())} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Issuing…' : 'Issue revision'}</button></div>
    </Modal>
  );
}

function TransmittalDialog({ doc, onClose, onDone }: { doc: { row: RegisterRow; rev: DocRev }; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [party, setParty] = useState('');
  const [purpose, setPurpose] = useState<'for_construction' | 'for_review' | 'for_information'>(doc.rev.status === 'approved' ? 'for_construction' : 'for_review');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await sendTransmittal(doc.rev.id, party, purpose); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Issued · ${r.ref}`); }); }
  return (
    <Modal title="Issue revision" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold font-mono">{doc.row.number} rev {doc.rev.revision}</div><div className="text-text-3">{doc.rev.status}</div></div>
      <label className="lbld">Issue to</label><input value={party} onChange={(e) => setParty(e.target.value)} className="inpd" placeholder="e.g. BuildRight Subs" autoFocus />
      <label className="lbld mt-2.5">Purpose</label>
      <select value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)} className="inpd">
        <option value="for_construction">For construction</option>
        <option value="for_review">For review</option>
        <option value="for_information">For information</option>
      </select>
      {doc.rev.status !== 'approved' && purpose === 'for_construction' && <p className="text-[10.5px] mt-1.5" style={{ color: toneVar('danger') }}>Only an approved revision can be issued for construction.</p>}
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !party.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Sending…' : 'Send'}</button></div>
      <style>{`.lbld{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpd{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpd:focus{border-color:var(--primary)}`}</style>
    </Modal>
  );
}

function AnswerDialog({ rfi, onClose, onDone }: { rfi: RfiRow; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await answerRfi(rfi.id, answer); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(`Answered · ${r.ref}`); }); }
  return (
    <Modal title="Answer RFI" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold font-mono">{rfi.ref}</div><div className="text-text-3">{rfi.question}</div></div>
      <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Answer</label>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="w-full h-20 p-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary resize-none" autoFocus placeholder="The technical response, referencing a drawing or spec where relevant" />
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending || !answer.trim()} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : 'Answer'}</button></div>
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
function nextLetter(r: string): string { return r.length === 1 && r < 'Z' ? String.fromCharCode(r.charCodeAt(0) + 1) : r + 'A'; }
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
