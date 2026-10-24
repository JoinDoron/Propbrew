import type { ReactNode } from 'react';
import { Card, CardHeader, KpiCard } from '@/components/ui';
import { toneVar, type Tone } from '@/lib/status-tones';
import styles from './portal-workspaces.module.css';

export { Card as PortalCard } from '@/components/ui';
export function PortalKpi({ label, value, note, tone, icon }: { label: string; value: string; note?: string; tone: Tone; icon: ReactNode }) {
  return <div className={styles.kpi}><KpiCard label={label} value={value} icon={icon} iconColor={toneVar(tone)} />{note && <p>{note}</p>}</div>;
}
export function PortalSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <Card><CardHeader title={title} subtitle={subtitle} />{children}</Card>;
}
export const portalMoney = (minor: number, currency = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
