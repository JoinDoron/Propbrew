'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, Pencil, X } from 'lucide-react';
import { Button, Card, CardHeader, IconButton, StatusPill } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { DOC_TYPE_LABEL, docDaysUntil, docExpiryState, EXPIRY_TONE } from '@/domain/documents';
import { saveDocumentFields } from '@/server/actions/documents';
import type { ExtractedField } from '@/domain/entities';
import type { DocView } from './types';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './documents-workspace.module.css';

export function DocDrawer({ doc, canMutate, onClose }: { doc: DocView; canMutate: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<ExtractedField[]>(doc.extracted.map((f) => ({ ...f })));
  const expiry = docExpiryState(doc.expiryDate);
  function save() {
    if (pending || !canMutate) return;
    setError(null);
    start(async () => {
      try {
        const r = await saveDocumentFields(doc.id, fields);
        if (!r.ok) setError(r.error);
        else { setEditing(false); router.refresh(); }
      } catch { setError('The document fields could not be saved. Your edits are still here; please try again.'); }
    });
  }
  return <PortalDialog label={`Document: ${doc.name}`} onClose={onClose} width={620} drawer canClose={!pending}>
    <div className={common.drawer}>
      <div className={common.dialogHeader}><div><h2 className={common.dialogTitle}>{doc.name}</h2><p className={common.metadata}>{DOC_TYPE_LABEL[doc.type]} · {doc.folder}</p></div><IconButton type="button" aria-label="Close document details" onClick={onClose} disabled={pending}><X size={18} /></IconButton></div>
      <div className={common.dialogBody}>
        <div className={common.filters}><StatusPill status={doc.audience} tone="neutral" />{doc.expiryDate && <StatusPill status={expiry === 'expired' ? `Expired ${-docDaysUntil(doc.expiryDate)} days ago` : expiry === 'expiring' ? `Expires in ${docDaysUntil(doc.expiryDate)} days` : `Valid to ${doc.expiryDate}`} tone={EXPIRY_TONE[expiry]} />}{!canMutate && <StatusPill status="Read-only" tone="muted" />}</div>
        {doc.linkedObligationId && <Link href="/estate/inspections" className={styles.link}>View linked compliance obligation →</Link>}
        <Card className={common.panel}><CardHeader title="Recorded document fields" subtitle={`${doc.scanned ? 'Scanned source' : 'Digital source'} · Manager review required; recorded values are not verified by an AI provider.`} />
          {editing ? <form className={common.stack} onSubmit={(e) => { e.preventDefault(); save(); }}>
            <fieldset disabled={pending} className={common.stack}>{fields.map((f, i) => <label key={i} className={common.field}><span className={common.label}>{f.label}</span><input className={common.control} value={f.value} onChange={(e) => setFields((p) => p.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} /></label>)}</fieldset>
            <div className={common.actions}><Button type="button" disabled={pending} onClick={() => { setEditing(false); setError(null); setFields(doc.extracted.map((f) => ({ ...f }))); }}>Cancel edits</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save fields'}</Button></div>
          </form> : doc.extracted.length ? <dl className={common.facts}>{doc.extracted.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value || 'Not recorded'}</dd></div>)}</dl> : <p className={common.muted}>No structured fields recorded for this document.</p>}
        </Card>
        {error && <p className={common.feedback} role="alert">{error}</p>}
        {!editing && <div className={common.actions}><Button type="button" icon={<Download size={16} />} disabled title="No stored file URL is connected to this record.">Download unavailable</Button>{canMutate && fields.length > 0 && <Button type="button" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Edit fields</Button>}</div>}
        <p className={common.metadata}>File download and OCR are not connected in this workspace. Editing fields updates the document record, not the source file.</p>
        <dl className={common.facts}><div><dt>Uploaded by</dt><dd>{doc.uploadedBy}</dd></div><div><dt>Last updated</dt><dd>{doc.updatedAt.slice(0, 10)}</dd></div><div><dt>Recorded file size</dt><dd>{(doc.sizeKb / 1024).toFixed(1)} MB</dd></div><div><dt>Index flag</dt><dd>{doc.indexed ? 'Marked indexed' : 'Not indexed'}</dd></div></dl>
      </div>
    </div>
  </PortalDialog>;
}
