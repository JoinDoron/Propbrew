'use client';

import { PageTabs } from '@/components/ui/page-tabs';
import { shortletStyles, ShortletMetric, ShortletFeedback , ShortletDialog , ShortletReview } from './reference-ui';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Fuel, TrendingUp, Wallet, PieChart, Sparkles } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { logExpense } from '@/server/actions/shortlet';
import { shortletMoney as money, shortletDate } from './shortlet-format';
import styles from './shortlet-commercial-polish.module.css';
import type { ExpenseCategory } from '@/domain/shortlet/types';

export type ExpenseRow = { id: string; property: string; propertyId: string; category: string; amountMinor: number; date: string; note: string };
export type Insight = { totalMinor: number; dieselPctOfRevenue: number; costPerOccupiedNightMinor: number; byCategory: { category: string; minor: number; pct: number }[] };

const CATS: ExpenseCategory[] = ['diesel', 'salary', 'repairs', 'supplies', 'cleaning', 'utilities', 'marketing', 'other'];
const CAT_TONE: Record<string, Tone> = { diesel: 'danger', salary: 'progress', repairs: 'warn', supplies: 'info', cleaning: 'success', utilities: 'neutral', marketing: 'info', other: 'muted' };

export function ExpensesWorkspace({ expenses, properties, insight, revenueMinor , canCreate = false}: { expenses: ExpenseRow[]; properties: { id: string; name: string }[]; insight: Insight; revenueMinor: number ; canCreate?: boolean}) {
  const [logging, setLogging] = useState(false);
  const [prop, setProp] = useState('all');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (message: string) => setToast(message);
  const profit = revenueMinor - insight.totalMinor;
  const shown = expenses.filter((e) => prop === 'all' || e.propertyId === prop);
  const maxCat = Math.max(...insight.byCategory.map((c) => c.minor), 1);

  return (
    <div className={`pb-section ${shortletStyles.workspace}`}>

      <PageTabs label="Expense management sections" items={[
        {
          id: "ledger", label: "Expense ledger", content: <div className={styles.stack}>
            <Card padded={false} className={styles.card}>
              <div className={styles.header}><CardHeader title="Expense log" subtitle="Recorded operating costs · NGN · logging is not a bank payment" action={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setLogging(true)} disabled={!canCreate || !properties.length}>Log expense</Button>} /><div className={`${styles.toolbar} mt-6`}><p role="status" className={styles.metadata}>{shown.length} matching expense records · {expenses.length} in the current scope</p><label className={styles.field}><span className="sr-only">Filter expenses by property</span><select value={prop} aria-label="Filter expenses by property" onChange={(event) => setProp(event.target.value)} className={styles.select}><option value="all">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label></div></div>
              {shown.length ? <div className={styles.scroll} role="region" aria-label="Expense ledger, horizontally scrollable" tabIndex={0}><table className={styles.table}><caption className="sr-only">Recorded expenses in NGN, not settled bank payments</caption><thead><tr><th scope="col">Reference</th><th scope="col">Date</th><th scope="col">Property</th><th scope="col">Category</th><th scope="col">Note</th><th scope="col" className={styles.numeric}>Amount</th></tr></thead><tbody>{shown.map((expense) => <tr key={expense.id}><th scope="row">{expense.id}</th><td><time dateTime={expense.date}>{shortletDate(expense.date)}</time></td><td>{expense.property}</td><td><span className="capitalize">{expense.category}</span></td><td className={styles.note}>{expense.note || 'No note recorded'}</td><td className={styles.numeric}>{money(expense.amountMinor)}</td></tr>)}</tbody></table></div> : <div className={styles.body}><EmptyState title="No matching expenses" description={prop === 'all' ? 'No operating expense records are available in your current scope.' : 'No expense records match this property. Choose another property or clear the filter.'} /></div>}
            </Card>
          </div>
        },
        {
          id: "insights", label: "Spending insights", content: <div className={styles.stack}>
            <p className={styles.metadata}>Recorded snapshot for all properties in the current scope. The ledger property filter does not change these totals. Figures are not audited profit or evidence of payment.</p>
            <div className={shortletStyles.metrics}>
              <Kpi label="Recorded expenses" value={money(insight.totalMinor)} tone="danger" icon={<Wallet size={16} />} />
              <Kpi label="Recorded profit / loss" value={money(profit)} note={revenueMinor ? `${Math.round((profit / revenueMinor) * 100)}% margin on ${money(revenueMinor)} recorded revenue` : 'Margin unavailable: no recorded revenue'} tone={profit >= 0 ? 'success' : 'danger'} icon={<TrendingUp size={16} />} />
              <Kpi label="Diesel / revenue" value={revenueMinor ? `${insight.dieselPctOfRevenue}%` : 'N/A'} note={revenueMinor ? 'Share of recorded revenue' : 'No recorded revenue denominator'} tone={insight.dieselPctOfRevenue > 12 ? 'warn' : 'success'} icon={<Fuel size={16} />} />
              <Kpi label="Cost / night" value={money(insight.costPerOccupiedNightMinor)} note="per occupied night" tone="progress" icon={<PieChart size={16} />} />
            </div>
            <Card padded={false} className={styles.card}>
              <div className={styles.header}><CardHeader title="Spending by category" subtitle="Exact amounts and expense share · bars compare category totals" /></div><div className={styles.body}>
              {insight.byCategory.length ? <ul className={styles.miniChartList}>
                {insight.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className={styles.row}><span className={`${styles.rowTitle} capitalize`}>{c.category}</span><span className={styles.text}>{money(c.minor)} · {c.pct}% of expenses</span></div>
                    <div className={styles.bar} role="img" aria-label={`${c.category}: ${money(c.minor)}, ${c.pct}% of recorded expenses`}><span style={{ width: `${(c.minor / maxCat) * 100}%`, background: toneVar(CAT_TONE[c.category] ?? 'neutral') }} /></div>
                  </li>
                ))}
              </ul> : <EmptyState title="No spending categories" description="Category totals appear when operating expenses are recorded." />}</div>
            </Card>
          </div>
        }
      ]} />

      {revenueMinor > 0 && insight.dieselPctOfRevenue > 0 && (
        <div className={styles.notice}>
          <Sparkles aria-hidden="true" size={18} />
          <span>Recorded diesel is <b>{insight.dieselPctOfRevenue}%</b> of revenue this period — an operating-cost signal for Nigerian shortlets, not an AI recommendation. Compare actual diesel, grid, inverter and solar costs before making a purchase.</span>
        </div>
      )}

      {canCreate && logging && <LogDialog properties={properties} onClose={() => setLogging(false)} onDone={() => { setLogging(false); flash('Expense logged.'); }} />}

      {toast && <ShortletFeedback message={toast} onClose={() => setToast(null)} />}

    </div>
  );
}

