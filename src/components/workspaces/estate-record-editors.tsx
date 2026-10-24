'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { updateEstateProperty, updateEstateTenant } from '@/server/actions/estate-registration';

export type EstateUnitOption = { id: string; label: string; occupancy: string };

export function EstatePropertyEditor({ property }: { property: { id: string; name: string; address: string } }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant="ghost" icon={<Pencil size={14} aria-hidden="true" />} aria-label={`Edit property ${property.name}`} onClick={() => setOpen(true)}>Edit</Button>{open && <PropertyForm property={property} onClose={() => setOpen(false)} />}</>;
}

function PropertyForm({ property, onClose }: { property: { id: string; name: string; address: string }; onClose: () => void }) {
  const router = useRouter(), prefix = useId();
  const [error, setError] = useState<string>(); const [pending, start] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return; const form = new FormData(event.currentTarget); setError(undefined);
    start(async () => { try { const result = await updateEstateProperty({ id: property.id, name: form.get('name'), address: form.get('address') }); if (!result.ok) { setError(result.error); return; } router.refresh(); onClose(); } catch { setError('The property could not be saved. Refresh the record before retrying.'); } });
  }
  return <FacilityDialog title="Edit property" onClose={onClose} pending={pending}><form onSubmit={submit} className="pb-section"><p className="text-sm text-text-2">Update this property’s details. Registered units and current tenancies stay linked to the same property.</p><fieldset disabled={pending} className="m-0 grid gap-4 border-0 p-0"><label className="pb-form-label" htmlFor={`${prefix}-name`}>Property name<input id={`${prefix}-name`} name="name" required minLength={2} maxLength={120} defaultValue={property.name} className="pb-form-control mt-2" /></label><label className="pb-form-label" htmlFor={`${prefix}-address`}>Property address<textarea id={`${prefix}-address`} name="address" required minLength={5} maxLength={500} defaultValue={property.address} rows={3} className="pb-form-control mt-2" /></label></fieldset>{error && <p role="alert" className="text-sm text-tone-danger">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save property'}</Button></div></form></FacilityDialog>;
}

export type EditableEstateResident = { id: string; name: string; email?: string; phone?: string; household: number; unitId: string; unitLabel: string };
export function EstateResidentEditor({ resident, units }: { resident: EditableEstateResident; units: EstateUnitOption[] }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant="ghost" icon={<Pencil size={14} aria-hidden="true" />} aria-label={`Edit resident ${resident.name}`} onClick={() => setOpen(true)}>Edit</Button>{open && <ResidentForm resident={resident} units={units} onClose={() => setOpen(false)} />}</>;
}

function ResidentForm({ resident, units, onClose }: { resident: EditableEstateResident; units: EstateUnitOption[]; onClose: () => void }) {
  const router = useRouter(), prefix = useId(); const [error, setError] = useState<string>(); const [pending, start] = useTransition();
  const available = units.filter((unit) => unit.id === resident.unitId || unit.occupancy === 'vacant');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return; const form = new FormData(event.currentTarget); setError(undefined);
    start(async () => { try { const result = await updateEstateTenant({ id: resident.id, name: form.get('name'), email: form.get('email'), phone: form.get('phone'), household: Number(form.get('household')), unitId: form.get('unitId') }); if (!result.ok) { setError(result.error); return; } router.refresh(); onClose(); } catch { setError('The resident could not be saved. Refresh the record before retrying.'); } });
  }
  return <FacilityDialog title="Edit resident" onClose={onClose} pending={pending}><form onSubmit={submit} className="pb-section"><p className="text-sm text-text-2">Edit contact details or move this resident to an available unit. This does not change a login, send a message or move historical invoices.</p><fieldset disabled={pending} className="m-0 grid gap-4 border-0 p-0"><label className="pb-form-label" htmlFor={`${prefix}-name`}>Resident full name<input id={`${prefix}-name`} name="name" required minLength={2} maxLength={120} defaultValue={resident.name} className="pb-form-control mt-2" /></label><label className="pb-form-label" htmlFor={`${prefix}-email`}>Email<input id={`${prefix}-email`} name="email" type="email" maxLength={254} defaultValue={resident.email ?? ''} className="pb-form-control mt-2" /></label><label className="pb-form-label" htmlFor={`${prefix}-phone`}>Phone<input id={`${prefix}-phone`} name="phone" type="tel" maxLength={26} defaultValue={resident.phone ?? ''} className="pb-form-control mt-2" /></label><label className="pb-form-label" htmlFor={`${prefix}-household`}>Household size<input id={`${prefix}-household`} name="household" type="number" min={1} max={50} step={1} required defaultValue={resident.household} className="pb-form-control mt-2" /></label><label className="pb-form-label" htmlFor={`${prefix}-unit`}>Property and unit<select id={`${prefix}-unit`} name="unitId" defaultValue={resident.unitId} required className="pb-form-control mt-2">{!available.some((unit) => unit.id === resident.unitId) && <option value={resident.unitId}>{resident.unitLabel}</option>}{available.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></label></fieldset>{error && <p role="alert" className="text-sm text-tone-danger">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save resident'}</Button></div></form></FacilityDialog>;
}
