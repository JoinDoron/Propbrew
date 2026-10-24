import type { WorkspaceRecordState } from './record-context';

type Row = Record<string, unknown>;
export type LegacyWorkspaceCapture = {
  db: Record<string, unknown>;
  history: [string, unknown[]][];
  proxyReturnNoticeSequence?: number;
  auxiliary?: Record<string, unknown>;
  sequences?: Record<string, number>;
};

const object = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Map) && !(value instanceof Set);
const userFields = ['userId', 'actorId', 'createdBy', 'updatedBy', 'grantorUserId', 'requesterUserId', 'ownerUserId', 'assigneeUserId'];
const machineCollections: Record<string, string> = {
  'work-order': 'workOrders', 'service-charge': 'invoices', booking: 'bookings',
  'sos-event': 'sosEvents', 'marketplace-order': 'marketplaceOrders', ppm: 'ppmPlans', 'shortlet-booking': 'shortletBookings',
};

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Legacy records contain an invalid number.');
    if (typeof item === 'bigint' || typeof item === 'function' || typeof item === 'symbol' || item instanceof Map || item instanceof Set) throw new Error('Legacy records must be captured as JSON values.');
    return item;
  })) as T;
}

/** Pure one-time migration: no environment, fixture, database or server imports.
 * The caller must capture the old process before restarting it and insert the
 * returned state only into its verified workspace storage partition. */
