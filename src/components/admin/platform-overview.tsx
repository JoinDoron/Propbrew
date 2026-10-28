import Link from 'next/link';
import { Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import {
  MichaelDashboardSystem,
  type DashboardActivity,
  type DashboardMetric,
} from '@/components/dashboard/michael-dashboard-system';
import type { Tone } from '@/lib/status-tones';
import { PageTabs } from '@/components/ui/page-tabs';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './admin-workspaces.module.css';

export type TenantRow = { id: string; label: string; plan: string; mrrMinor: number; units: number; users: number; score: number; band: Tone; healthLabel: string };
export type EventRow = { machine: string; event: string; actorName: string; at: string; recordId: string; security: boolean; financial: boolean };
export type SystemRow = { name: string; status: 'operational' | 'degraded' | 'down' | 'not_configured' };
const money = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(minor / 100);
const when = (iso: string) => Number.isNaN(Date.parse(iso)) ? iso : new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' });
const MACHINE_LABEL: Record<string, string> = { 'work-order': 'Work order', 'service-charge': 'Service charge', booking: 'Booking', 'sos-event': 'SOS', 'marketplace-order': 'Order' };

export function PlatformOverview({ totals, tenants, events, ai, systems }: {
  totals: { tenants: number; units: number; users: number; mrrMinor: number; incidents: number; aiCostMinor: number }; tenants: TenantRow[]; events: EventRow[]; ai: { calls: number; capPct: number }; systems: SystemRow[];
}) {
  const metricPanels: DashboardMetric[] = [
    {
      id: 'organisations',
      label: 'Organisations',
      value: String(totals.tenants),
      detail: `${totals.units.toLocaleString('en-NG')} units · ${totals.users.toLocaleString('en-NG')} users represented`,
      visual: {
        type: 'matrix',
        values: tenants.map((tenant) => tenant.score),
        label: 'Recorded tenant attention indices, with stronger colour representing a higher recorded index.',
      },
    },
    {
      id: 'mrr',
      label: 'Estimated platform MRR',
      value: money(totals.mrrMinor),
      detail: 'Plan-based estimate, not verified subscription receipts',
      visual: {
        type: 'matrix',
        values: tenants.map((tenant) => tenant.mrrMinor / 100),
        label: 'Estimated monthly recurring revenue represented by each organisation, with stronger colour representing a larger estimate.',
      },
    },
    {
      id: 'incidents',
      label: 'Recorded active incidents',
      value: String(totals.incidents),
      detail: `${systems.filter((system) => system.status === 'operational').length} of ${systems.length} platform indicators reported available`,
      visual: {
        type: 'matrix',
        values: systems.map((system) => system.status === 'operational' ? 100 : system.status === 'degraded' ? 60 : system.status === 'down' ? 10 : 20),
        label: 'Platform configuration indicators, where stronger colour means a more available recorded state.',
      },
    },
    {
      id: 'ai-spend',
      label: 'Modelled AI spend',
      value: money(totals.aiCostMinor),
      detail: `${ai.calls.toLocaleString('en-NG')} illustrative calls · ${ai.capPct}% of the illustrative monthly cap`,
    },
  ];
  const activityRows: DashboardActivity[] = events.map((event, index) => {
    const status = event.security ? 'Security' : event.financial ? 'Financial' : 'Operational';
    const statusTone: Tone = event.security ? 'danger' : event.financial ? 'info' : 'neutral';
    return {
      id: `${event.machine}-${event.recordId}-${index}`,
      primary: event.event,
      secondary: `${event.actorName} · ${event.recordId}`,
      category: MACHINE_LABEL[event.machine] ?? event.machine,
      status,
      statusTone,
      timestamp: when(event.at),
      href: '/admin/audit',
      actionLabel: `Open audit record for ${event.event}`,
    };
  });

  return <div className={common.layout}>
    <PageTabs label="Platform overview sections" items={[
      { id: 'overview', label: 'Overview', content: <div className={common.layout}>
        <MichaelDashboardSystem
          title="Platform operating picture"
          description="Revenue, tenant health, service configuration and attributable activity across Propbrew."
          metrics={metricPanels}
          activities={activityRows}
          activityTitle="Live platform activity"
          activityDescription="The latest attributable entries in the platform audit history."
        />
        <Card className={common.panel}><CardHeader title="Platform snapshot" subtitle="A review of the demonstration dataset, not a live service-health monitor." /><dl className={common.facts}><div><dt>Units represented</dt><dd>{totals.units.toLocaleString('en-NG')}</dd></div><div><dt>Users represented</dt><dd>{totals.users.toLocaleString('en-NG')}</dd></div><div><dt>MRR source</dt><dd>Plan-based estimate, not subscription receipts</dd></div></dl><div className={common.filters}><Link className={styles.link} href="/admin/tenants">Review organisations →</Link><Link className={styles.link} href="/admin/ai">Review AI policies →</Link></div></Card>
      </div> },
      { id: 'health', label: 'Tenant health & systems', content: <div className={common.layout}>
        <Card padded={false} className={common.panel}><div className={common.registerHeader}><CardHeader title="Tenant health" subtitle="Rules-based attention indices derived from recorded user, work-order and invoice counts." action={<Link className={styles.link} href="/admin/tenants">All organisations →</Link>} /></div>
          {tenants.length ? <div className="pb-table-scroll" role="region" aria-label="Tenant health register" tabIndex={0}><table className={`pb-data-table ${common.table}`}><thead><tr>{['Organisation', 'Plan', 'Units', 'Users', 'Recorded index', 'Estimated MRR · NGN'].map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{tenants.map((t) => <tr key={t.id}><td><span className={common.title}>{t.label}</span><span className={common.metadata}>{t.id}</span></td><td>{t.plan}</td><td>{t.units.toLocaleString('en-NG')}</td><td>{t.users.toLocaleString('en-NG')}</td><td><StatusPill status={`${t.score}/100 · ${t.healthLabel}`} tone={t.band} /></td><td className={common.numeric}>{money(t.mrrMinor)}</td></tr>)}</tbody></table></div> : <EmptyState title="No organisations in this snapshot." />}
        </Card>
        <div className={common.analytics}><Card className={common.panel}><CardHeader title="Modelled AI usage" subtitle="Planning figures only; no provider invoice or verified usage feed." /><dl className={common.facts}><div><dt>Illustrative calls</dt><dd>{ai.calls.toLocaleString('en-NG')}</dd></div><div><dt>Estimated cost</dt><dd>{money(totals.aiCostMinor)}</dd></div><div><dt>Illustrative monthly cap used</dt><dd>{ai.capPct}%</dd></div></dl><div className={`${styles.progress} mt-6`} aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, ai.capPct))}%` }} /></div></Card>
          <Card className={common.panel}><CardHeader title="Configuration indicators" subtitle="Reported configuration is not a successful health check or payment test." /><ul className={common.list}>{systems.map((s) => <li key={s.name} className={common.listRow}><span className={common.title}>{s.name}</span><StatusPill status={s.status === 'not_configured' ? 'Not configured' : s.status === 'operational' ? 'Reported available' : s.status} tone={s.status === 'operational' ? 'info' : s.status === 'not_configured' ? 'muted' : s.status === 'degraded' ? 'warn' : 'danger'} /></li>)}</ul></Card>
        </div>
      </div> },
      { id: 'activity', label: 'Recent activity', content: <Card padded={false} className={common.panel}><div className={common.registerHeader}><CardHeader title="Recent activity" subtitle="The latest entries in this application session’s activity history." action={<Link href="/admin/audit" className={styles.link}>Audit register →</Link>} /></div>
        {events.length ? <div className="pb-table-scroll" role="region" aria-label="Recent platform activity" tabIndex={0}><table className={`pb-data-table ${common.table}`}><thead><tr>{['Event', 'Record', 'Actor', 'When · WAT', 'Classification'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{events.map((e, i) => <tr key={i}><td>{e.event}</td><td><span className={common.title}>{MACHINE_LABEL[e.machine] ?? e.machine}</span><span className={common.metadata}>{e.recordId}</span></td><td>{e.actorName}</td><td>{when(e.at)}</td><td><div className={common.filters}>{e.security && <StatusPill status="Security" tone="danger" />}{e.financial && <StatusPill status="Financial" tone="info" />}{!e.security && !e.financial && <StatusPill status="Operational" tone="neutral" />}</div></td></tr>)}</tbody></table></div> : <EmptyState title="No events yet this session." description="Attributable application events will appear here." />}
      </Card> },
    ]} />
  </div>;
}
