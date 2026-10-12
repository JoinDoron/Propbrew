import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import { SITE_URL } from '@/config/site';

describe('public website crawl policy', () => {
  it('permits the homepage and assets required to render it', () => {
    expect(robots().rules).toEqual({
      userAgent: '*',
      allow: ['/$', '/_next/static/', '/_next/image', '/brand/', '/icon.svg', '/favicon.ico', '/sitemap.xml'],
      disallow: '/',
    });
  });

  it('keeps operational and API routes excluded by default', () => {
    const rules = robots().rules;
    expect(rules).toMatchObject({ disallow: '/' });
    expect(JSON.stringify(rules)).not.toContain('/dashboard');
    expect(JSON.stringify(rules)).not.toContain('/admin');
    expect(JSON.stringify(rules)).not.toContain('/api');
  });

  it('advertises the configured production sitemap', () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
