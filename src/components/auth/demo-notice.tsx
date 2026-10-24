'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { signOut } from '@/server/actions/auth';
import { resetDemoSandbox } from '@/server/actions/demo-auth';
import { clearOwnerOutbox } from '@/lib/offline/outbox';
import styles from './demo-notice.module.css';

export function DemoNotice({ editable = false, outboxOwner }: { editable?: boolean; outboxOwner?: string }) {
  const prefix = useId();
  const [confirming, setConfirming] = useState(false);
  const resetButton = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLParagraphElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const [state, reset, pending] = useActionState(async (previous: { error?: string; message?: string }, form: FormData) => {
    let result: { error?: string; message?: string };
    try { result = await resetDemoSandbox(previous, form); }
    catch { return { error: 'The reset could not be confirmed. Reconnect and refresh before trying again.' }; }
    if (result.message && !result.error) {
      setConfirming(false);
      if (outboxOwner) {
        try { await clearOwnerOutbox(outboxOwner); }
        catch { return { error: 'Your sandbox was reset, but this device’s offline queue could not be fully cleared. Refresh before capturing new work.' }; }
      }
    }
    return result;
  }, {});
  useEffect(() => { if (confirming) confirmation.current?.focus(); }, [confirming]);
  useEffect(() => { if (state.error || state.message) feedback.current?.focus(); }, [state]);

  return <aside aria-label="Demo account notice" className={styles.notice}>
    <div className={styles.summary}>
      <p>{editable ? <><strong>Private demo sandbox</strong><span> · Your changes stay here. Add, edit and try workflows with sample data.</span></> : <><strong>Demo workspace</strong><span> · Sample data · View only.</span></>}<span className={styles.privacy}>{editable ? 'Payments and external messages are simulated. ' : ''}Please don’t enter private information.</span></p>
      <div className={styles.actions}>
        {editable && <button ref={resetButton} type="button" onClick={() => setConfirming((current) => !current)} disabled={pending} aria-expanded={confirming} aria-controls={`${prefix}-reset`} className={styles.reset}><RotateCcw size={14} aria-hidden="true" />Reset sample data</button>}
        <form action={signOut}><ExitDemo disabled={pending} /></form>
      </div>
    </div>
    {editable && confirming && <section id={`${prefix}-reset`} className={styles.confirmation} aria-labelledby={`${prefix}-reset-title`}>
      <p id={`${prefix}-reset-title`} ref={confirmation} tabIndex={-1}><strong>Reset your demo sandbox?</strong></p>
      <p>This replaces your demo additions and edits with fresh sample data. Real company records and other visitors’ demos stay unchanged.</p>
      <form action={reset} aria-busy={pending}>
        <input type="hidden" name="confirm" value="reset-own-demo" />
        <button type="button" disabled={pending} onClick={() => { setConfirming(false); resetButton.current?.focus(); }} className={styles.cancel}>Keep my changes</button>
        <button type="submit" disabled={pending} className={styles.confirm}>{pending ? 'Resetting…' : 'Reset my sandbox'}</button>
      </form>
    </section>}
    {(state.error || state.message) && <p ref={feedback} tabIndex={-1} role={state.error ? 'alert' : 'status'} className={state.error ? styles.error : styles.success}>{state.error || state.message}</p>}
  </aside>;
}

function ExitDemo({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className={styles.exit}>{pending ? 'Leaving demo…' : 'Exit demo'}</button>;
}
