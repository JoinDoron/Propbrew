'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PartyPopper, Dumbbell, Baby, Users, Sparkles, CalendarPlus, MapPin, CalendarDays, Ticket, X, Clock, Search } from 'lucide-react';
import { PageTabs } from '@/components/ui/page-tabs';
import { Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { toneVar, type Tone } from '@/lib/status-tones';
import { eventFillPct, eventState, type EventCategory } from '@/domain/estate';
import { rsvpEvent, cancelRsvp, createEvent, type CreateEventInput } from '@/server/actions/estate';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './experience-workspaces.module.css';

export type EventRow = { id: string; title: string; category: EventCategory; venue: string; host: string; startISO: string; endISO: string; capacity: number; rsvps: number; cancelled?: boolean };
export type AmenityRow = { venue: string; rsvps: number; events: number };
const CAT_ICON: Record<EventCategory, React.ReactNode> = { social: <PartyPopper size={20} />, fitness: <Dumbbell size={20} />, kids: <Baby size={20} />, meeting: <Users size={20} />, festive: <Sparkles size={20} /> };
const CAT_TONE: Record<EventCategory, Tone> = { social: 'info', fitness: 'success', kids: 'warn', meeting: 'progress', festive: 'danger' };
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
type RsvpReview = { event: EventRow; release: boolean };

export function EventsWorkspace({ events, amenities, kpis, nowMs, canMutate = false, canCreate = false }: {
  events: EventRow[]; amenities: AmenityRow[];
  kpis: { upcoming: number; totalRsvps: number; full: number; topVenue: string };
  nowMs: number; canMutate?: boolean; canCreate?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [review, setReview] = useState<RsvpReview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const upcoming = events.filter((e) => !e.cancelled && Date.parse(e.endISO) >= nowMs).sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
  const visible = upcoming.filter((e) => `${e.title} ${e.venue} ${e.host}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = new Map<string, EventRow[]>();
  for (const e of visible) { const k = dayKey(e.startISO); groups.set(k, [...(groups.get(k) ?? []), e]); }
  const maxLoad = Math.max(0, ...amenities.map((a) => a.rsvps));
  function confirm() {
    if (!canMutate || pending || !review) return;
    setError(null); start(async () => {
      try {
        const r = review.release ? await cancelRsvp(review.event.id) : await rsvpEvent(review.event.id);
        if (!r.ok) { setError(r.error ?? 'The RSVP could not be updated.'); return; }
        setFeedback(`${review.release ? 'One RSVP released' : 'One RSVP added'} · ${review.event.title}`); setReview(null); router.refresh();
      } catch { setError('The RSVP could not be updated. Please try again.'); }
    });
  }
  return <div className={layout.layout}>
    <div className={layout.context}><p className={layout.metadata}>Community programme snapshot · {dayKey(new Date(nowMs).toISOString())} · times in WAT</p>{canCreate ? <Button variant="primary" icon={<CalendarPlus size={16} />} onClick={() => setShowCreate(true)}>New event</Button> : <StatusPill status="Read-only programme" tone="neutral" />}</div>
    {feedback && <div role="status" className={`${layout.feedback} ${styles.feedback}`}><span>{feedback}</span><IconButton aria-label="Dismiss event update" onClick={() => setFeedback(null)}><X size={16} /></IconButton></div>}
    <PageTabs label="Event sections" items={[
      { id: 'events', label: 'Events', content: <div className={layout.layout}>
        <Card><CardHeader title="Community schedule" subtitle="Review upcoming events, capacity and attendance reservations." /><div className={layout.toolbar}><label className={layout.search}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search community events" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events, venues or hosts" /></label><span className={layout.metadata}>{visible.length} of {upcoming.length} upcoming events</span></div></Card>
        {[...groups.entries()].map(([day, list]) => <section key={day} className={styles.eventGroup}><h3>{day}</h3>{list.map((e) => { const fill = eventFillPct(e); const state = eventState(e, nowMs); const full = state === 'full'; return <Card key={e.id}><div className={styles.event}>
          <span className={styles.softIcon} style={{ color: toneVar(CAT_TONE[e.category]) }}>{CAT_ICON[e.category]}</span>
          <div className={styles.eventContent}><div className={styles.context}><h4 className={styles.sectionTitle}>{e.title}</h4><StatusPill status={full ? 'Full' : state === 'filling' ? 'Filling up' : 'Upcoming'} tone={full || state === 'filling' ? 'warn' : 'info'} /></div><div className={styles.eventMeta}><span><Clock size={14} />{time(e.startISO)}–{time(e.endISO)} WAT</span><span><MapPin size={14} />{e.venue}</span><span>Hosted by {e.host}</span></div><div className={styles.eventFill}><div className={styles.progress} role="progressbar" aria-label={`${e.title} reserved capacity`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={fill}><span style={{ width: `${fill}%`, background: toneVar(full ? 'warn' : 'progress') }} /></div><span className={layout.metadata}>{e.rsvps} of {e.capacity} places reserved</span></div></div>
          {canMutate && <div className={styles.eventActions}><Button variant="primary" disabled={pending || full} onClick={() => { setError(null); setReview({ event: e, release: false }); }} aria-label={`Review RSVP for ${e.title}`}>{full ? 'At capacity' : 'Add RSVP'}</Button><Button disabled={pending || e.rsvps === 0} onClick={() => { setError(null); setReview({ event: e, release: true }); }} aria-label={`Review RSVP release for ${e.title}`}>Release RSVP</Button></div>}
        </div></Card>; })}</section>)}
        {!visible.length && <Card><EmptyState icon={<CalendarDays size={24} />} title={upcoming.length ? 'No matching events' : 'No upcoming events'} description={upcoming.length ? 'Try another event title, venue or host.' : 'Upcoming events in your scope will appear here.'} /></Card>}
        <Card padded={false}>
          <div className={layout.registerHeader}><CardHeader title="Event register" subtitle="All recorded events in your scope, including past and cancelled programmes." /></div>
          {events.length ? <div className="pb-table-scroll" role="region" aria-label="Community event register" tabIndex={0}>
            <table className={`pb-data-table ${layout.table}`}>
              <thead><tr>{['Event', 'Date & venue', 'Status', 'Reservations'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{events.map((e) => {
                const state = eventState(e, nowMs);
                return <tr key={e.id}>
                  <td><div className={layout.title}>{e.title}</div><div className={layout.metadata}>{e.host} · {e.category}</div></td>
                  <td><div className={layout.body}>{dayKey(e.startISO)}</div><div className={layout.metadata}>{time(e.startISO)} WAT · {e.venue}</div></td>
                  <td><StatusPill status={e.cancelled ? 'Cancelled' : state[0].toUpperCase() + state.slice(1)} tone={e.cancelled ? 'neutral' : state === 'full' ? 'warn' : state === 'past' ? 'neutral' : 'info'} /></td>
                  <td>{e.rsvps} / {e.capacity}</td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <EmptyState icon={<Ticket size={24} />} title="No event records" description="Your event register is empty." />}
        </Card>
      </div> },
      { id: 'overview', label: 'Attendance & venues', content: <div className={layout.layout}>
        <div className={layout.metrics}><KpiCard label="Upcoming events" value={String(kpis.upcoming)} icon={<CalendarDays size={18} />} /><KpiCard label="Upcoming RSVPs" value={String(kpis.totalRsvps)} icon={<Ticket size={18} />} /><KpiCard label="Events at capacity" value={String(kpis.full)} icon={<Users size={18} />} /><Card><CardHeader title="Busiest venue" action={<MapPin size={18} className="text-primary" />} /><p className={layout.sectionTitle}>{kpis.topVenue}</p></Card></div>
        <Card><CardHeader title="Amenity demand" subtitle="Reservations across upcoming community events, not confirmed attendance." />{amenities.length ? <div className={styles.demand}>{amenities.map((a) => <div key={a.venue}><div className={styles.demandLabel}><span>{a.venue}</span><span>{a.rsvps} RSVPs</span></div><div className={styles.progress} role="img" aria-label={`${a.venue}: ${a.rsvps} reservations across ${a.events} events`}><span style={{ width: `${maxLoad > 0 ? Math.round((a.rsvps / maxLoad) * 100) : 0}%` }} /></div><p className={layout.metadata}>{a.events} event{a.events === 1 ? '' : 's'}</p></div>)}</div> : <EmptyState icon={<MapPin size={24} />} title="No venue demand yet" description="Demand appears when community events have reservations." />}</Card>
      </div> },
    ]} />
    {canCreate && showCreate && <CreateDialog nowMs={nowMs} onClose={() => setShowCreate(false)} onDone={(ref) => { setShowCreate(false); setFeedback(`Event created · ${ref}`); }} />}
    {canMutate && review && <PortalDialog label={review.release ? 'Release event RSVP' : 'Add event RSVP'} onClose={() => setReview(null)} canClose={!pending} width={520}><div className={layout.modal}><div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>{review.release ? 'Release event RSVP' : 'Add event RSVP'}</h2><IconButton aria-label="Close RSVP confirmation" disabled={pending} onClick={() => setReview(null)}><X size={18} /></IconButton></div><div className={layout.dialogBody}><p className={layout.body}>This changes the event reservation count by one. It does not record a named attendee or send a confirmation message.</p><dl className={styles.facts}><div><dt>Event</dt><dd>{review.event.title}</dd></div><div><dt>Current reservations</dt><dd>{review.event.rsvps} / {review.event.capacity}</dd></div><div><dt>After confirmation</dt><dd>{review.event.rsvps + (review.release ? -1 : 1)} / {review.event.capacity}</dd></div></dl>{error && <p role="alert" className={layout.feedback}>{error}</p>}<div className={layout.actions}><Button disabled={pending} onClick={() => setReview(null)}>Cancel</Button><Button variant="primary" disabled={pending} onClick={confirm}>{pending ? 'Saving…' : review.release ? 'Confirm release' : 'Confirm RSVP'}</Button></div></div></div></PortalDialog>}
  </div>;
}

function CreateDialog({ nowMs, onClose, onDone }: { nowMs: number; onClose: () => void; onDone: (ref: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<CreateEventInput>({ title: '', category: 'social', venue: '', host: '', startISO: new Date(nowMs).toISOString().slice(0, 10), capacity: 30 });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CreateEventInput, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return; setError(null);
    start(async () => { try { const r = await createEvent(f); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(r.ref ?? f.title); } catch { setError('The event could not be created. Please try again.'); } });
  }
  return <PortalDialog label="New community event" onClose={onClose} canClose={!pending} width={600}><div className={layout.modal}><div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>New community event</h2><IconButton aria-label="Close new event" onClick={onClose} disabled={pending}><X size={18} /></IconButton></div><form onSubmit={submit} className={layout.dialogBody}>
    <p className={layout.body}>Create a community programme. The current scheduler sets a two-hour event starting at 19:00 WAT on the selected date.</p>
    <div className={styles.form}><label className={styles.field}><span className="pb-form-label">Event title</span><input className="pb-form-control" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Movie night on the lawn" required disabled={pending} /></label><div className={styles.formGrid}><label className={styles.field}><span className="pb-form-label">Category</span><select className="pb-form-control" value={f.category} onChange={(e) => set('category', e.target.value)} disabled={pending}>{['social', 'fitness', 'kids', 'meeting', 'festive'].map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></label><label className={styles.field}><span className="pb-form-label">Capacity</span><input className="pb-form-control" type="number" min={1} step={1} required value={f.capacity || ''} onChange={(e) => set('capacity', Number(e.target.value))} disabled={pending} /></label></div><div className={styles.formGrid}><label className={styles.field}><span className="pb-form-label">Venue</span><input className="pb-form-control" value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Clubhouse Hall" disabled={pending} /></label><label className={styles.field}><span className="pb-form-label">Date</span><input className="pb-form-control" type="date" value={f.startISO} onChange={(e) => set('startISO', e.target.value)} required disabled={pending} /></label></div><label className={styles.field}><span className="pb-form-label">Host</span><input className="pb-form-control" value={f.host} onChange={(e) => set('host', e.target.value)} placeholder="Estate Office" disabled={pending} /></label></div>
    {error && <p role="alert" className={layout.feedback}>{error}</p>}<div className={layout.actions}><Button type="button" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || !f.title.trim() || f.capacity <= 0}>{pending ? 'Creating…' : 'Create event'}</Button></div>
  </form></div></PortalDialog>;
}
