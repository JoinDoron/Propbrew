'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarCheck, DoorClosed, Home, Mail, Receipt, Search, UserPlus, Wrench } from 'lucide-react';
import { Avatar, Button, StatusPill } from '@/components/ui';
import { ReadOnlyChip } from '@/components/domain';
import { humanizeStatus, statusTone, type Tone } from '@/lib/status-tones';

export type ResidentRow = { id: string; userId: string; name: string; email?: string; unitId: string; unitLabel: string; unitType: string; status: string; household: number; balanceLabel: string; balanceOwed: boolean; moveInDate: string };
export type BillRow = { id: string; ref: string; ownerUserId: string; unitId: string; status: string; amountLabel: string; dueDate: string };
export type RequestRow = { id: string; ref: string; requesterUserId: string; unitId?: string; title: string; status: string };
export type BookingRow = { id: string; ownerUserId: string; amenity: string; status: string; slot: string };

const RESIDENT_TONE: Record<string, Tone> = { active: 'success', invited: 'info', moved_out: 'muted' };
const BOOKING_TONE: Record<string, Tone> = { requested: 'neutral', approved: 'info', auto_approved: 'info', confirmed: 'progress', completed: 'success', declined: 'muted', cancelled: 'muted' };
const INVOICE_TONE: Record<string, Tone> = { draft: 'neutral', issued: 'info', partially_paid: 'warn', paid: 'success', overdue: 'warn', in_arrears: 'danger', escalated: 'danger' };

/** EM-02 — interactive resident directory. Pick a resident to see everything
 *  about them in one place: their unit, bills, maintenance requests and
 *  bookings. Each section only appears if the VIEWER may read that data (§7), so
 *  a facility manager sees requests but not bills. */
