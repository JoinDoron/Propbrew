/**
 * Estate Experience seed. Tied to the Lekki Gardens residents/units and the
 * existing arrears invoices. Late-July 2026. A lively community: mixed
 * sentiment, a couple of complaint hotspots, real debtors mid-recovery, tenancies
 * across the whole lifecycle, and a parcel room with an overdue package.
 */

import { SEED } from '@/server/identities';
import type { ResidentFeedback, EngagementSnapshot, Complaint, CollectionCase, Tenancy, Locker, Parcel, Motion, CommunityEvent, RewardMember, Perk, BoardMember, Meeting } from '@/domain/estate/types';

const A = SEED.tenantA;
const G = SEED.estateGardens;
const ngn = (major: number) => Math.round(major * 100); // → minor (kobo)

export const residentFeedback = ([
  { tenantId: A, id: 'fb-1', estateId: G, residentName: 'Folake Bello', unitLabel: 'Block C · 12B', channel: 'app', sentiment: 'negative', topic: 'Lift', text: 'Block C lift still noisy after the last repair.', atISO: '2026-07-25T18:10:00Z', acknowledged: false },
  { tenantId: A, id: 'fb-2', estateId: G, residentName: 'Tobi Ade', unitLabel: 'Block C · 09A', channel: 'whatsapp', sentiment: 'positive', topic: 'Security', text: 'Really happy with the new gate response time.', atISO: '2026-07-25T16:40:00Z', acknowledged: false },
  { tenantId: A, id: 'fb-3', estateId: G, residentName: 'Kemi Adeyinka', unitLabel: 'Block C · 03B', channel: 'survey', sentiment: 'neutral', topic: 'Cleaning', text: 'Common areas are okay but bins fill up fast on weekends.', atISO: '2026-07-25T12:00:00Z', acknowledged: false },
  { tenantId: A, id: 'fb-4', estateId: G, residentName: 'David Okon', unitLabel: 'Block D · 07B', channel: 'app', sentiment: 'negative', topic: 'Water', text: 'Low water pressure in Block D mornings this week.', atISO: '2026-07-24T08:20:00Z', acknowledged: false },
  { tenantId: A, id: 'fb-5', estateId: G, residentName: 'Ada Obi', unitLabel: 'Block D · 01A', channel: 'front_desk', sentiment: 'positive', topic: 'Events', text: 'The kids’ pool day was lovely, thank you!', atISO: '2026-07-24T15:30:00Z', acknowledged: true },
  { tenantId: A, id: 'fb-6', estateId: G, residentName: 'Yusuf Bello', unitLabel: 'Block C · 11C', channel: 'app', sentiment: 'positive', topic: 'App', text: 'Paying service charge in-app is so much easier now.', atISO: '2026-07-23T19:05:00Z', acknowledged: true },
  { tenantId: A, id: 'fb-7', estateId: G, residentName: 'Tobi Ade', unitLabel: 'Block C · 09A', channel: 'whatsapp', sentiment: 'negative', topic: 'Parking', text: 'Visitors keep taking my parking bay.', atISO: '2026-07-23T09:15:00Z', acknowledged: false },
  { tenantId: A, id: 'fb-8', estateId: G, residentName: 'Folake Bello', unitLabel: 'Block C · 12B', channel: 'survey', sentiment: 'neutral', topic: 'Comms', text: 'Would like more notice before water shutdowns.', atISO: '2026-07-22T11:00:00Z', acknowledged: true },
] as unknown as ResidentFeedback[]);

export const engagementSnapshot = ([
  { tenantId: A, id: 'eng-1', estateId: G, totalResidents: 240, activeResidents: 176, appAdoptionPct: 73, eventAttendancePct: 41, pollParticipationPct: 38, announcementReadPct: 82 },
] as unknown as EngagementSnapshot[]);

