import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { NOW } from '@/domain/ppm';
import { DocumentsWorkspace } from '@/components/documents/documents-workspace';
import type { DocData } from '@/components/documents/types';

/** EM-08 — document management + AI-S-03 document intelligence. Semantic search
 *  over OCR-extracted fields, an expiry radar cross-linked to the compliance
 *  register, and a "view as resident" audience lens. Every read is estate/tenant
 *  scoped (§8.2); managing is Estate/Facility-Manager-gated. */
export default async function DocumentsPage() {
  const { actor } = await requireCapability('announcements', 'read', 'estate');
  const canMutate = can(actor, 'announcements', 'update').allowed;

  const data: DocData = {
    now: NOW,
    canMutate,
    scopeLabel: actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`,
    documents: [...repos.documents.list(actor).items],
  };

  return (
    <div className="pb-page">
      <DocumentsWorkspace {...data} />
    </div>
  );
}
