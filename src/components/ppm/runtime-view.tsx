'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Fuel, Gauge, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { addDays } from '@/domain/ppm';
import { logRuntimeReading, generatePpmWorkOrder } from '@/server/actions/ppm';
import type { PpmData } from './types';

export function RuntimeView({ data, onSelect }: { data: PpmData; onSelect: (id: string) => void }) {
  const cards = data.runtime
    .map((rt) => {
      const plan = data.plans.find((p) => String(p.assetId) === String(rt.assetId));
      const accrued = rt.runtimeHours - rt.runtimeHoursAtLastService;
      const remaining = Math.max(0, rt.runtimeServiceInterval - accrued);
      const daysToRuntime = rt.dailyRuntimeHours > 0 ? Math.ceil(remaining / rt.dailyRuntimeHours) : 9999;
      const runtimeDue = addDays(data.now, daysToRuntime);
      const calendarDue = plan?.nextDue ?? runtimeDue;
      const runtimeWins = Date.parse(runtimeDue) < Date.parse(calendarDue);
      const winner = runtimeWins ? runtimeDue : calendarDue;
      const occ = data.occurrences.filter((o) => o.planId === plan?.id && o.status !== 'completed').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
      return { rt, plan, accrued, remaining, daysToRuntime, runtimeDue, calendarDue, runtimeWins, winner, occId: occ?.id, pct: Math.min(100, Math.round((accrued / rt.runtimeServiceInterval) * 100)) };
    })
    .sort((a, b) => (a.winner < b.winner ? -1 : 1));

  if (cards.length === 0) return <Empty />;

  return (
    <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-3.5">
      {cards.map((c) => (
        <div key={String(c.rt.assetId)} className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5"><Fuel size={15} className="text-warning" /><h3 className="text-[14px] font-semibold">{c.rt.assetName}</h3></div>
              <p className="text-[11.5px] text-text-3">{c.rt.dailyRuntimeHours}h/day · {c.plan?.runtimeIntervalHours ?? c.rt.runtimeServiceInterval}h service interval</p>
            </div>
            {c.runtimeWins && <span className="text-[10px] font-bold text-white bg-[color:var(--tone-warn)] px-1.5 h-5 rounded inline-flex items-center">RUNTIME-DRIVEN</span>}
          </div>

          {/* Big run-hours + gauge */}
          <div className="flex items-end gap-3 mt-3">
            <div>
              <div className="text-[26px] font-bold font-mono tracking-tight leading-none">{c.accrued}<span className="text-[14px] text-text-3">/{c.rt.runtimeServiceInterval}h</span></div>
              <div className="text-[11px] text-text-3 mt-0.5">since last service</div>
            </div>
            <div className="flex-1 pb-1">
              <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.pct >= 85 ? 'var(--tone-danger)' : c.pct >= 60 ? 'var(--tone-warn)' : 'var(--tone-success)' }} />
              </div>
              <div className="text-[10.5px] text-text-3 mt-1 text-right">{c.pct}% of interval</div>
            </div>
          </div>

          {/* Dual countdown */}
          <div className="mt-3 rounded-xl bg-surface-2 p-2.5 text-[12px]">
            <div className="flex items-center gap-1.5">
              <Gauge size={13} className="text-text-3" />
              Service in <strong className={c.runtimeWins ? 'text-warning' : ''}>{c.remaining} running-hrs (~{c.daysToRuntime}d)</strong>
              <span className="text-text-3">or by</span>
              <strong className={!c.runtimeWins ? 'text-warning' : ''}>{c.calendarDue}</strong>
              <span className="text-text-3">— whichever first</span>
            </div>
            <div className="text-[11px] text-text-3 mt-1">Next service: <strong className="text-text-2">{c.winner}</strong></div>
          </div>

          {data.canMutate && (
            <div className="flex items-center gap-2 mt-3">
              <LogReadingButton assetId={String(c.rt.assetId)} />
              {c.occId && (
                <GenerateButton occId={c.occId} generated={!!data.occurrences.find((o) => o.id === c.occId)?.workOrderRef} />
              )}
              {c.occId && <button onClick={() => onSelect(c.occId!)} className="text-[12px] text-primary hover:underline ml-auto">Details</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LogReadingButton({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} className="!h-8 !text-[12px]" icon={<Plus size={14} />} onClick={() => start(async () => { await logRuntimeReading(assetId, 8.4); router.refresh(); })}>
      Log +8h
    </Button>
  );
}

function GenerateButton({ occId, generated }: { occId: string; generated: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (generated) return <span className="text-[11.5px] text-success font-medium">WO generated ✓</span>;
  return (
    <Button variant="primary" disabled={pending} className="!h-8 !text-[12px]" onClick={() => start(async () => { await generatePpmWorkOrder(occId); router.refresh(); })}>
      Generate WO
    </Button>
  );
}

function Empty() {
  return <div className="text-center text-[13px] text-text-3 py-10 border border-dashed border-border rounded-xl">No runtime-metered assets in scope. Generators and pumps show here.</div>;
}
