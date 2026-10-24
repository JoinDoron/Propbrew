'use client';

import { shortletMoney as money } from './shortlet-format';

import { PageTabs } from '@/components/ui/page-tabs';
import { shortletStyles, ShortletFeedback , ShortletDialog , ShortletReview } from './reference-ui';
import { Button, CardHeader, EmptyState, StatusPill, Card } from '@/components/ui';
import styles from './shortlet-operations-polish.module.css';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Check, AlertTriangle, Camera, FileDown, Sparkles } from 'lucide-react';
import { toneVar, humanizeStatus, type Tone } from '@/lib/status-tones';
import { saveInspection } from '@/server/actions/shortlet';

export type PendingRow = { id: string; ref: string; guest: string; apt: string; property: string; cautionFeeMinor: number };
export type DoneRow = { bookingId: string; ref: string; guest: string; apt: string; at: string; outcome: string; damageMinor: number; cautionFeeMinor: number | null; cautionStatus: string | null; items: { label: string; condition: string; note?: string; chargeMinor?: number }[] };

const fmtDate = (date: string) => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', ...(date.includes('T') ? { hour: '2-digit', minute: '2-digit' } as const : {}), timeZone: 'Africa/Lagos' }).format(new Date(date));
const DEFAULT_ITEMS = ['Living room', 'Kitchen & appliances', 'Bathroom(s)', 'Bedroom(s)', 'Inventory (towels, remotes)', 'Keys & access cards'];
const CAUTION_TONE: Record<string, Tone> = { refunded: 'success', partly_deducted: 'warn', forfeited: 'danger', held: 'info', pending: 'neutral' };
const inspectionGuest = (row: DoneRow) => row.guest.trim() || 'Guest not available';
const inspectionRef = (row: DoneRow) => row.ref.trim() || 'Booking not linked';
const cautionAmount = (row: DoneRow) => row.cautionFeeMinor === null ? 'Not available' : money(row.cautionFeeMinor);
const cautionStatus = (row: DoneRow) => row.cautionStatus === null ? 'Booking not linked' : humanizeStatus(row.cautionStatus);
const cautionSummary = (row: DoneRow) => row.cautionFeeMinor === null || row.cautionStatus === null
  ? 'Booking not linked · caution decision not available · no bank transfer verified.'
  : `Caution status ${humanizeStatus(row.cautionStatus)} recorded · no bank transfer verified.`;

