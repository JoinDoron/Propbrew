import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CollectionsWorkspace } from '@/components/estate/collections-workspace';
import { CollectionPromiseDialog } from '@/components/estate/collection-promise-dialog';
import { collectionDate, collectionMoney, type CaseRow } from '@/components/estate/collections-types';
import { advanceDunning, recordPromise, sendReminder } from '@/server/actions/estate';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/estate', () => ({ sendReminder: vi.fn(), advanceDunning: vi.fn(), recordPromise: vi.fn() }));

type Props = ComponentProps<typeof CollectionsWorkspace>;
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const view = () => read('src/components/estate/collections-workspace.tsx');
const styles = () => read('src/components/estate/collections-workspace.module.css');

const cases: CaseRow[] = [
  { id: 'case-folake', invoiceRef: 'INV-10001', residentName: 'Folake Bello', unitLabel: 'Block C · 12B', amountMinor: 250_025, agingDays: 90, stage: 'escalated', remindersSent: 3, promiseAmountMinor: 100_025, promiseDueISO: '2026-10-29', promiseStatus: 'broken' },
  { id: 'case-tobi', invoiceRef: 'INV-10002', residentName: 'Tobi Ade', unitLabel: 'Block A · 09A', amountMinor: 100_050, agingDays: 3, stage: 'reminder', remindersSent: 0 },
  { id: 'case-ngozi', invoiceRef: 'INV-10003', residentName: 'Ngozi Adeniyi', unitLabel: 'Block D · 04C', amountMinor: 50_000, agingDays: 24, stage: 'plan', remindersSent: 1, promiseAmountMinor: 50_000, promiseDueISO: '2026-10-30', promiseStatus: 'pending' },
];
const fixtures: Props = { cases, forecast: { outstandingMinor: 400_075, expectedMinor: 150_025, recoveryPct: 38 }, canMutate: true };
const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(createElement(CollectionsWorkspace, { ...fixtures, ...overrides }));

