import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { initialWorkspaceRecordState, type db } from '@/server/data/store';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import type { CompanyPrincipal } from '@/server/auth/company';

const boundary = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { checkInVisitor, dispatchWoFromAlarm, logRefuel, preRegisterVisitor } from '@/server/actions/facility';
import { completePpmOccurrence } from '@/server/actions/ppm';
import { rescheduleInspection } from '@/server/actions/inspections';
import { advanceTenancy, rsvpEvent } from '@/server/actions/estate';
import { sendAnnouncement } from '@/server/actions/announcements';
import { uploadDocument } from '@/server/actions/documents';

let state: WorkspaceRecordState;
const actor = actorForCompanyMember({
  membershipId: 'clock-owner', userId: 'clock-user', companyId: 't-lekki', companyRole: 'owner',
  status: 'active', companyStatus: 'active', estateIds: [], allEstates: true,
}, 'clock-user')!;
const currentISO = '2026-10-24T23:30:00.000Z';
const rows = () => state.collections as unknown as typeof db;
const run = <T>(fn: () => T) => runWithRecordContext({
  state, domainTenantId: 't-lekki', mode: 'write', companyPrincipal: { actor, user: { id: actor.userId } } as CompanyPrincipal,
}, fn);

beforeEach(() => {
  vi.stubEnv('DATA_SOURCE', 'memory');
  state = initialWorkspaceRecordState('t-lekki');
  vi.stubEnv('DATA_SOURCE', 'postgres'); vi.stubEnv('PROPBREW_AUTH_MODE', 'company');
  vi.useFakeTimers(); vi.setSystemTime(new Date(currentISO));
  vi.clearAllMocks(); boundary.getActor.mockResolvedValue(actor);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('Estate and Facility native operations use the current Nigerian operating day', () => {
  it('issues and checks in a same-day visitor during the hour before UTC midnight', async () => {
    await run(async () => {
      expect(await preRegisterVisitor({ visitorName: 'QA current-day visitor', kind: 'guest', hostName: 'Host', hostUnit: 'A1', purpose: 'Visit' })).toMatchObject({ ok: true });
      const pass = rows().visitorPasses[0];
      expect(pass).toMatchObject({ validFromISO: '2026-10-25', validToISO: '2026-10-25', status: 'expected' });
      expect(await checkInVisitor(pass.id)).toMatchObject({ ok: true });
      expect(pass.checkedInISO).toBe(currentISO);
      expect(rows().accessEvents[0].atISO).toBe(currentISO);
    });
  });

  it('expires date-only passes at Nigerian midnight rather than UTC midnight', async () => {
    await run(async () => {
      const pass = rows().visitorPasses[0];
      pass.status = 'expected'; pass.validFromISO = '2026-10-25'; pass.validToISO = '2026-10-25';
      vi.setSystemTime(new Date('2026-10-25T23:00:00Z'));
      expect(await checkInVisitor(pass.id)).toMatchObject({ ok: false, error: 'This visitor pass is outside its valid entry window.' });
      expect(pass.status).toBe('expected');
    });
  });

  it('stamps native dispatch/refuelling records now and sets SLA deadlines after creation', async () => {
    await run(async () => {
      const alarm = rows().facilityAlarms[0]; alarm.woRef = undefined; alarm.severity = 'critical';
      expect(await dispatchWoFromAlarm(alarm.id)).toMatchObject({ ok: true });
      expect(rows().workOrders[0]).toMatchObject({ createdAt: currentISO, updatedAt: currentISO, respondDueAt: '2026-10-25T00:30:00.000Z', resolveDueAt: '2026-10-25T07:30:00.000Z' });
      const generator = rows().facilityGenerators[0];
      expect(await logRefuel(generator.id, 1)).toMatchObject({ ok: true });
      expect(generator.lastRefuelISO).toBe(currentISO);
    });
  });

  it('dates service completion and the next maintenance period from the current WAT day', async () => {
    await run(async () => {
      const occurrence = rows().ppmOccurrences.find((row) => row.status !== 'completed')!;
      const plan = rows().ppmPlans.find((row) => row.id === occurrence.planId)!;
      plan.frequency = 'monthly';
      expect(await completePpmOccurrence(occurrence.id, { checkedIds: plan.checklist.map((item) => item.id), photoCount: 1 })).toMatchObject({ ok: true });
      expect(plan.lastServicedAt).toBe('2026-10-25');
      expect(plan.nextDue).toBe('2026-11-24');
    });
  });

  it('keeps today’s inspection scheduled and marks yesterday overdue at the native WAT boundary', async () => {
    await run(async () => {
      const inspection = rows().inspections.find((row) => ['scheduled', 'overdue'].includes(row.status))!;
      expect(await rescheduleInspection(inspection.id, '2026-10-25')).toMatchObject({ ok: true });
      expect(inspection.status).toBe('scheduled');
      expect(await rescheduleInspection(inspection.id, '2026-10-24')).toMatchObject({ ok: true });
      expect(inspection.status).toBe('overdue');
    });
  });

  it('uses the operating day for a move-in and refuses an event that has already ended today', async () => {
    await run(async () => {
      const tenancy = rows().tenancies[0]; tenancy.stage = 'moving_in'; tenancy.moveInISO = undefined;
      expect(await advanceTenancy(tenancy.id)).toMatchObject({ ok: true });
      expect(tenancy.moveInISO).toBe('2026-10-25');
      const event = rows().communityEvents[0]; event.endISO = '2026-10-24T23:00:00Z';
      expect(await rsvpEvent(event.id)).toMatchObject({ ok: false, error: 'This event has ended.' });
    });
  });

  it('stamps newly published announcement and document records with the current instant', async () => {
    await run(async () => {
      const estateId = rows().sites.find((site) => site.kind === 'estate')!.id;
      expect(await sendAnnouncement({ estateId, title: 'Current record', body: 'Current company record.', scope: 'estate', audience: 'All residents', channels: ['in_app'], aiDrafted: false, approved: true })).toMatchObject({ ok: true });
      expect(rows().announcements[0].sentAt).toBe(currentISO);
      const result = await uploadDocument({ estateId, name: 'Current record', folder: 'General', type: 'other', audience: 'Managers', extracted: [], scanned: false });
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(result.error);
      expect(rows().documents.find((document) => document.id === result.id)?.updatedAt).toBe(currentISO);
    });
  });
});
