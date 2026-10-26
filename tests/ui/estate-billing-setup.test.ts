import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BillingWorkspace } from '@/components/billing/billing-workspace';
import { RecurringChargesPanel, type BillingSetupProps } from '@/components/billing/estate-billing-setup';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/billing', () => ({ sendReminderCampaign: vi.fn() }));
vi.mock('@/server/actions/estate-billing-setup', () => Object.fromEntries(['createEstateInvoice', 'createEstateRecurringCharge', 'generateDueEstateCharges', 'issueEstateInvoice', 'setEstateRecurringChargeEnabled', 'updateEstateRecurringCharge', 'updateEstateInvoiceDraft'].map((key) => [key, vi.fn()])));
const props: BillingSetupProps = { companyId: 'company-a', canMutate: true, residents: [], rules: [], today: '2026-03-31' };
describe('Estate operational billing setup presentation', () => {
  it('adds a recurring section and accessible invoice creation without dropping existing billing sections', () => {
    const html = renderToStaticMarkup(createElement(BillingWorkspace, { invoices: [], canMutate: true, setup: props }));
    for (const label of ['Overview', 'Invoices', 'Risk &amp; reminders', 'Recurring charges', 'Create invoice', 'Create recurring charge', 'Generate due drafts']) expect(html).toContain(label);
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toContain('No recurring charges yet'); expect(html).toContain('at most 24 drafts');
  });
  it('keeps creation, issue and schedule controls away from viewers', () => {
    const html = renderToStaticMarkup(createElement(BillingWorkspace, { invoices: [], canMutate: false, setup: { ...props, canMutate: false } }));
    expect(html).toContain('Recurring charges'); expect(html).not.toContain('Create invoice'); expect(html).not.toContain('Create recurring charge'); expect(html).not.toContain('Generate due drafts');
  });
  it('explains blocked resident bindings and overdue catch-up without implying payment collection', () => {
    const rule = { id: 'rule-a', tenantId: 'company-a', estateId: 'estate-a', residentId: 'r-a', unitId: 'u-a', ownerUserId: 'owner-a', description: 'Monthly levy', amountMinor: 1234567, currency: 'NGN' as const,
      frequency: 'monthly' as const, startDate: '2026-01-31', endDate: null, dueOffsetDays: 7, enabled: true, nextCycleIndex: 0, version: 1, createdBy: 'manager-a', createdAt: '2026-01-01', updatedAt: '2026-01-01', residentName: 'Resident unavailable', unitLabel: 'Unit unavailable', estateName: 'Lagos Court', needsReview: true, nextDate: '2026-01-31' };
    const html = renderToStaticMarkup(createElement(RecurringChargesPanel, { ...props, rules: [rule] }));
    expect(html).toContain('Resident review needed'); expect(html).toContain('Draft generation due'); expect(html).toContain('₦12,345.67');
    expect(html).toMatch(/disabled=""[^>]*aria-label="Edit recurring charge Monthly levy"|aria-label="Edit recurring charge Monthly levy"[^>]*disabled=""/);
    expect(html).toContain('No automatic penalties or payment collection');
  });
});
