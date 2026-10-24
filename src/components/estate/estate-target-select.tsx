'use client';

import { useId } from 'react';
import type { EstateTargetOption } from '@/domain/estate/targets';

export function EstateTargetSelect({ options, value, onChange, disabled = false }: { options: readonly EstateTargetOption[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const id = useId();
  return <div><label className="pb-form-label" htmlFor={id}>Estate property</label><select id={id} className="pb-form-control" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || !options.length} required>
    <option value="">Choose an estate property</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>{!options.length && <p className="text-[12px] text-text-3">No authorised estate properties are available for this action.</p>}</div>;
}
