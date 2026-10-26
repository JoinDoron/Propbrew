import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BillingWorkspace } from '@/components/billing/billing-workspace';
import type { Invoice } from '@/domain/entities';
import { money } from '@/domain/primitives';
import { sendReminderCampaign } from '@/server/actions/billing';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/billing', () => ({ sendReminderCampaign: vi.fn() }));

type Props = ComponentProps<typeof BillingWorkspace>;
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const view = () => read('src/components/billing/billing-workspace.tsx');
const styles = () => read('src/components/billing/billing-workspace.module.css');

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    tenantId: 'tenant-lagos' as Invoice['tenantId'],
    id: 'invoice-service-charge' as Invoice['id'],
    ref: 'INV-10001',
    unitId: 'unit-12b' as Invoice['unitId'],
    estateId: 'estate-lagos' as Invoice['estateId'],
    residentName: 'Folake Bello',
    ownerUserId: 'resident-folake' as Invoice['ownerUserId'],
    description: 'October estate service charge',
    status: 'escalated',
    amount: money(250_000),
    paid: money(50_000),
    dueDate: '2026-07-25',
    agingDays: 90,
    ...overrides,
  };
}

const paidInvoice = invoice({
  id: 'invoice-paid' as Invoice['id'],
  ref: 'INV-10002',
  residentName: 'Tobi Ade',
  ownerUserId: 'resident-tobi' as Invoice['ownerUserId'],
  description: 'October waste collection',
  status: 'paid',
  amount: money(150_000),
  paid: money(150_000),
  agingDays: 0,
});

const fixtures: Props = { invoices: [invoice(), paidInvoice], canMutate: true };
const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(BillingWorkspace, { ...fixtures, ...overrides }));

