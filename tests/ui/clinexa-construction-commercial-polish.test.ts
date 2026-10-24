import { createElement, type ComponentProps, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BoqWorkspace } from '@/components/construction/boq-workspace';
import { ProcurementWorkspace } from '@/components/construction/procurement-workspace';
import { MaterialsWorkspace } from '@/components/construction/materials-workspace';
import { StockWorkspace } from '@/components/construction/stock-workspace';
import { FxWorkspace } from '@/components/construction/fx-workspace';
import { EvmCockpit, type EvmView } from '@/components/construction/evm-cockpit';
import { ApprovalsWorkspace, type ReqView } from '@/components/construction/approvals-workspace';
import { parseBoq, boqReconciliation, countVariance, fxPositions, fxSensitivity, type FxExposureRow } from '@/domain/construction';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/construction', () => ({ importBoq: vi.fn(), approvePurchaseRequest: vi.fn(), approvePurchaseOrder: vi.fn(), awardRfq: vi.fn(), receiveDelivery: vi.fn(), issueMaterials: vi.fn(), transferStock: vi.fn(), returnStock: vi.fn(), recordStockCount: vi.fn(), reconcileStockCount: vi.fn(), updateFxRate: vi.fn(), decideApproval: vi.fn(), delegateApproval: vi.fn() }));

