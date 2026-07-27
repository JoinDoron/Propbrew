'use server';

/**
 * Document intelligence actions (EM-08 / AI-S-03). Search is read-only and runs
 * over the actor's SCOPED documents (§8.2 — a manager can never search another
 * tenant's files). Field edits and uploads are gated on the documents capability
 * (Estate/Facility Manager manage; residents view).
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, ROLE_LABELS, type Actor } from '@/lib/authz';
import { repos } from '@/server/data';
import { db } from '@/server/data/store';
import { searchDocs, type DocHit } from '@/domain/documents';
import { NOW } from '@/domain/ppm';
import type { DocType, ExtractedField } from '@/domain/entities';
import type { Role } from '@/domain/enums';

export type SearchResult = { hits: DocHit[]; scopeLabel: string };
export type DocActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** AI-S-03 semantic search over the actor's scoped documents. */
export async function searchDocuments(query: string): Promise<SearchResult> {
  const actor = await getActor();
  const docs = repos.documents.list(actor).items;
  const scopeLabel = actor.allEstates ? 'all your estates' : `your ${actor.estateIds.length} estate(s)`;
  return { hits: searchDocs(docs, query), scopeLabel };
}

function gate(actor: Actor): DocActionResult | null {
  try {
    assertCan(actor, 'announcements', 'update');
    return null;
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You do not have permission to manage documents.' };
    throw e;
  }
}
const name = (a: Actor) => ROLE_LABELS[(a.roles as Role[])[0]] ?? a.userId;

/** Save AI-extracted fields after the manager reviews/edits them (AI-S-03 HITL). */
export async function saveDocumentFields(docId: string, fields: ExtractedField[]): Promise<DocActionResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;
  const doc = repos.documents.list(actor).items.find((d) => d.id === docId);
  if (!doc) return { ok: false, error: 'Document not found.' };
  const live = db.documents.find((d) => d.id === docId)!;
  live.extracted = fields;
  live.updatedAt = NOW;
  const exp = fields.find((f) => /expiry|end date/i.test(f.label))?.value;
  if (exp && /^\d{4}-\d{2}-\d{2}$/.test(exp)) live.expiryDate = exp;
  revalidatePath('/documents');
  return { ok: true };
}

let uploadCounter = 0;

/** Simulated upload — the caller has already previewed the OCR extraction and the
 *  fields are confirmed. Creates the indexed document. */
export async function uploadDocument(input: {
  name: string; folder: string; type: DocType; audience: string; extracted: ExtractedField[]; scanned: boolean;
}): Promise<DocActionResult> {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;
  if (!input.name.trim()) return { ok: false, error: 'Give the document a name.' };

  const estateId = actor.estateIds[0] ?? db.documents[0]?.estateId;
  const id = `doc-up-${uploadCounter++}`;
  const exp = input.extracted.find((f) => /expiry|end date/i.test(f.label))?.value;

  db.documents.push({
    tenantId: actor.tenantId ?? 't-lekki',
    id,
    name: input.name.trim().endsWith('.pdf') ? input.name.trim() : `${input.name.trim()}.pdf`,
    folder: input.folder,
    type: input.type,
    estateId,
    audience: input.audience,
    sizeKb: 200 + Math.floor(Math.random() * 800),
    updatedAt: NOW,
    uploadedBy: name(actor),
    indexed: true,
    scanned: input.scanned,
    extractionConfidence: input.scanned ? 0.85 : 0.97,
    keywords: input.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2),
    extracted: input.extracted,
    expiryDate: exp && /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : undefined,
  } as unknown as (typeof db.documents)[number]);

  revalidatePath('/documents');
  return { ok: true, id };
}
