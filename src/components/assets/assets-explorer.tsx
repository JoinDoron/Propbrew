'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, CalendarClock, FileText, Plus, Search } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { ReadOnlyChip } from '@/components/domain';
import { humanizeStatus, statusTone, type Tone } from '@/lib/status-tones';

export type AssetRow = { id: string; name: string; category: string; serial: string; locationLabel: string; status: string; purchaseDate: string; warrantyExpiry: string };
export type PpmRow = { id: string; assetId: string; frequency: string; nextDue: string; overdue: boolean; checklistItems: number; assignee: string };
export type AssetJobRow = { id: string; ref: string; title: string; status: string; assetId?: string; costLabel: string };

const STATUS_TONE: Record<string, Tone> = { operational: 'success', degraded: 'warn', under_maintenance: 'info', out_of_service: 'danger', archived: 'muted' };
const NOW = '2026-07-26';

/** FM-01 — interactive asset register. Filter by status/category, search, and
 *  drill into an asset to see its PPM plans and full work-order service history —
 *  the "service history viewable per asset" the requirement calls for. */
export function AssetsExplorer({ assets, ppm, jobs, canMutate }: { assets: AssetRow[]; ppm: PpmRow[]; jobs: AssetJobRow[]; canMutate: boolean }) {
  const [status, setStatus] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(assets[0]?.id ?? null);

  const categories = useMemo(() => Array.from(new Set(assets.map((a) => a.category))).sort(), [assets]);
  const statusCounts = assets.reduce<Record<string, number>>((a, x) => ((a[x.status] = (a[x.status] ?? 0) + 1), a), {});

  const visible = useMemo(() => {
    let v = assets;
    if (status !== 'all') v = v.filter((a) => a.status === status);
    if (category !== 'all') v = v.filter((a) => a.category === category);
    if (q.trim()) {
      const s = q.toLowerCase();
      v = v.filter((a) => a.name.toLowerCase().includes(s) || a.serial.toLowerCase().includes(s) || a.locationLabel.toLowerCase().includes(s));
    }
    return v;
  }, [assets, status, category, q]);

  const selected = assets.find((a) => a.id === selectedId) ?? visible[0] ?? null;
  const selPpm = selected ? ppm.filter((p) => p.assetId === selected.id) : [];
  const selJobs = selected ? jobs.filter((j) => j.assetId === selected.id) : [];
  const warrantyExpired = selected ? selected.warrantyExpiry < NOW : false;

  const STATUSES = ['all', 'operational', 'degraded', 'under_maintenance', 'out_of_service'];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-colors inline-flex items-center gap-1.5 ${status === s ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>
            {s === 'all' ? 'All' : humanizeStatus(s)}<span className="text-text-3 font-mono">{s === 'all' ? assets.length : statusCounts[s] ?? 0}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="h-8 px-2 rounded-full border border-border-2 bg-surface text-[12px] outline-none focus:border-primary">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-2 h-8 px-2.5 rounded-full border border-border-2 bg-surface">
            <Search size={13} className="text-text-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets…" className="w-28 bg-transparent outline-none text-[12.5px]" aria-label="Search assets" />
          </div>
          {canMutate ? <Button variant="primary" icon={<Plus size={15} />} className="!h-8 !text-[12px]">Add asset</Button> : <ReadOnlyChip />}
        </div>
      </div>

      <div className="grid min-[900px]:grid-cols-[minmax(0,1fr)_380px] gap-3.5 items-start">
        {/* List */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          {visible.map((a) => {
            const active = selected?.id === a.id;
            return (
              <button key={a.id} onClick={() => setSelectedId(a.id)} className={`flex items-center gap-3 w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors ${active ? 'bg-primary-weak/50' : 'hover:bg-surface-2'}`}>
                <span className="w-9 h-9 rounded-lg bg-surface-2 text-text-2 flex items-center justify-center flex-none"><Boxes size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{a.name}</div>
                  <div className="text-[11.5px] text-text-3 truncate">{a.category} · {a.locationLabel}</div>
                </div>
                <StatusPill status={humanizeStatus(a.status)} tone={STATUS_TONE[a.status] ?? 'neutral'} />
              </button>
            );
          })}
          {visible.length === 0 && <div className="p-8 text-center text-[13px] text-text-3">No assets match.</div>}
        </div>

        {/* Detail */}
        {selected && (
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4 min-[900px]:sticky min-[900px]:top-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] truncate">{selected.name}</h3>
                <p className="text-[12px] text-text-3">{selected.category} · {selected.locationLabel}</p>
              </div>
              <StatusPill status={humanizeStatus(selected.status)} tone={STATUS_TONE[selected.status] ?? 'neutral'} />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3.5">
              <Fact label="Serial" value={selected.serial} mono />
              <Fact label="Purchased" value={selected.purchaseDate} mono />
              <Fact label="Warranty" value={selected.warrantyExpiry} mono danger={warrantyExpired} />
            </div>
            {warrantyExpired && <p className="text-[11.5px] text-negative mt-2">⚠ Warranty expired — out-of-pocket repairs.</p>}

            <Section title={`Maintenance plans (${selPpm.length})`}>
              {selPpm.length === 0 ? <p className="text-[12px] text-text-3">No PPM plan for this asset.</p> : (
                <div className="flex flex-col gap-1.5">
                  {selPpm.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-[12px]">
                      <CalendarClock size={14} className="text-text-3 flex-none" />
                      <span className="capitalize flex-1">{p.frequency} · {p.checklistItems} checks · {p.assignee}</span>
                      {p.overdue ? <StatusPill status="Overdue" tone="danger" /> : <StatusPill status={`Due ${p.nextDue.slice(5)}`} tone="success" />}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Service history (${selJobs.length})`}>
              {selJobs.length === 0 ? <p className="text-[12px] text-text-3">No work orders recorded.</p> : (
                <div className="flex flex-col gap-1.5">
                  {selJobs.map((j) => (
                    <Link key={j.id} href={`/work-orders/${j.ref}`} className="flex items-center gap-2 group">
                      <span className="font-mono text-[11.5px] font-semibold text-primary group-hover:underline flex-none">{j.ref}</span>
                      <span className="text-[12px] text-text-2 truncate flex-1">{j.title}</span>
                      <span className="text-[11.5px] font-mono text-text-3 flex-none">{j.costLabel}</span>
                      <StatusPill status={humanizeStatus(j.status)} tone={statusTone('work-order', j.status)} />
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Documents">
              <div className="flex flex-col gap-1.5">
                {['Warranty certificate', 'Service manual', 'Purchase invoice'].map((d) => (
                  <div key={d} className="flex items-center gap-2 text-[12px]">
                    <FileText size={14} className="text-text-3 flex-none" />
                    <span className="flex-1 truncate">{d}</span>
                    <span className="text-[11px] text-text-3">PDF</span>
                  </div>
                ))}
              </div>
            </Section>

            <Link href="/work-orders" className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline mt-3">
              Raise a work order <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, mono, danger }: { label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2.5 min-w-0">
      <div className="text-[10px] text-text-3 uppercase tracking-wide">{label}</div>
      <div className={`text-[12.5px] font-semibold mt-0.5 truncate ${mono ? 'font-mono' : ''} ${danger ? 'text-negative' : ''}`}>{value}</div>
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
