export type WebsiteReleaseDecision =
  | { kind: 'allow' }
  | { kind: 'redirect'; status: 307; location: '/#platform' }
  | { kind: 'deny'; status: 404 }
  | { kind: 'deny'; status: 405; allow: 'GET, HEAD' };

export type WebsiteReleaseRequest = {
  /** Pass the server-side PROPBREW_WEBSITE_ONLY value. */
  flag: string | undefined;
  /** Production defaults closed until an explicit "0" enables product routes. */
  nodeEnv?: string;
  method: string;
  /** The URL pathname, without search parameters or a fragment. */
  pathname: string;
};

export function websiteOnlyEnabled(flag: string | undefined, nodeEnv?: string): boolean {
  return flag === '1' || (nodeEnv === 'production' && flag !== '0');
}

const PUBLIC_FILES = new Set([
  '/',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
  '/icon.svg',
  '/_next/image',
]);

/** Reject ambiguous encodings before checking the small public asset allow-list. */
function safePathname(pathname: string): string | null {
  // Encoded separators and repeated decoding must never widen asset access.
  if (/%(?:2f|5c)/i.test(pathname)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (
    !decoded.startsWith('/') ||
    decoded.includes('//') ||
    /[\\%?#\u0000-\u001f\u007f]/.test(decoded) ||
    decoded.split('/').some((segment) => segment === '.' || segment === '..')
  ) return null;
  return decoded;
}

/**
 * Publish the public website while operational routes remain unavailable.
 * This pure policy must run before auth, API handlers and server actions.
 * Match every path when enabled: a generic file-extension exclusion would let
 * app routes escape this boundary, and excluding "/" would permit actions.
 */
export function websiteReleaseDecision({
  flag,
  nodeEnv,
  method,
  pathname,
}: WebsiteReleaseRequest): WebsiteReleaseDecision {
  if (!websiteOnlyEnabled(flag, nodeEnv)) return { kind: 'allow' };

  if (method !== 'GET' && method !== 'HEAD') {
    return { kind: 'deny', status: 405, allow: 'GET, HEAD' };
  }

  const path = safePathname(pathname);
  if (!path) return { kind: 'deny', status: 404 };

  if (
    PUBLIC_FILES.has(path) ||
    path.startsWith('/brand/') ||
    path.startsWith('/_next/static/')
  ) return { kind: 'allow' };

  if (path === '/api' || path.startsWith('/api/')) {
    return { kind: 'deny', status: 404 };
  }

  return { kind: 'redirect', status: 307, location: '/#platform' };
}
