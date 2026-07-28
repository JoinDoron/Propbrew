'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, CalendarClock, FileText, Plus, Search, HeartPulse, QrCode, TrendingDown } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { ReadOnlyChip } from '@/components/domain';
import { humanizeStatus, statusTone, toneVar, type Tone } from '@/lib/status-tones';
import { EXPECTED_LIFE_YEARS } from '@/domain/ppm';

export type AssetRow = { id: string; name: string; category: string; serial: string; locationLabel: string; status: string; purchaseDate: string; warrantyExpiry: string };
export type PpmRow = { id: string; assetId: string; frequency: string; nextDue: string; overdue: boolean; checklistItems: number; assignee: string };
export type AssetJobRow = { id: string; ref: string; title: string; status: string; assetId?: string; costLabel: string };
export type AssetHealth = { score: number; band: string; topDriver: string; confidence: number };

const STATUS_TONE: Record<string, Tone> = { operational: 'success', degraded: 'warn', under_maintenance: 'info', out_of_service: 'danger', archived: 'muted' };
const BAND_TONE: Record<string, Tone> = { critical: 'danger', elevated: 'warn', healthy: 'success' };
const NOW = '2026-07-26';
const NOW_MS = Date.parse(NOW);
// Deterministic daily downtime exposure per trade (₦), scaled by health band.
const DOWNTIME_DAILY: Record<string, number> = { Power: 80_000, Elevators: 60_000, HVAC: 30_000, Plumbing: 25_000, Access: 15_000, Security: 20_000 };
const BAND_DAYS: Record<string, number> = { critical: 3, elevated: 1, healthy: 0 };

/** Health is inverse of risk score; exposure = trade daily cost × band days. */
function exposureNaira(category: string, band: string): number {
  return (DOWNTIME_DAILY[category] ?? 20_000) * (BAND_DAYS[band] ?? 0);
}
function lifecycle(purchaseDate: string, category: string) {
  const ageMs = NOW_MS - Date.parse(purchaseDate);
  const ageYears = ageMs / (365 * 24 * 3600 * 1000);
  const lifeYears = EXPECTED_LIFE_YEARS[category] ?? 10;
  const usedPct = Math.max(0, Math.min(100, Math.round((ageYears / lifeYears) * 100)));
  return { ageYears, lifeYears, usedPct, remainingYears: Math.max(0, lifeYears - ageYears) };
}
function hashGrid(s: string): boolean[] {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Array.from({ length: 36 }, (_, i) => ((h >> (i % 30)) & (i % 3 ? 1 : 3)) > 0 && ((Math.imul(h, i + 7) >> 5) & 1) === 1);
}

/** FM-01 — interactive asset register. Filter by status/category, search, and
 *  drill into an asset to see its PPM plans and full work-order service history —
 *  the "service history viewable per asset" the requirement calls for. */
