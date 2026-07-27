'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, CloudRain, Sun } from 'lucide-react';
import { TRADE_TONE, seasonOf } from '@/domain/ppm';
import { toneVar } from '@/lib/status-tones';
import type { PpmData, OccView } from './types';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function MaintenanceCalendar({ data, onSelect }: { data: PpmData; onSelect: (id: string) => void }) {
  const nowMs = Date.parse(data.now);
  const nowMonth = new Date(nowMs);
  const [offset, setOffset] = useState(0);

  const year = nowMonth.getUTCFullYear();
  const month = nowMonth.getUTCMonth() + offset;
  const first = new Date(Date.UTC(year, month, 1));
  const monthLabel = first.toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const season = seasonOf(first.toISOString());
  const startDow = (first.getUTCDay() + 6) % 7; // Monday-start
  const gridStart = first.getTime() - startDow * DAY;

  // occurrences + generate-dates indexed by ISO date
  const byDue = new Map<string, OccView[]>();
  const genDates = new Set<string>();
  for (const o of data.occurrences) {
    (byDue.get(o.dueDate) ?? byDue.set(o.dueDate, []).get(o.dueDate)!).push(o);
    genDates.add(o.generateDate);
  }

  const weeks: number[][] = [];
  for (let w = 0; w < 6; w++) weeks.push(Array.from({ length: 7 }, (_, d) => gridStart + (w * 7 + d) * DAY));

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <button onClick={() => setOffset((o) => o - 1)} className="w-7 h-7 rounded-lg border border-border-2 grid place-items-center hover:bg-surface-2"><ChevronLeft size={15} /></button>
        <span className="text-[13.5px] font-semibold w-40 text-center">{monthLabel}</span>
        <button onClick={() => setOffset((o) => o + 1)} className="w-7 h-7 rounded-lg border border-border-2 grid place-items-center hover:bg-surface-2"><ChevronRight size={15} /></button>
        <span className={`ml-2 inline-flex items-center gap-1.5 text-[11.5px] px-2 h-6 rounded-full ${season === 'rainy' ? 'bg-[color:var(--tone-info)]/10 text-info' : 'bg-[color:var(--tone-warn)]/10 text-warning'}`}>
          {season === 'rainy' ? <CloudRain size={12} /> : <Sun size={12} />}{season === 'rainy' ? 'Rainy season' : 'Harmattan'}
        </span>
        <span className="ml-auto flex items-center gap-3 text-[10.5px] text-text-3">
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full border border-text-3" /> generate date</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[color:var(--tone-danger)]" /> overdue</span>
        </span>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border bg-surface-2/50">
        <div className="text-[9px] text-text-3 uppercase tracking-wide px-1 py-1.5 text-center">Load</div>
        {WD.map((d) => <div key={d} className="text-[10px] text-text-3 uppercase tracking-wide px-2 py-1.5">{d}</div>)}
      </div>

      {/* Weeks */}
      <div style={{ background: season === 'rainy' ? 'color-mix(in srgb, var(--tone-info) 3%, transparent)' : 'color-mix(in srgb, var(--tone-warn) 3%, transparent)' }}>
        {weeks.map((week, wi) => {
          const load = week.reduce((sum, ms) => sum + (byDue.get(iso(ms))?.reduce((s, o) => s + o.labourHours, 0) ?? 0), 0);
          const loadPct = Math.round((load / data.weeklyCapacityHours) * 100);
          const loadTone = loadPct > 100 ? 'danger' : loadPct > 85 ? 'warn' : load > 0 ? 'success' : 'muted';
          return (
            <div key={wi} className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border last:border-0 min-h-[92px]">
              {/* Heatmap gutter */}
              <div className="border-r border-border flex flex-col items-center justify-center gap-0.5 p-1" title={`${load}h of ${data.weeklyCapacityHours}h capacity`}>
                {load > 0 ? (
                  <>
                    <div className="w-5 h-5 rounded-md" style={{ background: `color-mix(in srgb, ${toneVar(loadTone)} ${Math.min(100, 25 + loadPct)}%, transparent)` }} />
                    <span className="text-[9px] font-mono" style={{ color: toneVar(loadTone) }}>{load}h</span>
                  </>
                ) : <span className="text-[9px] text-text-3">—</span>}
              </div>
              {week.map((ms) => {
                const d = iso(ms);
                const dt = new Date(ms);
                const inMonth = dt.getUTCMonth() === ((month % 12) + 12) % 12;
                const isToday = d === data.now;
                const occs = byDue.get(d) ?? [];
                return (
                  <div key={d} className={`border-r border-border last:border-0 p-1 ${inMonth ? '' : 'bg-surface-2/40'} ${isToday ? 'ring-2 ring-inset ring-[color:var(--primary)]' : ''}`}>
                    <div className="flex items-center gap-1 px-0.5">
                      <span className={`text-[10.5px] ${inMonth ? 'text-text-2' : 'text-text-3'} ${isToday ? 'font-bold text-primary' : ''}`}>{dt.getUTCDate()}</span>
                      {genDates.has(d) && <span className="w-1.5 h-1.5 rounded-full border border-text-3" title="Work order auto-generates" />}
                      {isToday && <span className="text-[8px] text-primary font-semibold ml-auto">TODAY</span>}
                    </div>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {occs.slice(0, 3).map((o) => {
                        const overdue = o.status === 'overdue';
                        const tone = overdue ? 'danger' : TRADE_TONE[o.category] ?? 'neutral';
                        return (
                          <button key={o.id} onClick={() => onSelect(o.id)} title={`${o.assetName}${o.basisWon === 'runtime' ? ' · runtime-driven' : ''}`}
                            className="text-left text-[9.5px] leading-tight px-1 py-0.5 rounded truncate hover:brightness-105"
                            style={{ background: `color-mix(in srgb, ${toneVar(tone)} 16%, transparent)`, color: toneVar(tone) }}>
                            {o.workOrderRef ? '✓ ' : ''}{o.basisWon === 'runtime' ? '⚡ ' : ''}{shortName(o.assetName)}
                          </button>
                        );
                      })}
                      {occs.length > 3 && <span className="text-[9px] text-text-3 px-1">+{occs.length - 3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)/, '').replace(/ — /, ' ');
}
