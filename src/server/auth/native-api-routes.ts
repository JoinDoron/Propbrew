const aiRoutes = new Set(['/api/copilot', '/api/estate/copilot', '/api/shortlet/copilot', '/api/construction/copilot']);
const fileId = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const facilityEvidence = new RegExp(`^/api/facility/evidence/${fileId}$`, 'i');
const constructionDrawing = new RegExp(`^/api/construction/drawings/${fileId}$`, 'i');

/** The native-auth proxy permits only company-aware API routes. The routes
 * themselves still perform session, company and record-level authorization. */
export function nativeApiRouteAllowed(pathname: string): boolean {
  return pathname.startsWith('/api/auth/')
    || pathname.startsWith('/api/mobile/v1/')
    || pathname === '/api/companies'
    || pathname === '/api/companies/select'
    || pathname === '/api/v1/health'
    || aiRoutes.has(pathname)
    || pathname === '/api/facility/evidence'
    || facilityEvidence.test(pathname)
    || pathname === '/api/construction/drawings'
    || constructionDrawing.test(pathname);
}
