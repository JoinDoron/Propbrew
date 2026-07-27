'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Eye, FileText, FolderOpen, Sparkles, Upload, Users } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { ReadOnlyChip } from '@/components/domain';
import { DOC_TYPE_LABEL, docDaysUntil, docExpiryState, EXPIRY_TONE } from '@/domain/documents';
import type { Tone } from '@/lib/status-tones';
import type { DocData } from './types';
import { DocSearchBox } from './search-box';
import { DocDrawer } from './doc-drawer';
import { UploadDialog } from './upload-dialog';

const TYPE_TONE: Record<string, Tone> = { certificate: 'info', contract: 'progress', policy: 'info', invoice: 'warn', handbook: 'neutral', report: 'neutral', notice: 'success', other: 'muted' };

export function DocumentsWorkspace(data: DocData) {
  const [folder, setFolder] = useState('all');
  const [asResident, setAsResident] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const folders = useMemo(() => Array.from(new Set(data.documents.map((d) => d.folder))), [data.documents]);
  const visible = useMemo(() => {
    let v = data.documents;
    if (asResident) v = v.filter((d) => /resident/i.test(d.audience)); // EM-08: residents see docs shared to their audience
    if (folder !== 'all') v = v.filter((d) => d.folder === folder);
    return v;
  }, [data.documents, folder, asResident]);

  // expiry radar — certs/contracts/policies expiring or expired
  const expiring = data.documents
    .filter((d) => d.expiryDate && docExpiryState(d.expiryDate) !== 'valid')
    .sort((a, b) => docDaysUntil(a.expiryDate!) - docDaysUntil(b.expiryDate!));

  const doc = openId ? data.documents.find((d) => d.id === openId) ?? null : null;
  const indexed = data.documents.filter((d) => d.indexed).length;

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold tracking-[-0.02em] leading-tight">Documents</h1>
          <p className="text-[12.5px] text-text-3">{data.documents.length} files · {indexed} indexed for AI search · {data.scopeLabel}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAsResident((v) => !v)} className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] font-medium transition-colors ${asResident ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>
            <Eye size={14} /> {asResident ? 'Viewing as resident' : 'View as resident'}
          </button>
          {data.canMutate ? <Button variant="primary" icon={<Upload size={15} />} className="!h-8 !text-[12px]" onClick={() => setUploading(true)}>Upload</Button> : <ReadOnlyChip />}
        </div>
      </div>

      {/* AI semantic search */}
      <DocSearchBox documents={data.documents} onOpen={setOpenId} />

      {/* Expiry radar */}
      {!asResident && expiring.length > 0 && (
        <div className="rounded-2xl border border-[color:var(--tone-warn)]/40 bg-[color:var(--tone-warn)]/[0.06] p-3">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock size={15} className="text-warning" />
            <span className="text-[12.5px] font-semibold">Renewals — {expiring.length} document{expiring.length > 1 ? 's' : ''} expiring or lapsed</span>
            <span className="text-[11px] text-text-3">certificates, contracts & policies</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {expiring.map((d) => {
              const st = docExpiryState(d.expiryDate);
              const days = docDaysUntil(d.expiryDate!);
              return (
                <button key={d.id} onClick={() => setOpenId(d.id)} className="flex-none w-[220px] text-left bg-surface border border-border rounded-xl p-2.5 hover:border-primary transition-colors">
                  <div className="text-[12.5px] font-medium truncate">{d.name.replace(/\.[a-z]+$/, '')}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <StatusPill status={st === 'expired' ? `Expired ${-days}d ago` : `Expires in ${days}d`} tone={EXPIRY_TONE[st]} />
                  </div>
                  {d.linkedObligationId && <div className="text-[10.5px] text-text-3 mt-1">→ compliance obligation</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Folder filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setFolder('all')} className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-colors inline-flex items-center gap-1.5 ${folder === 'all' ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>
          <FolderOpen size={13} /> All<span className="text-text-3 font-mono">{visible.length}</span>
        </button>
        {folders.map((f) => (
          <button key={f} onClick={() => setFolder(f)} className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-colors ${folder === f ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>{f}</button>
        ))}
      </div>

      {asResident && <div className="text-[11.5px] text-text-3 -mt-1">Showing only documents shared to residents — {visible.length} of {data.documents.length} (EM-08 audience control).</div>}

      {/* Document list */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        {visible.map((d) => {
          const st = docExpiryState(d.expiryDate);
          return (
            <button key={d.id} onClick={() => setOpenId(d.id)} className="flex items-center gap-3 w-full text-left px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
              <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center flex-none text-text-3"><FileText size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{d.name}</span>
                  {d.indexed && <span title="Indexed for AI search (AI-S-03)" className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-primary bg-primary-weak px-1 h-[16px] rounded flex-none"><Sparkles size={9} />AI</span>}
                </div>
                <div className="text-[11px] text-text-3 truncate flex items-center gap-1.5">
                  <Users size={10} /> {d.audience} · {d.folder} · updated {d.updatedAt}
                </div>
              </div>
              <StatusPill status={DOC_TYPE_LABEL[d.type]} tone={TYPE_TONE[d.type] ?? 'neutral'} />
              {d.expiryDate && st !== 'valid' && <StatusPill status={st === 'expired' ? 'Expired' : 'Expiring'} tone={EXPIRY_TONE[st]} />}
              <span className="text-[11px] text-text-3 font-mono w-14 text-right flex-none max-[560px]:hidden">{(d.sizeKb / 1024).toFixed(1)} MB</span>
            </button>
          );
        })}
        {visible.length === 0 && <div className="p-8 text-center text-[13px] text-text-3">No documents here.</div>}
      </div>

      <p className="text-[11px] text-text-3">
        Compliance certificates link to their obligations in <Link href="/inspections" className="text-primary hover:underline">Inspections & Compliance</Link>.
      </p>

      {doc && <DocDrawer doc={doc} canMutate={data.canMutate} onClose={() => setOpenId(null)} />}
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
    </div>
  );
}
