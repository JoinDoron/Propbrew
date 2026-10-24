'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, Plus, UserPlus, X } from 'lucide-react';
import { addEstateProperty, addEstateTenant } from '@/server/actions/estate-registration';
import styles from './estate-create-actions.module.css';

export type EstateUnitOption = { id: string; propertyName: string; label: string };
type Mode = 'property' | 'tenant';

export function EstateCreateActions({ canAddProperty, canAddTenant, units, demo, asOfDate }: {
  canAddProperty: boolean; canAddTenant: boolean; units: EstateUnitOption[]; demo: boolean; asOfDate: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const requestKey = useRef('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (mode && !dialog.current?.open) dialog.current?.showModal();
    if (!mode && dialog.current?.open) dialog.current.close();
  }, [mode]);

  function open(next: Mode) {
    requestKey.current = crypto.randomUUID();
    setError(null); setSuccess(null); setMode(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !mode) return;
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) ?? '').trim();
    const selectedMode = mode;
    setError(null);
    start(async () => {
      try {
        const result = selectedMode === 'property'
          ? await addEstateProperty({ name: value('name'), address: value('address'), unitCount: Number(value('unitCount')), unitType: value('unitType'), idempotencyKey: requestKey.current })
          : await addEstateTenant({ name: value('name'), unitId: value('unitId'), moveInDate: value('moveInDate'), household: Number(value('household')), email: value('email') || undefined, phone: value('phone') || undefined, idempotencyKey: requestKey.current });
        if (!result.ok) { setError(result.error); return; }
        setSuccess(result.name);
        router.refresh();
      } catch {
        setError('We could not confirm the save. Your entries are still here. Try again to safely check this request.');
      }
    });
  }

  if (!canAddProperty && !canAddTenant) return null;
  const title = mode === 'property' ? 'Add property' : 'Add tenant';
  return <div className={styles.actions}>
    {canAddProperty ? <button type="button" className={styles.primary} onClick={() => open('property')}><Plus size={14} aria-hidden="true" />Add property</button> : null}
    {canAddTenant ? <button type="button" className={styles.secondary} onClick={() => open('tenant')}><UserPlus size={14} aria-hidden="true" />Add tenant</button> : null}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="estate-create-title" onCancel={(event) => { if (pending) event.preventDefault(); else setMode(null); }} onClose={() => setMode(null)}>
      <div className={styles.dialogHeader}><div><p className={styles.eyebrow}>Estate workspace</p><h2 id="estate-create-title">{title}</h2></div><button className={styles.close} type="button" aria-label="Close form" disabled={pending} onClick={() => setMode(null)}><X size={19} /></button></div>
      {success ? <div className={styles.success} role="status"><CheckCircle2 size={35} aria-hidden="true" /><h3>{mode === 'property' ? 'Property added' : 'Tenant record added'}</h3><p><strong>{success}</strong> is now in your estate register. The overview has been refreshed.</p>{mode === 'tenant' ? <p>No account or invitation has been created or sent.</p> : null}<p className={styles.demo}>Sample changes last until this app restarts.</p><button className={styles.primary} type="button" onClick={() => setMode(null)}>Done</button></div>
        : !demo ? <div className={styles.body}><p className={styles.notice}>Production registration is not activated yet. These forms will not claim to save a property or tenant until durable storage and organisation assignments are connected.</p><button className={styles.secondary} type="button" onClick={() => setMode(null)}>Close</button></div>
          : mode === 'tenant' && !units.length ? <div className={styles.body}><p className={styles.notice}>There are no vacant registered units you can assign. Add a property first, or update a unit’s availability in your register.</p>{canAddProperty ? <button type="button" className={styles.primary} onClick={() => open('property')}><Building2 size={14} aria-hidden="true" />Add property first</button> : null}</div>
            : <form onSubmit={submit} className={styles.body}>
              <p className={styles.description}>{mode === 'property' ? 'Register an estate property and its units. It will appear in your property totals, occupancy and tenant selectors.' : 'Add the tenant’s details to an available unit. This records a resident; it does not create a login, send an invitation or issue a rent invoice.'}</p>
              <p className={styles.demo}>Sample workspace · use sample details only. Records reset when the app restarts.</p>
              <fieldset disabled={pending} className={styles.fields} key={mode}>
                <label className={styles.full}>{mode === 'property' ? 'Property name' : 'Tenant full name'}<input name="name" required maxLength={120} placeholder={mode === 'property' ? 'e.g. Palm Grove Apartments' : 'e.g. Ada Okafor'} autoComplete={mode === 'property' ? 'off' : 'name'} /></label>
                {mode === 'property' ? <>
                  <label className={styles.full}>Property address<textarea name="address" required minLength={5} maxLength={500} rows={3} placeholder="Street address, city and state, Nigeria" autoComplete="street-address" /></label>
                  <label>Number of units<input name="unitCount" required type="number" min={1} max={200} step={1} defaultValue={1} inputMode="numeric" /></label>
                  <label>Unit type<select name="unitType" defaultValue="Apartment"><option>Apartment</option><option>Detached house</option><option>Terrace house</option><option>Studio</option><option>Mixed residential</option></select></label>
                  <p className={`${styles.help} ${styles.full}`}>Units start vacant with sequential labels. You are assigned to the property you create; other users’ access does not change.</p>
                </> : <>
                  <label className={styles.full}>Property and unit<select name="unitId" required defaultValue=""><option value="" disabled>Select an available unit</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.propertyName} · {unit.label}</option>)}</select></label>
                  <label>Move-in date<input name="moveInDate" type="date" required defaultValue={asOfDate} min="1900-01-01" max="2100-12-31" /></label>
                  <label>Household size<input name="household" type="number" required min={1} max={30} step={1} defaultValue={1} inputMode="numeric" /></label>
                  <label>Email (optional)<input name="email" type="email" maxLength={254} placeholder="tenant@example.com" autoComplete="email" /></label>
                  <label>Phone (optional)<input name="phone" type="tel" maxLength={32} placeholder="+234 800 000 0000" autoComplete="tel" /></label>
                  <p className={`${styles.help} ${styles.full}`}>Dates after the snapshot date ({asOfDate}) reserve the unit and create an invited resident record. Earlier move-ins mark the resident active and the unit occupied.</p>
                </>}
              </fieldset>
              {error ? <p role="alert" className={styles.error}>{error}</p> : null}
              <div className={styles.footer}><button type="button" disabled={pending} className={styles.secondary} onClick={() => setMode(null)}>Cancel</button><button type="submit" disabled={pending} className={styles.primary}>{pending ? 'Saving…' : title}</button></div>
            </form>}
    </dialog>
  </div>;
}
