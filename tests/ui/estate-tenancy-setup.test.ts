import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TenancyWorkspace } from '@/components/estate/tenancy-workspace';
import { TenancySetupDialog } from '@/components/estate/tenancy-setup-dialog';
import type { TenancyRow } from '@/components/estate/tenancy-types';
import type { TenancyResidentOption } from '@/domain/estate/tenancy-setup';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/estate', () => ({ advanceTenancy: vi.fn(), settleDeposit: vi.fn() }));
vi.mock('@/server/actions/estate-tenancy-setup', () => ({ createEstateTenancyAgreement: vi.fn(), updateEstateTenancyAgreement: vi.fn() }));
const residents: TenancyResidentOption[] = [{ id: 'resident-a', name: 'Ada Okafor', unitId: 'unit-a', unitLabel: 'Unit 1', estateName: 'Palm Court' }];
const kpis = { active: 0, inMotion: 0, renewalsSoon: 0, depositExposureMinor: 0 };
function agreement(): TenancyRow {
  return { id: 'tenancy-a', residentName: 'Ada Okafor', unitLabel: 'Unit 1', stage: 'applied', applicationISO: '2026-10-26', moveInISO: '2026-11-01', leaseEndISO: '2027-10-31', rentMinor: 120000025, depositMinor: 0, depositStatus: 'pending',
    agreement: { tenantId: 'company-a', tenancyId: 'tenancy-a', residentId: 'resident-a', unitId: 'unit-a', estateId: 'estate-a', startDate: '2026-11-01', endDate: '2027-10-31', rentFrequency: 'monthly', agreementReference: 'AG-001', notes: 'Recorded terms', version: 2, createdAt: '2026-10-26T10:00:00Z', createdBy: 'owner-a', updatedAt: '2026-10-26T10:00:00Z', updatedBy: 'owner-a' } };
}
describe('tenancy agreement setup presentation', () => {
  it('offers creation to managers with actual resident options and keeps read-only accounts free of mutation controls', () => {
    const render = (canMutate: boolean) => renderToStaticMarkup(createElement(TenancyWorkspace, { tenancies: [], kpis, nowMs: Date.parse('2026-10-26T10:00:00Z'), canMutate, companyScope: 'company-a', residents }));
    expect(render(true)).toContain('Create agreement'); expect(render(false)).not.toContain('Create agreement');
  });
  it('guides an empty company to add residents before recording agreement parties', () => {
    const html = renderToStaticMarkup(createElement(TenancyWorkspace, { tenancies: [], kpis, nowMs: Date.parse('2026-10-26T10:00:00Z'), canMutate: true, companyScope: 'company-a', residents: [] }));
    expect(html).toContain('Add a tenant to a property unit'); expect(html).toContain('href="/people"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Create agreement/);
  });
  it('labels monthly rent accurately instead of presenting the cycle amount as annual rent', () => {
    const html = renderToStaticMarkup(createElement(TenancyWorkspace, { tenancies: [agreement()], kpis, nowMs: Date.parse('2026-10-26T10:00:00Z'), canMutate: true }));
    expect(html).toContain('Rent / cycle'); expect(html).toContain('Monthly'); expect(html).toContain('₦1,200,000.25'); expect(html).not.toContain('Annual rent');
  });
  it('renders an accessible creation form with clear record-only effects', () => {
    const html = renderToStaticMarkup(createElement(TenancySetupDialog, { companyScope: 'company-a', residents, onClose: vi.fn(), onDone: vi.fn() }));
    for (const label of ['Create tenancy agreement', 'Resident and unit', 'Lease start', 'Lease end', 'Rent per cycle (₦)', 'Rent cycle', 'Deposit agreed (₦)', 'Agreement reference (optional)', 'Agreed terms or notes (optional)']) expect(html).toContain(label);
    expect(html).toContain('Ada Okafor · Palm Court · Unit 1');
    expect(html).toContain('does not create a signed legal document'); expect(html).toContain('type="date"'); expect(html).toContain('inputMode="decimal"');
  });
  it('retains exact kobo amounts and binds edit parties to the original resident/unit', () => {
    const html = renderToStaticMarkup(createElement(TenancySetupDialog, { companyScope: 'company-a', residents, agreement: agreement(), onClose: vi.fn(), onDone: vi.fn() }));
    expect(html).toContain('Edit draft agreement'); expect(html).toContain('value="1200000.25"'); expect(html).toContain('value="0.00"'); expect(html).toContain('value="AG-001"');
    expect(html).toMatch(/<select[^>]*disabled=""/); expect(html).toContain('separately authorised amendment');
  });
});
