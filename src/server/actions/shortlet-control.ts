'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canEnterWorkspace } from '@/config/workspaces';
import { TURNOVER_CHECKLIST, type IdentityDocumentType, type ShortletPaymentMethod, type ShortletTransactionKind, type TurnoverStatus } from '@/domain/shortlet/control';
import { messageSchedule, renderTemplate, type MessageKey } from '@/domain/shortlet/automation';
import { money } from '@/domain/primitives';
import { nightsBetween, type BookingSource, type SlBooking } from '@/domain/shortlet/types';
import { ForbiddenError, assertCan, type Role } from '@/lib/authz';
import { withDurableMutation } from '@/server/data/durable-records';
import { db, recordHistory } from '@/server/data/store';
import { repos, scopedMutableGet } from '@/server/data';
import { getActor } from '@/server/session';
import { nowISO } from '@/server/clock';
import { operatingNowISO } from '@/server/operating-clock';
import { shortletControl } from '@/server/shortlet-control';
import { enqueueDelivery } from '@/server/integrations/delivery';

export type ShortletControlResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };
const PATHS = ['/shortlet', '/shortlet/operations', '/shortlet/bookings', '/shortlet/calendar', '/shortlet/guests', '/shortlet/inspections', '/shortlet/maintenance', '/shortlet/whatsapp', '/shortlet/channels', '/shortlet/team', '/shortlet/pricing', '/shortlet/copilot'];
const refresh = () => PATHS.forEach((path) => revalidatePath(path));
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function gate(action: 'create' | 'update' | 'transition') {
  const actor = await getActor();
  if (!actor.tenantId || !canEnterWorkspace(actor, 'shortlet')) return { ok: false as const, error: 'You cannot manage this Shortlet workspace.' };
  try { assertCan(actor, 'bookings_amenities', action); return { actor }; }
  catch (error) { if (error instanceof ForbiddenError) return { ok: false as const, error: 'Your current role cannot perform this Shortlet action.' }; throw error; }
}

function approval(tenantId: string, actorId: string, kind: 'guest_verification' | 'refund' | 'message_send' | 'rate_change' | 'team_role', entityId: string, title: string, summary: string, payload?: Record<string, string>) {
  const state = shortletControl(tenantId);
  const existing = state.approvals.find((row) => row.kind === kind && row.entityId === entityId && row.status === 'pending');
  if (existing) return existing;
  const row = { tenantId, id: `sla-${randomUUID()}`, kind, entityId, title, summary, status: 'pending' as const, requestedBy: actorId, requestedAtISO: nowISO(), payload };
  state.approvals.unshift(row);
  return row;
}

const verificationInput = z.object({
  bookingId: z.string().min(1).max(160),
  documentType: z.enum(['nin', 'passport', 'drivers_licence', 'voters_card', 'other']),
  documentLast4: z.string().trim().regex(/^[A-Za-z0-9]{4}$/),
  consentAccepted: z.literal(true),
  notes: z.string().trim().max(500).optional(),
}).strict();

export async function submitGuestVerification(input: { bookingId: string; documentType: IdentityDocumentType; documentLast4: string; consentAccepted: boolean; notes?: string }): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const parsed = verificationInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Record consent, a supported identity type and only the final four document characters.' };
    const booking = scopedMutableGet(access.actor, 'bookings_amenities', db.shortletBookings, parsed.data.bookingId, 'update');
    if (!booking) return { ok: false, error: 'Booking not found.' };
    const state = shortletControl(access.actor.tenantId!);
    const current = state.guestReadiness.find((row) => row.bookingId === booking.id);
    const row = {
      tenantId: access.actor.tenantId!, id: current?.id ?? `slg-${randomUUID()}`, bookingId: booking.id,
      documentType: parsed.data.documentType, documentLast4: parsed.data.documentLast4.toUpperCase(),
      status: 'pending_review' as const, consentAtISO: nowISO(), notes: parsed.data.notes,
    };
    if (current) Object.assign(current, row, { reviewedAtISO: undefined, reviewedBy: undefined }); else state.guestReadiness.unshift(row);
    approval(access.actor.tenantId!, access.actor.userId, 'guest_verification', row.id, `Verify ${booking.ref}`, `${booking.guestName} · ${parsed.data.documentType.replaceAll('_', ' ')} ending ${row.documentLast4}`);
    refresh(); return { ok: true, id: row.id, message: 'Identity attestation submitted for manager review.' };
  }, 'shortlet');
}

