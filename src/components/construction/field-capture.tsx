'use client';

import { ConstructionSummary, ConstructionPanel, ConstructionToast, ConstructionKpi as Kpi, ConstructionFrame } from './construction-ui';
import { Button, CardHeader, EmptyState, IconButton, StatusPill } from '@/components/ui';
import styles from './construction-delivery-polish.module.css';

import { PageTabs } from '@/components/ui/page-tabs';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HardHat, WifiOff, Wifi, Camera, Check, Trash2, RefreshCw, TriangleAlert, CloudUpload, Plus, X } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { queueStats, syncPosture, OP_LABEL, STATUS_TONE, type OpKind } from '@/domain/sync';
import { useOutbox, useOnline, capture, removeOp, clearSynced, abandon, requeue, setForcedOffline, isForcedOffline } from '@/lib/offline/outbox';
const displayDate = (value: string) => new Date(value).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } as const : {}), timeZone: 'Africa/Lagos' });

export type FieldProject = { id: string; name: string; code: string };
export type FieldTask = { id: string; projectId: string; name: string; percentComplete: number };
export type FieldWorker = { id: string; projectId?: string; name: string; trade: string };

export function FieldCapture({ projects, tasks, workers, todayISO, canCapture = false, owner }: {
  projects: FieldProject[]; tasks: FieldTask[]; workers: FieldWorker[]; todayISO: string;
  canCapture?: boolean; owner?: string;
}) {
  const router = useRouter();
  const ops = useOutbox(owner);
  const online = useOnline();
  const [attendancePending, setAttendancePending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [forced, setForced] = useState(() => (typeof window === 'undefined' ? false : isForcedOffline()));

  const stats = queueStats(ops);
  const posture = syncPosture(stats, online);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const toggleOffline = () => {
    const next = !forced;
    setForcedOffline(next); setForced(next);
    flash(next ? 'Offline simulation enabled — capture queues on this device' : 'Offline simulation disabled — sync will be attempted when a connection is available');
    if (!next) setTimeout(() => router.refresh(), 1200);
  };

  return (
    <ConstructionFrame>
      {/* Hero */}
      <ConstructionSummary>
        <div className="relative flex items-center gap-3 flex-wrap">
          <span className="construction-summary-icon" ><HardHat size={22} /></span>
          <div className="min-w-0">
            <div className="text-[14px] text-text-3 flex items-center gap-1.5">
              FIELD CAPTURE ·
              <span className="inline-flex items-center gap-1" style={{ color: toneVar(posture.tone) }}>
                {online ? <Wifi size={11} /> : <WifiOff size={11} />} {posture.label}
              </span>
            </div>
            <h2 className="text-[20px] font-medium tracking-[-0.02em] leading-tight mt-0.5">Works with no signal</h2>
            <div className="text-[14px] text-text-3 mt-0.5">{posture.label === 'Synced' ? 'No queued changes on this device.' : posture.detail}</div>
          </div>
          <Button type="button" onClick={toggleOffline} className="ml-auto flex-none">
            {forced ? <><Wifi size={13} /> Restore signal</> : <><WifiOff size={13} /> Simulate no signal</>}
          </Button>
        </div>
      </ConstructionSummary>

      <PageTabs label="Construction field capture sections" items={[
        { id: 'report', label: 'Daily report', content: <fieldset disabled={!canCapture} className={styles.fieldset}><legend className="sr-only">Daily report capture</legend>{!canCapture && <p className={styles.notice}>Read-only access · construction capture permission is required.</p>}<ReportForm owner={owner} projects={projects} todayISO={todayISO} onCaptured={flash} online={online} /></fieldset> },
        { id: 'issue', label: 'Raise issue', content: <fieldset disabled={!canCapture} className={styles.fieldset}><legend className="sr-only">Issue capture</legend><IssueForm owner={owner} projects={projects} onCaptured={flash} online={online} /></fieldset> },
        { id: 'progress', label: 'Task progress', content: <fieldset disabled={!canCapture} className={styles.fieldset}><legend className="sr-only">Progress capture</legend><ProgressForm owner={owner} projects={projects} tasks={tasks} onCaptured={flash} online={online} /></fieldset> },
        { id: 'evidence', label: 'Evidence pack', content: <fieldset disabled={!canCapture} className={styles.fieldset}><legend className="sr-only">Evidence pack capture</legend><EvidencePackForm owner={owner} projects={projects} tasks={tasks} onCaptured={flash} online={online} /></fieldset> },
        {
          id: 'attendance', label: 'Quick attendance', content: (
            <ConstructionPanel >
              <div className={styles.header}><CardHeader title="Quick attendance" subtitle={`${displayDate(todayISO)} · WAT · ${workers.length} worker records`} /></div>
              <div className={styles.body}><p className={styles.notice}>Manual attendance uses each worker&apos;s assigned project and a recorded 07:00 WAT clock-in. It does not verify physical presence or a geofence.</p></div>
              <div>
                {workers.map((w) => (
                  <div key={w.id} className={`${styles.row} ${styles.toolbar}`}>
                    <div><p className={styles.rowTitle}>{w.name}</p><p className={styles.text}>{w.trade}</p></div>
                    <Button type="button" disabled={!canCapture || !owner || !w.projectId || attendancePending !== null}
                      onClick={async () => { setAttendancePending(w.id); try { await capture(owner, 'attendance', `${w.name} present · ${todayISO}`, { workerId: w.id, projectId: w.projectId, dateISO: todayISO, status: 'present', clockIn: '07:00' }); flash(`${w.name} clocked in — saved on this device`); } catch (error) { flash(error instanceof Error ? error.message : 'Capture failed; please retry.'); } finally { setAttendancePending(null); } }}
                      className="flex-none"><Check size={12} /> Present</Button>
                  </div>
                ))}
                {workers.length === 0 && <EmptyState title="No workers available for capture" description="Attendance capture requires a worker and a scoped project record." />}
              </div>
            </ConstructionPanel>
          )
        },
        { id: 'queue', label: 'Device outbox', count: stats.pending + stats.conflicts, content: <Outbox owner={owner} ops={ops} onToast={flash} /> }
      ]} />

      {toast && <ConstructionToast>{toast}</ConstructionToast>}
    </ConstructionFrame>
  );
}

/* --- capture forms -------------------------------------------------------- */

function ReportForm({ owner, projects, todayISO, onCaptured, online }: { owner?: string; projects: FieldProject[]; todayISO: string; onCaptured: (m: string) => void; online: boolean }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [dateISO, setDateISO] = useState(todayISO);
  const [weather, setWeather] = useState('');
  const [crew, setCrew] = useState('');
  const [completed, setCompleted] = useState<string[]>([]);
  const [ongoing, setOngoing] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);

  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (pending) return;
    setPending(true);
    try {
    const name = projects.find((p) => p.id === projectId)?.name ?? 'Site';
    await capture(owner, 'daily_report', `Daily report · ${name} · ${dateISO}`, {
      projectId, dateISO, weather, shift: 'day', workforceCount: Number(crew) || 0,
      completed, ongoing, delayed: [], plannedNext: [], deliveries: [], incidents: [], constraints, photos: photos.length,
    }, photos);
    setCompleted([]); setOngoing([]); setConstraints([]); setPhotos([]);
    onCaptured(online ? 'Report captured — queued for sync' : 'Report queued offline on this device — check the outbox when the connection returns');
    } catch (error) { onCaptured(error instanceof Error ? error.message : 'Capture failed. Your form and files were kept.'); } finally { setPending(false); }
  };

  return (
    <ConstructionPanel>
      <div className={styles.header}><CardHeader title="Daily site report" subtitle="Capture a local record for review and synchronisation; no site evidence is independently verified by this form." /></div>
      <div className={`${styles.body} ${styles.stack}`}>
      <div className={styles.formGrid}>
        <Field label="Project"><select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.length ? projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>) : <option value="">No projects available</option>}</select></Field>
        <Field label="Date · WAT"><input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} /></Field>
        <Field label="Crew on site"><input value={crew} onChange={(e) => setCrew(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" /></Field>
      </div>
      <Field label="Weather"><input value={weather} onChange={(e) => setWeather(e.target.value)} /></Field>

      <ListField label="Completed today" items={completed} setItems={setCompleted} placeholder="e.g. L4 columns struck" tone="success" />
      <ListField label="Ongoing" items={ongoing} setItems={setOngoing} placeholder="e.g. Rebar fixing to L4 slab" tone="progress" />
      <ListField label="Constraints" items={constraints} setItems={setConstraints} placeholder="e.g. Rebar delivery still outstanding" tone="warn" />

      <div className={styles.toolbar}>
        <label className={styles.fileButton}>
          <Camera size={18} /> Attach photo
          <input type="file" aria-label="Attach site photos" accept="image/*" multiple className="sr-only" onChange={(e) => { setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
        </label>
        {photos.length > 0 && <span className="text-[14px] text-text-3">{photos.length} photo{photos.length === 1 ? '' : 's'} · {Math.round(photos.reduce((n, f) => n + f.size, 0) / 1024)} KB held on this device</span>}
        <Button variant="primary" type="button" disabled={pending || !owner || !projectId || !dateISO || crew === ''} onClick={submit}><Check size={16} /> Submit report</Button>
      </div>
      {photos.length > 0 && <ul className={styles.list} aria-label="Attached site photo files">{photos.map((photo, index) => <li key={`${index}-${photo.name}`}>{photo.name} · {Math.round(photo.size / 1024)} KB</li>)}</ul>}
      <p className={styles.metadata}>Capture uses this device&apos;s outbox first. Attachments use IndexedDB storage; quota or storage failures can prevent persistence. Check the outbox acknowledgement before treating a report or photo as synced.</p>
      </div>
    </ConstructionPanel>
  );
}

function IssueForm({ owner, projects, onCaptured, online }: { owner?: string; projects: FieldProject[]; onCaptured: (m: string) => void; online: boolean }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [action, setAction] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <ConstructionPanel>
      <div className={styles.header}><CardHeader title="Raise a site issue" subtitle="Record the issue and proposed correction. Capture does not dispatch emergency services or verify completed corrective work." /></div>
      <div className={`${styles.body} ${styles.stack}`}>
      <div className={styles.formGrid}>
        <Field label="Project"><select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.length ? projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>) : <option value="">No projects available</option>}</select></Field>
        <Field label="Severity"><select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
      </div>
      <Field label="What's wrong"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Honeycombing on L3 column C4" /></Field>
      <Field label="Corrective action"><input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. Record the proposed correction for technical review" /></Field>
      <Button variant="primary" type="button"
        disabled={pending || !owner || !title.trim() || !projectId}
        onClick={async () => { if (pending) return; setPending(true); try { await capture(owner, 'site_issue', `Issue · ${title.trim()}`, { projectId, title: title.trim(), severity, category: 'Quality', correctiveAction: action.trim() }); setTitle(''); setAction(''); onCaptured(online ? 'Issue captured — queued for sync' : 'Issue queued offline on this device'); } catch (error) { onCaptured(error instanceof Error ? error.message : 'Capture failed. Your form was kept.'); } finally { setPending(false); } }}
        className="self-start"><Check size={14} /> Raise issue</Button>
      </div>
    </ConstructionPanel>
  );
}