export function AssetsExplorer({ assets, ppm, jobs, health, canMutate }: { assets: AssetRow[]; ppm: PpmRow[]; jobs: AssetJobRow[]; health: Record<string, AssetHealth>; canMutate: boolean }) {
  const [status, setStatus] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(assets[0]?.id ?? null);
  const [showQr, setShowQr] = useState(false);

  const categories = useMemo(() => Array.from(new Set(assets.map((a) => a.category))).sort(), [assets]);
  const statusCounts = assets.reduce<Record<string, number>>((a, x) => ((a[x.status] = (a[x.status] ?? 0) + 1), a), {});

  // Portfolio health summary for the intelligence strip.
  const atRisk = assets.filter((a) => ['critical', 'elevated'].includes(health[a.id]?.band ?? '')).length;
  const warrantySoon = assets.filter((a) => a.warrantyExpiry >= NOW && Date.parse(a.warrantyExpiry) - NOW_MS <= 60 * 24 * 3600 * 1000).length;
  const totalExposure = assets.reduce((n, a) => n + exposureNaira(a.category, health[a.id]?.band ?? 'healthy'), 0);

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

  const selHealth = selected ? health[selected.id] : undefined;
  const selLife = selected ? lifecycle(selected.purchaseDate, selected.category) : null;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Portfolio health strip */}
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <HealthKpi label="Assets" value={String(assets.length)} note={`${categories.length} categories`} tone="info" icon={<Boxes size={18} />} />
        <HealthKpi label="Health at risk" value={String(atRisk)} note={atRisk ? 'critical + elevated' : 'all healthy'} tone={atRisk ? 'danger' : 'success'} icon={<HeartPulse size={18} />} />
        <HealthKpi label="Warranty ≤ 60d" value={String(warrantySoon)} note="expiring soon" tone={warrantySoon ? 'warn' : 'success'} icon={<CalendarClock size={18} />} />
        <HealthKpi label="Downtime exposure" value={`₦${(totalExposure / 1000).toLocaleString()}k`} note="est. if unattended" tone="progress" icon={<TrendingDown size={18} />} />
      </div>

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
                {health[a.id] && <span className="font-mono text-[11px] font-bold tabular-nums flex-none" title={`Health ${100 - health[a.id].score}/100`} style={{ color: toneVar(BAND_TONE[health[a.id].band] ?? 'neutral') }}>{100 - health[a.id].score}</span>}
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

            {/* Asset health (AI-F-01) */}
            {selHealth && (
              <div className="mt-3.5 rounded-xl border p-3.5" style={{ borderColor: `color-mix(in srgb, ${toneVar(BAND_TONE[selHealth.band] ?? 'neutral')} 40%, transparent)`, background: `color-mix(in srgb, ${toneVar(BAND_TONE[selHealth.band] ?? 'neutral')} 5%, transparent)` }}>
                <div className="flex items-center gap-3">
                  <div className="relative flex-none" style={{ width: 52, height: 52 }}>
                    <svg width={52} height={52} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={toneVar(BAND_TONE[selHealth.band] ?? 'neutral')} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${((100 - selHealth.score) / 100) * 94.2} 94.2`} /></svg>
                    <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-[13px]" style={{ color: toneVar(BAND_TONE[selHealth.band] ?? 'neutral') }}>{100 - selHealth.score}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold flex items-center gap-1.5"><HeartPulse size={14} /> Asset health · <span className="capitalize" style={{ color: toneVar(BAND_TONE[selHealth.band] ?? 'neutral') }}>{selHealth.band}</span></div>
                    <div className="text-[11.5px] text-text-3 mt-0.5">Top driver: {selHealth.topDriver}{selHealth.confidence < 0.6 ? ' · low-confidence (shadow)' : ''}</div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: toneVar('progress') }}>Downtime exposure ~₦{exposureNaira(selected.category, selHealth.band).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Lifecycle / depreciation */}
            {selLife && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11.5px] mb-1"><span className="text-text-2 font-medium">Lifecycle · {selLife.ageYears.toFixed(1)} of {selLife.lifeYears} yrs used</span><span className="font-mono text-text-3">{selLife.usedPct}%</span></div>
                <div className="relative h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${selLife.usedPct}%`, background: toneVar(selLife.usedPct >= 85 ? 'danger' : selLife.usedPct >= 60 ? 'warn' : 'success') }} />
                </div>
                <div className="text-[10.5px] text-text-3 mt-1">~{selLife.remainingYears.toFixed(1)} yrs of expected life remaining · warranty {warrantyExpired ? 'expired' : `to ${selected.warrantyExpiry}`}</div>
              </div>
            )}

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

            <div className="flex items-center gap-4 mt-3">
              <Link href="/work-orders" className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline">
                Raise a work order <ArrowUpRight size={13} />
              </Link>
              <button onClick={() => setShowQr(true)} className="inline-flex items-center gap-1 text-[12px] text-text-2 hover:text-primary"><QrCode size={13} /> QR label</button>
            </div>
          </div>
        )}
      </div>

      {showQr && selected && <QrLabel asset={selected} onClose={() => setShowQr(false)} />}
    </div>
  );
}

function QrLabel({ asset, onClose }: { asset: AssetRow; onClose: () => void }) {
  const code = `AST-${asset.serial.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase()}`;
  const grid = hashGrid(asset.serial + asset.id);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)]" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-2xl shadow-float p-5 w-[300px] text-center">
        <div className="text-[13px] font-semibold">{asset.name}</div>
        <div className="text-[11px] text-text-3 mb-3">{asset.locationLabel}</div>
        <div className="mx-auto w-40 h-40 grid grid-cols-6 grid-rows-6 gap-0.5 p-2 bg-white rounded-lg">
          {grid.map((on, i) => <span key={i} className="rounded-[1px]" style={{ background: on ? '#0a0c14' : 'transparent' }} />)}
        </div>
        <div className="font-mono text-[15px] font-bold mt-3">{code}</div>
        <div className="text-[10.5px] text-text-3">Scan on-site to open this asset’s history</div>
        <button onClick={onClose} className="mt-3 h-8 px-4 rounded-lg bg-primary text-white text-[12.5px] font-medium">Done</button>
      </div>
    </div>
  );
}

function HealthKpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[13px] text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[21px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[11px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
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
