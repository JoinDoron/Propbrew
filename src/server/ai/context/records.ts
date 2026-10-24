import 'server-only';

import type { Page } from '@/domain/primitives';
import type { CopilotCoverage } from '@/lib/ai/copilot-protocol';

export type CopilotRecordOptions<T> = {
  maxRecords?: number;
  pageSize?: number;
  maxPages?: number;
  /** Narrows an already authorised repository read; never grants access. */
  accept?: (row: T) => boolean;
};

/** Bound context work and disclose caps, duplicate pages and unknown filtered totals. */
export async function collectCopilotRecords<T extends { id: string; tenantId?: string }>(
  collection: string,
  read: (options: { cursor: string | null; limit: number }) => Page<T> | Promise<Page<T>>,
  options: CopilotRecordOptions<T> = {},
): Promise<{ items: T[]; coverage: CopilotCoverage }> {
  const bounded = (value: number | undefined, fallback: number, maximum: number) => Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value!), maximum)) : fallback;
  const maxRecords = bounded(options.maxRecords, 100, 200);
  const pageSize = bounded(options.pageSize, 50, 100);
  const maxPages = bounded(options.maxPages, 20, 20);
  const items: T[] = [];
  const recordKeys = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let reportedTotal: number | null = null;
  let exhausted = false;
  let clipped = false;

  for (let pageNumber = 0; pageNumber < maxPages && items.length < maxRecords; pageNumber++) {
    const page = await read({ cursor, limit: Math.min(pageSize, maxRecords - items.length) });
    if (Number.isSafeInteger(page.total) && page.total >= 0) reportedTotal = Math.max(reportedTotal ?? 0, page.total);
    for (const item of page.items) {
      const key = JSON.stringify([item.tenantId ?? '', item.id]);
      if (recordKeys.has(key)) continue;
      recordKeys.add(key);
      if (options.accept && !options.accept(item)) continue;
      if (items.length === maxRecords) { clipped = true; continue; }
      items.push(item);
    }
    cursor = page.cursor;
    if (cursor === null) { exhausted = true; break; }
    if (cursors.has(cursor)) break;
    cursors.add(cursor);
  }

  const complete = exhausted && !clipped && (reportedTotal === null || recordKeys.size >= reportedTotal);
  const total = options.accept ? (complete ? items.length : null) : (reportedTotal === null ? (complete ? items.length : null) : Math.max(reportedTotal, items.length));
  return { items, coverage: { collection, loaded: items.length, total, complete } };
}
