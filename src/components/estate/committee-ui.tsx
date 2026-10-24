'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { toneVar } from '@/lib/status-tones';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './committee.module.css';

export type CommitteeDecision = { title: string; description: string; record: string; confirmLabel: string; action: () => Promise<{ ok: boolean; error?: string; ref?: string }>; success: string };

export function committeeDate(iso: string) {
  const value = new Date(iso);
  return Number.isFinite(value.getTime()) ? value.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : iso;
}

export function CommitteeDecisionDialog({ decision, onClose, onDone }: { decision: CommitteeDecision; onClose: () => void; onDone: (message: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function submit() {
    if (pending) return;
    setError(null);
    start(async () => {
      try { const result = await decision.action(); if (!result.ok) { setError(result.error ?? 'The decision could not be recorded.'); return; } router.refresh(); onDone(result.ref ? `${decision.success} · ${result.ref}` : decision.success); }
      catch { setError('The decision could not be recorded. Please try again.'); }
    });
  }
  return <PortalDialog label={decision.title} onClose={onClose} width={520} canClose={!pending}><div className={layout.modal}><div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>{decision.title}</h2><IconButton aria-label={`Close ${decision.title.toLowerCase()}`} disabled={pending} onClick={onClose}><X size={18} /></IconButton></div><div className={layout.dialogBody}><p className={layout.title}>{decision.record}</p><p className={layout.body}>{decision.description}</p>{error && <p className={styles.error} role="alert">{error}</p>}</div><div className={`${layout.actions} ${styles.dialogActions}`}><Button disabled={pending} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={pending} onClick={submit} aria-busy={pending}>{pending ? 'Recording…' : decision.confirmLabel}</Button></div></div></PortalDialog>;
}

export function CommitteeMeter({ label, value, marker, met, summary, hint, children }: { label: string; value: number; marker: number; met: boolean; summary: string; hint: string; children?: ReactNode }) {
  return <div className={styles.meterGroup}><div className={styles.meterLabels}><span className={layout.body}>{label}</span><span className={layout.metadata} style={{ color: toneVar(met ? 'success' : 'warn') }}>{summary}</span></div><div className={styles.meter} role="img" aria-label={`${label}: ${summary}; ${hint}`}><span style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: toneVar(met ? 'success' : 'warn') }} /><i style={{ left: `${Math.min(100, Math.max(0, marker))}%` }} /></div><p className={layout.metadata}>{hint}</p>{children}</div>;
}

export function CommitteeFeedback({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className={layout.feedback} role="status"><span>{message}</span><IconButton aria-label="Dismiss committee notification" onClick={onDismiss}><X size={18} /></IconButton></div>;
}
