'use client';

import { Card, CardHeader, EmptyState } from '@/components/ui';
import styles from './maintenance-clinexa.module.css';
import { CalendarClock, Play, ShieldAlert } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { complianceState, daysUntil, STATE_LABEL, STATE_TONE } from '@/domain/inspections';
import type { Tone } from '@/lib/status-tones';
import type { InspectionsData, ObView } from './types';

const CRIT_TONE: Record<string, Tone> = { statutory: 'danger', important: 'warn', routine: 'neutral' };

export function ComplianceRegister({ data, onRun, onSchedule }: { data: InspectionsData; onRun: (id: string) => void; onSchedule: (obligationId: string) => void }) {
  // sort: never-evidenced first, then soonest-to-expire (expired = negative → top)
  const ranked = [...data.obligations].sort((a, b) => rank(a) - rank(b));

  return (
    <div className={styles.stack}>
      {ranked.length === 0 && <Card><EmptyState title="No compliance obligations in scope" description="Recorded obligations and their certificate expiry dates will appear here." /></Card>}
      {ranked.map((o) => {
        const state = complianceState(o.validUntil);
        const days = o.validUntil ? daysUntil(o.validUntil) : null;
        const tone = STATE_TONE[state];
        // linked actionable inspection (scheduled/overdue) or the last one
        const openInsp = data.inspections.find((i) => i.obligationId === o.id && ['scheduled', 'overdue'].includes(i.status));
        const lastInsp = data.inspections.find((i) => i.ref === o.lastInspectionRef);

        return (
          <Card key={o.id} padded={false} className={styles.complianceCard}>
            <span className={styles.complianceRail} style={{ background: `var(--tone-${tone})` }} aria-hidden="true" />
            <div className={styles.header}><CardHeader title={o.name} subtitle={`${o.scopeLabel}${o.authority ? ` · ${o.authority}` : ''}`} action={<StatusPill status={o.criticality} tone={CRIT_TONE[o.criticality] ?? 'neutral'} />} /></div>
            <div className={styles.complianceBody}>

              {/* Expiry countdown */}
              <div className={styles.expiry}>
                <div className={styles.inline}>
                  {state === 'expired' && <ShieldAlert size={16} className="text-negative" />}
                  <StatusPill status={STATE_LABEL[state]} tone={tone} />
                </div>
                <p className={styles.text} style={{ color: `var(--tone-${tone})` }}>
                  {days === null ? 'no certificate on file'
                    : days < 0 ? `expired ${-days}d ago (${o.validUntil})`
                    : `expires in ${days}d (${o.validUntil})`}
                </p>
              </div>

              {/* Action */}
              <div className={styles.complianceActions}>
                {lastInsp && (
                  <Button onClick={() => onRun(lastInsp.id)} variant="ghost" aria-label={`View inspection ${lastInsp.ref}`}>
                    {lastInsp.ref}
                  </Button>
                )}
                {data.canMutate && openInsp && (
                  <Button variant="primary" aria-label={`Run inspection for ${o.name}`} icon={<Play size={16} />} onClick={() => onRun(openInsp.id)}>Run</Button>
                )}
                {data.canMutate && !openInsp && (
                  <Button variant="secondary" aria-label={`Schedule inspection for ${o.name}`} icon={<CalendarClock size={16} />} onClick={() => onSchedule(o.id)}>Schedule</Button>
                )}
              </div>
            </div>
          </Card>
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
