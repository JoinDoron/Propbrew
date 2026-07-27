'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, FileText, Link2, Lock, Pencil, ScanLine, Sparkles, Users, X } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { DOC_TYPE_LABEL, docDaysUntil, docExpiryState, EXPIRY_TONE } from '@/domain/documents';
import { saveDocumentFields } from '@/server/actions/documents';
import type { ExtractedField } from '@/domain/entities';
import type { DocView } from './types';

export function DocDrawer({ doc, canMutate, onClose }: { doc: DocView; canMutate: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<ExtractedField[]>(doc.extracted.map((f) => ({ ...f })));

  const expiry = docExpiryState(doc.expiryDate);
  const conf = Math.round(doc.extractionConfidence * 100);

  const save = () =>
    start(async () => {
      const r = await saveDocumentFields(doc.id, fields);
      if (!r.ok) setError(r.error);
      else { setEditing(false); router.refresh(); }
    });

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.4)]" onClick={onClose} />
      <div className="relative w-full max-w-[440px] h-full bg-surface border-l border-border shadow-float overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-start gap-2 z-10">
          <span className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center flex-none text-text-3"><FileText size={17} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold truncate">{doc.name}</h3>
            <div className="text-[11.5px] text-text-3">{DOC_TYPE_LABEL[doc.type]} · {doc.folder} · {(doc.sizeKb / 1024).toFixed(1)} MB</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-surface-2 flex-none"><X size={16} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3.5">
          {/* meta chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-2 border border-border-2 rounded-full px-2.5 h-6"><Users size={11} />{doc.audience}</span>
            {doc.expiryDate && (
              <StatusPill status={expiry === 'expired' ? `Expired ${-docDaysUntil(doc.expiryDate)}d ago` : expiry === 'expiring' ? `Expires in ${docDaysUntil(doc.expiryDate)}d` : `Valid to ${doc.expiryDate}`} tone={EXPIRY_TONE[expiry]} />
            )}
          </div>

          {/* linked obligation */}
          {doc.linkedObligationId && (
            <Link href="/inspections" className="flex items-center gap-2 text-[12.5px] text-primary hover:underline"><Link2 size={13} /> Evidences a compliance obligation →</Link>
          )}

          {/* extracted fields (AI-S-03) */}
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Extracted fields</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-text-3 ml-auto">
                {doc.scanned ? <><ScanLine size={11} /> scanned</> : 'printed'} · {conf}% conf
              </span>
            </div>

            {doc.extracted.length === 0 ? (
              <p className="text-[12px] text-text-3">No fields extracted from this document type.</p>
            ) : editing ? (
              <div className="flex flex-col gap-2">
                {fields.map((f, i) => (
                  <label key={i} className="block">
                    <span className="text-[10.5px] text-text-3">{f.label}</span>
                    <input value={f.value} onChange={(e) => setFields((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="mt-0.5 w-full h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12.5px] outline-none focus:border-primary" />
                  </label>
                ))}
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="primary" className="!h-8 !text-[12px]" disabled={pending} onClick={save}>Save fields</Button>
                  <Button variant="secondary" className="!h-8 !text-[12px]" disabled={pending} onClick={() => { setEditing(false); setFields(doc.extracted.map((f) => ({ ...f }))); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {doc.extracted.map((f, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="text-text-3">{f.label}</span>
                    <span className="font-medium text-right truncate">{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!editing && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="!h-8 !text-[12px]" icon={<Download size={14} />}>Download</Button>
              {canMutate && doc.extracted.length > 0 && <Button variant="secondary" className="!h-8 !text-[12px]" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Edit fields</Button>}
              {!canMutate && <span className="inline-flex items-center gap-1 text-[11px] text-text-3"><Lock size={11} /> read-only</span>}
            </div>
          )}

          <div className="text-[11px] text-text-3 border-t border-border pt-2.5">Uploaded by {doc.uploadedBy} · updated {doc.updatedAt}{doc.indexed ? ' · indexed for AI search' : ''}</div>
          {error && <p className="text-[12px] text-negative">{error}</p>}
        </div>
      </div>
    </div>
  );
}
