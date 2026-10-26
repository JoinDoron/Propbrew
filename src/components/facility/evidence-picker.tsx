'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FileCheck2, Upload } from 'lucide-react';
import { Button } from '@/components/ui';
import { FACILITY_EVIDENCE_MAX_BYTES, type FacilityEvidence, type FacilityEvidenceResource } from '@/domain/facility/evidence';
import styles from './evidence-picker.module.css';

export function EvidencePicker({ expectedCompanyId, resourceType, resourceId, selectedIds, onChange, disabled = false }: {
  expectedCompanyId: string; resourceType: FacilityEvidenceResource; resourceId: string;
  selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const fieldId = useId(), input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FacilityEvidence[]>([]), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [message, setMessage] = useState('');
  const requestKey = useRef('');
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/facility/evidence?${new URLSearchParams({ resourceType, resourceId })}`, { signal: abort.signal, cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.ok || !Array.isArray(result.files)) throw new Error(result.error || 'Stored evidence is unavailable.');
        if (!abort.signal.aborted) setFiles(result.files);
      }).catch((error: unknown) => { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'Stored evidence is unavailable.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [expectedCompanyId, resourceType, resourceId]);
  async function upload() {
    if (!file || busy || disabled) return;
    if (!file.size || file.size > FACILITY_EVIDENCE_MAX_BYTES) { setMessage('Choose a non-empty PNG, JPEG, WebP or PDF file of at most 2 MB.'); return; }
    setBusy(true); setMessage('');
    try {
      const body = new FormData(); body.set('expectedCompanyId', expectedCompanyId); body.set('resourceType', resourceType); body.set('resourceId', resourceId); body.set('file', file);
      const response = await fetch('/api/facility/evidence', { method: 'POST', headers: { 'Idempotency-Key': requestKey.current }, body });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.file?.id) throw new Error(result.error || 'The file could not be saved. Keep your original and retry.');
      const saved = result.file as FacilityEvidence;
      setFiles((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
      if (!selectedIds.includes(saved.id) && selectedIds.length < 20) onChange([...selectedIds, saved.id]);
      setFile(null); requestKey.current = ''; if (input.current) input.current.value = '';
      setMessage('Evidence saved privately. Select the files to attach to this record.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The file could not be saved. Keep your original and retry.'); }
    finally { setBusy(false); }
  }
  return <fieldset className={styles.panel} disabled={disabled || busy} aria-busy={busy || loading}>
    <legend><FileCheck2 size={16} aria-hidden="true" />Stored evidence</legend>
    <p className={styles.hint}>Upload a photo or PDF, then select it for this record. Files are private to this company and location. Photos required by a checklist must be saved images.</p>
    {loading ? <p className={styles.hint} role="status">Loading stored evidence…</p> : files.length ? <ul className={styles.files}>{files.map((item) => <li key={item.id}>
      <label><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={disabled || busy || !selectedIds.includes(item.id) && selectedIds.length >= 20} onChange={(event) => onChange(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))} /><span>{item.name}<small>{item.kind === 'image' ? 'Photo' : 'Document'} · {Math.ceil(item.size / 1024)} KB</small></span></label>
      <a href={item.url} target="_blank" rel="noopener noreferrer">View<span className="sr-only"> {item.name}</span></a>
    </li>)}</ul> : <p className={styles.hint}>No saved evidence for this asset or obligation yet.</p>}
    <div className={styles.upload}><label htmlFor={fieldId}>Add evidence file<span>PNG, JPEG, WebP or PDF · up to 2 MB</span></label>
      <input id={fieldId} ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => { setFile(event.target.files?.[0] ?? null); requestKey.current = crypto.randomUUID(); setMessage(''); }} />
      <Button type="button" icon={<Upload size={15} />} disabled={!file || disabled || busy} onClick={() => { void upload(); }}>{busy ? 'Saving file…' : 'Save evidence file'}</Button>
    </div>
    <p className={styles.hint}>The record is saved separately after you submit its form. A file upload does not approve a service or certify compliance.</p>
    {message && <p className={styles.message} role="status">{message}</p>}
  </fieldset>;
}
