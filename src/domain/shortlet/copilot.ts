/** Read-only, deterministic Shortlet guidance. No provider, mutation or raw credential context. */
import type { Money } from '@/domain/primitives';
import type { Apartment, SlBooking, SlInspection } from './types';
import { outstandingMinor } from './types';
import type { MaintenanceIssue, PricingRule, Review } from './operations';
import { effectiveRate, issueStats, reviewStats, reviewsByApartment } from './operations';
import { detectConflicts } from './automation';
import { movementsOn, occupancyRate, suggestNightlyRate, turnovers } from './engine';

export const SHORTLET_QUESTIONS = [
  'Which bookings need attention?', 'How is occupancy this month?',
  'Are any recorded stays overlapping?', 'Which apartments need maintenance?',
  'What do the guest ratings show?', 'Explain the recorded pricing and rate suggestions.',
] as const;
export const SHORTLET_SOURCE_PATHS = ['/shortlet/bookings', '/shortlet/calendar', '/shortlet/channels', '/shortlet/maintenance', '/shortlet/reviews', '/shortlet/properties', '/shortlet/pricing', '/shortlet/inspections'] as const;
type SourcePath = (typeof SHORTLET_SOURCE_PATHS)[number];
export type ShortletSource = { label: string; href: SourcePath };
export type ShortletCoverage = { complete: boolean; collections: { label: string; loaded: number; total: number; complete: boolean }[] };
export type ShortletCopilotRecords = { apartments: readonly Apartment[]; bookings: readonly SlBooking[]; inspections: readonly SlInspection[]; issues: readonly MaintenanceIssue[]; reviews: readonly Review[]; pricingRules: readonly PricingRule[] };
export type ShortletCopilotContext = {
  snapshotISO: string; coverage: ShortletCoverage; month: string;
  apartments: { name: string; status: string; occupancyPct: number; base: Money; effective: Money | null; proposed: Money | null; reasons: string[]; ruleLabel: string | null }[];
  bookings: { ref: string; apartment: string; status: string; checkIn: string; checkOut: string; outstanding: Money | null; caution: Money; cautionStatus: string; inspectionPending: boolean }[];
  movements: { arrivals: string[]; departures: string[]; staying: string[] };
  turnovers: { apartment: string; checkout: string; nextCheckIn: string | null; sameDay: boolean }[];
  conflicts: { apartment: string; firstRef: string; secondRef: string; nights: number }[];
  maintenance: { stats: ReturnType<typeof issueStats>; rows: { apartment: string; title: string; status: string; priority: string }[] };
  reviews: { stats: ReturnType<typeof reviewStats>; apartments: { name: string; count: number; average: number }[] };
};
export type ShortletCopilotAnswer = {
  answer: string; details: string[]; sources: ShortletSource[]; grounded: boolean;
  source: 'builtin'; snapshotISO: string; coverage: ShortletCoverage;
};

export function shortletSnapshotLabel(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'Snapshot date unavailable' : `${at.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })} · WAT`;
}
const dayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00+01:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
export function shortletNativeMoney(value: Money): string {
  return Number.isFinite(value.minor) ? `${value.currency} ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: value.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value.minor / 100)}` : `${value.currency} amount unavailable`;
}
export function shortletCoverageLabel(coverage: ShortletCoverage): string {
  const incomplete = coverage.collections.filter((collection) => !collection.complete);
  return coverage.complete ? 'All available pages of the authorised record collections were read.' : `Partial record coverage: ${incomplete.map((collection) => `${collection.label} ${collection.loaded} of ${collection.total}`).join('; ') || 'one or more collections are incomplete'}. Counts and calculations apply only to loaded records; open the source registers before deciding.`;
}

