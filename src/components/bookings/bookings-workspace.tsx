'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Clock, Wallet, Gauge, AlertTriangle, Sparkles, ListChecks } from 'lucide-react';
import { formatMoney } from '@/components/domain';
import { DomainStatus } from '@/components/domain';
import { toneVar, type Tone } from '@/lib/status-tones';
import { transition } from '@/server/actions/transitions';
import type { InlineEvent } from '@/components/inline-actions';
import type { BookingStatus } from '@/domain/enums';
import { utilisation, conflicts, wouldAutoApprove, usageHeatmap, revenue, amenityOf, AMENITIES, DAYS, BANDS, type BookingLike } from '@/domain/bookings';

export type BookingView = { id: string; amenity: string; residentName: string; status: BookingStatus; slot: string; feeMinor: number | null; actions: InlineEvent[] };

const RULE_LABEL: Record<string, string> = { always: 'Auto-approve', off_peak: 'Off-peak auto', manual: 'Manual' };

export function BookingsWorkspace({ bookings, canMutate }: { bookings: BookingView[]; canMutate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amenity, setAmenity] = useState(AMENITIES[0].name);
  const money = (minor: number) => formatMoney({ minor, currency: 'NGN' } as Parameters<typeof formatMoney>[0]);
  const fire = (id: string, event: string) => start(async () => { await transition('booking', id, event); router.refresh(); });

  const lite: BookingLike[] = bookings.map((b) => ({ id: b.id, amenity: b.amenity, status: b.status, slot: b.slot, feeMinor: b.feeMinor }));
  const util = utilisation(lite);
  const conf = conflicts(lite);
  const queue = bookings.filter((b) => b.status === 'requested');
  const heat = usageHeatmap(amenity);
  const rev = revenue(lite);
  const avgUtil = Math.round(util.reduce((n, u) => n + u.pct, 0) / (util.length || 1));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Kpi label="Bookings" value={String(bookings.length)} note={`${AMENITIES.length} amenities`} tone="info" icon={<CalendarCheck size={18} />} />
        <Kpi label="Awaiting approval" value={String(queue.length)} note={queue.length ? 'in the queue' : 'all clear'} tone={queue.length ? 'warn' : 'success'} icon={<Clock size={18} />} />
        <Kpi label="Fees booked" value={money(rev)} note="confirmed + completed" tone="progress" icon={<Wallet size={18} />} />
        <Kpi label="Avg utilisation" value={`${avgUtil}%`} note="across amenities" tone={avgUtil >= 70 ? 'danger' : avgUtil >= 40 ? 'warn' : 'success'} icon={<Gauge size={18} />} />
      </div>

      {/* Conflicts */}
      {conf.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-warning/[0.05] p-3 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-warning flex-none mt-0.5" />
          <div className="text-[12.5px]"><span className="font-semibold">{conf.length} scheduling conflict{conf.length === 1 ? '' : 's'}</span> — {conf.map((c) => c.amenity).join(', ')} double-booked within a 2-hour window. Resolve before confirming.</div>
        </div>
      )}

      {/* Approval queue */}
      {queue.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><ListChecks size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Approval queue</span><span className="ml-auto text-[10.5px] text-text-3">auto-rule hints are advisory</span></div>
          <div className="divide-y divide-border">
            {queue.map((b) => {
              const rule = wouldAutoApprove(b.amenity, b.slot);
              return (
                <div key={b.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{b.amenity} · <span className="font-normal text-text-2">{b.residentName}</span></div>
                    <div className="text-[11.5px] text-text-3">{fmtSlot(b.slot)}{b.feeMinor ? ` · ${money(b.feeMinor)}` : ' · free'}</div>
                  </div>
                  <span className="text-[10.5px] font-semibold px-2 h-[22px] inline-flex items-center gap-1 rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(rule.auto ? 'success' : 'warn')} 14%, transparent)`, color: toneVar(rule.auto ? 'success' : 'warn') }}><Sparkles size={11} /> {rule.auto ? 'Rule: auto-approve' : 'Rule: review'} · {rule.reason}</span>
                  {canMutate && b.actions.map((a) => (
                    <button key={a.event} disabled={pending} onClick={() => fire(b.id, a.event)} className={`text-[11.5px] px-2.5 h-7 rounded-lg font-medium disabled:opacity-50 ${a.variant === 'danger' ? 'text-negative border border-[color:var(--tone-danger)]/40' : a.variant === 'primary' ? 'bg-primary text-white' : 'border border-border-2 text-text-2'}`}>{a.label}</button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_300px] gap-3.5 items-start">
        {/* Availability heatmap */}
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CalendarCheck size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Availability</span>
            <select value={amenity} onChange={(e) => setAmenity(e.target.value)} aria-label="Amenity" className="ml-auto h-7 px-2 rounded-lg border border-border-2 bg-surface text-[12px] outline-none focus:border-primary">
              {AMENITIES.map((a) => <option key={a.name}>{a.name}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(${BANDS.length}, 1fr)` }}>
              <span />
              {BANDS.map((b) => <span key={b} className="text-[9.5px] text-text-3 text-center">{b}</span>)}
              {heat.map((row, d) => (
                <Fragment key={d}>
                  <span className="text-[10px] text-text-3 pr-1 self-center">{DAYS[d]}</span>
                  {row.map((v, t) => (
                    <span key={`${d}-${t}`} title={`${DAYS[d]} ${BANDS[t]} · ${v === 0 ? 'free' : `${v}/4 busy`}`} className="w-full rounded-[3px]" style={{ aspectRatio: '1.6', minWidth: 22, background: v === 0 ? 'var(--surface-3)' : `color-mix(in srgb, ${toneVar(v >= 3 ? 'danger' : v >= 2 ? 'warn' : 'success')} ${25 + v * 18}%, transparent)` }} />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
          <div className="text-[10.5px] text-text-3 mt-2">Indicative weekly demand for {amenity} · capacity {amenityOf(amenity).capacity} · rule {RULE_LABEL[amenityOf(amenity).autoApprove]}</div>
        </div>

        {/* Utilisation + rules */}
        <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-3"><Gauge size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Utilisation</span></div>
          <div className="flex flex-col gap-2.5">
            {util.map((u) => (
              <button key={u.amenity} onClick={() => setAmenity(u.amenity)} className="text-left">
                <div className="flex items-center justify-between text-[11.5px] mb-0.5"><span className="text-text-2 truncate">{u.amenity}</span><span className="font-mono text-text-3">{u.bookings} · {RULE_LABEL[u.rule]}</span></div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, u.pct)}%`, background: toneVar(u.tone) }} /></div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Full register */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">All bookings</div>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['Amenity', 'Resident', 'Status', 'Slot', 'Fee', 'Actions'].map((h, i) => <th key={h} className={`text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap ${i > 3 ? 'text-right' : ''} ${i === 3 ? 'max-[560px]:hidden' : ''}`}>{h}</th>)}</tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 border-b border-border text-[13px] font-medium">{b.amenity}</td>
                  <td className="px-4 py-2.5 border-b border-border text-[13px] text-text-2">{b.residentName}</td>
                  <td className="px-4 py-2.5 border-b border-border"><DomainStatus type="booking" status={b.status} /></td>
                  <td className="px-4 py-2.5 border-b border-border max-[560px]:hidden font-mono text-[12.5px]">{fmtSlot(b.slot)}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right text-[12.5px]">{b.feeMinor ? money(b.feeMinor) : '—'}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right">
                    {canMutate && b.actions.length > 0 ? (
                      <div className="inline-flex gap-1.5">
                        {b.actions.map((a) => <button key={a.event} disabled={pending} onClick={() => fire(b.id, a.event)} className={`text-[11px] px-2 h-6 rounded-md font-medium disabled:opacity-50 ${a.variant === 'danger' ? 'text-negative border border-[color:var(--tone-danger)]/40' : a.variant === 'primary' ? 'bg-primary text-white' : 'border border-border-2 text-text-2'}`}>{a.label}</button>)}
                      </div>
                    ) : <span className="text-text-3 text-[12px]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-text-3">Fees are collected through the SC-02 wallet/gateway on confirmation. Auto-approval rules are advisory hints — a manual-rule amenity always needs manager sign-off.</p>
    </div>
  );
}

function fmtSlot(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Kpi({ label, value, note, tone, icon }: { label: string; value: string; note: string; tone: Tone; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span>
      <div className="text-[13px] text-text-2 font-medium mt-3">{label}</div>
      <div className="text-[21px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div>
      <div className="text-[11px] mt-1" style={{ color: toneVar(tone) }}>{note}</div>
    </div>
  );
}
