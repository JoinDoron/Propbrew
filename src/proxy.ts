import { NextResponse, type NextRequest } from 'next/server';

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
  void request;
  return NextResponse.next();
}

export const config = {
  // Skip static assets and Next internals.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
