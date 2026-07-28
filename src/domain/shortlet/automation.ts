/**
 * Short-Let PMS — automation engine (deterministic, no LLM).
 *
 * FR-WA WhatsApp automation: templated per-booking messages and their fire
 * schedule/status. FR-IC iCal channel sync: connection status, an outbound feed
 * per apartment, and cross-channel double-booking detection (the "no more double
 * bookings" promise the PRD flags as a real risk).
 */

import type { Apartment, SlBooking, Channel } from './types';

const DAY = 24 * 3600 * 1000;

/* --- FR-WA: message templates --------------------------------------------- */

export type MessageKey = 'confirmation' | 'prearrival' | 'checkin' | 'checkout' | 'review';
export type Template = { key: MessageKey; label: string; trigger: string; body: string };

/** Editable defaults. Variables in {{…}} are filled per booking. */
export const DEFAULT_TEMPLATES: Template[] = [
  { key: 'confirmation', label: 'Booking confirmation', trigger: 'On confirm (FR-WA-01)', body: 'Hi {{guest}} 👋 Your booking at {{apartment}}, {{property}} is confirmed for {{checkin}} → {{checkout}} ({{nights}} nights). Check-in details: {{link}}. Balance due: {{balance}}. — {{host}}' },
  { key: 'prearrival', label: 'Pre-arrival reminder', trigger: '1 day before check-in (FR-WA-02)', body: 'Hi {{guest}}, you check in tomorrow at {{apartment}}! 🏠 WiFi: {{wifi}}. Access: {{access}}. Reach us any time on WhatsApp. Safe travels!' },
  { key: 'checkin', label: 'Check-in day', trigger: 'On check-in day', body: 'Welcome, {{guest}}! Your home for the next {{nights}} nights is ready at {{apartment}}. Anything you need, just message us here.' },
  { key: 'checkout', label: 'Checkout reminder', trigger: 'Checkout morning (FR-WA-02)', body: 'Good morning {{guest}}! Checkout at {{apartment}} is by 12 noon today. Please leave the keys as instructed. It was lovely hosting you 🙏' },
  { key: 'review', label: 'Review request', trigger: '1 day after checkout', body: 'Thank you for staying at {{apartment}}, {{guest}}! We’d love a quick review, and a 10% returning-guest discount is waiting for you next time. 💛' },
];

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;

export function renderTemplate(body: string, b: SlBooking, apt: Apartment | undefined, hostName = 'Your host'): string {
  const vars: Record<string, string> = {
    guest: b.guestName.split(' ')[0], apartment: apt?.name ?? '', property: '', checkin: b.checkIn.slice(5), checkout: b.checkOut.slice(5),
    nights: String(b.nights), wifi: apt ? `${apt.wifiSsid} · ${apt.wifiPassword}` : '', access: apt?.accessInstructions ?? '',
    balance: money(Math.max(0, b.total.minor - b.paid.minor)), link: `stay.vesta.ng/g/${b.id.slice(-8)}`, host: hostName,
  };
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/* --- FR-WA: per-booking schedule + status --------------------------------- */

export type MsgStatus = 'sent' | 'scheduled' | 'pending' | 'skipped';
export type ScheduledMsg = { key: MessageKey; label: string; whenISO: string; status: MsgStatus };

const ALIVE = ['confirmed', 'checked_in', 'checked_out', 'closed'];

/** When each message fires for a booking, and whether it's sent/scheduled given now. */
export function messageSchedule(b: SlBooking, nowMs: number): ScheduledMsg[] {
  const ci = Date.parse(b.checkIn), co = Date.parse(b.checkOut);
  const cancelled = b.status === 'cancelled', enquiry = b.status === 'enquiry';
  const at = (ms: number, live: boolean): MsgStatus => (cancelled || (enquiry && ms < nowMs) ? 'skipped' : enquiry ? 'pending' : !live ? 'pending' : ms <= nowMs ? 'sent' : 'scheduled');
  const live = ALIVE.includes(b.status);
  return [
    { key: 'confirmation', label: 'Booking confirmation', whenISO: b.checkIn, status: cancelled ? 'skipped' : enquiry ? 'pending' : 'sent' },
    { key: 'prearrival', label: 'Pre-arrival reminder', whenISO: new Date(ci - DAY).toISOString().slice(0, 10), status: at(ci - DAY, live) },
    { key: 'checkin', label: 'Check-in day', whenISO: b.checkIn, status: at(ci, live) },
    { key: 'checkout', label: 'Checkout reminder', whenISO: b.checkOut, status: at(co, live) },
    { key: 'review', label: 'Review request', whenISO: new Date(co + DAY).toISOString().slice(0, 10), status: at(co + DAY, live) },
  ];
}

export type WaStats = { sent: number; scheduled: number; delivered: number; read: number };

/** Portfolio messaging stats (delivered/read simulated at industry rates). */
export function whatsappStats(bookings: readonly SlBooking[], nowMs: number): WaStats {
  let sent = 0, scheduled = 0;
  for (const b of bookings) for (const m of messageSchedule(b, nowMs)) { if (m.status === 'sent') sent++; else if (m.status === 'scheduled') scheduled++; }
  return { sent, scheduled, delivered: Math.round(sent * 0.98), read: Math.round(sent * 0.86) };
}

/* --- FR-IC: iCal channels + double-booking guard -------------------------- */

export const ALL_CHANNELS: { key: Channel; label: string }[] = [
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'booking_com', label: 'Booking.com' },
  { key: 'google', label: 'Google Calendar' },
];

export function channelLabel(c: Channel): string { return ALL_CHANNELS.find((x) => x.key === c)?.label ?? c; }
export function outboundFeedUrl(apartmentId: string): string { return `https://ical.vesta.ng/${apartmentId}.ics`; }

export type ChannelSummary = { connections: number; apartmentsSynced: number; byChannel: { channel: Channel; label: string; count: number }[] };

export function channelSummary(apartments: readonly Apartment[]): ChannelSummary {
  const byChannel = ALL_CHANNELS.map((c) => ({ channel: c.key, label: c.label, count: apartments.filter((a) => a.channels.includes(c.key)).length }));
  return { connections: apartments.reduce((n, a) => n + a.channels.length, 0), apartmentsSynced: apartments.filter((a) => a.channels.length > 0).length, byChannel };
}

export type Conflict = { apartmentId: string; a: SlBooking; b: SlBooking; nights: number };

/** Overlapping stays on the same apartment — the double-booking risk iCal
 *  latency creates. Non-cancelled bookings whose date ranges intersect. */
export function detectConflicts(bookings: readonly SlBooking[]): Conflict[] {
  const out: Conflict[] = [];
  const active = bookings.filter((b) => b.status !== 'cancelled');
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if (a.apartmentId !== b.apartmentId) continue;
      const start = Math.max(Date.parse(a.checkIn), Date.parse(b.checkIn));
      const end = Math.min(Date.parse(a.checkOut), Date.parse(b.checkOut));
      if (end > start) out.push({ apartmentId: a.apartmentId, a, b, nights: Math.round((end - start) / DAY) });
    }
  }
  return out;
}
