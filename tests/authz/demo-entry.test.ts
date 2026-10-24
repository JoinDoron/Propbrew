import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_TENANT_ID } from '@/server/auth/demo-config';

const boundary = vi.hoisted(() => ({
  getIdentity: vi.fn(), activateCompany: vi.fn(), signIn: vi.fn(),
  pool: vi.fn(), query: vi.fn(), consume: vi.fn(), headers: vi.fn(),
  auth: vi.fn(), redirect: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: boundary.headers }));
vi.mock('next/navigation', () => ({ redirect: boundary.redirect }));
vi.mock('@/server/auth/auth', () => ({ getNativeAuth: boundary.auth }));
vi.mock('@/server/auth/database', () => ({ authDatabasePool: boundary.pool }));
vi.mock('@/server/auth/company', () => ({ getNativeIdentity: boundary.getIdentity, activateCompany: boundary.activateCompany }));
vi.mock('@/server/auth/rate-limit', () => ({ consumeAuthAttempt: boundary.consume }));

import { enterDemoAccount } from '@/server/actions/demo-auth';

const PASSWORD = 'server-only-demo-fixture-credential-00001';
const SESSION_ID = 'cba55389-e0dc-4f0c-8a74-fbf5981f0824';
const TOKEN = 'synthetic-demo-session-token';
const headers = new Headers({ origin: 'https://propbrew.example.test' });
const userFor = (account: typeof DEMO_ACCOUNTS[number]) => ({ id: account.userId, name: account.name, email: account.email });
const formFor = (workspace: string) => { const form = new FormData(); form.set('module', workspace); return form; };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PROPBREW_AUTH_MODE', 'company');
  vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '1');
  vi.stubEnv('PROPBREW_DEMO_PASSWORD', PASSWORD);
  boundary.getIdentity.mockResolvedValue(null);
  boundary.headers.mockResolvedValue(headers);
  boundary.consume.mockResolvedValue(undefined);
  boundary.activateCompany.mockResolvedValue(undefined);
  boundary.auth.mockReturnValue({ api: { signInEmail: boundary.signIn } });
  boundary.pool.mockReturnValue({ query: boundary.query });
  boundary.query.mockResolvedValue({ rowCount: 1, rows: [{ id: SESSION_ID }] });
  boundary.signIn.mockResolvedValue({ token: TOKEN, user: userFor(DEMO_ACCOUNTS[0]) });
  boundary.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});
afterEach(() => vi.unstubAllEnvs());

