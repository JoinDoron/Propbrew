'use client';

import { useId, useMemo, useState } from 'react';
import polish from '@/components/facility/facility-registers-polish.module.css';
import { facilityMoney } from '@/components/facility/facility-format';
import layout from '@/components/ui/workspace-layout.module.css';
import { Card, CardHeader, EmptyState } from '@/components/ui';
import Link from 'next/link';
import { ArrowUpRight, FileText, Plus, Search, Star, Sparkles, ShieldAlert } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { ReadOnlyChip } from '@/components/domain';
import { humanizeStatus, statusTone, toneVar, type Tone } from '@/lib/status-tones';
import { compositeScore, responsiveness, avgResponseHours, complianceExpiry, slaTrend, recommendForService, allServices, type VendorMetrics } from '@/domain/vendors';

export type VendorRow = {
  id: string;
  name: string;
  services: string[];
  coverage: string;
  compliance: string;
  insuranceExpiry: string;
  jobsCompleted: number;
  slaHitRate: number;
  rating: number;
};
export type JobRow = { id: string; ref: string; title: string; status: string; vendorOrgId?: string };

const COMPLIANCE_TONE: Record<string, Tone> = { valid: 'success', expiring: 'warn', expired: 'danger' };
const EXPIRY_TONE: Record<string, Tone> = { expired: 'danger', soon: 'warn', ok: 'success' };
type Filter = 'all' | 'valid' | 'expiring' | 'expired';
type Sort = 'score' | 'sla' | 'rating' | 'name';
const NOW_MS = Date.parse('2026-07-26');

/** FM-05 — interactive vendor directory. Filter by compliance, search, sort, and
 *  select a vendor to see its profile, documents and assigned jobs. */