export const complaints = ([
  { tenantId: A, id: 'cp-1', estateId: G, building: 'Block D', category: 'Water pressure', severity: 'high', status: 'open', atISO: '2026-07-24T08:00:00Z' },
  { tenantId: A, id: 'cp-2', estateId: G, building: 'Block C', category: 'Lift noise', severity: 'medium', status: 'open', atISO: '2026-07-25T18:00:00Z' },
  { tenantId: A, id: 'cp-3', estateId: G, building: 'Block C', category: 'Parking', severity: 'low', status: 'open', atISO: '2026-07-23T09:00:00Z' },
  { tenantId: A, id: 'cp-4', estateId: G, building: 'Block D', category: 'Noise', severity: 'medium', status: 'open', atISO: '2026-07-22T22:00:00Z' },
  { tenantId: A, id: 'cp-5', estateId: G, building: 'Block C', category: 'Cleaning', severity: 'low', status: 'resolved', atISO: '2026-07-20T10:00:00Z' },
  { tenantId: A, id: 'cp-6', estateId: G, building: 'Block D', category: 'Security', severity: 'high', status: 'resolved', atISO: '2026-07-19T21:00:00Z' },
] as unknown as Complaint[]);

export const collectionCases = ([
  { tenantId: A, id: 'col-1', estateId: G, invoiceRef: 'INV-2981', residentName: 'Amina Sule', unitLabel: 'Block D · 04C', amountMinor: ngn(250000), agingDays: 57, stage: 'escalated', remindersSent: 3, promiseAmountMinor: ngn(100000), promiseDueISO: '2026-07-18', promiseStatus: 'broken', lastActionISO: '2026-07-20' },
  { tenantId: A, id: 'col-2', estateId: G, invoiceRef: 'INV-2990', residentName: 'Tobi Ade', unitLabel: 'Block C · 09A', amountMinor: ngn(200000), agingDays: 41, stage: 'plan', remindersSent: 2, promiseAmountMinor: ngn(50000), promiseDueISO: '2026-07-30', promiseStatus: 'pending', lastActionISO: '2026-07-22' },
  { tenantId: A, id: 'col-3', estateId: G, invoiceRef: 'INV-3004', residentName: 'Folake Bello', unitLabel: 'Block C · 12B', amountMinor: ngn(45000), agingDays: 21, stage: 'notice', remindersSent: 1, lastActionISO: '2026-07-23' },
  { tenantId: A, id: 'col-4', estateId: G, invoiceRef: 'INV-3001', residentName: 'Folake Bello', unitLabel: 'Block C · 12B', amountMinor: ngn(85000), agingDays: 11, stage: 'reminder', remindersSent: 0 },
  { tenantId: A, id: 'col-5', estateId: G, invoiceRef: 'INV-3010', residentName: 'David Okon', unitLabel: 'Block D · 07B', amountMinor: ngn(30000), agingDays: 6, stage: 'reminder', remindersSent: 0 },
] as unknown as CollectionCase[]);

export const tenancies = ([
  { tenantId: A, id: 'tn-1', estateId: G, residentName: 'Amina Sule', unitLabel: 'Block D · 04C', stage: 'approved', applicationISO: '2026-07-10', moveInISO: '2026-08-01', rentMinor: ngn(4200000), depositMinor: ngn(1050000), depositStatus: 'pending' },
  { tenantId: A, id: 'tn-2', estateId: G, residentName: 'Chinelo Umeh', unitLabel: 'Block C · 06A', stage: 'screening', applicationISO: '2026-07-22', rentMinor: ngn(3600000), depositMinor: ngn(900000), depositStatus: 'pending' },
  { tenantId: A, id: 'tn-3', estateId: G, residentName: 'Ibrahim Sani', unitLabel: 'Block D · 10C', stage: 'moving_in', applicationISO: '2026-06-28', moveInISO: '2026-07-28', rentMinor: ngn(6000000), depositMinor: ngn(1500000), depositStatus: 'held' },
  { tenantId: A, id: 'tn-4', estateId: G, residentName: 'Folake Bello', unitLabel: 'Block C · 12B', stage: 'active', applicationISO: '2024-02-10', moveInISO: '2024-03-01', leaseEndISO: '2026-08-31', rentMinor: ngn(4200000), depositMinor: ngn(1050000), depositStatus: 'held' },
  { tenantId: A, id: 'tn-5', estateId: G, residentName: 'David Okon', unitLabel: 'Block D · 07B', stage: 'active', applicationISO: '2024-03-01', moveInISO: '2024-03-22', leaseEndISO: '2027-03-21', rentMinor: ngn(5400000), depositMinor: ngn(1350000), depositStatus: 'held' },
  { tenantId: A, id: 'tn-6', estateId: G, residentName: 'Grace Umeh', unitLabel: 'Block C · 11C', stage: 'notice', applicationISO: '2023-05-01', moveInISO: '2023-06-01', leaseEndISO: '2026-08-15', moveOutISO: '2026-08-15', rentMinor: ngn(3000000), depositMinor: ngn(750000), depositStatus: 'held' },
  { tenantId: A, id: 'tn-7', estateId: G, residentName: 'Peter Adeleke', unitLabel: 'Block D · 04C', stage: 'moving_out', applicationISO: '2022-01-01', moveInISO: '2022-02-01', moveOutISO: '2026-07-25', rentMinor: ngn(4200000), depositMinor: ngn(1050000), depositStatus: 'held' },
] as unknown as Tenancy[]);