export async function reviewGuestVerification(id: string, decision: 'approved' | 'rejected', note = ''): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('transition'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const state = shortletControl(access.actor.tenantId!);
    const row = state.guestReadiness.find((item) => item.id === id && item.tenantId === access.actor.tenantId);
    if (!row || row.status !== 'pending_review') return { ok: false, error: 'Pending verification record not found.' };
    row.status = decision === 'approved' ? 'verified' : 'rejected'; row.reviewedBy = access.actor.userId; row.reviewedAtISO = nowISO();
    if (note.trim()) row.notes = note.trim().slice(0, 500);
    const request = state.approvals.find((item) => item.kind === 'guest_verification' && item.entityId === row.id && item.status === 'pending');
    if (request) Object.assign(request, { status: decision, decidedBy: access.actor.userId, decidedAtISO: nowISO(), decisionNote: note.trim().slice(0, 500) || undefined });
    refresh(); return { ok: true, id, message: decision === 'approved' ? 'Guest verification approved.' : 'Guest verification rejected.' };
  }, 'shortlet');
}

const transactionInput = z.object({
  bookingId: z.string().min(1).max(160), kind: z.enum(['accommodation_payment', 'caution_deposit', 'refund', 'damage_deduction']),
  amountNaira: z.number().finite().positive().max(1_000_000_000), method: z.enum(['bank_transfer', 'paystack', 'flutterwave', 'cash', 'other']),
  reference: z.string().trim().min(3).max(160), note: z.string().trim().max(500).optional(),
}).strict();

export async function submitShortletTransaction(input: { bookingId: string; kind: ShortletTransactionKind; amountNaira: number; method: ShortletPaymentMethod; reference: string; note?: string }): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('create'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const parsed = transactionInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Enter a valid NGN amount, method and unique payment or refund reference.' };
    const booking = scopedMutableGet(access.actor, 'bookings_amenities', db.shortletBookings, parsed.data.bookingId, 'create');
    if (!booking) return { ok: false, error: 'Booking not found.' };
    const amountMinor = Math.round(parsed.data.amountNaira * 100);
    if (!Number.isSafeInteger(amountMinor)) return { ok: false, error: 'The amount is outside the supported range.' };
    const state = shortletControl(access.actor.tenantId!);
    const openForBooking = state.transactions.filter((row) => row.bookingId === booking.id && !['rejected', 'completed'].includes(row.status));
    const pendingPayments = openForBooking.filter((row) => row.kind === 'accommodation_payment').reduce((sum, row) => sum + row.amountMinor, 0);
    const pendingRefunds = openForBooking.filter((row) => row.kind === 'refund').reduce((sum, row) => sum + row.amountMinor, 0);
    if (parsed.data.kind === 'accommodation_payment' && amountMinor > booking.total.minor - booking.paid.minor - pendingPayments) return { ok: false, error: 'The payment exceeds the outstanding balance after pending reconciliation records.' };
    if (parsed.data.kind === 'refund' && amountMinor > booking.paid.minor - pendingRefunds) return { ok: false, error: 'The refund exceeds the approved paid balance after pending refund requests.' };
    if (state.transactions.some((row) => row.reference.toLowerCase() === parsed.data.reference.toLowerCase())) return { ok: false, error: 'This transaction reference has already been recorded.' };
    const row = { tenantId: access.actor.tenantId!, id: `slt-${randomUUID()}`, bookingId: booking.id, kind: parsed.data.kind, amountMinor, currency: 'NGN' as const, method: parsed.data.method, reference: parsed.data.reference, status: 'pending_match' as const, requestedBy: access.actor.userId, requestedAtISO: nowISO(), note: parsed.data.note };
    state.transactions.unshift(row);
    if (row.kind === 'refund') approval(access.actor.tenantId!, access.actor.userId, 'refund', row.id, `Approve refund · ${booking.ref}`, `NGN ${(amountMinor / 100).toLocaleString('en-NG')} · ${row.reference}`);
    refresh(); return { ok: true, id: row.id, message: row.kind === 'refund' ? 'Refund request recorded for finance approval.' : 'Transaction recorded for settlement matching.' };
  }, 'shortlet');
}

export async function matchShortletTransaction(id: string): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const row = shortletControl(access.actor.tenantId!).transactions.find((item) => item.id === id && item.tenantId === access.actor.tenantId);
    if (!row || row.status !== 'pending_match') return { ok: false, error: 'Pending settlement record not found.' };
    row.status = 'matched'; row.reviewedBy = access.actor.userId; row.reviewedAtISO = nowISO();
    refresh(); return { ok: true, id, message: 'Settlement reference matched; finance approval is still required.' };
  }, 'shortlet');
}

