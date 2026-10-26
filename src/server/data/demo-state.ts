import 'server-only';
import { DEMO_TENANT_ID } from '@/server/auth/demo-accounts.mjs';
import { DEMO_ACCOUNTS } from '@/server/auth/demo-accounts.mjs';
import * as seed from './seed/fixtures';
import { blankCompanyWorkspaceState, validateWorkspaceRecordState } from './store';
import type { WorkspaceRecordState } from './record-context';

const SOURCE_TENANT = 't-lekki';
const fixtureExports = seed as unknown as Record<string, unknown>;

function cloneForDemo(value: unknown, tenantId: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => cloneForDemo(entry, tenantId));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (key === 'tenantId') {
      if (entry !== SOURCE_TENANT) throw new Error('Foreign fixture tenant cannot enter the demo company.');
      return [key, tenantId];
    }
    return [key, cloneForDemo(entry, tenantId)];
  }));
}
function sourceRows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('A demo fixture collection must be an array.');
  return value.filter((row) => !row || typeof row !== 'object' || !('tenantId' in row) || row.tenantId === SOURCE_TENANT);
}

/** Bind the sample resident's own-record references to the authenticated demo
 * account. This is confined to that account's private sandbox and lets the
 * Resident / Tenant persona exercise real ownership filters without forging a
 * production identity or widening another tenant. */
function bindDemoResident(value: unknown, demoUserId: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => bindDemoResident(entry, demoUserId));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
    typeof entry === 'string' && entry === 'user-resident' && (key === 'userId' || key.endsWith('UserId'))
      ? demoUserId : bindDemoResident(entry, demoUserId)]));
}

/** Reproducible sample data only. Never reads a database or mutable working set. */
export function createDemoWorkspaceState(tenantId: string = DEMO_TENANT_ID, demoUserId?: string): WorkspaceRecordState {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) throw new Error('A demo tenant UUID is required.');
  // This helper contributes collection names and blank defaults only. Every
  // populated row below comes directly from the immutable repository fixtures.
  const state = blankCompanyWorkspaceState();
  for (const [name, empty] of Object.entries(state.collections)) {
    const source = fixtureExports[name];
    if (Array.isArray(empty) && Array.isArray(source)) state.collections[name] = cloneForDemo(sourceRows(source), tenantId);
  }
  for (const name of ['assets', 'vendors', 'investorProjects']) state.collections[name] = cloneForDemo(sourceRows(fixtureExports[name]), tenantId);
  state.collections.shortletPlanKey = seed.shortletPlanKey;
  // Public bookings and promotional checkout remain disabled in the demo.
  state.collections.shortletBookingPage = { enabled: false, slug: 'demo', cancellationPolicy: '', holdHours: 0, promoCodes: [] };
  state.collections.copilotSettings = [{ tenantId, model: 'gpt-6.1-sol' }];
  state.collections.copilotUsage = [];
  state.collections.constructionCopilotUsage = [];
  state.auxiliary.demoFixture = { source: 'repository-fixtures', version: 1, tenantId };
  if (tenantId !== DEMO_TENANT_ID) {
    // A sample subscription removes paywalls only inside this private sandbox.
    state.auxiliary['shortlet:settings'] = { [`tenant:${tenantId}`]: { planKey: 'enterprise',
      bookingPage: { enabled: false, slug: 'demo', cancellationPolicy: '', holdHours: 0, promoCodes: [] } } };
  }
  if (demoUserId) {
    const account = DEMO_ACCOUNTS.find((entry) => entry.userId === demoUserId);
    if (!account) throw new Error('A reserved demo operator is required.');
    for (const [name, value] of Object.entries(state.collections)) {
      state.collections[name] = bindDemoResident(value, demoUserId);
    }
    (state.collections.users as unknown[]).push({ tenantId, id: account.userId, name: 'Demo operator', email: account.email,
      roles: ['estate_manager','facility_manager','technician','security'], estateIds: [], allEstates: true, status: 'active', lastActive: new Date().toISOString() });
  }
  return validateWorkspaceRecordState(state, tenantId);
}
