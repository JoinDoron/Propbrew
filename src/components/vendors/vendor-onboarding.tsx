'use client';

import { useId, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { createFacilityVendor } from '@/server/actions/facility-vendors';
import layout from '@/components/ui/workspace-layout.module.css';

export function VendorOnboarding({ expectedCompanyId }: { expectedCompanyId: string }) {
  const router = useRouter(), prefix = useId();
  const [open, setOpen] = useState(false), [pending, start] = useTransition(), [error, setError] = useState('');
  function submit(form: FormData) {
    if (pending) return;
    setError('');
    start(async () => {
      try {
        const result = await createFacilityVendor({ expectedCompanyId, name: String(form.get('name') ?? ''), services: String(form.get('services') ?? '').split(',').map((value) => value.trim()).filter(Boolean), coverage: String(form.get('coverage') ?? ''), insuranceExpiry: String(form.get('insuranceExpiry') ?? '') });
        if (!result.ok) { setError(result.error); return; }
        setOpen(false); router.refresh();
      } catch { setError('The vendor could not be saved. Check your connection and try once more.'); }
    });
  }
  return <><Button variant="primary" onClick={() => setOpen(true)} icon={<Plus size={15} />}>Onboard vendor</Button>{open ? <FacilityDialog title="Onboard vendor" pending={pending} onClose={() => setOpen(false)}><form action={submit} className={layout.stack}><p className={layout.body}>Create the contractor organisation first. Vendor users can then be invited and bound to this organisation from Team &amp; access.</p><fieldset disabled={pending} className={layout.grid}><label className={layout.field} htmlFor={`${prefix}-name`}><span className={layout.label}>Registered / trading name</span><input id={`${prefix}-name`} name="name" required maxLength={120} className={layout.control} autoComplete="organization" /></label><label className={layout.field} htmlFor={`${prefix}-services`}><span className={layout.label}>Services</span><input id={`${prefix}-services`} name="services" required maxLength={500} className={layout.control} placeholder="Electrical, HVAC, plumbing" /><span className={layout.metadata}>Separate services with commas.</span></label><label className={layout.field} htmlFor={`${prefix}-coverage`}><span className={layout.label}>Service coverage</span><input id={`${prefix}-coverage`} name="coverage" required maxLength={160} className={layout.control} placeholder="Lagos mainland and island" /></label><label className={layout.field} htmlFor={`${prefix}-expiry`}><span className={layout.label}>Insurance expiry</span><input id={`${prefix}-expiry`} name="insuranceExpiry" type="date" required className={layout.control} /></label></fieldset><p className={layout.metadata}>An expired policy stays visible but cannot receive new work until its compliance record is current.</p>{error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}<div className={layout.actions}><Button type="button" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving vendor…' : 'Save vendor'}</Button></div></form></FacilityDialog> : null}</>;
}
