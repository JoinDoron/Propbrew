'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getNativeAuth } from '@/server/auth/auth';
import { activateCompany, getNativeIdentity } from '@/server/auth/company';
import { authDatabasePool } from '@/server/auth/database';
import { consumeAuthAttempt } from '@/server/auth/rate-limit';
import { DEMO_ACCOUNTS, DEMO_TENANT_ID, demoAccountsEnabled, isDemoAccount } from '@/server/auth/demo-config';

type DemoState = { error?: string };

export async function enterDemoAccount(_state: DemoState, form: FormData): Promise<DemoState> {
  if (!demoAccountsEnabled()) return { error: 'Demo access is not available right now. You can still create your own company account.' };
  const account = DEMO_ACCOUNTS.find((entry) => entry.module === form.get('module'));
  if (!account) return { error: 'Choose an available demo workspace.' };
  try {
    const existing = await getNativeIdentity();
    if (existing && !isDemoAccount(existing.user.id)) return { error: 'Sign out of your company account before exploring a demo.' };
    await consumeAuthAttempt('demo-entry-global', 'public-demo', 60, 3600);
    const response = await getNativeAuth().api.signInEmail({
      headers: await headers(),
      body: { email: account.email, password: process.env.PROPBREW_DEMO_PASSWORD!, rememberMe: false },
    });
    if (!('token' in response) || !response.token || response.user.id !== account.userId) throw new Error('Demo identity unavailable.');
    const result = await authDatabasePool().query<{ id: string }>(
      'select id from auth_sessions where token=$1 and "userId"=$2::uuid and "expiresAt">now()', [response.token, account.userId],
    );
    if (result.rowCount !== 1) throw new Error('Demo session unavailable.');
    await activateCompany({ user: response.user, session: { id: result.rows[0].id } }, DEMO_TENANT_ID);
  } catch {
    return { error: 'The demo is busy or temporarily unavailable. Please try again later, or create your own company account.' };
  }
  redirect(`/${account.module}`);
}
