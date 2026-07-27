'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, ChevronRight, DoorClosed, Search } from 'lucide-react';
import { StatusPill } from '@/components/ui';
import type { Tone } from '@/lib/status-tones';

export type SiteNode = { id: string; name: string; address: string; kind: string; buildingCount: number; unitCount: number };
export type BuildingNode = { id: string; siteId: string; name: string; floors: number };
export type UnitNode = { id: string; siteId: string; buildingId: string; label: string; type: string; occupancy: string; residentName?: string };

const OCC_TONE: Record<string, Tone> = { occupied: 'success', vacant: 'neutral', reserved: 'info' };
type Selection = { kind: 'site' | 'building'; id: string };

/** FM-04 — interactive space explorer. The estate → building → unit hierarchy as
 *  a drill-down: pick a site or a building on the left, filter and search units
 *  on the right. Selection, occupancy filter and search are all client state. */
export function SpacesExplorer({ sites, buildings, units }: { sites: SiteNode[]; buildings: BuildingNode[]; units: UnitNode[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(sites[0] ? [sites[0].id] : []));
  const [selected, setSelected] = useState<Selection>(sites[0] ? { kind: 'site', id: sites[0].id } : { kind: 'site', id: '' });
  const [occ, setOcc] = useState<'all' | 'occupied' | 'vacant'>('all');
  const [q, setQ] = useState('');

  const toggle = (siteId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });

  const selectedSite = sites.find((s) => (selected.kind === 'site' ? s.id === selected.id : buildings.find((b) => b.id === selected.id)?.siteId === s.id));
  const selectedBuilding = selected.kind === 'building' ? buildings.find((b) => b.id === selected.id) : null;

  const visibleUnits = useMemo(() => {
    let u = units.filter((x) => (selected.kind === 'site' ? x.siteId === selected.id : x.buildingId === selected.id));
    if (occ !== 'all') u = u.filter((x) => x.occupancy === occ);
    if (q.trim()) {
      const s = q.toLowerCase();
      u = u.filter((x) => x.label.toLowerCase().includes(s) || x.type.toLowerCase().includes(s) || (x.residentName ?? '').toLowerCase().includes(s));
    }
    return u;
  }, [units, selected, occ, q]);

  const title = selectedBuilding ? `${selectedSite?.name} · ${selectedBuilding.name}` : selectedSite?.name ?? 'Units';

  return (
    <div className="grid min-[860px]:grid-cols-[280px_1fr] gap-3.5 items-start">
      {/* Tree */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-2 min-[860px]:sticky min-[860px]:top-2">
        {sites.map((site) => {
          const isOpen = expanded.has(site.id);
          const siteUnits = units.filter((u) => u.siteId === site.id);
          const occupied = siteUnits.filter((u) => u.occupancy === 'occupied').length;
          const active = selected.kind === 'site' && selected.id === site.id;
          return (
            <div key={site.id}>
              <button
                onClick={() => { setSelected({ kind: 'site', id: site.id }); if (!isOpen) toggle(site.id); }}
                className={`flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-xl transition-colors ${active ? 'bg-primary-weak' : 'hover:bg-surface-2'}`}
              >
                <span onClick={(e) => { e.stopPropagation(); toggle(site.id); }} className="flex-none">
                  <ChevronRight size={14} className={`text-text-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </span>
                <Building2 size={15} className={active ? 'text-primary' : 'text-text-3'} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] font-semibold truncate ${active ? 'text-primary' : ''}`}>{site.name}</span>
                  <span className="block text-[11px] text-text-3">{occupied}/{siteUnits.length} occupied</span>
                </span>
              </button>
              {isOpen && (
                <div className="ml-4 pl-2 border-l border-border">
                  {buildings.filter((b) => b.siteId === site.id).map((b) => {
                    const bActive = selected.kind === 'building' && selected.id === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelected({ kind: 'building', id: b.id })}
                        className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors ${bActive ? 'bg-primary-weak text-primary font-medium' : 'text-text-2 hover:bg-surface-2'}`}
                      >
                        <DoorClosed size={13} className="flex-none opacity-70" />
                        <span className="flex-1 truncate">{b.name}</span>
                        <span className="text-[11px] text-text-3">{b.floors}fl</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Units */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
            <p className="text-[12px] text-text-3">{visibleUnits.length} unit{visibleUnits.length === 1 ? '' : 's'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {(['all', 'occupied', 'vacant'] as const).map((o) => (
              <button key={o} onClick={() => setOcc(o)} className={`h-8 px-3 rounded-full text-[12px] font-medium capitalize border transition-colors ${occ === o ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>
                {o}
              </button>
            ))}
            <div className="flex items-center gap-2 h-8 px-2.5 rounded-full border border-border-2 bg-surface">
              <Search size={13} className="text-text-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search units…" className="w-28 bg-transparent outline-none text-[12.5px]" aria-label="Search units" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-2.5">
          {visibleUnits.map((u) => (
            <div key={u.id} className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-surface-2 text-text-2 flex items-center justify-center flex-none">
                <DoorClosed size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">{u.label}</div>
                <div className="text-[11.5px] text-text-3 truncate">{u.type}{u.residentName ? ` · ${u.residentName}` : ''}</div>
              </div>
              <StatusPill status={u.occupancy} tone={OCC_TONE[u.occupancy] ?? 'neutral'} />
            </div>
          ))}
          {visibleUnits.length === 0 && (
            <div className="col-span-full text-center text-[13px] text-text-3 py-8 border border-dashed border-border rounded-xl">No units match.</div>
          )}
        </div>

        <p className="text-[11.5px] text-text-3">
          Spaces are shared with the Estate module (FM-04). <Link href="/people" className="text-primary hover:underline">Residents</Link> and{' '}
          <Link href="/assets" className="text-primary hover:underline">assets</Link> link back to these units.
        </p>
      </div>
    </div>
  );
}