function ProgressForm({ owner, projects, tasks, onCaptured, online }: { owner?: string; projects: FieldProject[]; tasks: FieldTask[]; onCaptured: (m: string) => void; online: boolean }) {
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? '');
  const task = tasks.find((t) => t.id === taskId);
  const [pending, setPending] = useState(false);
  const [pct, setPct] = useState(String(task?.percentComplete ?? 0));
  return (
    <ConstructionPanel>
      <div className={styles.header}><CardHeader title="Record task progress" subtitle="A local progress record must receive server acknowledgement. Lower progress is surfaced as a conflict, not a silent overwrite." /></div>
      <div className={`${styles.body} ${styles.stack}`}>
      <Field label="Task">
        <select value={taskId} onChange={(e) => { setTaskId(e.target.value); setPct(String(tasks.find((t) => t.id === e.target.value)?.percentComplete ?? 0)); }}>
          {tasks.length ? tasks.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.percentComplete}%</option>) : <option value="">No tasks available</option>}
        </select>
      </Field>
      <div>
        <div className={styles.barLabel}><span>Percent complete</span><output>{pct}%</output></div>
        <input type="range" min="0" max="100" step="5" value={pct} onChange={(e) => setPct(e.target.value)} className={styles.range} aria-label="Percent complete" aria-valuetext={`${pct}% complete`} />
        {task && Number(pct) < task.percentComplete && <p className={styles.notice}>Lower than the {task.percentComplete}% in the supplied server snapshot — this will be flagged as a conflict rather than silently overwriting it.</p>}
      </div>
      <Button variant="primary" type="button" disabled={pending || !owner || !task?.projectId}
        onClick={async () => { if (pending) return; setPending(true); try { await capture(owner, 'task_progress', `${task?.name ?? 'Task'} → ${pct}%`, { taskId, percentComplete: Number(pct), projectId: task?.projectId }); onCaptured(online ? 'Progress captured — queued for sync' : 'Progress queued offline on this device'); } catch (error) { onCaptured(error instanceof Error ? error.message : 'Capture failed. Your form was kept.'); } finally { setPending(false); } }}
        className="self-start"><Check size={14} /> Record progress</Button>
      <p className={styles.metadata}>Assigned project: {projects.find((p) => p.id === task?.projectId)?.name ?? 'No assigned project'}. Confirm the task and project before recording.</p>
      </div>
    </ConstructionPanel>
  );
}

