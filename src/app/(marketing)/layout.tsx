import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import { Manrope } from 'next/font/google';
import { websiteOnlyEnabled } from '@/lib/website-release';
import './marketing.css';

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], display: 'swap' });

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
  const websiteOnly = websiteOnlyEnabled(process.env.PROPBREW_WEBSITE_ONLY, process.env.NODE_ENV);

  return (
    <div className={`pb-site ${manrope.variable}`}>
      <a className="pb-skip-link" href="#main-content">Skip to content</a>
      <SiteHeader websiteOnly={websiteOnly} />
      <main id="main-content">{children}</main>
      <SiteFooter websiteOnly={websiteOnly} />
    </div>
  );
}
