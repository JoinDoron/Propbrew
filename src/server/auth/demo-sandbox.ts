import 'server-only';
import { randomUUID } from 'node:crypto';
import { withAuthTransaction } from './database';
import { demoAccountsEnabled, isDemoAccount } from './demo-config';
import { createDemoWorkspaceState } from '@/server/data/demo-state';

type Identity = { user: { id: string }; session: { id: string } };
export type DemoSandbox = { id: string; expiresAt: string };
type Row = { id: string; expires_at: Date | string };
const dto = (row: Row): DemoSandbox => ({ id: row.id, expiresAt: new Date(row.expires_at).toISOString() });
function eligible(identity: Identity) {
  return demoAccountsEnabled() && isDemoAccount(identity.user.id);
}

export async function findDemoSandbox(identity: Identity): Promise<DemoSandbox | null> {
  if (!eligible(identity)) return null;
  return withAuthTransaction(identity.user.id, async (client) => {
    const result = await client.query<Row>('select tenant_id id,expires_at from current_demo_sandbox()');
    return result.rows[0] ? dto(result.rows[0]) : null;
  }, identity.session.id);
}

export async function ensureDemoSandbox(identity: Identity): Promise<DemoSandbox> {
  if (!eligible(identity)) throw new Error('A current demo session is required.');
  const existing = await findDemoSandbox(identity);
  if (existing) return existing;
  const id = randomUUID();
  const state = createDemoWorkspaceState(id, identity.user.id);
  return withAuthTransaction(identity.user.id, async (client) => {
    const result = await client.query<Row>('select id,expires_at from ensure_demo_sandbox($1::uuid,$2::jsonb)', [id, JSON.stringify(state)]);
    if (result.rowCount !== 1) throw new Error('The demo sandbox could not be created.');
    return dto(result.rows[0]);
  }, identity.session.id);
}

export async function resetDemoSandboxFor(identity: Identity): Promise<void> {
  const sandbox = await findDemoSandbox(identity);
  if (!sandbox) throw new Error('Your demo sandbox is unavailable.');
  const state = createDemoWorkspaceState(sandbox.id, identity.user.id);
  await withAuthTransaction(identity.user.id, async (client) => {
    await client.query('select reset_demo_sandbox($1::jsonb)', [JSON.stringify(state)]);
  }, identity.session.id);
}
