/**
 * Canonical public origin, used by robots.txt and sitemap.xml.
 *
 * MUST be set to the real domain before launch — set NEXT_PUBLIC_SITE_URL in the
 * deployment environment. The localhost fallback keeps dev working but would
 * publish a useless sitemap if it ever shipped.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3005';
