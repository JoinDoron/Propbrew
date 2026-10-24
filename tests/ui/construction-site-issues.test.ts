import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ConstructionSitePage from '@/app/(ops)/construction/site/page';
import { db } from '@/server/data/store';
import { identityByKey, SEED } from '@/server/identities';
import type { TenantId } from '@/domain/ids';

const guard = vi.hoisted(() => vi.fn());
vi.mock('@/server/guard', () => ({ requireCapability: guard }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const baseline = structuredClone(db.constructionIssues);
beforeEach(() => { db.constructionIssues = structuredClone(baseline); guard.mockResolvedValue({ actor: identityByKey('estate_manager').actor }); });
afterEach(() => { db.constructionIssues = structuredClone(baseline); });

describe('Construction site capture discovery', () => {
  it('renders synced issue details from scoped records alongside the separate approved diary', async () => {
    const own = { ...structuredClone(db.constructionIssues[0]), id: 'is-synced-field-test', title: 'Captured on site: exposed cable in lower stairwell', owner: 'Adeola site supervisor', severity: 'high' as const, status: 'open' as const, raisedISO: '2026-10-24', dueISO: '2026-10-25', correctiveAction: 'Isolate the circuit and arrange a qualified electrician.' };
    db.constructionIssues.unshift(own, { ...own, id: 'is-foreign-field-test', tenantId: SEED.tenantB as TenantId, title: 'FOREIGN_ISSUE_MUST_NOT_RENDER' });
    const html = renderToStaticMarkup(await ConstructionSitePage());
    expect(guard).toHaveBeenCalledWith('reports_analytics', 'read', 'construction');
    for (const value of [own.id, own.title, own.owner, own.correctiveAction, '24 Oct 2026', '25 Oct 2026', 'Site issue register', 'Proposed corrective action', 'This register is read-only.', 'Approved diary', 'Approved records only']) expect(html).toContain(value);
    expect(html).not.toContain('FOREIGN_ISSUE_MUST_NOT_RENDER');
    const approved = db.constructionReports.find((report) => report.status === 'approved')!;
    expect(html).toContain(approved.officer);
    for (const item of approved.completed) expect(html).toContain(item.replaceAll('&', '&amp;'));
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
  });
});