export async function approveShortletTransaction(id: string, decision: 'approved' | 'rejected', note = ''): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('transition'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const state = shortletControl(access.actor.tenantId!);
    const row = state.transactions.find((item) => item.id === id && item.tenantId === access.actor.tenantId);
    if (!row || !['pending_match', 'matched'].includes(row.status)) return { ok: false, error: 'Transaction awaiting approval not found.' };
    const booking = scopedMutableGet(access.actor, 'bookings_amenities', db.shortletBookings, row.bookingId, 'transition');
    if (!booking) return { ok: false, error: 'Booking not found.' };
    if (decision === 'approved' && ['accommodation_payment', 'caution_deposit'].includes(row.kind) && row.status !== 'matched') return { ok: false, error: 'Match the bank or gateway settlement evidence before finance approval.' };
    if (decision === 'rejected') row.status = 'rejected';
    else {
      if (row.kind === 'accommodation_payment') {
        if (booking.paid.currency !== 'NGN' || booking.total.currency !== 'NGN') return { ok: false, error: 'Only NGN booking payments can be approved here.' };
        booking.paid = money(Math.min(booking.total.minor, booking.paid.minor + row.amountMinor), 'NGN');
      } else if (row.kind === 'caution_deposit') booking.cautionStatus = 'held';
      else if (row.kind === 'refund') booking.paid = money(Math.max(0, booking.paid.minor - row.amountMinor), 'NGN');
      else booking.cautionDeducted = money(Math.min(booking.cautionFee.minor, booking.cautionDeducted.minor + row.amountMinor), 'NGN');
      row.status = 'completed';
      recordHistory('shortlet-booking', booking.id, { at: nowISO(), event: `FINANCE_${row.kind.toUpperCase()}`, from: booking.status, to: booking.status, actorId: access.actor.userId, actorName: 'Shortlet finance reviewer', actorRole: (access.actor.roles[0] as Role) ?? 'estate_manager', note: `${row.reference} · NGN ${(row.amountMinor / 100).toLocaleString('en-NG')}` });
    }
    row.reviewedBy = access.actor.userId; row.reviewedAtISO = nowISO(); if (note.trim()) row.note = note.trim().slice(0, 500);
    const request = state.approvals.find((item) => item.kind === 'refund' && item.entityId === row.id && item.status === 'pending');
    if (request) Object.assign(request, { status: decision, decidedBy: access.actor.userId, decidedAtISO: nowISO(), decisionNote: note.trim().slice(0, 500) || undefined });
    refresh(); return { ok: true, id, message: decision === 'approved' ? 'Finance transaction approved and posted.' : 'Finance transaction rejected.' };
  }, 'shortlet');
}

function ensureTurnover(tenantId: string, booking: SlBooking) {
  const state = shortletControl(tenantId);
  const existing = state.turnovers.find((row) => row.bookingId === booking.id);
  if (existing) return existing;
  const created = { tenantId, id: `slto-${randomUUID()}`, bookingId: booking.id, apartmentId: booking.apartmentId, dueAtISO: `${booking.checkOut}T12:00:00+01:00`, status: 'scheduled' as const, checklist: TURNOVER_CHECKLIST.map((item) => ({ ...item })), maintenanceIssueIds: [], createdAtISO: nowISO(), updatedAtISO: nowISO() };
  state.turnovers.unshift(created);
  return created;
}

export async function generateTurnoverTasks(): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('create'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const rows = repos.shortletBookings.list(access.actor, { limit: Number.MAX_SAFE_INTEGER }).items.filter((booking) => !['enquiry', 'cancelled'].includes(booking.status));
    let created = 0;
    const state = shortletControl(access.actor.tenantId!);
    for (const booking of rows) { const existed = state.turnovers.some((row) => row.bookingId === booking.id); ensureTurnover(access.actor.tenantId!, booking); if (!existed) created++; }
    refresh(); return { ok: true, message: `${created} turnover task${created === 1 ? '' : 's'} created; existing tasks were preserved.` };
  }, 'shortlet');
}