export function importLegacyWorkspace(raw: LegacyWorkspaceCapture, domainTenantId: string): WorkspaceRecordState {
  if (!object(raw) || !object(raw.db) || !Array.isArray(raw.history) || typeof domainTenantId !== 'string' || !domainTenantId.trim() || domainTenantId.length > 200 || /[\u0000-\u001f\u007f]/.test(domainTenantId)) throw new Error('A valid legacy capture and logical tenant are required.');
  if (raw.auxiliary !== undefined && !object(raw.auxiliary) || raw.sequences !== undefined && !object(raw.sequences)) throw new Error('Legacy auxiliary records and sequences must be JSON objects.');
  const source = (name: string): Row[] => Array.isArray(raw.db[name]) ? (raw.db[name] as unknown[]).filter(object) : [];
  const owned = (row: Row) => row.tenantId === domainTenantId;
  const ownedId = (name: string, id: unknown) => typeof id === 'string' && source(name).some((row) => row.id === id && owned(row)) && !source(name).some((row) => row.id === id && typeof row.tenantId === 'string' && !owned(row));
  const ownedUsers = new Set<string>(), foreignUsers = new Set<string>();
  const ownedAssets = new Set<string>(), foreignAssets = new Set<string>();
  for (const [name, value] of Object.entries(raw.db)) {
    if (!Array.isArray(value)) continue;
    for (const row of value.filter(object)) {
      if (typeof row.tenantId !== 'string') continue;
      const users = owned(row) ? ownedUsers : foreignUsers;
      for (const field of name === 'users' ? ['id', ...userFields] : userFields) if (typeof row[field] === 'string') users.add(row[field] as string);
      if (typeof row.assetId === 'string') (owned(row) ? ownedAssets : foreignAssets).add(row.assetId);
    }
  }
  // This fixed account belongs only to the original private-review sample tenant.
  if (domainTenantId === 't-lekki') ownedUsers.add('propbrew-private-review-estate-manager');
  const ownsUser = (id: unknown): id is string => typeof id === 'string' && ownedUsers.has(id) && !foreignUsers.has(id);
  const inherited = (name: string, row: Row) => {
    if (name === 'residentVotes') return ownedId('motions', row.motionId) && ownsUser(row.userId);
    if (name === 'electionVotes') return ownedId('boardElections', row.electionId) && ownsUser(row.userId);
    if (name === 'proxyReturnNotices') return ownsUser(row.userId) && (row.motionId === '' || ownedId('motions', row.motionId));
    if (name === 'assetRuntime') return typeof row.assetId === 'string' && ownedAssets.has(row.assetId) && !foreignAssets.has(row.assetId);
    return false;
  };
  const collections: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(raw.db)) {
    if (Array.isArray(value)) {
      if (value.some((row) => !object(row))) throw new Error(`Legacy collection ${name} contains an invalid record.`);
      collections[name] = value.filter((row: Row) => typeof row.tenantId === 'string' ? owned(row) : inherited(name, row));
    } else if (name === 'shortletPlanKey' || name === 'shortletBookingPage') {
      // These two legacy scalars belonged exclusively to the seeded account.
      collections[name] = domainTenantId === 't-lekki' ? value : name === 'shortletPlanKey' ? 'lite' : { enabled: false, slug: 'portfolio', cancellationPolicy: '', holdHours: 0, promoCodes: [] };
    } else throw new Error(`Legacy scalar ${name} has no tenant ownership mapping.`);
  }
  const rows = (name: string): Row[] => Array.isArray(collections[name]) ? collections[name] as Row[] : [];
  const history: Record<string, unknown[]> = Object.create(null);
  for (const entry of raw.history) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) throw new Error('Legacy history contains an invalid entry.');
    const [originalKey, events] = entry;
    const key = originalKey.startsWith(`${domainTenantId}:`) ? originalKey.slice(domainTenantId.length + 1) : originalKey;
    const split = key.indexOf(':'), machine = key.slice(0, split), id = key.slice(split + 1);
    const collection = machineCollections[machine];
    if (split < 1 || !collection || !ownedId(collection, id)) continue;
    history[`${domainTenantId}:${key}`] = events.filter((event) => object(event) && (event.tenantId === undefined || event.tenantId === domainTenantId));
  }

  const auxiliary: Record<string, unknown> = Object.create(null);
  for (const [name, value] of Object.entries(raw.auxiliary ?? {})) {
    if (!object(value)) throw new Error('Legacy auxiliary values must be JSON objects.');
    if (name === 'inbox') {
      const scoped: Record<string, Record<string, unknown[]>> = { notifications: {}, threads: {} };
      for (const field of ['notifications', 'threads']) {
        if (!object(value[field])) throw new Error('Legacy inbox maps must be captured as JSON objects.');
        for (const [key, records] of Object.entries(value[field])) {
          const userId = key.startsWith('user:') ? key.slice(5) : key;
          if (!ownsUser(userId)) continue;
          if (!Array.isArray(records)) throw new Error('Legacy inbox records are invalid.');
          scoped[field][`user:${userId}`] = records;
        }
      }
      auxiliary[name] = scoped;
    } else if (name === 'shortlet:settings') {
      const key = `tenant:${domainTenantId}`, settings = value[key] ?? value[domainTenantId];
      auxiliary[name] = settings === undefined ? {} : { [key]: settings };
    } else throw new Error(`Legacy auxiliary ${name} has no tenant ownership mapping.`);
  }

  const sequences: Record<string, number> = Object.create(null);
  const safe = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new Error('Legacy record sequence is invalid or exhausted.');
    return value;
  };
  for (const [key, value] of Object.entries(raw.sequences ?? {})) sequences[key] = safe(value);
  const maximum = (records: Row[], field: string, pattern: RegExp, subtract = 0, postIncrement = false) => records.reduce((max, row) => {
    const match = typeof row[field] === 'string' ? pattern.exec(row[field] as string) : null;
    if (!match) return max;
    const number = safe(Number(match[1]));
    return Math.max(max, safe(Math.max(0, number - subtract + (postIncrement ? 1 : 0))));
  }, 0);
  const set = (key: string, ...values: number[]) => { sequences[key] = safe(Math.max(sequences[key] ?? 0, ...values)); };
  const id = (key: string, collection: string, pattern: RegExp) => set(key, maximum(rows(collection), 'id', pattern));

  id('announcements:counter', 'announcements', /^an-new-(\d+)$/);
  id('construction:issueSeq', 'constructionIssues', /^is-esc-(\d+)$/);
  set('construction:movSeq', maximum(rows('constructionMovements'), 'id', /^sm-new-(\d+)$/), maximum(rows('constructionMovements'), 'ref', /^MI-(\d+)$/, 470));
  set('construction:mvSeq', maximum(rows('constructionMovements'), 'id', /^mv-(?:receipt|issue|transfer|return|adjust)-(\d+)$/), maximum(rows('constructionStock'), 'id', /^st-(?:tr|rt|sc)-(\d+)$/));
  set('construction:projSeq', maximum(rows('constructionProjects'), 'id', /^cp-new-(\d+)$/), maximum(rows('constructionProjects'), 'code', /^NEW-(\d+)$/));
  set('construction:varSeq', maximum(rows('constructionVariations'), 'id', /^var-new-(\d+)$/), maximum(rows('constructionVariations'), 'ref', /^VO-(\d+)$/, 12 + rows('constructionVariations').length));
  id('construction:revSeq', 'constructionDocs', /^doc-rev-(\d+)$/);
  id('construction:trSeq', 'constructionTransmittals', /^tr-new-(\d+)$/);
  id('construction:ccSeq', 'constructionCostCodes', /^cc-boq-(\d+)$/);
  set('construction:scSeq', maximum(rows('constructionStockCounts'), 'id', /^sc-(\d+)$/), maximum(rows('constructionStockCounts'), 'ref', /^SC-(\d+)$/, 2040 + rows('constructionStockCounts').length));
  set('construction:aprSeq', maximum(rows('constructionApprovals'), 'id', /^apr-new-(\d+)$/), maximum(rows('constructionApprovals'), 'ref', /^APR-(\d+)$/, 1050 + rows('constructionApprovals').length));
  set('documents:uploadCounter', maximum(rows('documents'), 'id', /^doc-up-(\d+)$/, 0, true));
  id('estate:pcSeq', 'parcels', /^pc-new-(\d+)$/);
  id('estate:anSeq', 'announcements', /^an-agm-(\d+)$/);
  id('estate:evSeq', 'communityEvents', /^ev-new-(\d+)$/);
  set('estate:moSeq', maximum(rows('motions'), 'id', /^mo-new-(\d+)$/), maximum(rows('motions'), 'ref', /^AGM-(\d+)$/, rows('motions').length));
  set('estate:candSeq', maximum(rows('boardElections').flatMap((row) => Array.isArray(row.candidates) ? row.candidates.filter(object) : []), 'id', /^cand-new-(\d+)$/));
  id('facility:woSeq', 'workOrders', /^wo-alarm-(\d+)$/);
  id('facility:vpSeq', 'visitorPasses', /^vp-new-(\d+)$/);
  id('facility:aeSeq', 'accessEvents', /^ae-new-(\d+)$/);
  set('inspections:woCounter', maximum(rows('workOrders'), 'ref', /^WO-I(\d+)$/, 8500, true));
  set('inspections:inspCounter', maximum(rows('inspections'), 'ref', /^INS-(\d+)$/, 1300, true));
  set('ppm:woCounter', maximum(rows('workOrders'), 'ref', /^WO-P(\d+)$/, 9000, true));
  id('resident-bookings:counter', 'bookings', /^bk-res-(\d+)$/);
  id('resident-orders:counter', 'marketplaceOrders', /^ord-res-(\d+)$/);
  id('resident-requests:counter', 'workOrders', /^wo-res-(\d+)$/);
  set('shortlet:seq', 5200, maximum(rows('shortletBookings'), 'ref', /^SL-(\d+)$/, 0, true), maximum(rows('shortletBookings'), 'id', /^slb-new-SL-(\d+)$/, 0, true));
  id('shortlet:tmSeq', 'shortletTeam', /^tm-new-(\d+)$/);
  id('shortlet:prSeq', 'shortletPricingRules', /^pr-new-(\d+)$/);
  id('shortlet:miSeq', 'shortletIssues', /^mi-new-(\d+)$/);
  id('shortlet:agSeq', 'shortletAgents', /^ag-new-(\d+)$/);
  id('vendor-listings:counter', 'listings', /^lst-new-(\d+)$/);
  const inbox = auxiliary.inbox as { notifications: Record<string, unknown[]> } | undefined;
  set('inbox:pushSeq', maximum(Object.values(inbox?.notifications ?? {}).flat().filter(object), 'id', /-push-(\d+)$/));
  set('store:proxy-notice', safe(raw.proxyReturnNoticeSequence ?? 0), maximum(rows('proxyReturnNotices'), 'id', /^prn-(\d+)$/));
  return jsonCopy({ schemaVersion: 1, collections, history, auxiliary, sequences });
}
