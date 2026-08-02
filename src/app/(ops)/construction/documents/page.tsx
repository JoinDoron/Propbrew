import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { NOW_MS } from '@/domain/ppm';
import { docRegister, rfiAgeing } from '@/domain/construction';
import { DocumentsWorkspace, type RegisterRow, type RfiRow, type DocRev } from '@/components/construction/documents-workspace';

/** Documents & RFIs — a controlled register with real revision control (PRD §12):
 *  revisions chain per document number, exactly one approved "current issue",
 *  approved revisions are superseded rather than overwritten, and every formal
 *  distribution is recorded as a transmittal. RFIs age against their due date. */
export default async function ConstructionDocumentsPage() {
  const { actor } = await requireCapability('reports_analytics');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const world = constructionWorld(actor);

  const register: RegisterRow[] = docRegister(world.docs).map((r) => ({
    number: r.number, title: r.title, discipline: r.discipline, folder: r.folder,
    currentRevision: r.current?.revision ?? null, currentId: r.current?.id ?? null, inReview: r.inReview,
    revisions: r.revisions.map((d): DocRev => ({
      id: d.id, revision: d.revision, status: d.status, effectiveISO: d.effectiveISO,
      changeNote: d.changeNote, uploadedBy: d.uploadedBy, approvedBy: d.approvedBy, approvedISO: d.approvedISO,
      transmittals: world.transmittals.filter((t) => t.docId === d.id).map((t) => ({ toParty: t.toParty, sentISO: t.sentISO, purpose: t.purpose, acknowledged: !!t.acknowledgedISO })),
    })),
  }));

  const rfis: RfiRow[] = world.rfis
    .map((r) => { const a = rfiAgeing(r, NOW_MS); return { id: r.id, ref: r.ref, question: r.question, discipline: r.discipline, drawingRef: r.drawingRef, raisedBy: r.raisedBy, assignedTo: r.assignedTo, raisedISO: r.raisedISO, dueISO: r.dueISO, status: r.status, answer: r.answer, ...a }; })
    .sort((a, b) => b.overdueDays - a.overdueDays || Date.parse(a.dueISO) - Date.parse(b.dueISO));

  const allRevs = register.flatMap((r) => r.revisions);

  return (
    <div className="max-w-[1000px] mx-auto">
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
      />
    </div>
  );
}
