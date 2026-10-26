'use client';

import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { FacilityDialog } from './facility-ui';
import { createFacilityAsset, updateFacilityAsset } from '@/server/actions/facility-registration';

export type AssetLocationOption = { id: string; label: string };
export type EditableAsset = { id: string; name: string; category: string; serial: string; locationLabel: string; status: string; purchaseDate: string; warrantyExpiry: string };

export function AssetEditor({ asset, locations = [] }: { asset?: EditableAsset; locations?: AssetLocationOption[] }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant={asset ? 'secondary' : 'primary'} icon={asset ? <Pencil size={14} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />} aria-label={asset ? `Edit asset ${asset.name}` : 'Add asset'} onClick={() => setOpen(true)}>{asset ? 'Edit asset' : 'Add asset'}</Button>{open && <AssetForm asset={asset} locations={locations} onClose={() => setOpen(false)} />}</>;
}

function AssetForm({ asset, locations, onClose }: { asset?: EditableAsset; locations: AssetLocationOption[]; onClose: () => void }) {
  const router = useRouter(), prefix = useId(), key = useRef(crypto.randomUUID());
  const [error, setError] = useState<string>(); const [pending, start] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return; const form = new FormData(event.currentTarget), value = (name: string) => String(form.get(name) ?? ''); setError(undefined);
    const details = { name: value('name'), category: value('category'), serial: value('serial'), locationLabel: value('locationLabel'), status: value('status'), purchaseDate: value('purchaseDate'), warrantyExpiry: value('warrantyExpiry') };
    start(async () => { try { const result = await (asset ? updateFacilityAsset({ ...details, id: asset.id }) : createFacilityAsset({ ...details, siteId: value('siteId'), idempotencyKey: key.current })); if (!result.ok) { setError(result.error); return; } router.refresh(); onClose(); } catch { setError('The asset could not be saved. Your entries are still here; retry to check the submission safely.'); } });
  }
  const field = (name: string, label: string, value: string, type = 'text', max = 160) => <label className="pb-form-label" htmlFor={`${prefix}-${name}`}>{label}<input id={`${prefix}-${name}`} name={name} type={type} required maxLength={max} defaultValue={value} className="pb-form-control mt-2" /></label>;
  return <FacilityDialog title={asset ? 'Edit asset' : 'Add asset'} onClose={onClose} pending={pending}><form onSubmit={submit} className="pb-section"><p className="text-sm text-text-2">Record equipment details in this workspace. Asset labels and dates do not connect a device, vendor or external service.</p>{!asset && !locations.length && <p className="text-sm text-text-2">No authorised locations yet. <Link href="/spaces" className="text-primary underline">Add a facility site in Spaces</Link>, or ask your company administrator to assign a location.</p>}<fieldset disabled={pending} className="m-0 grid gap-4 border-0 p-0">{field('name', 'Asset name', asset?.name ?? '', 'text', 120)}{!asset && <label className="pb-form-label" htmlFor={`${prefix}-site`}>Location<select id={`${prefix}-site`} name="siteId" required className="pb-form-control mt-2"><option value="">Select an authorised location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}</select></label>}{field('category', 'Category', asset?.category ?? 'Power', 'text', 80)}{field('serial', 'Serial number', asset?.serial ?? '', 'text', 100)}{field('locationLabel', 'Location details', asset?.locationLabel ?? '', 'text', 160)}<div className="grid gap-4 sm:grid-cols-2">{field('purchaseDate', 'Purchase date', asset?.purchaseDate ?? '', 'date')}{field('warrantyExpiry', 'Warranty expiry', asset?.warrantyExpiry ?? '', 'date')}</div><label className="pb-form-label" htmlFor={`${prefix}-status`}>Asset status<select id={`${prefix}-status`} name="status" defaultValue={asset?.status ?? 'operational'} className="pb-form-control mt-2">{['operational', 'degraded', 'under_maintenance', 'out_of_service', 'archived'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label></fieldset>{error && <p role="alert" className="text-sm text-tone-danger">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || !asset && !locations.length}>{pending ? 'Saving…' : 'Save asset'}</Button></div></form></FacilityDialog>;
}
