import 'server-only';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { createAuthMiddleware,APIError } from 'better-auth/api';
import { consumeAuthAttempt } from './rate-limit';
import { authDatabasePool, withAuthTransaction } from './database';
import { nativeAuthEnabled } from './mode';

export function assertNativeAuthReadiness(): void {
  if (!nativeAuthEnabled()) throw new Error('Company accounts are not enabled.');
  if (process.env.DATA_SOURCE !== 'postgres' || process.env.PROPBREW_REVIEW_MODE === '1') throw new Error('Company accounts require their isolated database mode.');
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) throw new Error('The account signing secret is not configured.');
  if (!process.env.DATABASE_URL) throw new Error('The account database is not configured.');
  const url = new URL(process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error('A canonical account origin is required.');
  if (['REEVE_ALLOW_DEMO_IDENTITIES', 'REEVE_ALLOW_IN_MEMORY_DATA', 'NEXT_PUBLIC_DEV_IDENTITY'].some((key) => process.env[key] === '1')) throw new Error('Demonstration identities cannot be used for company accounts.');
}

function configuredAuth() {
  assertNativeAuthReadiness();
  const origin = new URL(process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL!).origin;
  const extraOrigins = (process.env.PROPBREW_AUTH_ORIGINS ?? '').split(',').filter(Boolean).map((value) => {
    const url = new URL(value.trim());
    if (url.origin !== value.trim() || url.protocol !== 'https:') throw new Error('Account origins must be exact HTTPS origins.');
    return url.origin;
  });
  return betterAuth({
    appName: 'Propbrew', baseURL: origin, secret: process.env.BETTER_AUTH_SECRET,
    database: authDatabasePool(), trustedOrigins: [origin, ...extraOrigins],
    user: { modelName: 'auth_users' },
    session: { modelName: 'auth_sessions', expiresIn: 7 * 24 * 3600, updateAge: 24 * 3600,
      cookieCache: { enabled: false },
      additionalFields: { activeCompanyId: { type: 'string', required: false, input: false } } },
    account: { modelName: 'auth_accounts', accountLinking: { enabled: false } },
    verification: { modelName: 'auth_verifications' },
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, revokeSessionsOnPasswordReset: true },
    rateLimit: { enabled: true, storage: 'database', modelName: 'auth_rate_limits', window: 60, max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 8 }, '/sign-up/email': { window: 3600, max: 10 }, '/two-factor/*': { window: 60, max: 6 } } },
    advanced: { database: { generateId: 'uuid' }, cookiePrefix: 'propbrew',
      defaultCookieAttributes: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' } },
    hooks: { before: createAuthMiddleware(async (context) => {
      try {
        const email=typeof context.body?.email==='string'?context.body.email.toLowerCase().slice(0,254):'invalid';
        if(context.path==='/sign-up/email') {
          await consumeAuthAttempt('signup-global','all',100,24*3600);
          await consumeAuthAttempt('signup-email',email,5,3600);
        }
        if(context.path==='/sign-in/email') await consumeAuthAttempt('login-email',email,12,900);
      } catch { throw new APIError('TOO_MANY_REQUESTS',{message:'Too many attempts. Please try again later.'}); }
    }) },
    databaseHooks: {
      user: { create: { after: async (user) => { await withAuthTransaction(user.id, (client) => client.query('insert into auth_security_events(user_id,event) values($1::uuid,$2)', [user.id, 'account.created'])); } } },
      session: {
        create: { after: async (session) => { await withAuthTransaction(session.userId, (client) => client.query('insert into auth_security_events(user_id,event) values($1::uuid,$2)', [session.userId, 'session.created'])); } },
        delete: { after: async (session) => { await withAuthTransaction(session.userId, (client) => client.query('insert into auth_security_events(user_id,event) values($1::uuid,$2)', [session.userId, 'session.revoked'])); } },
      },
    },
    plugins: [twoFactor({ issuer: 'Propbrew', twoFactorTable: 'auth_two_factor', accountLockout: { enabled: true, maxFailedAttempts: 6, durationSeconds: 900 } }), nextCookies()],
  });
}

type NativeAuth = ReturnType<typeof configuredAuth>;
const globalAuth = globalThis as typeof globalThis & { __propbrewNativeAuth?: { key: string; auth: NativeAuth } };
export function getNativeAuth(): NativeAuth {
  assertNativeAuthReadiness();
  const key = [process.env.DATABASE_URL, process.env.BETTER_AUTH_URL, process.env.BETTER_AUTH_SECRET, process.env.PROPBREW_AUTH_ORIGINS].join('|');
  if (globalAuth.__propbrewNativeAuth?.key !== key) globalAuth.__propbrewNativeAuth = { key, auth: configuredAuth() };
  return globalAuth.__propbrewNativeAuth.auth;
}
