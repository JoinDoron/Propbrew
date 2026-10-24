import 'server-only';
import { nativeAuthEnabled } from './mode';
import { DEMO_ACCOUNTS, DEMO_TENANT_ID } from './demo-accounts.mjs';

export { DEMO_ACCOUNTS, DEMO_TENANT_ID } from './demo-accounts.mjs';

/** Public demonstrations use real, restricted accounts, never the dev bypass. */
export function demoAccountsEnabled(): boolean {
  const password = process.env.PROPBREW_DEMO_PASSWORD ?? '';
  return nativeAuthEnabled() && process.env.PROPBREW_DEMO_ACCOUNTS === '1'
    && password.length >= 32 && password.length <= 128;
}

export function isDemoAccount(userId: string): boolean {
  return DEMO_ACCOUNTS.some((account) => account.userId === userId);
}

export function assertNotDemoAccount(userId: string): void {
  if (isDemoAccount(userId)) throw new Error('Demo accounts are view-only. Create your own account to save changes.');
}

export function assertDemoCompany(userId: string, companyId: string): void {
  if (companyId === DEMO_TENANT_ID && !isDemoAccount(userId)) throw new Error('This demo workspace is unavailable.');
  if (isDemoAccount(userId) && (!demoAccountsEnabled() || companyId !== DEMO_TENANT_ID)) {
    throw new Error('This demo workspace is unavailable.');
  }
}
