'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, Gauge, LayoutList, Radar, Sparkles, Wrench, Zap } from 'lucide-react';
import { KpiCard } from '@/components/ui';
import { addDays } from '@/domain/ppm';
import type { PpmData } from './types';
import { MaintenanceCalendar } from './calendar';
import { RuntimeView } from './runtime-view';
import { RiskPanel } from './risk-panel';
import { PpmList } from './list-view';
import { PlanDrawer } from './plan-drawer';

type View = 'calendar' | 'runtime' | 'risk' | 'list';
const OPEN = ['scheduled', 'overdue', 'wo_generated', 'in_progress'];

export function MaintenanceWorkspace(data: PpmData) {
  const [view, setView] = useState<View>('calendar');
  const [selected, setSelected] = useState<string | null>(null);

  const now = data.now;
  const overdue = data.occurrences.filter((o) => o.status === 'overdue');
  const dueThisMonth = data.occurrences.filter((o) => OPEN.includes(o.status) && o.dueDate >= now && o.dueDate <= addDays(now, 31)).length;
  const autoGenerating = data.occurrences.filter((o) => o.status === 'scheduled' && !o.workOrderRef && o.generateDate <= addDays(now, 7)).length;
  const critical = data.assessments.filter((a) => a.band === 'critical');
  const anyShadow = data.assessments.some((a) => a.shadow);

  const selOcc = useMemo(() => data.occurrences.find((o) => o.id === selected) ?? null, [data.occurrences, selected]);
  const selPlan = selOcc ? data.plans.find((p) => p.id === selOcc.planId) ?? null : null;
  const selRisk = selOcc ? data.assessments.find((a) => String(a.assetId) === String(selOcc.assetId)) ?? null : null;

  return (
    <div className="flex flex-col gap-3.5">
      {/* KPIs */}
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <KpiCard label="Due this month" value={String(dueThisMonth)} icon={<CalendarDays size={18} />} />
        <KpiCard label="Overdue" value={String(overdue.length)} delta={overdue.length ? 'act now' : 'all clear'} positive={overdue.length === 0} icon={<AlertTriangle size={18} />} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" />
        <KpiCard label="Auto-generating this week" value={String(autoGenerating)} delta="lead-time queue" positive icon={<Wrench size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
        <KpiCard label="Predicted at-risk" value={String(critical.length)} delta={anyShadow ? 'AI · some shadow' : 'AI-F-01'} positive={critical.length === 0} icon={<Sparkles size={18} />} iconBg="rgba(37,99,235,.12)" iconColor="#2563eb" />
      </div>

      {/* Coverage-gap radar */}
      {data.gaps.length > 0 && (
        <div className="rounded-xl border border-[color:var(--tone-warn)]/40 bg-[color:var(--tone-warn)]/[0.07] px-4 py-2.5 flex items-center gap-2.5 flex-wrap">
          <Radar size={16} className="text-warning flex-none" />
          <span className="text-[12.5px] text-text-2">
            <strong className="text-text">{data.gaps.length} operational asset{data.gaps.length > 1 ? 's have' : ' has'} no maintenance plan</strong> — a blind spot a due-date table can’t show:
          </span>
          {data.gaps.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-surface border border-border text-[11.5px]">
              {g.name}
              {data.canMutate && <button className="text-primary hover:underline">+ plan</button>}
            </span>
          ))}
        </div>
      )}

      {/* Overdue rail */}
      {overdue.length > 0 && (
        <div className="rounded-2xl border border-[color:var(--tone-danger)]/40 bg-[color:var(--tone-danger)]/[0.06] p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-negative" />
            <span className="text-[12.5px] font-semibold text-negative">Overdue — {overdue.length}</span>
            <span className="text-[11.5px] text-text-3">oldest first · never scrolls away</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[...overdue].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).map((o) => (
              <div key={o.id} className="flex-none w-[240px] bg-surface border border-border rounded-xl p-2.5">
                <button onClick={() => setSelected(o.id)} className="block text-left w-full">
                  <div className="text-[12.5px] font-semibold truncate">{o.assetName}</div>
                  <div className="text-[11px] text-negative">{daysLate(o.dueDate, now)} days overdue · {o.frequency}</div>
                </button>
                {o.workOrderRef ? (
                  <Link href={`/work-orders/${o.workOrderRef}`} className="text-[11.5px] text-primary hover:underline mt-1 inline-block">WO {o.workOrderRef} →</Link>
                ) : (
                  <button onClick={() => setSelected(o.id)} className="text-[11.5px] text-primary hover:underline mt-1">{data.canMutate ? 'Generate WO now →' : 'View →'}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-border-2 bg-surface p-0.5">
          <Toggle active={view === 'calendar'} onClick={() => setView('calendar')} icon={<CalendarDays size={15} />} label="Calendar" />
          <Toggle active={view === 'runtime'} onClick={() => setView('runtime')} icon={<Zap size={15} />} label="Runtime" />
          <Toggle active={view === 'risk'} onClick={() => setView('risk')} icon={<Gauge size={15} />} label="Risk" />
          <Toggle active={view === 'list'} onClick={() => setView('list')} icon={<LayoutList size={15} />} label="List" />
        </div>
      </div>

      {view === 'calendar' && <MaintenanceCalendar data={data} onSelect={setSelected} />}
      {view === 'runtime' && <RuntimeView data={data} onSelect={setSelected} />}
      {view === 'risk' && <RiskPanel data={data} />}
      {view === 'list' && <PpmList data={data} onSelect={setSelected} />}

      {selOcc && selPlan && (
        <PlanDrawer occ={selOcc} plan={selPlan} risk={selRisk} canMutate={data.canMutate} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Toggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${active ? 'bg-primary text-white' : 'text-text-2 hover:bg-surface-2'}`}>
      {icon}{label}
    </button>
  );
}

function daysLate(due: string, now: string): number {
  return Math.max(0, Math.round((Date.parse(now) - Date.parse(due)) / 86_400_000));
}
