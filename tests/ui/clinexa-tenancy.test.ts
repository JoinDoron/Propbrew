import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { TenancyWorkspace } from '@/components/estate/tenancy-workspace';
import { TenancyDepositDialog } from '@/components/estate/tenancy-deposit-dialog';
import { canRecordDeposit, tenancyDate, tenancyMoney, type TenancyRow } from '@/components/estate/tenancy-types';
import { TENANCY_FLOW, TENANCY_LABEL } from '@/domain/estate';
import { advanceTenancy, settleDeposit } from '@/server/actions/estate';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/estate', () => ({ advanceTenancy: vi.fn(), settleDeposit: vi.fn() }));

type Props = ComponentProps<typeof TenancyWorkspace>;
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const view = () => read('src/components/estate/tenancy-workspace.tsx');
const styles = () => read('src/components/estate/tenancy-workspace.module.css');
const nowMs = Date.parse('2026-10-23T09:00:00Z');

const tenancies: TenancyRow[] = [
  { id: 'tenancy-folake', residentName: 'Folake Bello', unitLabel: 'Block C · 12B', stage: 'active', applicationISO: '2026-01-10', moveInISO: '2026-02-01', leaseEndISO: '2026-11-05', rentMinor: 120_000_025, depositMinor: 5_000_025, depositStatus: 'held' },
  { id: 'tenancy-tobi', residentName: 'Tobi Ade', unitLabel: 'Block A · 09A', stage: 'moving_out', applicationISO: '2025-06-10', moveInISO: '2025-07-01', leaseEndISO: '2026-07-01', moveOutISO: '2026-11-01', rentMinor: 100_000_050, depositMinor: 2_000_050, depositStatus: 'pending' },
  { id: 'tenancy-ngozi', residentName: 'Ngozi Adeniyi', unitLabel: 'Block D · 04C', stage: 'closed', applicationISO: '2025-01-01', moveInISO: '2025-02-01', leaseEndISO: '2026-02-01', moveOutISO: '2026-02-02', rentMinor: 80_000_000, depositMinor: 1_000_000, depositStatus: 'partially_refunded' },
  { id: 'tenancy-ada', residentName: 'Ada Okafor', unitLabel: 'Block B · 02A', stage: 'screening', applicationISO: '2026-10-20', rentMinor: 50, depositMinor: 25, depositStatus: 'pending' },
];
const fixtures: Props = { tenancies, kpis: { active: 1, inMotion: 1, renewalsSoon: 1, depositExposureMinor: 7_000_100 }, nowMs, canMutate: true };
const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(TenancyWorkspace, { ...fixtures, ...overrides }));