export function VendorsExplorer({ vendors, jobs, spend, spendLabels = {}, canMutate }: { vendors: VendorRow[]; jobs: JobRow[]; spend: Record<string, number>; spendLabels?: Record<string, string>; canMutate: boolean }) {
  const detailsId = useId();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('score');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(vendors[0]?.id ?? null);
  const [service, setService] = useState<string>('');
  const [section, setSection] = useState('directory');

  const visible = useMemo(() => {
    let v = filter === 'all' ? vendors : vendors.filter((x) => x.compliance === filter);
    if (q.trim()) {
      const s = q.toLowerCase();
      v = v.filter((x) => x.name.toLowerCase().includes(s) || x.services.some((sv) => sv.toLowerCase().includes(s)) || x.coverage.toLowerCase().includes(s));
    }
    return [...v].sort((a, b) => (sort === 'score' ? compositeScore(b as VendorMetrics) - compositeScore(a as VendorMetrics) : sort === 'sla' ? b.slaHitRate - a.slaHitRate : sort === 'rating' ? b.rating - a.rating : a.name.localeCompare(b.name)));
  }, [vendors, filter, q, sort]);

  const selected = visible.find((v) => v.id === selectedId) ?? visible[0] ?? null;
  const counts = vendors.reduce<Record<string, number>>((a, v) => ((a[v.compliance] = (a[v.compliance] ?? 0) + 1), a), {});
  const services = useMemo(() => allServices(vendors as VendorMetrics[]), [vendors]);
  const recs = service ? recommendForService(vendors as VendorMetrics[], service) : [];

  return (
    <div className={layout.layout}>
      <div className="pb-register-toolbar">
        <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'valid', 'expiring', 'expired'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className="pb-filter capitalize inline-flex items-center gap-1.5">
            {f}<span className="text-text-3 font-mono">{f === 'all' ? vendors.length : counts[f] ?? 0}</span>
          </button>
        ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="pb-search">
            <Search size={16} className="text-text-3" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…" className="w-40 bg-transparent outline-none" aria-label="Search vendors" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort vendor directory" className="pb-filter">
            <option value="score">Sort: Score</option>
            <option value="sla">Sort: SLA</option>
            <option value="rating">Sort: Rating</option>
            <option value="name">Sort: Name</option>
          </select>
          {canMutate ? <Button variant="primary" disabled title="Vendor onboarding is not connected" icon={<Plus size={15} />}>Onboard · unavailable</Button> : <ReadOnlyChip />}
        </div>
      </div>

      <PageTabs label="Vendor management sections" activeTab={section} onTabChange={setSection} items={[
        { id: 'matching', label: 'AI vendor matching', content: (
      <Card padded={false} className="p-6 max-[640px]:p-4">
        <CardHeader title="Rules-based vendor matching" subtitle="Recorded metrics support a human decision, not automatic assignment" />
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={14} className="text-primary" />
          <span className="text-[14px] font-semibold">Best vendor for</span>
          <select value={service} onChange={(e) => setService(e.target.value)} aria-label="Service for rules-based vendor matching" className="pb-filter">
            <option value="">a job… (pick a service)</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-[12px] text-text-3 ml-auto">Rules-based ranking from recorded metrics · no automatic assignment</span>
        </div>
        {recs.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2.5">
            {recs.slice(0, 3).map((r, i) => (
              <button key={r.vendor.id} onClick={() => { setSelectedId(r.vendor.id); setFilter('all'); setQ(''); setSection('directory'); }} className={polish.selection}>
                <span className={`w-5 h-5 rounded-md grid place-items-center text-[12px] font-bold flex-none ${i === 0 ? 'bg-primary text-white' : 'bg-surface-2 text-text-3'}`}>{i + 1}</span>
                <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold truncate">{r.vendor.name}</div><div className={polish.metadata}>{r.reason}</div></div>
                <ScorePill score={r.score} />
              </button>
            ))}
          </div>
        )}
      </Card>

        ) },
        { id: 'directory', label: 'Directory & compliance', count: vendors.length, content: (
      <div className={polish.detailGrid}>
        {/* List */}
        <Card padded={false} className="overflow-hidden"><div className={polish.registerHeader}><CardHeader title="Vendor directory" subtitle={`${visible.length} matching vendors · select a profile for compliance and work history`} /></div>
          {visible.map((v) => {
            const active = selected?.id === v.id;
            return (
              <button key={v.id} type="button" aria-pressed={active} aria-controls={detailsId} onClick={() => setSelectedId(v.id)} className={polish.selection}>
                <ScorePill score={compositeScore(v as VendorMetrics)} />
                <div className="min-w-0 flex-1">
                  <strong>{v.name}</strong>
                  <small>{v.services.join(', ')}</small>
                </div>
                <StatusPill status={v.compliance} tone={COMPLIANCE_TONE[v.compliance] ?? 'neutral'} />
                <span className="font-mono text-[14px] text-text-2 w-11 text-right flex-none max-[560px]:hidden">{v.slaHitRate}%</span>
                <span className="font-mono text-[14px] text-text-2 w-10 text-right flex-none inline-flex items-center gap-0.5 justify-end"><Star size={11} className="fill-current text-warning" />{v.rating}</span>
              </button>
            );
          })}
          {visible.length === 0 && <EmptyState title="No vendors match" description="Adjust the compliance filter, sort or search term." />}
        </Card>

        {/* Detail */}
        {selected && (
          <section id={detailsId} aria-label={`${selected.name} vendor details`}><Card className={polish.detailPanel}>
  <CardHeader title={selected.name} subtitle={selected.coverage} action={<StatusPill status={selected.compliance} tone={COMPLIANCE_TONE[selected.compliance] ?? 'neutral'} />} />
  <div className={polish.notice}><ScoreDial score={compositeScore(selected as VendorMetrics)} /><div><h4 className="text-sm font-medium">Rules-based composite index</h4><p className={polish.body}>Recorded SLA hit rate {selected.slaHitRate}% · rating {selected.rating} / 5.</p><p className={polish.metadata}>Modelled responsiveness: {responsiveness(selected as VendorMetrics)} · approximately {avgResponseHours(selected as VendorMetrics)} hours. This is not a measured response log or calibrated performance prediction.</p></div></div>
  <dl className={polish.facts}><div><dt>Recorded completed jobs</dt><dd>{selected.jobsCompleted}</dd></div><div><dt>Recorded job costs</dt><dd>{spendLabels[selected.id] ?? (spend[selected.id] !== undefined ? facilityMoney(spend[selected.id]) : 'Not recorded')}</dd></div><div><dt>Recorded SLA hit rate</dt><dd>{selected.slaHitRate}%</dd></div></dl>
  {(() => { const expiry = complianceExpiry(selected.insuranceExpiry, NOW_MS); return <div className={polish.notice}><ShieldAlert size={20} style={{ color: toneVar(EXPIRY_TONE[expiry.state]) }} /><div><h4 className="text-sm font-medium">Insurance {expiry.label}</h4><p className={polish.body}>Recorded expiry: {selected.insuranceExpiry}.</p><p className={polish.metadata}>Expiry is checked against the 26 July 2026 reference snapshot. Confirm the original policy before assigning restricted work.</p><Link href="/documents" className={polish.link}>Open document register <ArrowUpRight size={16} /></Link></div></div>; })()}
  <Section title="Illustrative SLA trend"><TrendLine points={slaTrend(selected as VendorMetrics)} /><p className={polish.metadata}>Generated series based on the recorded SLA percentage, not measured historical delivery.</p></Section>
  <Section title="Service coverage"><div className={layout.filters}>{selected.services.map((service) => <span key={service} className="border border-border rounded-md px-3 py-2 text-sm bg-surface-2">{service}</span>)}</div></Section>
  <Section title="Compliance document references"><DocRow label="Insurance certificate" expiry={selected.insuranceExpiry} tone={COMPLIANCE_TONE[selected.compliance] ?? 'neutral'} state={`Recorded: ${selected.compliance}`} /><DocRow label="CAC registration" expiry="—" tone="neutral" state="File not verified" /><DocRow label="Public liability cover" expiry={selected.insuranceExpiry} tone="neutral" state="Cover not verified" /><p className={polish.metadata}>Document names and summary metadata are not evidence that an original or current certificate has been attached.</p></Section>
  <Section title={`Assigned jobs (${jobs.filter((job) => job.vendorOrgId === selected.id).length})`}><ul className="m-0 p-0 list-none">{jobs.filter((job) => job.vendorOrgId === selected.id).map((job) => <li key={job.id}><Link href={`/work-orders/${job.ref}`} className={polish.row}><div><span className="text-sm font-medium text-primary">{job.ref}</span><p className={polish.body}>{job.title}</p></div><StatusPill status={humanizeStatus(job.status)} tone={statusTone('work-order', job.status)} /></Link></li>)}</ul>{!jobs.some((job) => job.vendorOrgId === selected.id) && <p className={polish.body}>No jobs currently assigned.</p>}</Section>
  <Link href="/work-orders" className={polish.link}>View all work orders <ArrowUpRight size={16} /></Link>
</Card></section>
        )}
      </div>
        ) },
      ]} />
    </div>
  );
}

