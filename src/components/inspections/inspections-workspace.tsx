'use client';

import { useMemo, useState } from 'react';
import { ClipboardCheck, Download, Plus, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react';
import { Button, KpiCard } from '@/components/ui';
import { ReadOnlyChip } from '@/components/domain';
import { auditReadiness, complianceState, daysUntil } from '@/domain/inspections';
import { toneVar } from '@/lib/status-tones';
import type { InspectionsData } from './types';
import { ComplianceRegister } from './compliance-register';
import { InspectionsList } from './inspections-list';
import { RunInspectionDrawer } from './run-drawer';
import { ScheduleDialog } from './schedule-dialog';

type Tab = 'compliance' | 'inspections';

export function InspectionsWorkspace(data: InspectionsData) {
  const [tab, setTab] = useState<Tab>('compliance');
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
    <div className="flex flex-col gap-3.5">
      {/* Audit readiness + KPIs */}
      <div className="grid grid-cols-1 min-[860px]:grid-cols-[300px_1fr] gap-3.5">
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4 flex items-center gap-4">
          <AuditDial score={audit.score} />
          <div>
            <div className="text-[12px] text-text-3 uppercase tracking-wide">Audit-readiness</div>
            <div className="text-[13px] font-semibold mt-0.5">{audit.valid} valid · {audit.expiring} expiring · {expired.length} lapsed{never.length ? ` · ${never.length} never` : ''}</div>
            <div className="text-[11.5px] text-text-3 mt-1">
              {nextExpiry ? <>Next: {nextExpiry.name} in {daysUntil(nextExpiry.validUntil!)}d</> : 'No upcoming expiries'}
            </div>
            <button className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-primary hover:underline">
              <Download size={12} /> Export audit pack
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-3">
          <KpiCard label="Lapsed obligations" value={String(expired.length)} delta={expired.length ? 'shutdown risk' : 'all covered'} positive={expired.length === 0} icon={<ShieldX size={18} />} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" />
          <KpiCard label="Expiring ≤30d" value={String(audit.expiring)} delta="renew soon" positive={audit.expiring === 0} icon={<TriangleAlert size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
          <KpiCard label="Overdue inspections" value={String(overdueInsp.length)} icon={<ClipboardCheck size={18} />} />
          <KpiCard label="WOs from failures" value={String(raised)} delta="auto-raised" positive icon={<ShieldCheck size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />
        </div>
      </div>

      {/* Risk banner */}
      {(expired.length > 0 || never.length > 0) && (
        <div className="rounded-xl border border-[color:var(--tone-danger)]/40 bg-[color:var(--tone-danger)]/[0.06] px-4 py-2.5 flex items-center gap-2.5 flex-wrap">
          <TriangleAlert size={16} className="text-negative flex-none" />
          <span className="text-[12.5px] text-text-2">
            {expired.length > 0 && <><strong className="text-text">{expired.length} obligation{expired.length > 1 ? 's have' : ' has'} lapsed</strong> — a statutory lapse can trigger a shutdown order. </>}
            {never.length > 0 && <>{never.length} never evidenced (coverage gap).</>}
          </span>
        </div>
      )}

      {/* Tabs + create */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-border-2 bg-surface p-0.5">
          <TabBtn active={tab === 'compliance'} onClick={() => setTab('compliance')} label="Compliance register" />
          <TabBtn active={tab === 'inspections'} onClick={() => setTab('inspections')} label={`Inspections (${data.inspections.length})`} />
        </div>
        <div className="ml-auto">
          {data.canMutate
            ? <Button variant="primary" icon={<Plus size={15} />} className="!h-8 !text-[12px]" onClick={() => setScheduleFor({})}>New inspection</Button>
            : <ReadOnlyChip />}
        </div>
      </div>

      {tab === 'compliance'
        ? <ComplianceRegister data={data} onRun={setRunId} onSchedule={(id) => setScheduleFor({ obligationId: id })} />
        : <InspectionsList data={data} onRun={setRunId} />}

      {runInsp && <RunInspectionDrawer inspection={runInsp} canMutate={data.canMutate} onClose={() => setRunId(null)} />}
      {scheduleFor && <ScheduleDialog obligations={data.obligations} preselect={scheduleFor.obligationId} now={data.now} onClose={() => setScheduleFor(null)} />}
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`h-8 px-3.5 rounded-md text-[12.5px] font-medium transition-colors ${active ? 'bg-primary text-white' : 'text-text-2 hover:bg-surface-2'}`}>{label}</button>
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
        <span className="font-mono font-bold text-[22px] leading-none" style={{ color }}>{score}</span>
        <span className="text-[9px] text-text-3">/ 100</span>
      </div>
    </div>
  );
}
