import 'server-only';
import type { Actor } from '@/lib/authz';
import type { EstateDocument } from '@/domain/entities';
import { repos } from '@/server/data';

/** Both the library and search must see the same complete authorised records. */
export function scopedDocumentRecords(actor: Actor): EstateDocument[] {
  const documents: EstateDocument[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const page = repos.documents.list(actor, { cursor, limit: 200 });
    documents.push(...page.items);
    if (page.cursor === null) return documents;
    if (seen.has(page.cursor)) throw new Error('The document index could not be completely read.');
    seen.add(page.cursor);
    cursor = page.cursor;
  }
}