/** Project explicit safe fields only. Never spread an apartment, booking, inspection or review into context. */
export function createShortletCopilotContext(records: ShortletCopilotRecords, snapshotISO: string, coverage: ShortletCoverage): ShortletCopilotContext {
  const nowMs = Date.parse(snapshotISO);
  const now = new Date(nowMs);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const day = snapshotISO.slice(0, 10);
  const apartmentNames = new Map(records.apartments.map((apartment) => [apartment.id, apartment.name]));
  const named = (id: string) => apartmentNames.get(id) ?? 'Apartment not linked';
  const inspected = new Set(records.inspections.map((inspection) => inspection.bookingId));
  const moves = movementsOn(records.bookings, day);
  const ratingMap = reviewsByApartment(records.reviews);
  return {
    snapshotISO, coverage,
    month: now.toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }),
    apartments: records.apartments.map((apartment) => {
      const occupancyPct = occupancyRate(records.bookings, apartment.id, start, end);
      const rules = records.pricingRules.filter((rule) => rule.apartmentId === apartment.id);
      const rate = apartment.nightlyRate.currency === 'NGN' ? effectiveRate(apartment.nightlyRate.minor, rules, day) : null;
      const proposed = apartment.nightlyRate.currency === 'NGN' ? suggestNightlyRate(apartment, day, occupancyPct) : null;
      return { name: apartment.name, status: apartment.status, occupancyPct, base: { minor: apartment.nightlyRate.minor, currency: apartment.nightlyRate.currency }, effective: rate ? { minor: rate.minor, currency: apartment.nightlyRate.currency } : null, proposed: proposed ? { minor: proposed.suggestedMinor, currency: apartment.nightlyRate.currency } : null, reasons: proposed?.reasons ?? ['The existing rate-advisory engine supports NGN only; no foreign-currency suggestion or conversion is made.'], ruleLabel: rules.find((rule) => rule === rate?.rule)?.label ?? null };
    }),
    bookings: records.bookings.map((booking) => ({ ref: booking.ref, apartment: named(booking.apartmentId), status: booking.status, checkIn: booking.checkIn, checkOut: booking.checkOut, outstanding: booking.total.currency === booking.paid.currency ? { minor: outstandingMinor(booking), currency: booking.total.currency } : null, caution: { minor: booking.cautionFee.minor, currency: booking.cautionFee.currency }, cautionStatus: booking.cautionStatus, inspectionPending: booking.status === 'checked_out' && !inspected.has(booking.id) })),
    movements: { arrivals: moves.arrivals.map((booking) => booking.ref), departures: moves.departures.map((booking) => booking.ref), staying: moves.staying.map((booking) => booking.ref) },
    turnovers: turnovers(records.bookings, nowMs, 10).map((turnover) => ({ apartment: named(turnover.apartmentId), checkout: turnover.checkoutISO, nextCheckIn: turnover.nextCheckInISO, sameDay: turnover.sameDay })),
    conflicts: detectConflicts(records.bookings).map((conflict) => ({ apartment: named(conflict.apartmentId), firstRef: conflict.a.ref, secondRef: conflict.b.ref, nights: conflict.nights })),
    maintenance: { stats: issueStats(records.issues, nowMs), rows: records.issues.map((issue) => ({ apartment: named(issue.apartmentId), title: issue.title, status: issue.status, priority: issue.priority })) },
    reviews: { stats: reviewStats(records.reviews), apartments: [...ratingMap.entries()].map(([id, ratings]) => ({ name: named(id), count: ratings.count, average: ratings.avg })) },
  };
}

const source = (label: string, href: SourcePath): ShortletSource => ({ label, href });
function preview(rows: string[]): string[] {
  return rows.length > 10 ? [...rows.slice(0, 10), `Showing 10 of ${rows.length} matching records. Open the linked source register to review the full list.`] : rows;
}

