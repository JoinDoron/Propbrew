'use client';

import { PageTabs } from '@/components/ui/page-tabs';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, Check, ChevronLeft, ChevronRight, House, LayoutGrid, List, MapPin, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import type { EstatePropertySummary } from '@/domain/estate/properties';
import { filterEstateProperties, propertyAvailability, type PropertyAvailabilityFilter, type PropertySort } from '@/domain/estate/property-browser';
import styles from './estate-properties.module.css';

const PAGE_SIZE = 12;
const count = (value: number) => value.toLocaleString('en-NG');
const percentage = (value: number | null) => value === null ? 'Not measured' : `${Number(value.toFixed(1))}%`;
const OCCUPANCY_LABEL = { vacant: 'Vacant', occupied: 'Occupied', reserved: 'Reserved', unavailable: 'Unavailable' } as const;

export function EstatePropertiesWorkspace({ properties, actions, demo = false }: {
  properties: EstatePropertySummary[]; actions?: ReactNode; demo?: boolean;
}) {
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [query, setQuery] = useState('');
  const [unitType, setUnitType] = useState('all');
  const [availability, setAvailability] = useState<PropertyAvailabilityFilter>('all');
  const [sort, setSort] = useState<PropertySort>('name');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  // A refreshed property/tenant record must not leave a stale unit snapshot open.
  const selected = properties.find((property) => property.id === selectedId);
  useEffect(() => {
    if (selected && !detailDialog.current?.open) detailDialog.current?.showModal();
    if (!selected && detailDialog.current?.open) detailDialog.current.close();
  }, [selected]);

  const totalUnits = properties.reduce((sum, property) => sum + property.unitCount, 0);
  const occupied = properties.reduce((sum, property) => sum + property.occupiedUnits, 0);
  const vacant = properties.reduce((sum, property) => sum + property.vacantUnits, 0);
  const reserved = properties.reduce((sum, property) => sum + property.reservedUnits, 0);
  const unavailable = properties.reduce((sum, property) => sum + property.unavailableUnits, 0);
  const unitTypes = Array.from(new Set(properties.flatMap((property) => property.unitTypes))).sort((a, b) => a.localeCompare(b, 'en-NG', { numeric: true }));
  const filtered = filterEstateProperties(properties, { query, unitType, availability, sort });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const activePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE);
  const hasFilters = query.trim() !== '' || unitType !== 'all' || availability !== 'all';
  function resetFilters() { setQuery(''); setUnitType('all'); setAvailability('all'); setPage(0); }

  return <div className={styles.workspace}>
