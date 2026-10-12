import { describe, expect, it } from 'vitest';
import { websiteOnlyEnabled, websiteReleaseDecision } from '@/lib/website-release';

const decide = (method: string, pathname: string, flag: string | undefined = '1') =>
  websiteReleaseDecision({ flag, method, pathname });

describe('website-only environment defaults', () => {
  it.each([undefined, '', 'true', 'false', 'yes', 'no', ' 0', '0 ', 'disabled'])
    ('keeps a production deployment closed for missing or malformed flag %s', (flag) => {
      expect(websiteOnlyEnabled(flag, 'production')).toBe(true);
      expect(websiteReleaseDecision({ flag, nodeEnv: 'production', method: 'GET', pathname: '/dashboard' }))
        .toEqual({ kind: 'redirect', status: 307, location: '/#platform' });
      expect(websiteReleaseDecision({ flag, nodeEnv: 'production', method: 'POST', pathname: '/' }))
        .toEqual({ kind: 'deny', status: 405, allow: 'GET, HEAD' });
    });

  it('requires explicit zero to enable normal product routes in production', () => {
    expect(websiteOnlyEnabled('0', 'production')).toBe(false);
    expect(websiteReleaseDecision({ flag: '0', nodeEnv: 'production', method: 'POST', pathname: '/api/upload' }))
      .toEqual({ kind: 'allow' });
  });

  it.each(['development', 'test', undefined])('leaves %s routing unchanged by default', (nodeEnv) => {
    expect(websiteOnlyEnabled(undefined, nodeEnv)).toBe(false);
    expect(websiteReleaseDecision({ flag: undefined, nodeEnv, method: 'GET', pathname: '/dashboard' }))
      .toEqual({ kind: 'allow' });
  });

  it.each(['production', 'development', 'test', undefined])('honours explicit website-only mode in %s', (nodeEnv) => {
    expect(websiteOnlyEnabled('1', nodeEnv)).toBe(true);
  });
});

describe('website release boundary', () => {
  it.each([undefined, '', '0', 'true', 'yes'])('leaves normal routing untouched for flag %s', (flag) => {
    expect(websiteReleaseDecision({ flag, method: 'POST', pathname: '/api/upload' })).toEqual({ kind: 'allow' });
    expect(websiteReleaseDecision({ flag, method: 'GET', pathname: '/dashboard' })).toEqual({ kind: 'allow' });
  });

  it.each([
    '/', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/icon.svg',
    '/brand/neighborhood.webp', '/brand/propbrew-social.png', '/brand/propbrew-logo.svg',
    '/_next/static/chunks/app.js', '/_next/static/media/manrope.woff2', '/_next/image',
  ])('permits only public read access to %s', (pathname) => {
    expect(decide('GET', pathname)).toEqual({ kind: 'allow' });
    expect(decide('HEAD', pathname)).toEqual({ kind: 'allow' });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT', 'get', ''])
    ('rejects method %s before any route or asset exception', (method) => {
      for (const pathname of ['/', '/api/webhooks/paystack', '/dashboard', '/brand/propbrew-logo.svg', '/_next/static/app.js']) {
        expect(decide(method, pathname)).toEqual({ kind: 'deny', status: 405, allow: 'GET, HEAD' });
      }
    });

  it.each([
    '/api', '/api/v1/health', '/api/upload', '/api/copilot', '/api/admin/audit',
    '/api/finance/settlements', '/api/webhooks/paystack', '/api/upload.png', '/%61pi/upload',
  ])('hides API reads at %s', (pathname) => {
    expect(decide('GET', pathname)).toEqual({ kind: 'deny', status: 404 });
    expect(decide('HEAD', pathname)).toEqual({ kind: 'deny', status: 404 });
  });

  it.each([
    '/dashboard', '/login', '/portal', '/admin/overview', '/construction', '/work-orders',
    '/dashboard.png', '/login.svg', '/apiary', '/brandish/logo.svg', '/_next/staticity/app.js',
    '/_next/data/build/dashboard.json', '/anything.css',
  ])('redirects operational and unknown pages at %s to the public preview', (pathname) => {
    expect(decide('GET', pathname)).toEqual({ kind: 'redirect', status: 307, location: '/#platform' });
    expect(decide('HEAD', pathname)).toEqual({ kind: 'redirect', status: 307, location: '/#platform' });
  });

  it.each([
    'https://example.com/brand/logo.svg', '//example.com/brand/logo.svg',
    '/brand/../api/upload', '/brand/./logo.svg', '/brand/%2e%2e/api/upload',
    '/brand/%252e%252e/api/upload', '/brand%2f../api/upload', '/brand/%5c../api/upload',
    '/brand//logo.svg', '/brand/..\\api/upload', '/brand/%00logo.svg',
    '/brand/%logo.svg', '/brand/logo.svg?route=/api/upload', '/brand/logo.svg#fragment',
  ])('fails closed for ambiguous pathname %s', (pathname) => {
    expect(decide('GET', pathname)).toEqual({ kind: 'deny', status: 404 });
  });
});
