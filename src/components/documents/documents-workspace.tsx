'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Eye, FileText, FolderOpen, Plus, Search, ShieldCheck } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';
import { ReadOnlyChip } from '@/components/domain';
import { DOC_TYPE_LABEL, docDaysUntil, docExpiryState, EXPIRY_TONE } from '@/domain/documents';
import type { DocData } from './types';
import { DocSearchBox } from './search-box';
import { DocDrawer } from './doc-drawer';
import { UploadDialog } from './upload-dialog';
import common from '@/components/ui/workspace-layout.module.css';
import styles from './documents-workspace.module.css';

export function DocumentsWorkspace(data: DocData) {
  const [folder, setFolder] = useState('all');
  const [query, setQuery] = useState('');
  const [asResident, setAsResident] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const audienceDocuments = useMemo(() => asResident ? data.documents.filter((d) => /resident/i.test(d.audience)) : data.documents, [data.documents, asResident]);
  const folders = useMemo(() => Array.from(new Set(audienceDocuments.map((d) => d.folder))), [audienceDocuments]);
  const visible = audienceDocuments.filter((d) => (folder === 'all' || d.folder === folder) && `${d.name} ${d.folder} ${d.audience} ${DOC_TYPE_LABEL[d.type]}`.toLowerCase().includes(query.trim().toLowerCase()));
  const expiring = audienceDocuments.filter((d) => d.expiryDate && docExpiryState(d.expiryDate) !== 'valid').sort((a, b) => docDaysUntil(a.expiryDate!) - docDaysUntil(b.expiryDate!));
  const doc = openId ? audienceDocuments.find((d) => d.id === openId) : null;
  const indexed = audienceDocuments.filter((d) => d.indexed).length;
  const canManage = data.canMutate && !asResident;

  return <div className="pb-page">
    <PageHeader title="Documents" subtitle={`${audienceDocuments.length} document records · ${indexed} marked indexed · ${data.scopeLabel}`} actions={<>
      <Button type="button" icon={<Eye size={16} />} aria-pressed={asResident} onClick={() => { setAsResident(!asResident); setFolder('all'); setOpenId(null); setUploading(false); }}> {asResident ? 'Viewing as resident' : 'View as resident'}</Button>
      {canManage ? <Button type="button" variant="primary" icon={<Plus size={16} />} onClick={() => setUploading(true)}>Add document record</Button> : <ReadOnlyChip />}
    </>} />
    <PageTabs label="Document sections" items={[
      { id: 'library', label: 'Document library', content: <div className={common.layout}>
        <div className={common.metrics}>
          <KpiCard label="Document records" value={String(audienceDocuments.length)} icon={<FileText size={18} />} />
          <KpiCard label="Folders" value={String(folders.length)} icon={<FolderOpen size={18} />} />
          <KpiCard label="Renewals needing attention" value={String(expiring.length)} icon={<CalendarClock size={18} />} />
          <KpiCard label="Marked indexed" value={String(indexed)} icon={<ShieldCheck size={18} />} />
        </div>
        {asResident && <div className={common.notice}><Eye size={18} /><p>Resident audience preview<span>Only records shared to residents are shown in the library and search. This preview does not change permissions.</span></p></div>}
        <Card padded={false} className={common.panel}>
          <div className={common.registerHeader}>
            <CardHeader title="Document library" subtitle="Policies, certificates and estate records, organised by audience and folder." />
            <div className={`${common.toolbar} pb-register-toolbar`}>
              <label className={common.search}><Search size={16} /><input type="search" aria-label="Search document library" placeholder="Search names, folders or audiences…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
              <div className={common.filters} aria-label="Document folders">
                <Button type="button" className="pb-filter" aria-pressed={folder === 'all'} onClick={() => setFolder('all')}>All folders ({audienceDocuments.length})</Button>
                {folders.map((f) => <Button key={f} type="button" className="pb-filter" aria-pressed={folder === f} onClick={() => setFolder(f)}>{f}</Button>)}
              </div>
            </div>
          </div>
          {visible.length ? <div className="pb-table-scroll" role="region" aria-label="Document library register" tabIndex={0}>
            <table className={`${common.table} pb-data-table`}><thead><tr>{['Document', 'Type', 'Audience', 'Updated', 'Expiry', 'Details'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{visible.map((d) => { const expiry = docExpiryState(d.expiryDate); return <tr key={d.id}>
                <td><div className={common.person}><FileText size={18} className="text-primary shrink-0" /><div><span className={common.title}>{d.name}</span><span className={common.metadata}>{d.folder} · {d.sizeKb > 0 ? `${(d.sizeKb / 1024).toFixed(1)} MB recorded` : 'Metadata only'}</span></div></div></td>
                <td><StatusPill status={DOC_TYPE_LABEL[d.type]} tone="neutral" /></td><td>{d.audience}</td><td>{d.updatedAt.slice(0, 10)}</td>
                <td>{d.expiryDate ? <StatusPill status={expiry === 'expired' ? 'Expired' : expiry === 'expiring' ? 'Expiring soon' : `Valid to ${d.expiryDate}`} tone={EXPIRY_TONE[expiry]} /> : <span className={common.metadata}>Not recorded</span>}</td>
                <td className={common.rowAction}><Button type="button" variant="ghost" aria-label={`View document ${d.name}`} onClick={() => setOpenId(d.id)}>View</Button></td>
              </tr>; })}</tbody></table>
          </div> : <EmptyState title="No documents here." />}
          <div className={common.registerFooter}>Showing {visible.length} of {audienceDocuments.length} records · Expiry is evaluated against the recorded snapshot, {data.now.slice(0, 10)}.</div>
        </Card>
      </div> },
      { id: 'search', label: 'AI document search', content: <DocSearchBox documents={audienceDocuments} onOpen={setOpenId} /> },
      ...(!asResident ? [{ id: 'compliance', label: 'Expiry & compliance', content: <div className={common.layout}>
        <Card className={common.panel}><CardHeader title="Document renewals" subtitle="Certificates, policies and agreements requiring a review." />
          {expiring.length ? <ul className={common.list}>{expiring.map((d) => { const days = docDaysUntil(d.expiryDate!); return <li key={d.id} className={common.listRow}>
            <div className={styles.flexRecord}><span className={common.title}>{d.name}</span><span className={common.metadata}>{d.folder} · {d.expiryDate}{d.linkedObligationId ? ' · Linked compliance obligation' : ''}</span></div>
            <StatusPill status={days < 0 ? `Expired ${-days} days ago` : `Expires in ${days} days`} tone={EXPIRY_TONE[docExpiryState(d.expiryDate)]} />
            <Button type="button" onClick={() => setOpenId(d.id)} aria-label={`Review renewal ${d.name}`}>Review</Button>
          </li>; })}</ul> : <EmptyState title="No document renewals need attention in this snapshot." />}
          <p className={common.footnote}>Compliance certificates link to their obligations in <Link href="/estate/inspections" className={styles.link}>Inspections & Compliance</Link>. A document record alone does not confirm statutory compliance.</p>
        </Card>
      </div> }] : []),
    ]} />
    {doc && <DocDrawer key={doc.id} doc={doc} canMutate={canManage} onClose={() => setOpenId(null)} />}
    {uploading && canManage && <UploadDialog estates={data.estates ?? []} onClose={() => setUploading(false)} />}
  </div>;
}
