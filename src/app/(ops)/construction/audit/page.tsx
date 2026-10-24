import { requireCapability } from '@/server/guard';
import { constructionWorld } from '@/server/reads/construction';
import { auditSummary, sensitiveEntries, reasonPareto, type ReasonDomain } from '@/domain/construction';
import { AuditWorkspace, type AuditRow, type ParetoRow } from '@/components/construction/audit-workspace';
import { withDurableRead } from '@/server/data/durable-records';

const DOMAINS: ReasonDomain[] = ['delay', 'rejection', 'variance', 'stock_adjust', 'stock_return'];

/** Audit log — the append-only record of sensitive actions (PRD §18.3, SC-10),
 *  paired with a Pareto over the coded reasons. Together they answer both
 *  "who did what, when" and "what actually keeps going wrong". */
export default async function ConstructionAuditPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const world = constructionWorld(actor);

  const sensitiveIds = new Set(sensitiveEntries(world.audit).map((e) => e.id));
  const labelOf = (id?: string) => {
    const c = world.reasonCodes.find((x) => x.id === id);
    return c ? `${c.code} — ${c.label}` : undefined;
  };

  const entries: AuditRow[] = [...world.audit]
    .sort((a, b) => b.seq - a.seq)
    .map((e) => ({
      id: e.id, seq: e.seq, atISO: e.atISO, actorName: e.actorName, actorRole: e.actorRole,
      action: e.action, entity: e.entity, entityRef: e.entityRef, summary: e.summary,
      amountMinor: e.amountMinor, before: e.before, after: e.after,
      reasonLabel: labelOf(e.reasonCodeId), note: e.note, sensitive: sensitiveIds.has(e.id),
    }));

  const pareto: Record<string, ParetoRow[]> = {};
  for (const d of DOMAINS) {
    pareto[d] = reasonPareto(world.reasonEvents, world.reasonCodes, d).map((r) => ({
      code: r.code.code, label: r.code.label, category: r.code.category,
      count: r.count, sharePct: r.sharePct, cumulativePct: r.cumulativePct,
      impactMinor: r.impactMinor, impactDays: r.impactDays, vital: r.vital,
    }));
  }

  return (
    <div className="pb-page">
      <AuditWorkspace entries={entries} pareto={pareto} domains={DOMAINS} summary={auditSummary(world.audit)} />
    </div>
  );
  });
}
