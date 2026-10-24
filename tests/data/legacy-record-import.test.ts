import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importLegacyWorkspace, type LegacyWorkspaceCapture } from '@/server/data/legacy-record-import';
import { db, validateWorkspaceRecordState } from '@/server/data/store';
import { nextRecordSequence, runWithRecordContext } from '@/server/data/record-context';

const tenant = 't-lekki';
const row = (id: string, extra: Record<string, unknown> = {}) => ({ tenantId: tenant, id, ...extra });
const capture = (): LegacyWorkspaceCapture => ({ db: structuredClone(db), history: [] });

describe('Pure legacy workspace capture import', () => {
  it('preserves the complete collection shape and edited values without changing the captured records or reseeding', () => {
    const raw = capture();
    (raw.db.sites as Record<string, unknown>[]).push(row('new-review-estate', { kind: 'estate', name: 'Saved QA estate', unitCount: 2 }));
    raw.db.documents = []; // A deliberate deletion must stay deleted.
    raw.db.shortletPlanKey = 'starter';
    const original = structuredClone(raw);
    const state = importLegacyWorkspace(raw, tenant);
    expect(Object.keys(state.collections)).toHaveLength(105);
    expect(state.collections.sites).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'new-review-estate', name: 'Saved QA estate' })]));
    expect(state.collections.documents).toEqual([]);
    expect(state.collections.shortletPlanKey).toBe('starter');
    expect(validateWorkspaceRecordState(state, tenant)).toBe(state);
    expect(raw).toEqual(original);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(importLegacyWorkspace(raw, 't-ikoyi').collections.shortletPlanKey).toBe('lite');
  });

  it('filters foreign rows and attributes tenant-less ballots, runtime and notices only through owned parents and users', () => {
    const raw = capture();
    raw.db.users = [row('owner'), row('foreign', { tenantId: 'other' })];
    raw.db.motions = [row('own-motion'), row('foreign-motion', { tenantId: 'other' })];
    raw.db.boardElections = [row('own-election'), row('foreign-election', { tenantId: 'other' })];
    raw.db.ppmPlans = [row('own-plan', { assetId: 'own-asset' }), row('foreign-plan', { tenantId: 'other', assetId: 'foreign-asset' })];
    raw.db.assetRuntime = [{ assetId: 'own-asset', runtimeHours: 53 }, { assetId: 'foreign-asset', runtimeHours: 94 }];
    raw.db.residentVotes = [{ motionId: 'own-motion', userId: 'owner', choice: 'for' }, { motionId: 'foreign-motion', userId: 'foreign', choice: 'against' }];
    raw.db.electionVotes = [{ electionId: 'own-election', userId: 'owner' }, { electionId: 'foreign-election', userId: 'foreign' }];
    raw.db.proxyReturnNotices = [{ id: 'prn-1', motionId: 'own-motion', userId: 'owner' }, { id: 'prn-2', motionId: 'foreign-motion', userId: 'foreign' }];
    const state = importLegacyWorkspace(raw, tenant);
    for (const value of Object.values(state.collections)) if (Array.isArray(value)) expect(value.every((item) => !item.tenantId || item.tenantId === tenant)).toBe(true);
    expect(state.collections.assetRuntime).toEqual([{ assetId: 'own-asset', runtimeHours: 53 }]);
    expect(state.collections.residentVotes).toEqual([{ motionId: 'own-motion', userId: 'owner', choice: 'for' }]);
    expect(state.collections.electionVotes).toEqual([{ electionId: 'own-election', userId: 'owner' }]);
    expect(state.collections.proxyReturnNotices).toEqual([{ id: 'prn-1', motionId: 'own-motion', userId: 'owner' }]);
  });

  it('retains owned workflow history with tenant namespaces and excludes foreign, orphaned or ambiguous record IDs', () => {
    const raw = capture();
    raw.db.workOrders = [row('own-order'), row('foreign-order', { tenantId: 'other' }), row('shared-order'), row('shared-order', { tenantId: 'other' })];
    raw.db.ppmPlans = [row('own-plan')]; raw.db.shortletBookings = [row('own-stay')];
    const event = { seq: 0, event: 'CREATE', note: 'Original attributed entry' };
    raw.history = [['work-order:own-order', [event]], ['work-order:foreign-order', [{ note: 'Foreign history' }]], ['work-order:missing', [event]], ['work-order:shared-order', [event]], ['ppm:own-plan', [event]], [`${tenant}:shortlet-booking:own-stay`, [event]]];
    const state = importLegacyWorkspace(raw, tenant);
    expect(state.history).toEqual({ [`${tenant}:work-order:own-order`]: [event], [`${tenant}:ppm:own-plan`]: [event], [`${tenant}:shortlet-booking:own-stay`]: [event] });
  });

  it('normalizes optional captured inbox/settings objects and keeps only owned users and tenant configuration', () => {
    const raw = capture(); raw.db.users = [row('owner'), row('foreign', { tenantId: 'other' })];
    raw.auxiliary = {
      inbox: { notifications: { owner: [{ id: 'n-owner-push-8', read: true }], foreign: [{ id: 'n-foreign-push-99', body: 'Foreign message' }] }, threads: { owner: [{ id: 'thread', lastReadSeq: 1, messages: [{ text: 'Saved own message' }] }], foreign: [{ messages: [{ text: 'Foreign thread' }] }] } },
      'shortlet:settings': { [tenant]: { planKey: 'starter', bookingPage: { slug: 'saved-stays' } }, 'tenant:other': { bookingPage: { slug: 'foreign-stays' } } },
    };
    const state = importLegacyWorkspace(raw, tenant);
    expect(state.auxiliary.inbox).toMatchObject({ notifications: { 'user:owner': [{ id: 'n-owner-push-8', read: true }] }, threads: { 'user:owner': [{ lastReadSeq: 1 }] } });
    expect(state.auxiliary['shortlet:settings']).toEqual({ [`tenant:${tenant}`]: { planKey: 'starter', bookingPage: { slug: 'saved-stays' } } });
    expect(state.sequences['inbox:pushSeq']).toBe(8);
    expect(JSON.stringify(state)).not.toMatch(/Foreign message|Foreign thread|foreign-stays/);
    raw.auxiliary = { inbox: { notifications: new Map(), threads: {} } };
    expect(() => importLegacyWorkspace(raw, tenant)).toThrow('captured as JSON');
  });

  it('derives every sequence, including postincrement zero, compound references and nested candidate IDs', () => {
    const raw = capture();
    Object.assign(raw.db, {
      announcements: [row('an-new-7'), row('an-agm-23')], constructionIssues: [row('is-esc-8')],
      constructionMovements: [row('sm-new-9', { ref: 'MI-481' }), row('mv-transfer-14')], constructionStock: [row('st-tr-15')],
      constructionProjects: [row('cp-new-12', { code: 'NEW-13' })], constructionVariations: [row('var-new-16', { ref: 'VO-40' })],
      constructionDocs: [row('doc-rev-17')], constructionTransmittals: [row('tr-new-18')], constructionCostCodes: [row('cc-boq-19')],
      constructionStockCounts: [row('sc-20', { ref: 'SC-2080' })], constructionApprovals: [row('apr-new-21', { ref: 'APR-1100' })],
      documents: [row('doc-up-0')], parcels: [row('pc-new-22')], communityEvents: [row('ev-new-24')], motions: [row('mo-new-25', { ref: 'AGM-100' })],
      boardElections: [row('election', { candidates: [{ id: 'cand-new-26' }] })],
      workOrders: [row('wo-alarm-27'), row('wo-res-32'), row('inspection', { ref: 'WO-I8500' }), row('preventive', { ref: 'WO-P9000' })],
      visitorPasses: [row('vp-new-28')], accessEvents: [row('ae-new-29')], inspections: [row('inspection', { ref: 'INS-1300' })],
      bookings: [row('bk-res-30')], marketplaceOrders: [row('ord-res-31')], shortletBookings: [row('slb-new-SL-5200', { ref: 'SL-5200' })],
      shortletTeam: [row('tm-new-33')], shortletPricingRules: [row('pr-new-34')], shortletIssues: [row('mi-new-35')], shortletAgents: [row('ag-new-36')], listings: [row('lst-new-37')],
      proxyReturnNotices: [{ id: 'prn-39', userId: 'propbrew-private-review-estate-manager', motionId: '' }],
    });
    raw.proxyReturnNoticeSequence = 40;
    raw.auxiliary = { inbox: { notifications: { 'propbrew-private-review-estate-manager': [{ id: 'n-review-push-38' }] }, threads: {} } };
    const state = importLegacyWorkspace(raw, tenant);
    expect(state.sequences).toEqual({
      'announcements:counter': 7, 'construction:issueSeq': 8, 'construction:movSeq': 11, 'construction:mvSeq': 15, 'construction:projSeq': 13,
      'construction:varSeq': 27, 'construction:revSeq': 17, 'construction:trSeq': 18, 'construction:ccSeq': 19, 'construction:scSeq': 39, 'construction:aprSeq': 49,
      'documents:uploadCounter': 1, 'estate:pcSeq': 22, 'estate:anSeq': 23, 'estate:evSeq': 24, 'estate:moSeq': 99, 'estate:candSeq': 26,
      'facility:woSeq': 27, 'facility:vpSeq': 28, 'facility:aeSeq': 29, 'inspections:woCounter': 1, 'inspections:inspCounter': 1, 'ppm:woCounter': 1,
      'resident-bookings:counter': 30, 'resident-orders:counter': 31, 'resident-requests:counter': 32, 'shortlet:seq': 5201,
      'shortlet:tmSeq': 33, 'shortlet:prSeq': 34, 'shortlet:miSeq': 35, 'shortlet:agSeq': 36, 'vendor-listings:counter': 37, 'inbox:pushSeq': 38, 'store:proxy-notice': 40,
    });
    runWithRecordContext({ state, domainTenantId: tenant, mode: 'write' }, () => {
      expect(`doc-up-${nextRecordSequence('documents:uploadCounter', 0)}`).toBe('doc-up-1');
      expect(`SL-${nextRecordSequence('shortlet:seq', 5200)}`).toBe('SL-5201');
      expect(`cp-new-${nextRecordSequence('construction:projSeq', 0, true)}`).toBe('cp-new-14');
      expect(`WO-I${8500 + nextRecordSequence('inspections:woCounter', 0)}`).toBe('WO-I8501');
      expect(`WO-P${9000 + nextRecordSequence('ppm:woCounter', 0)}`).toBe('WO-P9001');
      expect(`INS-${1300 + nextRecordSequence('inspections:inspCounter', 0)}`).toBe('INS-1301');
      expect(12 + (state.collections.constructionVariations as unknown[]).length + nextRecordSequence('construction:varSeq', 0, true)).toBe(41);
    });
  });

  it('does not lower supplied sequence high-water marks or silently accept unsafe counter values', () => {
    const raw = capture(); raw.sequences = { 'shortlet:seq': 9000, 'documents:uploadCounter': 80 };
    expect(importLegacyWorkspace(raw, tenant).sequences).toMatchObject(raw.sequences);
    raw.sequences = { broken: Number.MAX_SAFE_INTEGER };
    expect(() => importLegacyWorkspace(raw, tenant)).toThrow('sequence');
    raw.sequences = {}; raw.db.documents = [row('doc-up-9007199254740992')];
    expect(() => importLegacyWorkspace(raw, tenant)).toThrow('sequence');
  });

  it('has no runtime import dependency so the capture importer can run in the previous container', () => {
    const source = readFileSync(new URL('../../src/server/data/legacy-record-import.ts', import.meta.url), 'utf8');
    expect(source.match(/^import /gm)).toEqual(['import ']);
    expect(source).toMatch(/^import type /);
    expect(source).not.toMatch(/process\.env|require\(|import\(/);
  });
});
