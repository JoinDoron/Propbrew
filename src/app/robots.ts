import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site';

/**
 * `/` is the first publicly indexable route in this app (the landing page,
 * SC-11). Everything else — the ops, portal and admin shells, and /login — is
 * authenticated surface that must never be crawled.
 *
 * The idiom below is "index the homepage only": `Disallow: /` blocks the whole
 * tree, and `Allow: /$` re-permits exactly the root ($ anchors the match).
 * Public styles, fonts and brand imagery are also permitted so crawlers can
 * render the homepage. All operational routes remain excluded by default.
 * Public marketing siblings added later must be allow-listed explicitly.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/$', '/_next/static/', '/_next/image', '/brand/', '/icon.svg', '/favicon.ico', '/sitemap.xml'],
      disallow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
