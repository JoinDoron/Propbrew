'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { Button, IconButton } from '@/components/ui';
import styles from './workspace-layout.module.css';

export type WorkspaceDecision = {
  title: string;
  record?: string;
  description: string;
  confirmLabel: string;
  action: () => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
};

/** A review step for consequential actions. Opening it never performs the action. */
export function WorkspaceDecisionDialog({ decision, onClose, children }: { decision: WorkspaceDecision; onClose: () => void; children?: ReactNode }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  function confirm() {
    if (inFlight.current) return;
    inFlight.current = true; setError(null);
    start(async () => {
      try {
        const result = await decision.action();
        if (!result.ok) { setError(result.error || 'The update could not be completed. Please try again.'); return; }
        decision.onSuccess?.(); onClose();
      } catch { setError('The update could not be completed. Please try again.'); }
      finally { inFlight.current = false; }
    });
  }
  return <PortalDialog label={decision.title} width={560} canClose={!pending} onClose={() => { if (!inFlight.current) onClose(); }}>
    <div className={styles.modal}>
      <header className={styles.dialogHeader}><h2 className={styles.dialogTitle}>{decision.title}</h2><IconButton type="button" disabled={pending} aria-label={`Close ${decision.title.toLowerCase()}`} onClick={onClose}><X size={18} /></IconButton></header>
      <form className={styles.dialogBody} onSubmit={(e) => { e.preventDefault(); confirm(); }}>
        {decision.record && <p className={styles.title}>{decision.record}</p>}
        <p className={styles.body}>{decision.description}</p>{children}
        {error && <p className={styles.feedback} role="alert">{error}</p>}
        <div className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Updating…' : decision.confirmLabel}</Button></div>
      </form>
    </div>
  </PortalDialog>;
}
