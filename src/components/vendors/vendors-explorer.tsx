'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, FileText, Plus, Search, Star, Sparkles, Wallet, ShieldAlert } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
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
const naira = (minor: number) => (minor >= 1e8 ? `₦${(minor / 1e8).toFixed(1)}M` : minor >= 1e5 ? `₦${Math.round(minor / 1e5)}k` : `₦${Math.round(minor / 100)}`);

/** FM-05 — interactive vendor directory. Filter by compliance, search, sort, and
 *  select a vendor to see its profile, documents and assigned jobs. */
export function VendorsExplorer({ vendors, jobs, spend, canMutate }: { vendors: VendorRow[]; jobs: JobRow[]; spend: Record<string, number>; canMutate: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('score');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(vendors[0]?.id ?? null);
  const [service, setService] = useState<string>('');

  const visible = useMemo(() => {
    let v = filter === 'all' ? vendors : vendors.filter((x) => x.compliance === filter);
    if (q.trim()) {
      const s = q.toLowerCase();
      v = v.filter((x) => x.name.toLowerCase().includes(s) || x.services.some((sv) => sv.toLowerCase().includes(s)) || x.coverage.toLowerCase().includes(s));
    }
    return [...v].sort((a, b) => (sort === 'score' ? compositeScore(b as VendorMetrics) - compositeScore(a as VendorMetrics) : sort === 'sla' ? b.slaHitRate - a.slaHitRate : sort === 'rating' ? b.rating - a.rating : a.name.localeCompare(b.name)));
  }, [vendors, filter, q, sort]);

  const selected = vendors.find((v) => v.id === selectedId) ?? visible[0] ?? null;
  const counts = vendors.reduce<Record<string, number>>((a, v) => ((a[v.compliance] = (a[v.compliance] ?? 0) + 1), a), {});
  const services = useMemo(() => allServices(vendors as VendorMetrics[]), [vendors]);
  const recs = service ? recommendForService(vendors as VendorMetrics[], service) : [];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'valid', 'expiring', 'expired'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`h-8 px-3 rounded-full text-[12px] font-medium capitalize border transition-colors inline-flex items-center gap-1.5 ${filter === f ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>
            {f}<span className="text-text-3 font-mono">{f === 'all' ? vendors.length : counts[f] ?? 0}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 h-8 px-2.5 rounded-full border border-border-2 bg-surface">
            <Search size={13} className="text-text-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…" className="w-28 bg-transparent outline-none text-[12.5px]" aria-label="Search vendors" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-8 px-2 rounded-full border border-border-2 bg-surface text-[12px] outline-none focus:border-primary">
            <option value="score">Sort: Score</option>
            <option value="sla">Sort: SLA</option>
            <option value="rating">Sort: Rating</option>
            <option value="name">Sort: Name</option>
          </select>
          {canMutate ? <Button variant="primary" icon={<Plus size={15} />} className="!h-8 !text-[12px]">Onboard</Button> : <ReadOnlyChip />}
        </div>
      </div>

      {/* AI best-vendor recommender */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={14} className="text-primary" />
          <span className="text-[12.5px] font-semibold">Best vendor for</span>
          <select value={service} onChange={(e) => setService(e.target.value)} aria-label="Service" className="h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12.5px] outline-none focus:border-primary">
            <option value="">a job… (pick a service)</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-[10.5px] text-text-3 ml-auto">AI-assist · advisory ranking, you assign</span>
        </div>
        {recs.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-2.5">
            {recs.slice(0, 3).map((r, i) => (
              <button key={r.vendor.id} onClick={() => setSelectedId(r.vendor.id)} className="flex items-center gap-2.5 text-left px-2 py-1.5 rounded-lg hover:bg-surface-2">
                <span className={`w-5 h-5 rounded-md grid place-items-center text-[11px] font-bold flex-none ${i === 0 ? 'bg-primary text-white' : 'bg-surface-2 text-text-3'}`}>{i + 1}</span>
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-semibold truncate">{r.vendor.name}</div><div className="text-[11px] text-text-3 truncate">{r.reason}</div></div>
                <ScorePill score={r.score} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid min-[900px]:grid-cols-[minmax(0,1fr)_360px] gap-3.5 items-start">
        {/* List */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          {visible.map((v) => {
            const active = selected?.id === v.id;
            return (
              <button key={v.id} onClick={() => setSelectedId(v.id)} className={`flex items-center gap-3 w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors ${active ? 'bg-primary-weak/50' : 'hover:bg-surface-2'}`}>
                <ScorePill score={compositeScore(v as VendorMetrics)} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{v.name}</div>
                  <div className="text-[11.5px] text-text-3 truncate">{v.services.join(', ')}</div>
                </div>
                <StatusPill status={v.compliance} tone={COMPLIANCE_TONE[v.compliance] ?? 'neutral'} />
                <span className="font-mono text-[12.5px] text-text-2 w-11 text-right flex-none max-[560px]:hidden">{v.slaHitRate}%</span>
                <span className="font-mono text-[12.5px] text-text-2 w-10 text-right flex-none inline-flex items-center gap-0.5 justify-end"><Star size={11} className="fill-current text-warning" />{v.rating}</span>
              </button>
            );
          })}
          {visible.length === 0 && <div className="p-8 text-center text-[13px] text-text-3">No vendors match.</div>}
        </div>

        {/* Detail */}
        {selected && (
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4 min-[900px]:sticky min-[900px]:top-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{selected.name}</h3>
                <p className="text-[12px] text-text-3">{selected.coverage}</p>
              </div>
              <StatusPill status={selected.compliance} tone={COMPLIANCE_TONE[selected.compliance] ?? 'neutral'} />
            </div>

            {/* Scorecard */}
            <div className="flex items-center gap-3 mt-3.5 rounded-xl border border-border bg-surface-2 p-3">
              <ScoreDial score={compositeScore(selected as VendorMetrics)} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold">Composite score</div>
                <div className="text-[11px] text-text-3">SLA {selected.slaHitRate}% · ★{selected.rating} · {responsiveness(selected as VendorMetrics)} responsiveness (~{avgResponseHours(selected as VendorMetrics)}h)</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <Metric label="Jobs" value={String(selected.jobsCompleted)} />
              <Metric label="Spend YTD" value={spend[selected.id] ? naira(spend[selected.id]) : '—'} />
              <Metric label="SLA trend" value={`${selected.slaHitRate}%`} />
            </div>

            {/* Compliance-expiry alert */}
            {(() => {
              const e = complianceExpiry(selected.insuranceExpiry, NOW_MS);
              return (
                <div className="mt-3 rounded-xl p-3 flex items-center gap-2.5" style={{ background: `color-mix(in srgb, ${toneVar(EXPIRY_TONE[e.state])} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar(EXPIRY_TONE[e.state])} 35%, transparent)` }}>
                  <ShieldAlert size={16} style={{ color: toneVar(EXPIRY_TONE[e.state]) }} className="flex-none" />
                  <div className="flex-1 min-w-0"><div className="text-[12.5px] font-semibold">Insurance {e.label}</div><div className="text-[11px] text-text-3">exp {selected.insuranceExpiry}</div></div>
                  <Link href="/documents" className="text-[11.5px] text-primary hover:underline whitespace-nowrap">Documents →</Link>
                </div>
              );
            })()}

            {/* SLA trend */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-text-3 mb-1"><span className="inline-flex items-center gap-1"><Wallet size={12} /> SLA hit-rate trend</span><span>indicative</span></div>
              <TrendLine points={slaTrend(selected as VendorMetrics)} />
            </div>

            <Section title="Services">
              <div className="flex flex-wrap gap-1.5">
                {selected.services.map((s) => (
                  <span key={s} className="text-[11.5px] border border-border-2 rounded-full px-2.5 h-6 inline-flex items-center bg-surface-2">{s}</span>
                ))}
              </div>
            </Section>

            <Section title="Documents">
              <div className="flex flex-col gap-1.5">
                <DocRow label="Insurance certificate" expiry={selected.insuranceExpiry} tone={COMPLIANCE_TONE[selected.compliance] ?? 'neutral'} state={selected.compliance} />
                <DocRow label="CAC registration" expiry="—" tone="success" state="valid" />
                <DocRow label="Public liability cover" expiry={selected.insuranceExpiry} tone={selected.compliance === 'expired' ? 'danger' : 'success'} state={selected.compliance === 'expired' ? 'expired' : 'valid'} />
              </div>
            </Section>

            <Section title={`Assigned jobs (${jobs.filter((j) => j.vendorOrgId === selected.id).length})`}>
              <div className="flex flex-col gap-1.5">
                {jobs.filter((j) => j.vendorOrgId === selected.id).map((j) => (
                  <Link key={j.id} href={`/work-orders/${j.ref}`} className="flex items-center gap-2 group">
                    <span className="font-mono text-[11.5px] font-semibold text-primary group-hover:underline">{j.ref}</span>
                    <span className="text-[12px] text-text-2 truncate flex-1">{j.title}</span>
                    <StatusPill status={humanizeStatus(j.status)} tone={statusTone('work-order', j.status)} />
                  </Link>
                ))}
                {jobs.filter((j) => j.vendorOrgId === selected.id).length === 0 && (
                  <p className="text-[12px] text-text-3">No jobs currently assigned.</p>
                )}
              </div>
            </Section>

            <Link href="/work-orders" className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline mt-3">
              View all work orders <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
      </div>
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
  const w = 320, h = 40;
  const max = Math.max(...points, 1), min = Math.min(...points, 0), span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - ((p - min) / span) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(points.length - 1) * step} cy={h - ((points[points.length - 1] - min) / span) * (h - 4) - 2} r={2} fill="var(--primary)" />
    </svg>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2.5">
      <div className="text-[10px] text-text-3 uppercase tracking-wide">{label}</div>
      <div className="text-[15px] font-semibold mt-0.5 font-mono">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5 pt-3.5 border-t border-border">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3 mb-2">{title}</div>
      {children}
    </div>
  );
}

function DocRow({ label, expiry, tone, state }: { label: string; expiry: string; tone: Tone; state: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <FileText size={14} className="text-text-3 flex-none" />
      <span className="flex-1 truncate">{label}</span>
      {expiry !== '—' && <span className="text-text-3">exp {expiry}</span>}
      <StatusPill status={state} tone={tone} />
    </div>
  );
}
