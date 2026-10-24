'use client';

import { useId, useMemo, useState } from 'react';
import { FacilityKpi } from '@/components/facility/facility-ui';
import { FacilityDialog } from '@/components/facility/facility-ui';
import polish from '@/components/facility/facility-registers-polish.module.css';
import { facilityMoney } from '@/components/facility/facility-format';
import layout from '@/components/ui/workspace-layout.module.css';
import { Card, CardHeader, EmptyState } from '@/components/ui';
import Link from 'next/link';
import { ArrowUpRight, Boxes, CalendarClock, FileText, Plus, Search, HeartPulse, QrCode, TrendingDown } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { ReadOnlyChip } from '@/components/domain';
import { humanizeStatus, statusTone, toneVar, type Tone } from '@/lib/status-tones';
import { EXPECTED_LIFE_YEARS } from '@/domain/ppm';
import { AssetEditor, type AssetLocationOption } from '@/components/facility/asset-editor';

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

/** FM-01 — interactive asset register. Filter by status/category, search, and
 *  drill into an asset to see its PPM plans and full work-order service history —
 *  the "service history viewable per asset" the requirement calls for. */
export function AssetsExplorer({ assets, ppm, jobs, health, canMutate, registrationReady = false, locations = [] }: { assets: AssetRow[]; ppm: PpmRow[]; jobs: AssetJobRow[]; health: Record<string, AssetHealth>; canMutate: boolean; registrationReady?: boolean; locations?: AssetLocationOption[] }) {
  const detailsId = useId();
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

  const selected = visible.find((a) => a.id === selectedId) ?? visible[0] ?? null;
  const selPpm = selected ? ppm.filter((p) => p.assetId === selected.id) : [];
  const selJobs = selected ? jobs.filter((j) => j.assetId === selected.id) : [];
  const warrantyExpired = selected ? selected.warrantyExpiry < NOW : false;

  const STATUSES = ['all', 'operational', 'degraded', 'under_maintenance', 'out_of_service'];

  const selHealth = selected ? health[selected.id] : undefined;
  const selLife = selected ? lifecycle(selected.purchaseDate, selected.category) : null;

  return (
    <div className={layout.layout}>
      <PageTabs label="Asset register sections" defaultTab="register" items={[
        { id: 'health', label: 'Portfolio health', content: (
      <div className={layout.metrics}>
        <HealthKpi label="Assets" value={String(assets.length)} note={`${categories.length} categories`} tone="info" icon={<Boxes size={18} />} />
        <HealthKpi label="Health at risk" value={String(atRisk)} note={atRisk ? 'critical + elevated' : 'all healthy'} tone={atRisk ? 'danger' : 'success'} icon={<HeartPulse size={18} />} />
        <HealthKpi label="Warranty ≤ 60d" value={String(warrantySoon)} note="expiring soon" tone={warrantySoon ? 'warn' : 'success'} icon={<CalendarClock size={18} />} />
        <HealthKpi label="Downtime exposure" value={facilityMoney(totalExposure * 100)} note="illustrative trade / risk-band model" tone="progress" icon={<TrendingDown size={18} />} />
      </div>

        ) },
        { id: 'register', label: 'Assets & service history', count: assets.length, content: <div className={layout.layout}>
      <div className="pb-register-toolbar">
        <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className="pb-filter inline-flex items-center gap-1.5">
            {s === 'all' ? 'All' : humanizeStatus(s)}<span className="text-text-3 font-mono">{s === 'all' ? assets.length : statusCounts[s] ?? 0}</span>
          </button>
        ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter assets by category" className="pb-filter">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="pb-search">
            <Search size={16} className="text-text-3" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets…" className="w-40 bg-transparent outline-none" aria-label="Search assets" />
          </div>
          {canMutate ? registrationReady ? <AssetEditor locations={locations} /> : <Button variant="primary" disabled title="Asset registration is not connected" icon={<Plus size={15} />}>Add asset · unavailable</Button> : <ReadOnlyChip />}
        </div>
      </div>

      <div className={polish.detailGrid}>
        {/* List */}
        <Card padded={false} className="overflow-hidden"><div className={polish.registerHeader}><CardHeader title="Asset register" subtitle={`${visible.length} matching records · select an asset to inspect its history`} /></div>
          {visible.map((a) => {
            const active = selected?.id === a.id;
            return (
              <button key={a.id} type="button" aria-pressed={active} aria-controls={detailsId} onClick={() => setSelectedId(a.id)} className={polish.selection}>
                <span className="w-9 h-9 rounded-lg bg-surface-2 text-text-2 flex items-center justify-center flex-none"><Boxes size={16} /></span>
                <div className="min-w-0 flex-1">
                  <strong>{a.name}</strong>
                  <small>{a.category} · {a.locationLabel}</small>
                </div>
                {health[a.id] && <span className="font-mono text-[12px] font-bold tabular-nums flex-none" title={`Health ${100 - health[a.id].score}/100`} style={{ color: toneVar(BAND_TONE[health[a.id].band] ?? 'neutral') }}>{100 - health[a.id].score}</span>}
                <StatusPill status={humanizeStatus(a.status)} tone={STATUS_TONE[a.status] ?? 'neutral'} />
              </button>
            );
          })}
          {visible.length === 0 && <EmptyState title="No assets match" description="Adjust the status, category or search term to see scoped assets." />}
        </Card>

        {/* Detail */}
        {selected && (
          <section id={detailsId} aria-label={`${selected.name} asset details`}><Card className={polish.detailPanel}>
  <CardHeader title={selected.name} subtitle={`${selected.category} · ${selected.locationLabel}`} action={<StatusPill status={humanizeStatus(selected.status)} tone={STATUS_TONE[selected.status] ?? 'neutral'} />} />
  {canMutate && registrationReady && <div className="my-4"><AssetEditor asset={selected} /></div>}
  <dl className={polish.facts}><div><dt>Serial number</dt><dd>{selected.serial}</dd></div><div><dt>Purchase date</dt><dd>{selected.purchaseDate}</dd></div><div><dt>Warranty expiry</dt><dd className={warrantyExpired ? 'text-negative' : undefined}>{selected.warrantyExpiry}</dd></div></dl>
  {warrantyExpired && <p className="text-sm text-negative">Warranty expiry is recorded before the reference date. Check cover and repair terms before approving expenditure.</p>}
  {selHealth && <div className={polish.notice}><div className="relative flex-none w-[56px] h-[56px]"><svg width={56} height={56} viewBox="0 0 36 36" role="img" aria-label={`Rules-based asset health index ${100 - selHealth.score} out of 100`} className="-rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" /><circle cx="18" cy="18" r="15" fill="none" stroke={toneVar(BAND_TONE[selHealth.band] ?? 'neutral')} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${((100 - selHealth.score) / 100) * 94.2} 94.2`} /></svg><span aria-hidden="true" className="absolute inset-0 grid place-items-center text-lg font-medium tabular-nums">{100 - selHealth.score}</span></div><div><h4 className="text-sm font-medium">Rules-based asset health · {selHealth.band}</h4><p className={polish.body}>Top driver: {selHealth.topDriver}.</p><p className={polish.metadata}>{selHealth.confidence < .6 ? 'Incomplete signals · shadow mode. ' : ''}Advisory index, not a calibrated failure probability or an automatic repair approval.</p><p className={`${polish.metadata} mt-3`}>Illustrative downtime exposure: {facilityMoney(exposureNaira(selected.category, selHealth.band) * 100)}. Trade and risk-band assumptions, not a booked cost.</p></div></div>}
  {selLife && <Section title="Lifecycle estimate"><div className={layout.toolbar}><p className={polish.body}>{selLife.ageYears.toFixed(1)} of {selLife.lifeYears} assumed service years used</p><span className="text-sm tabular-nums">{selLife.usedPct}%</span></div><progress aria-label={`${selected.name} modelled lifecycle used`} value={selLife.usedPct} max={100} className={polish.progress} /><p className={polish.metadata}>Approximately {selLife.remainingYears.toFixed(1)} years of modelled life remaining. Inspect the actual condition before making a replacement decision.</p></Section>}
  <Section title={`Maintenance plans (${selPpm.length})`}>{selPpm.length ? <ul className="m-0 p-0 list-none">{selPpm.map((plan) => <li key={plan.id} className={polish.row}><CalendarClock size={18} className="text-text-3" /><div><p className="text-sm font-medium capitalize">{plan.frequency} maintenance</p><p className={polish.metadata}>{plan.checklistItems} checks · {plan.assignee}</p></div><StatusPill status={plan.overdue ? 'Overdue' : `Due ${plan.nextDue}`} tone={plan.overdue ? 'danger' : 'info'} /></li>)}</ul> : <p className={polish.body}>No PPM plan for this asset.</p>}</Section>
  <Section title={`Service history (${selJobs.length})`}>{selJobs.length ? <ul className="m-0 p-0 list-none">{selJobs.map((job) => <li key={job.id}><Link href={`/work-orders/${job.ref}`} className={polish.row}><div><span className="text-sm font-medium text-primary">{job.ref}</span><p className={polish.body}>{job.title}</p><p className={polish.metadata}>{job.costLabel}</p></div><StatusPill status={humanizeStatus(job.status)} tone={statusTone('work-order', job.status)} /></Link></li>)}</ul> : <p className={polish.body}>No work orders recorded.</p>}</Section>
  <Section title="Document references"><ul className="m-0 p-0 list-none">{['Warranty certificate', 'Service manual', 'Purchase invoice'].map((document) => <li key={document} className={polish.row}><FileText size={18} className="text-text-3" /><div><p className="text-sm">{document}</p><p className={polish.metadata}>Reference only · no verified file attached in this view</p></div></li>)}</ul></Section>
  <div className={layout.filters}><Link href="/work-orders" className={polish.link}>View work order register <ArrowUpRight size={16} /></Link><Button onClick={() => setShowQr(true)} icon={<QrCode size={18} />}>Asset label</Button></div>
  <p className={polish.metadata}>Reference snapshot: {NOW} · WAT. {registrationReady ? 'Changes are saved to this workspace. Assets are archived rather than deleted.' : 'Asset registration remains unavailable until its persistence workflow is connected.'}</p>
</Card></section>
        )}
      </div>

        </div> },
      ]} />

      {showQr && selected && <QrLabel asset={selected} onClose={() => setShowQr(false)} />}
    </div>
  );
}

function QrLabel({ asset, onClose }: { asset: AssetRow; onClose: () => void }) {
  const code = `AST-${asset.serial.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase()}`;
  return (
    <FacilityDialog title="Asset identification label" onClose={onClose} width={480}>
      <div className="text-center">
        <div className="text-[14px] font-semibold">{asset.name}</div>
        <div className="text-[12px] text-text-3 mb-3">{asset.locationLabel}</div>
        <div className="font-mono text-[15px] font-bold mt-3">{code}</div>
        <div className="text-[14px] text-text-3 mt-4">Reference label only. A scannable QR code and on-site asset lookup are not connected.</div>
        <Button variant="primary" onClick={onClose} className="pb-action mt-3 h-8 px-4 rounded-lg bg-primary text-white text-[14px] font-medium">Done</Button>
      </div>
    </FacilityDialog>
  );
}

const HealthKpi = FacilityKpi;



function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={polish.section}><h3>{title}</h3>{children}</section>;
}
