'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarCheck, HeartPulse, Home, Mail, MessageSquare, Receipt, Search, Users, Wrench } from 'lucide-react';
import { Avatar, Button, FilterChip, StatusPill } from '@/components/ui';
import { ReadOnlyChip } from '@/components/domain';
import { PageTabs } from '@/components/ui/page-tabs';
import { humanizeStatus, statusTone, toneVar, type Tone } from '@/lib/status-tones';
import { tenure, paymentReliability, engagementScore, engagementTone, riskFlags, type EngagementInput } from '@/domain/residents';
import styles from './residents-explorer.module.css';
import { EstateResidentEditor, type EstateUnitOption } from '@/components/workspaces/estate-record-editors';

const NOW_MS = Date.parse('2026-07-26');
const STATUSES = ['all', 'active', 'invited', 'moved_out'];

export type ResidentRow = { id: string; userId: string; name: string; email?: string; phone?: string; unitId: string; unitLabel: string; unitType: string; status: string; household: number; balanceLabel: string; balanceOwed: boolean; moveInDate: string };
export type BillRow = { id: string; ref: string; ownerUserId: string; unitId: string; status: string; amountLabel: string; dueDate: string };
export type RequestRow = { id: string; ref: string; requesterUserId: string; unitId?: string; title: string; status: string };
export type BookingRow = { id: string; ownerUserId: string; amenity: string; status: string; slot: string };

const RESIDENT_TONE: Record<string, Tone> = { active: 'success', invited: 'info', moved_out: 'muted' };
const BOOKING_TONE: Record<string, Tone> = { requested: 'neutral', approved: 'info', auto_approved: 'info', confirmed: 'progress', completed: 'success', declined: 'muted', cancelled: 'muted' };
const INVOICE_TONE: Record<string, Tone> = { draft: 'neutral', issued: 'info', partially_paid: 'warn', paid: 'success', overdue: 'warn', in_arrears: 'danger', escalated: 'danger' };

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
}

/** Related records are supplied by the permission-gated server route.
 * Hidden capabilities never render a panel or financial advisory signal. */
