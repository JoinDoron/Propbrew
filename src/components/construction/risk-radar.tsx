'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, Clock, Radar, ShieldAlert, X } from 'lucide-react';
import { Button, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { useConstructionReview, ConstructionSummary, ConstructionToast, constructionNaira as naira, ConstructionFrame, ConstructionPanel } from './construction-ui';
import { toneVar, type Tone } from '@/lib/status-tones';
import { RISK_LABEL, type RiskKind } from '@/domain/construction';
import { acknowledgeSignal, snoozeSignal, dismissSignal, escalateSignalToIssue } from '@/server/actions/construction';
import styles from './construction-insights-polish.module.css';

export type RadarSignal = { id: string; kind: RiskKind; projectId: string; projectName: string; severity: Tone; confidence: number; title: string; evidence: string; recommendation: string; nairaAtRiskMinor: number; href: string; state?: string; escalatedIssueId?: string };
const SEV_ORDER: Tone[] = ['danger', 'warn', 'info'];

export function RiskRadar({ signals, canMutate, canCreate = false }: { signals: RadarSignal[]; canMutate: boolean; canCreate?: boolean }) {
  const router = useRouter();
  const [showDismissed, setShowDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (message: string) => { setToast(message); setTimeout(() => setToast(null), 2600); };
  const { act, confirmation, pending } = useConstructionReview(() => router.refresh(), flash);
  const visible = signals.filter((signal) => showDismissed || (signal.state !== 'dismissed' && signal.state !== 'snoozed'));
  const totalAtRisk = signals.filter((signal) => signal.state !== 'dismissed').reduce((sum, signal) => sum + signal.nairaAtRiskMinor, 0);
  const byKind = new Map<RiskKind, number>();
  for (const signal of visible) byKind.set(signal.kind, (byKind.get(signal.kind) ?? 0) + 1);
  const severities = [...SEV_ORDER, ...Array.from(new Set(visible.map((signal) => signal.severity))).filter((tone) => !SEV_ORDER.includes(tone))];
  const severityLabel = (tone: Tone) => tone === 'danger' ? 'Critical' : tone === 'warn' ? 'Watch' : tone === 'info' ? 'Informational' : tone.replaceAll('_', ' ');

  return <ConstructionFrame>
    <ConstructionSummary><CardHeader title="Risk radar" subtitle="Deterministic detectors · advisory signals from recorded construction data" action={<Radar size={20} className="text-primary" />} /><div className={styles.radarSummary}><RadarPlot signals={visible} /><div className={styles.stack}><div className={styles.toolbar}><h2 className={styles.title}>{visible.filter((signal) => signal.severity === 'danger').length} critical · {visible.filter((signal) => signal.severity === 'warn').length} watch</h2><StatusPill status={visible.length + ' visible signals'} tone="info" /></div><dl className={styles.facts}><div><dt>Estimated exposure · NGN</dt><dd>{naira(totalAtRisk)}</dd></div><div><dt>Exposure scope</dt><dd>All non-dismissed signals, including snoozed records</dd></div></dl><p className={styles.text}>Every signal exposes its source evidence and rule-match score. Recommendations require human judgement; nothing acts on its own.</p><p className={styles.metadata}>Estimated exposures can overlap. Their sum is not a booked loss, invoice or calibrated probability of failure.</p></div></div></ConstructionSummary>

    <PageTabs label="Construction risk sections" items={[
      { id: 'signals', label: 'Risk signals', content: <div className={styles.stack}><div className={styles.toolbar}><p className={styles.metadata}>Showing {visible.length} of {signals.length} recorded signals · source records remain available for review.</p><Button type="button" aria-pressed={showDismissed} onClick={() => setShowDismissed((value) => !value)}>{showDismissed ? 'Hide' : 'Show'} snoozed/dismissed</Button></div>{severities.map((severity) => {
        const group = visible.filter((signal) => signal.severity === severity);
        return group.length ? <section key={severity} className={styles.stack} aria-label={severityLabel(severity) + ' risk signals'}><div className={styles.toolbar}><h2 className={styles.title}>{severityLabel(severity)}</h2><StatusPill status={group.length + ' signal(s)'} tone={severity} /></div>{group.map((signal) => <ConstructionPanel key={signal.id}><div className={styles.header}><CardHeader title={signal.title} subtitle={signal.projectName + ' · ' + RISK_LABEL[signal.kind]} action={<StatusPill status={signal.state ?? 'Active advisory'} tone={signal.state === 'dismissed' || signal.state === 'snoozed' ? 'muted' : severity} />} /></div><div className={styles.body}><div className={styles.stack}><div><h3 className={styles.rowTitle}>Recorded evidence</h3><p className={styles.text + ' mt-2'}>{signal.evidence || 'No source evidence text was supplied. Review the source record before acting.'}</p></div><div className={styles.notice}><h3 className={styles.rowTitle}>Suggested response</h3><p className={styles.text + ' mt-2'}>{signal.recommendation || 'No response recommendation was supplied.'}</p></div><dl className={styles.facts}><div><dt>Estimated exposure · NGN</dt><dd>{naira(signal.nairaAtRiskMinor)}</dd></div><div><dt>Rule-match score</dt><dd><ConfidenceBar value={signal.confidence} /></dd></div></dl></div></div><div className={styles.footer}><div className={styles.toolbar}><Link href={signal.href} className={styles.link}>Open source <ArrowUpRight size={16} aria-hidden="true" /></Link><div className={styles.actions}>{canMutate && signal.state !== 'ack' ? <Button type="button" disabled={pending} icon={<Check size={16} />} onClick={() => act(() => acknowledgeSignal(signal.id), 'Acknowledged')}>Acknowledge</Button> : null}{canMutate ? <Button type="button" disabled={pending} icon={<Clock size={16} />} onClick={() => act(() => snoozeSignal(signal.id), 'Snoozed')}>Snooze</Button> : null}{canMutate ? <Button type="button" disabled={pending} icon={<X size={16} />} onClick={() => act(() => dismissSignal(signal.id), 'Dismissed')}>Dismiss</Button> : null}{signal.escalatedIssueId ? <p className={styles.metadata}>Recorded site issue: {signal.escalatedIssueId}</p> : null}{canCreate && !signal.escalatedIssueId && signal.state !== 'escalated' ? <Button variant="primary" type="button" disabled={pending} icon={<ShieldAlert size={16} />} onClick={() => act(() => escalateSignalToIssue(signal.id, signal.projectId, signal.title), 'Escalate ' + signal.title, 'This creates a high-priority site issue from the advisory signal. Confirm the project and source evidence first.')}>Escalate to issue</Button> : null}</div></div></div></ConstructionPanel>)}</section> : null;
      })}{!visible.length ? <ConstructionPanel><EmptyState icon={<Radar size={26} />} title="No active risk signals in this snapshot" description="This is not independent assurance that the site is risk-free. Review the underlying site, safety and commercial records." /></ConstructionPanel> : null}</div> },
      { id: 'overview', label: 'Risk breakdown', content: <ConstructionPanel><div className={styles.header}><CardHeader title="Signals by detector" subtitle="Visible records grouped by the deterministic detector that raised them" action={<StatusPill status={showDismissed ? 'Includes hidden states' : 'Active view'} tone="info" />} /></div>{byKind.size ? <ul className={styles.list}>{[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([kind, count]) => <li key={kind} className={styles.row}><h3 className={styles.rowTitle}>{RISK_LABEL[kind]}</h3><StatusPill status={count + ' signal(s)'} tone="info" /></li>)}</ul> : <div className={styles.empty}><EmptyState title="No detector breakdown" description="No signals are visible with the current state filter." /></div>}<p className={styles.footer}>The state filter in Risk signals also updates this breakdown and the radar plot. Counts are recorded signals, not independently verified site incidents.</p></ConstructionPanel> },
      { id: 'methodology', label: 'Confidence & review', content: <ConstructionPanel><div className={styles.header}><CardHeader title="Understand the rule-match score" subtitle="Evidence strength for a fixed pattern · not model certainty or a failure probability" /></div><div className={styles.body}><div className={styles.stack}><p className={styles.text}>Signals are computed from your own records by fixed rules (no model). Confidence reflects how strongly the evidence matches the detector’s pattern — it is not a probability of failure.</p><dl className={styles.facts}><div><dt>Plot angle</dt><dd>Detector kind</dd></div><div><dt>Plot radius</dt><dd>Recorded severity</dd></div><div><dt>Dot size</dt><dd>Relative estimated NGN exposure</dd></div><div><dt>Execution policy</dt><dd>Human review before a recorded action</dd></div></dl><p className={styles.notice}>Check the source evidence, project and approval authority before changing a signal or escalating it to a site issue. Escalation does not confirm a field-team notification or bank payment.</p></div></div></ConstructionPanel> },
    ]} />
    {confirmation}
    {toast ? <ConstructionToast>{toast}</ConstructionToast> : null}
  </ConstructionFrame>;
}

/** Concentric radar: angle = detector kind, radius = severity, dot size = ₦ at risk. */
function RadarPlot({ signals }: { signals: RadarSignal[] }) {
  const size = 150, c = size / 2, rMax = c - 12;
  const kinds = [...new Set(signals.map((s) => s.kind))];
  const radiusFor = (sev: Tone) => sev === 'danger' ? rMax : sev === 'warn' ? rMax * 0.66 : rMax * 0.36;
  const maxNaira = Math.max(1, ...signals.map((s) => s.nairaAtRiskMinor));
  return (
    <svg role="img" aria-label={`Risk plot of ${signals.length} advisory signals by severity and detector kind; dot size represents estimated NGN exposure. The signal register provides the source evidence.`} width={size} height={size} className="flex-none">
      {[0.36, 0.66, 1].map((f, i) => <circle key={f} cx={c} cy={c} r={rMax * f} fill="none" stroke="var(--border-2)" strokeWidth="1" strokeDasharray={i === 2 ? undefined : '3 3'} />)}
      {kinds.map((_, i) => { const a = (i / Math.max(1, kinds.length)) * Math.PI * 2 - Math.PI / 2; return <line key={i} x1={c} y1={c} x2={c + Math.cos(a) * rMax} y2={c + Math.sin(a) * rMax} stroke="var(--border)" strokeWidth="1" />; })}
      {signals.map((s, i) => {
        const ki = kinds.indexOf(s.kind);
        const spread = signals.filter((x) => x.kind === s.kind).indexOf(s);
        const a = ((ki + spread * 0.18) / Math.max(1, kinds.length)) * Math.PI * 2 - Math.PI / 2;
        const r = radiusFor(s.severity);
        const dot = 2.5 + (s.nairaAtRiskMinor / maxNaira) * 4;
        return <circle key={s.id + i} cx={c + Math.cos(a) * r} cy={c + Math.sin(a) * r} r={dot} fill={toneVar(s.severity)} opacity={s.state === 'dismissed' ? 0.3 : 0.9} className="animate-fade" />;
      })}
      <circle cx={c} cy={c} r="3" fill="var(--text-3)" />
    </svg>
  );
}
function ConfidenceBar({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  return <div className={styles.stack}><span className={styles.rowTitle}>{percent}% · rule-match score</span><progress className={styles.progress} max={100} value={Math.max(0, Math.min(100, percent))} aria-label={'Deterministic rule-match score ' + percent + ' percent, not a failure probability'} /></div>;
}