function EvidencePackForm({ owner, projects, tasks, onCaptured, online }: { owner?: string; projects: FieldProject[]; tasks: FieldTask[]; onCaptured: (m: string) => void; online: boolean }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const availableTasks = tasks.filter((task) => task.projectId === projectId);
  const [subject, setSubject] = useState('quality_gate');
  const [subjectRef, setSubjectRef] = useState('');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (pending) return;
    setPending(true);
    try {
      await capture(owner, 'evidence_pack', `Evidence · ${title.trim()}`, { projectId, subject, subjectRef: subjectRef.trim(), title: title.trim() }, files);
      setTitle(''); setSubjectRef(''); setFiles([]);
      onCaptured(online ? 'Evidence pack captured — queued for upload and review' : 'Evidence pack saved on this device — it will upload when signal returns');
    } catch (error) { onCaptured(error instanceof Error ? error.message : 'Evidence capture failed. Your files were kept in the form.'); }
    finally { setPending(false); }
  };
  return <ConstructionPanel>
    <div className={styles.header}><CardHeader title="Mobile evidence pack" subtitle="Photos upload from the device outbox, retain their content references and require independent review before work can be approved." /></div>
    <div className={`${styles.body} ${styles.stack}`}>
      <div className={styles.formGrid}>
        <Field label="Project"><select value={projectId} onChange={(event) => { setProjectId(event.target.value); setSubjectRef(''); }}>{projects.length ? projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>) : <option value="">No projects available</option>}</select></Field>
        <Field label="Evidence type"><select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="quality_gate">Quality gate</option><option value="task">Task progress</option><option value="delivery">Delivery</option><option value="daily_report">Daily report</option><option value="variation">Variation</option><option value="claim">Claim</option></select></Field>
        <Field label="Related record"><input list="construction-evidence-records" value={subjectRef} onChange={(event) => setSubjectRef(event.target.value)} placeholder="Task, GRN, variation or claim reference" /><datalist id="construction-evidence-records">{availableTasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</datalist></Field>
        <Field label="Evidence title"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. L4 slab reinforcement inspection" /></Field>
      </div>
      <div className={styles.toolbar}>
        <label className={styles.fileButton}><Camera size={18} /> Add photos or PDFs<input type="file" aria-label="Add construction evidence files" accept="image/*,application/pdf" multiple className="sr-only" onChange={(event) => { setFiles((current) => [...current, ...Array.from(event.target.files ?? [])].slice(0, 20)); event.target.value = ''; }} /></label>
        <span className={styles.metadata}>{files.length} file{files.length === 1 ? '' : 's'} held on this device</span>
        <Button variant="primary" type="button" disabled={pending || !owner || !projectId || !subjectRef.trim() || !title.trim() || files.length === 0} onClick={submit}><Check size={16} /> {pending ? 'Saving…' : 'Capture evidence'}</Button>
      </div>
      {files.length ? <ul className={styles.list} aria-label="Construction evidence files">{files.map((file, index) => <li key={`${file.name}-${index}`} className={styles.listEntry}><span>{file.name} · {Math.ceil(file.size / 1024)} KB</span><IconButton type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></IconButton></li>)}</ul> : null}
      <p className={styles.metadata}>A captured file is not proof that work is correct. Its synced evidence pack must be reviewed, then linked to a field approval.</p>
    </div>
  </ConstructionPanel>;
}

