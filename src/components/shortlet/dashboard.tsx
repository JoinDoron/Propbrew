import { Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import shortletStyles from './shortlet-reference.module.css';
import styles from './shortlet-commercial-polish.module.css';
import { shortletMoney as naira } from './shortlet-format';
import { ShortletMetric } from './reference-ui';
import Link from 'next/link';
import { TrendingUp, Percent, CalendarCheck, Wallet, PlaneLanding, PlaneTakeoff, BedDouble, Sparkles, AlertTriangle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';

export type Kpi = { revenueMinor: number; profitMinor: number; occupancyPct: number; bookings: number; cautionHeldMinor: number };
export type Move = { ref: string; guest: string; apt: string; source: string };
export type CalRow = { apt: string; property: string; cells: ({ guest: string; tone: Tone; span: number } | null)[] };
export type MonthBar = { label: string; revenueMinor: number; expenseMinor: number; profitMinor: number };
export type Attn = { kind: 'inspect' | 'turnover' | 'balance' | 'enquiry'; title: string; sub: string; href: string };

const ATTN_META: Record<Attn['kind'], { icon: React.ReactNode; tone: Tone }> = {
  inspect: { icon: <ShieldCheck size={15} />, tone: 'warn' },
  turnover: { icon: <AlertTriangle size={15} />, tone: 'danger' },
  balance: { icon: <Wallet size={15} />, tone: 'progress' },
  enquiry: { icon: <Sparkles size={15} />, tone: 'info' },
};

export function ShortletDashboard({ kpis, monthLabel, arrivals, departures, staying, calendar, days, revExp, attention }: {
  kpis: Kpi; monthLabel: string; arrivals: Move[]; departures: Move[]; staying: Move[];
  calendar: CalRow[]; days: string[]; revExp: MonthBar[]; attention: Attn[];
}) {
  const maxBar = Math.max(...revExp.map((m) => Math.max(m.revenueMinor, m.expenseMinor)), 1);
  const latestMonths = revExp.slice(-6);
  const activityRows = [
    ...arrivals.map((move) => ({ ...move, activity: 'Arrival', tone: 'info' as const, icon: <PlaneLanding size={16} aria-hidden="true" /> })),
    ...departures.map((move) => ({ ...move, activity: 'Departure', tone: 'warn' as const, icon: <PlaneTakeoff size={16} aria-hidden="true" /> })),
    ...staying.map((move) => ({ ...move, activity: 'In house', tone: 'success' as const, icon: <BedDouble size={16} aria-hidden="true" /> })),
  ];
  const occupiedDots = Math.round(Math.max(0, Math.min(100, kpis.occupancyPct)) / 100 * 40);
  return (
    <div className={`pb-section ${shortletStyles.workspace}`}>

      <PageTabs label="Shortlet overview sections" items={[
        {
          id: "overview", label: "Overview", content: <div className={styles.stack}>
            <p className={styles.metadata}>{monthLabel} recorded snapshot · WAT · NGN only. Revenue is recorded accommodation value, not verified bank settlement. Profit excludes unrecorded costs; caution is a recorded liability, not available income.</p>
            <div className={styles.metrics}>
              <ShortletMetric label="Recorded revenue" value={naira(kpis.revenueMinor)} icon={<TrendingUp size={18} />} />
              <ShortletMetric label="Recorded profit" value={naira(kpis.profitMinor)} icon={<Wallet size={18} />} />
              <ShortletMetric label="Occupancy" value={`${kpis.occupancyPct}%`} icon={<Percent size={18} />} />
              <ShortletMetric label="Bookings" value={String(kpis.bookings)} icon={<CalendarCheck size={18} />} />
              <ShortletMetric label="Caution recorded as held" value={naira(kpis.cautionHeldMinor)} icon={<ShieldCheck size={18} />} />
            </div>
            <div className={styles.analyticsGrid}>
              <Card padded={false} className={styles.card}>
                <div className={styles.header}><CardHeader title="Commercial performance" subtitle="Recorded revenue and expenses across the latest available months" action={<Link href="/shortlet/analytics" className={styles.link}>Analytics <ArrowUpRight aria-hidden="true" size={16} /></Link>} /></div>
                <div className={styles.insightBody}>
                  <div className={styles.insightValue}><strong>{naira(kpis.revenueMinor)}</strong><span>recorded revenue in {monthLabel}</span></div>
                  {latestMonths.length ? <div className={styles.overviewBars} role="img" aria-label={latestMonths.map((month) => `${month.label}: revenue ${naira(month.revenueMinor)}, expenses ${naira(month.expenseMinor)}`).join('; ')}>{latestMonths.map((month) => <div key={month.label}><span className={styles.barPair}><i style={{ height: `${month.revenueMinor / maxBar * 100}%`, background: toneVar('success') }} /><i style={{ height: `${month.expenseMinor / maxBar * 100}%`, background: toneVar('danger') }} /></span><small>{month.label}</small></div>)}</div> : <p className={styles.metadata}>No monthly finance history is recorded yet.</p>}
                  <div className={styles.legend}><span><i style={{ background: toneVar('success') }} />Revenue</span><span><i style={{ background: toneVar('danger') }} />Expenses</span></div>
                </div>
              </Card>
              <Card padded={false} className={styles.card}>
                <div className={styles.header}><CardHeader title="Occupancy pulse" subtitle="A proportional view of the recorded occupancy rate" action={<StatusPill status={`${kpis.occupancyPct}% occupied`} tone={kpis.occupancyPct >= 70 ? 'success' : kpis.occupancyPct >= 45 ? 'warn' : 'info'} />} /></div>
                <div className={styles.insightBody}>
                  <div className={styles.insightValue}><strong>{kpis.occupancyPct}%</strong><span>{kpis.bookings} recorded booking{kpis.bookings === 1 ? '' : 's'} in this snapshot</span></div>
                  <div className={styles.dotMatrix} role="img" aria-label={`${kpis.occupancyPct}% recorded occupancy, represented proportionally across 40 markers`}>{Array.from({ length: 40 }, (_, index) => <span key={index} data-filled={index < occupiedDots ? 'true' : undefined} />)}</div>
                  <p className={styles.metadata}>Markers summarise the recorded rate; they are not a live channel availability calendar.</p>
                </div>
              </Card>
            </div>
            <Card padded={false} className={styles.card}>
              <div className={styles.header}><CardHeader title="Live activity" subtitle="Today’s recorded guest movement and in-house register" action={<Link href="/shortlet/calendar" className={styles.link}>Open calendar <ArrowUpRight aria-hidden="true" size={16} /></Link>} /></div>
              {activityRows.length ? <ul className={styles.activityList}>{activityRows.map((row, index) => <li key={`${row.activity}-${row.ref}-${index}`}>
                <span className={styles.activityIcon} style={{ color: toneVar(row.tone), background: `color-mix(in srgb, ${toneVar(row.tone)} 12%, var(--surface))` }}>{row.icon}</span>
                <div className={styles.activityCopy}><strong>{row.guest}</strong><span>{row.apt} · {row.ref} · {row.source || 'Source not recorded'}</span></div>
                <StatusPill status={row.activity} tone={row.tone} />
              </li>)}</ul> : <div className={styles.body}><EmptyState title="No guest movement recorded" description="No arrivals, departures or in-house stays are present in this snapshot." /></div>}
            </Card>
          </div>
        },
        {
          id: "availability", label: "Availability", content: <div className={styles.stack}>
            <Card padded={false} className={styles.card}>
              <div className={styles.header}><CardHeader title="Next 7 nights" subtitle={`${monthLabel} · recorded stays, not live channel availability`} action={<Link href="/shortlet/calendar" className={styles.link}>Full calendar <ArrowUpRight aria-hidden="true" size={16} /></Link>} /></div>
              {calendar.length && days.length ? <div className={styles.scroll} role="region" aria-label="Next seven nights apartment occupancy calendar" tabIndex={0}>
                <div style={{ minWidth: 180 + days.length * 64 }}>
                  <div className={styles.calendarHeader} style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(64px, 1fr))` }}>
                    <span>Apartment / property</span>
                    {days.map((d) => <span key={d} className="text-[12px] text-text-3 text-center">{d}</span>)}
                  </div>
                  {calendar.map((row) => (
                    <div key={row.apt} className={styles.calendarRow} style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(64px, 1fr))` }}>
                      <div><div className={styles.rowTitle}>{row.apt}</div><div className={styles.metadata}>{row.property}</div></div>
                      {renderCells(row.cells)}
                    </div>
                  ))}
                </div>
              </div> : <div className={styles.body}><EmptyState title="No occupancy calendar records" description="Recorded apartment stays appear when the selected scope contains booking dates." /></div>}
              <p className={`${styles.metadata} ${styles.body}`}>A dash means no booking is recorded in this snapshot; it does not guarantee availability.</p>
            </Card>
          </div>
        },
        {
          id: "attention", label: "Needs attention", content: <div className={styles.stack}>
            <Card padded={false} className={styles.card}>
              <div className={styles.header}><CardHeader title="Needs attention" subtitle={`${attention.length} recorded items · operational guidance, not live monitoring`} /></div>
              {attention.length === 0 ? (
                <div className={styles.body}><EmptyState title="No attention items recorded" description="No matching alerts are present in this snapshot. This does not replace operational checks." /></div>
              ) : (
                <div className="divide-y divide-border">
                  {attention.map((a, i) => {
                    const m = ATTN_META[a.kind];
                    return (
                      <Link key={i} href={a.href} className={styles.attention}>
                        <span aria-hidden="true" className={styles.icon} style={{ background: `color-mix(in srgb, ${toneVar(m.tone)} 14%, transparent)`, color: toneVar(m.tone) }}>{m.icon}</span>
                        <div><div className={styles.rowTitle}>{a.title}</div><div className={styles.metadata}>{a.sub}</div></div><ArrowUpRight aria-hidden="true" size={16} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        },
        {
          id: "revenue", label: "Revenue & expenses", content: <div className={styles.stack}>
            <Card padded={false} className={styles.card}>
              <div className={styles.header}><CardHeader title="Revenue vs expenses" subtitle="Recorded monthly values · NGN · not reconciled settlements" action={<Link href="/shortlet/analytics" className={styles.link}>Analytics <ArrowUpRight aria-hidden="true" size={16} /></Link>} /></div>
              <div className={styles.body}>{revExp.length ? <>
              <div className={styles.scroll} role="region" aria-label="Monthly revenue and expenses chart, horizontally scrollable" tabIndex={0}><div className={styles.chart} role="img" aria-label={revExp.map((month) => `${month.label}: revenue ${naira(month.revenueMinor)}, expenses ${naira(month.expenseMinor)}, profit ${naira(month.profitMinor)}`).join('; ')}>
                {revExp.map((m) => (
                  <div key={m.label} className={styles.chartMonth}>
                    <div className={styles.chartBars}>
                      <div className="w-1/2 rounded-t" style={{ height: `${(m.revenueMinor / maxBar) * 100}%`, background: toneVar('success') }} title={`Revenue ${naira(m.revenueMinor)}`} />
                      <div className="w-1/2 rounded-t" style={{ height: `${(m.expenseMinor / maxBar) * 100}%`, background: toneVar('danger') }} title={`Expense ${naira(m.expenseMinor)}`} />
                    </div>
                    <span className="text-[12px] text-text-3">{m.label}</span>
                  </div>
                ))}
              </div></div>
              <div className={styles.legend}>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: toneVar('success') }} /> Revenue</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: toneVar('danger') }} /> Expenses</span>
              </div>
              <div className={styles.scroll} role="region" aria-label="Exact monthly revenue, expenses and profit values" tabIndex={0}><table className={styles.table}><caption className="sr-only">Monthly recorded finance in NGN</caption><thead><tr><th scope="col">Month</th><th scope="col" className={styles.numeric}>Revenue</th><th scope="col" className={styles.numeric}>Expenses</th><th scope="col" className={styles.numeric}>Profit</th></tr></thead><tbody>{revExp.map((month) => <tr key={month.label}><th scope="row">{month.label}</th><td className={styles.numeric}>{naira(month.revenueMinor)}</td><td className={styles.numeric}>{naira(month.expenseMinor)}</td><td className={styles.numeric}>{naira(month.profitMinor)}</td></tr>)}</tbody></table></div>
              </> : <EmptyState title="No revenue or expense history" description="Monthly values appear when booking and operating expense records are available." />}</div>
            </Card>
          </div>
        }
      ]} />

    </div>
  );
}

function renderCells(cells: CalRow['cells']) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c === null) { out.push(<div key={i} className={styles.calendarGap} aria-label="No recorded booking">—</div>); continue; }
    out.push(
      <div key={i} className={shortletStyles.calendarBar} title={c.guest} style={{ gridColumn: `span ${c.span}`, background: `color-mix(in srgb, ${toneVar(c.tone)} 22%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar(c.tone)} 45%, transparent)` }}>
        <span className="font-medium" style={{ color: toneVar(c.tone) }}>{c.guest}</span>
      </div>,
    );
    i += c.span - 1;
  }
  return out;
}