<header className={styles.header}><div><p className={styles.eyebrow}>Estate register</p><h2>Properties</h2><p>Manage your rental properties and units, from one clear view.</p></div>{actions}</header>
{demo ? <p className={styles.scope}><Check size={12} aria-hidden="true" />Sample workspace · your authorised estate records only. New records reset when the app restarts.</p> : <p className={styles.scope}><Check size={12} aria-hidden="true" />Only properties and units your account can access are included.</p>}
<PageTabs label="Property register sections" items={[
{ id: 'register', label: 'Properties', count: properties.length, content: <div className={styles.sectionStack}>

<section className={styles.register} aria-labelledby="property-register-heading">
      <div className={styles.registerHeading}><div><h2 id="property-register-heading">Property register</h2><p>Find a property, check its occupancy, and open its unit register.</p></div><div className={styles.views} role="group" aria-label="Property view">
        <button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => { setView('list'); setPage(0); }}><List size={15} aria-hidden="true" />List</button>
        <button type="button" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => { setView('grid'); setPage(0); }}><LayoutGrid size={14} aria-hidden="true" />Grid</button>
      </div></div>

      <div className={styles.filters}>
        <label className={styles.search}><Search size={15} aria-hidden="true" /><span className="sr-only">Search properties</span><input placeholder="Search properties, addresses or units…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        <label className={styles.filter}><span>Unit type</span><select value={unitType} onChange={(event) => { setUnitType(event.target.value); setPage(0); }}><option value="all">All unit types</option>{unitTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className={styles.filter}><span>Availability</span><select value={availability} onChange={(event) => { setAvailability(event.target.value as PropertyAvailabilityFilter); setPage(0); }}><option value="all">All properties</option><option value="vacant">Has vacant units</option><option value="occupied">Fully occupied</option><option value="reserved">Has reserved units</option><option value="empty">No registered units</option></select></label>
        <label className={styles.filter}><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value as PropertySort); setPage(0); }}><option value="name">Name A–Z</option><option value="vacant">Most vacant units</option><option value="occupancy">Highest occupancy</option><option value="units">Most units</option></select></label>
      </div>
      <div className={styles.resultBar}><p role="status" aria-live="polite">{filtered.length ? `Showing ${activePage * PAGE_SIZE + 1}–${Math.min((activePage + 1) * PAGE_SIZE, filtered.length)} of ${count(filtered.length)} ${filtered.length === 1 ? 'property' : 'properties'}` : 'No matching properties'}{hasFilters ? ` · ${count(properties.length)} total` : ''}</p>{hasFilters ? <button type="button" onClick={resetFilters}><X size={12} aria-hidden="true" />Clear filters</button> : null}</div>

      {!shown.length ? <div className={styles.empty}><Building2 size={35} aria-hidden="true" /><h3>{properties.length ? 'No properties match these filters' : 'Your property register starts here'}</h3><p>{properties.length ? 'Try a different name, address, unit type or availability.' : 'Add your first property to start organising units and tracking occupancy. If your role is read-only, ask your estate manager to register it.'}</p>{hasFilters ? <button type="button" className={styles.detailButton} onClick={resetFilters}>Reset filters</button> : null}</div>
        : view === 'list' ? <div className={styles.tableScroll}><table className={styles.table} aria-label="Property list"><thead><tr><th scope="col">Property</th><th scope="col">Unit types</th><th scope="col">Units</th><th scope="col">Occupancy</th><th scope="col">Availability</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{shown.map((property) => <tr key={property.id}>
          <th scope="row"><div className={styles.propertyCell}><span className={styles.propertyIcon}><Building2 size={20} aria-hidden="true" /></span><span><button className={styles.propertyName} type="button" onClick={() => setSelectedId(property.id)}>{property.name}</button><span className={styles.address}>{property.address || 'Address not recorded'}</span></span></div></th>
          <td><span className={styles.typeChip} title={property.unitTypes.join(', ')}>{typeLabel(property)}</span></td><td><strong className={styles.unitNumber}>{count(property.unitCount)}</strong></td><td><Occupancy property={property} /></td><td><Availability property={property} /></td><td><button className={styles.detailButton} type="button" aria-label={`View units at ${property.name}`} onClick={() => setSelectedId(property.id)}>View units<ChevronRight size={13} aria-hidden="true" /></button></td>
        </tr>)}</tbody></table></div>
          : <div className={styles.grid} aria-label="Property grid">{shown.map((property, index) => <article key={property.id} className={styles.card} aria-labelledby={`property-card-${index}`}>
            <div className={styles.cardVisual} aria-hidden="true"><div className={styles.visualLines} /><Building2 size={51} strokeWidth={1.2} /><span>{count(property.unitCount)} {property.unitCount === 1 ? 'unit' : 'units'}</span></div>
            <div className={styles.cardBody}><div className={styles.cardTitle}><h3 id={`property-card-${index}`}><button type="button" onClick={() => setSelectedId(property.id)}>{property.name}</button></h3><span className={styles.typeChip}>{typeLabel(property)}</span></div><p className={styles.cardAddress}><MapPin size={13} aria-hidden="true" />{property.address || 'Address not recorded'}</p><Occupancy property={property} /><div className={styles.cardNumbers}><span><strong>{count(property.occupiedUnits)}</strong>occupied</span><span><strong>{count(property.vacantUnits)}</strong>vacant</span><span><strong>{count(property.reservedUnits)}</strong>reserved</span></div><div className={styles.cardFooter}><Availability property={property} /><button className={styles.detailButton} type="button" aria-label={`View units at ${property.name}`} onClick={() => setSelectedId(property.id)}>View units<ChevronRight size={13} aria-hidden="true" /></button></div></div>
          </article>)}</div>}

      <footer className={styles.registerFooter}><p><SlidersHorizontal size={12} aria-hidden="true" />Counts reflect registered unit records, not declared property capacity. No subscription limit is assumed.</p>{pageCount > 1 ? <nav className={styles.pagination} aria-label="Property pages"><button type="button" aria-label="Previous property page" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}><ChevronLeft size={15} /></button><span>{activePage + 1} / {pageCount}</span><button type="button" aria-label="Next property page" disabled={activePage + 1 >= pageCount} onClick={() => setPage(activePage + 1)}><ChevronRight size={15} /></button></nav> : null}</footer>
    </section>
