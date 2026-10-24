'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, Boxes, CalendarClock, ClipboardCheck, Radar, ShieldAlert, ShieldX, Sparkles, Wrench, Zap } from 'lucide-react';
import { KpiCard, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/ui/page-header';
import { AskData } from '@/components/reports/ask-data';
import { toneVar, humanizeStatus, statusTone, type Tone } from '@/lib/status-tones';
import { auditReadiness, complianceState, daysUntil } from '@/domain/inspections';
import type { DashData, Severity } from './types';

const CLOSED = ['closed', 'cancelled', 'rejected', 'verified'];
const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
const SEV_TONE: Record<Severity, Tone> = { critical: 'danger', high: 'warn', medium: 'info' };

type Alert = { id: string; severity: Severity; category: string; icon: React.ReactNode; title: string; detail: string; href: string };

export function DashboardWorkspace(data: DashData) {
  const [estate, setEstate] = useState<string>('all');
  const inEstate = <T extends { estateId: string }>(rows: T[]) => (estate === 'all' ? rows : rows.filter((r) => r.estateId === estate));

  // filtered slices
  const wos = inEstate(data.workOrders);
  const invoices = inEstate(data.invoices);
  const sos = inEstate(data.sos);
  const risk = inEstate(data.risk);
  const obligations = inEstate(data.obligations);
  const ppmOverdue = inEstate(data.ppmOverdue);
  const inspOverdue = inEstate(data.inspectionsOverdue);
  const gaps = inEstate(data.coverageGaps);

  // KPIs
  const openWo = wos.filter((w) => !CLOSED.includes(w.status));
  const breached = openWo.filter((w) => w.breached).length;
  const billed = invoices.reduce((a, i) => a + i.amount.minor, 0);
  const collected = invoices.reduce((a, i) => a + i.paid.minor, 0);
  const collectionRate = billed ? Math.round((collected / billed) * 100) : 0;
  const arrears = invoices.filter((i) => ['overdue', 'in_arrears', 'escalated'].includes(i.status)).length;
  const activeSos = sos.filter((s) => s.status !== 'reviewed').length;
  const criticalRisk = risk.filter((r) => r.band === 'critical').length;

  // composite estate-health
  const sub: { label: string; score: number }[] = [];
  if (data.flags.wo) sub.push({ label: 'SLA', score: openWo.length ? Math.round((1 - breached / openWo.length) * 100) : 100 });
  if (data.flags.risk && risk.length) sub.push({ label: 'Maintenance', score: Math.max(0, 100 - Math.round(risk.reduce((a, r) => a + r.score, 0) / risk.length)) });
  if (data.flags.compliance && obligations.length) sub.push({ label: 'Compliance', score: auditReadiness(obligations as never).score });
  if (data.flags.inv && billed) sub.push({ label: 'Collections', score: collectionRate });
  const health = sub.length ? Math.round(sub.reduce((a, s) => a + s.score, 0) / sub.length) : 100;

  // attention feed
  const alerts = useMemo(() => buildAlerts({ wos, invoices, sos, risk, obligations, ppmOverdue, inspOverdue, gaps, now: data.now }), [wos, invoices, sos, risk, obligations, ppmOverdue, inspOverdue, gaps, data.now]);
  const shown = alerts.slice(0, 9);

  return (
    <div className="pb-section">
      {/* Header + estate filter */}
      <PageHeader title="Command center" subtitle={`Your operation at a glance · ${estate === 'all' ? data.scopeLabel : data.estates.find((e) => e.id === estate)?.name}`}
        actions={data.estates.length > 1 ? (
          <div className="ml-auto inline-flex rounded-lg border border-border-2 bg-surface p-0.5 flex-wrap">
            <FilterBtn active={estate === 'all'} onClick={() => setEstate('all')} label="All estates" />
            {data.estates.map((e) => <FilterBtn key={e.id} active={estate === e.id} onClick={() => setEstate(e.id)} label={e.name.replace(/ (Estate|Court)$/, '')} />)}
          </div>
        ) : undefined}
      />

      {/* Health + KPIs */}
      <div className="grid grid-cols-1 min-[900px]:grid-cols-[300px_1fr] gap-3.5">
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4 flex items-center gap-4">
          <HealthDial score={health} />
          <div className="min-w-0">
            <div className="text-[12px] text-text-3 uppercase tracking-wide">Estate health</div>
            <div className="text-sm font-medium mt-0.5">{healthLabel(health)}</div>
            <div className="flex flex-col gap-0.5 mt-1.5">
              {sub.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5 text-[12px]">
                  <span className="text-text-3 w-20">{s.label}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${s.score}%`, background: toneVar(s.score >= 80 ? 'success' : s.score >= 55 ? 'warn' : 'danger') }} /></span>
                  <span className="font-mono text-text-2 w-7 text-right">{s.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-3">
          {data.flags.wo && <KpiCard label="Open work orders" value={String(openWo.length)} delta={`${breached} breaching SLA`} positive={breached === 0} icon={<Wrench size={18} />} />}
          {data.flags.risk && <KpiCard label="At-risk assets" value={String(criticalRisk)} delta="AI-F-01 critical" positive={criticalRisk === 0} icon={<Sparkles size={18} />} iconBg="rgba(37,99,235,.12)" iconColor="#2563eb" />}
          {data.flags.compliance && <KpiCard label="Compliance" value={`${auditReadiness(obligations as never).score}%`} delta={`${obligations.filter((o) => complianceState(o.validUntil) === 'expired').length} lapsed`} positive={obligations.every((o) => complianceState(o.validUntil) !== 'expired')} icon={<ClipboardCheck size={18} />} iconBg="rgba(16,185,129,.12)" iconColor="#10b981" />}
          {data.flags.inv && <KpiCard label="Collection rate" value={`${collectionRate}%`} delta={`${arrears} in arrears`} positive={arrears === 0} icon={<Banknote size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />}
          {data.flags.sos && <KpiCard label="Active SOS" value={String(activeSos)} delta={activeSos ? 'needs response' : 'all clear'} positive={activeSos === 0} icon={<ShieldAlert size={18} />} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" />}
        </div>
      </div>

      {/* Attention feed + right column */}
      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_340px] gap-3.5 items-start">
        <div className="bg-surface border border-border rounded-2xl shadow-card">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
            <Radar size={15} className="text-primary" />
            <span className="text-sm font-medium">Needs your attention</span>
            <span className="text-[12px] text-text-3 ml-auto">{alerts.length} item{alerts.length === 1 ? '' : 's'} · ranked</span>
          </div>
          {shown.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-text-3">✓ Nothing urgent — your operation is on track.</div>
          ) : (
            shown.map((a) => (
              <Link key={a.id} href={a.href} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface-2 transition-colors group">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(SEV_TONE[a.severity])} 14%, transparent)`, color: toneVar(SEV_TONE[a.severity]) }}>{a.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{a.title}</span>
                    <StatusPill status={a.severity} tone={SEV_TONE[a.severity]} />
                  </div>
                  <div className="text-[12px] text-text-3 truncate">{a.category} · {a.detail}</div>
                </div>
                <ArrowRight size={15} className="text-text-3 group-hover:text-primary flex-none" />
              </Link>
            ))
          )}
          {alerts.length > shown.length && <div className="px-4 py-2 text-[12px] text-text-3">+{alerts.length - shown.length} more</div>}
        </div>

        <div className="pb-section">
          <AskData />
          {data.flags.wo && <Distribution title="Work-order pipeline" items={pipeline(wos)} />}
          {data.flags.compliance && obligations.length > 0 && <Distribution title="Compliance status" items={complianceDist(obligations)} />}
        </div>
      </div>
    </div>
  );
}