export function askShortlet(question: string, context: ShortletCopilotContext): ShortletCopilotAnswer {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some((word) => q.includes(word));
  const result = (answer: string, details: string[], sources: ShortletSource[], grounded = true): ShortletCopilotAnswer => ({ answer, details: preview(details), sources, grounded, source: 'builtin', snapshotISO: context.snapshotISO, coverage: context.coverage });
  if (has('password', 'wifi', 'wi-fi', 'access code', 'access instruction', 'phone', 'email', 'bank account', 'account number', 'guest token', 'another tenant', 'other tenant')) return result('Private contact details, guest tokens, access credentials and financial account details are not part of this assistant context. This assistant only reads your authorised Shortlet records.', [], [], false);
  if (/\b(send|refund|cancel|confirm|delete|pay|charge|book|apply|change|update)\b/.test(q) && !has('how', 'which', 'what', 'explain', 'show', 'status', 'recorded')) return result('I cannot send messages, move money or change a record. Open the authorised source workflow and review any proposed action there.', [], [source('Booking register', '/shortlet/bookings'), source('Pricing rules', '/shortlet/pricing')], false);
  if (has('overlap', 'conflict', 'double-book', 'double book', 'channel')) return result(`${context.conflicts.length} overlapping recorded stay pair(s) in the loaded scope. This checks booking records only, not live external-channel availability.`, context.conflicts.map((conflict) => `${conflict.apartment}: ${conflict.firstRef} and ${conflict.secondRef} overlap by ${conflict.nights} night(s).`), [source('Channel conflict register', '/shortlet/channels'), source('Booking calendar', '/shortlet/calendar')]);
  if (has('maintenance', 'repair', 'issue', 'priority', 'broken', 'leak')) {
    const open = context.maintenance.rows.filter((issue) => issue.status !== 'resolved');
    return result(`${context.maintenance.stats.open} open and ${context.maintenance.stats.inProgress} in-progress maintenance record(s); ${context.maintenance.stats.resolvedThisMonth} resolved in ${context.month}. Recorded priorities are operator-reviewed rules, not a safety assessment.`, open.map((issue) => `${issue.apartment}: ${issue.title} · ${issue.priority} priority · ${issue.status.replaceAll('_', ' ')}.`), [source('Shortlet maintenance', '/shortlet/maintenance')]);
  }
  if (has('occupancy', 'occupied', 'available', 'vacan')) return result(`Recorded occupancy for ${context.month} across ${context.apartments.length} apartment(s). It uses nights in confirmed, checked-in, checked-out or closed booking records; it is not a live availability guarantee.`, context.apartments.map((apartment) => `${apartment.name}: ${apartment.occupancyPct}% recorded occupancy · apartment status ${apartment.status}.`), [source('Booking calendar', '/shortlet/calendar'), source('Apartment records', '/shortlet/properties')]);
  if (has('pricing', 'price', 'rate', 'nightly', 'season')) return result(`Recorded pricing for ${context.apartments.length} apartment(s), with advisory calculations for the snapshot operating date. Suggestions are not demand forecasts, are never auto-applied, and do not publish external channel prices.`, context.apartments.map((apartment) => `${apartment.name}: base ${shortletNativeMoney(apartment.base)} per night.${apartment.effective ? ` Effective record: ${shortletNativeMoney(apartment.effective)} (${apartment.ruleLabel ?? 'base rate'}).` : ''}${apartment.proposed ? ` Rules-based suggestion: ${shortletNativeMoney(apartment.proposed)}.` : ''} ${apartment.reasons.join('; ')}`), [source('Rate recommendations', '/shortlet/properties'), source('Recorded pricing rules', '/shortlet/pricing')]);
  if (has('review', 'rating', 'feedback') && !has('booking', 'inspection')) return result(context.reviews.stats.count ? `${context.reviews.stats.count} recorded guest review(s), averaging ${context.reviews.stats.avg} out of 5. These are recorded ratings, not verified public-channel reviews or a service/safety guarantee.` : 'No guest review records are available in the loaded scope. There is no rating to infer.', context.reviews.apartments.map((apartment) => `${apartment.name}: ${apartment.average}/5 across ${apartment.count} recorded review(s).`), [source('Guest review register', '/shortlet/reviews')]);
  if (has('turnover', 'clean', 'arrival', 'departure', 'check-in', 'check-out', 'check in', 'check out', 'movement')) return result(`${context.movements.arrivals.length} arrival-date and ${context.movements.departures.length} departure-date record(s), with ${context.movements.staying.length} checked-in stay(s), on the snapshot date. Date matches can include enquiries; verify each booking status before preparing a unit.`, [...context.bookings.filter((booking) => context.movements.arrivals.includes(booking.ref) || context.movements.departures.includes(booking.ref) || context.movements.staying.includes(booking.ref)).map((booking) => `${booking.ref} · ${booking.apartment}: ${dayLabel(booking.checkIn)} → ${dayLabel(booking.checkOut)} · ${booking.status.replaceAll('_', ' ')}.`), ...context.turnovers.filter((turnover) => turnover.sameDay).map((turnover) => `${turnover.apartment}: same-day turnover on ${dayLabel(turnover.checkout)}; review cleaning and check-in readiness.`)], [source('Booking register', '/shortlet/bookings'), source('Turnover calendar', '/shortlet/calendar')]);
  if (has('booking', 'attention', 'balance', 'payment', 'caution', 'deposit', 'inspection')) {
    const open = context.bookings.filter((booking) => !['closed', 'cancelled'].includes(booking.status));
    const pending = context.bookings.filter((booking) => booking.inspectionPending);
    return result(`${open.length} non-terminal booking record(s) and ${pending.length} checked-out booking(s) without a linked inspection in the loaded scope. Payment and caution states are recorded off-platform; they are not bank settlement or refund evidence.`, [...open.map((booking) => `${booking.ref} · ${booking.apartment} · ${booking.status.replaceAll('_', ' ')}: ${booking.outstanding ? shortletNativeMoney(booking.outstanding) + ' recorded outstanding' : 'outstanding unavailable: total and paid currencies differ'}. Caution ${shortletNativeMoney(booking.caution)}, recorded as ${booking.cautionStatus.replaceAll('_', ' ')}.`), ...pending.map((booking) => `${booking.ref} · ${booking.apartment}: checkout inspection needs review.`)], [source('Booking register', '/shortlet/bookings'), source('Checkout inspections', '/shortlet/inspections')]);
  }
  return result('I can explain recorded bookings, occupancy, overlapping stays, maintenance, guest ratings and pricing. Choose a suggested question. I do not query other modules, search the internet, send messages or change records.', [], [], false);
}
