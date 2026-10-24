'use client';

import { useState } from 'react';
import { CircleDollarSign, Gauge, Info, Sparkles, X } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { aiUsage } from '@/domain/platform-admin';
import type { Tone } from '@/lib/status-tones';
import { PageTabs } from '@/components/ui/page-tabs';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './admin-workspaces.module.css';

export type AiFeature = { id: string; title: string; benchmark: string; priority: string; calls: number };
type Mode = 'on' | 'shadow' | 'off';
const PRIORITY_TONE: Record<string, Tone> = { Must: 'danger', Should: 'info', Could: 'muted' };
const MODES: { key: Mode; label: string }[] = [{ key: 'on', label: 'On' }, { key: 'shadow', label: 'Shadow' }, { key: 'off', label: 'Off' }];
const money = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(minor / 100);

export function AiWorkspace({ features }: { features: AiFeature[] }) {
  const [modes, setModes] = useState<Record<string, Mode>>(() => Object.fromEntries(features.map((f) => [f.id, f.priority === 'Could' ? 'shadow' : 'on'])));
  const [feedback, setFeedback] = useState<string | null>(null);
  const modelledCalls = features.reduce((n, f) => n + (modes[f.id] === 'on' ? f.calls : 0), 0);
  const usage = aiUsage(modelledCalls);
  return <div className={common.layout}>
    <div className={common.notice}><Info size={18} /><p>AI policy preview<span>These controls change this session’s illustration only. They do not update tenant database flags, provider budgets or a production kill switch. Usage and cost figures are modelled, not provider invoices.</span></p></div>
    <PageTabs label="Platform AI sections" items={[
      { id: 'controls', label: 'Feature controls', content: <Card className={common.panel}><CardHeader title="AI features & guardrails" subtitle="Review intended feature policies and evaluation targets before production activation." action={<StatusPill status="Session-only preview" tone="info" />} />
        {features.length ? features.map((f) => <div className={styles.feature} key={f.id}><div><span className={common.metadata}>{f.id}</span><h3 className={common.title}>{f.title}</h3><p className={common.metadata}>Evaluation target · {f.benchmark}</p></div><StatusPill status={f.priority} tone={PRIORITY_TONE[f.priority] ?? 'neutral'} /><div className={common.filters} aria-label={`Preview policy for ${f.title}`}>{MODES.map((m) => <Button key={m.key} type="button" aria-pressed={modes[f.id] === m.key} aria-label={`${f.title}: ${m.label} mode`} onClick={() => { setModes((p) => ({ ...p, [f.id]: m.key })); setFeedback(`${f.id}: ${m.label} selected in this session’s preview. No production policy was changed.`); }}>{m.label}</Button>)}</div></div>) : <EmptyState title="No AI features configured." description="Feature definitions will appear here when available." />}
      </Card> },
      { id: 'usage', label: 'Usage overview', content: <div className={common.layout}><div className={common.grid}><KpiCard label="Preview features on" value={`${features.filter((f) => modes[f.id] === 'on').length} / ${features.length}`} icon={<Sparkles size={18} />} /><KpiCard label="Modelled calls" value={modelledCalls.toLocaleString('en-NG')} icon={<Gauge size={18} />} /><KpiCard label="Modelled usage cost" value={money(usage.costMinor)} icon={<CircleDollarSign size={18} />} /></div><Card><CardHeader title="Production safeguards" subtitle="Required controls are not enabled by this preview." /><p className={common.body}>Tenant-isolated retrieval, provider fallbacks, per-feature budgets, persistent kill switches, redacted logs and human approval must be verified in the live AI gateway. Benchmark text is a target, not evidence of a completed evaluation.</p><p className={common.footnote}>Modelled cap usage: {usage.capPct}%. Shadow mode here does not run a provider or establish a free billing policy.</p></Card></div> },
    ]} />
    {feedback && <div className={common.feedback} role="status"><span>{feedback}</span><IconButton type="button" aria-label="Dismiss AI preview feedback" onClick={() => setFeedback(null)}><X size={18} /></IconButton></div>}
  </div>;
}
