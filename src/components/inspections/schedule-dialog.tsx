'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { complianceState } from '@/domain/inspections';
import { scheduleInspection } from '@/server/actions/inspections';
import type { ObView } from './types';

export function ScheduleDialog({ obligations, preselect, now, onClose }: { obligations: ObView[]; preselect?: string; now: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [obligationId, setObligationId] = useState(preselect ?? obligations[0]?.id ?? '');
  const [date, setDate] = useState(now);
  const [inspector, setInspector] = useState('');

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await scheduleInspection({ obligationId, date, inspector });
      if (!r.ok) setError(r.error);
      else { onClose(); router.refresh(); }
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)]" onClick={onClose} />
      <div className="relative w-full max-w-[420px] bg-surface border border-border rounded-2xl shadow-float p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold">Schedule inspection</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-surface-2"><X size={16} /></button>
        </div>

        <label className="block mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Obligation</span>
          <select value={obligationId} onChange={(e) => setObligationId(e.target.value)} className="mt-1 w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary">
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>{o.name} — {o.scopeLabel} ({complianceState(o.validUntil)})</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Inspector</span>
            <input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="e.g. Emeka / a vendor" className="mt-1 w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" />
          </label>
        </div>

        <p className="text-[11.5px] text-text-3 mb-3">A checklist is created from the obligation’s template — you run it and record pass/fail per item, and failures raise work orders.</p>

        <div className="flex items-center gap-2 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={pending || !obligationId}>Schedule</Button>
        </div>
        {error && <p className="text-[12px] text-negative mt-2">{error}</p>}
      </div>
    </div>
  );
}
