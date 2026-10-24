'use client';

import { useMemo, useState } from 'react';
import layout from '@/components/ui/workspace-layout.module.css';
import { Card, CardHeader } from '@/components/ui';
import styles from './maintenance-clinexa.module.css';
import { ClipboardCheck, Download, Plus, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react';
import { Button, KpiCard } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { ReadOnlyChip } from '@/components/domain';
import { auditReadiness, complianceState, daysUntil } from '@/domain/inspections';
import { toneVar } from '@/lib/status-tones';
import type { InspectionsData } from './types';
import { ComplianceRegister } from './compliance-register';
import { InspectionsList } from './inspections-list';
import { RunInspectionDrawer } from './run-drawer';
import { ScheduleDialog } from './schedule-dialog';

export function InspectionsWorkspace(data: InspectionsData) {
  const [runId, setRunId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<{ obligationId?: string } | null>(null);

  const audit = useMemo(() => auditReadiness(data.obligations), [data.obligations]);
  const expired = data.obligations.filter((o) => complianceState(o.validUntil) === 'expired');
  const never = data.obligations.filter((o) => complianceState(o.validUntil) === 'never');
  const overdueInsp = data.inspections.filter((i) => i.status === 'overdue');
  const raised = data.inspections.reduce((a, i) => a + i.raisedWorkOrders, 0);
  const nextExpiry = [...data.obligations]
    .filter((o) => o.validUntil && daysUntil(o.validUntil) >= 0)
    .sort((a, b) => daysUntil(a.validUntil!) - daysUntil(b.validUntil!))[0];

  const runInsp = runId ? data.inspections.find((i) => i.id === runId) ?? null : null;

  return (
    <div className={layout.layout}>
      {/* Audit readiness + KPIs */}
      <div className={styles.overview}>
        <Card className={styles.audit}>
          <CardHeader title="Audit readiness" subtitle="Recorded compliance coverage" />
          <div className={styles.auditSummary}>
          <AuditDial score={audit.score} />
          <div>
            <p className={styles.text}>{audit.valid} valid · {audit.expiring} expiring · {expired.length} lapsed{never.length ? ` · ${never.length} never` : ''}</p>
            <p className={styles.metadata}>
              {nextExpiry ? <>Next: {nextExpiry.name} in {daysUntil(nextExpiry.validUntil!)}d</> : 'No upcoming expiries'}
            </p>
          </div>
          </div>
          <Button disabled title="Audit-pack generation is not connected" icon={<Download size={16} />}>Export audit pack · unavailable</Button>
        </Card>
        <div className={styles.auditMetrics}>
          <KpiCard label="Lapsed obligations" value={String(expired.length)} icon={<ShieldX size={18} />} iconColor="var(--tone-danger)" />
          <KpiCard label="Expiring ≤30d" value={String(audit.expiring)} icon={<TriangleAlert size={18} />} iconColor="var(--tone-warn)" />
          <KpiCard label="Overdue inspections" value={String(overdueInsp.length)} icon={<ClipboardCheck size={18} />} />
          <KpiCard label="WOs from failures" value={String(raised)} icon={<ShieldCheck size={18} />} iconColor="var(--tone-success)" />
        </div>
      </div>

      {/* Risk banner */}
      {(expired.length > 0 || never.length > 0) && (
        <div className={styles.notice}>
          <TriangleAlert size={16} className="text-negative flex-none" />
          <span className={styles.text}>
            {expired.length > 0 && <><strong className="text-text">{expired.length} obligation{expired.length > 1 ? 's have' : ' has'} lapsed</strong> — a statutory lapse can trigger a shutdown order. </>}
            {never.length > 0 && <>{never.length} never evidenced (coverage gap).</>}
          </span>
        </div>
      )}

      {/* Tabs + create */}
      <div className={styles.toolbar}>
        <div><h3 className={styles.heading}>Inspections & compliance</h3><p className={styles.metadata}>Review obligations, evidence gaps and inspection outcomes.</p></div>
        <div>
          {data.canMutate
            ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => setScheduleFor({})}>New inspection</Button>
            : <ReadOnlyChip />}
        </div>
      </div>

      <PageTabs label="Inspections and compliance sections" items={[
        { id: 'compliance', label: 'Compliance register', content: <ComplianceRegister data={data} onRun={setRunId} onSchedule={(id) => setScheduleFor({ obligationId: id })} /> },
        { id: 'inspections', label: `Inspections (${data.inspections.length})`, content: <InspectionsList data={data} onRun={setRunId} /> },
      ]} />

      {runInsp && <RunInspectionDrawer inspection={runInsp} canMutate={data.canMutate} workOrderBasePath={data.workOrderBasePath} onClose={() => setRunId(null)} />}
      {scheduleFor && <ScheduleDialog obligations={data.obligations} preselect={scheduleFor.obligationId} now={data.now} onClose={() => setScheduleFor(null)} />}
    </div>
  );
}

function AuditDial({ score }: { score: number }) {
  const tone = score >= 80 ? 'success' : score >= 55 ? 'warn' : 'danger';
  const color = toneVar(tone);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-3)" strokeWidth="3.5" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-medium leading-none tabular-nums" style={{ color }}>{score}</span>
        <span className="text-[12px] text-text-3">/ 100</span>
      </div>
    </div>
  );
}
