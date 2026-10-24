/** Derive only the public Frontend API host; never put a Clerk secret in CSP. */
export function clerkFrontendApiOrigin(publishableKey: string): string {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey);
  if (!match) throw new Error('Clerk publishable key has an invalid format.');
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  if (!decoded.endsWith('$')) throw new Error('Clerk publishable key has an invalid host.');
  const host = decoded.slice(0, -1).toLowerCase();
  if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) {
    throw new Error('Clerk publishable key has an invalid host.');
  }
  return `https://${host}`;
}

/**
 * Keep public website releases first-party only. For an activated Clerk app,
 * allow its exact Frontend API host and the documented anti-abuse endpoints.
 * https://clerk.com/docs/guides/secure/best-practices/csp-headers
 * No global https:/http: source or production unsafe-eval is introduced.
 */
export function contentSecurityPolicy(clerkPublishableKey?: string): string {
  const origin = clerkPublishableKey ? clerkFrontendApiOrigin(clerkPublishableKey) : null;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${origin ? ` ${origin} https://challenges.cloudflare.com https://*.protect.clerk.com` : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob:${origin ? ' https://img.clerk.com' : ''}`,
    `connect-src 'self'${origin ? ` ${origin} https://*.protect.clerk.com:*` : ''}`,
    ...(origin ? ["worker-src 'self' blob:", "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com"] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
