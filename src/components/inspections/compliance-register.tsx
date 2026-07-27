'use client';

import Link from 'next/link';
import { Building2, CalendarClock, Play, ShieldAlert } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { complianceState, daysUntil, STATE_LABEL, STATE_TONE } from '@/domain/inspections';
import type { Tone } from '@/lib/status-tones';
import type { InspectionsData, ObView } from './types';

const CRIT_TONE: Record<string, Tone> = { statutory: 'danger', important: 'warn', routine: 'neutral' };

export function ComplianceRegister({ data, onRun, onSchedule }: { data: InspectionsData; onRun: (id: string) => void; onSchedule: (obligationId: string) => void }) {
  // sort: never-evidenced first, then soonest-to-expire (expired = negative → top)
  const ranked = [...data.obligations].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="flex flex-col gap-2">
      {ranked.map((o) => {
        const state = complianceState(o.validUntil);
        const days = o.validUntil ? daysUntil(o.validUntil) : null;
        const tone = STATE_TONE[state];
        // linked actionable inspection (scheduled/overdue) or the last one
        const openInsp = data.inspections.find((i) => i.obligationId === o.id && ['scheduled', 'overdue'].includes(i.status));
        const lastInsp = data.inspections.find((i) => i.ref === o.lastInspectionRef);

        return (
          <div key={o.id} className="bg-surface border border-border rounded-xl shadow-card flex items-stretch overflow-hidden">
            <span className="w-1.5 flex-none" style={{ background: `var(--tone-${tone})` }} />
            <div className="flex-1 min-w-0 p-3.5 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-semibold truncate">{o.name}</span>
                  <StatusPill status={o.criticality} tone={CRIT_TONE[o.criticality] ?? 'neutral'} />
                </div>
                <div className="text-[11.5px] text-text-3 flex items-center gap-1.5 mt-0.5">
                  <Building2 size={11} /> {o.scopeLabel}{o.authority ? ` · ${o.authority}` : ''}
                </div>
              </div>

              {/* Expiry countdown */}
              <div className="text-right flex-none">
                <div className="flex items-center gap-1.5 justify-end">
                  {state === 'expired' && <ShieldAlert size={13} className="text-negative" />}
                  <StatusPill status={STATE_LABEL[state]} tone={tone} />
                </div>
                <div className="text-[11.5px] mt-1 font-mono" style={{ color: `var(--tone-${tone})` }}>
                  {days === null ? 'no certificate on file'
                    : days < 0 ? `expired ${-days}d ago (${o.validUntil})`
                    : `expires in ${days}d (${o.validUntil})`}
                </div>
              </div>

              {/* Action */}
              <div className="flex-none flex items-center gap-2">
                {lastInsp && (
                  <Link href="#" onClick={(e) => { e.preventDefault(); onRun(lastInsp.id); }} className="text-[11.5px] text-primary hover:underline">
                    {lastInsp.ref}
                  </Link>
                )}
                {data.canMutate && openInsp && (
                  <Button variant="primary" className="!h-8 !text-[12px]" icon={<Play size={13} />} onClick={() => onRun(openInsp.id)}>Run</Button>
                )}
                {data.canMutate && !openInsp && (
                  <Button variant="secondary" className="!h-8 !text-[12px]" icon={<CalendarClock size={13} />} onClick={() => onSchedule(o.id)}>Schedule</Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// never-evidenced (null) → −100000; expired/expiring/valid by daysUntil
function rank(o: ObView): number {
  if (!o.validUntil) return -100_000;
  return daysUntil(o.validUntil);
}