</div> },
{ id: 'overview', label: 'Occupancy summary', content: <div className={styles.sectionStack}>

<section className={styles.metrics} aria-label="Property register summary">
      <Metric title="Total properties" value={count(properties.length)} note="Registered estate properties" icon={<Building2 size={17} />} />
      <Metric title="Total units" value={count(totalUnits)} note="Across registered property inventory" icon={<House size={17} />} />
      <Metric title="Occupied units" value={count(occupied)} note={totalUnits ? `${percentage(occupied / totalUnits * 100)} occupancy of registered units` : 'Occupancy not measured yet'} icon={<Users size={17} />} />
      <Metric title="Vacant units" value={count(vacant)} note={`${count(reserved)} reserved · ${count(unavailable)} unavailable`} icon={<MapPin size={17} />} />
    </section>
    <UnitAvailability total={totalUnits} occupied={occupied} vacant={vacant} reserved={reserved} unavailable={unavailable} />
</div> }
]} />
<dialog ref={detailDialog} className={styles.dialog} aria-labelledby="property-detail-heading" onCancel={() => setSelectedId(null)} onClose={() => setSelectedId(null)}>
      {selected ? <><header className={styles.dialogHeader}><div><p className={styles.eyebrow}>Property & unit register</p><h2 id="property-detail-heading">{selected.name}</h2><p>{selected.address}</p></div><button type="button" aria-label="Close property details" onClick={() => setSelectedId(null)}><X size={18} /></button></header><div className={styles.dialogBody}><div className={styles.detailStats}><span><strong>{count(selected.unitCount)}</strong> registered units</span><span><strong>{count(selected.occupiedUnits)}</strong> occupied</span><span><strong>{count(selected.vacantUnits)}</strong> vacant</span></div>{selected.units.length ? <div className={styles.tableScroll}><table className={styles.table} aria-label={`Units at ${selected.name}`}><thead><tr><th scope="col">Unit</th><th scope="col">Type</th><th scope="col">Occupancy</th></tr></thead><tbody>{selected.units.map((unit) => <tr key={unit.id}><th scope="row">{unit.label}</th><td>{unit.type}</td><td><span className={styles.status} data-tone={unit.occupancy === 'occupied' ? 'success' : 'neutral'}>{OCCUPANCY_LABEL[unit.occupancy]}</span></td></tr>)}</tbody></table></div> : <p className={styles.noUnits}>No units have been registered for this property yet.</p>}<p className={styles.detailNote}>This is the property inventory. Occupancy does not expose resident contact details or financial records.</p></div><footer className={styles.dialogFooter}><button type="button" className={styles.detailButton} onClick={() => setSelectedId(null)}>Done</button></footer></> : <h2 id="property-detail-heading" className="sr-only">Property details</h2>}
    </dialog>
</div>;
}

function typeLabel(property: EstatePropertySummary) { return property.unitTypes.length === 1 ? property.unitTypes[0] : property.unitTypes.length > 1 ? 'Mixed unit types' : 'Not recorded'; }

function Metric({ title, value, note, icon }: { title: string; value: string; note: string; icon: ReactNode }) {
  return <article className={styles.metric} aria-label={title}><div className={styles.metricHeader}><span aria-hidden="true">{icon}</span><h3>{title}</h3></div><div className={styles.metricBody}><strong>{value}</strong><p>{note}</p></div></article>;
}

function UnitAvailability({ total, occupied, vacant, reserved, unavailable }: { total: number; occupied: number; vacant: number; reserved: number; unavailable: number }) {
  const segments = [
    { label: 'Occupied', value: occupied, tone: 'occupied' },
    { label: 'Vacant', value: vacant, tone: 'vacant' },
    { label: 'Reserved', value: reserved, tone: 'reserved' },
    { label: 'Unavailable', value: unavailable, tone: 'unavailable' },
  ];
  return <section className={styles.availabilityPanel} aria-labelledby="unit-availability-heading">
    <header>
      <div><h2 id="unit-availability-heading">Unit availability</h2><p>A clear view of your registered inventory, without estimated capacity.</p></div>
      <span className={styles.typeChip}>{count(total)} registered units</span>
    </header>
    <div className={styles.availabilityBody}>
      <div className={styles.availabilityHeadline}>
        <p>{total ? percentage(occupied / total * 100) : '—'}</p>
        <span>occupied<br /><small>{total ? `${count(occupied)} of ${count(total)} units` : 'No units registered yet'}</small></span>
      </div>
      <div className={styles.availabilityChart}>
        <div className={styles.availabilityTrack} role="img" aria-label={`Registered unit availability: ${count(occupied)} occupied, ${count(vacant)} vacant, ${count(reserved)} reserved, ${count(unavailable)} unavailable`}>
          {segments.filter((segment) => segment.value > 0).map(({ label, value, tone }) => <span key={label} data-tone={tone} style={{ flexGrow: value, flexBasis: 0 }} />)}
        </div>
        <dl className={styles.availabilityLegend}>
          {segments.map(({ label, value, tone }) => <div key={label}><dt><span data-tone={tone} aria-hidden="true" />{label}</dt><dd>{count(value)}</dd></div>)}
        </dl>
      </div>
    </div>
  </section>;
}

function Availability({ property }: { property: EstatePropertySummary }) {
  return <span className={styles.status} data-tone={property.unitCount > 0 && property.occupiedUnits === property.unitCount ? 'success' : 'neutral'}>{propertyAvailability(property)}</span>;
}

function Occupancy({ property }: { property: EstatePropertySummary }) {
  return <div className={styles.occupancy}><span><strong>{count(property.occupiedUnits)}/{count(property.unitCount)}</strong><small>{percentage(property.occupancyPct)}</small></span>{property.occupancyPct !== null ? <div role="meter" aria-label={`${property.name} occupancy`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={property.occupancyPct}><span style={{ width: `${property.occupancyPct}%` }} /></div> : <div aria-hidden="true" />}</div>;
}