export async function assignTurnover(id: string, memberId: string): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const state = shortletControl(access.actor.tenantId!);
    const task = state.turnovers.find((row) => row.id === id && row.tenantId === access.actor.tenantId);
    const member = repos.shortletTeam.list(access.actor, { limit: Number.MAX_SAFE_INTEGER }).items.find((row) => row.id === memberId && ['housekeeper', 'manager'].includes(row.role));
    if (!task || !member) return { ok: false, error: 'Turnover task or eligible team member not found.' };
    task.assigneeId = member.id; task.assigneeName = member.name; task.status = 'assigned'; task.updatedAtISO = nowISO();
    refresh(); return { ok: true, id, message: `Turnover assigned to ${member.name}.` };
  }, 'shortlet');
}

export async function updateTurnover(id: string, input: { status: TurnoverStatus; completedKeys: string[]; note?: string }): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('transition'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    if (!['scheduled', 'assigned', 'in_progress', 'ready_for_inspection', 'ready', 'blocked'].includes(input.status)) return { ok: false, error: 'Choose a valid turnover status.' };
    const task = shortletControl(access.actor.tenantId!).turnovers.find((row) => row.id === id && row.tenantId === access.actor.tenantId);
    if (!task) return { ok: false, error: 'Turnover task not found.' };
    const completed = new Set(input.completedKeys);
    task.checklist = task.checklist.map((item) => ({ ...item, done: completed.has(item.key) }));
    if (input.status === 'ready' && task.checklist.some((item) => !item.done)) return { ok: false, error: 'Complete every turnover check before marking the apartment ready.' };
    task.status = input.status; task.note = input.note?.trim().slice(0, 500) || undefined; task.updatedAtISO = nowISO();
    refresh(); return { ok: true, id, message: 'Turnover status updated.' };
  }, 'shortlet');
}

export async function scheduleBookingMessages(bookingId: string): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('create'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const booking = scopedMutableGet(access.actor, 'bookings_amenities', db.shortletBookings, bookingId, 'create');
    if (!booking) return { ok: false, error: 'Booking not found.' };
    const apartment = repos.shortletApartments.list(access.actor, { limit: Number.MAX_SAFE_INTEGER }).items.find((row) => row.id === booking.apartmentId);
    const state = shortletControl(access.actor.tenantId!);
    const schedule = messageSchedule(booking, Date.now());
    let created = 0;
    for (const item of schedule) {
      const template = state.templates.find((row) => row.key === item.key && row.enabled);
      if (!template || state.messages.some((row) => row.bookingId === booking.id && row.templateKey === item.key)) continue;
      const row = { tenantId: access.actor.tenantId!, id: `slm-${randomUUID()}`, bookingId: booking.id, templateKey: item.key, body: renderTemplate(template.body, booking, apartment), scheduledForISO: `${item.whenISO}T09:00:00+01:00`, status: template.requiresApproval ? 'pending_approval' as const : 'draft' as const, requestedBy: access.actor.userId, requestedAtISO: nowISO() };
      state.messages.push(row); created++;
      if (row.status === 'pending_approval') approval(access.actor.tenantId!, access.actor.userId, 'message_send', row.id, `Approve ${template.label}`, `${booking.ref} · ${booking.guestName} · ${item.whenISO}`);
    }
    refresh(); return { ok: true, message: `${created} guest message${created === 1 ? '' : 's'} prepared for review.` };
  }, 'shortlet');
}

export async function approveGuestMessage(id: string, decision: 'approved' | 'rejected'): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('transition'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const state = shortletControl(access.actor.tenantId!);
    const message = state.messages.find((row) => row.id === id && row.tenantId === access.actor.tenantId);
    if (!message || !['pending_approval', 'draft'].includes(message.status)) return { ok: false, error: 'Pending message not found.' };
    const booking = repos.shortletBookings.list(access.actor, { limit: Number.MAX_SAFE_INTEGER }).items.find((row) => row.id === message.bookingId);
    if (!booking) return { ok: false, error: 'Booking not found.' };
    if (decision === 'rejected') message.status = 'cancelled';
    else {
      if (!uuid(access.actor.tenantId!)) return { ok: false, error: 'A database-backed company tenant is required to queue real delivery.' };
      message.queueId = await enqueueDelivery({ tenantId: access.actor.tenantId!, channel: 'whatsapp', recipient: booking.guestPhone, body: message.body, purpose: 'transactional', subjectId: booking.id, requiresApproval: false, notBeforeISO: message.scheduledForISO });
      message.status = 'queued'; message.approvedBy = access.actor.userId; message.approvedAtISO = nowISO();
    }
    const request = state.approvals.find((item) => item.kind === 'message_send' && item.entityId === message.id && item.status === 'pending');
    if (request) Object.assign(request, { status: decision, decidedBy: access.actor.userId, decidedAtISO: nowISO() });
    refresh(); return { ok: true, id, message: decision === 'approved' ? 'Message approved and placed in the durable delivery queue.' : 'Message rejected and cancelled.' };
  }, 'shortlet');
}

