import { describe, expect, it } from 'vitest';
import { clerkFrontendApiOrigin, contentSecurityPolicy } from '@/lib/security-headers';

const key = (host: string) => `pk_test_${Buffer.from(`${host}$`).toString('base64')}`;

describe('owner signup security headers', () => {
  it('keeps the unconfigured public website policy first-party only', () => {
    const policy = contentSecurityPolicy();
    expect(policy).toContain("connect-src 'self';");
    expect(policy).toContain("script-src 'self' 'unsafe-inline';");
    expect(policy).not.toContain('clerk.com');
    expect(policy).not.toContain('cloudflare.com');
    expect(policy).not.toContain('unsafe-eval');
  });

  it('uses the exact configured frontend host and documented anti-abuse hosts', () => {
    const policy = contentSecurityPolicy(key('sample.clerk.accounts.dev'));
    expect(policy).toContain('https://sample.clerk.accounts.dev');
    expect(policy).toContain('https://challenges.cloudflare.com');
    expect(policy).toContain('https://*.protect.clerk.com:*');
    expect(policy).toContain('https://img.clerk.com');
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toMatch(/(?:^|\s)https:(?:\s|;|$)/);
    expect(policy).not.toMatch(/(?:^|\s)http:(?:\s|;|$)/);
  });

  it('allows React debugging eval only in explicit development mode', () => {
    expect(contentSecurityPolicy(undefined, 'development')).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval';");
    expect(contentSecurityPolicy(key('sample.clerk.accounts.dev'), 'development')).toContain("'unsafe-eval'");
    for (const environment of [undefined, 'production', 'test', '']) {
      expect(contentSecurityPolicy(undefined, environment)).not.toContain('unsafe-eval');
      expect(contentSecurityPolicy(key('sample.clerk.accounts.dev'), environment)).not.toContain('unsafe-eval');
    }
  });

  it('supports a configured custom Clerk domain', () => {
    expect(clerkFrontendApiOrigin(key('clerk.propbrew.example'))).toBe('https://clerk.propbrew.example');
  });

  it.each(['evil.example; connect-src *', 'https://clerk.example', 'clerk.example/path', 'clerk.example:443', 'localhost', 'a..example', '-bad.example'])('rejects malformed or injectable frontend host %s', (host) => {
    expect(() => clerkFrontendApiOrigin(key(host))).toThrow();
  });

  it.each(['sk_test_secret', 'pk_test_!', 'pk_live_', 'not-a-key'])('rejects invalid publishable key %s', (value) => {
    expect(() => clerkFrontendApiOrigin(value)).toThrow();
  });
});