describe('Clinexa-aligned Tenancy workspace', () => {
  it('reuses shared cards, identity, status, controls and empty states rather than a separate hero system', () => {
    for (const primitive of ['Card', 'CardHeader', 'KpiCard', 'Avatar', 'StatusPill', 'Button', 'IconButton', 'EmptyState']) expect(view()).toMatch(new RegExp(`<${primitive}(?:\\s|>)`));
    expect(view()).not.toContain('pb-hero');
    expect(view()).not.toMatch(/text-\[(?:8|9|10\.5|11\.5|12\.5)px\]/);
  });

  it('preserves the two mounted sections, stable identifiers and their original ordering', () => {
    const html = render();
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(view()).toMatch(/id:\s*'tenancies'/);
    expect(view()).toMatch(/id:\s*'overview'/);
    expect(view().indexOf("id: 'tenancies'")).toBeLessThan(view().indexOf("id: 'overview'"));
    expect(html).toContain('Tenancies');
    expect(html).toContain('Lease overview');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain(' hidden=""');
  });

  it('preserves every resident, unit and recorded workflow stage', () => {
    const html = render();
    for (const t of tenancies) {
      expect(html).toContain(t.residentName);
      expect(html).toContain(t.unitLabel);
      expect(html).toContain(TENANCY_LABEL[t.stage]);
    }
  });

  it('keeps NGN values exact to kobo rather than rounding rent and deposit records', () => {
    expect(tenancyMoney(120_000_025)).toBe('₦1,200,000.25');
    expect(tenancyMoney(2_000_050)).toBe('₦20,000.5');
    expect(tenancyMoney(50)).toBe('₦0.5');
    expect(tenancyMoney(0)).toBe('₦0');
    const html = render();
    for (const t of tenancies) expect(html).toContain(tenancyMoney(t.rentMinor));
    expect(html).not.toContain('₦0k');
  });

  it('formats tenancy dates in an explicit UTC calendar and safely retains invalid input', () => {
    expect(tenancyDate('2026-10-23')).toMatch(/23 Oct 2026/);
    expect(tenancyDate('2026-10-23T23:59:00Z')).toBe(tenancyDate('2026-10-23'));
    expect(tenancyDate('not-a-date')).toBe('not-a-date');
    expect(read('src/components/estate/tenancy-types.ts')).toContain("timeZone: 'UTC'");
  });

  it('uses a semantic, locally scrollable tenancy register rather than clickable table rows', () => {
    const html = render();
    for (const text of ['<table', '<thead>', '<tbody>', 'pb-data-table', 'pb-table-scroll', 'scope="col"', 'role="region"', 'tabindex="0"']) expect(html).toContain(text);
    expect(view()).not.toMatch(/<tr[^>]*onClick=/);
    expect(html).toMatch(/aria-label="[^"]*(?:tenancy|details)[^"]*Folake Bello[^"]*"/i);
  });

  it('labels search and stage filters while retaining every lifecycle stage', () => {
    const html = render();
    expect(html).toContain('type="search"');
    expect(html).toMatch(/Search tenancies/i);
    expect(html).toMatch(/Tenancy stage/i);
    expect(html).toMatch(/All stages/i);
    for (const stage of TENANCY_FLOW) expect(html).toContain(`value="${stage}"`);
    expect(html).toMatch(/Showing 4 of 4/);
  });

  it('renders an honest empty account and keeps both sections usable without invalid charts', () => {
    const html = render({ tenancies: [], kpis: { active: 0, inMotion: 0, renewalsSoon: 0, depositExposureMinor: 0 }, canMutate: false });
    expect(html).toContain('No tenancy records in your scope yet.');
    expect(html).toContain('₦0');
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(view()).not.toMatch(/(?:tenancies\.length|total)\s*\|\|\s*1/);
  });

  it('allows deposit disposition only at move-out or closure while held or pending', () => {
    for (const stage of TENANCY_FLOW) {
      for (const depositStatus of ['pending', 'held', 'partially_refunded', 'refunded', 'withheld'] as const) {
        expect(canRecordDeposit({ ...tenancies[0], stage, depositStatus })).toBe((stage === 'moving_out' || stage === 'closed') && (depositStatus === 'pending' || depositStatus === 'held'));
      }
    }
    expect(view()).toContain('canRecordDeposit(');
  });

  it('never invokes tenancy or deposit mutations while rendering manager or read-only access', () => {
    render();
    const html = render({ canMutate: false });
    expect(html).toMatch(/Read-only access/i);
    expect(advanceTenancy).not.toHaveBeenCalled();
    expect(settleDeposit).not.toHaveBeenCalled();
    const page = read('src/app/(ops)/(estate)/tenancy/page.tsx');
    expect(page).toContain("requireCapability('users_roles', 'read', 'estate')");
    expect(page).toContain('repos.tenancies.list(actor)');
    expect(page).toContain("can(actor, 'users_roles', 'update').allowed");
    expect(page).toContain('canMutate=');
    expect(view()).not.toMatch(/from ['"]@\/server\/(?:data|session)['"]/);
  });

  it('uses protected native dialogs for case details and explicit stage confirmation', () => {
    expect(view()).toContain('<PortalDialog');
    expect(view()).not.toContain('fixed inset-0 z-');
    expect(view()).toContain('canClose={!pending}');
    expect(view()).toContain('disabled={pending}');
    expect(view()).toContain('router.refresh()');
    expect(view()).toContain('role="status"');
    const dialog = read('src/components/portal/portal-dialog.tsx');
    expect(dialog).toContain('element.showModal()');
    expect(dialog).toContain('previous.focus()');
    expect(dialog).toContain('aria-modal="true"');
  });

  it('keeps lease analysis pinned to the supplied snapshot rather than the browser clock', () => {
    expect(view()).toContain('nowMs');
    expect(view()).not.toMatch(/Date\.now\(/);
    const html = render();
    expect(html).toMatch(/snapshot/i);
    expect(html).toMatch(/(?:23 Oct 2026|23 October 2026|2026-10-23)/);
    expect(html).not.toMatch(/AI-scored|animate-ping|>\s*live\s*</i);
    expect(view()).not.toMatch(/<KpiCard[^>]*\bdelta=/);
  });

  it('includes expired active leases in renewal review without treating missing or non-active dates as due', () => {
    const rows: TenancyRow[] = [
      { ...tenancies[0], id: 'expired', residentName: 'Expired Active', leaseEndISO: '2026-10-01' },
      { ...tenancies[0], id: 'boundary', residentName: 'Within Forty Five', leaseEndISO: '2026-12-07' },
      { ...tenancies[0], id: 'later', residentName: 'Later Renewal', leaseEndISO: '2026-12-08' },
      { ...tenancies[0], id: 'missing', residentName: 'Missing Lease End', leaseEndISO: undefined },
      { ...tenancies[0], id: 'closed', residentName: 'Closed Expired', stage: 'closed', leaseEndISO: '2026-10-01' },
    ];
    const html = render({ tenancies: rows });
    expect(html).toContain('Active leases ending within 45 days, including expired leases');
    expect(html).toContain('aria-label="Review lease for Expired Active"');
    expect(html).toContain('Expired 22d ago');
    expect(html).toContain('aria-label="Review lease for Within Forty Five"');
    for (const name of ['Later Renewal', 'Missing Lease End', 'Closed Expired']) expect(html).not.toContain(`aria-label="Review lease for ${name}"`);
    expect(html).toContain('No renewal or notice is generated automatically.');
  });

  it('labels held plus pending amounts as exposure rather than confirmed money held', () => {
    const html = render();
    expect(html).toContain('Deposit exposure');
    expect(html).toContain('Exposure includes deposits due and deposits marked as held');
    expect(html).toContain('Due + held exposure');
    expect(html).toContain(tenancyMoney(5_000_025));
    expect(html).toContain(tenancyMoney(2_000_075));
    expect(html).toContain(tenancyMoney(7_000_100));
    expect(html).toContain('not proof of cash held or a completed refund');
    expect(html).not.toContain('Deposits held</');
  });

  it('gates mutation dialogs, rejects closed-stage advance and explains existing automatic workflow side effects', () => {
    const source = view();
    expect(source).toContain("if (!canMutate || pending || !advancing || advancing.stage === 'closed') return;");
    expect(source).toContain('canMutate && settleFor && canRecordDeposit(settleFor) && <TenancyDepositDialog');
    expect(source).toContain('canMutate && advancing && <PortalDialog');
    expect(source).toContain('advanceTenancy(t.id, t.stage)');
    expect(source).toContain('Confirm stage change');
    expect(source).toContain('The deposit stays marked as due.');
    expect(source).toContain('Verify any deposit against the underlying payment records.');
    expect(source).toContain('A move-in date will be recorded.');
    expect(source).toContain('not a newly entered move-in date.');
    expect(source).toContain('No automated housing decisions.');
  });

  it('keeps mutation feedback inside the active dialog with an accessible named dismissal', () => {
    const source = view();
    expect(source).toContain('message && !advanceFor && !settleFor && <TenancyFeedback');
    expect(source).toContain('message && <TenancyFeedback');
    expect(source).toContain('message && !selected && !advanceFor && !settleFor && <TenancyFeedback floating');
    expect(source).toContain('aria-label="Dismiss tenancy notification"');
    expect(source).toMatch(/catch\s*\{\s*setMessage\('Unable to update this tenancy\. Please try again\.'/);
    expect(source).toContain('Deposit status recorded. No money was transferred.');
  });

  it('uses themed responsive 24px and 16px rhythm with readable financial data', () => {
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

describe('Clinexa-aligned deposit settlement record', () => {
  const renderDialog = (t: TenancyRow = tenancies[1]) => renderToStaticMarkup(createElement(TenancyDepositDialog, { t, onClose: vi.fn(), onDone: vi.fn() }));
  const source = () => read('src/components/estate/tenancy-deposit-dialog.tsx');

  it('provides a labelled native form with a named close control and exact recorded amount', () => {
    const html = renderDialog();
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="Deposit settlement record"');
    expect(html).toContain('<form');
    expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Amount marked for return \(₦\)<\/label>/);
    expect(html).toContain('aria-label="Close deposit settlement record"');
    expect(html).toContain('Tobi Ade');
    expect(html).toContain('Block A · 09A');
    expect(html).toContain(tenancyMoney(tenancies[1].depositMinor));
    const amountInput = html.match(/<input[^>]*name="refund"[^>]*>/)?.[0];
    for (const attribute of ['type="number"', 'inputMode="decimal"', 'min="0"', 'max="20000.5"', 'step="0.01"', 'required=""', 'value="20000.50"']) expect(amountInput).toContain(attribute);
  });

  it('distinguishes a saved deposit status from an actual refund or verified payment', () => {
    const html = renderDialog();
    expect(html).toContain('Save settlement record');
    expect(html).toContain('Saving updates the deposit status in Propbrew.');
    expect(html).toContain('It does not initiate a bank transfer, verify a payment or issue a refund.');
    expect(html).toContain('Amount not marked for return');
    expect(html).not.toMatch(/>\s*Refund (?:now|sent|successful)/i);
    expect(settleDeposit).not.toHaveBeenCalled();
  });

  it('warns when a pending deposit is not yet confirmed received without mislabelling it as held', () => {
    const html = renderDialog();
    expect(html).toContain('Deposit due');
    expect(html).toContain('This deposit is marked as due, not confirmed as received.');
    expect(html).not.toContain('Deposit held');
  });

  it('keeps existing decimal precision, validates finite bounded amounts and accepts zero deliberately', () => {
    const text = source();
    expect(text).toContain('(t.depositMinor / 100).toFixed(2)');
    expect(text).toContain("refund.trim() !== ''");
    expect(text).toContain('Number.isFinite(amount)');
    expect(text).toContain('amount >= 0');
    expect(text).toContain('amount <= depositMajor');
    expect(text).toContain('settleDeposit(t.id, Number(refund))');
    expect(text).not.toContain("replace(/[^0-9]/g");
    expect(text).not.toContain('Math.round(t.depositMinor / 100)');
  });

  it('shows ineligible settlements as an alert with a disabled form rather than calling the action', () => {
    const html = renderDialog(tenancies[0]);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Only a moving-out or closed tenancy with a held or pending deposit can be recorded here.');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(settleDeposit).not.toHaveBeenCalled();
  });

  it('protects pending dismissal and duplicate submission, with errors inside the active dialog', () => {
    const text = source();
    expect(text).toContain('event.preventDefault()');
    expect(text).toContain('if (pending) return');
    expect(text).toContain('if (!eligible)');
    expect(text).toContain('if (!validAmount)');
    expect(text).toContain('canClose={!pending}');
    expect(text).toContain('aria-busy={pending}');
    expect(text).toContain('disabled={pending || !eligible}');
    expect(text).toContain('role="alert"');
    expect(text).toContain('aria-describedby=');
    expect(text).toContain('aria-invalid=');
    expect(text).toMatch(/catch\s*\{\s*setError\('The settlement record could not be saved\. Please try again\.'/);
  });
});
