/**
 * Document intelligence (EM-08 / AI-S-03). Pure — the semantic-search scorer,
 * the OCR extraction templates, and expiry helpers the workspace computes over.
 * No LLM: the "semantic" search is a deterministic term-overlap scorer, the same
 * discipline as the ask-data engine (AI-S-02).
 */

import type { DocType, EstateDocument, ExtractedField } from './entities';
import { NOW_MS } from './ppm';

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  certificate: 'Certificate',
  contract: 'Contract',
  policy: 'Policy',
  invoice: 'Invoice',
  handbook: 'Handbook',
  report: 'Report',
  notice: 'Notice',
  other: 'Document',
};

/* --- expiry --------------------------------------------------------------- */

const DAY = 86_400_000;
export type DocExpiry = 'valid' | 'expiring' | 'expired' | 'none';
export function docDaysUntil(iso: string): number {
  return Math.round((Date.parse(iso) - NOW_MS) / DAY);
}
export function docExpiryState(expiryDate?: string): DocExpiry {
  if (!expiryDate) return 'none';
  const d = docDaysUntil(expiryDate);
  if (d < 0) return 'expired';
  if (d <= 45) return 'expiring';
  return 'valid';
}
export const EXPIRY_TONE: Record<DocExpiry, 'success' | 'warn' | 'danger' | 'muted'> = {
  valid: 'success', expiring: 'warn', expired: 'danger', none: 'muted',
};

/* --- AI-S-03 semantic search ---------------------------------------------- */

export type DocHit = { docId: string; score: number; matchedOn: string; snippet: string };

const STOP = new Set(['the', 'a', 'an', 'of', 'is', 'for', 'to', 'and', 'what', 'which', 'show', 'me', 'my', 'our', 'find', 'get', 'where', 'when', 'do', 'does', 'i', 'this', 'that', 's', 'about']);
function terms(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * Rank documents against a natural-language query. Scores term overlap across the
 * name (×3), the extracted fields (×3 — the "semantic" understanding), keywords
 * (×2), and folder/type/audience (×1). Returns hits sorted best-first, each with
 * the field it matched on so the UI can show WHY it surfaced.
 */
export function searchDocs(docs: readonly EstateDocument[], query: string): DocHit[] {
  const ts = terms(query);
  if (ts.length === 0) return [];
  const hits: DocHit[] = [];

  for (const d of docs) {
    let score = 0;
    let matchedOn = '';
    let snippet = '';
    const name = d.name.toLowerCase();
    for (const t of ts) {
      if (name.includes(t)) { score += 3; if (!matchedOn) { matchedOn = 'name'; snippet = d.name; } }
      for (const f of d.extracted) {
        if (f.label.toLowerCase().includes(t) || f.value.toLowerCase().includes(t)) {
          score += 3;
          if (matchedOn !== 'name') { matchedOn = f.label; snippet = `${f.label}: ${f.value}`; }
        }
      }
      if (d.keywords.some((k) => k.toLowerCase().includes(t))) { score += 2; if (!matchedOn) { matchedOn = 'keywords'; snippet = d.keywords.join(', '); } }
      if (d.folder.toLowerCase().includes(t)) { score += 1; if (!matchedOn) { matchedOn = 'folder'; snippet = d.folder; } }
      if (DOC_TYPE_LABEL[d.type].toLowerCase().includes(t)) { score += 1; if (!matchedOn) { matchedOn = 'type'; snippet = DOC_TYPE_LABEL[d.type]; } }
      if (d.audience.toLowerCase().includes(t)) { score += 1; }
    }
    if (score > 0) hits.push({ docId: d.id, score, matchedOn, snippet });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/* --- OCR extraction templates (simulated upload) -------------------------- */

/** The fields AI-S-03 would extract from each document type — used to preview an
 *  upload's extraction for the manager to confirm/edit before save. */
export const EXTRACTION_TEMPLATES: Record<DocType, ExtractedField[]> = {
  certificate: [
    { label: 'Certificate number', value: '' },
    { label: 'Issuing authority', value: '' },
    { label: 'Issue date', value: '' },
    { label: 'Expiry date', value: '' },
  ],
  contract: [
    { label: 'Counterparty', value: '' },
    { label: 'Contract value', value: '' },
    { label: 'Start date', value: '' },
    { label: 'End date', value: '' },
  ],
  policy: [
    { label: 'Policy number', value: '' },
    { label: 'Insurer', value: '' },
    { label: 'Sum insured', value: '' },
    { label: 'Expiry date', value: '' },
  ],
  invoice: [
    { label: 'Invoice number', value: '' },
    { label: 'Amount', value: '' },
    { label: 'Due date', value: '' },
  ],
  handbook: [{ label: 'Version', value: '' }, { label: 'Effective date', value: '' }],
  report: [{ label: 'Period', value: '' }, { label: 'Author', value: '' }],
  notice: [{ label: 'Effective date', value: '' }],
  other: [],
};
