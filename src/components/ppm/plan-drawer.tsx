'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Camera, Check, Lock, X } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import { completePpmOccurrence, generatePpmWorkOrder, reschedulePpmOccurrence } from '@/server/actions/ppm';
import type { OccView, PlanView, RiskView } from './types';

const OCC_TONE: Record<string, Tone> = { scheduled: 'info', overdue: 'danger', wo_generated: 'progress', in_progress: 'progress', completed: 'success', ai_draft: 'muted' };
const BAND_TONE: Record<string, Tone> = { critical: 'danger', elevated: 'warn', healthy: 'success' };

export function PlanDrawer({ occ, plan, risk, canMutate, onClose }: { occ: OccView; plan: PlanView; risk: RiskView | null; canMutate: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // completion state
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const [rDate, setRDate] = useState(occ.dueDate);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Action failed.');
      else { onClose(); router.refresh(); }
    });
  };

  const allChecked = plan.checklist.every((c) => checked.has(c.id));
  const canComplete = allChecked && (!plan.evidenceRequired || photos > 0);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.4)]" onClick={onClose} />
      <div className="relative w-full max-w-[420px] h-full bg-surface border-l border-border shadow-float overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-start gap-2 z-10">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold truncate">{plan.assetName}</h3>
            <div className="flex items-center gap-2 mt-1">
              <StatusPill status={humanizeStatus(occ.status)} tone={OCC_TONE[occ.status] ?? 'neutral'} />
              {plan.statutory && <span className="inline-flex items-center gap-1 text-[10.5px] text-danger bg-[color:var(--tone-danger)]/10 px-1.5 h-5 rounded"><Lock size={10} /> Statutory</span>}
              {occ.basisWon === 'runtime' && <span className="text-[10.5px] text-warning">⚡ runtime-driven</span>}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-surface-2 flex-none"><X size={16} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3.5">
          {/* Config */}
          <div className="grid grid-cols-2 gap-2">
            <Fact label="Frequency" value={plan.frequency} />
            <Fact label="Due" value={occ.dueDate} />
            <Fact label="Generate WO" value={occ.generateDate} />
            <Fact label="Lead time" value={`${plan.leadTimeDays} days`} />
            <Fact label="Assignee" value={plan.assignee} />
            <Fact label="Est. labour" value={`${plan.estimatedHours}h`} />
            {plan.statutory && plan.statutoryDeadline && <Fact label="Legal deadline" value={plan.statutoryDeadline} danger />}
            <Fact label="Last serviced" value={plan.lastServicedAt ?? '—'} />
          </div>

          {risk && (
            <div className="rounded-xl bg-surface-2 p-2.5 flex items-center gap-2">
              <StatusPill status={`Risk ${risk.score}`} tone={BAND_TONE[risk.band]} />
              <span className="text-[11.5px] text-text-3 truncate">{risk.suggestReason ?? risk.drivers[0]?.value}</span>
            </div>
          )}

          {/* Linked WO */}
          {occ.workOrderRef && (
            <Link href={`/work-orders/${occ.workOrderRef}`} className="text-[12.5px] text-primary hover:underline">
              Linked work order {occ.workOrderRef} →
            </Link>
          )}

          {/* Actions */}
          {canMutate ? (
            <div className="flex flex-col gap-2.5 border-t border-border pt-3.5">
              {!occ.workOrderRef && (
                <Button variant="primary" disabled={pending} onClick={() => run(() => generatePpmWorkOrder(occ.id))}>Generate work order now</Button>
              )}

              {!showComplete ? (
                <Button variant="secondary" disabled={pending} onClick={() => setShowComplete(true)}>Mark serviced…</Button>
              ) : (
                <div className="rounded-xl border border-border p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-2">Completion checklist</div>
                  <div className="flex flex-col gap-1.5">
                    {plan.checklist.map((c) => {
                      const on = checked.has(c.id);
                      return (
                        <button key={c.id} onClick={() => setChecked((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                          className="flex items-center gap-2 text-left text-[12.5px]">
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-none ${on ? 'bg-primary border-primary text-white' : 'border-border-2'}`}>{on && <Check size={11} />}</span>
                          <span className={on ? 'line-through text-text-3' : ''}>{c.label}</span>
                          {c.requiresPhoto && <Camera size={11} className="text-text-3" />}
                        </button>
                      );
                    })}
                  </div>
                  {plan.evidenceRequired && (
                    <button onClick={() => setPhotos((p) => p + 1)} className="mt-2.5 flex items-center gap-2 text-[12px] w-full border border-dashed border-border-2 rounded-lg px-2.5 py-2 hover:bg-surface-2">
                      <Camera size={14} className="text-text-3" />
                      {photos > 0 ? `${photos} evidence photo(s) attached ✓` : 'Attach evidence photo (required)'}
                    </button>
                  )}
                  <Button variant="primary" disabled={pending || !canComplete} onClick={() => run(() => completePpmOccurrence(occ.id, { checkedIds: [...checked], photoCount: photos }))} className="w-full mt-2.5">
                    {canComplete ? 'Complete service' : `${plan.checklist.length - checked.size} item(s) left${plan.evidenceRequired && photos === 0 ? ' + photo' : ''}`}
                  </Button>
                </div>
              )}

              {/* Reschedule */}
              <div className="flex items-center gap-2">
                <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className="h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12.5px] flex-1" />
                <Button variant="secondary" disabled={pending || rDate === occ.dueDate} onClick={() => run(() => reschedulePpmOccurrence(occ.id, rDate))} className="!h-8 !text-[12px]">Reschedule</Button>
              </div>
              {plan.statutory && <p className="text-[11px] text-text-3">Statutory — cannot move past {plan.statutoryDeadline}.</p>}
            </div>
          ) : (
            <div className="border-t border-border pt-3.5 text-[12.5px] text-text-3">Read-only — only the Facility Manager can generate, complete or reschedule.</div>
          )}

          {error && <p className="text-[12px] text-negative">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2 min-w-0">
      <div className="text-[10px] text-text-3 uppercase tracking-wide">{label}</div>
      <div className={`text-[12.5px] font-medium mt-0.5 truncate capitalize ${danger ? 'text-negative' : ''}`}>{value}</div>
    </div>
  );
}