function scoreTone(score: number): Tone {
  return score >= 75 ? 'success' : score >= 55 ? 'warn' : 'danger';
}
function ScorePill({ score }: { score: number }) {
  return <span className="font-mono text-[12px] font-bold w-8 text-center rounded-md flex-none py-0.5" style={{ background: `color-mix(in srgb, ${toneVar(scoreTone(score))} 14%, transparent)`, color: toneVar(scoreTone(score)) }}>{score}</span>;
}
function ScoreDial({ score }: { score: number }) {
  const color = toneVar(scoreTone(score));
  return (
    <div className="relative flex-none" style={{ width: 48, height: 48 }}>
      <svg width={48} height={48} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(score / 100) * 94.2} 94.2`} /></svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-[12px]" style={{ color }}>{score}</span>
    </div>
  );
}
function TrendLine({ points }: { points: number[] }) {
  const w = 320, h = 100;
  const max = Math.max(...points, 1), min = Math.min(...points, 0), span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - ((p - min) / span) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Illustrative SLA series: ${points.map((point) => `${Math.round(point * 10) / 10}%`).join(', ')}`} className="overflow-visible">
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(points.length - 1) * step} cy={h - ((points[points.length - 1] - min) / span) * (h - 4) - 2} r={2} fill="var(--primary)" />
    </svg>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className={polish.section}><h3>{title}</h3>{children}</section>; }

function DocRow({ label, expiry, tone, state }: { label: string; expiry: string; tone: Tone; state: string }) {
  return (
    <div className={polish.row}>
      <FileText size={14} className="text-text-3 flex-none" />
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      {expiry !== '—' && <span className="text-text-3">exp {expiry}</span>}
      <StatusPill status={state} tone={tone} />
    </div>
  );
}
