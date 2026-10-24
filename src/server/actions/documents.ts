'use server';

import { withDurableRead, withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

/**
 * Document intelligence actions (EM-08 / AI-S-03). Search is read-only and runs
 * over the actor's SCOPED documents (§8.2 — a manager can never search another
 * tenant's files). Field edits and uploads are gated on the documents capability
 * (Estate/Facility Manager manage; residents view).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, matchesScope, ROLE_LABELS, type Actor } from '@/lib/authz';
import { scopedMutableGet } from '@/server/data';
import { scopedDocumentRecords } from '@/server/reads/documents';
import { db } from '@/server/data/store';
import { searchDocs, type DocHit } from '@/domain/documents';
import { NOW } from '@/domain/ppm';
import type { DocType, ExtractedField } from '@/domain/entities';
import type { Role } from '@/domain/enums';

export type SearchResult = { hits: DocHit[]; scopeLabel: string };
export type DocActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** AI-S-03 semantic search over the actor's scoped documents. */
export async function searchDocuments(query: string): Promise<SearchResult> {
  return withDurableRead(async () => {
  const actor = await getActor();
  if (typeof query !== 'string' || query.length > 2000) throw new Error('Enter a search query of up to 2,000 characters.');
  const docs = scopedDocumentRecords(actor);
  const scopeLabel = actor.allEstates ? 'all your estates' : `your ${actor.estateIds.length} estate(s)`;
  return { hits: searchDocs(docs, query), scopeLabel };

  });
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
const text = (max: number) => z.string().trim().max(max).refine((value) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value));
const fieldsSchema = z.array(z.object({ label: text(120).min(1), value: text(2000) }).strict()).max(50);
const uploadSchema = z.object({
  estateId: z.string().trim().min(1).max(160).optional(), name: text(200).min(1), folder: text(120).min(1),
  type: z.enum(['certificate', 'contract', 'policy', 'invoice', 'handbook', 'report', 'notice', 'other']),
  audience: z.enum(['Managers', 'All residents']), extracted: fieldsSchema, scanned: z.boolean(),
}).strict();
const expiryField = (fields: readonly ExtractedField[]) => fields.find((field) => /expiry|expires|valid (?:until|to)|end date/i.test(field.label));
function validFieldDates(fields: readonly ExtractedField[]): boolean {
  return fields.every((field) => {
    if (!field.value || !/\bdate\b|expiry|expires|valid (?:until|to)/i.test(field.label)) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(field.value)) return false;
    const time = Date.parse(`${field.value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === field.value;
  });
}

/** Save AI-extracted fields after the manager reviews/edits them (AI-S-03 HITL). */
export async function saveDocumentFields(docId: string, fields: ExtractedField[]): Promise<DocActionResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;
  const parsed = fieldsSchema.safeParse(fields);
  if (!parsed.success || !validFieldDates(parsed.data)) return { ok: false, error: 'Enter valid document fields and real dates in YYYY-MM-DD format.' };
  const live = scopedMutableGet(actor, 'announcements', db.documents, docId);
  if (!live) return { ok: false, error: 'Document not found.' };
  live.extracted = parsed.data;
  live.updatedAt = NOW;
  const exp = expiryField(parsed.data);
  live.expiryDate = exp?.value || undefined;
  revalidatePath('/documents');
  return { ok: true };

  });
}


/** Save reviewed metadata only. This does not upload bytes or perform OCR. */
export async function uploadDocument(input: {
  estateId?: string; name: string; folder: string; type: DocType; audience: string; extracted: ExtractedField[]; scanned: boolean;
}): Promise<DocActionResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  const denied = gate(actor);
  if (denied) return denied;
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success || !validFieldDates(parsed.data.extracted)) return { ok: false, error: 'Enter valid document details, fields and real dates in YYYY-MM-DD format.' };
  const data = parsed.data;
  const scope = assertCan(actor, 'announcements', 'update');
  const estates = db.sites.filter((site) => site.kind === 'estate' && matchesScope({ ...site, siteId: site.id }, scope) && (!data.estateId || site.id === data.estateId));
  if (estates.length !== 1) return { ok: false, error: 'Choose one of your authorised estate properties for this document record.' };
  const estate = estates[0];
  const id = `doc-up-${nextRecordSequence('documents:uploadCounter', 0)}`;
  const exp = expiryField(data.extracted)?.value;

  db.documents.push({
    tenantId: estate.tenantId,
    id,
    name: data.name.endsWith('.pdf') ? data.name : `${data.name}.pdf`,
    folder: data.folder,
    type: data.type,
    estateId: estate.id,
    audience: data.audience,
    sizeKb: 0,
    updatedAt: NOW,
    uploadedBy: name(actor),
    indexed: true,
    scanned: data.scanned,
    extractionConfidence: 0,
    keywords: data.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2),
    extracted: data.extracted,
    expiryDate: exp || undefined,
  } as unknown as (typeof db.documents)[number]);

  revalidatePath('/documents');
  return { ok: true, id };

  });
}
