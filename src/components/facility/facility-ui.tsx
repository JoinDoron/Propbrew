'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { KpiCard, IconButton } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { toneVar, type Tone } from '@/lib/status-tones';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './facility-workspaces.module.css';

/** Facility-specific composition of the application reference components. */
export function FacilityKpi({ label, value, note, sub, tone = 'info', icon }: {
  label: string; value: string; note?: string; sub?: string; tone?: Tone; icon?: ReactNode;
}) {
  return <div className={value.length > 12 ? `${styles.kpi} ${styles.kpiLong}` : styles.kpi}><KpiCard label={label} value={value} icon={icon} iconColor={toneVar(tone)} />{note || sub ? <p className={styles.kpiNote}>{note ?? sub}</p> : null}</div>;
}

export function FacilityDialog({ title, children, onClose, pending = false, drawer = false, width = 600 }: {
  title: string; children?: ReactNode; onClose: () => void; pending?: boolean; drawer?: boolean; width?: number;
}) {
  return <PortalDialog label={title} onClose={onClose} width={width} drawer={drawer} canClose={!pending} dismissOnBackdrop={false}>
    <div className={drawer ? layout.drawer : layout.modal} aria-busy={pending}>
      <div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>{title}</h2><IconButton type="button" aria-label={`Close ${title.toLowerCase()}`} disabled={pending} onClick={onClose}><X size={18} aria-hidden="true" /></IconButton></div>
      <div className={`${layout.dialogBody} ${styles.dialogContent}`}>{children}</div>
    </div>
  </PortalDialog>;
}

export function FacilityFeedback({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <div role="status" className={layout.feedback}><span>{message}</span>{onDismiss ? <IconButton type="button" aria-label="Dismiss message" onClick={onDismiss}><X size={16} /></IconButton> : null}</div>;
}