export async function saveMessageTemplate(input: { key: MessageKey; body: string; enabled: boolean; requiresApproval: boolean }): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    if (!['confirmation', 'prearrival', 'checkin', 'checkout', 'review'].includes(input.key) || !input.body.trim() || input.body.length > 3000) return { ok: false, error: 'Choose a valid template and enter up to 3,000 characters.' };
    const template = shortletControl(access.actor.tenantId!).templates.find((row) => row.key === input.key);
    if (!template) return { ok: false, error: 'Template not found.' };
    Object.assign(template, { body: input.body.trim(), enabled: input.enabled, requiresApproval: input.requiresApproval, updatedAtISO: nowISO(), updatedBy: access.actor.userId });
    refresh(); return { ok: true, message: 'Guest message template saved.' };
  }, 'shortlet');
}

const ALLOWED_CALENDAR_HOSTS = ['airbnb.com', 'www.airbnb.com', 'calendar.google.com', 'ical.booking.com', 'admin.booking.com'];
function safeCalendarUrl(value: string): URL | null {
  try { const url = new URL(value); return url.protocol === 'https:' && ALLOWED_CALENDAR_HOSTS.includes(url.hostname.toLowerCase()) && !url.username && !url.password ? url : null; } catch { return null; }
}

export async function saveChannelConnection(input: { apartmentId: string; channel: 'airbnb' | 'booking_com' | 'google'; importUrl: string }): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const url = safeCalendarUrl(input.importUrl);
    if (!url) return { ok: false, error: 'Use a supported HTTPS Airbnb, Booking.com or Google Calendar iCal URL.' };
    const apartment = scopedMutableGet(access.actor, 'bookings_amenities', db.shortletApartments, input.apartmentId, 'update');
    if (!apartment) return { ok: false, error: 'Apartment not found.' };
    const state = shortletControl(access.actor.tenantId!);
    const existing = state.channelConnections.find((row) => row.apartmentId === apartment.id && row.channel === input.channel);
    const connection = existing ?? { tenantId: access.actor.tenantId!, id: `slc-${randomUUID()}`, apartmentId: apartment.id, channel: input.channel, importUrl: url.toString(), status: 'pending' as const, importedEvents: 0, createdAtISO: nowISO(), updatedAtISO: nowISO() };
    if (!existing) state.channelConnections.unshift(connection);
    else Object.assign(connection, { importUrl: url.toString(), status: 'pending', updatedAtISO: nowISO(), lastError: undefined });
    if (!apartment.channels.includes(input.channel)) apartment.channels = [...apartment.channels, input.channel];
    refresh(); return { ok: true, id: connection.id, message: 'Channel connection saved. Run a sync to verify the feed.' };
  }, 'shortlet');
}

function parseIcalDate(value: string): string | null {
  const compact = value.trim().replace(/[^0-9]/g, '').slice(0, 8);
  if (!/^\d{8}$/.test(compact)) return null;
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}
function parseIcalEvents(body: string): { uid: string; start: string; end: string }[] {
  return body.split('BEGIN:VEVENT').slice(1).map((block) => {
    const uid = /\nUID(?:;[^:]*)?:(.+)/i.exec(`\n${block}`)?.[1]?.trim() ?? '';
    const start = parseIcalDate(/\nDTSTART(?:;[^:]*)?:(.+)/i.exec(`\n${block}`)?.[1] ?? '');
    const end = parseIcalDate(/\nDTEND(?:;[^:]*)?:(.+)/i.exec(`\n${block}`)?.[1] ?? '');
    return uid && start && end && Date.parse(end) > Date.parse(start) ? { uid, start, end } : null;
  }).filter((event): event is { uid: string; start: string; end: string } => Boolean(event)).slice(0, 500);
}