describe('Clinexa-aligned Collections workspace', () => {
  it('reuses the application card, identity, status, control and empty-state primitives', () => {
    for (const primitive of ['Card', 'CardHeader', 'KpiCard', 'Avatar', 'StatusPill', 'Button', 'IconButton', 'EmptyState']) {
      expect(view()).toMatch(new RegExp(`<${primitive}(?:\\s|>)`));
    }
    expect(view()).not.toContain('pb-hero');
    expect(view()).not.toMatch(/text-\[(?:8|10\.5|11\.5|12\.5)px\]/);
  });

  it('preserves both mounted page sections with stable tab identifiers', () => {
    const html = render();
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    for (const id of ['overview', 'cases']) expect(view()).toMatch(new RegExp(`id:\\s*'${id}'`));
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain(' hidden=""');
  });

  it('preserves resident identities, units, invoice references and exact outstanding balances', () => {
    const html = render();
    for (const text of ['Folake Bello', 'Tobi Ade', 'Ngozi Adeniyi', 'Block C · 12B', 'Block A · 09A', 'Block D · 04C', 'INV-10001', 'INV-10002', 'INV-10003', collectionMoney(250_025), collectionMoney(100_050), collectionMoney(50_000)]) expect(html).toContain(text);
    expect(html).toContain('₦4,000.75');
    expect(html).toContain('₦1,500.25');
    expect(html).toMatch(/escalated/i);
    expect(html).toMatch(/payment plan/i);
  });

  it('formats recorded NGN minor units without rounding off kobo or mislabelling small balances', () => {
    expect(collectionMoney(250_025)).toBe('₦2,500.25');
    expect(collectionMoney(100_050)).toBe('₦1,000.5');
    expect(collectionMoney(50)).toBe('₦0.5');
    expect(collectionMoney(0)).toBe('₦0');
    expect(collectionDate('2026-10-29')).toMatch(/29 Oct 2026/);
    expect(collectionDate('not-a-date')).toBe('not-a-date');
  });

  it('uses a semantic register with local named keyboard-accessible table overflow', () => {
    const html = render();
    for (const text of ['<table', '<thead>', '<tbody>', 'pb-data-table', 'pb-table-scroll', 'scope="col"', 'role="region"', 'tabindex="0"']) expect(html).toContain(text);
    expect(view()).not.toMatch(/<tr[^>]*onClick=/);
    expect(html).toMatch(/aria-label="[^"]*(?:case|details)[^"]*Folake Bello[^"]*"/i);
  });

  it('labels search and collection-stage filters without hiding the recorded case count', () => {
    const html = render();
    expect(html).toContain('type="search"');
    expect(html).toMatch(/Search collection cases/i);
    expect(html).toMatch(/Collection stage/i);
    expect(html).toMatch(/All stages/i);
    for (const stage of ['reminder', 'notice', 'plan', 'escalated']) expect(html).toContain(`value="${stage}"`);
    expect(html).toMatch(/Showing 3 of 3/);
  });

  it('renders a genuine empty account with zero forecast values and no invalid charts', () => {
    const html = render({ cases: [], forecast: { outstandingMinor: 0, expectedMinor: 0, recoveryPct: 0 } });
    expect(html).toContain('₦0');
    expect(html).toMatch(/No collection cases/i);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).not.toContain('aria-label="Estimated recovery:');
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(view()).not.toMatch(/(?:total|outstandingMinor)\s*\|\|\s*1/);
  });

  it('names the numerical recovery and collection-stage charts without relying on colour alone', () => {
    const html = render();
    expect(html).toContain('role="img" aria-label="Estimated recovery: 38 percent of the recorded outstanding balance"');
    expect(html).toContain('Friendly reminder: 1 of 3 recorded cases');
    expect(html).toContain('Formal notice: 0 of 3 recorded cases');
    expect(html).toContain('Payment plan: 1 of 3 recorded cases');
    expect(html).toContain('Escalated: 1 of 3 recorded cases');
  });

  it.each([[145, 100], [-25, 0]])('bounds an out-of-range recovery percentage of %i to %i', (input, expected) => {
    const html = render({ forecast: { ...fixtures.forecast, recoveryPct: input } });
    expect(html).toContain(`aria-label="Estimated recovery: ${expected} percent of the recorded outstanding balance"`);
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('retains pending and broken promises as commitments, not collected revenue', () => {
    const html = render();
    expect(html).toContain('₦1,000.25');
    expect(html).toMatch(/datetime="2026-10-29"/i);
    expect(html).toMatch(/datetime="2026-10-30"/i);
    expect(html).toContain('broken');
    expect(html).toContain('pending');
    expect(html).toContain('Recorded commitments, not confirmed payments');
    expect(html).toContain('not proof of delivery');
  });

  it('keeps scores and forecasts honest decision support rather than provider-backed AI or guarantees', () => {
    const html = render();
    expect(html).toMatch(/rules-based/i);
    expect(html).toMatch(/risk-weighted/i);
    expect(html).toMatch(/not (?:a |an )?(?:guarantee|payment prediction)|not guaranteed/i);
    expect(html).not.toMatch(/AI-scored|AI forecast|animate-ping|>\s*live\s*</i);
    expect(view()).not.toMatch(/<KpiCard[^>]*\bdelta=/);
  });

  it('never dispatches finance mutations while rendering either manager or read-only access', () => {
    render();
    const html = render({ canMutate: false });
    expect(html).toMatch(/Read-only access/i);
    expect(sendReminder).not.toHaveBeenCalled();
    expect(advanceDunning).not.toHaveBeenCalled();
    expect(recordPromise).not.toHaveBeenCalled();
    const page = read('src/app/(ops)/(estate)/collections/page.tsx');
    expect(page).toContain("requireCapability('charges_invoicing', 'read', 'estate')");
    expect(page).toContain('repos.collectionCases.list(actor)');
    expect(page).toContain("can(actor, 'charges_invoicing', 'update').allowed");
    expect(page).toContain('canMutate=');
    expect(view()).not.toMatch(/from ['"]@\/server\/(?:data|session)['"]/);
  });

  it('does not claim that recording a reminder log sends a message or applies a penalty', () => {
    const html = render();
    expect(html).toMatch(/not (?:connected|configured)|not send|does not send|no messages/i);
    expect(html).not.toMatch(/Reminder sent|Reminders queued|SMS and email/i);
    expect(view()).toContain('sendReminder(');
    expect(view()).toContain('advanceDunning(');
  });

  it('uses accessible native case and confirmation dialogs and guards dismissal while pending', () => {
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
    expect(view()).toContain('if (!canMutate || pending || !followUp || !confirmationCase) return;');
    expect(view()).toContain("if (type === 'advance' && c.stage === 'escalated') return;");
    expect(view()).toMatch(/canMutate && promiseFor && <CollectionPromiseDialog/);
    expect(view()).toMatch(/canMutate && followUp && confirmationCase && <PortalDialog/);
  });

  it('places error feedback inside an active dialog rather than only behind its inert backdrop', () => {
    const source = view();
    expect(source).toContain('message && !followUp && !promiseFor && <CollectionFeedback');
    expect(source).toContain('message && <CollectionFeedback');
    expect(source).toContain('message && !selected && !followUp && !promiseFor && <CollectionFeedback floating');
    expect(source).toContain('aria-label="Dismiss collection notification"');
    expect(source).toMatch(/catch\s*\{\s*setMessage\('Unable to update this collection case\. Please try again\.'/);
  });

  it('keeps the promise-to-pay form labelled, exact to kobo and distinct from a received payment', () => {
    const html = renderToStaticMarkup(createElement(CollectionPromiseDialog, { c: cases[0], onClose: vi.fn(), onDone: vi.fn() }));
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="Promise to pay"');
    expect(html).toContain('<form');
    expect(html).toMatch(/<label for="[^"]+-amount">Promised amount/);
    const amountInput = html.match(/<input[^>]*name="amount"[^>]*>/)?.[0];
    for (const attribute of ['type="number"', 'inputMode="decimal"', 'min="0.01"', 'step="0.01"', 'required=""']) expect(amountInput).toContain(attribute);
    expect(html).toContain('value="2500.25"');
    expect(html).toMatch(/<label for="[^"]+-due">Promised payment date/);
    const dateInput = html.match(/<input[^>]*name="due"[^>]*>/)?.[0];
    expect(dateInput).toContain('type="date"');
    expect(dateInput).toContain('value=""');
    expect(html).toContain('not a received payment');
    expect(html).toContain('aria-label="Close promise to pay"');
    const source = read('src/components/estate/collection-promise-dialog.tsx');
    expect(source).toContain('event.preventDefault()');
    expect(source).toContain('if (pending) return');
    expect(source).toContain('canClose={!pending}');
    expect(source).toContain('recordPromise(c.id, amountMajor, due)');
    expect(source).toContain('Number.isFinite(amountMajor)');
    expect(source).toContain('role="alert"');
    expect(source).not.toContain('2026-08-05');
    expect(recordPromise).not.toHaveBeenCalled();
  });

  it('uses responsive 24px and 16px rhythm with themed readable panels and financial records', () => {
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
