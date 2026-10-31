import 'server-only';
import { currentRecordContext } from '@/server/data/record-context';
import type { Actor } from '@/lib/authz';
import type { ConstructionDoc } from '@/domain/construction/types';

type PageText = { page: number; text: string };
type Entry = { tenantId: string; projectId: string; docId: string; fileId: string; sha256: string; pages: PageText[]; extractedAtISO: string };
type Index = { entries: Entry[] };
const MAX_PAGES = 80;
const MAX_PAGE_TEXT = 3000;
const MAX_INDEX_TEXT = 60000;

function index(write = false): Index {
  const context = currentRecordContext();
  if (!context) return { entries: [] };
  if (write && context.mode !== 'write') throw new Error('Document indexing requires a write transaction.');
  const value = context.state.auxiliary.constructionDocumentText as Index | undefined;
  if (!value) return write ? context.state.auxiliary.constructionDocumentText = { entries: [] } : { entries: [] };
  if (!Array.isArray(value.entries)) throw new Error('Document text index is unavailable.');
  return value;
}

/** Text-layer extraction only. Scanned pages are intentionally not given fabricated OCR text. */
export async function extractConstructionPdfText(bytes: Uint8Array): Promise<PageText[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true });
  const pdf = await loading.promise;
  try {
    const pages: PageText[] = []; let total = 0;
    for (let page = 1; page <= Math.min(pdf.numPages, MAX_PAGES); page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT);
      if (text) { pages.push({ page, text }); total += text.length; }
      if (total >= MAX_INDEX_TEXT) break;
    }
    return pages;
  } finally { await loading.destroy(); }
}

export function indexConstructionDrawingText(entry: Entry) {
  const context = currentRecordContext();
  if (!context || context.domainTenantId !== entry.tenantId) throw new Error('Drawing index tenant mismatch.');
  const rows = index(true).entries;
  const at = rows.findIndex((row) => row.fileId === entry.fileId);
  if (at >= 0) rows[at] = entry; else rows.push(entry);
}
export function indexedConstructionDrawingFileIds(): Set<string> { return new Set(index().entries.map((row) => row.fileId)); }

const STOP = new Set(['what', 'when', 'where', 'which', 'with', 'from', 'this', 'that', 'have', 'does', 'about', 'project', 'drawing', 'document', 'show', 'tell']);
export function retrieveConstructionDocumentText(actor: Actor, visibleDocs: readonly ConstructionDoc[], question: string) {
  if (!question.trim() || currentRecordContext()?.domainTenantId !== actor.tenantId) return [];
  const terms = [...new Set((question.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((word) => !STOP.has(word)))].slice(0, 20);
  if (!terms.length) return [];
  const docs = new Map(visibleDocs.filter((doc) => doc.status === 'approved' && doc.fileId && doc.fileSha256 && doc.tenantId === actor.tenantId)
    .map((doc) => [doc.fileId!, doc]));
  return index().entries.filter((entry) => entry.tenantId === actor.tenantId && (actor.constructionProjectIds === undefined || actor.constructionProjectIds.includes(entry.projectId)) && docs.get(entry.fileId)?.id === entry.docId &&
      docs.get(entry.fileId)?.projectId === entry.projectId && docs.get(entry.fileId)?.fileSha256 === entry.sha256)
    .flatMap((entry) => entry.pages.map((page) => {
      const doc = docs.get(entry.fileId)!;
      const lower = page.text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      return { docId: doc.id, projectId: entry.projectId, fileId: entry.fileId, number: doc.number, revision: doc.revision,
        title: doc.title, page: page.page, text: page.text.slice(0, 1200), score };
    })).filter((row) => row.score > 0).sort((a, b) => b.score - a.score || a.number.localeCompare(b.number)).slice(0, 6);
}
