'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock, Package, PackagePlus, Search, Wallet } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { FacilityDialog, FacilityFeedback, FacilityKpi } from './facility-ui';
import { facilityMoney } from './facility-format';
import { stockSignal, type Part } from '@/domain/facility';
import { receiveStock } from '@/server/actions/facility';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './facility-specialists.module.css';

export type PartRow = Part;

export function InventoryWorkspace({ parts, kpis, canMutate = false }: {
  parts: PartRow[]; kpis: { total: number; belowReorder: number; stockValueMinor: number; stockoutsSoon: number }; canMutate?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [receiveFor, setReceiveFor] = useState<PartRow | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const categories = [...new Set(parts.map((part) => part.category))].sort();
  const shown = parts.filter((part) => (category === 'all' || part.category === category) && (part.name + ' ' + part.sku).toLowerCase().includes(query.trim().toLowerCase()));

  return <div className={styles.stack}>
    <PageTabs label="Inventory sections" defaultTab="register" items={[
      { id: 'overview', label: 'Stock overview', content: <div className={styles.stack}><div className={layout.metrics}><FacilityKpi label="Parts tracked" value={String(kpis.total)} tone="info" icon={<Package size={18} />} /><FacilityKpi label="Below reorder" value={String(kpis.belowReorder)} tone={kpis.belowReorder ? 'danger' : 'success'} icon={<AlertTriangle size={18} />} /><FacilityKpi label="Stock-out ≤7d" value={String(kpis.stockoutsSoon)} note="Run-rate estimate, not a demand forecast" tone={kpis.stockoutsSoon ? 'warn' : 'info'} icon={<Clock size={18} />} /><FacilityKpi label="Stock value" value={facilityMoney(kpis.stockValueMinor)} note="Recorded inventory value · NGN" tone="info" icon={<Wallet size={18} />} /></div><Card><CardHeader title="Inventory planning" subtitle="Separate the recorded stock balance from the replenishment estimate." /><p className={styles.body}>Stock signals compare the current balance with each part’s reorder point and recorded monthly usage. Receiving adds physically delivered stock to the register; it does not place a supplier order or record a payment.</p></Card></div> },
      { id: 'register', label: 'Parts & receiving', content: <Card padded={false} className={styles.panel}><div className={styles.panelHeader}><CardHeader title="Parts & receiving" subtitle="Review location, available stock and monthly usage before recording deliveries." action={<StatusPill status={canMutate ? 'Receiving enabled' : 'Read-only'} tone={canMutate ? 'info' : 'muted'} />} /><div className={styles.toolbar + ' mt-6'}><label className={layout.search}><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search parts" placeholder="Search parts or SKU…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={styles.field}><span>Part category</span><select className={layout.select} aria-label="Part category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label></div></div>
        {shown.length ? <div className={styles.scroll} role="region" tabIndex={0} aria-label="Spare parts inventory register"><table className={'pb-data-table ' + styles.table}><thead><tr>{['Part', 'Location', 'Stock / reorder point', 'Planning signal', 'Monthly usage', 'Action'].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{shown.map((part) => {
          const signal = stockSignal(part);
          return <tr key={part.id}><td><p className={styles.rowTitle}>{part.name}</p><p className={styles.metadata}>{part.sku} · {part.category}</p></td><td><p className={styles.body}>{part.location}</p></td><td className={styles.numeric}><strong className="font-medium">{part.stock}</strong><span className={styles.metadata}> / {part.reorderPoint}</span></td><td><StatusPill status={signal.belowReorder ? 'Reorder review' : signal.daysToStockout !== null ? signal.daysToStockout + ' days at recorded use' : 'No usage estimate'} tone={signal.band} /></td><td className={styles.numeric}>{part.usedPerMonth}</td><td className={styles.action}>{canMutate ? <Button icon={<PackagePlus size={16} />} aria-label={'Receive ' + part.name} onClick={() => setReceiveFor(part)}>Receive</Button> : <span className={styles.metadata}>Read-only</span>}</td></tr>;
        })}</tbody></table></div> : <div className={styles.empty}><EmptyState icon={<Package size={26} />} title="No parts match." description="Try another search or category. No stock records are changed by filtering." /></div>}
        <p className={styles.footer}>Showing {shown.length} of {parts.length} parts. Planning signals are deterministic estimates from recorded usage, not connected AI or supplier availability.</p>
      </Card> },
    ]} />
    {receiveFor ? <ReceiveDialog part={receiveFor} onClose={() => setReceiveFor(null)} onDone={() => { setReceiveFor(null); setFeedback('Stock received'); }} /> : null}
    {feedback ? <FacilityFeedback message={feedback} onDismiss={() => setFeedback(null)} /> : null}
  </div>;
}

function ReceiveDialog({ part, onClose, onDone }: { part: PartRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const suggested = Math.max(part.reorderPoint * 2 - part.stock, part.usedPerMonth);
  const [quantity, setQuantity] = useState(String(suggested));
  const [error, setError] = useState<string | null>(null);
  function submit() {
    if (inFlight.current || !(Number(quantity) > 0)) return;
    inFlight.current = true; setError(null);
    start(async () => {
      try { const result = await receiveStock(part.id, Number(quantity)); if (!result.ok) { setError(result.error); return; } router.refresh(); onDone(); }
      catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); }
      finally { inFlight.current = false; }
    });
  }
  return <FacilityDialog title="Receive stock" onClose={onClose} pending={pending}><form className={styles.stack} onSubmit={(event) => { event.preventDefault(); submit(); }}><div className={styles.notice}><p className={styles.title}>{part.name}</p><p>In stock {part.stock} · reorder at {part.reorderPoint} · {part.location}</p></div><label className={styles.field}><span>Quantity received</span><input className={layout.control} value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" required disabled={pending} autoFocus /></label><p className={styles.body}>Suggested {suggested} at recorded usage. Confirm the items have physically arrived before adding them to stock. No supplier order or payment is created.</p>{error ? <p role="alert" className="text-[14px] text-negative">{error}</p> : null}<div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || !(Number(quantity) > 0)}>{pending ? 'Saving…' : 'Receive'}</Button></div></form></FacilityDialog>;
}
