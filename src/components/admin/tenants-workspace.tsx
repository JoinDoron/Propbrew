'use client';

import { useState } from 'react';
import { Building2, Plus, X, Wallet, Gauge, Search } from 'lucide-react';
import type { Tone } from '@/lib/status-tones';
import { Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { PageTabs } from '@/components/ui/page-tabs';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './admin-workspaces.module.css';

export type TenantDetail = { id: string; label: string; plan: string; mrrMinor: number; sites: string[]; units: number; users: number; activeUsers: number; suspendedUsers: number; workOrders: number; openWO: number; overdue: number; score: number; band: Tone; healthLabel: string };
const money = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(minor / 100);

export function TenantsWorkspace({ tenants }: { tenants: TenantDetail[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [suspended, setSuspended] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const selected = tenants.find((t) => t.id === openId);
  const visible = tenants.filter((t) => `${t.label} ${t.plan} ${t.sites.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className={common.layout}>
    <div className={common.toolbar}><p className={common.metadata}>{tenants.length} recorded organisations</p><Button type="button" variant="primary" icon={<Plus size={16} />} onClick={() => setOnboarding(true)}>Preview tenant setup</Button></div>
    <PageTabs label="Platform tenant sections" items={[
      { id: 'organisations', label: 'Organisations', content: <div className={common.layout}><Card><CardHeader title="Organisations" subtitle="Review plans, operational attention signals and recorded account coverage." /><label className={common.search}><Search size={16} /><input type="search" aria-label="Search organisations" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search organisations, sites or plans…" /></label></Card>
        {visible.length ? <div className={styles.recordGrid}>{visible.map((t) => <Card key={t.id} className={common.panel}><CardHeader title={t.label} subtitle={`${t.plan} · ${t.sites.join(', ')}`} action={<StatusPill status={suspended.has(t.id) ? 'Suspension preview' : `${t.score}/100 · ${t.healthLabel}`} tone={suspended.has(t.id) ? 'muted' : t.band} />} /><dl className={common.facts}><div><dt>Units</dt><dd>{t.units.toLocaleString('en-NG')}</dd></div><div><dt>Recorded users</dt><dd>{t.users}</dd></div><div><dt>Estimated monthly plan revenue</dt><dd>{money(t.mrrMinor)}</dd></div></dl><div className={`${common.actions} mt-6`}><Button type="button" aria-label={`View organisation ${t.label}`} onClick={() => setOpenId(t.id)}>View details</Button></div></Card>)}</div> : <Card><EmptyState title="No organisations match." description="Try another organisation or plan name." /></Card>}
      </div> },
      { id: 'overview', label: 'Overview', content: <div className={common.layout}><div className={common.metrics}><KpiCard label="Organisations" value={String(tenants.length)} icon={<Building2 size={18} />} /><KpiCard label="Estimated platform MRR" value={money(tenants.reduce((n, t) => n + t.mrrMinor, 0))} icon={<Wallet size={18} />} /><KpiCard label="Total units" value={tenants.reduce((n, t) => n + t.units, 0).toLocaleString('en-NG')} icon={<Building2 size={18} />} /><KpiCard label="Average recorded index" value={tenants.length ? String(Math.round(tenants.reduce((n, t) => n + t.score, 0) / tenants.length)) : 'Not measured'} icon={<Gauge size={18} />} /></div><Card><CardHeader title="Snapshot limitations" subtitle="Plan estimates and deterministic indices support review, not billing or access enforcement." /><p className={common.body}>Tenant setup and suspension in this view are session-only demonstrations. They do not create an organisation, disable an account, provision infrastructure or establish a subscription.</p></Card></div> },
    ]} />
    {selected && <TenantDrawer tenant={selected} previewSuspended={suspended.has(selected.id)} onClose={() => setOpenId(null)} onPreview={() => { setSuspended((p) => { const next = new Set(p); if (next.has(selected.id)) next.delete(selected.id); else next.add(selected.id); return next; }); }} />}
    {onboarding && <OnboardDialog onClose={() => setOnboarding(false)} onDone={(name, plan) => { setOnboarding(false); setFeedback(`Setup preview completed for ${name} · ${plan}. No tenant or subscription was created.`); }} />}
    {feedback && <div role="status" className={common.feedback}><span>{feedback}</span><IconButton type="button" aria-label="Dismiss tenant preview feedback" onClick={() => setFeedback(null)}><X size={18} /></IconButton></div>}
  </div>;
}

function TenantDrawer({ tenant: t, previewSuspended, onClose, onPreview }: { tenant: TenantDetail; previewSuspended: boolean; onClose: () => void; onPreview: () => void }) {
  return <PortalDialog label={`Organisation details: ${t.label}`} drawer width={600} onClose={onClose}><div className={common.drawer}><header className={common.dialogHeader}><div><h2 className={common.dialogTitle}>{t.label}</h2><p className={common.metadata}>{t.id} · {t.plan} plan</p></div><IconButton type="button" aria-label="Close organisation details" onClick={onClose}><X size={18} /></IconButton></header><div className={common.dialogBody}>
    <StatusPill status={previewSuspended ? 'Session-only suspension preview' : `${t.score}/100 · ${t.healthLabel}`} tone={previewSuspended ? 'muted' : t.band} />
    <dl className={common.facts}>{[['Sites', t.sites.join(', ')], ['Estimated MRR · NGN', money(t.mrrMinor)], ['Units', String(t.units)], ['Active users', String(t.activeUsers)], ['Suspended users', String(t.suspendedUsers)], ['Work orders', `${t.openWO} open / ${t.workOrders}`], ['Overdue invoices', String(t.overdue)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <Card><CardHeader title="Access-state preview" subtitle="This control is deliberately not connected to account enforcement." /><p className={common.body}>Preview the visual state of a suspended organisation. No user access, identity-provider session or audit record is changed.</p><div className={`${common.actions} mt-6`}><Button type="button" aria-pressed={previewSuspended} onClick={onPreview}>{previewSuspended ? 'Reset suspension preview' : 'Preview suspended state'}</Button></div></Card>
  </div></div></PortalDialog>;
}
function OnboardDialog({ onClose, onDone }: { onClose: () => void; onDone: (name: string, plan: string) => void }) {
  const [name, setName] = useState(''); const [plan, setPlan] = useState('Growth');
  return <PortalDialog label="Preview tenant setup" width={540} onClose={onClose}><div className={common.modal}><header className={common.dialogHeader}><h2 className={common.dialogTitle}>Preview tenant setup</h2><IconButton type="button" aria-label="Close tenant setup preview" onClick={onClose}><X size={18} /></IconButton></header><form className={common.dialogBody} onSubmit={(e) => { e.preventDefault(); if (name.trim()) onDone(name.trim(), plan); }}>
    <p className={common.body}>Explore setup details without creating an organisation, starting billing or provisioning access.</p>
    <label className={common.field}><span className={common.label}>Organisation name</span><input className={common.control} required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label><label className={common.field}><span className={common.label}>Subscription plan</span><select className={common.control} value={plan} onChange={(e) => setPlan(e.target.value)}>{['Starter', 'Growth', 'Enterprise'].map((p) => <option key={p}>{p}</option>)}</select></label><div className={common.actions}><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Finish preview</Button></div>
  </form></div></PortalDialog>;
}