describe('Clinexa-aligned Billing workspace', () => {
  it('uses the shared application cards, typography, controls and resident identity primitives', () => {
    for (const primitive of ['Card', 'CardHeader', 'KpiCard', 'StatusPill', 'Button', 'IconButton', 'Avatar', 'EmptyState']) {
      expect(view()).toMatch(new RegExp(`<${primitive}(?:\\s|>)`));
    }
    expect(view()).not.toContain('pb-hero');
    expect(view()).not.toMatch(/text-\[(?:8|10\.5|12\.5)px\]/);
  });

  it('preserves all three mounted sections with stable identifiers and accessible selection', () => {
    const html = render();
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    for (const id of ['overview', 'invoices', 'risk']) {
      expect(view()).toMatch(new RegExp(`id:\\s*'${id}'`));
    }
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain(' hidden=""');
  });

  it('retains supplied invoice identities, balances, statuses and resident context', () => {
    const html = render();
    for (const text of ['INV-10001', 'INV-10002', 'Folake Bello', 'Tobi Ade', 'October estate service charge', 'October waste collection']) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/escalated/i);
    expect(html).toMatch(/paid/i);
    expect(html).toContain('₦2,500');
    expect(html).toContain('₦2,000');
  });

  it('filters one currency before aggregating balances, watchlists and invoice records', () => {
    const usdInvoice = invoice({
      id: 'invoice-usd' as Invoice['id'],
      ref: 'USD-90001',
      residentName: 'USD-only resident',
      ownerUserId: 'resident-usd' as Invoice['ownerUserId'],
      amount: money(9_000_000, 'USD'),
      paid: money(0, 'USD'),
    });
    const html = render({ invoices: [usdInvoice, ...fixtures.invoices] });
    expect(html).toContain('INV-10001');
    expect(html).not.toContain('USD-90001');
    expect(html).not.toContain('USD-only resident');
    expect(html).not.toContain('₦94,000');
    expect(html).not.toContain('$90,000');
    expect(html).toMatch(/<option[^>]*value="NGN"[^>]*selected=""/);
    expect(html).toContain('value="USD"');
  });

  it('uses the recorded currency rather than relabelling a non-Nigerian account as naira', () => {
    const html = render({ invoices: [invoice({ amount: money(250_000, 'USD'), paid: money(50_000, 'USD') })] });
    expect(html).toContain('$2,500');
    expect(html).toContain('$2,000');
    expect(html).not.toContain('₦');
    expect(html).toMatch(/<option[^>]*value="USD"[^>]*selected=""/);
  });

  it('preserves minor-unit precision in recorded invoice amounts and remaining balances', () => {
    const html = render({ invoices: [invoice({ amount: money(250_025), paid: money(50_050) })] });
    expect(html).toContain('₦2,500.25');
    expect(html).toContain('₦1,999.75');
  });

  it.each([
    ['empty', []],
    ['fully paid', [paidInvoice]],
  ] as const)('reports true zero arrears for an %s account without invalid chart values', (_label, invoices) => {
    const html = render({ invoices: [...invoices] });
    expect(html).toContain('₦0');
    expect(html).toMatch(/no outstanding balances|no arrears|all balances (?:are )?settled/i);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(view()).not.toMatch(/bucketTotal\s*=.*\|\|\s*1/);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
  });

  it('retains paid and draft invoice records instead of requiring an active risk signal to view them', () => {
    const draft = invoice({
      id: 'invoice-draft' as Invoice['id'],
      ref: 'DRAFT-10003',
      residentName: 'Ngozi Adeniyi',
      ownerUserId: 'resident-ngozi' as Invoice['ownerUserId'],
      status: 'draft',
      paid: money(0),
      agingDays: -10,
    });
    const html = render({ invoices: [paidInvoice, draft] });
    expect(html).toContain('INV-10002');
    expect(html).toContain('DRAFT-10003');
    expect(html).toContain('Ngozi Adeniyi');
    expect(html).toContain('Tobi Ade');
    expect(html).toMatch(/aria-label="[^"]*statement[^"]*Tobi Ade[^"]*"/i);
    expect(html).toMatch(/aria-label="[^"]*statement[^"]*Ngozi Adeniyi[^"]*"/i);
    expect(view()).toContain('const selectedInvoices = selected ? currencyInvoices.filter(');
    expect(view()).toContain('selectedInvoices.length > 0 && <PortalDialog');
  });

  it('offers reminder review only to managers and never runs the preview while rendering', () => {
    expect(render()).toContain('Review reminders');
    expect(render({ canMutate: false })).not.toContain('Review reminders');
    expect(render({ canMutate: false })).toContain('Read-only access');
    expect(render({ invoices: [paidInvoice] })).not.toContain('Review reminders');
    expect(sendReminderCampaign).not.toHaveBeenCalled();
    expect(view()).toContain('if (!canMutate || pending || targets.length === 0) return;');
    expect(view()).toContain('targets.map((target) => target.ownerUserId)');
    expect(view()).toContain('disabled={pending}');
    expect(view()).toContain('router.refresh()');
    expect(view()).toContain('role="status"');
    expect(view()).toContain("catch { setToast('Unable to complete the reminder preview. Please try again.'); }");
  });

  it('keeps the invoice search and status tools labelled and within the register', () => {
    const html = render();
    expect(html).toContain('Search invoices');
    expect(html).toContain('type="search"');
    expect(html).toContain('Invoice status');
    expect(html).toContain('All statuses');
    expect(html).toContain('value="outstanding"');
    expect(html).toContain('value="paid"');
    expect(html).toContain('value="draft"');
    expect(html).toContain('Showing 2 of 2 recorded invoices');
  });

  it('uses a semantic invoice register with local keyboard-accessible overflow', () => {
    const html = render();
    expect(html).toContain('<table');
    expect(html).toContain('pb-data-table');
    expect(html).toContain('pb-table-scroll');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('scope="col"');
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    // Opening a statement must not depend on a pointer-only table-row handler.
    expect(view()).not.toMatch(/<tr[^>]*onClick=/);
    expect(html).toMatch(/<button[^>]*(?:aria-label="[^"]*(?:statement|invoice)[^"]*"|>[^<]*statement)/i);
  });

  it('does not invent trends or imply a provider-backed AI score from deterministic rules', () => {
    const html = render();
    expect(view()).not.toMatch(/<KpiCard[^>]*\bdelta=/);
    expect(html).not.toMatch(/AI-scored|AI forecast|pays ~|animate-ping|>\s*live\s*</i);
    expect(html).toMatch(/rules-based/i);
    expect(html).toMatch(/snapshot/i);
    expect(html).toMatch(/human review|decision support|review indicator|review signal/i);
  });

  it('names its numerical collection and aging charts without relying on colour', () => {
    const html = render();
    expect(html).toMatch(/role="img" aria-label="Collection rate 50 percent; forecast \d+ percent"/);
    expect(html).toContain('aria-label="Outstanding balance by age:');
    expect(html).toContain('61–90 days, ₦2,000');
    expect(view()).toContain('Math.max(0, Math.min(100, pct))');
    expect(view()).toContain('Math.max(0, Math.min(100, projected))');
  });

  it('keeps billing data permission-scoped at the server boundary', () => {
    const page = read('src/app/(ops)/(estate)/billing/page.tsx');
    expect(page).toContain("requireCapability('charges_invoicing', 'read', 'estate')");
    expect(page).toContain("effectiveLevel(actor, 'charges_invoicing')");
    expect(page).toContain('repos.invoices.list(actor, { cursor, limit: 500 })');
    expect(view()).not.toMatch(/from ['"]@\/server\/(?:data|session)['"]/);
  });

  it('uses native modal focus and dismissal rather than a custom unlabelled overlay', () => {
    expect(view()).toContain('<PortalDialog');
    expect(view()).not.toContain('fixed inset-0 z-');
    expect(view()).toMatch(/aria-label=[^\n]*(?:Close|close)/);
    expect(view()).toContain('canClose={!pending}');
    const dialog = read('src/components/portal/portal-dialog.tsx');
    expect(dialog).toContain('element.showModal()');
    expect(dialog).toContain('previous.focus()');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('if (canClose) onClose()');
  });

  it('announces preview failures within the active dialog instead of behind its inert backdrop', () => {
    const source = view();
    const statementStart = source.indexOf('selectedInvoices.length > 0 && <PortalDialog');
    const previewStart = source.indexOf('campaign && <PortalDialog');
    const floatingStart = source.indexOf('toast && !campaign && selectedInvoices.length === 0');
    expect(statementStart).toBeGreaterThan(-1);
    expect(previewStart).toBeGreaterThan(statementStart);
    expect(floatingStart).toBeGreaterThan(previewStart);
    const statement = source.slice(statementStart, previewStart);
    const preview = source.slice(previewStart, floatingStart);
    expect(statement).toContain('toast && !campaign && <BillingFeedback message={toast}');
    expect(preview).toContain('toast && <BillingFeedback message={toast}');
    expect(source.slice(floatingStart)).toContain('<BillingFeedback floating message={toast}');
    expect(source).toContain('function BillingFeedback(');
    expect(source).toContain('className={floating ? styles.toast : styles.feedback} role="status"');
    expect(source).toContain('aria-label="Dismiss billing notification" onClick={onDismiss}');
    expect(styles()).not.toMatch(/\.feedback\s*\{[^}]*position:\s*fixed/);
  });

  it('clears prior feedback before either reminder preview is opened', () => {
    const source = view();
    expect(source).toContain('onClick={() => { setToast(null); setCampaign(highRisk); }}');
    expect(source).toContain('onClick={() => { setToast(null); setCampaign([selectedRisk]); }}');
  });

  it('never promises delivery when a connected reminder queue does not exist', () => {
    const html = render();
    expect(view()).toContain('sendReminderCampaign(');
    expect(html).not.toMatch(/Reminders queued|Send payment reminder|via in-app, SMS and email/);
    expect(html).toMatch(/not connected|not configured|unavailable|not enabled|not yet connected/i);
    expect(html).toMatch(/no (?:automatic|automated) penalt|penalt(?:y|ies)[^<]*never/i);
    expect(view()).toMatch(/No messages (?:were|are) sent/i);
    expect(view()).toContain('Confirm preview');
    expect(view()).toContain('does not send in-app, SMS or email messages, record a campaign, or apply a penalty.');
  });

  it('uses responsive spacing and themed readable financial surfaces without global overrides', () => {
    const css = styles();
    expect(css).toContain('gap: 24px');
    expect(css).toContain('gap: 16px');
    expect(css).toMatch(/@media\s*\(max-width:\s*\d+px\)/);
    expect(css).toContain('min-width: 0');
    expect(css).toContain('font-size: 14px');
    expect(css).toContain('font-size: 12px');
    expect(css).toContain('var(--');
    expect(css).not.toContain('!important');
  });
});
