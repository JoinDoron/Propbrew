'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { createFacilityMaintenancePlan, updateFacilityMaintenancePlan, setFacilityMaintenancePlanEnabled, refreshFacilityMaintenance } from '@/server/actions/facility-maintenance-setup';
import type { PpmData, PlanView } from './types';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './maintenance-setup.module.css';

export function MaintenanceSetupControls({ data, onCreate }: { data: PpmData; onCreate: () => void }) {
  const [pending, start] = useTransition(), [message, setMessage] = useState('');
  const router = useRouter();
  if (!data.setup || !data.canMutate) return null;
  return <div className={styles.stack}><div className={styles.toolbar}><p className={layout.body}>Create a service checklist, set the next due date and track every completed service.</p><div className={layout.actions}><Button disabled={pending} icon={<RefreshCw size={16} />} onClick={() => { if (pending) return; start(async () => { try { const r = await refreshFacilityMaintenance({ expectedCompanyId: data.setup!.companyId }); setMessage(r.ok ? r.message : r.error); if (r.ok) router.refresh(); } catch { setMessage('The refresh could not be confirmed. Refresh the page before retrying.'); } }); }}>Review due work orders</Button><Button variant="primary" icon={<Plus size={16} />} onClick={onCreate} disabled={!data.setup.assets.length || pending}>Create maintenance plan</Button></div></div>{!data.setup.assets.length && <p className={layout.metadata}>Add an asset with a valid property or site before creating a maintenance plan.</p>}{message && <p role="status" className={layout.body}>{message}</p>}</div>;
}

export function MaintenancePlanForm({ data, plan, assetId, onClose }: { data: PpmData; plan?: PlanView; assetId?: string; onClose: () => void }) {
  const setup = data.setup!, meta = setup.plans.find((row) => row.planId === plan?.id);
  const [selectedAsset, setAsset] = useState(plan?.assetId ?? assetId ?? setup.assets[0]?.id ?? '');
  const [title, setTitle] = useState(meta?.title ?? '');
  const [frequency, setFrequency] = useState(plan?.frequency ?? 'monthly'), [every, setEvery] = useState(String(meta?.every ?? 1));
  const [basis, setBasis] = useState(plan?.basis ?? 'calendar'), [due, setDue] = useState(plan?.nextDue ?? data.now);
  const [lead, setLead] = useState(String(plan?.leadTimeDays ?? 7)), [labour, setLabour] = useState(String(plan?.estimatedHours ?? 1)), [interval, setInterval] = useState(String(plan?.runtimeIntervalHours ?? 250));
  const [checklist, setChecklist] = useState(plan?.checklist.map((row) => ({ label: row.label, requiresPhoto: row.requiresPhoto })) ?? [{ label: '', requiresPhoto: false }]);
  const [photo, setPhoto] = useState(plan?.evidenceRequired ?? false), [automatic, setAutomatic] = useState(meta?.autoGenerate ?? false);
  const [key] = useState(() => crypto.randomUUID()), [pending, start] = useTransition(), [error, setError] = useState('');
  const router = useRouter();
  function submit(e: React.FormEvent) {
    e.preventDefault(); if (pending) return;
    const asset = setup.assets.find((row) => row.id === selectedAsset); if (!asset) { setError('Choose an available asset.'); return; }
    const fields = { expectedCompanyId: setup.companyId, expectedSiteId: asset.siteId, expectedUnitId: asset.unitId, assetId: asset.id, title, frequency, every: Number(every), basis, firstDue: due, leadTimeDays: Number(lead), estimatedHours: Number(labour), runtimeIntervalHours: basis === 'calendar' ? null : Number(interval), checklist, evidenceRequired: photo, autoGenerate: automatic };
    setError(''); start(async () => { try { const r = plan && meta ? await updateFacilityMaintenancePlan({ ...fields, planId: plan.id, expectedVersion: meta.version }) : await createFacilityMaintenancePlan({ ...fields, idempotencyKey: key }); if (!r.ok) { setError(r.error); return; } onClose(); router.refresh(); } catch { setError('The save could not be confirmed. Your entries are still here; refresh before retrying.'); } });
  }
  return <FacilityDialog title={plan ? 'Edit maintenance plan' : 'Create maintenance plan'} onClose={onClose} pending={pending} width={760}><form onSubmit={submit} className={styles.stack}><fieldset disabled={pending} className={styles.fields}>
    <label className={layout.field}>Asset<select required className={layout.control} value={selectedAsset} onChange={(e) => setAsset(e.target.value)} disabled={!!plan}><option value="">Choose an asset</option>{setup.assets.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.locationLabel}</option>)}</select></label>
    <label className={layout.field}>Plan name<input required minLength={2} maxLength={240} className={layout.control} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Generator preventive service" /></label>
    <div className={styles.grid}><label className={layout.field}>Maintenance basis<select className={layout.control} value={basis} onChange={(e) => setBasis(e.target.value)}><option value="calendar">Calendar</option><option value="runtime">Runtime meter</option><option value="both">Calendar or runtime, whichever comes first</option></select></label><label className={layout.field}>First / next service date<input required type="date" min="1900-01-01" max="2100-12-31" className={layout.control} value={due} onChange={(e) => setDue(e.target.value)} /></label></div>
    <div className={styles.grid}><label className={layout.field}>Repeat every<input type="number" required min={1} max={12} step={1} value={every} onChange={(e) => setEvery(e.target.value)} className={layout.control} /></label><label className={layout.field}>Calendar interval<select className={layout.control} value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="weekly">Week</option><option value="monthly">Month</option><option value="quarterly">Quarter</option><option value="biannual">Six months</option><option value="annual">Year</option></select></label></div>
    <p className={layout.metadata}>{basis === 'runtime' ? 'Runtime-only plans become due after the recorded meter reaches the interval. The calendar anchor is retained for future changes.' : 'Calendar dates stay anchored to this date. A 31st-day schedule uses the final day of shorter months and returns to the 31st.'}</p>
    {basis !== 'calendar' && <label className={layout.field}>Runtime service interval (h)<input required type="number" min="0.01" max="100000000" step="0.01" value={interval} onChange={(e) => setInterval(e.target.value)} className={layout.control} /></label>}
    <div className={styles.grid}><label className={layout.field}>Work-order lead time (days)<input required type="number" min={0} max={90} step={1} value={lead} onChange={(e) => setLead(e.target.value)} className={layout.control} /></label><label className={layout.field}>Estimated labour (h)<input required type="number" min="0.01" max={1000} step="0.01" value={labour} onChange={(e) => setLabour(e.target.value)} className={layout.control} /></label></div>
    <div className={styles.stack}><p className={layout.title}>Service checklist</p>{checklist.map((item, index) => <div key={index} className={styles.checkRow}><label className={layout.field}>Checklist item {index + 1}<input required minLength={2} maxLength={240} value={item.label} onChange={(e) => setChecklist((rows) => rows.map((row, i) => i === index ? { ...row, label: e.target.value } : row))} className={layout.control} /></label><label className={styles.check}><input type="checkbox" checked={item.requiresPhoto} onChange={(e) => setChecklist((rows) => rows.map((row, i) => i === index ? { ...row, requiresPhoto: e.target.checked } : row))} />Photo required for item {index + 1}</label><Button type="button" disabled={checklist.length === 1} aria-label={`Remove checklist item ${index + 1}`} onClick={() => setChecklist((rows) => rows.filter((_, i) => i !== index))}>Remove</Button></div>)}<Button type="button" disabled={checklist.length >= 50} onClick={() => setChecklist((rows) => [...rows, { label: '', requiresPhoto: false }])}>Add checklist item</Button></div>
    <label className={styles.check}><input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />Require a stored service photo</label><label className={styles.check}><input type="checkbox" checked={automatic} onChange={(e) => setAutomatic(e.target.checked)} />Automatically create an unassigned work order when due</label><p className={layout.metadata}>Enable automatic work orders when your field-team work-order process is ready; generated jobs remain unassigned. A linked job must reach Resolved before service can be recorded. Automatic work orders use the lead time. Pausing stops new generation; existing jobs remain. Service completion and evidence always require a manager. {plan ? 'Changes apply to future service configuration; recorded service history remains.' : ''}</p>
    </fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={layout.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : plan ? 'Save maintenance plan' : 'Create maintenance plan'}</Button></div></form></FacilityDialog>;
}