function LogDialog({ properties, onClose, onDone }: { properties: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [propId, setPropId] = useState(properties[0]?.id ?? '');
  const [category, setCategory] = useState<ExpenseCategory>('diesel');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const valid = Boolean(amount && date && propId && properties.some((property) => property.id === propId) && Number.isFinite(Number(amount)) && Number(amount) > 0 && Number.isSafeInteger(Math.round(Number(amount) * 100)) && Number.isFinite(Date.parse(date)));
  function submit() { if (pending || inFlight.current || !valid || !form.current?.reportValidity()) return; inFlight.current = true; setError(null); start(async () => { try { const r = await logExpense({ propertyId: propId, category, amountNaira: Number(amount), date, note }); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); } catch { setError('Unable to save this record. Please try again.'); } finally { inFlight.current = false; } }); }
  return (
    <ShortletDialog title="Log expense" onClose={onClose} pending={pending} wide><p className={styles.text}>Record an operating cost in NGN. This form does not transfer money, settle a supplier invoice or attach payment evidence.</p><form ref={form} className={styles.form} onSubmit={(event) => event.preventDefault()}>
      <label className={styles.field}><span>Property</span><select aria-label="Property" required value={propId} onChange={(event) => setPropId(event.target.value)}>{!properties.length && <option value="">No properties available</option>}{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <div className={styles.formGrid}><label className={styles.field}><span>Category</span><select aria-label="Category" required value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{CATS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className={styles.field}><span>Amount (₦)</span><input aria-label="Amount (₦)" required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" autoFocus /></label></div>
      <div className={styles.formGrid}><label className={styles.field}><span>Expense date</span><input aria-label="Date" required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className={styles.field}><span>Note (optional)</span><input aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the cost" /></label></div>
      <div className={styles.notice}><Wallet aria-hidden="true" size={18} /><div>Proposed record: <strong>{Number.isFinite(Number(amount)) && amount ? money(Math.round(Number(amount) * 100)) : 'Enter an amount'}</strong>{date ? ` · ${shortletDate(date)}` : ''} · {properties.find((property) => property.id === propId)?.name ?? 'Choose a property'}. Check receipts and approvals separately.</div></div>
    </form>{error && <p role="alert" className={styles.error}>{error}</p>}<ShortletReview pending={pending} disabled={!valid} onCancel={onClose} onSubmit={submit} label="Confirm log expense">Review the property, exact amount and date. This creates an expense record only; no message, bank transfer or gateway refund is sent.</ShortletReview></ShortletDialog>
  );
}

function Kpi({ label, value, note, icon }: { label: string; value: string; note?: string; tone: Tone; icon: React.ReactNode }) { return <ShortletMetric label={label} value={value} icon={icon} note={note} />; }
