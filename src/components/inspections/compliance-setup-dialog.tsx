'use client';
import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { Button } from '@/components/ui';
import { INSPECTION_TEMPLATES } from '@/domain/inspection-templates';
import { COMPLIANCE_TEMPLATE_KEYS, type ComplianceObligationInput, type FacilityComplianceSetup } from '@/domain/facility/compliance';
import { createFacilityComplianceObligation, updateFacilityComplianceObligation } from '@/server/actions/facility-compliance';
import type { ObView } from './types';
import styles from './compliance-setup.module.css';

type Fields = Omit<ComplianceObligationInput, 'expectedCompanyId' | 'idempotencyKey'>;
export function ComplianceSetupDialog({ setup, obligation, now, onClose }: { setup: FacilityComplianceSetup; obligation?: ObView; now: string; onClose: () => void }) {
  const router = useRouter(), id = useId(), config = obligation?.configuration;
  const [fields, setFields] = useState<Fields>(() => ({ siteId: String(obligation?.siteId ?? (setup.sites.length === 1 ? setup.sites[0].id : '')), assetId: obligation?.assetId ? String(obligation.assetId) : null,
    name: obligation?.name ?? '', scopeLabel: obligation?.scopeLabel ?? '', criticality: obligation?.criticality ?? 'routine', cadenceDays: obligation?.cadenceDays ?? 30, templateKey: obligation?.templateKey ?? 'general',
    templateName: config?.templateName ?? 'General operational inspection', checklist: config?.checklist.map((item) => ({ ...item })) ?? [{ id: 'item-1', label: 'Visual condition reviewed', severity: 'minor', requiresPhoto: false }, { id: 'item-2', label: 'Operating condition checked', severity: 'major', requiresPhoto: false }],
    authority: obligation?.authority ?? '', certificateReference: config?.certificateReference ?? '', validUntil: obligation?.validUntil ?? null, nextDueDate: config?.nextOperationalDue ?? now }));
  const [pending, start] = useTransition(), [error, setError] = useState('');
  const inFlight = useRef(false), key = useRef<string | null>(null), errorRef = useRef<HTMLParagraphElement>(null);
  function edit(patch: Partial<Fields>) { setFields((current) => ({ ...current, ...patch })); key.current = null; setError(''); }
  function item(index: number, patch: Partial<Fields['checklist'][number]>) { edit({ checklist: fields.checklist.map((value, i) => i === index ? { ...value, ...patch } : value) }); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || inFlight.current) return; inFlight.current = true;
    if (!key.current) key.current = crypto.randomUUID();
    const data = { ...fields, expectedCompanyId: setup.companyId, idempotencyKey: key.current };
    start(async () => { try {
      const result = obligation ? await updateFacilityComplianceObligation({ ...data, obligationId: obligation.id, expectedVersion: config?.version ?? 1 }) : await createFacilityComplianceObligation(data);
      if (!result.ok) { setError(result.error); requestAnimationFrame(() => errorRef.current?.focus()); return; }
      onClose(); router.refresh();
    } catch { setError('The obligation could not be saved. Your entries are still here. Reconnect and try again.'); }
    finally { inFlight.current = false; } });
  }
  return <FacilityDialog title={obligation ? 'Edit compliance obligation' : 'Add compliance obligation'} pending={pending} width={820} onClose={onClose}>
    <form onSubmit={submit} aria-busy={pending} className={styles.stack}>
      <fieldset disabled={pending} className={styles.fields}><legend className="sr-only">Compliance obligation configuration</legend>
        <label className={styles.wide} htmlFor={`${id}-name`}>Obligation name<input id={`${id}-name`} required minLength={2} maxLength={160} value={fields.name} onChange={(event) => edit({ name: event.target.value })} /></label>
        <label htmlFor={`${id}-site`}>Location<select id={`${id}-site`} required value={fields.siteId} onChange={(event) => edit({ siteId: event.target.value, assetId: null })}><option value="">Choose location</option>{setup.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <label htmlFor={`${id}-asset`}>Linked asset (optional)<select id={`${id}-asset`} value={fields.assetId ?? ''} onChange={(event) => { const asset = setup.assets.find((row) => row.id === event.target.value); edit({ assetId: asset?.id ?? null, ...(asset ? { scopeLabel: asset.name } : {}) }); }}><option value="">Area or general obligation</option>{setup.assets.filter((row) => row.siteId === fields.siteId).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <label htmlFor={`${id}-scope`}>Asset or area description<input id={`${id}-scope`} required minLength={2} maxLength={180} value={fields.scopeLabel} onChange={(event) => edit({ scopeLabel: event.target.value })} /></label>
        <label htmlFor={`${id}-criticality`}>Criticality<select id={`${id}-criticality`} value={fields.criticality} onChange={(event) => edit({ criticality: event.target.value as Fields['criticality'] })}><option value="routine">Routine</option><option value="important">Important</option><option value="statutory">Statutory requirement recorded by operator</option></select></label>
        <label htmlFor={`${id}-cadence`}>Operational check interval (days)<input id={`${id}-cadence`} type="number" min={1} max={3650} step={1} required value={fields.cadenceDays} onChange={(event) => edit({ cadenceDays: Number(event.target.value) })} /></label>
        <label htmlFor={`${id}-next`}>Next operational check<input id={`${id}-next`} type="date" min="1900-01-01" max="2100-12-31" required value={fields.nextDueDate ?? ''} onChange={(event) => edit({ nextDueDate: event.target.value })} /></label>
        <label htmlFor={`${id}-authority`}>Responsible authority (optional)<input id={`${id}-authority`} maxLength={160} value={fields.authority} onChange={(event) => edit({ authority: event.target.value })} /></label>
        <label htmlFor={`${id}-reference`}>Certificate reference (optional)<input id={`${id}-reference`} maxLength={160} value={fields.certificateReference} onChange={(event) => edit({ certificateReference: event.target.value })} /></label>
        <label htmlFor={`${id}-expiry`}>Recorded certificate expiry (optional)<input id={`${id}-expiry`} type="date" min="1900-01-01" max="2100-12-31" value={fields.validUntil ?? ''} onChange={(event) => edit({ validUntil: event.target.value || null })} /></label>
        <label htmlFor={`${id}-template`}>Checklist preset<select id={`${id}-template`} value={fields.templateKey} onChange={(event) => { const selected = event.target.value as Fields['templateKey']; edit({ templateKey: selected, templateName: INSPECTION_TEMPLATES[selected].name, checklist: INSPECTION_TEMPLATES[selected].items.map((row) => ({ ...row })) }); }}>{COMPLIANCE_TEMPLATE_KEYS.map((key) => <option key={key} value={key}>{INSPECTION_TEMPLATES[key].name}</option>)}</select></label>
        <label className={styles.wide} htmlFor={`${id}-title`}>Inspection title<input id={`${id}-title`} required minLength={2} maxLength={180} value={fields.templateName} onChange={(event) => edit({ templateName: event.target.value })} /></label>
      </fieldset>
      <section aria-label="Inspection checklist" className={styles.stack}><h3>Inspection checklist</h3><p className={styles.description}>Tailor the operational checks. Required photos must be actual saved images, not a count entered by an inspector.</p>
        {fields.checklist.map((value, index) => <fieldset className={styles.item} disabled={pending} key={value.id}><legend>Check {index + 1}</legend>
          <label htmlFor={`${id}-label-${value.id}`}>Check description<input id={`${id}-label-${value.id}`} required minLength={2} maxLength={240} value={value.label} onChange={(event) => item(index, { label: event.target.value })} /></label>
          <label htmlFor={`${id}-severity-${value.id}`}>Failure severity<select id={`${id}-severity-${value.id}`} value={value.severity} onChange={(event) => item(index, { severity: event.target.value as typeof value.severity })}><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option></select></label>
          <label className={styles.checkbox}><input type="checkbox" checked={value.requiresPhoto} onChange={(event) => item(index, { requiresPhoto: event.target.checked })} />Image evidence required</label>
          <Button type="button" icon={<Trash2 size={15} />} disabled={pending || fields.checklist.length <= 1} aria-label={`Remove check ${index + 1}`} onClick={() => edit({ checklist: fields.checklist.filter((_, i) => i !== index) })}>Remove</Button>
        </fieldset>)}
        <Button type="button" icon={<Plus size={16} />} disabled={pending || fields.checklist.length >= 60} onClick={() => edit({ checklist: [...fields.checklist, { id: crypto.randomUUID(), label: '', severity: 'minor', requiresPhoto: false }] })}>Add checklist item</Button>
      </section>
      <p className={styles.notice}>This is an operational register. Recording an authority, reference or expiry does not verify a certificate. Passing an inspection updates its next operational check; it never grants regulatory approval or extends a certificate.</p>
      {error && <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      <div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : obligation ? 'Save obligation changes' : 'Create obligation'}</Button></div>
    </form>
  </FacilityDialog>;
}
