import { scryptSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieStore = vi.hoisted(() => ({ values: new Map<string, string>(), set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => cookieStore.values.has(name) ? { value: cookieStore.values.get(name)! } : undefined, set: cookieStore.set }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import {
  assertReviewReadiness, getReviewSession, isReviewActor, issueReviewCsrf, issueReviewSession,
  REVIEW_CSRF_COOKIE, REVIEW_SESSION_COOKIE, REVIEW_SESSION_SECONDS, ReviewConfigurationError,
  reviewActorIdentity, reviewLedgerTenantId, reviewLogin, reviewModeEnabled, reviewProxy, verifyReviewPassword, verifyReviewSession,
} from '@/server/review-auth';
import { assertProductionReadiness, devIdentityEnabled, getDevIdentity, getSession } from '@/server/session';
import { signInAs, signOut } from '@/server/actions/auth';

const origin = 'https://private-review.example';
const password = 'test-only-review-passphrase';
const salt = Buffer.alloc(16, 7);
const passwordHash = `scrypt$16384$8$1$${salt.toString('base64url')}$${scryptSync(password, salt, 64).toString('base64url')}`;
const tenantId = '12345678-1234-4234-8234-123456789abc';
const blockedCredentials = ['CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'PAYSTACK_SECRET_KEY', 'FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET', 'TERMII_API_KEY', 'RESEND_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'ANTHROPIC_API_KEY'];
let peer = 1;

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PHASE', '');
  vi.stubEnv('PROPBREW_REVIEW_MODE', '1');
  vi.stubEnv('PROPBREW_WEBSITE_ONLY', '0');
  vi.stubEnv('PROPBREW_REVIEW_PASSWORD_HASH', passwordHash);
  vi.stubEnv('PROPBREW_REVIEW_SESSION_SECRET', randomBytes(32).toString('base64url'));
  vi.stubEnv('PROPBREW_REVIEW_TENANT_UUID', tenantId);
  vi.stubEnv('DATABASE_URL', 'postgresql://test.invalid/review-test');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin);
  vi.stubEnv('REEVE_AI_DAILY_CAP_MINOR_NGN', '500000');
  vi.stubEnv('DATA_SOURCE', '');
  for (const field of ['REEVE_ALLOW_DEMO_IDENTITIES', 'REEVE_ALLOW_IN_MEMORY_DATA', 'NEXT_PUBLIC_DEV_IDENTITY', ...blockedCredentials]) vi.stubEnv(field, '');
  cookieStore.values.clear(); cookieStore.set.mockClear(); peer++;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function request(path: string, options: { method?: string; session?: string; headers?: Record<string, string>; body?: string } = {}): NextRequest {
  const headers = new Headers(options.headers);
  if (options.session) headers.set('Cookie', `${REVIEW_SESSION_COOKIE}=${options.session}`);
  return new NextRequest(new URL(path, origin), { method: options.method ?? 'GET', headers, body: options.body });
}

function loginRequest(overrides: { password?: string; csrf?: string; cookie?: string; headers?: Record<string, string>; body?: string; address?: string } = {}): NextRequest {
  const csrf = overrides.csrf ?? issueReviewCsrf();
  return request('/review/login/auth', { method: 'POST', headers: {
    Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/x-www-form-urlencoded',
    Cookie: `${REVIEW_CSRF_COOKIE}=${overrides.cookie ?? csrf}`,
    'X-Forwarded-For': overrides.address ?? `192.0.2.${peer}`, ...overrides.headers,
  }, body: overrides.body ?? new URLSearchParams({ password: overrides.password ?? password, csrf }).toString() });
}

describe('explicit private review configuration', () => {
  it('allows labelled sample storage only through the dedicated mode and returns a separate ledger UUID', () => {
    expect(reviewModeEnabled()).toBe(true);
    expect(assertProductionReadiness).not.toThrow();
    expect(reviewLedgerTenantId()).toBe(tenantId);
    const identity = reviewActorIdentity();
    expect(identity.key).toBe('private-review');
    expect(identity.actor).toMatchObject({ userId: 'propbrew-private-review-estate-manager', tenantId: 't-lekki', roles: ['estate_manager'], estateIds: ['s-gardens'], allEstates: false });
    expect(isReviewActor(identity.actor)).toBe(true);
    expect(isReviewActor({ ...identity.actor, roles: ['platform_admin'] })).toBe(false);
    expect(isReviewActor({ ...identity.actor, userId: 'user-estate_manager' })).toBe(false);
    identity.actor.roles = ['platform_admin'];
    expect(reviewActorIdentity().actor.roles).toEqual(['estate_manager']);
  });

  it.each([
    ['PROPBREW_WEBSITE_ONLY', '1'], ['PROPBREW_REVIEW_PASSWORD_HASH', 'plaintext-is-never-a-hash'],
    ['PROPBREW_REVIEW_PASSWORD_HASH', 'scrypt$1048576$8$1$invalid$invalid'],
    ['PROPBREW_REVIEW_SESSION_SECRET', 'too-short'], ['PROPBREW_REVIEW_TENANT_UUID', 't-lekki'],
    ['DATABASE_URL', ''], ['DATABASE_URL', 'https://database.invalid'], ['NEXT_PUBLIC_SITE_URL', 'http://insecure.example'],
    ['NEXT_PUBLIC_SITE_URL', 'https://user:password@private-review.example'],
    ['REEVE_AI_DAILY_CAP_MINOR_NGN', '0'], ['REEVE_AI_DAILY_CAP_MINOR_NGN', '1.5'], ['REEVE_AI_DAILY_CAP_MINOR_NGN', '9007199254740992'],
    ['REEVE_ALLOW_DEMO_IDENTITIES', '1'], ['REEVE_ALLOW_IN_MEMORY_DATA', '1'], ['NEXT_PUBLIC_DEV_IDENTITY', '1'], ['DATA_SOURCE', 'http'],
    ...blockedCredentials.map((field) => [field, 'not-a-real-secret']),
  ])('fails closed for invalid %s', (field, value) => {
    vi.stubEnv(field, value);
    expect(assertReviewReadiness).toThrow(ReviewConfigurationError);
    expect(() => reviewLedgerTenantId()).toThrow(ReviewConfigurationError);
    expect(reviewProxy(request('/copilot')).status).toBe(503);
  });

  it('preserves the ordinary production guard and development identity policy when review is disabled', () => {
    const actor = reviewActorIdentity().actor;
    vi.stubEnv('PROPBREW_REVIEW_MODE', '0');
    expect(reviewLedgerTenantId()).toBeNull();
    expect(isReviewActor(actor)).toBe(false);
    expect(assertProductionReadiness).toThrow('Durable DATA_SOURCE is required in production');
    vi.stubEnv('DATA_SOURCE', 'http');
    expect(assertProductionReadiness).not.toThrow();
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEXT_PUBLIC_DEV_IDENTITY', '1');
    expect(devIdentityEnabled()).toBe(true);
  });
});

describe('review password and signed sessions', () => {
  it('verifies the salted password using the fixed scrypt configuration', async () => {
    expect(await verifyReviewPassword(password)).toBe(true);
    expect(await verifyReviewPassword('wrong-password')).toBe(false);
    expect(await verifyReviewPassword('')).toBe(false);
    expect(await verifyReviewPassword('x'.repeat(1025))).toBe(false);
  });

  it('rejects forged, altered, expired and future sessions without accepting client-supplied roles', () => {
    const now = Date.now(), token = issueReviewSession(now);
    expect(verifyReviewSession(token, now)).toBe(true);
    expect(verifyReviewSession(undefined, now)).toBe(false);
    expect(verifyReviewSession('estate_manager', now)).toBe(false);
    expect(verifyReviewSession(`${token}.extra`, now)).toBe(false);
    const [payload, signature] = token.split('.');
    const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), roles: ['platform_admin'] })).toString('base64url');
    expect(verifyReviewSession(`${changed}.${signature}`, now)).toBe(false);
    expect(verifyReviewSession(`${payload}.${signature.slice(0, -2)}xx`, now)).toBe(false);
    expect(verifyReviewSession(token, now + REVIEW_SESSION_SECONDS * 1000)).toBe(false);
    expect(verifyReviewSession(issueReviewSession(now + 60_000), now)).toBe(false);
  });

  it('revokes existing sessions on password, signing-key or ledger-tenant rotation', () => {
    const token = issueReviewSession();
    vi.stubEnv('PROPBREW_REVIEW_SESSION_SECRET', randomBytes(32).toString('base64url'));
    expect(verifyReviewSession(token)).toBe(false);
    const second = issueReviewSession();
    vi.stubEnv('PROPBREW_REVIEW_TENANT_UUID', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(verifyReviewSession(second)).toBe(false);
    const third = issueReviewSession();
    const changedSalt = Buffer.alloc(16, 8);
    vi.stubEnv('PROPBREW_REVIEW_PASSWORD_HASH', `scrypt$16384$8$1$${changedSalt.toString('base64url')}$${scryptSync(password, changedSalt, 64).toString('base64url')}`);
    expect(verifyReviewSession(third)).toBe(false);
  });

  it('ignores unsigned identity/sign-out cookies and derives the single permitted actor only after verification', async () => {
    cookieStore.values.set('vesta_dev_identity', 'platform_admin');
    cookieStore.values.set('vesta_signed_out', '1');
    expect(await getReviewSession()).toBeNull();
    expect(await getSession()).toBeNull();
    expect(devIdentityEnabled()).toBe(false);
    await expect(getDevIdentity()).rejects.toThrow('REDIRECT:/review/login');
    cookieStore.values.set(REVIEW_SESSION_COOKIE, issueReviewSession());
    expect((await getSession())?.actor.roles).toEqual(['estate_manager']);
    expect((await getDevIdentity()).key).toBe('private-review');
    await expect(signInAs('platform_admin')).rejects.toThrow('picker is disabled');
  });

  it('clears secure review cookies on sign-out without contacting Clerk or issuing an unsigned identity', async () => {
    await expect(signOut()).rejects.toThrow('REDIRECT:/review/login');
    expect(cookieStore.set.mock.calls).toEqual([
      [REVIEW_SESSION_COOKIE, '', { path: '/', httpOnly: true, secure: true, sameSite: 'strict', maxAge: 0 }],
      [REVIEW_CSRF_COOKIE, '', { path: '/', httpOnly: true, secure: true, sameSite: 'strict', maxAge: 0 }],
    ]);
  });
});