export function ResidentsExplorer({
  residents, bills, requests, bookings, seesBills, seesRequests, seesBookings, canMutate,
}: {
  residents: ResidentRow[]; bills: BillRow[]; requests: RequestRow[]; bookings: BookingRow[];
  seesBills: boolean; seesRequests: boolean; seesBookings: boolean; canMutate: boolean;
}) {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(residents[0]?.id ?? null);

  const statusCounts = residents.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  const visible = useMemo(() => {
    let v = status === 'all' ? residents : residents.filter((r) => r.status === status);
    if (q.trim()) {
      const s = q.toLowerCase();
      v = v.filter((r) => r.name.toLowerCase().includes(s) || r.unitLabel.toLowerCase().includes(s) || (r.email ?? '').toLowerCase().includes(s));
    }
    return v;
  }, [residents, status, q]);

  const sel = residents.find((r) => r.id === selectedId) ?? visible[0] ?? null;
  const mine = <T extends { ownerUserId?: string; requesterUserId?: string; unitId?: string }>(rows: T[]) =>
    !sel ? [] : rows.filter((x) => x.ownerUserId === sel.userId || x.requesterUserId === sel.userId || (x.unitId && x.unitId === sel.unitId));

  const selBills = seesBills ? mine(bills) : [];
  const selRequests = seesRequests ? mine(requests) : [];
  const selBookings = seesBookings ? mine(bookings) : [];

  const STATUSES = ['all', 'active', 'invited', 'moved_out'];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.filter((s) => s === 'all' || statusCounts[s]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-colors inline-flex items-center gap-1.5 ${status === s ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>
            {s === 'all' ? 'All' : humanizeStatus(s)}<span className="text-text-3 font-mono">{s === 'all' ? residents.length : statusCounts[s] ?? 0}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 h-8 px-2.5 rounded-full border border-border-2 bg-surface">
            <Search size={13} className="text-text-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search residents…" className="w-32 bg-transparent outline-none text-[12.5px]" aria-label="Search residents" />
          </div>
          {canMutate ? <Button variant="primary" icon={<UserPlus size={15} />} className="!h-8 !text-[12px]">Invite</Button> : <ReadOnlyChip />}
        </div>
      </div>

      <div className="grid min-[900px]:grid-cols-[minmax(0,1fr)_380px] gap-3.5 items-start">
        {/* List */}
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          {visible.map((r) => {
            const active = sel?.id === r.id;
            return (
              <button key={r.id} onClick={() => setSelectedId(r.id)} className={`flex items-center gap-3 w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors ${active ? 'bg-primary-weak/50' : 'hover:bg-surface-2'}`}>
                <Avatar name={r.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{r.name}</div>
                  <div className="text-[11.5px] text-text-3 truncate">{r.unitLabel}</div>
                </div>
                <StatusPill status={humanizeStatus(r.status)} tone={RESIDENT_TONE[r.status] ?? 'neutral'} />
                <span className={`font-mono text-[12.5px] w-20 text-right flex-none ${r.balanceOwed ? 'text-warning' : 'text-text-3'}`}>{r.balanceLabel}</span>
              </button>
            );
          })}
          {visible.length === 0 && <div className="p-8 text-center text-[13px] text-text-3">No residents match.</div>}
        </div>

        {/* Profile */}
        {sel && (
          <div className="bg-surface border border-border rounded-2xl shadow-card p-4 min-[900px]:sticky min-[900px]:top-2">
            <div className="flex items-center gap-3">
              <Avatar name={sel.name} size={44} />
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold truncate">{sel.name}</h3>
                {sel.email && <div className="text-[12px] text-text-3 truncate flex items-center gap-1"><Mail size={12} /> {sel.email}</div>}
              </div>
              <StatusPill status={humanizeStatus(sel.status)} tone={RESIDENT_TONE[sel.status] ?? 'neutral'} />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3.5">
              <Fact icon={<Home size={13} />} label="Unit" value={sel.unitLabel} sub={sel.unitType} />
              <Fact icon={<DoorClosed size={13} />} label="Household" value={`${sel.household} ${sel.household === 1 ? 'person' : 'people'}`} sub={`since ${sel.moveInDate}`} />
            </div>
            <div className="mt-2 rounded-lg bg-surface-2 p-2.5 flex items-center justify-between">
              <span className="text-[11px] text-text-3 uppercase tracking-wide">Balance</span>
              <span className={`text-[15px] font-semibold font-mono ${sel.balanceOwed ? 'text-warning' : ''}`}>{sel.balanceLabel}</span>
            </div>

            {seesBills && (
              <Section icon={<Receipt size={13} />} title={`Bills (${selBills.length})`} href="/billing">
                {selBills.length === 0 ? <Empty label="No charges." /> : selBills.map((b) => (
                  <Row key={b.id} left={b.ref} mid={b.dueDate} right={<StatusPill status={humanizeStatus(b.status)} tone={INVOICE_TONE[b.status] ?? 'neutral'} />} extra={b.amountLabel} />
                ))}
              </Section>
            )}

            {seesRequests && (
              <Section icon={<Wrench size={13} />} title={`Requests (${selRequests.length})`} href="/work-orders">
                {selRequests.length === 0 ? <Empty label="No maintenance requests." /> : selRequests.map((w) => (
                  <Link key={w.id} href={`/work-orders/${w.ref}`} className="flex items-center gap-2 group py-0.5">
                    <span className="font-mono text-[11.5px] font-semibold text-primary group-hover:underline flex-none">{w.ref}</span>
                    <span className="text-[12px] text-text-2 truncate flex-1">{w.title}</span>
                    <StatusPill status={humanizeStatus(w.status)} tone={statusTone('work-order', w.status)} />
                  </Link>
                ))}
              </Section>
            )}

            {seesBookings && (
              <Section icon={<CalendarCheck size={13} />} title={`Bookings (${selBookings.length})`} href="/bookings">
                {selBookings.length === 0 ? <Empty label="No amenity bookings." /> : selBookings.map((bk) => (
                  <Row key={bk.id} left={bk.amenity} mid={new Date(bk.slot).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })} right={<StatusPill status={humanizeStatus(bk.status)} tone={BOOKING_TONE[bk.status] ?? 'neutral'} />} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2.5 min-w-0">
      <div className="text-[10px] text-text-3 uppercase tracking-wide flex items-center gap-1">{icon}{label}</div>
      <div className="text-[12.5px] font-semibold mt-0.5 truncate">{value}</div>
      {sub && <div className="text-[11px] text-text-3 truncate">{sub}</div>}
    </div>
  );
}

function Section({ icon, title, href, children }: { icon: React.ReactNode; title: string; href: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5 pt-3.5 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3 flex items-center gap-1.5">{icon}{title}</div>
        <Link href={href} className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">Open <ArrowUpRight size={11} /></Link>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ left, mid, right, extra }: { left: string; mid: string; right: React.ReactNode; extra?: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="font-mono text-[11.5px] font-semibold flex-none">{left}</span>
      <span className="text-text-3 truncate flex-1">{mid}</span>
      {extra && <span className="font-mono text-[11.5px] text-text-2 flex-none">{extra}</span>}
      {right}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-[12px] text-text-3">{label}</p>;
}
