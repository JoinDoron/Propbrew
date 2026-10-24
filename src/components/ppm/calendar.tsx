'use client';

import { useId, useState } from 'react';
import facilityStyles from '@/components/facility/facility-workspaces.module.css';
import styles from './maintenance-clinexa.module.css';
import { Button, Card, IconButton, StatusPill } from '@/components/ui';
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
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set());
  const calendarId = useId();

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
    <div className={facilityStyles.calendarScroll} role="region" aria-label="Maintenance calendar, scroll horizontally for all days" tabIndex={0}><Card padded={false} className={facilityStyles.calendarCanvas}>
      {/* Header */}
      <div className={styles.calendarToolbar}>
        <div className={styles.inline}>
          <IconButton aria-label="Previous maintenance month" onClick={() => setOffset((o) => o - 1)}><ChevronLeft size={18} /></IconButton>
          <h3 className={`${styles.heading} ${styles.month}`}>{monthLabel}</h3>
          <IconButton aria-label="Next maintenance month" onClick={() => setOffset((o) => o + 1)}><ChevronRight size={18} /></IconButton>
        </div>
        <div className={styles.inline}>{season === 'rainy' ? <CloudRain size={16} className="text-info" /> : <Sun size={16} className="text-warning" />}<StatusPill status={season === 'rainy' ? 'Rainy season' : 'Harmattan'} tone={season === 'rainy' ? 'info' : 'warn'} /></div>
        <span className={`${styles.inline} ${styles.metadata}`}>
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full border border-text-3" /> generate date</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[color:var(--tone-danger)]" /> overdue</span>
        </span>
      </div>

      {/* Weekday header */}
      <div className={styles.calendarWeekdays}>
        <div>Load</div>
        {WD.map((d) => <div key={d}>{d}</div>)}
      </div>

      {/* Weeks */}
      <div style={{ background: season === 'rainy' ? 'color-mix(in srgb, var(--tone-info) 3%, transparent)' : 'color-mix(in srgb, var(--tone-warn) 3%, transparent)' }}>
        {weeks.map((week, wi) => {
          const load = week.reduce((sum, ms) => sum + (byDue.get(iso(ms))?.reduce((s, o) => s + o.labourHours, 0) ?? 0), 0);
          const loadPct = Math.round((load / data.weeklyCapacityHours) * 100);
          const loadTone = loadPct > 100 ? 'danger' : loadPct > 85 ? 'warn' : load > 0 ? 'success' : 'muted';
          return (
            <div key={wi} className={styles.calendarWeek}>
              {/* Heatmap gutter */}
              <div className={styles.calendarLoad} title={`${load}h of ${data.weeklyCapacityHours}h capacity`}>
                {load > 0 ? (
                  <>
                    <div className="w-5 h-5 rounded-md" style={{ background: `color-mix(in srgb, ${toneVar(loadTone)} ${Math.min(100, 25 + loadPct)}%, transparent)` }} />
                    <span className="text-[12px] font-mono" style={{ color: toneVar(loadTone) }}>{load}h</span>
                  </>
                ) : <span className="text-[12px] text-text-3">—</span>}
              </div>
              {week.map((ms) => {
                const d = iso(ms);
                const dt = new Date(ms);
                const inMonth = dt.getUTCMonth() === ((month % 12) + 12) % 12;
                const isToday = d === data.now;
                const occs = byDue.get(d) ?? [];
                return (
                  <div key={d} className={`${styles.calendarDay} ${inMonth ? '' : styles.outsideMonth} ${isToday ? styles.today : ''}`}>
                    <div className={styles.dayLabel}>
                      <span className={inMonth ? '' : 'text-text-3'}>{dt.getUTCDate()}</span>
                      {genDates.has(d) && <span className="w-1.5 h-1.5 rounded-full border border-text-3" title="Work order auto-generates" />}
                      {isToday && <span className={styles.todayLabel}>Today</span>}
                    </div>
                    <CalendarDayEvents id={`${calendarId}-events-${d}`} date={d} occurrences={occs} expanded={expandedDates.has(d)} onSelect={onSelect}
                      onToggle={() => setExpandedDates((previous) => {
                        const next = new Set(previous);
                        if (next.has(d)) next.delete(d); else next.add(d);
                        return next;
                      })} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card></div>
  );
}

/** Controlled presentation keeps expansion local to the calendar, never a record action. */
export function CalendarDayEvents({ id, date, occurrences, expanded, onSelect, onToggle }: {
  id: string;
  date: string;
  occurrences: OccView[];
  expanded: boolean;
  onSelect: (id: string) => void;
  onToggle: () => void;
}) {
  const visible = expanded ? occurrences : occurrences.slice(0, 3);
  return (
    <div className={styles.events}>
      <div id={id} className={styles.dayEvents}>
        {visible.map((o) => {
          const overdue = o.status === 'overdue';
          const tone = overdue ? 'danger' : TRADE_TONE[o.category] ?? 'neutral';
          return (
            <button key={o.id} type="button" onClick={() => onSelect(o.id)} title={`${o.assetName}${o.basisWon === 'runtime' ? ' · runtime-driven' : ''}`}
              aria-label={`${o.assetName}, due ${o.dueDate}, ${o.status.replaceAll('_', ' ')}`} className={styles.event}
              style={{ background: `color-mix(in srgb, ${toneVar(tone)} 16%, transparent)`, color: toneVar(tone) }}>
              {o.workOrderRef ? '✓ ' : ''}{o.basisWon === 'runtime' ? '⚡ ' : ''}{shortName(o.assetName)}
            </button>
          );
        })}
      </div>
      {occurrences.length > 3 && <Button type="button" className={styles.dayToggle} aria-expanded={expanded} aria-controls={id}
        aria-label={expanded ? `Show fewer maintenance events for ${date}` : `Show all ${occurrences.length} maintenance events for ${date}`} onClick={onToggle}>
        {expanded ? 'Show less' : `Show all ${occurrences.length}`}
      </Button>}
    </div>
  );
}

function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)/, '').replace(/ — /, ' ');
}
