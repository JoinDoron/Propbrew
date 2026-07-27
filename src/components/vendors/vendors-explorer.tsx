'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, FileText, Plus, Search, Star } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { ReadOnlyChip } from '@/components/domain';
import { humanizeStatus, statusTone, type Tone } from '@/lib/status-tones';

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
type Filter = 'all' | 'valid' | 'expiring' | 'expired';
type Sort = 'sla' | 'rating' | 'name';

/** FM-05 — interactive vendor directory. Filter by compliance, search, sort, and
 *  select a vendor to see its profile, documents and assigned jobs. */
export function VendorsExplorer({ vendors, jobs, canMutate }: { vendors: VendorRow[]; jobs: JobRow[]; canMutate: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('sla');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(vendors[0]?.id ?? null);

  const visible = useMemo(() => {
    let v = filter === 'all' ? vendors : vendors.filter((x) => x.compliance === filter);
    if (q.trim()) {
      const s = q.toLowerCase();
      v = v.filter((x) => x.name.toLowerCase().includes(s) || x.services.some((sv) => sv.toLowerCase().includes(s)) || x.coverage.toLowerCase().includes(s));
    }
    return [...v].sort((a, b) => (sort === 'sla' ? b.slaHitRate - a.slaHitRate : sort === 'rating' ? b.rating - a.rating : a.name.localeCompare(b.name)));
  }, [vendors, filter, q, sort]);

  const selected = vendors.find((v) => v.id === selectedId) ?? visible[0] ?? null;
  const counts = vendors.reduce<Record<string, number>>((a, v) => ((a[v.compliance] = (a[v.compliance] ?? 0) + 1), a), {});

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
            <option value="sla">Sort: SLA</option>
            <option value="rating">Sort: Rating</option>
            <option value="name">Sort: Name</option>
          </select>
          {canMutate ? <Button variant="primary" icon={<Plus size={15} />} className="!h-8 !text-[12px]">Onboard</Button> : <ReadOnlyChip />}
        </div>
      </div>

      <div className="grid min-[900px]:grid-cols-[minmax(0,1fr)_360px] gap-3.5 items-start">
        {/* List */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          {visible.map((v) => {
            const active = selected?.id === v.id;
            return (
              <button key={v.id} onClick={() => setSelectedId(v.id)} className={`flex items-center gap-3 w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors ${active ? 'bg-primary-weak/50' : 'hover:bg-surface-2'}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{v.name}</div>
                  <div className="text-[11.5px] text-text-3 truncate">{v.services.join(', ')}</div>
                </div>
                <StatusPill status={v.compliance} tone={COMPLIANCE_TONE[v.compliance] ?? 'neutral'} />
                <span className="font-mono text-[12.5px] text-text-2 w-11 text-right flex-none">{v.slaHitRate}%</span>
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

            <div className="grid grid-cols-3 gap-2 mt-3.5">
              <Metric label="Jobs" value={String(selected.jobsCompleted)} />
              <Metric label="SLA hit" value={`${selected.slaHitRate}%`} />
              <Metric label="Rating" value={`★ ${selected.rating}`} />
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
