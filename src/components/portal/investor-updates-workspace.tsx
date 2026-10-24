'use client';

import { useId, useState } from 'react';
import { CalendarClock, HardHat, FileText, Download, ChevronDown } from 'lucide-react';
import { EmptyState, StatusPill } from '@/components/ui';
import { PortalCard } from './portal-patterns';
import { PageTabs } from '@/components/ui/page-tabs';
import type { InvestorProject } from '@/domain/entities';
import { constructionProgress, handoverCountdown } from '@/domain/investor-portal';
import { NOW_MS } from '@/domain/ppm';
import layout from '@/components/ui/workspace-layout.module.css';

const monthLabel = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
function isoAddMonths(iso: string, amount: number) { const date = new Date(iso); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 10); }
const DOCS = [{ name: 'Allocation letter', kind: 'Ownership' }, { name: 'Sale & Purchase Agreement', kind: 'Contract' }, { name: 'Payment receipts', kind: 'Finance' }, { name: 'Latest construction report', kind: 'Progress' }];

export function InvestorUpdatesWorkspace({ projects }: { projects: InvestorProject[] }) {
  const [openId, setOpenId] = useState<string | null>(projects[0]?.id ?? null);
  return <div className={layout.layout}><div className={layout.notice}><HardHat size={18} /><p>Modelled project updates and sample documents<span>Construction milestones and dates are generated from lifecycle assumptions, not signed site reports. Documents are downloadable sample text only: not allocation evidence, legal agreements, payment receipts or verified construction reports.</span></p></div><PageTabs label="Investor update sections" items={[
    { id: 'progress', label: 'Construction updates', content: <div className={layout.layout}>{projects.length ? projects.map((project) => <ProjectUpdates key={project.id} project={project} view="progress" open={openId === project.id} onToggle={() => setOpenId(openId === project.id ? null : project.id)} />) : <PortalCard><EmptyState title="No project updates available" description="Only projects linked to your investor scope appear here." /></PortalCard>}</div> },
    { id: 'documents', label: 'Project documents', content: <div className={layout.layout}>{projects.length ? projects.map((project) => <ProjectUpdates key={project.id} project={project} view="documents" open={openId === project.id} onToggle={() => setOpenId(openId === project.id ? null : project.id)} />) : <PortalCard><EmptyState title="No project documents available" description="No project records are linked to your investor scope." /></PortalCard>}</div> },
  ]} /></div>;
}

function ProjectUpdates({ project, open, onToggle, view }: { project: InvestorProject; open: boolean; onToggle: () => void; view: 'progress' | 'documents' }) {
  const id = useId();
  const headingId = `${id}-heading`;
  const contentId = `${id}-content`;
  const progress = constructionProgress(project);
  const countdown = handoverCountdown(project.handoverDate, NOW_MS);
  const handoverISO = `${project.handoverDate.slice(0, 7)}-01`;
  const feed = progress.milestones.filter((milestone) => milestone.state !== 'upcoming').map((milestone) => ({ label: milestone.label, done: milestone.state === 'done', when: monthLabel(isoAddMonths(handoverISO, -Math.round((100 - milestone.threshold) / 100 * 24))) })).reverse();
  function download(name: string) {
    const text = `PROPBREW — SAMPLE ONLY — NOT A LEGAL OR FINANCIAL DOCUMENT\n\nSample type: ${name}\nProject: ${project.name}\nLocation: ${project.location}\nRecorded lifecycle: ${project.status}\nModelled construction progress: ${progress.pct}%\nScheduled handover: ${monthLabel(handoverISO)}\n\nThis file is generated demo text. It is not an allocation letter, sale agreement, payment receipt, verified construction report or proof of ownership. No original or signed document is attached.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `SAMPLE-ONLY-${project.name.split(' (')[0]}-${name}.txt`.replace(/[^a-zA-Z0-9.\-]/g, '-'); anchor.click(); URL.revokeObjectURL(url);
  }
  return <PortalCard padded={false}>
    <h3><button type="button" id={headingId} aria-expanded={open} aria-controls={contentId} onClick={onToggle} className="w-full min-h-16 p-6 text-left flex items-start gap-4 hover:bg-surface-2 rounded-[12px]"><HardHat size={20} aria-hidden="true" className="text-primary flex-none mt-1" /><span className="min-w-0 flex-1"><span className={layout.sectionTitle}>{project.name.split(' (')[0]}</span><span className={`${layout.metadata} flex flex-wrap items-center gap-2 mt-2`}><CalendarClock aria-hidden="true" size={14} />Modelled progress {progress.pct}% · {countdown.days <= 0 ? 'Scheduled handover date passed; completion unverified' : `${countdown.label} to scheduled handover`}</span></span><ChevronDown aria-hidden="true" size={20} className={`text-text-3 flex-none mt-1 ${open ? 'rotate-180' : ''}`} /></button></h3>
    <div id={contentId} role="region" aria-labelledby={headingId} hidden={!open}><div className={layout.dialogBody}>{view === 'progress' ? <><p className={layout.body}>Illustrative milestone history. Dates are estimated backwards from the scheduled handover, not from dated site evidence.</p><progress aria-label={`${project.name} modelled construction progress`} value={progress.pct} max={100} className="h-2 w-full accent-primary" /><ol className="m-0 p-0 list-none space-y-6">{feed.map((update) => <li key={update.label} className="border-l-2 border-border pl-4"><div className={layout.toolbar}><h4 className={layout.title}>{update.label}</h4><StatusPill status={update.done ? 'Modelled complete' : 'Modelled in progress'} tone={update.done ? 'success' : 'info'} /></div><p className={`${layout.metadata} mt-2`}>Illustrative date: {update.when}</p></li>)}</ol></> : <><p className={layout.body}>Sample download library. No original, signed or verified project document is attached.</p><ul className="m-0 p-0 list-none divide-y divide-border">{DOCS.map((document) => <li key={document.name}><button type="button" onClick={() => download(document.name)} className="w-full min-h-16 py-4 flex items-center gap-4 text-left" aria-label={`Download sample only: ${document.name}`}><FileText aria-hidden="true" size={20} className="text-primary flex-none" /><span className="min-w-0 flex-1"><span className={layout.title}>{document.name} · sample only</span><span className={layout.metadata}>{document.kind} · generated text, not a verified document</span></span><Download aria-hidden="true" size={18} className="text-text-3 flex-none" /></button></li>)}</ul></>}</div></div>
  </PortalCard>;
}
