import type { NextConfig } from 'next';

/**
 * Security response headers.
 *
 * This file was empty, so the app shipped with no CSP, no clickjacking
 * protection and no MIME-sniffing protection. These are cheap, apply to every
 * route, and are the baseline any reachable deployment needs.
 *
 * The CSP allows 'unsafe-inline' for styles because the app sets CSS custom
 * properties inline throughout, and Google Fonts for the marketing page. Script
 * is restricted to self; 'unsafe-inline' is required for Next's bootstrap and
 * the pre-paint theme script, which runs before hydration to avoid a flash.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]);
  },
};

export default nextConfig;
