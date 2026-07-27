'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Camera, Check, Minus, X } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import { SEVERITY_TONE, SEVERITY_PRIORITY } from '@/domain/inspections';
import { runInspection } from '@/server/actions/inspections';
import type { InspView } from './types';

type R = 'pass' | 'fail' | 'na';
const INSP_TONE: Record<string, Tone> = { scheduled: 'info', in_progress: 'progress', passed: 'success', failed: 'danger', overdue: 'warn' };

export function RunInspectionDrawer({ inspection, canMutate, onClose }: { inspection: InspView; canMutate: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isRunnable = canMutate && ['scheduled', 'overdue'].includes(inspection.status);

  const [results, setResults] = useState<Record<string, R>>(() =>
    Object.fromEntries(inspection.checklist.filter((c) => c.result).map((c) => [c.id, c.result as R])),
  );
  const [photos, setPhotos] = useState(0);

  const set = (id: string, r: R) => setResults((prev) => ({ ...prev, [id]: r }));
  const allMarked = inspection.checklist.every((c) => results[c.id]);
  const fails = inspection.checklist.filter((c) => results[c.id] === 'fail');
  const photoNeeded = inspection.checklist.some((c) => c.requiresPhoto && results[c.id] && results[c.id] !== 'na');
  const canComplete = allMarked && (!photoNeeded || photos > 0);

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await runInspection(inspection.id, { results: inspection.checklist.map((c) => ({ itemId: c.id, result: results[c.id] })), photoCount: photos });
      if (!r.ok) setError(r.error);
      else { onClose(); router.refresh(); }
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.4)]" onClick={onClose} />
      <div className="relative w-full max-w-[440px] h-full bg-surface border-l border-border shadow-float overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-start gap-2 z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-semibold truncate">{inspection.template}</h3>
              <StatusPill status={humanizeStatus(inspection.status)} tone={INSP_TONE[inspection.status] ?? 'neutral'} />
            </div>
            <div className="text-[11.5px] text-text-3 mt-0.5">{inspection.assetName} · {inspection.ref} · {inspection.inspector}</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-surface-2 flex-none"><X size={16} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {isRunnable && (
            <div className="text-[12px] text-text-3">
              Mark each item. Any <strong className="text-negative">fail</strong> auto-raises a work order — priority from severity.
            </div>
          )}

          {/* Checklist */}
          <div className="flex flex-col gap-2">
            {inspection.checklist.map((c) => {
              const r = results[c.id];
              return (
                <div key={c.id} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium">{c.label}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <StatusPill status={c.severity} tone={SEVERITY_TONE[c.severity]} />
                        <span className="text-[10px] text-text-3">→ {SEVERITY_PRIORITY[c.severity]} WO on fail</span>
                        {c.requiresPhoto && <Camera size={11} className="text-text-3" />}
                      </div>
                    </div>
                  </div>
                  {isRunnable ? (
                    <div className="inline-flex rounded-lg border border-border-2 bg-surface-2 p-0.5 mt-2">
                      <Seg active={r === 'pass'} tone="success" onClick={() => set(c.id, 'pass')} icon={<Check size={13} />} label="Pass" />
                      <Seg active={r === 'fail'} tone="danger" onClick={() => set(c.id, 'fail')} icon={<X size={13} />} label="Fail" />
                      <Seg active={r === 'na'} tone="muted" onClick={() => set(c.id, 'na')} icon={<Minus size={13} />} label="N/A" />
                    </div>
                  ) : (
                    <div className="mt-1.5">
                      {r ? <StatusPill status={r === 'na' ? 'N/A' : r} tone={r === 'pass' ? 'success' : r === 'fail' ? 'danger' : 'muted'} /> : <span className="text-[11.5px] text-text-3">not recorded</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Evidence + submit / results */}
          {isRunnable ? (
            <div className="border-t border-border pt-3 flex flex-col gap-2.5">
              {photoNeeded && (
                <button onClick={() => setPhotos((p) => p + 1)} className="flex items-center gap-2 text-[12px] w-full border border-dashed border-border-2 rounded-lg px-2.5 py-2 hover:bg-surface-2">
                  <Camera size={14} className="text-text-3" />
                  {photos > 0 ? `${photos} evidence photo(s) attached ✓` : 'Attach evidence photo (required)'}
                </button>
              )}
              {fails.length > 0 && (
                <div className="text-[12px] text-negative">{fails.length} fail(s) → {fails.length} work order(s) will be raised on submit.</div>
              )}
              <Button variant="primary" disabled={pending || !canComplete} onClick={submit}>
                {canComplete ? (fails.length > 0 ? `Complete — raise ${fails.length} WO(s)` : 'Complete — pass') : `${inspection.checklist.filter((c) => !results[c.id]).length} item(s) left${photoNeeded && photos === 0 ? ' + photo' : ''}`}
              </Button>
            </div>
          ) : (
            inspection.raisedWorkOrderRefs.length > 0 && (
              <div className="border-t border-border pt-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3 mb-2">Auto-raised work orders</div>
                <div className="flex flex-col gap-1.5">
                  {inspection.raisedWorkOrderRefs.map((ref) => (
                    <Link key={ref} href={`/work-orders/${ref}`} className="text-[12.5px] text-primary hover:underline font-mono">{ref} →</Link>
                  ))}
                </div>
              </div>
            )
          )}

          {error && <p className="text-[12px] text-negative">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function Seg({ active, tone, onClick, icon, label }: { active: boolean; tone: Tone; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors"
      style={active ? { background: `var(--tone-${tone})`, color: '#fff' } : { color: 'var(--text-2)' }}>
      {icon}{label}
    </button>
  );
}
