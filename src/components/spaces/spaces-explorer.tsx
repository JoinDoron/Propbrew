'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronRight, DoorClosed, Search, Users, Wallet } from 'lucide-react';
import { Card, CardHeader, EmptyState, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { toneVar, type Tone } from '@/lib/status-tones';
import { occupancyStats, revenueModel, vacancyTrend, rentOf } from '@/domain/spaces';
import { facilityMoney } from '@/components/facility/facility-format';
import layout from '@/components/ui/workspace-layout.module.css';
import polish from '@/components/facility/facility-registers-polish.module.css';

export type SiteNode = { id: string; name: string; address: string; kind: string; buildingCount: number; unitCount: number };
export type BuildingNode = { id: string; siteId: string; name: string; floors: number };
export type UnitNode = { id: string; siteId: string; buildingId: string; label: string; type: string; occupancy: string; residentName?: string };
const OCC_TONE: Record<string, Tone> = { occupied: 'success', vacant: 'neutral', reserved: 'info' };
type Selection = { kind: 'site' | 'building'; id: string };
const naira = (major: number) => facilityMoney(Math.round(major * 100));

export function SpacesExplorer({ sites, buildings, units }: { sites: SiteNode[]; buildings: BuildingNode[]; units: UnitNode[] }) {
  const treeId = useId();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(sites[0] ? [sites[0].id] : []));
  const [selected, setSelected] = useState<Selection>(sites[0] ? { kind: 'site', id: sites[0].id } : { kind: 'site', id: '' });
  const [occupancy, setOccupancy] = useState<'all' | 'occupied' | 'vacant'>('all');
  const [query, setQuery] = useState('');
  const selectedBuilding = selected.kind === 'building' ? buildings.find((building) => building.id === selected.id) : null;
  const selectedSite = sites.find((site) => site.id === (selectedBuilding?.siteId ?? selected.id));
  const scopeUnits = useMemo(() => units.filter((unit) => selected.kind === 'site' ? unit.siteId === selected.id : unit.buildingId === selected.id), [units, selected]);
  const shown = useMemo(() => scopeUnits.filter((unit) => (occupancy === 'all' || unit.occupancy === occupancy) && (!query.trim() || `${unit.label} ${unit.type} ${unit.residentName ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))), [scopeUnits, occupancy, query]);
  const stats = occupancyStats(scopeUnits);
  const revenue = revenueModel(scopeUnits);
  const trend = vacancyTrend(stats.rate);
  function toggle(siteId: string) { setExpanded((previous) => { const next = new Set(previous); if (next.has(siteId)) next.delete(siteId); else next.add(siteId); return next; }); }
  return <div className={polish.hierarchy}>
    <Card><CardHeader title="Locations" subtitle="Site → building → unit" /><nav aria-label="Site and building navigation" className="flex flex-col gap-3">{sites.length ? sites.map((site) => { const open = expanded.has(site.id); const scoped = units.filter((unit) => unit.siteId === site.id); const regionId = `${treeId}-${site.id}`; return <div key={site.id}><button type="button" aria-expanded={open} aria-controls={regionId} aria-pressed={selected.kind === 'site' && selected.id === site.id} onClick={() => { setSelected({ kind: 'site', id: site.id }); toggle(site.id); }} className={polish.treeButton}><ChevronRight aria-hidden="true" size={16} className={`flex-none ${open ? 'rotate-90' : ''}`} /><Building2 aria-hidden="true" size={18} className="flex-none text-primary" /><span className="min-w-0 flex-1"><strong className="block font-medium">{site.name}</strong><span className={polish.metadata}>{scoped.filter((unit) => unit.occupancy === 'occupied').length} / {scoped.length} occupied</span></span></button><div id={regionId} hidden={!open} className="ml-5 pl-3 border-l border-border">{buildings.filter((building) => building.siteId === site.id).map((building) => <button type="button" key={building.id} aria-pressed={selected.kind === 'building' && selected.id === building.id} onClick={() => setSelected({ kind: 'building', id: building.id })} className={polish.treeButton}><DoorClosed aria-hidden="true" size={16} className="flex-none" /><span className="flex-1">{building.name}</span><span className={polish.metadata}>{building.floors} floors</span></button>)}</div></div>; }) : <EmptyState title="No locations available" description="No sites are visible in your current Facility scope." />}</nav></Card>
    <div className={layout.layout}>
      <Card><CardHeader title={selectedBuilding ? `${selectedSite?.name ?? ''} · ${selectedBuilding.name}` : selectedSite?.name ?? 'Units'} subtitle={selectedSite?.address ?? 'Choose a site or building'} /><div className={layout.toolbar}><div className={layout.filters}>{(['all', 'occupied', 'vacant'] as const).map((value) => <button key={value} type="button" aria-pressed={occupancy === value} onClick={() => setOccupancy(value)} className="pb-filter capitalize">{value}</button>)}</div><label className={layout.search}><Search aria-hidden="true" size={18} /><input aria-label="Search units" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search unit, type or resident" /></label></div><p role="status" className={`${polish.metadata} mt-4`}>{shown.length} matching units · {scopeUnits.length} in the selected scope</p></Card>
      <PageTabs label="Space management sections" defaultTab="units" items={[
        { id: 'occupancy', label: 'Occupancy & modelled revenue', content: <div className={layout.layout}><div className={layout.metrics}><KpiCard label="Occupancy" value={`${stats.rate}%`} icon={<Users size={18} />} /><KpiCard label="Occupied units" value={String(stats.occupied)} /><KpiCard label="Vacant units" value={String(stats.vacant)} /><KpiCard label="Reserved units" value={String(stats.reserved)} /></div><Card><CardHeader title="Unit occupancy map" subtitle="Recorded unit status in the selected scope · not live access activity" /><div className="h-2 flex rounded overflow-hidden bg-surface-2 mb-6" role="img" aria-label={`${stats.occupied} occupied, ${stats.reserved} reserved, ${stats.vacant} vacant units`}>{(['occupied', 'reserved', 'vacant'] as const).map((status) => <span key={status} style={{ width: `${stats.total ? stats[status] / stats.total * 100 : 0}%`, background: toneVar(OCC_TONE[status]) }} />)}</div><ul className={polish.unitMap}>{scopeUnits.map((unit) => <li key={unit.id} style={{ background: `color-mix(in srgb, ${toneVar(OCC_TONE[unit.occupancy] ?? 'neutral')} 12%, var(--surface))` }} aria-label={`${unit.label}, ${unit.type}, ${unit.occupancy}, assumed rent ${naira(rentOf(unit.type))} per month`}><span className={polish.unitMapLabel}>{unit.label}</span><span className={polish.unitMapStatus}>{unit.occupancy}</span></li>)}</ul>{!scopeUnits.length && <EmptyState title="No units in this scope" description="Choose another site or building to view recorded occupancy." />}<div className={`${layout.filters} mt-6`}>{(['occupied', 'reserved', 'vacant'] as const).map((status) => <StatusPill key={status} status={status} tone={OCC_TONE[status]} />)}</div></Card><div className={layout.analytics}><Card><CardHeader title="Illustrative rental model" subtitle="NGN assumptions by unit type · not rent collected" action={<Wallet size={18} className="text-primary" />} /><dl className={layout.facts}><div><dt>Modelled occupied-unit rent / month</dt><dd>{naira(revenue.realized)}</dd></div><div><dt>Modelled lettable potential / month</dt><dd>{naira(revenue.potential)}</dd></div><div><dt>Modelled vacancy gap / month</dt><dd>{naira(revenue.vacancyLoss)}</dd></div><div><dt>Modelled occupied share</dt><dd>{revenue.capturePct}%</dd></div></dl><p className={`${polish.metadata} mt-6`}>Uses indicative rent assumptions, not recorded leases, invoices or bank payments. No currency conversion is applied.</p></Card><Card><CardHeader title="Illustrative occupancy trend" subtitle="Generated series ending at the recorded occupancy rate" /><Spark points={trend} /><p className={`${polish.metadata} mt-6`}>This is a modelled visual, not measured historical occupancy.</p></Card></div></div> },
        { id: 'units', label: 'Unit register', count: shown.length, content: <div className={polish.unitGrid}>{shown.length ? shown.map((unit) => <Card key={unit.id}><CardHeader title={unit.label} subtitle={unit.type} action={<StatusPill status={unit.occupancy} tone={OCC_TONE[unit.occupancy] ?? 'neutral'} />} /><p className={polish.body}>{unit.residentName ? `Resident: ${unit.residentName}` : 'No resident linked in this record'}</p></Card>) : <Card className="col-span-full"><EmptyState title="No units match" description="Change the occupancy filter, search or selected building." /></Card>}</div> },
      ]} />
      <p className={polish.metadata}>Spaces are shared with Estate management. <Link href="/people" className="text-primary underline">Residents</Link> and <Link href="/assets" className="text-primary underline">assets</Link> link to these units.</p>
    </div>
  </div>;
}

function Spark({ points }: { points: number[] }) {
  const width = 320, height = 100;
  if (!points.length) return <p className={polish.body}>No modelled trend available.</p>;
  const max = Math.max(...points, 1), min = Math.min(...points, 0), span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${index * step} ${height - (point - min) / span * (height - 8) - 4}`).join(' ');
  return <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Illustrative occupancy series: ${points.map((value) => `${Math.round(value * 10) / 10}%`).join(', ')}`}><path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
