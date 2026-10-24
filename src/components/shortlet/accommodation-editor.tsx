'use client';

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { ShortletDialog } from './reference-ui';
import { createApartment, createProperty, updateApartment, updateProperty, type ApartmentDetailsInput, type PropertyDetailsInput } from '@/server/actions/shortlet';
import styles from './shortlet-operations-polish.module.css';

export type EditableProperty = { id: string; name: string; city: string; area: string };
export type EditableApartment = { id: string; name: string; type: string; nightlyMinor: number; status: 'active' | 'inactive'; wifiSsid: string; accessInstructions: string; houseRules: string[]; amenities: string[] };
type Target = { kind: 'property'; property?: EditableProperty } | { kind: 'apartment'; propertyId: string; propertyName: string; apartment?: EditableApartment };

export function PropertyEditorButton({ allowed, property }: { allowed: boolean; property?: EditableProperty }) {
  return allowed ? <AccommodationButton target={{ kind: 'property', property }} /> : null;
}
export function ApartmentEditorButton({ allowed, propertyId, propertyName, apartment }: { allowed: boolean; propertyId: string; propertyName: string; apartment?: EditableApartment }) {
  return allowed ? <AccommodationButton target={{ kind: 'apartment', propertyId, propertyName, apartment }} /> : null;
}

function AccommodationButton({ target }: { target: Target }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const editing = target.kind === 'property' ? Boolean(target.property) : Boolean(target.apartment);
  const label = `${editing ? 'Edit' : 'Add'} ${target.kind}`;
  const accessibleLabel = editing ? target.kind === 'property' ? `Edit ${target.property!.name} property` : `Edit ${target.apartment!.name} apartment` : target.kind === 'apartment' ? `Add apartment to ${target.propertyName}` : label;
  return <div className={styles.inline}>
    <Button type="button" variant={!editing && target.kind === 'property' ? 'primary' : undefined} aria-label={accessibleLabel} icon={editing ? <Pencil size={14} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />} onClick={() => { setMessage(''); setOpen(true); }}>{label}</Button>
    {message && <span role="status" className={styles.metadata}>{message}</span>}
    {open && <AccommodationForm target={target} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setMessage(`${target.kind === 'property' ? 'Property' : 'Apartment'} saved.`); }} />}
  </div>;
}