export const lockers = ([
  { tenantId: A, id: 'lk-1', estateId: G, bank: 'Reception', label: 'A1', size: 'S', parcelId: 'pc-1' },
  { tenantId: A, id: 'lk-2', estateId: G, bank: 'Reception', label: 'A2', size: 'S' },
  { tenantId: A, id: 'lk-3', estateId: G, bank: 'Reception', label: 'A3', size: 'M', parcelId: 'pc-2' },
  { tenantId: A, id: 'lk-4', estateId: G, bank: 'Reception', label: 'A4', size: 'M' },
  { tenantId: A, id: 'lk-5', estateId: G, bank: 'Reception', label: 'B1', size: 'L', parcelId: 'pc-3' },
  { tenantId: A, id: 'lk-6', estateId: G, bank: 'Reception', label: 'B2', size: 'L' },
  { tenantId: A, id: 'lk-7', estateId: G, bank: 'Gatehouse', label: 'G1', size: 'M', parcelId: 'pc-4' },
  { tenantId: A, id: 'lk-8', estateId: G, bank: 'Gatehouse', label: 'G2', size: 'S' },
] as unknown as Locker[]);

export const parcels = ([
  { tenantId: A, id: 'pc-1', estateId: G, code: 'PKG-7741', residentName: 'Folake Bello', unitLabel: 'Block C · 12B', courier: 'Jumia', lockerLabel: 'A1', size: 'S', status: 'stored', receivedISO: '2026-07-25T14:00:00Z' },
  { tenantId: A, id: 'pc-2', estateId: G, code: 'PKG-7742', residentName: 'Kemi Adeyinka', unitLabel: 'Block C · 03B', courier: 'DHL', lockerLabel: 'A3', size: 'M', status: 'stored', receivedISO: '2026-07-26T09:30:00Z' },
  { tenantId: A, id: 'pc-3', estateId: G, code: 'PKG-7738', residentName: 'Tobi Ade', unitLabel: 'Block C · 09A', courier: 'GIG Logistics', lockerLabel: 'B1', size: 'L', status: 'overdue', receivedISO: '2026-07-21T11:00:00Z' },
  { tenantId: A, id: 'pc-4', estateId: G, code: 'PKG-7743', residentName: 'David Okon', unitLabel: 'Block D · 07B', courier: 'Amazon', lockerLabel: 'G1', size: 'M', status: 'stored', receivedISO: '2026-07-26T08:00:00Z' },
  { tenantId: A, id: 'pc-5', estateId: G, code: 'PKG-7744', residentName: 'Yusuf Bello', unitLabel: 'Block C · 11C', courier: 'Konga', size: 'S', status: 'received', receivedISO: '2026-07-26T10:15:00Z' },
  { tenantId: A, id: 'pc-6', estateId: G, code: 'PKG-7730', residentName: 'Ada Obi', unitLabel: 'Block D · 01A', courier: 'Jumia', size: 'M', status: 'collected', receivedISO: '2026-07-24T13:00:00Z', collectedISO: '2026-07-26T07:40:00Z' },
] as unknown as Parcel[]);

