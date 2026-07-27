'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ScanLine, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { EXTRACTION_TEMPLATES, DOC_TYPE_LABEL } from '@/domain/documents';
import { uploadDocument } from '@/server/actions/documents';
import type { DocType, ExtractedField } from '@/domain/entities';

const TYPES: DocType[] = ['certificate', 'contract', 'policy', 'invoice', 'report', 'notice', 'handbook', 'other'];
const FOLDERS = ['Compliance', 'Contracts', 'Finance', 'Policies', 'Notices'];
const AUDIENCES = ['Managers', 'All residents'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Phase = 'form' | 'extracting' | 'review';

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [step, setStep] = useState('');

  const [name, setName] = useState('');
  const [type, setType] = useState<DocType>('certificate');
  const [folder, setFolder] = useState('Compliance');
  const [audience, setAudience] = useState('Managers');
  const [scanned, setScanned] = useState(true);
  const [fields, setFields] = useState<ExtractedField[]>([]);

  async function extract() {
    if (!name.trim()) { setError('Give the document a name first.'); return; }
    setError(null); setPhase('extracting');
    for (const s of ['Running OCR on the document…', 'Detecting fields…', `Extracting ${DOC_TYPE_LABEL[type].toLowerCase()} details…`]) {
      setStep(s); await sleep(560 + Math.floor(Math.random() * 340));
    }
    setFields(EXTRACTION_TEMPLATES[type].map((f) => ({ ...f })));
    setPhase('review');
  }

  const submit = () =>
    start(async () => {
      const r = await uploadDocument({ name, folder, type, audience, extracted: fields, scanned });
      if (!r.ok) setError(r.error);
      else { onClose(); router.refresh(); }
    });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)]" onClick={onClose} />
      <div className="relative w-full max-w-[440px] bg-surface border border-border rounded-2xl shadow-float p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold">Upload document</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center hover:bg-surface-2"><X size={16} /></button>
        </div>

        {/* form */}
        <div className="grid grid-cols-2 gap-2.5">
          <label className="col-span-2 block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">File name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fire Safety Certificate 2027.pdf" className="mt-1 w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Type</span>
            <select value={type} onChange={(e) => { setType(e.target.value as DocType); setPhase('form'); }} className="mt-1 w-full h-9 px-2 rounded-lg border border-border-2 bg-surface text-[13px]">
              {TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Folder</span>
            <select value={folder} onChange={(e) => setFolder(e.target.value)} className="mt-1 w-full h-9 px-2 rounded-lg border border-border-2 bg-surface text-[13px]">
              {FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Audience</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="mt-1 w-full h-9 px-2 rounded-lg border border-border-2 bg-surface text-[13px]">
              {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 mt-5 text-[12px] cursor-pointer">
            <input type="checkbox" checked={scanned} onChange={(e) => setScanned(e.target.checked)} className="accent-[color:var(--primary)]" />
            <ScanLine size={13} className="text-text-3" /> Scanned (not born-digital)
          </label>
        </div>

        {/* extraction */}
        {phase === 'extracting' && (
          <div className="mt-3.5 flex items-center gap-2 text-[12.5px] text-text-2">
            <span className="inline-flex items-end gap-0.5 h-3">{[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: `${i * 130}ms`, animationDuration: '900ms' }} />)}</span>
            {step}
          </div>
        )}

        {phase === 'review' && (
          <div className="mt-3.5 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} className="text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">AI extracted — review before save</span>
              <Check size={13} className="text-success ml-auto" />
            </div>
            {fields.length === 0 ? (
              <p className="text-[12px] text-text-3">No structured fields for this type — it will still be indexed for search.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {fields.map((f, i) => (
                  <label key={i} className="block">
                    <span className="text-[10.5px] text-text-3">{f.label}</span>
                    <input value={f.value} onChange={(e) => setFields((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="verify…" className="mt-0.5 w-full h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12.5px] outline-none focus:border-primary" />
                  </label>
                ))}
              </div>
            )}
            <p className="text-[10.5px] text-text-3 mt-2">AI-S-03 — extracted fields are editable before save (HITL).</p>
          </div>
        )}

        <div className="flex items-center gap-2 justify-end mt-4">
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          {phase !== 'review'
            ? <Button variant="primary" icon={<Sparkles size={15} />} onClick={extract} disabled={phase === 'extracting'}>Run OCR</Button>
            : <Button variant="primary" icon={<Upload size={15} />} onClick={submit} disabled={pending}>Upload & index</Button>}
        </div>
        {error && <p className="text-[12px] text-negative mt-2">{error}</p>}
      </div>
    </div>
  );
}