describe('private review route boundary', () => {
  it('requires authentication for the homepage, all workspaces, administration and server actions', () => {
    for (const path of ['/', '/workspaces', '/copilot', '/estate/copilot', '/shortlet/copilot', '/construction/copilot', '/admin/tenants', '/robots.txt']) {
      const response = reviewProxy(request(path, { headers: { Cookie: 'vesta_dev_identity=platform_admin' } }));
      expect(response.status).toBe(307); expect(response.headers.get('Location')).toBe(`${origin}/review/login`);
    }
    expect(reviewProxy(request('/estate', { method: 'POST', headers: { Origin: origin } })).status).toBe(401);
    expect(reviewProxy(request('/estate', { method: 'POST', session: issueReviewSession(), headers: { Origin: 'https://untrusted.example' } })).status).toBe(403);
    expect(reviewProxy(request('/estate', { method: 'POST', session: issueReviewSession(), headers: { Origin: origin } })).headers.get('x-middleware-next')).toBe('1');
  });

  it('allows only public login, safe assets and read-only health before authentication', () => {
    for (const path of ['/brand/propbrew.svg', '/_next/static/test.js', '/_next/image', '/icon.svg', '/favicon.ico', '/api/v1/health']) {
      expect(reviewProxy(request(path)).headers.get('x-middleware-next')).toBe('1');
      expect(reviewProxy(request(path, { method: 'POST' })).status).toBe(405);
    }
    const response = reviewProxy(request('/review/login'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-request-cookie')).toContain(REVIEW_CSRF_COOKIE);
    expect(response.cookies.get(REVIEW_CSRF_COOKIE)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 900 });
    expect(reviewProxy(request('/review/login', { session: issueReviewSession() })).headers.get('Location')).toBe(`${origin}/workspaces`);
  });

  it('rejects every API except authenticated Copilot requests and public health', () => {
    const session = issueReviewSession();
    for (const path of ['/api/upload', '/api/webhooks/paystack', '/api/finance/adjustments', '/api/banking/reconcile', '/api/v1/sync', '/api/admin/audit', '/api/unknown']) {
      expect(reviewProxy(request(path, { method: 'POST', session, headers: { Origin: origin } })).status).toBe(404);
    }
    for (const path of ['/api/copilot', '/api/estate/copilot', '/api/shortlet/copilot', '/api/construction/copilot']) {
      expect(reviewProxy(request(path, { method: 'POST', headers: { Origin: origin } })).status).toBe(401);
      expect(reviewProxy(request(path, { method: 'POST', session, headers: { Origin: origin } })).headers.get('x-middleware-next')).toBe('1');
      expect(reviewProxy(request(path, { session })).status).toBe(405);
      expect(reviewProxy(request(path, { method: 'POST', session })).status).toBe(403);
    }
  });
});

describe('private review login submission', () => {
  it('issues a secure 12-hour cookie after password and CSRF verification, without echoing credentials', async () => {
    const response = await reviewLogin(loginRequest());
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`${origin}/workspaces`);
    const session = response.cookies.get(REVIEW_SESSION_COOKIE);
    expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: REVIEW_SESSION_SECONDS });
    expect(verifyReviewSession(session?.value)).toBe(true);
    const exposed = JSON.stringify([...response.headers]) + await response.text();
    expect(exposed).not.toContain(password); expect(exposed).not.toContain(passwordHash);
    expect(response.cookies.get(REVIEW_CSRF_COOKIE)?.maxAge).toBe(0);
  });

  it('rejects incorrect passwords without creating a session', async () => {
    const response = await reviewLogin(loginRequest({ password: 'incorrect' }));
    expect(response.headers.get('Location')).toBe(`${origin}/review/login?error=invalid`);
    expect(response.cookies.get(REVIEW_SESSION_COOKIE)).toBeUndefined();
  });

  it('rejects missing, mismatched, expired CSRF tokens and cross-site or missing origins', async () => {
    expect((await reviewLogin(loginRequest({ headers: { Origin: 'https://untrusted.example' } }))).status).toBe(403);
    expect((await reviewLogin(loginRequest({ headers: { Origin: '' } }))).status).toBe(403);
    expect((await reviewLogin(loginRequest({ headers: { 'Sec-Fetch-Site': 'cross-site' } }))).status).toBe(403);
    expect((await reviewLogin(loginRequest({ cookie: 'forged-token' }))).status).toBe(403);
    expect((await reviewLogin(loginRequest({ csrf: issueReviewCsrf(Date.now() - 16 * 60_000) }))).status).toBe(403);
    expect((await reviewLogin(loginRequest({ body: new URLSearchParams({ password }).toString() }))).status).toBe(403);
  });

  it('limits five attempts per rolling minute even when proxy headers rotate, then recovers', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T10:00:00Z'));
    for (let count = 0; count < 5; count++) {
      expect((await reviewLogin(loginRequest({ address: `198.51.100.${count}, 192.0.2.99`, cookie: 'invalid' }))).status).toBe(403);
    }
    const denied = await reviewLogin(loginRequest({ address: '203.0.113.50, 192.0.2.99', cookie: 'invalid' }));
    expect(denied.status).toBe(429); expect(denied.headers.get('Retry-After')).toBe('60');
    expect((await reviewLogin(loginRequest({ address: '192.0.2.100', cookie: 'invalid' }))).status).toBe(429);
    vi.advanceTimersByTime(60_000);
    expect((await reviewLogin(loginRequest({ address: '192.0.2.99', cookie: 'invalid' }))).status).toBe(403);
  });

  it('bounds the submitted body, rejects non-form content and stays unavailable outside review mode', async () => {
    expect((await reviewLogin(loginRequest({ body: 'x'.repeat(8193) }))).status).toBe(413);
    expect((await reviewLogin(loginRequest({ headers: { 'Content-Type': 'application/json' } }))).status).toBe(415);
    vi.stubEnv('PROPBREW_REVIEW_MODE', '0');
    expect((await reviewLogin(loginRequest({ csrf: 'not-issued-outside-review' }))).status).toBe(404);
  });

  it('keeps a fixed sample-data warning and a single password form without identity selection', () => {
    const page = readFileSync(new URL('../../src/app/review/login/page.tsx', import.meta.url), 'utf8');
    const layout = readFileSync(new URL('../../src/app/layout.tsx', import.meta.url), 'utf8');
    expect(page).toContain('type="password"'); expect(page).toContain('action="/review/login/auth"');
    expect(page).not.toContain('SignInList'); expect(page).not.toContain('PROPBREW_REVIEW_PASSWORD_HASH');
    expect(layout).toContain('Do not enter customer information.'); expect(layout).toContain('Changes reset on restart');
  });
});