// eligibleWeight 240 units. mo-2 sits just under its 33% quorum — a few votes flip it.
export const motions = ([
  { tenantId: A, id: 'mo-1', estateId: G, ref: 'AGM-01', title: '2026/27 service-charge budget (+8%)', summary: 'Approve the annual budget with an 8% increase covering diesel, security and sinking fund.', category: 'budget', status: 'open', opensISO: '2026-07-20', closesISO: '2026-08-03', eligibleWeight: 240, forWeight: 96, againstWeight: 54, abstainWeight: 12, quorumPct: 33, thresholdPct: 50 },
  { tenantId: A, id: 'mo-2', estateId: G, ref: 'AGM-02', title: 'Install solar + inverter for common areas', summary: 'Capital project to cut diesel reliance on common-area power via a 40kVA solar/inverter system.', category: 'works', status: 'open', opensISO: '2026-07-22', closesISO: '2026-08-05', eligibleWeight: 240, forWeight: 69, againstWeight: 6, abstainWeight: 2, quorumPct: 33, thresholdPct: 66 },
  { tenantId: A, id: 'mo-3', estateId: G, ref: 'AGM-03', title: 'Amend bylaw: short-let restrictions', summary: 'Restrict unregistered short-let subleasing; require estate registration for any guest stay under 30 days.', category: 'rule', status: 'passed', opensISO: '2026-06-15', closesISO: '2026-06-29', eligibleWeight: 240, forWeight: 130, againstWeight: 60, abstainWeight: 10, quorumPct: 33, thresholdPct: 50 },
  { tenantId: A, id: 'mo-4', estateId: G, ref: 'AGM-04', title: 'Playground renovation levy (₦15k/unit)', summary: 'One-off levy to rebuild the Block D playground and add shade sails.', category: 'works', status: 'quorum_failed', opensISO: '2026-06-01', closesISO: '2026-06-15', eligibleWeight: 240, forWeight: 40, againstWeight: 10, abstainWeight: 5, quorumPct: 33, thresholdPct: 50 },
  { tenantId: A, id: 'mo-5', estateId: G, ref: 'AGM-05', title: 'Elect a new resident board member', summary: 'Open nominations and vote for the vacant residents’ committee seat.', category: 'board', status: 'draft', opensISO: '2026-08-10', closesISO: '2026-08-24', eligibleWeight: 240, forWeight: 0, againstWeight: 0, abstainWeight: 0, quorumPct: 33, thresholdPct: 50 },
] as unknown as Motion[]);

export const communityEvents = ([
  { tenantId: A, id: 'ev-1', estateId: G, title: 'Saturday Morning Yoga', category: 'fitness', venue: 'Rooftop Deck', host: 'Wellness Club', startISO: '2026-08-01T07:00:00Z', endISO: '2026-08-01T08:00:00Z', capacity: 20, rsvps: 14 },
  { tenantId: A, id: 'ev-2', estateId: G, title: 'Kids’ Pool Party', category: 'kids', venue: 'Swimming Pool', host: 'Estate Office', startISO: '2026-08-02T15:00:00Z', endISO: '2026-08-02T18:00:00Z', capacity: 40, rsvps: 38 },
  { tenantId: A, id: 'ev-3', estateId: G, title: 'Residents’ AGM 2026', category: 'meeting', venue: 'Clubhouse Hall', host: 'Estate Manager', startISO: '2026-08-03T17:00:00Z', endISO: '2026-08-03T19:00:00Z', capacity: 120, rsvps: 72 },
  { tenantId: A, id: 'ev-4', estateId: G, title: 'Independence Day BBQ', category: 'festive', venue: 'Central Lawn', host: 'Social Committee', startISO: '2026-10-01T13:00:00Z', endISO: '2026-10-01T18:00:00Z', capacity: 150, rsvps: 61 },
  { tenantId: A, id: 'ev-5', estateId: G, title: 'Wine & Cheese Mixer', category: 'social', venue: 'Clubhouse Lounge', host: 'Social Committee', startISO: '2026-08-09T19:00:00Z', endISO: '2026-08-09T22:00:00Z', capacity: 30, rsvps: 30 },
  { tenantId: A, id: 'ev-6', estateId: G, title: 'Spin Class', category: 'fitness', venue: 'Gym Studio', host: 'Wellness Club', startISO: '2026-07-21T06:30:00Z', endISO: '2026-07-21T07:30:00Z', capacity: 15, rsvps: 15 },
] as unknown as CommunityEvent[]);

