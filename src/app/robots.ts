import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site';

/**
 * `/` is the first publicly indexable route in this app (the landing page,
 * SC-11). Everything else — the ops, portal and admin shells, and /login — is
 * authenticated surface that must never be crawled.
 *
 * The idiom below is "index the homepage only": `Disallow: /` blocks the whole
 * tree, and `Allow: /$` re-permits exactly the root ($ anchors the match).
 * Longest-match-wins means the root resolves to allow, everything else to
 * disallow — so new authenticated routes are covered without touching this file.
 * Public marketing siblings added later must be allow-listed explicitly.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/$', disallow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