function AccommodationForm({ target, onClose, onSaved }: { target: Target; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const prefix = useId();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const [error, setError] = useState('');
  const record = target.kind === 'property' ? target.property : target.apartment;
  const editing = Boolean(record);
  const [values, setValues] = useState(() => ({
    name: record?.name ?? '', city: target.kind === 'property' ? target.property?.city ?? 'Lagos' : '', area: target.kind === 'property' ? target.property?.area ?? '' : '',
    type: target.kind === 'apartment' ? target.apartment?.type ?? 'Studio' : '', rate: target.kind === 'apartment' && target.apartment ? String(target.apartment.nightlyMinor / 100) : '',
    status: target.kind === 'apartment' ? target.apartment?.status ?? 'active' : 'active',
    wifiSsid: target.kind === 'apartment' ? target.apartment?.wifiSsid ?? '' : '', wifiPassword: '',
    accessInstructions: target.kind === 'apartment' ? target.apartment?.accessInstructions ?? '' : '',
    houseRules: target.kind === 'apartment' ? target.apartment?.houseRules.join('\n') ?? '' : '', amenities: target.kind === 'apartment' ? target.apartment?.amenities.join('\n') ?? '' : '',
  }));
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);
  const change = (name: keyof typeof values, value: string) => setValues((current) => ({ ...current, [name]: value }));
  const lines = (value: string) => [...new Set(value.split('\n').map((line) => line.trim()).filter(Boolean))];
  const title = `${editing ? 'Edit' : 'Add'} ${target.kind}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || inFlight.current) return;
    inFlight.current = true; setError('');
    start(async () => {
      try {
        let result;
        if (target.kind === 'property') {
          const input: PropertyDetailsInput = { name: values.name, city: values.city, area: values.area };
          result = target.property ? await updateProperty(target.property.id, input) : await createProperty(input);
        } else {
          const input: ApartmentDetailsInput = { name: values.name, type: values.type, nightlyRateNaira: Number(values.rate), status: values.status as 'active' | 'inactive', wifiSsid: values.wifiSsid, ...(values.wifiPassword ? { wifiPassword: values.wifiPassword } : {}), accessInstructions: values.accessInstructions, houseRules: lines(values.houseRules), amenities: lines(values.amenities) };
          result = target.apartment ? await updateApartment(target.apartment.id, input) : await createApartment(target.propertyId, input);
        }
        if (!result.ok) { setError(result.error); return; }
        router.refresh(); onSaved();
      } catch { setError('Unable to save these details. Refresh your workspace and try again.'); }
      finally { inFlight.current = false; }
    });
  }
  const input = (key: keyof typeof values, label: string, maximum: number, required = false, type = 'text') => <label className={styles.field} htmlFor={`${prefix}-${key}`}>{label}<input id={`${prefix}-${key}`} name={key} type={type} required={required} minLength={required ? 2 : undefined} maxLength={maximum} autoComplete={type === 'password' ? 'off' : undefined} value={values[key]} onChange={(event) => change(key, event.target.value)} className={styles.control} /></label>;
  const area = (key: 'accessInstructions' | 'houseRules' | 'amenities', label: string, maximum: number) => <label className={styles.field} htmlFor={`${prefix}-${key}`}>{label}<textarea id={`${prefix}-${key}`} name={key} maxLength={maximum} rows={3} value={values[key]} onChange={(event) => change(key, event.target.value)} className={styles.control} /></label>;

  return <ShortletDialog title={title} onClose={onClose} pending={pending} wide={target.kind === 'apartment'}>
    <form onSubmit={submit} className={styles.stack} aria-busy={pending}>
      <p className={styles.text}>{target.kind === 'property' ? 'Register the building or location, then add apartments that guests can book.' : `Accommodation at ${target.propertyName}. Base-rate edits apply to new bookings; existing booking totals stay unchanged.`}</p>
      {input('name', target.kind === 'property' ? 'Property name' : 'Apartment name', 120, true)}
      {target.kind === 'property' ? <div className={styles.formGrid}>{input('city', 'City', 80, true)}{input('area', 'Area / neighbourhood', 120, true)}</div> : <>
        <div className={styles.formGrid}>{input('type', 'Apartment type', 80, true)}<label className={styles.field} htmlFor={`${prefix}-rate`}>Nightly rate (₦)<input id={`${prefix}-rate`} name="nightlyRateNaira" type="number" min="0.01" step="0.01" required value={values.rate} onChange={(event) => change('rate', event.target.value)} className={styles.control} /></label></div>
        <label className={styles.field} htmlFor={`${prefix}-status`}>Apartment status<select id={`${prefix}-status`} name="status" value={values.status} onChange={(event) => change('status', event.target.value)} className={styles.control}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <p className={styles.metadata}>Inactive apartments cannot receive new bookings. Existing bookings remain recorded.</p>
        <div className={styles.formGrid}>{input('wifiSsid', 'Wi-Fi network (optional)', 120)}{input('wifiPassword', editing ? 'New Wi-Fi password (leave blank to keep existing)' : 'Wi-Fi password (optional)', 128, false, 'password')}</div>
        {area('accessInstructions', 'Guest access instructions (optional)', 2000)}
        <div className={styles.formGrid}>{area('houseRules', 'House rules (one per line)', 6000)}{area('amenities', 'Amenities (one per line)', 6000)}</div>
      </>}
      <p className={styles.metadata}>Saving records does not activate a bank account, charge a guest or send access details to anyone.</p>
      {error && <p ref={feedback} tabIndex={-1} role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}><Button type="button" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : `${editing ? 'Save' : 'Add'} ${target.kind}`}</Button></div>
    </form>
  </ShortletDialog>;
}