const draw = <Props extends object>(component: ComponentType<Props>, props: Props) => renderToStaticMarkup(createElement(component, props));
const source = (name: string) => readFileSync(resolve(process.cwd(), `src/components/construction/${name}.tsx`), 'utf8');
const css = () => readFileSync(resolve(process.cwd(), 'src/components/construction/construction-commercial-polish.module.css'), 'utf8');
const procurement: ComponentProps<typeof ProcurementWorkspace> = {
  requests: [{ id: 'request-1', ref: 'PR-LAG-101', item: 'Cement for next slab pour', qty: 100, unit: 'bags', costCode: 'LAG-STR', estimateMinor: 100000025, requiredISO: '2026-08-01', requestedBy: 'Ada Okafor', status: 'pending', justification: 'Approved slab sequence requires delivery before reinforcement inspection.', exception: true, remainingMinor: 75000025 }],
  rfqs: [{ id: 'rfq-1', ref: 'RFQ-LAG-101', item: 'Cement for next slab pour', qty: 100, unit: 'bags', status: 'open', bids: [{ vendorId: 'vendor-1', vendorName: 'Lagos Materials', priceMinor: 100000025, leadDays: 2, warrantyMonths: 12, compliancePct: 95, score: 86, priceScore: 90, leadScore: 80, warrantyScore: 70, complianceScore: 95, recommended: true, vendorBand: 'success', suspended: false }] }],
  orders: [{ id: 'order-1', ref: 'PO-LAG-101', item: 'Steel reinforcement', vendorName: 'Lagos Materials', qty: 10, deliveredQty: 3, unit: 'tonnes', valueMinor: 150000025, status: 'part_delivered', expectedISO: '2026-07-25', late: true }],
  kpis: { pending: 1, openPoMinor: 150000025, lateDeliveries: 1, exceptions: 1 }, canMutate: false,
};
const materials: ComponentProps<typeof MaterialsWorkspace> = {
  materials: [{ id: 'material-1', sku: 'CEM-42', name: 'Cement 42.5N', category: 'Cement', unit: 'bags', onHand: 3, reserved: 1, inTransit: 10, reorderLevel: 5, unitCostMinor: 500025, belowReorder: true, daysCover: 2, band: 'danger', receivedQty: 20, issuedQty: 15, leakageQty: 2, leakagePct: 10, anomalous: true, leakageValueMinor: 1000050 }],
  trail: [{ id: 'approved', label: 'Approved budget', minor: 100000025, tone: 'info' }, { id: 'actual', label: 'Booked cost', minor: 25000025, tone: 'progress' }],
  movements: [{ id: 'movement-1', materialName: 'Cement 42.5N', kind: 'receipt', qty: 20, unit: 'bags', atISO: '2026-07-26T09:30:00Z', ref: 'GR-LAG-101', by: 'Chidi Obi' }],
  projectName: 'Lekki House', projectId: 'project-1', kpis: { stockValueMinor: 1500075, belowReorder: 1, leakageValueMinor: 1000050, anomalies: 1 }, canMutate: false,
};
const stock: ComponentProps<typeof StockWorkspace> = {
  lines: [{ materialId: 'material-1', name: 'Cement 42.5N', sku: 'CEM-42', unit: 'bags', warehouseId: 'store-1', warehouseName: 'Lekki main store', onHand: 3, reserved: 1, unitCostMinor: 500025 }],
  warehouses: [{ id: 'store-1', name: 'Lekki main store' }, { id: 'store-2', name: 'Site cabin store' }],
  counts: [{ id: 'count-1', ref: 'SC-OPEN', materialName: 'Cement 42.5N', unit: 'bags', warehouseName: 'Lekki main store', systemQty: 5, countedQty: 3, countedBy: 'Chidi Obi', countedISO: '2026-07-26T09:30:00Z', status: 'open' }, { id: 'count-2', ref: 'SC-RECONCILED', materialName: 'Steel reinforcement', unit: 'tonnes', warehouseName: 'Site cabin store', systemQty: 7, countedQty: 6, countedBy: 'Ada Okafor', countedISO: '2026-07-25T10:00:00Z', status: 'reconciled', reasonLabel: 'Damaged during handling', note: 'Count verified against delivery log; store supervisor signed.' }],
  ledger: [{ id: 'ledger-1', kind: 'receipt', materialName: 'Cement 42.5N', qty: 3, unit: 'bags', atISO: '2026-07-26T09:30:00Z', by: 'Chidi Obi', ref: 'GR-LAG-101', runningQty: 3 }], adjustReasons: [{ id: 'reason-1', label: 'Damage', requiresNote: true }], returnReasons: [{ id: 'reason-2', label: 'Unused', requiresNote: true }], kpis: { valueMinor: 1500075, openCounts: 1, varianceQty: 2, movements: 1 }, canMutate: false, canCreate: false,
};
const fxRows: FxExposureRow[] = [{ id: 'usd-1', ref: 'PO-USD-1', item: 'Imported passenger lift', vendorName: 'Lift supplier', projectId: 'project-1', currency: 'USD', foreignMinor: 246913578, bookedRate: 1500.125, spotRate: 1600.125, outstandingFraction: .5, outstandingForeignMinor: 123456789, bookedMinor: 185200615599, spotMinor: 197546294499, unrealizedMinor: 12345678900, tone: 'danger' }, { id: 'ghs-1', ref: 'PO-GHS-1', item: 'Ghanaian timber', vendorName: 'Accra timber', projectId: 'project-1', currency: 'GHS', foreignMinor: 7654321, bookedRate: 100, spotRate: 110, outstandingFraction: 1, outstandingForeignMinor: 7654321, bookedMinor: 765432100, spotMinor: 841975310, unrealizedMinor: 76543210, tone: 'warn' }];
const fx: ComponentProps<typeof FxWorkspace> = { rows: fxRows, positions: fxPositions(fxRows), rates: [{ currency: 'USD', rate: 1600.125, priorRate: 1500.125, movementPct: 6.7, asOfISO: '2026-07-26T09:30:00Z', hasExposure: true }], table: { USD: { currency: 'USD', rate: 1600.125, asOfISO: '2026-07-26T09:30:00Z' }, GHS: { currency: 'GHS', rate: 110, asOfISO: '2026-07-26' } }, unrealizedMinor: 12422222110, spotExposureMinor: 198388269809, canMutate: false };
const evm: EvmView = { projectId: 'project-1', name: 'Lekki House', code: 'LAG-1', bac: 100000025, pv: 60000025, ev: 40000025, ac: 45000025, cv: -5000000, sv: -20000000, cpi: .89, spi: .67, eac: 112359579, etc: 67359554, vac: -12359554, tcpi: 1.1, costBand: 'warn', scheduleBand: 'danger', curve: [{ label: 'Jul 2026', pv: 60000025, ev: 40000025, ac: 45000025, forecast: 45000025 }, { label: 'Aug 2026', pv: 100000025, ev: 0, ac: 0, forecast: 112359579 }], nowFrac: 0, cashByMonth: [{ label: 'Aug 2026', minor: 25000025 }], codes: [{ code: 'LAG-STR', name: 'Structure', budget: 100000025, committed: 60000025, actual: 45000025, earnedPercent: 40, plannedPercent: 60, variance: 40000000 }], forecastFinishISO: '2027-06-15', slipDays: 14, plannedFinishISO: '2027-06-01' };
const request: ReqView = { id: 'approval-1', ref: 'APR-LAG-101', subject: 'purchase_request', subjectRef: 'PR-LAG-101', title: 'Review concrete order', amountMinor: 100000025, raisedBy: 'Chidi Obi', raisedISO: '2026-07-26T09:30:00Z', status: 'in_flight', ruleName: 'Major purchase threshold', steps: [{ order: 10, role: 'executive', label: 'Executive review', slaHours: 48, status: 'pending', overdue: false }, { order: 2, role: 'qs', label: 'QS review', slaHours: 24, status: 'pending', overdue: true }, { order: 1, role: 'site_manager', label: 'Site review', slaHours: 4, status: 'approved', actedBy: 'Ada Okafor', actedISO: '2026-07-26T10:00:00Z', comment: 'Quantity checked against approved slab drawing.', delegatedTo: 'Bola Adeyemi', overdue: false }], progressPct: 33, note: 'Original supplier quote attached in source file.', mine: false, blockedReason: 'Current step requires the assigned QS role.', overdue: true };
const approvals: ComponentProps<typeof ApprovalsWorkspace> = { requests: [request], rules: [{ id: 'rule-1', name: 'Major purchase threshold', subject: 'purchase_request', thresholdMinor: 100000025, steps: request.steps.map(({ order, label, role, slaHours }) => ({ order, label, role, slaHours })) }], reasons: [{ id: 'reason-1', label: 'Scope mismatch', requiresNote: true }], kpis: { inbox: 0, inFlight: 1, overdue: 1, valueMinor: 100000025 }, canMutate: false };

