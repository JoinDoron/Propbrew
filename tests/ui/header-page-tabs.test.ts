import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { NavGroup } from '@/config/nav';
import { WORKSPACES } from '@/config/workspaces';
import { PageTabs } from '@/components/ui/page-tabs';

vi.mock('next/navigation', () => ({ usePathname: () => '/estate', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/theme-provider', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('@/server/actions/auth', () => ({ signOut: vi.fn() }));
vi.mock('@/components/inbox/notifications-menu', () => ({ NotificationsMenu: () => createElement('button', { 'aria-label': 'Notifications' }) }));
vi.mock('@/components/inbox/messages-menu', () => ({ MessagesMenu: () => createElement('button', { 'aria-label': 'Messages' }) }));
vi.mock('@/components/inbox/profile-menu', () => ({ ProfileMenu: () => createElement('button', { 'aria-label': 'Account menu' }) }));
vi.mock('@/components/sync/sync-indicator', () => ({ SyncIndicator: () => createElement('span', null, 'Sync status') }));

import { AppShell } from '@/components/app-shell';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const shellCss = read('src/components/app-shell.module.css');
const tabsCss = read('src/components/ui/page-tabs.module.css');
const shellSource = read('src/components/app-shell.tsx');
const tabsSource = read('src/components/ui/page-tabs.tsx');
const contextSource = read('src/components/ui/page-tabs-header.tsx');
const groups: NavGroup[] = [{ label: 'Overview', items: [
  { id: 'estate', label: 'Estate overview', href: '/estate', icon: 'building', capability: 'announcements' },
] }];

function render(children: ReactNode) {
  const props = {
    groups,
    workspace: WORKSPACES[0],
    identity: { name: 'Ada Okafor', roleSummary: 'Estate manager', tenantLabel: 'Lagos portfolio' },
    notifications: [], unreadNotifications: 0, threads: [], unreadMessages: 0, children,
  };
  return renderToStaticMarkup(createElement(AppShell, props));
}

const items = [
  { id: 'overview', label: 'Overview', content: createElement('section', { 'data-section': 'overview' }, 'Portfolio summary') },
  { id: 'collections', label: 'Collections', count: 0, content: createElement('input', { 'aria-label': 'Draft note', defaultValue: 'Resident follow-up' }) },
];

// These tests cover SSR structure and layout contracts. Actual portal mounting,
// navigation and keyboard focus after hydration require browser verification.
describe('shared page tabs in the application header — static contracts', () => {
  it('renders one empty outlet immediately after the brand and before global tools before hydration', () => {
    const html = render(createElement(PageTabs, { label: 'Estate sections', items }));
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(header.match(/data-page-tabs-outlet="true"/g)).toHaveLength(1);
    expect(header).toMatch(/<div[^>]*data-page-tabs-outlet="true"><\/div>/);
    expect(header).toContain('Propbrew');
    expect(header.indexOf('Propbrew')).toBeLessThan(header.indexOf('data-page-tabs-outlet="true"'));
    expect(header.indexOf('data-page-tabs-outlet="true"')).toBeLessThan(header.indexOf('aria-label="Open page search"'));
    expect(header).not.toMatch(/<h1\b/);
    expect(header).not.toContain('Estate overview');
    expect(shellSource).not.toContain('styles.pageContext');
    expect(shellSource).not.toContain('styles.breadcrumb');
    expect(header).not.toContain('role="tabpanel"');
    expect(header).not.toContain('Portfolio summary');
    expect(shellSource).toContain('useState<HTMLDivElement | null>(null)');
  });

  it('names the main landmark with a hidden page heading without displaying duplicate estate labels', () => {
    const html = render(createElement(PageTabs, { label: 'Estate sections', items }));
    const main = html.match(/<main\b([^>]*)>([\s\S]*?)<\/main>/);
    expect(main?.[1]).toContain('aria-labelledby="application-page-title"');
    expect(main?.[2]).toMatch(/<h1\b(?=[^>]*id="application-page-title")(?=[^>]*class="sr-only")[^>]*>Estate overview<\/h1>/);
    expect(html.match(/id="application-page-title"/g)).toHaveLength(1);
    expect(main?.[2].indexOf('id="application-page-title"')).toBeLessThan(main?.[2].indexOf('role="tablist"') ?? -1);
  });

  it('keeps an accessible inline fallback and all page-owned panels in main on the server', () => {
    const html = render(createElement(PageTabs, { label: 'Estate sections', items }));
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
    expect(main.match(/role="tablist"/g)).toHaveLength(1);
    expect(main).toContain('aria-label="Estate sections" aria-orientation="horizontal"');
    expect(main.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(main).toContain('Portfolio summary');
    expect(main).toContain('value="Resident follow-up"');
    expect(main.match(/hidden=""/g)).toHaveLength(1);
    expect(main.match(/aria-selected="true" tabindex="0"/g)).toHaveLength(1);
    expect(main.match(/aria-selected="false" tabindex="-1"/g)).toHaveLength(1);
    for (const match of main.matchAll(/aria-controls="([^"]+)"/g)) expect(main).toContain(`id="${match[1]}" role="tabpanel"`);
    for (const match of main.matchAll(/aria-labelledby="([^"]+)"/g)) expect(main).toContain(`id="${match[1]}" aria-controls=`);
  });

  it('does not duplicate navigation, panel IDs or hidden content in the empty outlet', () => {
    const html = render(createElement(PageTabs, { label: 'Estate sections', items, activeTab: 'collections' }));
    expect(html.match(/role="tablist"/g)).toHaveLength(1);
    expect(html.match(/data-section="overview"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Draft note"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true" tabindex="0"[^>]*>Collections<span[^>]*>0<\/span>/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses a client-only DOM outlet rather than putting scoped data or authentication in context', () => {
    expect(contextSource.trimStart()).toMatch(/^'use client';/);
    expect(contextSource).toContain('createContext<HTMLElement | null>(null)');
    const contextImports = [...contextSource.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(contextImports).toEqual(['react']);
    for (const source of [contextSource, tabsSource]) {
      expect(source).not.toMatch(/(?:from\s+['"]@\/(?:server|auth)|process\.env|\brepos\.|\bfetch\s*\()/);
    }
    expect(shellSource).toContain('<PageTabsHeaderContext.Provider value={headerTabTarget}>');
    expect(shellSource).toContain('ref={setHeaderTabTarget}');
    expect(tabsSource).toContain('headerTarget ? createPortal(navigation, headerTarget) : navigation');
  });

  it('retains local selection, panels and portaled-focus containment bookkeeping', () => {
    expect(tabsSource).toContain('const [selection, setSelection] = useState(');
    expect(tabsSource).toContain('panels.current.get(previous)?.contains(document.activeElement)');
    expect(tabsSource).toContain('!root.current?.contains(next) && !tabList.current?.contains(next)');
    expect(tabsSource).toContain('buttons.current.get(active)?.focus()');
    expect(tabsSource).toContain('hidden={active !== item.id}');
    expect(tabsSource).not.toMatch(/createPortal\(\s*item\.content/);
  });

  it('keeps the unified header above both columns with tabs left-aligned to the page column', () => {
    const shellBase = shellCss.match(/\.shell\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(shellBase).toMatch(/display:\s*grid/);
    expect(shellBase).toMatch(/grid-template-columns:\s*var\(--sidebar-width(?:,\s*248px)?\)\s+(?:minmax\(0,\s*1fr\)|1fr)/);
    expect(shellBase).toMatch(/grid-template-rows:\s*auto\s+(?:minmax\(0,\s*1fr\)|1fr)/);
    const headerBase = shellCss.match(/\.header\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(headerBase).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(headerBase).toMatch(/grid-row:\s*1/);
    for (const selector of ['sidebar', 'mainColumn']) {
      const rule = shellCss.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(rule).toMatch(/grid-row:\s*2/);
    }
    const brandRule = shellCss.match(/\.headerBrand\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(brandRule).toMatch(/(?:display:\s*(?:inline-)?flex|display:\s*grid)/);
    expect(shellSource).toContain('className={styles.headerBrand}');
    const tabListRule = tabsCss.match(/\.headerTabList\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(tabListRule).toMatch(/margin:\s*0\s*;/);
    expect(tabListRule).not.toMatch(/margin:\s*0\s+auto/);
  });

  it('binds header tab placement and page content to the same horizontal gutter', () => {
    const shellBase = shellCss.match(/\.shell\s*\{([^}]*)\}/)?.[1] ?? '';
    const headerBase = shellCss.match(/\.header\s*\{([^}]*)\}/)?.[1] ?? '';
    const contentBase = shellCss.match(/\.content\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(shellBase).toMatch(/--page-gutter:\s*\d+px/);
    expect(headerBase).toMatch(/display:\s*grid/);
    expect(headerBase).toMatch(/grid-template-columns:\s*calc\(var\(--sidebar-width(?:,\s*\d+px)?\)\s*-\s*var\(--page-gutter\)\)\s+minmax\(0,\s*1fr\)\s+auto/);
    expect(headerBase).toMatch(/gap:\s*var\(--page-gutter\)/);
    expect(headerBase).toMatch(/padding:\s*0\s+var\(--page-gutter\)/);
    expect(contentBase).toMatch(/padding:\s*\d+px\s+var\(--page-gutter\)\s+\d+px/);
    // A narrower desktop breakpoint must not silently change only the header gap.
    const desktopCompact = shellCss.slice(shellCss.indexOf('@media (max-width: 1199px)'), shellCss.indexOf('@media (min-width: 880px) and (max-width: 1439px)'));
    expect(desktopCompact).not.toMatch(/\.header\s*\{[^}]*\bgap:/);
  });

  it.each([
    ['expanded', 'SIDEBAR_WIDTH'],
    ['collapsed', 'SIDEBAR_COLLAPSED'],
  ])('keeps the %s tab origin equal to sidebar width plus the page gutter', (_state, sidebarConstant) => {
    const sidebarWidth = Number(shellSource.match(new RegExp(`const ${sidebarConstant} = (\\d+);`))?.[1]);
    const pageGutter = Number(shellCss.match(/\.shell\s*\{[^}]*--page-gutter:\s*(\d+)px/)?.[1]);
    expect(Number.isFinite(sidebarWidth)).toBe(true);
    expect(Number.isFinite(pageGutter)).toBe(true);
    expect(shellSource).toContain("'--sidebar-width': `${collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH}px`");
    // The bindings above make the second track start at padding + brand track + gap.
    // Derive both origins from the actual shared values, not a fixed screen coordinate.
    const brandTrack = sidebarWidth - pageGutter;
    const headerTabOrigin = pageGutter + brandTrack + pageGutter;
    const pageContentOrigin = sidebarWidth + pageGutter;
    expect(brandTrack).toBeGreaterThanOrEqual(40);
    expect(headerTabOrigin).toBe(pageContentOrigin);
  });

  it('keeps global controls in their own right-hand grid slot even before tabs mount or on a page without tabs', () => {
    for (const [selector, column] of [['headerBrand', 1], ['headerTabs', 2], ['headerControls', 3]] as const) {
      const rule = shellCss.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(rule).toMatch(new RegExp(`grid-column:\\s*${column}\\s*;`));
      expect(rule).toMatch(/grid-row:\s*1/);
    }
    const controlsRule = shellCss.match(/\.headerControls\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(controlsRule).toMatch(/justify-self:\s*end/);
    const html = render('Page without a tab group');
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(header).toContain('data-page-tabs-outlet="true"');
    expect(header).toContain('aria-label="Account menu"');
    expect(header).not.toContain('role="tablist"');
  });

  it('hides only the collapsed desktop wordmark while keeping a named brand link and mobile brand', () => {
    const desktop = shellCss.slice(shellCss.indexOf('@media (min-width: 880px)'), shellCss.indexOf('@media (max-width: 1199px)'));
    expect(desktop).toMatch(/\.shell\[data-collapsed="true"\]\s+\.headerBrand\s+\.brandName\s*\{[^}]*display:\s*none/);
    const mobile = shellCss.slice(shellCss.indexOf('@media (max-width: 879px)'));
    expect(mobile).not.toMatch(/\.shell\[data-collapsed="true"\]\s+\.headerBrand\s+\.brandName/);
    expect(render('Content')).toMatch(/<a\b[^>]*aria-label="Propbrew home"[^>]*>/);
    const brandMark = shellCss.match(/\.brandMark\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(brandMark).not.toMatch(/display:\s*none/);
  });

  it.each([
    [879, 16],
    [560, 12],
  ])('uses one shared gutter for header and page content below %ipx', (breakpoint, expectedGutter) => {
    const start = shellCss.indexOf(`@media (max-width: ${breakpoint}px)`);
    expect(start).toBeGreaterThan(-1);
    const nextMedia = shellCss.indexOf('@media', start + 1);
    const rules = shellCss.slice(start, nextMedia < 0 ? undefined : nextMedia);
    expect(rules).toMatch(new RegExp(`\\.shell\\s*\\{[^}]*--page-gutter:\\s*${expectedGutter}px`));
    expect(rules).toMatch(/\.header\s*\{[^}]*padding:\s*0\s+var\(--page-gutter\)/);
    expect(rules).toMatch(/\.content\s*\{[^}]*padding:\s*\d+px\s+var\(--page-gutter\)\s+\d+px/);
    const mobile = shellCss.slice(shellCss.indexOf('@media (max-width: 879px)'));
    const tabRule = mobile.match(/\.headerTabs:has\(\[data-header-page-tabs\]\)\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(tabRule).toMatch(/width:\s*calc\(100%\s*\+\s*var\(--page-gutter\)\s*\+\s*var\(--page-gutter\)\)/);
    expect(tabRule).toMatch(/margin-inline:\s*calc\(0px\s*-\s*var\(--page-gutter\)\)/);
    expect(tabRule).toMatch(/padding-inline:\s*var\(--page-gutter\)/);
  });

  it('allows the left tab strip to shrink and scroll without clipping global dropdowns', () => {
    expect(shellCss).toMatch(/\.headerTabs\s*\{[^}]*min-width:\s*0/);
    const headerBase = shellCss.match(/\.header\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(headerBase).not.toMatch(/overflow(?:-x|-y)?:\s*(?:hidden|clip)/);
    expect(tabsCss).toMatch(/\.tabList\s*\{[^}]*overflow-x:\s*auto/);
    expect(tabsCss).toMatch(/\.headerTabList\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*100%/);
    expect(tabsCss).toContain('overscroll-behavior-x: contain');
  });

  it('keeps compact global search discoverable and opens it above the page when tabs are present', () => {
    const showTrigger = '.header:has([data-header-page-tabs]) .searchTrigger { display: flex !important; }';
    const hideInline = '.header:has([data-header-page-tabs]) .searchBox { display: none; }';
    const openSelector = '.header:has([data-header-page-tabs]) .searchOpen {';
    expect(shellCss).toContain(showTrigger);
    expect(shellCss).toContain(hideInline);
    expect(shellCss.indexOf(openSelector)).toBeGreaterThan(shellCss.indexOf(hideInline));
    expect(shellCss.slice(shellCss.indexOf(openSelector))).toMatch(/^[^{]*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ 8px\);[^}]*display:\s*block/);
    const html = render('Scoped page content');
    expect(html).toContain('aria-label="Open page search"');
    expect(html).toContain('aria-controls="global-search-container"');
    expect(html).toContain('role="combobox"');
  });

  it('keeps the header tab strip in a dedicated 52px mobile row with intact touch and focus styles', () => {
    const mobile = shellCss.slice(shellCss.indexOf('@media (max-width: 879px)'));
    expect(mobile).toContain('grid-template-rows: 72px 52px');
    expect(mobile).toContain('--page-tabs-header-height: 52px');
    expect(mobile).toMatch(/\.headerTabs:has\(\[data-header-page-tabs\]\)\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2/);
    expect(tabsCss).toContain('min-height: 44px');
    expect(tabsCss).toContain('min-height: var(--page-tabs-header-height, 72px)');
    expect(tabsCss).toContain('.tab:focus-visible, .panel:focus-visible');
    expect(tabsCss).toContain('outline-offset: -2px');
  });
});