/* --- outbox inspector ----------------------------------------------------- */

function Outbox({ owner, ops, onToast }: { owner?: string; ops: ReturnType<typeof useOutbox>; onToast: (m: string) => void }) {
  const router = useRouter();
  const stats = queueStats(ops);
  const sorted = [...ops].sort((a, b) => (a.status === 'synced' ? 1 : 0) - (b.status === 'synced' ? 1 : 0) || Date.parse(a.capturedISO) - Date.parse(b.capturedISO));

  return (
    <ConstructionFrame>
      <div className={styles.metrics}>
        <Kpi label="Waiting to send" value={String(stats.pending)} tone={stats.pending ? 'warn' : 'success'} />
        <Kpi label="Sending" value={String(stats.sending)} tone={stats.sending ? 'progress' : 'muted'} />
        <Kpi label="Needs review" value={String(stats.conflicts)} tone={stats.conflicts ? 'danger' : 'success'} />
        <Kpi label="Synced" value={String(stats.synced)} tone="success" />
      </div>

      <ConstructionPanel >
        <div className={styles.header}><CardHeader title="Device outbox" subtitle="Local queued records, server acknowledgements and conflicts · persistence depends on device storage" action={stats.synced > 0 ? <Button type="button" onClick={() => { clearSynced(owner); onToast('Cleared synced receipts'); }}>Clear synced</Button> : undefined} /></div>
        <div>
          {sorted.map((o) => (
            <section key={o.id} className={`${styles.row} ${styles.section}`} aria-label={`${o.label} outbox record`}>
              <CardHeader title={o.label} subtitle={`${OP_LABEL[o.kind as OpKind] ?? o.kind} · ${displayDate(o.capturedISO)} · WAT`} action={<StatusPill status={o.status} tone={STATUS_TONE[o.status]} />} />
              <dl className={styles.facts}><div><dt>Client record / idempotency key</dt><dd>{o.id}</dd></div><div><dt>Attachment references</dt><dd>{o.attachments}</dd></div></dl>
                  {o.error && <p className={styles.error}>{o.error}</p>}
                  {o.serverState && <p className={styles.notice}>Recorded server state: {o.serverState}</p>}
                <div className={styles.actions}>
                  {o.status === 'conflict' && (
                    <>
                      <Button type="button" onClick={() => { requeue(owner, o.id); onToast('Re-queued — will try again'); }} ><RefreshCw size={11} /> Retry</Button>
                      <Button type="button" onClick={async () => { try { await abandon(owner, o.id); onToast('Discarded — the server keeps its version'); router.refresh(); } catch (error) { onToast(error instanceof Error ? error.message : 'Discard failed. Your copy was kept.'); } }} style={{ color: toneVar('danger') }}><Trash2 size={11} /> Discard mine</Button>
                    </>
                  )}
                  {o.status === 'failed' && <Button type="button" onClick={() => { requeue(owner, o.id); onToast('Re-queued'); }} ><RefreshCw size={11} /> Retry now</Button>}
                  {o.status === 'synced' && <IconButton aria-label={`Remove receipt for ${o.label}`} type="button" onClick={() => removeOp(owner, o.id)} title="Remove receipt"><X size={18} /></IconButton>}
                </div>
            </section>
          ))}
          {ops.length === 0 && (
            <EmptyState icon={<CloudUpload size={24} />} title="Outbox empty" description="Capture a local report or issue, then check its queue state and server acknowledgement here." />
          )}
        </div>
      </ConstructionPanel>

      <div className={styles.notice}>
        <TriangleAlert size={18} />
        Each record carries a client-generated id that the server treats as an idempotency key: if a send times out and retries, the server recognises the id and confirms the original instead of applying it twice. Conflicts are server-authoritative — your copy is held, never silently overwritten, until you decide.
      </div>
    </ConstructionFrame>
  );
}

/* --- bits ----------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}
function ListField({ label, items, setItems, placeholder, tone }: { label: string; items: string[]; setItems: (v: string[]) => void; placeholder: string; tone: Tone }) {
  const [draft, setDraft] = useState('');
  const add = () => { if (draft.trim()) { setItems([...items, draft.trim()]); setDraft(''); } };
  return (
    <div className={styles.fieldSection}>
      <div className={styles.inline}><h3 className={styles.title}>{label}</h3><StatusPill status={`${items.length} entries`} tone={tone} /></div>
      <div className={styles.listEntry}>
        <input aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} className={styles.control} />
        <IconButton type="button" aria-label={'Add to ' + label.toLowerCase()} onClick={add} className="flex-none"><Plus size={14} /></IconButton>
      </div>
      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((it, i) => (
            <li key={i} className={styles.listEntry}>
              <span>{it}</span>
              <IconButton type="button" aria-label={'Remove ' + it} onClick={() => setItems(items.filter((_, k) => k !== i))} ><X size={14} /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
