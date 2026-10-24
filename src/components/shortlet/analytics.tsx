'use client';

import { PageTabs } from '@/components/ui/page-tabs';
import { shortletStyles } from './reference-ui';
import styles from './shortlet-commercial-polish.module.css';
import { shortletMoney as money } from './shortlet-format';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { Download, TrendingUp, Building2, Percent, Users } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';

export type MonthBar = { label: string; revenueMinor: number; expenseMinor: number };
export type PropProfit = { name: string; revenueMinor: number; expenseMinor: number; profitMinor: number; marginPct: number };
export type AptOcc = { name: string; property: string; occupancyPct: number };
export type SourcePerf = { label: string; bookings: number; revenueMinor: number; nights: number };

export function ShortletAnalytics({ revExp, propProfit, occupancy, sources }: { revExp: MonthBar[]; propProfit: PropProfit[]; occupancy: AptOcc[]; sources: SourcePerf[] }) {
  const maxBar = Math.max(...revExp.map((m) => Math.max(m.revenueMinor, m.expenseMinor)), 1);
  const maxProfit = Math.max(...propProfit.map((p) => p.revenueMinor), 1);
  const maxSrc = Math.max(...sources.map((s) => s.revenueMinor), 1);

  function exportCsv() {
    const csvCell = (value: string) => `"${(/^[=+@-]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
    const head = 'section,label,revenue_ngn,expense_ngn,profit_ngn,margin_pct,occupancy_pct,bookings,nights';
    const rows = [
      ...revExp.map((m) => `month,${csvCell(m.label)},${(m.revenueMinor / 100).toFixed(2)},${(m.expenseMinor / 100).toFixed(2)},,,,,`),
      ...propProfit.map((p) => `property,${csvCell(p.name)},${(p.revenueMinor / 100).toFixed(2)},${(p.expenseMinor / 100).toFixed(2)},${(p.profitMinor / 100).toFixed(2)},${p.marginPct},,,`),
      ...occupancy.map((o) => `apartment,${csvCell(o.name)},,,,,${o.occupancyPct},,`),
      ...sources.map((s) => `source,${csvCell(s.label)},${(s.revenueMinor / 100).toFixed(2)},,,,,${s.bookings},${s.nights}`),
    ];
    const url = URL.createObjectURL(new Blob([[head, ...rows].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'shortlet-analytics.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className={`pb-section ${shortletStyles.workspace}`}>

      <div className={styles.toolbar}><p className={styles.metadata}>Recorded snapshot · NGN accommodation value and operating costs. Not bank reconciliation or audited profit. No currency conversion is applied.</p><Button variant="primary" icon={<Download size={18} />} onClick={exportCsv}>Export CSV</Button></div>

      <PageTabs label="Shortlet analytics sections" items={[
        {
          id: "finance", label: "Finance", content: <div className={styles.stack}>
            <Panel icon={<TrendingUp size={18} />} title="Revenue vs expenses" subtitle="Recorded monthly totals · exact NGN values below the chart">
              {!revExp.length && <EmptyState title="No finance history" description="Monthly values appear when booking and expense records are available." />}
              {revExp.length > 0 && <><div className={styles.scroll} role="region" aria-label="Revenue and expenses chart, horizontally scrollable" tabIndex={0}><div className={styles.chart} role="img" aria-label={revExp.map((month) => `${month.label}: revenue ${money(month.revenueMinor)}, expense ${money(month.expenseMinor)}`).join('; ')}>
                {revExp.map((m) => (
                  <div key={m.label} className={styles.chartMonth}>
                    <div className={styles.chartBars}>
                      <div className="w-1/2 rounded-t" style={{ height: `${(m.revenueMinor / maxBar) * 100}%`, background: toneVar('success') }} />
                      <div className="w-1/2 rounded-t" style={{ height: `${(m.expenseMinor / maxBar) * 100}%`, background: toneVar('danger') }} />
                    </div>
                    <span className="text-[12px] text-text-3">{m.label}</span>
                  </div>
                ))}
              </div></div><div className={styles.legend}><span><i aria-hidden="true" style={{ background: toneVar('success') }} />Revenue</span><span><i aria-hidden="true" style={{ background: toneVar('danger') }} />Expenses</span></div><div className={styles.scroll} role="region" aria-label="Exact monthly finance values, horizontally scrollable" tabIndex={0}><table className={styles.table}><caption className="sr-only">Recorded monthly revenue and expenses in NGN</caption><thead><tr><th scope="col">Month</th><th scope="col" className={styles.numeric}>Revenue</th><th scope="col" className={styles.numeric}>Expenses</th></tr></thead><tbody>{revExp.map((month) => <tr key={month.label}><th scope="row">{month.label}</th><td className={styles.numeric}>{money(month.revenueMinor)}</td><td className={styles.numeric}>{money(month.expenseMinor)}</td></tr>)}</tbody></table></div></>}
            </Panel>
            <Panel icon={<Building2 size={18} />} title="Profit by property" subtitle="Recorded revenue less recorded costs · not audited or settled profit">
              {!propProfit.length && <EmptyState title="No property finance records" description="Property profit appears when scoped financial records are available." />}
              <ul className={styles.miniChartList}>
                {propProfit.map((p) => (
                  <li key={p.name}>
                    <p className={styles.rowTitle}>{p.name}</p><dl className={styles.facts}><div><dt>Revenue</dt><dd>{money(p.revenueMinor)}</dd></div><div><dt>Expenses</dt><dd>{money(p.expenseMinor)}</dd></div><div><dt>Profit / loss</dt><dd>{money(p.profitMinor)}</dd></div><div><dt>Margin</dt><dd>{p.marginPct}%</dd></div></dl>
                    <div className={`${styles.bar} flex`} role="img" aria-label={`${p.name}: profit ${money(p.profitMinor)}, expenses ${money(p.expenseMinor)}, margin ${p.marginPct}%`}>
                      <div className="h-full" style={{ width: `${Math.max(0, p.profitMinor / maxProfit * 100)}%`, background: toneVar('success') }} />
                      <div className="h-full" style={{ width: `${(p.expenseMinor / maxProfit) * 100}%`, background: toneVar('danger') }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        },
        {
          id: "occupancy", label: "Occupancy", content: <div className={styles.stack}>
            <Panel icon={<Percent size={18} />} title="Occupancy by apartment" subtitle="Calculated from recorded stays · not live channel availability">
              {!occupancy.length && <EmptyState title="No apartment occupancy" description="Occupancy is calculated from recorded stays, not live channel availability." />}
              <ul className={styles.miniChartList}>
                {occupancy.map((o) => (
                  <li key={o.name}>
                    <div className={styles.row}><div><p className={styles.rowTitle}>{o.name}</p><p className={styles.metadata}>{o.property}</p></div><span className={styles.rowTitle}>{o.occupancyPct}% occupied</span></div>
                    <div className={styles.bar} role="img" aria-label={`${o.name}, ${o.property}: ${o.occupancyPct}% occupancy`}><span style={{ width: `${o.occupancyPct}%`, background: toneVar(o.occupancyPct >= 70 ? 'success' : o.occupancyPct >= 45 ? 'warn' : 'danger') }} /></div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        },
        {
          id: "acquisition", label: "Booking sources", content: <div className={styles.stack}>
            <Panel icon={<Users size={18} />} title="Booking source performance (FR-AN-03)" subtitle="Recorded source attribution · not a connected channel performance feed">
              {!sources.length && <EmptyState title="No booking sources" description="Source performance appears after bookings are recorded." />}
              <ul className={styles.miniChartList}>
                {sources.map((s) => (
                  <li key={s.label}><p className={styles.rowTitle}>{s.label}</p><dl className={styles.facts}><div><dt>Revenue</dt><dd>{money(s.revenueMinor)}</dd></div><div><dt>Bookings</dt><dd>{s.bookings}</dd></div><div><dt>Booked nights</dt><dd>{s.nights}</dd></div></dl><div className={styles.bar} role="img" aria-label={`${s.label}: revenue ${money(s.revenueMinor)}, ${s.bookings} bookings, ${s.nights} nights`}><span style={{ width: `${(s.revenueMinor / maxSrc) * 100}%`, background: toneVar('progress') }} /></div></li>
                ))}
              </ul>
            </Panel>
          </div>
        }
      ]} />

    </div>
  );
}

function Panel({ title, subtitle, icon, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card padded={false} className={styles.card}>
      <div className={styles.header}><CardHeader title={title} subtitle={subtitle} action={<span aria-hidden="true" className="text-primary">{icon}</span>} /></div>
      <div className={styles.body}>{children}</div>
    </Card>
  );
}
