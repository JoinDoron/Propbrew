import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { scoreQuotes, budgetException, isOverdue, vendorBand } from '@/domain/construction';
import { ProcurementWorkspace, type RequestRow, type RfqRow, type OrderRow } from '@/components/construction/procurement-workspace';

const OPEN_PO = ['issued', 'acknowledged', 'part_delivered', 'approved'];

/** Procurement & Bid Intelligence — request → RFQ → weighted-scored award → PO →
 *  goods receipt. Bids are scored transparently (price/lead/compliance/warranty)
 *  with a recommendation a human must accept; awarding issues a real PO and
 *  commits budget, and receiving books both stock and actual cost. */
export default async function ConstructionProcurementPage() {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
  const world = constructionWorld(actor);
  const vendors = repos.constructionVendors.list(actor).items;

  const requests: RequestRow[] = world.requests.map((r) => {
    const be = budgetException(r, world.costCodes);
    return { id: r.id, ref: r.ref, item: r.item, qty: r.qty, unit: r.unit, costCode: r.costCode, estimateMinor: r.estimate.minor, requiredISO: r.requiredISO, requestedBy: r.requestedBy, status: r.status, justification: r.justification, exception: be.exception, remainingMinor: be.remainingMinor };
  });

  const rfqs: RfqRow[] = repos.constructionRfqs.list(actor).items.map((rfq) => ({
    id: rfq.id, ref: rfq.ref, item: rfq.item, qty: rfq.qty, unit: rfq.unit, status: rfq.status, awardedVendorId: rfq.awardedVendorId,
    bids: scoreQuotes(rfq.quotes).map((s) => {
      const v = vendors.find((x) => x.id === s.quote.vendorId);
      return {
        vendorId: s.quote.vendorId, vendorName: s.quote.vendorName, priceMinor: s.quote.price.minor,
        leadDays: s.quote.leadDays, warrantyMonths: s.quote.warrantyMonths, compliancePct: s.quote.compliancePct,
        score: s.score, priceScore: s.priceScore, leadScore: s.leadScore, warrantyScore: s.warrantyScore, complianceScore: s.complianceScore,
        recommended: s.recommended,
        vendorBand: v ? vendorBand(v, NOW_MS) : 'muted', suspended: !!v?.suspended,
      };
    }),
  }));

  const orders: OrderRow[] = world.pos.map((o) => ({
    id: o.id, ref: o.ref, item: o.item, vendorName: o.vendorName, qty: o.qty, deliveredQty: o.deliveredQty,
    unit: o.unit, valueMinor: o.value.minor, status: o.status, expectedISO: o.expectedISO,
    late: OPEN_PO.includes(o.status) && o.deliveredQty < o.qty && isOverdue(o.expectedISO, NOW_MS),
  })).sort((a, b) => Number(b.late) - Number(a.late) || Date.parse(a.expectedISO) - Date.parse(b.expectedISO));

  return (
    <div className="pb-page">
      <ProcurementWorkspace
        requests={requests}
        rfqs={rfqs}
        orders={orders}
        kpis={{
          pending: requests.filter((r) => r.status === 'pending' || r.status === 'draft').length,
          openPoMinor: world.pos.filter((o) => OPEN_PO.includes(o.status)).reduce((n, o) => n + o.value.minor, 0),
          lateDeliveries: orders.filter((o) => o.late).length,
          exceptions: requests.filter((r) => r.exception).length,
        }}
        canMutate={canMutate}
      />
    </div>
  );
}
