'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, ScanSearch, Upload } from 'lucide-react';
import { Button, Card, CardHeader, StatusPill } from '@/components/ui';
import { ConstructionPanel, ConstructionPanelHeader } from '../construction-ui';
import { MODEL_MAX_BYTES } from '@/domain/construction/model-clashes';
import type { ClashRun, StoredModel } from '@/server/construction/models';
import styles from '../quality-workspace.module.css';

export function ModelCoordination({ projectId, companyId, packages, models, runs, canUpload, canExport }: {
  projectId: string; companyId: string; packages: { id: string; name: string }[];
  models: StoredModel[]; runs: ClashRun[]; canUpload: boolean; canExport: boolean;
}) {
  const router = useRouter(); const key = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null), [discipline, setDiscipline] = useState(''), [packageId, setPackageId] = useState('');
  const [modelAId, setModelAId] = useState(''), [modelBId, setModelBId] = useState(''), [toleranceMm, setToleranceMm] = useState(5);
  const [bcfFile, setBcfFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (!file || file.size < 32 || file.size > MODEL_MAX_BYTES || !/\.(obj|glb|ifc)$/i.test(file.name)) { setError('Choose an IFC, OBJ or GLB model of at most 12 MB.'); return; }
    setBusy(true); setError(''); setMessage(''); key.current ??= crypto.randomUUID();
    const form = new FormData(); form.set('expectedCompanyId', companyId); form.set('projectId', projectId);
    form.set('discipline', discipline); if (packageId) form.set('workPackageId', packageId); form.set('file', file);
    try {
      const response = await fetch('/api/construction/models', { method: 'POST', headers: { 'Idempotency-Key': key.current }, body: form, cache: 'no-store' });
      const body = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) { setError(body.error ?? 'The model was not saved.'); return; }
      setMessage('Model uploaded. Choose two models to compare.'); setFile(null); key.current = null; router.refresh();
    } catch { setError('Connection interrupted. Retry to check whether the model was saved.'); }
    finally { setBusy(false); }
  }
  async function scan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !modelAId || !modelBId || modelAId === modelBId) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/construction/models/detect', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedCompanyId: companyId, projectId, modelAId, modelBId, toleranceMm }), cache: 'no-store' });
      const body = await response.json() as { ok?: boolean; error?: string; run?: ClashRun };
      if (!response.ok || !body.ok || !body.run) { setError(body.error ?? 'The comparison could not complete.'); return; }
      setMessage(`${body.run.candidates} possible overlap${body.run.candidates === 1 ? '' : 's'} found; ${body.run.created} new coordination issue${body.run.created === 1 ? '' : 's'} linked below.`);
      router.refresh();
    } catch { setError('Connection interrupted. Reopen this page to check the scan history.'); }
    finally { setBusy(false); }
  }
  async function importBcf(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !bcfFile) return;
    setBusy(true); setError(''); setMessage('');
    const form = new FormData(); form.set('expectedCompanyId', companyId); form.set('projectId', projectId);
    if (packageId) form.set('workPackageId', packageId); form.set('file', bcfFile);
    try {
      const response = await fetch('/api/construction/models/bcf', { method: 'POST', body: form, cache: 'no-store' });
      const body = await response.json() as { ok?: boolean; error?: string; imported?: number; skipped?: number };
      if (!response.ok || !body.ok) { setError(body.error ?? 'Could not import BCF topics.'); return; }
      setMessage(`${body.imported} BCF topics imported; ${body.skipped} already present. Imported topics require local engineering review.`);
      setBcfFile(null); router.refresh();
    } catch { setError('Connection interrupted. Reopen this page to check the coordination register.'); }
    finally { setBusy(false); }
  }
  return <div className={styles.flow}>
    <Card className={styles.boundary}><strong>Automated model comparison</strong><p>Upload IFC, OBJ or GLB models in a shared coordinate frame. Propbrew compares component geometry envelopes and creates review candidates linked to IFC element IDs where present. A design lead must inspect the actual elements and approved drawings before a candidate is resolved.</p></Card>
    <ConstructionPanel><ConstructionPanelHeader title="Project models" subtitle="Private, immutable files kept in your company project." />
      <div className={styles.editor}>{models.length ? models.map((model) => <Card key={model.id} className={styles.issue}><CardHeader title={model.name} subtitle={`${model.discipline} · ${model.componentCount} components · ${(model.size / 1048576).toFixed(1)} MB`} action={<StatusPill status={model.format.toUpperCase()} tone="info" />} /><div className={styles.details}><span>Uploaded {model.uploadedAtISO.slice(0, 10)}</span><span>{model.workPackageId ? `Package ${packages.find((row) => row.id === model.workPackageId)?.name ?? model.workPackageId}` : 'Whole project'}</span><span>SHA-256 {model.sha256.slice(0, 12)}…</span></div><a href={`/api/construction/models/${model.id}`} download><Download size={15} aria-hidden="true" /> Download model</a></Card>) : <p className={styles.empty}>No models uploaded for this project.</p>}</div>
    </ConstructionPanel>
    {canUpload ? <ConstructionPanel><ConstructionPanelHeader title="Upload coordination model" subtitle="IFC, OBJ or GLB, up to 12 MB per model. Keep disciplines in the same coordinate frame." /><form className={styles.form} onSubmit={(event) => { void upload(event); }} onChange={() => { if (!busy) key.current = null; }}>
      <label>Discipline<input required minLength={2} maxLength={80} value={discipline} onChange={(event) => setDiscipline(event.target.value)} placeholder="e.g. Structure or MEP" /></label>
      {packages.length > 0 && <label>Work package<select value={packageId} onChange={(event) => setPackageId(event.target.value)}><option value="">Whole project</option>{packages.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>}
      <label>IFC, OBJ or GLB file<input type="file" accept=".ifc,.obj,.glb,application/x-step,model/gltf-binary,text/plain" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <div className={styles.formAction}><Button type="submit" variant="primary" icon={<Upload size={16} />} disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload model'}</Button></div>
    </form></ConstructionPanel> : <Card className={styles.boundary}><strong>Company model upload</strong><p>Sign in to a company with Construction editing access and PostgreSQL storage to upload or scan models.</p></Card>}
    {canUpload && models.length >= 2 && <ConstructionPanel><ConstructionPanelHeader title="Compare two models" subtitle="Scan envelopes across disciplines and link new candidates to the register below." /><form className={styles.form} onSubmit={(event) => { void scan(event); }}>
      <label>First model<select required value={modelAId} onChange={(event) => setModelAId(event.target.value)}><option value="">Choose a model</option>{models.map((model) => <option key={model.id} value={model.id}>{model.discipline} · {model.name}</option>)}</select></label>
      <label>Second model<select required value={modelBId} onChange={(event) => setModelBId(event.target.value)}><option value="">Choose a different model</option>{models.filter((model) => model.id !== modelAId).map((model) => <option key={model.id} value={model.id}>{model.discipline} · {model.name}</option>)}</select></label>
      <label>Minimum overlap to flag · mm<input type="number" min="0" max="1000" step="1" value={toleranceMm} onChange={(event) => setToleranceMm(Number(event.target.value))} required /></label>
      <div className={styles.formAction}><Button type="submit" variant="primary" icon={<ScanSearch size={16} />} disabled={busy || !modelAId || !modelBId || modelAId === modelBId}>{busy ? 'Comparing…' : 'Run clash scan'}</Button></div>
    </form></ConstructionPanel>}
    {(canUpload || canExport) && <ConstructionPanel><ConstructionPanelHeader title="BCF 3.0 exchange" subtitle="Share design topics with BIM coordination tools. Exports include visible issues and IFC element IDs where available; models and private drawings stay in Propbrew." />
      <div className={styles.editor}>{canExport && <a href={`/api/construction/models/bcf?projectId=${encodeURIComponent(projectId)}`} download><Download size={16} aria-hidden="true" /> Export visible issues as BCFZIP</a>}
      {canUpload && <form className={styles.form} onSubmit={(event) => { void importBcf(event); }}>
        {packages.length > 0 && <label>Import into work package<select value={packageId} onChange={(event) => setPackageId(event.target.value)}><option value="">Whole project</option>{packages.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>}
        <label>BCFZIP file<input type="file" accept=".bcfzip,application/zip" required onChange={(event) => setBcfFile(event.target.files?.[0] ?? null)} /></label>
        <div className={styles.formAction}><Button type="submit" disabled={busy || !bcfFile}>{busy ? 'Importing…' : 'Import BCF topics'}</Button></div>
      </form>}</div>
    </ConstructionPanel>}
    {error && <p className={styles.feedback} role="alert">{error}</p>}{message && <p className={styles.feedback} role="status">{message}</p>}
    {runs.length > 0 && <ConstructionPanel><ConstructionPanelHeader title="Recent scans" subtitle="Repeated scans do not create duplicate issues for the same model components." /><div className={styles.editor}>{runs.slice(0, 5).map((run) => <p key={run.id} className={styles.meta}>{run.runAtISO.slice(0, 16).replace('T', ' ')} · {run.candidates} candidates · {run.created} new issues · {run.toleranceMm} mm tolerance</p>)}</div></ConstructionPanel>}
  </div>;
}