export const rewardMembers = ([
  { tenantId: A, id: 'rw-1', estateId: G, residentName: 'Yusuf Bello', unitLabel: 'Block C · 11C', points: 3240, onTimeStreak: 18, eventsAttended: 12, pollsVoted: 9, lastEarnedISO: '2026-07-25' },
  { tenantId: A, id: 'rw-2', estateId: G, residentName: 'Ada Obi', unitLabel: 'Block D · 01A', points: 1880, onTimeStreak: 11, eventsAttended: 8, pollsVoted: 6, lastEarnedISO: '2026-07-24' },
  { tenantId: A, id: 'rw-3', estateId: G, residentName: 'Kemi Adeyinka', unitLabel: 'Block C · 03B', points: 1420, onTimeStreak: 9, eventsAttended: 5, pollsVoted: 5, lastEarnedISO: '2026-07-22' },
  { tenantId: A, id: 'rw-4', estateId: G, residentName: 'Folake Bello', unitLabel: 'Block C · 12B', points: 640, onTimeStreak: 3, eventsAttended: 4, pollsVoted: 2, lastEarnedISO: '2026-07-20' },
  { tenantId: A, id: 'rw-5', estateId: G, residentName: 'Tobi Ade', unitLabel: 'Block C · 09A', points: 380, onTimeStreak: 1, eventsAttended: 2, pollsVoted: 1, lastEarnedISO: '2026-07-15' },
  { tenantId: A, id: 'rw-6', estateId: G, residentName: 'David Okon', unitLabel: 'Block D · 07B', points: 210, onTimeStreak: 0, eventsAttended: 1, pollsVoted: 1, lastEarnedISO: '2026-07-10' },
] as unknown as RewardMember[]);

export const perks = ([
  { tenantId: A, id: 'pk-1', estateId: G, title: '1 month service-charge credit', detail: '₦25,000 off your next service charge', cost: 2500, category: 'Billing', stock: 5 },
  { tenantId: A, id: 'pk-2', estateId: G, title: 'Free clubhouse hall booking', detail: 'A weekend hall reservation, on the house', cost: 1200, category: 'Amenity', stock: 8 },
  { tenantId: A, id: 'pk-3', estateId: G, title: 'Priority parcel locker', detail: 'A dedicated large locker for a month', cost: 600, category: 'Parcels', stock: 10 },
  { tenantId: A, id: 'pk-4', estateId: G, title: 'Pool cabana for a day', detail: 'Reserved poolside cabana + towels', cost: 900, category: 'Amenity', stock: 6 },
] as unknown as Perk[]);

export const boardMembers = ([
  { tenantId: A, id: 'bd-1', estateId: G, name: 'Ngozi Okafor', unitLabel: 'Block A · 02A', role: 'Chair', portfolio: 'Strategy & governance', sinceISO: '2024-09-01', termEndISO: '2026-08-31' },
  { tenantId: A, id: 'bd-2', estateId: G, name: 'Yusuf Bello', unitLabel: 'Block C · 11C', role: 'Treasurer', portfolio: 'Budget & service charge', sinceISO: '2024-09-01', termEndISO: '2027-08-31' },
  { tenantId: A, id: 'bd-3', estateId: G, name: 'Ada Obi', unitLabel: 'Block D · 01A', role: 'Secretary', portfolio: 'Minutes & communications', sinceISO: '2025-01-15', termEndISO: '2027-01-14' },
  { tenantId: A, id: 'bd-4', estateId: G, name: 'Kemi Adeyinka', unitLabel: 'Block C · 03B', role: 'Member', portfolio: 'Amenities & events', sinceISO: '2024-09-01', termEndISO: '2026-08-31' },
  { tenantId: A, id: 'bd-5', estateId: G, name: 'David Okon', unitLabel: 'Block D · 07B', role: 'Member', portfolio: 'Security liaison', sinceISO: '2025-03-01', termEndISO: '2027-02-28' },
] as unknown as BoardMember[]);

export const meetings = ([
  { tenantId: A, id: 'mt-1', estateId: G, title: 'Residents’ AGM 2026', type: 'AGM', whenISO: '2026-08-03T17:00:00Z', venue: 'Clubhouse Hall', status: 'scheduled', resolutions: 0, attendees: 0, quorumRequired: 80 },
  { tenantId: A, id: 'mt-2', estateId: G, title: 'EGM — solar capital project', type: 'EGM', whenISO: '2026-08-05T18:00:00Z', venue: 'Clubhouse Hall', status: 'scheduled', resolutions: 0, attendees: 0, quorumRequired: 80 },
  { tenantId: A, id: 'mt-3', estateId: G, title: 'July committee meeting', type: 'committee', whenISO: '2026-07-12T18:00:00Z', venue: 'Clubhouse Lounge', status: 'held', resolutions: 4, attendees: 5, quorumRequired: 3 },
  { tenantId: A, id: 'mt-4', estateId: G, title: 'Q2 budget review', type: 'committee', whenISO: '2026-06-20T18:00:00Z', venue: 'Clubhouse Lounge', status: 'held', resolutions: 3, attendees: 4, quorumRequired: 3 },
] as unknown as Meeting[]);
