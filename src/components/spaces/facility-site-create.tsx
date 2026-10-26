'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { createFacilitySite } from '@/server/actions/facility-site-setup';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './facility-site-create.module.css';

export function FacilitySiteCreate({ companyId, canCreate }: { companyId: string; canCreate: boolean }) {
  const [open, setOpen] = useState(false), [message, setMessage] = useState('');
  if (!canCreate) return null;
  return <div className={styles.stack}><Button variant="primary" icon={<Plus size={16} />} onClick={() => { setMessage(''); setOpen(true); }}>Add facility site</Button>{message && <p role="status" className={layout.metadata}>{message}</p>}{open && <FacilitySiteForm expectedCompanyId={companyId} onClose={() => setOpen(false)} onSaved={(value) => { setMessage(value); setOpen(false); }} />}</div>;
}

export function FacilitySiteForm({ expectedCompanyId, onClose, onSaved }: { expectedCompanyId: string; onClose: () => void; onSaved: (message: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState(''), [address, setAddress] = useState(''), [error, setError] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID()), [pending, start] = useTransition();
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending) return; setError('');
    start(async () => { try {
      const result = await createFacilitySite({ expectedCompanyId, idempotencyKey, name, address });
      if (!result.ok) { setError(result.error); return; }
      onSaved(result.message); router.refresh();
    } catch { setError('The save could not be confirmed. Your entries are still here; reopen Spaces before retrying.'); } });
  }
  return <FacilityDialog title="Add facility site" onClose={onClose} pending={pending}><form onSubmit={submit} className={styles.stack}><p className={layout.body}>Add a location your company operates. This creates an empty facility site; buildings, units and equipment are not invented.</p><fieldset className={styles.fields} disabled={pending}><label className={layout.field}>Facility site name<input required autoComplete="off" minLength={2} maxLength={160} className={layout.control} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Victoria Island operations centre" /></label><label className={layout.field}>Address<textarea required autoComplete="street-address" minLength={2} maxLength={500} className={layout.control} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, city, state and country" /></label></fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={layout.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Creating…' : 'Create facility site'}</Button></div></form></FacilityDialog>;
}
