/**
 * Estate Experience seed. Tied to the Lekki Gardens residents/units and the
 * existing arrears invoices. Late-July 2026. A lively community: mixed
 * sentiment, a couple of complaint hotspots, real debtors mid-recovery, tenancies
 * across the whole lifecycle, and a parcel room with an overdue package.
 */

import { SEED } from '@/server/identities';
import type { ResidentFeedback, EngagementSnapshot, Complaint, CollectionCase, Tenancy, Locker, Parcel } from '@/domain/estate/types';

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
