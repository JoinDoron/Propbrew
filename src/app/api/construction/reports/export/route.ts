import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertCan } from '@/lib/authz';
import { requireCapability } from '@/server/guard';
import { db } from '@/server/data/store';
import { repos, scopedConstructionProjectGet } from '@/server/data';
import { withDurableMutation } from '@/server/data/durable-records';
import { operatingNowISO } from '@/server/operating-clock';
import { constructionDrawingVisible } from '@/server/construction/drawings';
import { reportHash, reportPdf, reportSpreadsheet, type ReportTable, type ReportProvenance } from '@/server/construction/report-export';

export const runtime = 'nodejs';
const inputSchema = z.object({ projectId: z.string().min(1).max(120), report: z.enum(['programme', 'documents', 'changes']), format: z.enum(['pdf', 'xlsx']) });
const iso = (value?: string) => value ?? '';
function allRows<T>(list: (options: { cursor?: string | null; limit: number }) => { items: readonly T[]; cursor: string | null }): T[] {
  const rows: T[] = []; let cursor: string | null = null;
  do { const page = list({ cursor, limit: 1000 }); rows.push(...page.items); cursor = page.cursor; if (rows.length > 50000) throw new Error('Report row limit exceeded.'); } while (cursor);
  return rows;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = inputSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!input.success) return new Response('Choose a project, report and format.', { status: 400 });
  try {
    const prepared = await withDurableMutation(async () => {
      const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
      assertCan(actor, 'reports_analytics', 'export');
      const project = scopedConstructionProjectGet(actor, input.data.projectId, 'read');
      if (!project) return null;
      let table: ReportTable;
      if (input.data.report === 'programme') {
        const tasks = allRows((options) => repos.constructionTasks.list(actor, options)).filter((row) => row.projectId === project.id);
        table = { title: 'Programme and task status', columns: ['Task ID', 'Task', 'Owner', 'Status', 'Planned start', 'Planned finish', 'Progress %', 'Dependencies'],
          rows: tasks.map((row) => [row.id, row.name, row.owner, row.status, row.plannedStartISO, row.plannedFinishISO, row.percentComplete, row.dependsOn.join(', ')]) };
      } else if (input.data.report === 'documents') {
        const docs = allRows((options) => repos.constructionDocs.list(actor, options)).filter((row) => row.projectId === project.id && constructionDrawingVisible(actor, row));
        const docIds = new Set(docs.map((row) => row.id));
        const distributions = allRows((options) => repos.constructionTransmittals.list(actor, options)).filter((row) => docIds.has(row.docId));
        table = { title: 'Document revisions and distribution', columns: ['Drawing', 'Revision', 'Status', 'PDF SHA-256', 'Issued to', 'Recipient email', 'Purpose', 'Issued at', 'Delivery', 'Delivered at', 'Acknowledged at', 'Acknowledged by'],
          rows: docs.flatMap((doc) => { const sent = distributions.filter((row) => row.docId === doc.id); return sent.length ? sent.map((row) => [doc.number, doc.revision, doc.status, doc.fileSha256, row.toParty, row.recipientEmail, row.purpose, row.sentISO, row.deliveryStatus ?? 'manual record', iso(row.deliveredISO), iso(row.acknowledgedISO), row.acknowledgedBy]) : [[doc.number, doc.revision, doc.status, doc.fileSha256, '', '', '', '', '', '', '', '']]; }) };
      } else {
        const changes = allRows((options) => repos.constructionVariations.list(actor, options)).filter((row) => row.projectId === project.id);
        table = { title: 'Change orders and budget impact', columns: ['Reference', 'Title', 'Status', 'Source', 'Package', 'Cost code', 'Proposed NGN', 'Approved budget delta NGN', 'Schedule days', 'Client decision', 'Posted at'],
          rows: changes.map((row) => [row.ref, row.title, row.status, row.changeOrder?.sourceRef, row.workPackageId, row.changeOrder?.costCode, (row.costImpact.minor / 100).toFixed(2), ((row.changeOrder?.assessment?.budgetDeltaMinor ?? 0) / 100).toFixed(2), row.changeOrder?.assessment?.scheduleDays ?? row.scheduleImpactDays, row.changeOrder?.clientDecision?.decision, iso(row.changeOrder?.posting?.postedAtISO)]) };
      }
      const generatedISO = operatingNowISO();
      const exportId = randomUUID();
      const meta: ReportProvenance = { company: actor.tenantId ?? '', project: `${project.code} · ${project.name}`, report: input.data.report,
        generatedISO, exportId, generatedBy: db.users.find((row) => row.id === actor.userId)?.name ?? actor.userId, sourceHash: reportHash(table) };
      db.constructionAudit.push({ tenantId: project.tenantId, id: `au-export-${exportId}`, seq: db.constructionAudit.length + 1, atISO: generatedISO,
        actorId: actor.userId, actorName: meta.generatedBy, actorRole: actor.roles[0] ?? 'unknown', action: 'record', entity: 'construction_report_export', entityRef: exportId,
        projectId: project.id, summary: `Exported ${input.data.report} as ${input.data.format}; ${table.rows.length} rows; SHA-256 ${meta.sourceHash}` });
      return { table, meta, projectCode: project.code };
    }, 'construction');
    if (!prepared) return new Response('Project unavailable.', { status: 404 });
    const bytes = input.data.format === 'pdf' ? await reportPdf(prepared.table, prepared.meta) : reportSpreadsheet(prepared.table, prepared.meta);
    const filename = `propbrew-${prepared.projectCode.replace(/[^a-z0-9_-]/gi, '-').slice(0, 40)}-${input.data.report}-${prepared.meta.exportId}.${input.data.format}`;
    return new Response(Buffer.from(bytes), { headers: {
      'Content-Type': input.data.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'X-Propbrew-Export-Id': prepared.meta.exportId, 'X-Propbrew-Source-Sha256': prepared.meta.sourceHash,
    } });
  } catch { return new Response('Report export unavailable for your current access.', { status: 403, headers: { 'Cache-Control': 'private, no-store' } }); }
}
