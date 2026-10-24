'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, X } from 'lucide-react';
import { Button, Card, CardHeader, IconButton } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { EXTRACTION_TEMPLATES, DOC_TYPE_LABEL } from '@/domain/documents';
import { uploadDocument } from '@/server/actions/documents';
import type { DocType, ExtractedField } from '@/domain/entities';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './documents-workspace.module.css';

const TYPES: DocType[] = ['certificate', 'contract', 'policy', 'invoice', 'report', 'notice', 'handbook', 'other'];
const FOLDERS = ['Compliance', 'Contracts', 'Finance', 'Policies', 'Notices'];
const AUDIENCES = ['Managers', 'All residents'];

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<DocType>('certificate');
  const [folder, setFolder] = useState('Compliance');
  const [audience, setAudience] = useState('Managers');
  const [scanned, setScanned] = useState(true);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  function submit() {
    if (pending) return;
    if (!name.trim()) { setError('Give the document a name first.'); return; }
    setError(null);
    if (!reviewing) { setFields(EXTRACTION_TEMPLATES[type].map((f) => ({ ...f }))); setReviewing(true); return; }
    start(async () => {
      try {
        const r = await uploadDocument({ name: name.trim(), folder, type, audience, extracted: fields, scanned });
        if (!r.ok) setError(r.error);
        else { onClose(); router.refresh(); }
      } catch { setError('The document record could not be saved. Your entries are still here; please try again.'); }
    });
  }
  return <PortalDialog label="Add document record" onClose={onClose} width={620} canClose={!pending}>
    <div className={common.modal}>
      <div className={common.dialogHeader}><div><h2 className={common.dialogTitle}>Add document record</h2><p className={common.metadata}>{reviewing ? 'Step 2 of 2 · Review the field template' : 'Step 1 of 2 · Document details'}</p></div><IconButton type="button" aria-label="Close document record form" onClick={onClose} disabled={pending}><X size={18} /></IconButton></div>
      <form className={common.dialogBody} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className={common.notice}><FileText size={18} /><p>Metadata only<span>No file bytes are uploaded, OCR is not performed and object storage is not connected by this form. Enter verified values from the original document.</span></p></div>
        <fieldset className={styles.formGrid} disabled={pending}>
          <label className={`${common.field} ${styles.full}`}><span className={common.label}>Document name</span><input className={common.control} required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fire safety certificate 2027.pdf" /></label>
          <label className={common.field}><span className={common.label}>Type</span><select className={common.control} value={type} onChange={(e) => { setType(e.target.value as DocType); setReviewing(false); }}>{TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}</select></label>
          <label className={common.field}><span className={common.label}>Folder</span><select className={common.control} value={folder} onChange={(e) => setFolder(e.target.value)}>{FOLDERS.map((f) => <option key={f}>{f}</option>)}</select></label>
          <label className={common.field}><span className={common.label}>Audience</span><select className={common.control} value={audience} onChange={(e) => setAudience(e.target.value)}>{AUDIENCES.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className={styles.check}><input type="checkbox" checked={scanned} onChange={(e) => setScanned(e.target.checked)} />Scanned original</label>
        </fieldset>
        {reviewing && <Card className={common.panel}><CardHeader title="Review field template" subtitle="These blank fields are a manual template, not AI-extracted results." />
          {fields.length ? <fieldset className={common.stack} disabled={pending}>{fields.map((f, i) => <label key={i} className={common.field}><span className={common.label}>{f.label}</span><input className={common.control} value={f.value} onChange={(e) => setFields((p) => p.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder={/date/i.test(f.label) ? 'YYYY-MM-DD' : 'Enter a verified value'} /></label>)}</fieldset> : <p className={common.muted}>This type has no structured fields. Only its name, folder and audience will be recorded.</p>}
        </Card>}
        {error && <p className={common.feedback} role="alert">{error}</p>}
        <div className={common.actions}><Button type="button" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : reviewing ? 'Save document record' : 'Review fields'}</Button></div>
      </form>
    </div>
  </PortalDialog>;
}
