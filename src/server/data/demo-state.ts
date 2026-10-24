import 'server-only';
import { DEMO_TENANT_ID } from '@/server/auth/demo-accounts.mjs';
import * as seed from './seed/fixtures';
import { blankCompanyWorkspaceState, validateWorkspaceRecordState } from './store';
import type { WorkspaceRecordState } from './record-context';

const SOURCE_TENANT = 't-lekki';
const fixtureExports = seed as unknown as Record<string, unknown>;

function cloneForDemo(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneForDemo);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (key === 'tenantId') {
      if (entry !== SOURCE_TENANT) throw new Error('Foreign fixture tenant cannot enter the demo company.');
      return [key, DEMO_TENANT_ID];
    }
    return [key, cloneForDemo(entry)];
  }));
}
function sourceRows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('A demo fixture collection must be an array.');
  return value.filter((row) => !row || typeof row !== 'object' || !('tenantId' in row) || row.tenantId === SOURCE_TENANT);
}

/** Reproducible sample data only. Never reads a database or mutable working set. */
export function createDemoWorkspaceState(): WorkspaceRecordState {
  // This helper contributes collection names and blank defaults only. Every
  // populated row below comes directly from the immutable repository fixtures.
  const state = blankCompanyWorkspaceState();
  for (const [name, empty] of Object.entries(state.collections)) {
    const source = fixtureExports[name];
    if (Array.isArray(empty) && Array.isArray(source)) state.collections[name] = cloneForDemo(sourceRows(source));
  }
  for (const name of ['assets', 'vendors', 'investorProjects']) state.collections[name] = cloneForDemo(sourceRows(fixtureExports[name]));
  state.collections.shortletPlanKey = seed.shortletPlanKey;
  // Public bookings and promotional checkout remain disabled in the demo.
  state.collections.shortletBookingPage = { enabled: false, slug: 'demo', cancellationPolicy: '', holdHours: 0, promoCodes: [] };
  state.collections.copilotSettings = [{ tenantId: DEMO_TENANT_ID, model: 'gpt-6.1-sol' }];
  state.collections.copilotUsage = [];
  state.collections.constructionCopilotUsage = [];
  state.auxiliary.demoFixture = { source: 'repository-fixtures', version: 1, tenantId: DEMO_TENANT_ID };
  return validateWorkspaceRecordState(state, DEMO_TENANT_ID);
}
