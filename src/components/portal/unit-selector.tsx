'use client';

/** Active-unit selector (PRD §5.1). Switching re-scopes the whole home to the
 *  chosen unit. Disabled for single-unit residents (PRD §7 edge case). */

import { useTransition } from 'react';
import { ChevronDown, Home } from 'lucide-react';
import { setActiveUnit } from '@/server/actions/resident-home';

export type UnitOption = { id: string; label: string };

export function UnitSelector({ units, activeId }: { units: UnitOption[]; activeId: string }) {
  const [pending, start] = useTransition();
  const single = units.length <= 1;

  return (
    <div className={`inline-flex items-center gap-2 min-h-10 pl-3 pr-2 rounded-[10px] border border-border bg-surface ${pending ? 'opacity-60' : ''}`}>
      <Home size={15} className="text-primary flex-none" />
      {single ? (
        <span className="text-[14px] font-semibold">{units[0]?.label ?? '—'}</span>
      ) : (
        <div className="relative inline-flex items-center">
          <select
            aria-label="Active unit"
            value={activeId}
            disabled={pending}
            onChange={(e) => start(() => setActiveUnit(e.target.value))}
            className="appearance-none bg-transparent pr-5 text-[14px] font-medium outline-none cursor-pointer"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-0 pointer-events-none text-text-3" />
        </div>
      )}
    </div>
  );
}
