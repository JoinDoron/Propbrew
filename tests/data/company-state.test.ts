import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankCompanyState } from '@/server/data/company-state';
import { initialWorkspaceRecordState, validateWorkspaceRecordState } from '@/server/data/store';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { getNotifications, getThreads, unreadNotificationCount, unreadThreadCount, pushNotification, markAllNotificationsRead } from '@/server/data/inbox';
import { repos } from '@/server/data';
import * as seed from '@/server/data/seed/fixtures';
import { identityByKey } from '@/server/identities';
import type { Actor } from '@/lib/authz';

const company = '12345678-1234-4234-8234-123456789abc';
const other = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const template = () => initialWorkspaceRecordState('t-lekki').collections;
const blank = () => createBlankCompanyState(template());
const run = <T>(state: WorkspaceRecordState, fn: () => T) => runWithRecordContext({ state, domainTenantId: company, mode: 'write' }, fn);
const actor = (tenantId = company): Actor => ({ ...identityByKey('estate_manager').actor, tenantId,
  roles: ['estate_manager', 'facility_manager', 'executive'], allEstates: true, estateIds: [] });
beforeEach(() => vi.stubEnv('DATA_SOURCE', 'memory'));
afterEach(() => vi.unstubAllEnvs());

describe('blank native company state', () => {
  it('preserves the entire schema with empty operational records, no history, auxiliary data or counters', () => {
    const original = template(), state = createBlankCompanyState(original);
    expect(Object.keys(state.collections).sort()).toEqual(Object.keys(original).sort());
    for (const [key, value] of Object.entries(original)) if (Array.isArray(value)) expect(state.collections[key], key).toEqual([]);
    expect(state).toMatchObject({ schemaVersion: 1, history: {}, auxiliary: {}, sequences: {} });
    expect(validateWorkspaceRecordState(state, company)).toBe(state);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('does not copy sample people, balances, guest details, branding or promotions', () => {
    const state = createBlankCompanyState({
      sites: [{ tenantId: 't-lekki', name: 'PRIVATE SAMPLE ESTATE' }], users: [{ name: 'PRIVATE SAMPLE PERSON', email: 'private@example.test' }],
      invoices: [{ minor: 909090, ref: 'PRIVATE INVOICE' }], shortletBookings: [{ guestName: 'PRIVATE GUEST', guestToken: 'private-token' }],
      shortletPlanKey: 'enterprise', shortletBookingPage: { enabled: true, slug: 'private-brand', cancellationPolicy: 'Private wording', holdHours: 48, promoCodes: [{ code: 'PRIVATE50' }] },
    });
    expect(state.collections.shortletPlanKey).toBe('lite');
    expect(state.collections.shortletBookingPage).toEqual({ enabled: false, slug: 'portfolio', cancellationPolicy: '', holdHours: 0, promoCodes: [] });
    expect(JSON.stringify(state)).not.toMatch(/PRIVATE|private|enterprise|909090|t-lekki/);
  });

  it('does not mutate the template and creates independent nested settings for each company', () => {
    const original = template(), before = JSON.stringify(original);
    const first = createBlankCompanyState(original), second = createBlankCompanyState(original);
    (first.collections.shortletBookingPage as { promoCodes: unknown[] }).promoCodes.push({ code: 'FIRST' });
    expect((second.collections.shortletBookingPage as { promoCodes: unknown[] }).promoCodes).toEqual([]);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('fails closed when a new scalar has no explicitly reviewed company default', () => {
    expect(() => createBlankCompanyState({ unknownConfig: { sampleSecret: 'not a company default' } })).toThrow('explicit blank default');
  });
});

describe('native company communications start empty', () => {
  it.each(['estate_manager', 'facility_manager', 'resident', 'technician'] as const)('does not invent %s notices or conversations', (role) => {
    const state = blank();
    run(state, () => {
      expect(getNotifications('new-member', [role])).toEqual([]);
      expect(getThreads('new-member', [role])).toEqual([]);
      expect(unreadNotificationCount('new-member', [role])).toBe(0);
      expect(unreadThreadCount('new-member', [role])).toBe(0);
    });
    expect(JSON.stringify(state.auxiliary)).not.toMatch(/Payment received|₦|Ngozi|Folake|Brightworks|Kitchen leak/);
  });

  it('preserves actual new-company notifications and read state through serialization', () => {
    const state = blank();
    run(state, () => {
      pushNotification('new-member', ['estate_manager'], { title: 'Company created', body: 'Your company is ready.', kind: 'success' });
      markAllNotificationsRead('new-member', ['estate_manager']);
    });
    run(JSON.parse(JSON.stringify(state)), () => {
      expect(getNotifications('new-member', ['estate_manager'])).toEqual([expect.objectContaining({ title: 'Company created', read: true })]);
      expect(getThreads('new-member', ['estate_manager'])).toEqual([]);
    });
    run(blank(), () => expect(getNotifications('new-member', ['estate_manager'])).toEqual([]));
  });

  it('retains sample conversations only for the explicitly isolated legacy review tenant', () => {
    const state = initialWorkspaceRecordState('t-lekki');
    runWithRecordContext({ state, domainTenantId: 't-lekki', mode: 'read' }, () => {
      expect(getNotifications('review-member', ['estate_manager']).length).toBeGreaterThan(0);
      expect(getThreads('review-member', ['estate_manager']).length).toBeGreaterThan(0);
    });
  });
});

describe('legacy read-only register boundaries', () => {
  it('returns empty native registers without inventing missing collection support', () => {
    const state = blank();
    for (const name of ['assets', 'investorProjects']) expect(Object.hasOwn(state.collections, name)).toBe(false);
    expect(state.collections.vendors).toEqual([]);
    run(state, () => {
      expect(repos.assets.list(actor()).items).toEqual([]);
      expect(repos.assets.get(actor(), seed.assets[0].id)).toBeNull();
      expect(repos.vendors.list(actor()).items).toEqual([]);
      expect(repos.investorProjects.list(actor()).items).toEqual([]);
    });
  });

  it('uses stored register collections when present and applies the normal tenant scope', () => {
    const state = blank();
    state.collections.assets = [{ ...seed.assets[0], tenantId: company, id: 'native-asset' }, { ...seed.assets[0], tenantId: other, id: 'foreign-asset' }];
    state.collections.vendors = [{ ...seed.vendors[0], tenantId: company, id: 'native-vendor' }, { ...seed.vendors[0], tenantId: other, id: 'foreign-vendor' }];
    state.collections.investorProjects = [{ ...seed.investorProjects[0], tenantId: company, id: 'native-project' }, { ...seed.investorProjects[0], tenantId: other, id: 'foreign-project' }];
    run(state, () => {
      expect(repos.assets.list(actor()).items.map((row) => row.id)).toEqual(['native-asset']);
      expect(repos.assets.get(actor(), 'foreign-asset')).toBeNull();
      expect(repos.vendors.list(actor()).items.map((row) => row.id)).toEqual(['native-vendor']);
      expect(repos.investorProjects.list(actor()).items.map((row) => row.id)).toEqual(['native-project']);
    });
  });

  it('keeps the review fixture registers and rejects reads outside a required durable context', () => {
    const state = initialWorkspaceRecordState('t-lekki');
    runWithRecordContext({ state, domainTenantId: 't-lekki', mode: 'read' }, () => expect(repos.assets.list(identityByKey('estate_manager').actor).items.length).toBeGreaterThan(0));
    vi.stubEnv('DATA_SOURCE', 'postgres');
    expect(() => repos.assets.list(actor())).toThrow('authenticated record context');
  });
});
