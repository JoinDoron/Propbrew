'use client';

import { useRef, useState, useTransition } from 'react';
import { FileText, Search } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { searchDocuments, type SearchResult } from '@/server/actions/documents';
import { DOC_TYPE_LABEL } from '@/domain/documents';
import type { DocView } from './types';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './documents-workspace.module.css';

const SUGGESTIONS = ['fire safety certificate', 'lift maintenance contract', 'insurance policy number', 'service charge'];

export function DocSearchBox({ documents, onOpen }: { documents: DocView[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const byId = new Map(documents.map((d) => [d.id, d]));
  const hits = result?.hits.filter((h) => byId.has(h.docId)) ?? [];
  function run(value: string) {
    const text = value.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setQuery(text); setError(null); setResult(null);
    start(async () => {
      try { setResult(await searchDocuments(text)); }
      catch { setError('Document search is unavailable. Please try again.'); }
      finally { inFlight.current = false; }
    });
  }
  return <Card className={common.panel}>
    <CardHeader title="Search your documents" subtitle="AI-S-03 · Rules-based search over recorded fields and keywords, scoped to your estates. No language model or vector index is connected here." />
    <div className={common.stack}>
      <form className={styles.searchForm} onSubmit={(e) => { e.preventDefault(); run(query); }}>
        <label className={common.search}><Search size={16} /><input type="search" aria-label="Search documents" placeholder="Search a certificate, policy or recorded field…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><Button type="submit" variant="primary" disabled={pending || !query.trim()}>{pending ? 'Searching…' : 'Search'}</Button>
      </form>
      <div className={common.filters} aria-label="Suggested document searches">{SUGGESTIONS.map((s) => <Button type="button" key={s} disabled={pending} onClick={() => run(s)}>{s}</Button>)}</div>
      {pending && <p role="status" className={common.muted}>Searching recorded fields…</p>}
      {error && <p role="alert" className={common.feedback}>{error}</p>}
      {result && <div className={common.stack} aria-live="polite"><p className={common.metadata}>{hits.length} matching records in this audience view · {result.scopeLabel}</p>
        {hits.length ? hits.slice(0, 5).map((h) => { const doc = byId.get(h.docId)!; return <button type="button" key={h.docId} className={styles.result} onClick={() => onOpen(h.docId)} aria-label={`Open search result ${doc.name}`}><FileText size={20} /><span><span className={common.title}>{doc.name}</span><span className={common.metadata}>{DOC_TYPE_LABEL[doc.type]} · Matched on {h.matchedOn}</span><span className={common.body}>{h.snippet}</span></span></button>; }) : <EmptyState title="No documents matched." description="Try a certificate number, authority or keyword." />}
      </div>}
    </div>
  </Card>;
}