export function MaintenancePlanToggle({ data, plan }: { data: PpmData; plan: PlanView }) {
  const meta = data.setup?.plans.find((row) => row.planId === plan.id), asset = data.setup?.assets.find((row) => row.id === plan.assetId);
  const [pending, start] = useTransition(), [error, setError] = useState(''); const router = useRouter();
  if (!meta || !asset || !data.canMutate) return null;
  return <div><Button disabled={pending || meta.needsReview} onClick={() => { if (pending) return; start(async () => { try { const r = await setFacilityMaintenancePlanEnabled({ expectedCompanyId: data.setup!.companyId, expectedSiteId: asset.siteId, expectedUnitId: asset.unitId, assetId: asset.id, planId: plan.id, expectedVersion: meta.version, enabled: !meta.enabled }); if (!r.ok) setError(r.error); else { setError(''); router.refresh(); } } catch { setError('The change could not be confirmed. Refresh before retrying.'); } }); }}>{meta.enabled ? 'Pause plan' : 'Resume plan'}</Button>{error && <p role="alert" className={styles.error}>{error}</p>}</div>;
}

export function ServiceHistory({ data }: { data: PpmData }) {
  const rows = data.setup?.services ?? [];
  return <Card><CardHeader title="Service history" subtitle="Actual service dates, completed checklists and private stored evidence. Missed intervals are never recorded as completed." />{!rows.length ? <EmptyState title="No service recorded yet" description="Open a scheduled occurrence to record its checklist, actual date and service evidence." /> : <div className={styles.stack}>{rows.map((row) => <article className={styles.history} key={row.id}><div className={styles.toolbar}><div><h3 className={layout.title}>{row.title}</h3><p className={layout.metadata}>{row.servicedOn} · {row.actorName} · {row.checkedIds.length} checklist items{row.runtimeAtService !== null ? ` · ${row.runtimeAtService} meter hours` : ''}</p></div>{row.workOrderRef && <a className={styles.link} href={`/work-orders/${encodeURIComponent(row.workOrderRef)}`}>{row.workOrderRef}</a>}</div>{row.notes && <p className={layout.body}>{row.notes}</p>}<div className={layout.actions}>{row.evidence.map((file) => <a key={file.id} className={styles.link} href={file.url} target="_blank" rel="noreferrer">{file.name}</a>)}</div></article>)}</div>}</Card>;
}