export function ResidentsExplorer({
  residents, bills, requests, bookings, seesBills, seesRequests, seesBookings, canMutate, canEditRecords = false, units = [],
}: {
  residents: ResidentRow[]; bills: BillRow[]; requests: RequestRow[]; bookings: BookingRow[];
  seesBills: boolean; seesRequests: boolean; seesBookings: boolean; canMutate: boolean;
  canEditRecords?: boolean; units?: EstateUnitOption[];
}) {
  const instance = useId();
  const [section, setSection] = useState('directory');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(residents[0]?.id ?? null);
  const statusCounts = residents.reduce<Record<string, number>>((counts, resident) => {
    counts[resident.status] = (counts[resident.status] ?? 0) + 1;
    return counts;
  }, {});
  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return residents.filter((resident) => (status === 'all' || resident.status === status) &&
      (!query || resident.name.toLowerCase().includes(query) || resident.unitLabel.toLowerCase().includes(query) || (resident.email ?? '').toLowerCase().includes(query)));
  }, [residents, status, q]);
  const sel = residents.find((resident) => resident.id === selectedId) ?? visible[0] ?? null;

  const forResident = <T extends { ownerUserId?: string; requesterUserId?: string; unitId?: string }>(resident: ResidentRow, rows: T[]) =>
    rows.filter((row) => row.ownerUserId === resident.userId || row.requesterUserId === resident.userId || (row.unitId && row.unitId === resident.unitId));
  const selBills = sel && seesBills ? forResident(sel, bills) : [];
  const selRequests = sel && seesRequests ? forResident(sel, requests) : [];
  const selBookings = sel && seesBookings ? forResident(sel, bookings) : [];
  const selEng: EngagementInput | null = sel ? {
    status: sel.status, moveInDate: sel.moveInDate, balanceOwed: seesBills && sel.balanceOwed,
    bills: selBills, requests: selRequests, bookings: selBookings,
  } : null;
  const selScore = selEng ? engagementScore(selEng, NOW_MS) : 0;
  const selRel = seesBills && selEng ? paymentReliability(selEng.bills) : null;
  const selTenure = sel ? tenure(sel.moveInDate, NOW_MS) : null;
  const selFlags = selEng ? riskFlags(selEng, NOW_MS) : [];
  const additionalMembers = Math.max(0, (sel?.household ?? 0) - 1);

  return (
    <div className={styles.workspace} data-residents-workspace="true">
      {section !== 'directory' && sel ? (
        <div className={styles.context}>
          <label htmlFor={instance + '-resident-context'}>Viewing resident</label>
          <select id={instance + '-resident-context'} value={sel.id} onChange={(event) => setSelectedId(event.target.value)}>
            {residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name} · {resident.unitLabel}</option>)}
          </select>
        </div>
      ) : null}
      <PageTabs label="Resident page sections" activeTab={section} onTabChange={setSection} items={[
        { id: 'directory', label: 'Directory', count: residents.length, content: (
          <section className={styles.directory} aria-label="Resident directory">
            <div className={styles.toolbar}>
              <div className={styles.filters} role="group" aria-label="Filter residents by status">
                {STATUSES.filter((value) => value === 'all' || statusCounts[value]).map((value) => (
                  <FilterChip key={value} label={value === 'all' ? 'All residents' : humanizeStatus(value)}
                    count={value === 'all' ? residents.length : statusCounts[value] ?? 0}
                    active={status === value} onClick={() => setStatus(value)} />
                ))}
              </div>
              <div className={styles.searchGroup}>
                <label className={styles.search}>
                  <Search size={16} aria-hidden="true" />
                  <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, email or unit…" aria-label="Search residents" />
                </label>
                {!canMutate ? <ReadOnlyChip /> : null}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Residents table, scroll horizontally on smaller screens">
                <table className={styles.table}>
                  <caption className={styles.srOnly}>Resident directory, {visible.length} matching residents</caption>
                  <thead><tr>
                    <th scope="col">Resident</th><th scope="col">Unit</th><th scope="col">Household</th><th scope="col">Status</th>
                    {seesBills ? <th scope="col" className={styles.amount}>Balance</th> : null}
                    <th scope="col"><span className={styles.srOnly}>Actions</span></th>
                  </tr></thead>
                  <tbody>
                    {visible.map((resident) => (
                      <tr key={resident.id} data-selected={sel?.id === resident.id ? 'true' : undefined}>
                        <td><div className={styles.person}>
                          <Avatar name={resident.name} size={36} />
                          <div className={styles.personText}><span className={styles.name}>{resident.name}</span>{resident.email ? <span className={styles.secondary}>{resident.email}</span> : null}</div>
                        </div></td>
                        <td><span className={styles.cellTitle}>{resident.unitLabel}</span><span className={styles.secondary}>{resident.unitType}</span></td>
                        <td><span className={styles.householdCount}>{resident.household} {resident.household === 1 ? 'person' : 'people'}</span></td>
                        <td><StatusPill status={humanizeStatus(resident.status)} tone={RESIDENT_TONE[resident.status] ?? 'neutral'} /></td>
                        {seesBills ? <td className={styles.amount}><span className={resident.balanceOwed ? styles.owed : styles.balance}>{resident.balanceLabel}</span></td> : null}
                        <td className={styles.rowAction}><div className="flex items-center gap-2">{canMutate && canEditRecords && ['active', 'invited'].includes(resident.status) && <EstateResidentEditor resident={resident} units={units} />}<Button type="button" variant="ghost" aria-label={'View profile for ' + resident.name} onClick={() => { setSelectedId(resident.id); setSection('profile'); }}>View profile <ArrowUpRight size={14} aria-hidden="true" /></Button></div></td>
                      </tr>
                    ))}
                    {visible.length === 0 ? <tr><td colSpan={seesBills ? 6 : 5}><Empty title="No residents match." detail={residents.length ? 'Try another name, email, unit or status.' : 'Residents will appear here when they are added to this estate.'} /></td></tr> : null}
                  </tbody>
                </table>
              </div>
              <div className={styles.tableFooter} role="status" aria-live="polite">Showing {visible.length} of {residents.length} residents</div>
            </div>
          </section>
        ) },
        ...(sel ? [
          { id: 'profile', label: 'Profile & household', content: (
            <div className={styles.profile}>
              <section className={styles.identity} aria-label="Resident identity">
                <Avatar name={sel.name} size={48} />
                <div className={styles.identityText}><h2>{sel.name}</h2><p><Home size={14} aria-hidden="true" />{sel.unitLabel} · {sel.unitType}</p>{sel.email ? <p><Mail size={14} aria-hidden="true" />{sel.email}</p> : null}</div>
                <StatusPill status={humanizeStatus(sel.status)} tone={RESIDENT_TONE[sel.status] ?? 'neutral'} />
              </section>
              <div className={styles.profileGrid}>
                <section className={styles.panel} aria-label="Residence details">
                  <PanelHeading icon={<Home size={17} />} title="Residence details" />
                  <dl className={styles.facts}>
                    <Fact label="Unit" value={sel.unitLabel} /><Fact label="Unit type" value={sel.unitType} />
                    <Fact label="Move-in date" value={dateLabel(sel.moveInDate)} /><Fact label="Tenure" value={selTenure?.label ?? 'Not available'} />
                    {seesBills ? <Fact label="Balance" value={sel.balanceLabel} warning={sel.balanceOwed} /> : null}
                  </dl>
                </section>
                <section className={styles.panel} aria-label="Household details">
                  <PanelHeading icon={<Users size={17} />} title="Household" />
                  <div className={styles.householdTotal}>{sel.household}<span>{sel.household === 1 ? 'person recorded' : 'people recorded'}</span></div>
                  <div className={styles.householdMember}><Avatar name={sel.name} size={32} /><span>{sel.name}<small>Selected resident</small></span></div>
                  {additionalMembers > 0 ? <p className={styles.note}>{additionalMembers} additional {additionalMembers === 1 ? 'member' : 'members'}. Names and relationships have not been recorded in this view.</p> : null}
                </section>
                <section className={styles.panel} aria-label="Resident engagement">
                  <PanelHeading icon={<HeartPulse size={17} />} title="Engagement snapshot" />
                  <div className={styles.engagementValue} style={{ color: toneVar(engagementTone(selScore)) }}>{selScore}<span>/ 100</span></div>
                  <div className={styles.meter} role="meter" aria-label="Resident engagement score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={selScore} aria-valuetext={selScore + ' out of 100, advisory only'}><span style={{ width: selScore + '%', background: toneVar(engagementTone(selScore)) }} /></div>
                  {selRel && selRel.total > 0 ? <p className={styles.reliability}>{selRel.score}% payment reliability <span>Across {selRel.total} recorded {selRel.total === 1 ? 'bill' : 'bills'}</span></p> : null}
                  <p className={styles.note}>Advisory calculation from tenure, status and records visible to your role. Snapshot: {dateLabel('2026-07-26')}. Not an AI or credit decision.</p>
                </section>
              </div>
              {selFlags.length > 0 ? <div className={styles.flags} aria-label="Resident advisory signals">{selFlags.map((flag) => <StatusPill key={flag.label} status={flag.label} tone={flag.tone} />)}</div> : null}
            </div>
          ) },
          ...(seesBills ? [{ id: 'bills', label: 'Bills', count: selBills.length, content: (
            <RecordPanel title="Bills" subtitle={'Charges linked to ' + sel.name + ' or ' + sel.unitLabel + '.'} icon={<Receipt size={17} />} href="/billing" linkLabel="Open billing">
              {selBills.length ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Resident bills table"><table className={styles.table}><caption className={styles.srOnly}>Bills for {sel.name}</caption><thead><tr><th scope="col">Reference</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col" className={styles.amount}>Amount</th></tr></thead><tbody>{selBills.map((bill) => <tr key={bill.id}><td className={styles.reference}>{bill.ref}</td><td>{dateLabel(bill.dueDate)}</td><td><StatusPill status={humanizeStatus(bill.status)} tone={INVOICE_TONE[bill.status] ?? 'neutral'} /></td><td className={styles.amount + ' ' + styles.balance}>{bill.amountLabel}</td></tr>)}</tbody></table></div> : <Empty title="No charges." detail="No bills are linked to this resident or unit." />}
            </RecordPanel>
          ) }] : []),
          ...(seesRequests ? [{ id: 'requests', label: 'Maintenance', count: selRequests.length, content: (
            <RecordPanel title="Maintenance requests" subtitle={'Requests linked to ' + sel.name + ' or ' + sel.unitLabel + '.'} icon={<Wrench size={17} />} href="/estate/work-orders" linkLabel="Open maintenance">
              {selRequests.length ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Resident maintenance table"><table className={styles.table}><caption className={styles.srOnly}>Maintenance requests for {sel.name}</caption><thead><tr><th scope="col">Reference</th><th scope="col">Request</th><th scope="col">Status</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{selRequests.map((request) => <tr key={request.id}><td className={styles.reference}>{request.ref}</td><td>{request.title}</td><td><StatusPill status={humanizeStatus(request.status)} tone={statusTone('work-order', request.status)} /></td><td className={styles.rowAction}><Link className={styles.recordLink} href={'/estate/work-orders/' + request.ref} aria-label={'View maintenance request ' + request.ref}>View request <ArrowUpRight size={14} aria-hidden="true" /></Link></td></tr>)}</tbody></table></div> : <Empty title="No maintenance requests." detail="No maintenance requests are linked to this resident or unit." />}
            </RecordPanel>
          ) }] : []),
          ...(seesBookings ? [{ id: 'bookings', label: 'Bookings', count: selBookings.length, content: (
            <RecordPanel title="Amenity bookings" subtitle={'Bookings made by ' + sel.name + '.'} icon={<CalendarCheck size={17} />} href="/bookings" linkLabel="Open bookings">
              {selBookings.length ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Resident bookings table"><table className={styles.table}><caption className={styles.srOnly}>Amenity bookings for {sel.name}</caption><thead><tr><th scope="col">Amenity</th><th scope="col">Date</th><th scope="col">Status</th></tr></thead><tbody>{selBookings.map((booking) => <tr key={booking.id}><td>{booking.amenity}</td><td>{dateLabel(booking.slot)}</td><td><StatusPill status={humanizeStatus(booking.status)} tone={BOOKING_TONE[booking.status] ?? 'neutral'} /></td></tr>)}</tbody></table></div> : <Empty title="No amenity bookings." detail="This resident has no recorded amenity bookings." />}
            </RecordPanel>
          ) }] : []),
          { id: 'communication', label: 'Communication', content: (
            <RecordPanel title="Communication history" subtitle={'Recorded messages and delivery events for ' + sel.name + '.'} icon={<MessageSquare size={17} />}>
              <Empty icon={<MessageSquare size={22} />} title="No communication history available" detail="No delivery records have been supplied to this view. Messages and delivery statuses will appear here when recorded history is available." />
            </RecordPanel>
          ) },
        ] : []),
      ]} />
    </div>
  );
}

function PanelHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return <h3 className={styles.panelHeading}><span aria-hidden="true">{icon}</span>{title}</h3>;
}

function Fact({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return <div><dt>{label}</dt><dd className={warning ? styles.owed : undefined}>{value}</dd></div>;
}

function RecordPanel({ title, subtitle, icon, href, linkLabel, children }: { title: string; subtitle: string; icon: ReactNode; href?: string; linkLabel?: string; children: ReactNode }) {
  return <section className={styles.card}><div className={styles.recordHeader}><div><PanelHeading icon={icon} title={title} /><p>{subtitle}</p></div>{href ? <Link className={styles.recordLink} href={href}>{linkLabel ?? 'Open'}<ArrowUpRight size={14} aria-hidden="true" /></Link> : null}</div>{children}</section>;
}

function Empty({ title, detail, icon }: { title: string; detail: string; icon?: ReactNode }) {
  return <div className={styles.empty}>{icon ? <span className={styles.emptyIcon} aria-hidden="true">{icon}</span> : null}<p>{title}</p><span>{detail}</span></div>;
}
