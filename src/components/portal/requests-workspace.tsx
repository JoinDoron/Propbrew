'use client';

import { PortalCard } from './portal-patterns';
import layout from '@/components/ui/workspace-layout.module.css';

import { PortalDialog } from '@/components/portal/portal-dialog';
import { PageTabs } from '@/components/ui/page-tabs';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Sparkles, Star, Check, Clock, CircleDot } from 'lucide-react';
import { DomainStatus } from '@/components/domain';
import type { WorkOrderStatus } from '@/domain/enums';
import { toneVar, type Tone } from '@/lib/status-tones';
import { triageRequest, requestStepIndex, isRequestRateable, etaLabel, REQUEST_STEPS } from '@/domain/resident-portal';
import { raiseRequest } from '@/server/actions/resident-requests';
import styles from './portal-workspaces.module.css';

export type RequestRow = { id: string; ref: string; title: string; status: string; priority: string; assigneeName: string; createdAt: string };

const PRIORITY_TONE: Record<string, Tone> = { emergency: 'danger', high: 'danger', routine: 'warn', low: 'neutral' };

export function RequestsWorkspace({ requests, canCreate = false }: { requests: RequestRow[]; canCreate?: boolean }) {
  const [tab, setTab] = useState<'all' | 'open' | 'closed'>('all');
  const [composing, setComposing] = useState(false);
  const [rated, setRated] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => setToast(m);
  const open = requests.filter((r) => requestStepIndex(r.status) < 4 && requestStepIndex(r.status) >= 0);
  const shown = tab === 'all' ? requests : tab === 'open' ? open : requests.filter((r) => requestStepIndex(r.status) === 4);

  const sectionContent = (<div className={layout.layout}>
    {shown.length === 0 ? (
      <div className="text-center py-14 border border-dashed border-border rounded-xl">
        <CircleDot size={26} className="mx-auto text-text-3 mb-2" />
        <p className="text-[14px] font-medium">Nothing here yet</p>
        <p className="text-[12px] text-text-3 mt-0.5">Raise a request and we’ll track it to resolution.</p>
      </div>
    ) : (
      <div className="flex flex-col gap-6 min-w-0">
        {shown.map((r) => {
          const step = requestStepIndex(r.status);
          const rateable = isRequestRateable(r.status);
          return (
            <PortalCard padded={false} key={r.id} className="p-6 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium truncate">{r.title}</div>
                  <div className="text-[12px] text-text-3 font-mono">{r.ref} · {r.assigneeName === 'Unassigned' ? 'awaiting assignment' : r.assigneeName}</div>
                </div>
                <DomainStatus type="work_order" status={r.status as WorkOrderStatus} />
              </div>

              {step >= 0 ? <Tracker step={step} /> : <p className="text-[12px] text-negative mt-3">This request was {r.status}.</p>}

              {rateable && (
                <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-text-3">{rated[r.id] ? 'Thanks for rating!' : 'How did we do?'}</span>
                  <div className="flex flex-wrap gap-0.5 ml-auto" role="group" aria-label={`Rate maintenance request ${r.ref}`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" className="pb-icon-action" aria-pressed={n <= (rated[r.id] ?? 0)} onClick={() => { setRated((p) => ({ ...p, [r.id]: n })); flash('Rating preview saved in this session only; it has not been sent to management.'); }} aria-label={`${n} stars`}>
                        <Star size={17} className={n <= (rated[r.id] ?? 0) ? 'fill-warning text-warning' : 'text-border-2'} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </PortalCard>
          );
        })}
      </div>
    )}
  </div>);

  return (
    <div className={layout.layout}>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-3">{open.length} open request{open.length === 1 ? '' : 's'}</span>
        <button disabled={!canCreate} onClick={() => setComposing(true)} className="pb-action ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[14px] font-medium shadow-sm hover:brightness-105"><Plus size={16} /> Raise a request</button>
      </div>

      <PageTabs label="Maintenance request views" activeTab={tab} onTabChange={(id) => setTab(id as typeof tab)} items={[
        { id: "all", label: "All requests", content: tab === 'all' ? sectionContent : null },
        { id: "open", label: "Open requests", count: open.length, content: tab === 'open' ? sectionContent : null },
        { id: "closed", label: "Closed requests", content: tab === 'closed' ? sectionContent : null }
      ]} />

      {composing && canCreate && <RaiseDialog onClose={() => setComposing(false)} onDone={(ref) => { setComposing(false); flash(`Request ${ref} recorded. Assignment and attendance have not yet been confirmed.`); }} />}

      {toast && <div role="status" className={layout.toast}><span>{toast}</span><button type="button" aria-label="Dismiss request message" className="pb-icon-action" onClick={() => setToast(null)}><X size={16} /></button></div>}

    </div>
  );
}

function Tracker({ step }: { step: number }) {
  return (
    <div className={styles.scroll} role="region" tabIndex={0} aria-label="Maintenance request progress"><div className={styles.progress}>
      {REQUEST_STEPS.map((label, i) => {
        const done = i < step, current = i === step;
        return (
          <div key={label} className="flex-1 flex items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className="w-5 h-5 rounded-full grid place-items-center flex-none" style={{ background: done ? toneVar('success') : current ? 'var(--primary)' : 'var(--surface-3)', color: done || current ? 'var(--on-primary)' : 'var(--text-3)' }} aria-hidden="true">
                {done ? <Check size={11} /> : current ? <Clock size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
              </span>
              <span className={`text-[12px] ${current ? 'text-primary font-medium' : 'text-text-3'}`} aria-current={current ? 'step' : undefined}>{label}</span>
            </div>
            {i < REQUEST_STEPS.length - 1 && <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: i < step ? toneVar('success') : 'var(--surface-3)' }} />}
          </div>
        );
      })}
    </div></div>
  );
}

function RaiseDialog({ onClose, onDone }: { onClose: () => void; onDone: (ref: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const triage = useMemo(() => (text.trim().length >= 4 ? triageRequest(text) : null), [text]);

  function submit() {
    if (pending || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try {
      const r = await raiseRequest({ title: text });
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onDone(r.ref);
      } catch { setError('We could not confirm the request. Your description is still here. Refresh and check for an existing request before retrying to avoid a duplicate.'); }
      finally { inFlight.current = false; }
    });
  }

  return (
    <PortalDialog label="Raise a request" onClose={onClose} width={540} canClose={!pending}>

      <PortalCard padded={false} className="relative w-full p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="pb-dialog-title text-[15px] font-semibold">Raise a request</h3>
          <button aria-label="Close maintenance request form" disabled={pending} onClick={onClose} className="pb-icon-action rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button>
        </div>

        <textarea value={text} disabled={pending} onChange={(e) => setText(e.target.value)} rows={3} autoFocus aria-label="Describe your maintenance request" placeholder="What’s the problem? e.g. Kitchen tap is leaking under the sink" className="pb-form-control w-full px-3 py-2.5 rounded-xl border border-border-2 bg-surface text-[14px] leading-relaxed outline-none focus:border-primary resize-none" />

        {triage && (
          <div className="mt-2.5 rounded-xl border border-primary/25 bg-primary/[0.04] p-3 animate-fade">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-primary mb-1.5"><Sparkles size={12} /> Rules-based triage preview</div>
            <div className="flex items-center gap-2 flex-wrap text-[14px]">
              <span className="font-semibold">{triage.category.label}</span>
              <span className="px-1.5 h-[20px] inline-flex items-center rounded-md text-[12px] font-semibold capitalize" style={{ background: `color-mix(in srgb, ${toneVar(PRIORITY_TONE[triage.priority])} 14%, transparent)`, color: toneVar(PRIORITY_TONE[triage.priority]) }}>{triage.priority}{triage.escalated ? ' · urgent' : ''}</span>
              <span className="text-text-3">· target response {etaLabel(triage.etaHours)}</span>
            </div>
            <p className="text-[12px] text-text-3 mt-1.5">Suggested category and response target, not a connected AI assessment or confirmed team assignment. Management reviews the recorded request.</p>
          </div>
        )}
        {error && <div role="alert" className="text-[14px] text-negative mt-2">{error}</div>}

        <div className="flex justify-end gap-2 mt-3.5">
          <button disabled={pending} onClick={onClose} className="pb-action h-9 px-3.5 rounded-lg border border-border-2 text-[14px]">Cancel</button>
          <button onClick={submit} disabled={pending || text.trim().length < 4} className="pb-action h-9 px-4 rounded-lg bg-primary text-white text-[14px] font-medium disabled:opacity-50">{pending ? 'Sending…' : 'Submit request'}</button>
        </div>
      </PortalCard>
    </PortalDialog>
  );
}