/* --- attention feed builder ------------------------------------------------ */

function buildAlerts(d: {
  wos: DashData['workOrders']; invoices: DashData['invoices']; sos: DashData['sos']; risk: DashData['risk'];
  obligations: DashData['obligations']; ppmOverdue: DashData['ppmOverdue']; inspOverdue: DashData['inspectionsOverdue']; gaps: DashData['coverageGaps']; now: string;
}): Alert[] {
  const out: Alert[] = [];
  // SOS
  for (const s of d.sos.filter((x) => x.status !== 'reviewed')) {
    const unack = s.ackSeconds === null;
    out.push({ id: `sos-${s.id}`, severity: unack ? 'critical' : 'high', category: 'Security', icon: <ShieldAlert size={16} />, title: `SOS ${s.ref}${unack ? ' — unacknowledged' : ` — ${humanizeStatus(s.status)}`}`, detail: s.residentName, href: '/security' });
  }
  // lapsed statutory compliance
  for (const o of d.obligations.filter((x) => complianceState(x.validUntil) === 'expired')) {
    const statutory = o.criticality === 'statutory';
    out.push({ id: `ob-${o.id}`, severity: statutory ? 'critical' : 'high', category: 'Compliance', icon: <ShieldX size={16} />, title: `${o.name} lapsed${statutory ? ' — shutdown risk' : ''}`, detail: `expired ${-daysUntil(o.validUntil!)}d ago · ${o.scopeLabel}`, href: '/inspections' });
  }
  // SLA breaches
  for (const w of d.wos.filter((x) => x.breached)) {
    out.push({ id: `wo-${w.id}`, severity: w.priority === 'emergency' ? 'critical' : 'high', category: 'Work order', icon: <Wrench size={16} />, title: `${w.ref} breaching SLA`, detail: w.title, href: `/work-orders/${w.ref}` });
  }
  // critical asset risk
  for (const r of d.risk.filter((x) => x.band === 'critical')) {
    out.push({ id: `risk-${r.assetId}`, severity: 'high', category: 'Predicted risk', icon: <Sparkles size={16} />, title: `${r.assetName} — failure risk ${r.score}`, detail: r.suggestReason ?? 'high failure risk', href: '/ppm' });
  }
  // runtime pull-forward
  for (const r of d.risk.filter((x) => x.band !== 'critical' && x.topDriver === 'runtime' && x.suggestReason)) {
    out.push({ id: `rt-${r.assetId}`, severity: 'high', category: 'Runtime', icon: <Zap size={16} />, title: `${r.assetName} — service due soon`, detail: r.suggestReason!, href: '/ppm' });
  }
  // expiring compliance
  for (const o of d.obligations.filter((x) => complianceState(x.validUntil) === 'expiring')) {
    out.push({ id: `exp-${o.id}`, severity: o.criticality === 'statutory' ? 'high' : 'medium', category: 'Compliance', icon: <CalendarClock size={16} />, title: `${o.name} expires in ${daysUntil(o.validUntil!)}d`, detail: o.scopeLabel, href: '/inspections' });
  }
  // overdue inspections
  for (const i of d.inspOverdue) out.push({ id: `insp-${i.id}`, severity: 'high', category: 'Inspection', icon: <ClipboardCheck size={16} />, title: `${i.template} overdue`, detail: i.ref, href: '/inspections' });
  // escalated / arrears
  for (const i of d.invoices.filter((x) => x.status === 'escalated')) out.push({ id: `inv-${i.id}`, severity: 'high', category: 'Billing', icon: <Banknote size={16} />, title: `${i.residentName} — arrears escalated`, detail: `${i.ref} · ${i.agingDays}d`, href: '/billing' });
  // overdue PPM
  for (const o of d.ppmOverdue) out.push({ id: `ppm-${o.id}`, severity: 'medium', category: 'Maintenance', icon: <CalendarClock size={16} />, title: `${o.assetName} — PPM overdue`, detail: `${o.frequency} service`, href: '/ppm' });
  // coverage gaps
  for (const g of d.gaps) out.push({ id: `gap-${g.id}`, severity: 'medium', category: 'Coverage', icon: <Radar size={16} />, title: `${g.name} — no maintenance plan`, detail: 'blind spot', href: '/ppm' });

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

/* --- distributions --------------------------------------------------------- */

function pipeline(wos: DashData['workOrders']) {
  const order = ['new', 'triaged', 'assigned', 'in_progress', 'on_hold', 'resolved', 'verified', 'closed'];
  const counts = wos.reduce<Record<string, number>>((a, w) => ((a[w.status] = (a[w.status] ?? 0) + 1), a), {});
  return order.filter((s) => counts[s]).map((s) => ({ label: humanizeStatus(s), value: counts[s], tone: statusTone('work-order', s) }));
}
function complianceDist(obs: DashData['obligations']) {
  const c = { valid: 0, expiring: 0, expired: 0, never: 0 };
  for (const o of obs) c[complianceState(o.validUntil)]++;
  return [
    { label: 'Valid', value: c.valid, tone: 'success' as Tone },
    { label: 'Expiring', value: c.expiring, tone: 'warn' as Tone },
    { label: 'Lapsed', value: c.expired, tone: 'danger' as Tone },
    { label: 'Never', value: c.never, tone: 'muted' as Tone },
  ].filter((x) => x.value > 0);
}

function Distribution({ title, items }: { title: string; items: { label: string; value: number; tone: Tone }[] }) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <div className="flex items-center gap-2 mb-3"><Boxes size={14} className="text-text-3" /><span className="text-sm font-medium">{title}</span></div>
      <div className="h-2.5 rounded-full overflow-hidden flex mb-2.5">
        {items.map((i) => <span key={i.label} title={`${i.label}: ${i.value}`} style={{ width: `${(i.value / total) * 100}%`, background: toneVar(i.tone) }} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((i) => (
          <span key={i.label} className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="w-2 h-2 rounded-sm" style={{ background: toneVar(i.tone) }} />{i.label}<span className="text-text-3 font-mono">{i.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* --- bits ------------------------------------------------------------------ */

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`pb-action ${`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${active ? 'bg-primary text-white' : 'text-text-2 hover:bg-surface-2'}`}`}>{label}</button>;
}

function HealthDial({ score }: { score: number }) {
  const tone: Tone = score >= 80 ? 'success' : score >= 55 ? 'warn' : 'danger';
  const color = toneVar(tone);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-3)" strokeWidth="3.5" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold text-[22px] leading-none" style={{ color }}>{score}</span>
        <span className="text-[9px] text-text-3">health</span>
      </div>
    </div>
  );
}

function healthLabel(s: number): string {
  return s >= 85 ? 'Strong — few open risks' : s >= 70 ? 'Stable — a few things to watch' : s >= 55 ? 'Under pressure — act on the feed' : 'At risk — urgent items below';
}