export function InspectionsWorkspace({ pending: pendingRows, done , canUpdate = false}: { pending: PendingRow[]; done: DoneRow[] ; canUpdate?: boolean}) {
  const [runFor, setRunFor] = useState<PendingRow | null>(null);
  const [packFor, setPackFor] = useState<DoneRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (message: string) => setToast(message);

  return (
    <div className={`pb-section ${shortletStyles.workspace}`}>

      <div className={styles.notice}>
        Inspections record a caution-fee decision and may close a booking. They do not transfer a refund. Durable evidence storage and photo upload are not connected here. {pendingRows.length} awaiting inspection.
      </div>

      <PageTabs label="Checkout inspection sections" items={[
        {
          id: "pending", label: "Awaiting inspection", content: <div className={styles.stack}>
            {pendingRows.length === 0 ? <Card><EmptyState title="No checkouts are awaiting inspection." description="Guest checkouts requiring a caution-fee review will appear here." icon={<ShieldCheck size={24} />} /></Card> : null}
            {pendingRows.length > 0 && (
              <div className={styles.stack}>
                <div><h2 className={styles.title}>Awaiting inspection</h2><p className={styles.metadata}>{pendingRows.length} checkout{pendingRows.length === 1 ? '' : 's'} requiring an operator review</p></div>
                <div className={styles.stack}>
                  {pendingRows.map((p) => (
                    <Card key={p.id} className={styles.section}>
                      <CardHeader title={`${p.apt} · ${p.guest}`} subtitle={`${p.ref} · ${p.property}`} action={<StatusPill status="Awaiting inspection" tone="warn" />} />
                      <dl className={styles.facts}><div><dt>Caution fee held · NGN</dt><dd>{money(p.cautionFeeMinor)}</dd></div><div><dt>Review required</dt><dd>Inspect the apartment before recording a caution decision.</dd></div></dl>
                      <div className={styles.actions}><Button onClick={() => setRunFor(p)} variant="primary" icon={<ShieldCheck size={16} />} disabled={!canUpdate}>Run inspection</Button></div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        },
        {
          id: "completed", label: "Completed inspections", content: <div className={styles.stack}>
            <div className={styles.stack}>
              <div><h2 className={styles.title}>Completed</h2><p className={styles.metadata}>Recorded apartment condition and caution-fee decisions</p></div>
              {done.length === 0 ? <Card><EmptyState title="No inspections yet." description="Completed checkout inspection records will appear here." /></Card> : (
                <div className={styles.stack}>
                  {done.map((d) => (
                    <Card key={d.bookingId} className={styles.section}>
                      <CardHeader title={`${d.apt} · ${inspectionGuest(d)}`} subtitle={`${inspectionRef(d)} · ${fmtDate(d.at)} · WAT`} action={<StatusPill status={cautionStatus(d)} tone={d.cautionStatus === null ? 'neutral' : CAUTION_TONE[d.cautionStatus] ?? 'neutral'} />} />
                      <dl className={styles.facts}><div><dt>Caution fee · NGN</dt><dd>{cautionAmount(d)}</dd></div><div><dt>Recorded damage charge</dt><dd>{money(d.damageMinor)}</dd></div><div><dt>Condition issues</dt><dd>{d.items.filter((i) => i.condition !== 'ok').length} issue(s)</dd></div><div><dt>Inspection outcome</dt><dd>{humanizeStatus(d.outcome)}</dd></div></dl>
                      <div className={styles.toolbar}><p className={styles.text}>{cautionSummary(d)}</p><Button onClick={() => setPackFor(d)} icon={<FileDown size={16} />}>Dispute pack</Button></div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
      ]} />

      {runFor && <RunDialog booking={runFor} onClose={() => setRunFor(null)} onDone={(msg) => { setRunFor(null); flash(msg); }} />}

      {packFor && <PackModal d={packFor} onClose={() => setPackFor(null)} />}

      {toast && <ShortletFeedback message={toast} onClose={() => setToast(null)} />}

    </div>
  );
}

function RunDialog({ booking, onClose, onDone }: { booking: PendingRow; onClose: () => void; onDone: (msg: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, setItems] = useState(DEFAULT_ITEMS.map((label) => ({ label, condition: 'ok' as 'ok' | 'damaged' | 'missing', charge: '', note: '' })));
  const [error, setError] = useState<string | null>(null);
  const damage = items.reduce((n, it) => n + (it.condition !== 'ok' ? Number(it.charge || 0) * 100 : 0), 0);
  const decision = damage <= 0 ? 'Refund in full' : damage >= booking.cautionFeeMinor ? 'Forfeit caution' : `Deduct ${money(damage)}, refund ${money(booking.cautionFeeMinor - damage)}`;

  function set(i: number, patch: Partial<(typeof items)[number]>) { setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it))); }
  function submit() { if (pending) return;
    setError(null);
    start(async () => { try {
      const payload = items.map((it) => ({ label: it.label, condition: it.condition, note: it.note || undefined, photo: false, chargeMinor: it.condition !== 'ok' ? Number(it.charge || 0) * 100 : undefined }));
      const r = await saveInspection(booking.id, payload, 'Operator');
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onDone(damage > 0 ? `Inspection decision recorded — ${money(Math.min(damage, booking.cautionFeeMinor))} deduction recorded. No money moved.` : 'Inspection clear — refund status recorded, booking closed. No money moved.');
     } catch { setError('Unable to save this record. Please try again.'); } });
  }
  return (
    <ShortletDialog title="Checkout inspection" onClose={onClose} pending={pending} wide>
      <div className={styles.stack}>
        <Card><CardHeader title={`${booking.apt} · ${booking.guest}`} subtitle={`${booking.ref} · ${booking.property}`} /><p className={styles.text}>Caution {money(booking.cautionFeeMinor)} held · record the condition of each area before reviewing the decision.</p></Card>
        <div className={styles.stack}>
          {items.map((it, i) => (
            <Card key={it.label} className={styles.inspectionItem}>
              <CardHeader title={it.label} subtitle="Record the condition observed at checkout." />
                <div className={styles.conditionOptions} role="group" aria-label={`Condition for ${it.label}`}>
                  {(['ok', 'damaged', 'missing'] as const).map((c) => (
                    <Button type="button" key={c} aria-pressed={it.condition === c} onClick={() => set(i, { condition: c })} className="capitalize" style={it.condition === c ? { color: toneVar(c === 'ok' ? 'success' : c === 'damaged' ? 'warn' : 'danger'), borderColor: toneVar(c === 'ok' ? 'success' : c === 'damaged' ? 'warn' : 'danger'), background: `color-mix(in srgb, ${toneVar(c === 'ok' ? 'success' : c === 'damaged' ? 'warn' : 'danger')} 8%, var(--surface))` } : undefined}>{c}</Button>
                  ))}
                </div>
              {it.condition !== 'ok' && (
                <div className={styles.stack}>
                  <p className={styles.notice}><Camera size={18} /> Photo upload unavailable. Notes and charges do not verify original photo evidence.</p>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>Damage note<input value={it.note} aria-label={`${it.label} damage note`} onChange={(e) => set(i, { note: e.target.value })} placeholder="What's wrong?" className={styles.control} /></label>
                    <label className={styles.field}>Damage charge · NGN<input value={it.charge} aria-label={`${it.label} damage charge in naira`} onChange={(e) => set(i, { charge: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="₦ charge" className={styles.control} /></label>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
        <Card className={styles.section}><CardHeader title="Caution decision:" subtitle="Calculated from the recorded damage charges · operator review required" action={<Sparkles size={18} className="text-primary" />} /><p className={styles.text}>{decision}</p><p className={styles.metadata}>This records a caution decision only. No refund or bank transfer is made.</p></Card>
        {error && <div role="alert" className={styles.error}>{error}</div>}
        <div className={styles.reviewBoundary}><ShortletReview pending={pending} disabled={false} onCancel={onClose} onSubmit={submit} label="Confirm save & close booking">Review the details above. This records a workspace change only; messages, bank transfers and gateway refunds are not sent by this form.</ShortletReview></div>
      </div>
    </ShortletDialog>
  );
}

/** Recorded inspection facts only; missing booking/caution facts remain unknown. */
export function inspectionPackText(d: DoneRow): string {
  return [`PROPBREW SHORTLET — CHECKOUT INSPECTION RECORD`, ``, `Booking: ${inspectionRef(d)}`, `Booking record ID: ${d.bookingId}`, `Guest: ${inspectionGuest(d)}`, `Apartment: ${d.apt}`, `Inspected: ${d.at}`, ``, `ITEMS:`, ...d.items.map((i) => `  • ${i.label}: ${i.condition.toUpperCase()}${i.note ? ` — ${i.note}` : ''}${i.chargeMinor ? ` (${money(i.chargeMinor)})` : ''} [original photo evidence not verified in this export]`), ``, `Caution fee: ${cautionAmount(d)}`, `Recorded inspection damage charge: ${money(d.damageMinor)}`, `Inspection outcome: ${humanizeStatus(d.outcome)}`, `Caution status: ${cautionStatus(d)}`, cautionSummary(d)].join('\n');
}

export function PackModal({ d, onClose }: { d: DoneRow; onClose: () => void }) {
  function download() {
    const lines = inspectionPackText(d);
    const url = URL.createObjectURL(new Blob([lines], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `dispute-pack-${d.ref.trim() || d.bookingId}.txt`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <ShortletDialog title="Dispute evidence pack" onClose={onClose} wide>
      <div className={styles.stack}>
        <Card><CardHeader title={`${d.apt} · ${inspectionGuest(d)}`} subtitle={`${inspectionRef(d)} · ${fmtDate(d.at)} · WAT`} action={<StatusPill status={cautionStatus(d)} tone={d.cautionStatus === null ? 'neutral' : CAUTION_TONE[d.cautionStatus] ?? 'neutral'} />} /><dl className={styles.facts}><div><dt>Caution fee</dt><dd>{cautionAmount(d)}</dd></div><div><dt>Recorded inspection damage charge</dt><dd>{money(d.damageMinor)}</dd></div><div><dt>Inspection outcome</dt><dd>{humanizeStatus(d.outcome)}</dd></div><div><dt>Caution status</dt><dd>{cautionStatus(d)}</dd></div></dl><p className={styles.metadata}>{cautionSummary(d)}</p></Card>
        <Card><CardHeader title="Inspection items" subtitle="All recorded conditions, notes and charges; original evidence is not verified." /><div>
          {d.items.map((i) => (
            <div key={i.label} className={styles.inspectionDetail}>
              {i.condition === 'ok' ? <Check size={18} className="text-positive" /> : <AlertTriangle size={18} className="text-warning" />}
              <div><p className={styles.text}>{i.label}</p>{i.note && <p className={styles.text}>{i.note}</p>}<p className={styles.metadata}>{humanizeStatus(i.condition)}</p></div>
              {i.condition !== 'ok' && <span className={`${styles.inline} ${styles.metadata}`}><Camera size={16} /> Evidence unverified</span>}
              {i.chargeMinor ? <span className={styles.text}>{money(i.chargeMinor)}</span> : null}
            </div>
          ))}
        </div></Card>
        <Button variant="primary" onClick={download} icon={<FileDown size={16} />}>Download evidence pack</Button>
      </div>
    </ShortletDialog>
  );
}
