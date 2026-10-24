'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { Button, Card, CardHeader, IconButton, KpiCard } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { toneVar, type Tone } from '@/lib/status-tones';
import styles from './shortlet-reference.module.css';

export { styles as shortletStyles };
export { shortletMoney } from './shortlet-format';

export function ShortletPanel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return <Card className={styles.card}><CardHeader title={title} subtitle={subtitle} action={action} />{children}</Card>;
}

export function ShortletMetric({ label, value, note, icon, tone = 'info' }: { label: string; value: string; note?: string; icon?: ReactNode; tone?: Tone }) {
  const financialOrLong = value.includes('₦') || value.length > 12;
  return <div className={financialOrLong ? `${styles.metric} ${styles.longMetric}` : styles.metric}><KpiCard label={label} value={value} icon={icon} iconColor={toneVar(tone)} />{note && <p className={styles.metricNote}>{note}</p>}</div>;
}

export function ShortletNotice({ children }: { children: ReactNode }) {
  return <div className={styles.feedback}><Info size={18} /><div>{children}</div></div>;
}

export function ShortletDialog({ title, children, onClose, pending = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; pending?: boolean; wide?: boolean }) {
  return <PortalDialog label={title} onClose={onClose} width={wide ? 720 : 560} canClose={!pending} dismissOnBackdrop={false}><div className={styles.dialog} aria-busy={pending}><header className={styles.dialogHeader}><h2>{title}</h2><IconButton type="button" aria-label={`Close ${title.toLowerCase()}`} disabled={pending} onClick={onClose}><X size={18} aria-hidden="true" /></IconButton></header><fieldset disabled={pending}>{children}</fieldset></div></PortalDialog>;
}

/** The review stays in the active native dialog, so validation errors are never behind it. */
export function ShortletReview({ children, pending, disabled, onSubmit, onCancel, label }: { children: ReactNode; pending: boolean; disabled?: boolean; onSubmit: () => void; onCancel: () => void; label: string }) {
  const [approved, setApproved] = useState(false);
  const review = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fieldset = review.current?.closest('fieldset');
    const invalidate = (event: Event) => { if (event.target instanceof Node && !review.current?.contains(event.target)) setApproved(false); };
    fieldset?.addEventListener('input', invalidate);
    fieldset?.addEventListener('change', invalidate);
    fieldset?.addEventListener('click', invalidate);
    return () => { fieldset?.removeEventListener('input', invalidate); fieldset?.removeEventListener('change', invalidate); fieldset?.removeEventListener('click', invalidate); };
  }, []);
  return <><div ref={review} className={styles.review}><div>{children}</div><label><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} disabled={pending} />I have reviewed these details and approve this record change.</label></div><div className={styles.actions}><Button type="button" onClick={onCancel} disabled={pending}>Cancel</Button><Button type="button" variant="primary" onClick={onSubmit} disabled={pending || disabled || !approved}>{pending ? 'Saving…' : label}</Button></div></>;
}

/** Review-first affordance for permission, cancellation and financial status changes. */
export function ShortletConfirm({ title, description, label, action, onDone, disabled, danger = false, pressed, switchLabel, checked }: { title: string; description: string; label: string; action: () => Promise<{ ok: boolean; error?: string }>; onDone: () => void; disabled?: boolean; danger?: boolean; pressed?: boolean; switchLabel?: string; checked?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  function confirm() {
    if (pending) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    start(async () => {
      try { const result = await action(); if (!result.ok) { setError(result.error ?? 'Unable to save this change.'); return; } setOpen(false); onDone(); }
      catch { setError('Unable to save this change. Please try again.'); }
      finally { inFlight.current = false; }
    });
  }
  return <><Button type="button" disabled={disabled} aria-pressed={pressed} role={switchLabel ? 'switch' : undefined} aria-label={switchLabel} aria-checked={switchLabel ? checked : undefined} onClick={() => { setError(null); setOpen(true); }} className={danger ? 'text-negative' : undefined}>{label}</Button>{open && <ShortletDialog title={title} pending={pending} onClose={() => setOpen(false)}><p className={styles.body}>{description}</p>{error && <p role="alert" className="text-negative mt-4 text-sm">{error}</p>}<ShortletReview pending={pending} onCancel={() => setOpen(false)} onSubmit={confirm} label={`Confirm ${label.toLowerCase()}`}>This updates the current workspace record only. It does not send a message, move money or activate an external provider.</ShortletReview></ShortletDialog>}</>;
}

export function ShortletFeedback({ message, onClose }: { message: string; onClose: () => void }) {
  return <div role="status" className={styles.feedback}><span className="flex-1">{message}</span><IconButton aria-label="Dismiss message" onClick={onClose}><X size={18} /></IconButton></div>;
}
