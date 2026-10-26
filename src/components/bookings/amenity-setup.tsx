'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Plus, Pencil, Archive, X, Building2 } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, IconButton, StatusPill } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { createEstateAmenity, updateEstateAmenity, archiveEstateAmenity, createEstateAmenityBooking } from '@/server/actions/estate-amenity-setup';
import { watMinutes, type EstateAmenity } from '@/domain/estate/amenities';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './amenity-setup.module.css';

export type AmenityTarget = { id: string; name: string };
export type AmenityResidentTarget = { id: string; name: string; siteId: string; unitId: string; unitLabel: string };
const cash = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(minor / 100);
const RULES = { manual: 'Manager approval', off_peak: 'Weekdays before 5pm WAT', always: 'Configured automatic approval' };
function minutes(value: string, closing = false) { const [hour, minute] = value.split(':').map(Number); const total = hour * 60 + minute; return closing && total === 0 ? 1440 : total; }
function ModalHeader({ title, pending, close }: { title: string; pending: boolean; close: () => void }) { return <header className={layout.dialogHeader}><h2 className={layout.dialogTitle}>{title}</h2><IconButton type="button" aria-label={`Close ${title.toLowerCase()}`} disabled={pending} onClick={close}><X size={18} /></IconButton></header>; }

export function EstateAmenitySetup({ amenities, sites, canManage, expectedCompanyId }: { amenities: EstateAmenity[]; sites: AmenityTarget[]; canManage: boolean; expectedCompanyId: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<EstateAmenity | 'new' | null>(null);
  const [archive, setArchive] = useState<EstateAmenity | null>(null);
  const [message, setMessage] = useState('');
  return <div className={styles.stack}>
    <div className={styles.header}><p className={styles.description}>Configure shared spaces for each estate property. Existing bookings retain their recorded fee and time interval.</p>{canManage && <Button variant="primary" icon={<Plus size={16} />} disabled={!sites.length} onClick={() => setEdit('new')}>Add amenity</Button>}</div>
    <Card padded={false}><div className={layout.registerHeader}><CardHeader title="Amenity register" subtitle={`${amenities.filter((row) => row.status === 'active').length} active · ${amenities.filter((row) => row.status === 'archived').length} archived`} /></div>
      {amenities.length ? <div className="pb-table-scroll"><table className={`pb-data-table ${layout.table}`} aria-label="Configured amenities"><thead><tr>{['Amenity', 'Property', 'Capacity', 'Hours · WAT', 'Slot length', 'Recorded fee', 'Approval', 'Status', 'Actions'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{amenities.map((row) => <tr key={row.id}><td>{row.name}</td><td>{sites.find((site) => site.id === row.siteId)?.name ?? 'Authorised property'}</td><td>{row.capacity} simultaneous booking{row.capacity === 1 ? '' : 's'}</td><td>{watMinutes(row.openMinute)}–{watMinutes(row.closeMinute)}</td><td>{row.durationMinutes} minutes</td><td>{cash(row.feeMinor)}</td><td>{RULES[row.autoApprove]}</td><td><StatusPill status={row.status === 'active' ? 'Active' : 'Archived'} tone={row.status === 'active' ? 'success' : 'muted'} /></td><td>{canManage && row.status === 'active' ? <div className={styles.actions}><Button icon={<Pencil size={14} />} aria-label={`Edit amenity ${row.name}`} onClick={() => setEdit(row)}>Edit</Button><Button icon={<Archive size={14} />} aria-label={`Archive amenity ${row.name}`} onClick={() => setArchive(row)}>Archive</Button></div> : '—'}</td></tr>)}</tbody></table></div> : <EmptyState icon={<Building2 size={24} />} title="No amenities configured" description={sites.length ? 'Add your first amenity to open a reservable shared space.' : 'Create an estate property before configuring its amenities.'} />}
    </Card>
    {message && <p role="status" className={layout.feedback}>{message}</p>}
    {edit && <AmenityDialog row={edit === 'new' ? undefined : edit} sites={sites} expectedCompanyId={expectedCompanyId} onClose={() => setEdit(null)} onDone={(text) => { setEdit(null); setMessage(text); router.refresh(); }} />}
    {archive && <ArchiveDialog row={archive} expectedCompanyId={expectedCompanyId} onClose={() => setArchive(null)} onDone={() => { setArchive(null); setMessage('Amenity archived. Its previous booking records remain saved.'); router.refresh(); }} />}
  </div>;
}

function AmenityDialog({ row, sites, expectedCompanyId, onClose, onDone }: { row?: EstateAmenity; sites: AmenityTarget[]; expectedCompanyId: string; onClose: () => void; onDone: (message: string) => void }) {
  const [pending, start] = useTransition(), [error, setError] = useState('');
  const inFlight = useRef(false), key = useRef(crypto.randomUUID());
  const title = row ? 'Edit amenity' : 'Add amenity';
  function submit(form: HTMLFormElement) {
    if (inFlight.current) return; inFlight.current = true; setError(''); const data = new FormData(form);
    start(async () => { try {
      const fields = { name: String(data.get('name') ?? ''), capacity: Number(data.get('capacity')), feeMajor: String(data.get('feeMajor') ?? ''), autoApprove: String(data.get('autoApprove')), openMinute: minutes(String(data.get('opens'))), closeMinute: minutes(String(data.get('closes')), true), durationMinutes: Number(data.get('durationMinutes')), expectedCompanyId, idempotencyKey: key.current };
      const result = row ? await updateEstateAmenity({ ...fields, id: row.id, revision: row.revision }) : await createEstateAmenity({ ...fields, siteId: String(data.get('siteId')) });
      if (!result.ok) { setError(result.error); return; } onDone(row ? 'Amenity changes saved. Existing bookings retain their recorded terms.' : 'Amenity created. You can now record resident reservations.');
    } catch { setError('The amenity could not be saved. Reopen the form if your company or access changed.'); } finally { inFlight.current = false; } });
  }
  return <PortalDialog label={title} onClose={onClose} canClose={!pending} width={640}><div className={layout.modal}><ModalHeader title={title} pending={pending} close={onClose} /><form className={`${layout.dialogBody} ${styles.form}`} onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}><fieldset disabled={pending} className={styles.fields}>
    {!row && <label className={`${styles.field} ${styles.wide}`}>Estate property<select name="siteId" required defaultValue=""><option value="" disabled>Choose property</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>}
    <label className={`${styles.field} ${styles.wide}`}>Amenity name<input name="name" required minLength={2} maxLength={100} defaultValue={row?.name} /></label>
    <label className={styles.field}>Simultaneous booking capacity<input name="capacity" type="number" min={1} max={500} step={1} required defaultValue={row?.capacity ?? 1} /></label>
    <label className={styles.field}>Fee per reservation (₦)<input name="feeMajor" type="text" inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?" required defaultValue={((row?.feeMinor ?? 0) / 100).toFixed(2)} /></label>
    <label className={styles.field}>Opening time · WAT<input name="opens" type="time" required defaultValue={watMinutes(row?.openMinute ?? 480)} /></label>
    <label className={styles.field}>Closing time · WAT<input name="closes" type="time" required defaultValue={row?.closeMinute === 1440 ? '00:00' : watMinutes(row?.closeMinute ?? 1320)} /></label>
    <label className={styles.field}>Reservation length (minutes)<input name="durationMinutes" type="number" min={15} max={720} step={1} required defaultValue={row?.durationMinutes ?? 120} /></label>
    <label className={styles.field}>Approval rule<select name="autoApprove" defaultValue={row?.autoApprove ?? 'manual'}><option value="manual">Manager approval</option><option value="off_peak">Weekdays before 5pm WAT</option><option value="always">Configured automatic approval</option></select></label>
  </fieldset><p className={styles.description}>Capacity counts concurrent reservations. Closing time 00:00 means midnight. Fees are recorded amounts; saving an amenity does not collect payment.</p>{error && <p role="alert" className={layout.feedback}>{error}</p>}<div className={layout.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : row ? 'Save amenity' : 'Create amenity'}</Button></div></form></div></PortalDialog>;
}

function ArchiveDialog({ row, expectedCompanyId, onClose, onDone }: { row: EstateAmenity; expectedCompanyId: string; onClose: () => void; onDone: () => void }) {
  const [pending, start] = useTransition(), [error, setError] = useState(''); const inFlight = useRef(false), key = useRef(crypto.randomUUID());
  const submit = () => { if (inFlight.current) return; inFlight.current = true; start(async () => { try { const result = await archiveEstateAmenity({ id: row.id, revision: row.revision, expectedCompanyId, idempotencyKey: key.current }); if (!result.ok) { setError(result.error); return; } onDone(); } catch { setError('Archiving failed. Refresh and try again.'); } finally { inFlight.current = false; } }); };
  return <PortalDialog label="Archive amenity" onClose={onClose} canClose={!pending}><div className={layout.modal}><ModalHeader title="Archive amenity" pending={pending} close={onClose} /><div className={layout.dialogBody}><p className={styles.description}>Archive {row.name}? Previous reservations remain saved. Future active reservations must be cancelled or completed first.</p>{error && <p role="alert" className={layout.feedback}>{error}</p>}<div className={layout.actions}><Button disabled={pending} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={pending} onClick={submit}>{pending ? 'Saving…' : 'Confirm archive'}</Button></div></div></div></PortalDialog>;
}

export function EstateAmenityBookingControl({ amenities, residents, expectedCompanyId, canManage }: { amenities: EstateAmenity[]; residents: AmenityResidentTarget[]; expectedCompanyId: string; canManage: boolean }) {
  const router = useRouter(); const [open, setOpen] = useState(false), [message, setMessage] = useState('');
  const active = amenities.filter((row) => row.status === 'active');
  if (!canManage) return null;
  return <div className={styles.bookingControl}><Button variant="primary" icon={<CalendarPlus size={16} />} disabled={!active.length || !residents.length} onClick={() => setOpen(true)}>New booking</Button>{(!active.length || !residents.length) && <p className={styles.description}>Configure an amenity and add a resident linked to its property before recording a booking.</p>}{message && <p role="status" className={layout.feedback}>{message}</p>}{open && <ManagerBookingDialog amenities={active} residents={residents} expectedCompanyId={expectedCompanyId} onClose={() => setOpen(false)} onDone={() => { setOpen(false); setMessage('Reservation recorded. No payment was collected.'); router.refresh(); }} />}</div>;
}
function ManagerBookingDialog({ amenities, residents, expectedCompanyId, onClose, onDone }: { amenities: EstateAmenity[]; residents: AmenityResidentTarget[]; expectedCompanyId: string; onClose: () => void; onDone: () => void }) {
  const [amenityId, setAmenityId] = useState(amenities[0]?.id ?? ''), [pending, start] = useTransition(), [error, setError] = useState('');
  const inFlight = useRef(false), key = useRef(crypto.randomUUID()); const selected = amenities.find((row) => row.id === amenityId);
  function submit(form: HTMLFormElement) { if (inFlight.current) return; const data = new FormData(form); inFlight.current = true; setError(''); start(async () => { try { const slotISO = new Date(`${String(data.get('slot'))}:00+01:00`).toISOString(); const result = await createEstateAmenityBooking({ amenityId, residentId: String(data.get('residentId')), expectedUnitId: residents.find((row) => row.id === String(data.get('residentId')))?.unitId ?? '', slotISO, expectedCompanyId, idempotencyKey: key.current }); if (!result.ok) { setError(result.error); return; } onDone(); } catch { setError('The reservation could not be saved. Check the date and reopen the form if your company changed.'); } finally { inFlight.current = false; } }); }
  return <PortalDialog label="New amenity booking" onClose={onClose} canClose={!pending} width={620}><div className={layout.modal}><ModalHeader title="New amenity booking" pending={pending} close={onClose} /><form className={`${layout.dialogBody} ${styles.form}`} onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}><fieldset disabled={pending} className={styles.fields}><label className={`${styles.field} ${styles.wide}`}>Amenity<select value={amenityId} onChange={(event) => setAmenityId(event.target.value)}>{amenities.map((row) => <option key={row.id} value={row.id}>{row.name} · {cash(row.feeMinor)}</option>)}</select></label><label className={`${styles.field} ${styles.wide}`}>Resident and unit<select name="residentId" key={amenityId} required defaultValue=""><option value="" disabled>Choose resident</option>{residents.filter((row) => row.siteId === selected?.siteId).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.unitLabel}</option>)}</select></label><label className={`${styles.field} ${styles.wide}`}>Start date and time · WAT<input name="slot" type="datetime-local" required /></label></fieldset>{selected && <p className={styles.description}>{selected.durationMinutes}-minute reservation · {watMinutes(selected.openMinute)}–{watMinutes(selected.closeMinute)} WAT · {RULES[selected.autoApprove]}. Capacity is checked when saving. Fees remain booking records until verified payment is connected.</p>}{error && <p role="alert" className={layout.feedback}>{error}</p>}<div className={layout.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Record booking'}</Button></div></form></div></PortalDialog>;
}
