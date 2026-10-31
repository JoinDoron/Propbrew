import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { operatingClock } from '@/server/operating-clock';
import { docRegister, rfiAgeing } from '@/domain/construction';
import { DocumentsWorkspace, type RegisterRow, type RfiRow, type DocRev } from '@/components/construction/documents-workspace';
import { withDurableRead } from '@/server/data/durable-records';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { constructionDrawingVisible } from '@/server/construction/drawings';
import { repos } from '@/server/data';

/** Documents & RFIs — a controlled register with real revision control (PRD §12):
 *  revisions chain per document number, exactly one approved "current issue",
 *  approved revisions are superseded rather than overwritten, and every formal
 *  distribution is recorded as a transmittal. RFIs age against their due date. */
export default async function ConstructionDocumentsPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  return withDurableRead(async () => {
  const { nowMs: NOW_MS } = operatingClock();
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
  const canCreate = can(actor, 'reports_analytics', 'create').allowed;
  const projects = repos.constructionProjects.list(actor, { limit: 1000 }).items;
  const docs = repos.constructionDocs.list(actor, { limit: 2000 }).items;
  const rfisForScope = repos.constructionRfis.list(actor, { limit: 2000 }).items;
  const transmittals = repos.constructionTransmittals.list(actor, { limit: 5000 }).items;
  const requestedProjectId = (await searchParams).projectId;
  const project = projects.find((item) => item.id === requestedProjectId) ?? projects[0];
  const projectId = project?.id ?? '';

  const register: RegisterRow[] = docRegister(docs.filter((doc) => doc.projectId === projectId && constructionDrawingVisible(actor, doc))).map((r) => ({
    number: r.number, title: r.title, discipline: r.discipline, folder: r.folder,
    currentRevision: r.current?.revision ?? null, currentId: r.current?.id ?? null, inReview: r.inReview,
    revisions: r.revisions.map((d): DocRev => ({
      id: d.id, revision: d.revision, status: d.status, effectiveISO: d.effectiveISO,
      changeNote: d.changeNote, uploadedBy: d.uploadedBy, approvedBy: d.approvedBy, approvedISO: d.approvedISO,
      fileName: d.fileName, fileUrl: d.fileId ? `/api/construction/drawings/${d.fileId}` : undefined, fileSizeBytes: d.fileSizeBytes, fileSha256: d.fileSha256,
      locationIds: d.locationIds ?? [], workPackageIds: d.workPackageIds ?? [], requiresFile: d.requiresFile,
      transmittals: transmittals.filter((t) => t.docId === d.id).map((t) => ({ toParty: t.toParty, sentISO: t.sentISO, purpose: t.purpose, acknowledged: !!t.acknowledgedISO })),
    })),
  }));

  const rfis: RfiRow[] = rfisForScope.filter((r) => r.projectId === projectId)
    .map((r) => { const a = rfiAgeing(r, NOW_MS); return { id: r.id, ref: r.ref, question: r.question, discipline: r.discipline, drawingRef: r.drawingRef, raisedBy: r.raisedBy, assignedTo: r.assignedTo, raisedISO: r.raisedISO, dueISO: r.dueISO, status: r.status, answer: r.answer, ...a }; })
    .sort((a, b) => b.overdueDays - a.overdueDays || Date.parse(a.dueISO) - Date.parse(b.dueISO));

  const allRevs = register.flatMap((r) => r.revisions);

  return (
    <div className="pb-page">
      <DocumentsWorkspace
        register={register}
        rfis={rfis}
        kpis={{
          documents: register.length,
          approved: register.filter((r) => r.currentRevision).length,
          inReview: allRevs.filter((d) => d.status === 'review' || d.status === 'draft').length,
          openRfis: rfis.filter((r) => r.status === 'open').length,
          overdueRfis: rfis.filter((r) => r.overdueDays > 0).length,
        }}
        canMutate={canMutate}
        canCreate={canCreate}
        companyId={actor.tenantId ?? ''}
        canUpload={nativeAuthEnabled() && process.env.DATA_SOURCE === 'postgres' && canCreate}
        projectId={projectId}
        projects={projects.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
        locations={(project?.mobilisation?.locations ?? []).map((item) => ({ id: item.id, name: item.name, kind: item.kind }))}
        workPackages={(project?.mobilisation?.workPackages ?? []).filter((item) => actor.constructionPackageIds === undefined || actor.constructionPackageIds.includes(item.id) || Boolean(item.costCode && actor.constructionPackageIds.includes(`${projectId}:${item.costCode}`))).map((item) => ({ id: item.id, code: item.code, name: item.name }))}
      />
    </div>
  );
  });
}
