'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import type { GuestProfile } from '@/domain/shortlet/engine';
import { shortletDate, shortletMoney } from './shortlet-format';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './shortlet-directory-polish.module.css';

export function GuestDirectory({ guests }: { guests: GuestProfile[] }) {
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<'all' | 'repeat' | 'vip'>('all');
  const shown = useMemo(() => guests.filter((guest) =>
    (segment === 'all' || guest[segment]) && `${guest.name} ${guest.phone}`.toLowerCase().includes(query.trim().toLowerCase()),
  ).sort((a, b) => b.lifetimeValueMinor - a.lifetimeValueMinor || a.name.localeCompare(b.name)), [guests, query, segment]);
  return <Card padded={false}>
    <div className={styles.header}><CardHeader title="Guest directory" subtitle="Recorded guest relationships · ordered by accommodation value" /></div>
    <div className={styles.toolbar}>
      <div className={layout.filters} role="group" aria-label="Guest segment">{(['all', 'repeat', 'vip'] as const).map((value) => <button type="button" key={value} className="pb-filter" aria-pressed={segment === value} onClick={() => setSegment(value)}>{value === 'all' ? 'All guests' : value === 'repeat' ? 'Returning guests' : 'VIP guests'}</button>)}</div>
      <label className={layout.search}><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search Shortlet guests" placeholder="Search guest or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {shown.length ? <div className={styles.scroll} role="region" aria-label="Shortlet guest register, horizontally scrollable" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">Guest</th><th scope="col">Relationship</th><th scope="col">Booking records</th><th scope="col">Latest check-in</th><th scope="col" className={styles.numeric}>Accommodation value · NGN</th></tr></thead><tbody>{shown.map((guest) => <tr key={guest.phone || guest.name}><th scope="row"><div className={styles.inline}><span className={styles.avatar} aria-hidden="true">{guest.name.charAt(0)}</span><div>{guest.name}<p className={styles.metadata}>{guest.phone || 'No phone recorded'}</p></div></div></th><td><StatusPill status={guest.vip ? 'VIP' : guest.repeat ? 'Returning' : 'New guest'} tone={guest.vip ? 'progress' : guest.repeat ? 'success' : 'neutral'} /></td><td>{guest.stays}</td><td><time dateTime={guest.lastStayISO}>{shortletDate(guest.lastStayISO)}</time></td><td className={styles.numeric}>{shortletMoney(guest.lifetimeValueMinor)}</td></tr>)}</tbody></table></div> : <div className={styles.body}><EmptyState title="No guests match" description="Change the search or segment. Guest profiles appear when bookings are recorded." /></div>}
    <p role="status" className={styles.footer}>Showing {shown.length} of {guests.length} guests. Value is calculated from recorded accommodation bookings; it is not verified bank receipts or a settled customer balance.</p>
  </Card>;
}