export async function syncChannelConnection(id: string): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('update'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const state = shortletControl(access.actor.tenantId!);
    const connection = state.channelConnections.find((row) => row.id === id && row.tenantId === access.actor.tenantId);
    if (!connection || !safeCalendarUrl(connection.importUrl)) return { ok: false, error: 'Verified channel connection not found.' };
    const apartment = scopedMutableGet(access.actor, 'bookings_amenities', db.shortletApartments, connection.apartmentId, 'update');
    if (!apartment) return { ok: false, error: 'Apartment not found.' };
    try {
      const response = await fetch(connection.importUrl, { signal: AbortSignal.timeout(15_000), redirect: 'error', headers: { accept: 'text/calendar' } });
      if (!response.ok) throw new Error(`Feed returned ${response.status}.`);
      const size = Number(response.headers.get('content-length') ?? 0); if (size > 1_000_000) throw new Error('Feed is larger than 1 MB.');
      const body = await response.text(); if (body.length > 1_000_000 || !body.includes('BEGIN:VCALENDAR')) throw new Error('Feed is not a supported iCalendar document.');
      const events = parseIcalEvents(body);
      let imported = 0;
      for (const event of events) {
        const digest = createHash('sha256').update(`${connection.id}:${event.uid}`).digest('hex').slice(0, 24);
        const bookingId = `sl-ical-${digest}`;
        if (db.shortletBookings.some((row) => row.tenantId === access.actor.tenantId && row.id === bookingId)) continue;
        const nights = nightsBetween(event.start, event.end);
        const source: BookingSource = connection.channel === 'booking_com' ? 'booking_com' : connection.channel === 'airbnb' ? 'airbnb' : 'direct';
        db.shortletBookings.unshift({ tenantId: access.actor.tenantId!, id: bookingId, ref: `ICAL-${digest.slice(0, 8).toUpperCase()}`, apartmentId: apartment.id, propertyId: apartment.propertyId, guestName: `${connection.channel === 'booking_com' ? 'Booking.com' : connection.channel === 'airbnb' ? 'Airbnb' : 'Calendar'} reservation`, guestPhone: '', checkIn: event.start, checkOut: event.end, nights, source, nightlyRate: apartment.nightlyRate, total: money(nights * apartment.nightlyRate.minor, apartment.nightlyRate.currency), paid: money(0, apartment.nightlyRate.currency), cautionFee: money(0, apartment.nightlyRate.currency), cautionStatus: 'pending', cautionDeducted: money(0, apartment.nightlyRate.currency), status: 'confirmed', guestToken: randomUUID(), createdAt: operatingNowISO() } as SlBooking);
        imported++;
      }
      Object.assign(connection, { status: 'active', lastSyncAtISO: nowISO(), lastSyncStatus: 'success', importedEvents: connection.importedEvents + imported, updatedAtISO: nowISO(), lastError: undefined });
      refresh(); return { ok: true, id, message: `${imported} new external reservation${imported === 1 ? '' : 's'} imported; existing event IDs were preserved.` };
    } catch (error) {
      Object.assign(connection, { status: 'error', lastSyncAtISO: nowISO(), lastSyncStatus: 'failed', updatedAtISO: nowISO(), lastError: error instanceof Error ? error.message.slice(0, 300) : 'Channel sync failed.' });
      refresh(); return { ok: false, error: connection.lastError ?? 'Channel sync failed.' };
    }
  }, 'shortlet');
}

export async function decideShortletApproval(id: string, decision: 'approved' | 'rejected', note = ''): Promise<ShortletControlResult> {
  return withDurableMutation(async () => {
    const access = await gate('transition'); if (!access.actor) return { ok: false, error: access.error ?? 'Access denied.' };
    const request = shortletControl(access.actor.tenantId!).approvals.find((row) => row.id === id && row.tenantId === access.actor.tenantId && row.status === 'pending');
    if (!request) return { ok: false, error: 'Pending approval not found.' };
    if (request.kind === 'guest_verification') return reviewGuestVerification(request.entityId, decision, note);
    if (request.kind === 'refund') return approveShortletTransaction(request.entityId, decision, note);
    if (request.kind === 'message_send') return approveGuestMessage(request.entityId, decision);
    if (request.kind === 'team_role' && decision === 'approved') {
      const memberId = request.payload?.memberId;
      const role = request.payload?.role;
      const member = memberId ? scopedMutableGet(access.actor, 'bookings_amenities', db.shortletTeam, memberId, 'transition') : undefined;
      if (!member || !role || !['manager', 'housekeeper', 'accountant'].includes(role) || member.role === 'owner') return { ok: false, error: 'The requested team-role change is no longer valid.' };
      member.role = role as typeof member.role;
    }
    Object.assign(request, { status: decision, decidedBy: access.actor.userId, decidedAtISO: nowISO(), decisionNote: note.trim().slice(0, 500) || undefined });
    refresh(); return { ok: true, id, message: `Approval ${decision}.` };
  }, 'shortlet');
}

