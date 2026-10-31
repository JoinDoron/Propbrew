'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { QUALITY_PHOTO_MAX_BYTES, type QualityPhoto } from '@/domain/construction/quality-photos';
import styles from '../quality-workspace.module.css';

export function QualityPhotoPicker({ companyId, issueId, selectedIds, onChange, disabled = false }: {
  companyId: string; issueId: string; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null), key = useRef('');
  const [photos, setPhotos] = useState<QualityPhoto[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/construction/quality/photos?${new URLSearchParams({ issueId })}`, { signal: abort.signal, cache: 'no-store' })
      .then(async (response) => { const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'Photos unavailable.'); if (!abort.signal.aborted) setPhotos(data.files); })
      .catch((error: unknown) => { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'Photos unavailable.'); });
    return () => abort.abort();
  }, [issueId]);
  async function upload() {
    if (!file || disabled || busy) return;
    if (!file.size || file.size > QUALITY_PHOTO_MAX_BYTES) { setMessage('Choose a PNG, JPEG or WebP photo of at most 2 MB.'); return; }
    setBusy(true); setMessage('');
    try {
      const body = new FormData(); body.set('expectedCompanyId', companyId); body.set('issueId', issueId); body.set('file', file);
      const response = await fetch('/api/construction/quality/photos', { method: 'POST', headers: { 'Idempotency-Key': key.current }, body });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.file?.id) throw new Error(result.error || 'Photo not saved. Keep the original and retry.');
      const saved = result.file as QualityPhoto;
      setPhotos((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
      if (!selectedIds.includes(saved.id) && selectedIds.length < 12) onChange([...selectedIds, saved.id]);
      setFile(null); key.current = ''; if (input.current) input.current.value = '';
      setMessage('Photo stored privately. Save the inspection result or corrective work to attach it.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Photo not saved. Keep the original and retry.'); }
    finally { setBusy(false); }
  }
  return <fieldset className={styles.photoPicker} disabled={disabled || busy}>
    <legend>Photo evidence</legend>
    {photos.length ? <div className={styles.photoGrid}>{photos.map((photo) => <label className={styles.photoOption} key={photo.id}>
      <input type="checkbox" checked={selectedIds.includes(photo.id)} disabled={!selectedIds.includes(photo.id) && selectedIds.length >= 12} onChange={(event) => onChange(event.target.checked ? [...selectedIds, photo.id] : selectedIds.filter((value) => value !== photo.id))} />
      <Image unoptimized src={photo.url} alt={photo.name} width={52} height={52} />
      <span>{photo.name}</span>
    </label>)}</div> : <p className={styles.meta}>No photos stored for this record yet.</p>}
    <div className={styles.photoUpload}><label htmlFor={id}>Add a photo<span>PNG, JPEG or WebP · up to 2 MB</span></label><input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); key.current = crypto.randomUUID(); setMessage(''); }} /><Button type="button" disabled={!file || busy} onClick={() => { void upload(); }}>{busy ? 'Saving…' : 'Save photo'}</Button></div>
    {message && <p className={styles.meta} role="status">{message}</p>}
  </fieldset>;
}
