import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

/**
 * Public marketing shell (PRD SC-11). Deliberately does NOT wrap children in
 * ShellFrame — that component redirects to /login on a null session, which would
 * silently un-public this group. No session call anywhere in this subtree, so
 * the landing page stays statically renderable.
 *
 * The root layout already supplies <html>/<body>, the fonts and ThemeProvider,
 * so this is a nested layout only.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-app">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