describe('demo entry server action', () => {
  it('refuses disabled demo access before resolving identity, authenticating or reading storage', async () => {
    vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '0');
    await expect(enterDemoAccount({}, formFor('estate'))).resolves.toEqual({ error: expect.stringContaining('not available') });
    for (const call of [boundary.getIdentity, boundary.headers, boundary.consume, boundary.auth, boundary.pool, boundary.activateCompany, boundary.redirect]) expect(call).not.toHaveBeenCalled();
  });

  it.each(['', 'admin', 'constructor', '__proto__', 'estate/../companies', 'shortlet?access=manage'])('refuses the unrecognised workspace %s before authenticating', async (workspace) => {
    await expect(enterDemoAccount({}, formFor(workspace))).resolves.toEqual({ error: 'Choose an available demo workspace.' });
    expect(boundary.getIdentity).not.toHaveBeenCalled(); expect(boundary.consume).not.toHaveBeenCalled();
    expect(boundary.auth).not.toHaveBeenCalled(); expect(boundary.pool).not.toHaveBeenCalled();
  });

  it('does not replace an existing real company login with a shared demo identity', async () => {
    boundary.getIdentity.mockResolvedValue({ user: { id: '9d91d49f-f40d-4a4d-935b-04635d510e7c' }, session: { id: SESSION_ID } });
    await expect(enterDemoAccount({}, formFor('estate'))).resolves.toEqual({ error: expect.stringContaining('Sign out') });
    expect(boundary.consume).not.toHaveBeenCalled(); expect(boundary.auth).not.toHaveBeenCalled();
    expect(boundary.pool).not.toHaveBeenCalled(); expect(boundary.activateCompany).not.toHaveBeenCalled();
  });

  it.each(DEMO_ACCOUNTS)('opens only the configured $module demo account and reserved company', async (account) => {
    const user = userFor(account);
    boundary.signIn.mockResolvedValue({ token: TOKEN, user });
    const form = formFor(account.module);
    form.set('email', 'attacker@example.invalid'); form.set('password', 'attacker-supplied-credential');
    form.set('userId', 'caller-controlled-user'); form.set('tenantId', 'caller-controlled-company');
    form.set('redirect', 'https://attacker.example.invalid'); form.set('role', 'owner');
    await expect(enterDemoAccount({}, form)).rejects.toThrow(`REDIRECT:/${account.module}`);
    expect(boundary.consume).toHaveBeenCalledExactlyOnceWith('demo-entry-global', 'public-demo', 60, 3600);
    expect(boundary.signIn).toHaveBeenCalledExactlyOnceWith({ headers, body: { email: account.email, password: PASSWORD, rememberMe: false } });
    expect(boundary.query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('auth_sessions'), [TOKEN, account.userId]);
    expect(boundary.activateCompany).toHaveBeenCalledExactlyOnceWith({ user, session: { id: SESSION_ID } }, DEMO_TENANT_ID);
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith(`/${account.module}`);
  });

  it('allows an already signed-in demo visitor to choose another demo workspace', async () => {
    boundary.getIdentity.mockResolvedValue({ user: userFor(DEMO_ACCOUNTS[0]), session: { id: SESSION_ID } });
    const account = DEMO_ACCOUNTS[3];
    boundary.signIn.mockResolvedValue({ token: TOKEN, user: userFor(account) });
    await expect(enterDemoAccount({}, formFor(account.module))).rejects.toThrow('REDIRECT:/construction');
    expect(boundary.activateCompany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ user: userFor(account) }), DEMO_TENANT_ID);
  });

  it('fails closed when authentication returns a different account', async () => {
    boundary.signIn.mockResolvedValue({ token: TOKEN, user: userFor(DEMO_ACCOUNTS[1]) });
    const response = await enterDemoAccount({}, formFor('estate'));
    expect(response.error).toMatch(/busy|unavailable/);
    expect(boundary.pool).not.toHaveBeenCalled(); expect(boundary.activateCompany).not.toHaveBeenCalled();
    expect(boundary.redirect).not.toHaveBeenCalled(); expect(JSON.stringify(response)).not.toContain(TOKEN);
  });

  it.each([
    { user: userFor(DEMO_ACCOUNTS[0]) },
    { token: '', user: userFor(DEMO_ACCOUNTS[0]) },
    { twoFactorRedirect: true },
  ])('does not treat a missing session token or MFA challenge as demo authentication', async (response) => {
    boundary.signIn.mockResolvedValue(response);
    await expect(enterDemoAccount({}, formFor('estate'))).resolves.toEqual({ error: expect.stringMatching(/busy|unavailable/) });
    expect(boundary.pool).not.toHaveBeenCalled(); expect(boundary.activateCompany).not.toHaveBeenCalled();
    expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it.each([0, 2, null])('requires exactly one durable session row rather than row count %s', async (rowCount) => {
    boundary.query.mockResolvedValue({ rowCount, rows: rowCount ? [{ id: SESSION_ID }] : [] });
    await expect(enterDemoAccount({}, formFor('estate'))).resolves.toEqual({ error: expect.stringMatching(/busy|unavailable/) });
    expect(boundary.activateCompany).not.toHaveBeenCalled(); expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it('returns a safe busy message when the shared demo rate limit is reached', async () => {
    boundary.consume.mockRejectedValue(new Error('private database limit detail'));
    const response = await enterDemoAccount({}, formFor('estate'));
    expect(response.error).toMatch(/busy|unavailable/); expect(response.error).not.toContain('private database');
    expect(boundary.auth).not.toHaveBeenCalled(); expect(boundary.pool).not.toHaveBeenCalled();
    expect(boundary.activateCompany).not.toHaveBeenCalled(); expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it('does not redirect when membership activation rejects the reserved demo company', async () => {
    boundary.activateCompany.mockRejectedValue(new Error('membership unavailable'));
    await expect(enterDemoAccount({}, formFor('estate'))).resolves.toEqual({ error: expect.stringMatching(/busy|unavailable/) });
    expect(boundary.redirect).not.toHaveBeenCalled();
  });
});
