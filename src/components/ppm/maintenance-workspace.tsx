'use client';

import { useMemo, useState } from 'react';
import layout from '@/components/ui/workspace-layout.module.css';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, Radar, Sparkles, Wrench } from 'lucide-react';
import { KpiCard, Button, Card, CardHeader, StatusPill } from '@/components/ui';
import styles from './maintenance-clinexa.module.css';
import { PageTabs } from '@/components/ui/page-tabs';
import { addDays } from '@/domain/ppm';
import type { PpmData } from './types';
import { MaintenanceCalendar } from './calendar';
import { RuntimeView } from './runtime-view';
import { RiskPanel } from './risk-panel';
import { PpmList } from './list-view';
import { PlanDrawer } from './plan-drawer';

const OPEN = ['scheduled', 'overdue', 'wo_generated', 'in_progress'];

export function MaintenanceWorkspace(data: PpmData) {
  const [selected, setSelected] = useState<string | null>(null);

  const now = data.now;
  const overdue = data.occurrences.filter((o) => o.status === 'overdue');
  const dueThisMonth = data.occurrences.filter((o) => OPEN.includes(o.status) && o.dueDate >= now && o.dueDate <= addDays(now, 31)).length;
  const autoGenerating = data.occurrences.filter((o) => o.status === 'scheduled' && !o.workOrderRef && o.generateDate <= addDays(now, 7)).length;
  const critical = data.assessments.filter((a) => a.band === 'critical');

  const selOcc = useMemo(() => data.occurrences.find((o) => o.id === selected) ?? null, [data.occurrences, selected]);
  const selPlan = selOcc ? data.plans.find((p) => p.id === selOcc.planId) ?? null : null;
  const selRisk = selOcc ? data.assessments.find((a) => String(a.assetId) === String(selOcc.assetId)) ?? null : null;

  return (
    <div className={layout.layout}>
      <p className={layout.metadata}>Recorded schedule snapshot · {data.now}. AI-F-01 uses deterministic risk rules and signal completeness; it is advisory, not a calibrated failure forecast.</p>
      {/* KPIs */}
      <div className={layout.metrics}>
        <KpiCard label="Due this month" value={String(dueThisMonth)} icon={<CalendarDays size={18} />} />
        <KpiCard label="Overdue" value={String(overdue.length)} icon={<AlertTriangle size={18} />} iconColor="var(--tone-danger)" />
        <KpiCard label="Lead-time queue this week" value={String(autoGenerating)} icon={<Wrench size={18} />} iconColor="var(--tone-warn)" />
        <KpiCard label="Critical risk signals" value={String(critical.length)} icon={<Sparkles size={18} />} />
      </div>

      {/* Coverage-gap radar */}
      {data.gaps.length > 0 && (
        <Card padded={false}>
          <div className={styles.header}><CardHeader title="Maintenance coverage gaps" subtitle={`${data.gaps.length} operational asset${data.gaps.length > 1 ? 's have' : ' has'} no maintenance plan. Review these assets before relying on the due-date schedule.`} action={<Radar size={20} className="text-warning" />} /></div>
          <div className={`${styles.body} ${styles.gapList}`}>
            {data.gaps.map((g) => (
              <div key={g.id} className={styles.gapItem}>
                <div><p className={layout.title}>{g.name}</p><p className={styles.metadata}>{g.category} · {g.locationLabel}</p></div>
                {data.canMutate && <Button disabled title="New plan creation is not connected">Add plan · unavailable</Button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Overdue rail */}
      {overdue.length > 0 && (
        <Card padded={false}>
          <div className={styles.header}><CardHeader title={`Overdue maintenance · ${overdue.length}`} subtitle="Oldest due dates first. Open a plan to review the service and work-order details." action={<AlertTriangle size={20} className="text-negative" />} /></div>
          <div className={styles.overdueRail} role="region" aria-label="Overdue maintenance plans, scroll horizontally" tabIndex={0}>
            {[...overdue].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).map((o) => (
              <Card key={o.id} className={styles.overdueCard}>
                <div><p className={layout.title}>{o.assetName}</p><p className={styles.metadata}>{o.frequency} · due {o.dueDate}</p></div>
                <div><StatusPill status={`${daysLate(o.dueDate, now)} days overdue`} tone="danger" /></div>
                {o.workOrderRef ? (
                  <div className={styles.stack}><Button onClick={() => setSelected(o.id)} aria-label={`View maintenance plan for ${o.assetName}`}>View plan</Button><Link href={`/work-orders/${o.workOrderRef}`} className={styles.link}>WO {o.workOrderRef} →</Link></div>
                ) : (
                  <Button onClick={() => setSelected(o.id)} aria-label={`${data.canMutate ? 'Review work order for' : 'View maintenance plan for'} ${o.assetName}`}>{data.canMutate ? 'Review work order →' : 'View plan →'}</Button>
                )}
              </Card>
            ))}
          </div>
        </Card>
      )}

      <PageTabs label="Maintenance sections" items={[
        { id: 'calendar', label: 'Calendar', content: <MaintenanceCalendar data={data} onSelect={setSelected} /> },
        { id: 'runtime', label: 'Runtime', content: <RuntimeView data={data} onSelect={setSelected} /> },
        { id: 'risk', label: 'AI risk', content: <RiskPanel data={data} /> },
        { id: 'list', label: 'Plan register', content: <PpmList data={data} onSelect={setSelected} /> },
      ]} />

      {selOcc && selPlan && (
        <PlanDrawer occ={selOcc} plan={selPlan} risk={selRisk} canMutate={data.canMutate} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function daysLate(due: string, now: string): number {
  return Math.max(0, Math.round((Date.parse(now) - Date.parse(due)) / 86_400_000));
}
