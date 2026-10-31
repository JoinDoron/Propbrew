'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card, StatusPill } from '@/components/ui';
import { ConstructionFrame, ConstructionKpi, ConstructionPanel, ConstructionPanelHeader } from './construction-ui';
import { advanceConstructionQualityIssue, recordConstructionQualityIssue, type QualityIssueInput } from '@/server/actions/construction';
import type { Issue } from '@/domain/construction/types';
import { PageTabs } from '@/components/ui/page-tabs';
import styles from './quality-workspace.module.css';

type Category = QualityIssueInput['category'];
const categories: Category[] = ['Punch list', 'Authority inspection', 'Design clash'];
const labels: Record<Category, string> = { 'Punch list': 'Punch list', 'Authority inspection': 'Authority inspections', 'Design clash': 'Design coordination' };

export function QualityWorkspace({ projects, projectId, issues, taskNames, today, canCreate, canUpdate }: {
  projects: { id: string; name: string; code: string }[]; projectId: string; issues: Issue[]; taskNames: string[]; today: string; canCreate: boolean; canUpdate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<Category>('Punch list');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionEvidence, setActionEvidence] = useState('');
  const open = issues.filter((issue) => issue.status !== 'resolved');
  const changeProject = (id: string) => router.push(`/construction/quality?projectId=${encodeURIComponent(id)}`);
  const submit = (form: FormData) => {
    const input: QualityIssueInput = {
      projectId, category, title: String(form.get('title') ?? ''), severity: String(form.get('severity') ?? 'medium') as QualityIssueInput['severity'],
      owner: String(form.get('owner') ?? ''), dueISO: String(form.get('dueISO') ?? ''), location: String(form.get('location') ?? ''),
      sourceReference: String(form.get('sourceReference') ?? ''), relatedReference: String(form.get('relatedReference') ?? ''),
      authority: String(form.get('authority') ?? ''), evidenceReference: String(form.get('evidenceReference') ?? ''),
    };
    startTransition(async () => {
      const result = await recordConstructionQualityIssue(input);
      setMessage(result.ok ? `${category} recorded for this project.` : result.error);
      if (result.ok) { (document.getElementById('construction-quality-form') as HTMLFormElement | null)?.reset(); router.refresh(); }
    });
  };
  const advance = (id: string, status: 'in_progress' | 'resolved') => {
    startTransition(async () => {
      const result = await advanceConstructionQualityIssue(id, status, actionNote, actionEvidence);
      setMessage(result.ok ? `Issue ${status === 'resolved' ? 'resolved' : 'in progress'}.` : result.error);
      if (result.ok) { setEditing(null); setActionNote(''); setActionEvidence(''); router.refresh(); }
    });
  };
  const rows = (kind: Category) => <div className={styles.stack}>
    {issues.filter((issue) => issue.category === kind).map((issue) => <Card key={issue.id} className={styles.issue}>
      <div className={styles.issueHead}><div><p className={styles.meta}>{issue.location || 'Location not recorded'} · due {issue.dueISO}</p><h3>{issue.title}</h3></div><div className={styles.pills}><StatusPill status={issue.severity} tone={issue.severity === 'critical' || issue.severity === 'high' ? 'danger' : 'warn'} /><StatusPill status={issue.status.replaceAll('_', ' ')} tone={issue.status === 'resolved' ? 'success' : 'info'} /></div></div>
      <div className={styles.details}><span>Owner: {issue.owner}</span>{issue.authority && <span>Authority: {issue.authority}</span>}{issue.sourceReference && <span>Source: {issue.sourceReference}</span>}{issue.relatedReference && <span>Conflicts with: {issue.relatedReference}</span>}</div>
      {issue.correctiveAction && <p className={styles.note}>Action: {issue.correctiveAction}</p>}
      {issue.evidenceReference && <p className={styles.note}>Evidence: {issue.evidenceReference}</p>}
      {canUpdate && issue.status !== 'resolved' && <div className={styles.actions}><Button type="button" onClick={() => { setEditing(editing === issue.id ? null : issue.id); setMessage(''); }}>Update issue</Button></div>}
      {editing === issue.id && <div className={styles.editor}><label>Action taken<textarea value={actionNote} onChange={(event) => setActionNote(event.target.value)} minLength={8} maxLength={1000} required /></label><label>Evidence reference for resolution<input value={actionEvidence} onChange={(event) => setActionEvidence(event.target.value)} placeholder="Document, photo or inspection record ID" /></label><div className={styles.actions}><Button type="button" disabled={pending} onClick={() => advance(issue.id, 'in_progress')}>Mark in progress</Button><Button type="button" variant="primary" disabled={pending} onClick={() => advance(issue.id, 'resolved')}>Resolve with evidence</Button></div></div>}
    </Card>)}
    {!issues.some((issue) => issue.category === kind) && <Card><p className={styles.empty}>No {labels[kind].toLowerCase()} recorded for this project.</p></Card>}
  </div>;

  return <ConstructionFrame>
    <div className={styles.heading}><div><p className={styles.eyebrow}>CONSTRUCTION · PROJECT QUALITY</p><h1>Quality & coordination</h1><p>Punch items, authority visits and drawing or model conflicts in one project record.</p></div><label className={styles.projectSelect}>Project<select aria-label="Construction project" value={projectId} onChange={(event) => changeProject(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label></div>
    {!projectId ? <Card><p className={styles.empty}>No construction project is available to this account.</p></Card> : <>
      <div className={styles.metrics}><ConstructionKpi label="Open quality items" value={String(open.length)} tone={open.length ? 'warn' : 'success'} /><ConstructionKpi label="Punch list" value={String(open.filter((issue) => issue.category === 'Punch list').length)} tone="info" /><ConstructionKpi label="Authority inspections" value={String(open.filter((issue) => issue.category === 'Authority inspection').length)} tone="info" /><ConstructionKpi label="Recorded design clashes" value={String(open.filter((issue) => issue.category === 'Design clash').length)} tone="warn" /></div>
      <Card className={styles.boundary}><strong>Design coordination register</strong><p>These are reported conflicts between drawings or models. Propbrew does not yet compare BIM geometry automatically or certify clash-free construction. Check current approved revisions and resolve each issue with evidence.</p></Card>
      {canCreate && <ConstructionPanel><ConstructionPanelHeader title="Record a quality item" subtitle="Assign an owner, location and due date. Evidence is required before resolution." /><form id="construction-quality-form" className={styles.form} action={submit}><label>Record type<select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{categories.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></label><label>Title<input name="title" required minLength={4} maxLength={180} placeholder="Describe the issue" /></label><label>Location / zone<input name="location" required minLength={2} maxLength={160} placeholder="Block, floor or grid" /></label><label>Owner<input name="owner" required minLength={2} maxLength={100} placeholder="Responsible person or firm" /></label><label>Due date<input name="dueISO" type="date" defaultValue={today} required /></label><label>Severity<select name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>{category === 'Authority inspection' && <label>Inspecting authority<input name="authority" required placeholder="e.g. state building control agency" /></label>}{category === 'Design clash' && <><label>Drawing / model reference<input name="sourceReference" required placeholder="Current revision or model element" /></label><label>Conflicting reference<input name="relatedReference" required placeholder="Other revision or model element" /></label></>}{category === 'Punch list' && <label>Drawing / task reference<input name="sourceReference" list="construction-quality-tasks" placeholder="Optional task or drawing" /><datalist id="construction-quality-tasks">{taskNames.map((name) => <option key={name} value={name} />)}</datalist></label>}<label>Evidence reference<input name="evidenceReference" maxLength={500} placeholder="Optional photo, document or inspection ID" /></label><div className={styles.formAction}><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Record item'}</Button></div></form></ConstructionPanel>}
      {message && <p role="status" className={styles.feedback}>{message}</p>}
      <PageTabs label="Construction quality registers" items={categories.map((kind) => ({ id: kind, label: labels[kind], count: issues.filter((issue) => issue.category === kind).length, content: rows(kind) }))} />
    </>}
  </ConstructionFrame>;
}
