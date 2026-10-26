import { beforeEach, describe, expect, it, vi } from 'vitest';
import { identityByKey } from '@/server/identities';
import { financeControl } from '@/server/finance-control';
import * as finance from '@/server/actions/finance-control';

const session = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: session.actor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/clock', () => ({ nowISO: () => '2026-10-26T12:00:00.000Z' }));
vi.mock('@/server/audit', () => ({ durableAudit: vi.fn() }));

const manager = () => structuredClone(identityByKey('estate_manager').actor);
beforeEach(() => session.actor.mockResolvedValue(manager()));

describe('Finance command centre operating controls', () => {
  it('separates payable approval, bank payment evidence and WHT issuance', async () => {
    const created = await finance.createFinancePayable({ module: 'facility', counterparty: 'Lagos Lift Services Ltd', description: 'Quarterly lift service', sourceRef: `FAC-${Date.now()}`, invoiceDateISO: '2026-10-01', dueDateISO: '2026-10-31', grossNaira: 1_000_000, whtPct: 5 });
    expect(created.ok).toBe(true); if (!created.ok) return;
    const row = financeControl(manager().tenantId!).payables.find((item) => item.id === created.id)!;
    expect(row.status).toBe('pending_approval'); expect(row.netPayableMinor).toBe(95_000_000);
    expect((await finance.markFinancePayablePaid(row.id, 'BANK-001')).ok).toBe(false);
    expect((await finance.decideFinancePayable(row.id, 'approved')).ok).toBe(true);
    expect((await finance.markFinancePayablePaid(row.id, 'BANK-001')).ok).toBe(true);
    expect((await finance.issueWhtCertificate('finance_payable', row.id, '2026-10-01')).ok).toBe(true);
    expect(financeControl(manager().tenantId!).whtCertificates.find((item) => item.sourceId === row.id)?.amountMinor).toBe(5_000_000);
  });
});
