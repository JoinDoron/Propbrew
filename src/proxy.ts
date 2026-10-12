import { NextResponse, type NextRequest } from 'next/server';
import { websiteReleaseDecision } from '@/lib/website-release';

/**
 * Proxy (Next 16 renamed Middleware → Proxy). OPTIMISTIC redirect only.
 *
 * The Next docs are explicit that Proxy "should not be used as a full session
 * management or authorization solution" — so the authoritative gate is
 * `requireCapability()` in each page and `assertCan()` in every server action.
 * This file does nothing but keep unauthenticated deep-links tidy once real auth
 * lands; today, with the dev identity always present, it is a pass-through.
 */
export function proxy(request: NextRequest): NextResponse {
  const release = websiteReleaseDecision({
    flag: process.env.PROPBREW_WEBSITE_ONLY,
    nodeEnv: process.env.NODE_ENV,
    method: request.method,
    pathname: request.nextUrl.pathname,
  });
  if (release.kind === 'deny') {
    return new NextResponse(release.status === 405 ? 'Read-only website' : 'Not found', {
      status: release.status,
      headers: { 'Cache-Control': 'no-store', ...(release.status === 405 ? { Allow: release.allow } : {}) },
    });
  }
  if (release.kind === 'redirect') return NextResponse.redirect(new URL(release.location, request.url), release.status);
  return NextResponse.next();
}

export const config = {
  // Website-only releases must also reject writes to the homepage and assets.
  matcher: ['/:path*'],
};
