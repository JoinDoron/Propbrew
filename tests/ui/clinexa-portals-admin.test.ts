import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const portalRoutes = ['', 'announcements', 'bills', 'bookings', 'community', 'electricity', 'jobs', 'listings', 'marketplace', 'orders', 'profile', 'projects', 'requests', 'returns', 'security', 'updates'];
const adminRoutes = ['ai', 'audit', 'investors', 'overview', 'reports', 'requirements', 'tenants', 'users'];
const componentFiles = (group: string) => readdirSync(new URL(`../../src/components/${group}/`, import.meta.url)).filter((file) => file.endsWith('.tsx'));

describe('complete Clinexa Portal and Admin coverage', () => {
  it.each(portalRoutes)('frames the portal/%s route without moving its permission boundary', (route) => {
    const page = read(`src/app/(portal)/portal/${route ? `${route}/` : ''}page.tsx`);
    expect(page).toContain('className="pb-page"');
    expect(page).toContain('<PageHeader');
    expect(page).toMatch(/className="w-full (?:min-w-0 |max-w-\[\d+px\] )?flex flex-col gap-6(?: min-w-0)?"|className=\{(?:layout|common).layout\}|<PageTabs label=/);
    const contentIndex = page.search(/className="w-full |className=\{(?:layout|common).layout\}|<PageTabs label=/);
    expect(page.indexOf('<PageHeader')).toBeLessThan(contentIndex);
    expect(page.indexOf('await requireCapability(')).toBeLessThan(page.indexOf('<PageHeader'));
    expect(page).not.toMatch(/max-w-\[\d+px\] mx-auto/);
  });

  it.each(adminRoutes)('frames admin/%s with a consistent page heading', (route) => {
    const page = read(`src/app/(admin)/admin/${route}/page.tsx`);
    expect(page).toContain('className="pb-page"');
    expect(page).toContain('<PageHeader');
    expect(page).toContain('await requireCapability(');
    expect(page.indexOf('await requireCapability(')).toBeLessThan(page.indexOf('<PageHeader'));
  });

  it('covers the complete current route trees rather than a curated subset', () => {
    const names = (group: string, prefix: string) => readdirSync(new URL(`../../src/app/(${group})/${prefix}/`, import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    expect(names('portal', 'portal')).toEqual(portalRoutes.filter(Boolean).sort());
    expect(names('admin', 'admin')).toEqual([...adminRoutes].sort());
  });

  it('audits every Portal/Admin component through explicit design-system contracts', () => {
    for (const group of ['portal', 'admin']) for (const name of componentFiles(group)) {
      const source = read(`src/components/${group}/${name}`);
      expect(source, `${group}/${name}`).toMatch(/PageTabs|KpiCard|CardHeader|pb-section|pb-action|pb-stat|pb-hero|pb-form-control|pb-filter|pb-icon-action|pb-panel|text-\[14px\] font-medium|text-\[13px\] font-medium|data-portal-dialog/);
      expect(source, `${group}/${name}`).not.toContain('linear-gradient(');
    }
  });

  it('retains responsive page framing and theme-stable resident identity/actions', () => {
    for (const route of ['', 'electricity', 'profile', 'security']) {
      expect(read(`src/app/(portal)/portal/${route ? `${route}/` : ''}page.tsx`)).toMatch(/className=\{(?:layout|common).layout\}|className="w-full |<PageTabs label=/);
    }
    expect(read('src/app/(portal)/portal/profile/page.tsx')).toContain('Not an access credential');
    expect(read('src/components/portal/quick-actions.tsx')).toContain("tint: 'var(--tone-danger)'");
  });

  it('uses native modal focus and restoration for all direct dialogs and reviewed actions', () => {
    const modal = read('src/components/portal/portal-dialog.tsx');
    expect(modal).toContain('element.showModal()');
    expect(modal).toContain('previous.focus()');
    expect(modal).toContain('onCancel=');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('event.target === event.currentTarget');
    const uses = ['portal/bookings-workspace', 'portal/requests-workspace', 'portal/marketplace-workspace', 'portal/vendor-listings-workspace', 'portal/safety-workspace', 'portal/investor-portfolio-workspace', 'admin/tenants-workspace']
      .map((file) => read(`src/components/${file}.tsx`)).join('\n');
    expect(uses.match(/<PortalDialog label=/g)).toHaveLength(10);
    const review = read('src/components/ui/workspace-decision.tsx');
    expect(review).toContain('<PortalDialog label={decision.title}');
    expect(review).toContain('canClose={!pending}');
    expect(uses).toContain('<WorkspaceDecisionDialog');
    expect(read('src/components/portal/safety-workspace.tsx')).toContain('canClose={!pending} dismissOnBackdrop={false}');
  });

  it('keeps form inputs named and selection states available to assistive technology', () => {
    expect(read('src/components/portal/vendor-listings-workspace.tsx')).toContain('<span className={layout.label}>Price in NGN</span><input required type="number"');
    expect(read('src/components/portal/requests-workspace.tsx')).toContain('aria-label="Describe your maintenance request"');
    expect(read('src/components/admin/tenants-workspace.tsx')).toContain('Organisation name</span><input');
    expect(read('src/components/portal/announcements-workspace.tsx')).toContain('aria-expanded={isOpen}');
    expect(read('src/components/admin/ai-workspace.tsx')).toContain('aria-pressed={modes[f.id] === m.key}');
    expect(read('src/components/portal/vendor-orders-workspace.tsx')).toContain('aria-pressed={filter === key}');
  });

  it('preserves reviewed scoped writes, recorded SOS and estimate disclosures', () => {
    expect(read('src/components/portal/vendor-jobs-workspace.tsx')).toContain('fireWoTransition(job.ref, action.event)');
    expect(read('src/components/portal/vendor-orders-workspace.tsx')).toContain("transition('marketplace-order', order.id, action.event)");
    expect(read('src/components/portal/bills-workspace.tsx')).toContain('await payChargeFromWallet(ref)');
    expect(read('src/components/admin/users-workspace.tsx')).toContain('action: () => setUserStatus(user.id, next)');
    expect(read('src/components/portal/safety-workspace.tsx')).toContain('await raiseSos()');
    expect(read('src/components/portal/investor-returns-workspace.tsx')).toContain('not AI advice, a valuation or a guarantee');
    expect(read('src/components/portal/investor-returns-workspace.tsx')).toContain('not an investment forecast');
    expect(read('src/components/admin/platform-overview.tsx')).toContain("'not_configured'");
    expect(read('src/components/admin/tenants-workspace.tsx')).toContain('No user access, identity-provider session or audit record is changed.');
  });

  it('uses shared table/control foundations without recolouring semantic table cells', () => {
    for (const file of ['src/components/admin/audit-workspace.tsx', 'src/components/admin/users-workspace.tsx', 'src/app/(admin)/admin/requirements/page.tsx']) {
      expect(read(file)).toMatch(/className=\{`pb-data-table \$\{common.table\}`\}|className="pb-data-table(?: [^"]*)?"/);
    }
    const css = read('src/components/ui/application-foundations.css');
    expect(css).toContain('.pb-app .pb-form-control');
    expect(css).toContain('.pb-app .pb-action');
    expect(css.match(/\.pb-app \.pb-data-table tbody :where\(td, th\)\s*\{([^}]+)\}/)?.[1]).not.toMatch(/(?:^|;)\s*color:/);
  });
});