describe('Construction commercial Clinexa composition', () => {
  it.each([
    ['BOQ', 2, () => draw(BoqWorkspace, { projects: [{ id: 'project-1', name: 'Lekki House', code: 'LAG-1', approvedBudgetMinor: 100000025, existingCodes: ['LAG-STR'] }], canMutate: false })],
    ['procurement', 4, () => draw(ProcurementWorkspace, procurement)],
    ['materials', 3, () => draw(MaterialsWorkspace, materials)],
    ['stock', 4, () => draw(StockWorkspace, stock)],
    ['FX', 3, () => draw(FxWorkspace, fx)],
    ['earned value', 3, () => draw(EvmCockpit, { views: [evm] })],
    ['approvals', 4, () => draw(ApprovalsWorkspace, approvals)],
  ] as const)('keeps all %s tabs mounted (%i)', (_page, count, render) => {
    const html = render();
    expect(html.match(/role="tabpanel"/g)).toHaveLength(count);
    expect(html.match(/hidden=""/g)).toHaveLength(count - 1);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('Recorded snapshot');
    expect(html).toContain('WAT');
  });

  it('retains validated BOQ parsing, exact budget reconciliation and reviewed import contract', () => {
    const parsed = parseBoq('Code\tDescription\tCategory\tAmount\nLAG-STR\tStructure\tStructure\t1,000,000.25', ['LAG-STR']);
    expect(parsed.totalMinor).toBe(100000025);
    expect(boqReconciliation(parsed.totalMinor, 100000000).deltaMinor).toBe(25);
    const view = source('boq-workspace');
    for (const text of ['parseBoq(text, project?.existingCodes ?? [])', 'boqReconciliation(parsed.totalMinor, project?.approvedBudgetMinor ?? 0)', 'if (!canMutate || pending || errors.length', 'importBoq(projectId, parsed.rows.map', 'useConstructionReview', 'scope="row"', 'htmlFor={`${fieldId}-rows`}', 'Sample rows are illustrative', 'Nothing has been imported.']) expect(view).toContain(text);
    expect(view).not.toContain('max-h-[220px]');
  });

  it('reveals full procurement justification, exact costs, dates, scores and partial deliveries', () => {
    const html = draw(ProcurementWorkspace, procurement);
    for (const text of ['PR-LAG-101', 'RFQ-LAG-101', 'PO-LAG-101', procurement.requests[0].justification, '₦1,000,000.25', '₦750,000.25', '1 Aug 2026', '25 Jul 2026', 'Recorded compliance', '95%', '12 months', '90 / 100', '80 / 100', '70 / 100', '95 / 100', '3/10', '7 tonnes', 'deterministic rule scores']) expect(html).toContain(text);
    expect(html).not.toContain('>Award</button>');
    expect(html).not.toContain('>Receive</button>');
    expect(html).not.toContain('> Approve</button>');
  });

  it('retains award/receipt authority and displays a meaningful empty-bid state', () => {
    const html = draw(ProcurementWorkspace, { ...procurement, canMutate: true });
    expect(html).toContain('>Award</button>');
    expect(html).toContain('>Receive</button>');
    expect(source('procurement-workspace')).toContain('canMutate && rfq.status !== \'awarded\' && !b.suspended');
    expect(source('procurement-workspace')).toContain('awardRfq(rfq.id, b.vendorId)');
    expect(source('procurement-workspace')).toContain('receiveDelivery(order.id, Number(qty))');
    expect(draw(ProcurementWorkspace, { ...procurement, rfqs: [{ ...procurement.rfqs[0], bids: [] }] })).toContain('No bids recorded');
  });

  it('offers the correct purchase-order step without receiving drafts, cancelled or terminal orders', () => {
    const base = procurement.orders[0];
    const html = draw(ProcurementWorkspace, { ...procurement, canMutate: true, orders: [
      { ...base, id: 'draft-order', status: 'draft' }, { ...base, id: 'approved-order', status: 'approved' },
      { ...base, id: 'cancelled-order', status: 'cancelled' }, { ...base, id: 'closed-order', status: 'closed' },
    ] });
    expect(html).toContain('Approve order'); expect(html).toContain('Issue order');
    expect(html).not.toContain('>Receive</button>');
  });

  it('shows material units, reserved quantities, exact unit costs and complete WAT movements', () => {
    const html = draw(MaterialsWorkspace, materials);
    for (const text of ['Cement 42.5N', 'CEM-42', '₦5,000.25', 'Reorder at 5 bags', '1 reserved', '10:30', '26 Jul 2026', 'GR-LAG-101', 'Chidi Obi', '₦1,000,000.25', '₦250,000.25', '25% of approved budget']) expect(html).toContain(text);
    expect(html).toContain('not an accusation');
    expect(html).toContain('not verified bank settlement');
    expect(html).not.toContain('> Issue</button>');
    expect(source('materials-workspace')).not.toContain('max-h-[320px]');
    expect(source('materials-workspace')).toContain('issueMaterials(material.id, Number(qty), receivingProject)');
    expect(source('materials-workspace')).toContain('aria-label="Receiving project"');
  });

  it('keeps both open and non-open count evidence, and a semantic complete stock ledger', () => {
    const html = draw(StockWorkspace, stock);
    for (const text of ['SC-OPEN', 'SC-RECONCILED', 'Damaged during handling', stock.counts[1].note!, '₦15,000.75', '₦5,000.25', '10:30', '26 Jul 2026', 'GR-LAG-101', 'Recorded count history', 'Running balance']) expect(html).toContain(text);
    expect(html).toContain('aria-label="Recorded stock count history, horizontally scrollable"');
    expect(html).toContain('aria-label="Stock movement ledger"');
    expect(html).toContain('scope="row"');
    expect(source('stock-workspace')).not.toContain('atISO.slice');
    expect(countVariance(5, 3).deltaQty).toBe(-2);
  });

  it('keeps stock count creation independent of transfer/reconciliation update grants', () => {
    const html = draw(StockWorkspace, { ...stock, canCreate: true });
    expect(html).toContain('aria-label="Physical count of Cement 42.5N"');
    expect(html).not.toContain('aria-label="Transfer Cement');
    expect(html).not.toContain('>Reconcile</button>');
    const view = source('stock-workspace');
    for (const text of ['transferStock(line.materialId, line.warehouseId, to, Number(qty))', 'returnStock(line.materialId, line.warehouseId, Number(qty), codeId, note)', 'recordStockCount(line.materialId, line.warehouseId, Number(counted))', 'reconcileStockCount(count.id, codeId, note)', 'code?.requiresNote && !note.trim()']) expect(view).toContain(text);
  });

  it('renders signed stock adjustments and transfer quantities without a false outgoing sign', () => {
    const html = draw(StockWorkspace, { ...stock, ledger: [
      { ...stock.ledger[0], id: 'negative-count', kind: 'adjust', qty: -5, runningQty: 5 },
      { ...stock.ledger[0], id: 'positive-count', kind: 'adjust', qty: 2, runningQty: 7 },
      { ...stock.ledger[0], id: 'store-transfer', kind: 'transfer', qty: 3, runningQty: 7 },
    ] });
    expect(html).toContain('−5'); expect(html).toContain('+2');
    expect(html).not.toContain('−-5'); expect(html).not.toContain('−3');
    expect(html).toContain('transfers conserve the total');
  });

  it('displays full native FX balances without compacting or mixing foreign units', () => {
    const html = draw(FxWorkspace, fx);
    for (const text of ['USD', 'GHS', '1,234,567.89', '2,469,135.78', '76,543.21', '₦1,600.125', '26 Jul 2026', '10:30', 'Reporting lens: ', 'Native currency commitments remain separate', 'illustrative reporting conversion', 'not a live market quote']) expect(html).toContain(text);
    expect(html).not.toContain('$1.2m');
    expect(html).not.toContain('GH₵77k');
    expect(html).toContain('aria-label="Foreign currency commitments · scroll horizontally"');
    expect(html.match(/scope="col"/g)).toHaveLength(8);
    expect(html).not.toContain('> Reprice</button>');
    expect(source('fx-workspace')).toContain("convertMinor(ngnMinor, 'NGN', display, table)");
    expect(source('fx-workspace')).not.toContain('import { fmtForeign');
  });

  it('keeps FX sensitivity linear and reporting rates explicit without executing a trade', () => {
    expect(fxSensitivity(fxRows, 10)).toBe(Math.round(fx.spotExposureMinor * .1));
    const view = source('fx-workspace');
    for (const text of ['fxSensitivity(rows, shock)', 'No rate or commitment is changed.', 'updateFxRate(row.currency, next)', 'disabled={c !== \'NGN\' && !table[c]}', 'htmlFor={shockId}', 'aria-valuetext=', 'minimumFractionDigits: 2']) expect(view).toContain(text);
  });

  it('keeps EVM assumptions and financial calculations while exposing exact curve values', () => {
    const html = draw(EvmCockpit, { views: [evm] });
    for (const text of ['₦1,000,000.25', '₦1,123,595.79', '₦673,595.54', '15 Jun 2027', '1 Jun 2027', '60% planned', 'View exact illustrative curve values', 'Supplied forecast', 'retains its baseline forecast series', 'not historical transactions', '₦250,000.25']) expect(html).toContain(text);
    expect(html).toContain('aria-label="Illustrative earned-value curve values, horizontally scrollable"');
    const view = source('evm-cockpit');
    for (const text of ["method === 'cpi' ? v.eac : v.ac + (v.bac - v.ev)", 'const vac = v.bac - eac', 'const etc = Math.max(0, eac - v.ac)', 'v.tcpi.toFixed(2)']) expect(view).toContain(text);
    expect(draw(EvmCockpit, { views: [{ ...evm, curve: [] }] })).toContain('No illustrative curve points');
  });

  it('shows complete approval step evidence, roles, timestamps, comments and numeric step order', () => {
    const html = draw(ApprovalsWorkspace, approvals);
    for (const text of ['APR-LAG-101', 'PR-LAG-101', '₦1,000,000.25', 'Raised at', '26 Jul 2026', '10:30', '11:00', 'Ada Okafor', 'Bola Adeyemi', 'site_manager', '24 hours', 'Quantity checked against approved slab drawing.', 'Original supplier quote attached in source file.', 'does not verify physical delivery']) expect(html).toContain(text);
    expect(html.indexOf('Step 1<')).toBeLessThan(html.indexOf('Step 2<'));
    expect(html.indexOf('Step 2<')).toBeLessThan(html.indexOf('Step 10<'));
    expect(html).not.toContain('> Approve</button>');
    const own = draw(ApprovalsWorkspace, { ...approvals, requests: [{ ...request, mine: true }], canMutate: true });
    expect(own).toContain('> Approve</button>');
  });

  it('preserves approval review, reason/note validation, delegation and local pending errors', () => {
    const view = source('approvals-workspace');
    for (const text of ["decideApproval(request.id, 'approved')", "decideApproval(req.id, 'rejected', comment, codeId)", 'delegateApproval(req.id, to)', 'code?.requiresNote && !comment.trim()', 'canMutate && request.status === \'in_flight\'', 'useConstructionReview', '{confirmation}']) expect(view).toContain(text);
    for (const file of ['procurement-workspace', 'materials-workspace', 'stock-workspace', 'fx-workspace', 'approvals-workspace']) {
      const page = source(file);
      for (const text of ['useConstructionSave', 'pending={pending}', 'disabled={pending}', 'role="alert"', 'htmlFor=', 'id={']) expect(page).toContain(text);
      expect(page).not.toContain('fixed inset-0');
      expect(page).not.toContain('aria-label="Close dialog"');
    }
  });

  it('defines opt-in readable inner patterns with 24/16px spacing and 40/44px controls', () => {
    for (const text of ['font-size:16px', 'font-size:14px', 'font-size:12px', 'gap:24px', 'gap:16px', 'padding:18px 16px', 'min-height:40px', 'min-height:44px', 'min-width:1200px', 'background:var(--surface-2)', '@media(max-width:640px)', '@media(pointer:coarse)']) expect(css()).toContain(text);
    for (const file of ['boq-workspace', 'procurement-workspace', 'materials-workspace', 'stock-workspace', 'fx-workspace', 'evm-cockpit', 'approvals-workspace']) expect(source(file)).toContain('construction-commercial-polish.module.css');
  });
});
