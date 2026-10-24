'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, FileText, Link2, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { Button, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';
import { useConstructionReview, ConstructionFrame, ConstructionSummary, ConstructionPanel, ConstructionToast, ConstructionKpi } from './construction-ui';
import { publishDigest } from '@/server/actions/construction';
import { type Tone } from '@/lib/status-tones';
import styles from './construction-insights-polish.module.css';

export type DigestView = {
  projectId: string; projectName: string; code: string; weekOfISO: string;
  sections: { title: string; text: string; confidence: number; sources: { label: string; href: string }[] }[];
  coverageGaps: string[];
  deltas: { label: string; value: string; tone: Tone }[];
};
const date = (value: string) => {
  const parsed = new Date(value.slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export function DigestWorkspace({ views, canMutate }: { views: DigestView[]; canMutate: boolean }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [gapReview, setGapReview] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const view = views[index] ?? views[0];
  const reviewKey = view ? JSON.stringify([view.projectId, view.weekOfISO, view.coverageGaps]) : '';
  const confirmed = gapReview === reviewKey;
  const flash = (message: string) => { setToast(message); setTimeout(() => setToast(null), 3000); };
  const { act, confirmation, pending } = useConstructionReview(() => router.refresh(), flash);
  if (!view) return <ConstructionFrame><PageHeader title="Weekly digest" subtitle="Source-linked project summaries, reviewed before publication." /><PageTabs label="Weekly digest sections" items={[{ id: 'draft', label: 'Draft digest', content: <ConstructionPanel><EmptyState icon={<FileText size={26} />} title="No projects to report on." description="A digest can be prepared when a project and its source records are available in your current scope." /></ConstructionPanel> }]} /></ConstructionFrame>;
  const publish = () => act(() => publishDigest(view.projectId), 'Review digest for ' + view.projectName, 'This demonstration checks the review action only. Publication storage, recipients and external delivery are not connected; nothing will be sent.');

  return <ConstructionFrame>
    <PageHeader title="Weekly digest" subtitle="Source-linked project summaries, reviewed before publication." />
    <div className={styles.actions + ' justify-start'} role="group" aria-label="Select digest project">{views.map((project, projectIndex) => <Button type="button" aria-pressed={project.projectId === view.projectId} key={project.projectId} onClick={() => { setIndex(projectIndex); setGapReview(null); }}>{project.projectName}</Button>)}</div>
    <ConstructionSummary><CardHeader title={view.projectName} subtitle={view.code + ' · week of ' + date(view.weekOfISO)} action={<Sparkles size={20} className="text-primary" />} /><p className={styles.text}>Compiled from recorded project sources, with approved site-report narratives where available. Each section exposes its linked sources and a deterministic rule-match score, not calibrated certainty.</p></ConstructionSummary>
    {view.coverageGaps.length ? <ConstructionPanel><div className={styles.header}><CardHeader title="Confirm the reporting gaps" subtitle="No approved site report was supplied for these operating dates" action={<StatusPill status={view.coverageGaps.length + ' gap(s)'} tone="warn" />} /></div><div className={styles.body}><div className={styles.stack}><p className={styles.text}>The digest reports missing approved reports as a gap rather than filling in work that has not been evidenced.</p><ul className={styles.list}>{view.coverageGaps.map((gap, gapIndex) => <li key={gap + '-' + gapIndex} className={styles.text}>{date(gap)}</li>)}</ul>{canMutate && !confirmed ? <div className={styles.actions}><Button type="button" icon={<Check size={16} />} onClick={() => setGapReview(reviewKey)}>I&apos;ve reviewed the gaps</Button></div> : null}{confirmed ? <StatusPill status="Gaps acknowledged for this preview" tone="info" /> : null}</div></div><p className={styles.footer}>Acknowledgement applies to this project, week and gap list in the current session. It does not approve missing site evidence or save a publication.</p></ConstructionPanel> : null}
    <PageTabs label="Weekly digest sections" items={[
      { id: 'overview', label: 'Overview', content: <div className={styles.stack}>{view.deltas.length ? <div className={styles.metrics}>{view.deltas.map((delta, deltaIndex) => <ConstructionKpi key={delta.label + '-' + deltaIndex} label={delta.label} value={delta.value} tone={delta.tone} />)}</div> : <ConstructionPanel><EmptyState title="No overview figures supplied" description="The current project digest has no recorded summary metrics." /></ConstructionPanel>}<ConstructionPanel><div className={styles.header}><CardHeader title="Source coverage" subtitle="Review missing fields and the linked evidence before interpreting the narrative" action={<ShieldCheck size={18} className="text-primary" />} /></div><div className={styles.body}><dl className={styles.facts}><div><dt>Digest week</dt><dd>{date(view.weekOfISO)}</dd></div><div><dt>Narrative sections</dt><dd>{view.sections.length}</dd></div><div><dt>Missing approved-report dates</dt><dd>{view.coverageGaps.length}</dd></div><div><dt>Publication and delivery</dt><dd>Not connected</dd></div></dl></div></ConstructionPanel></div> },
      { id: 'draft', label: 'Draft digest', content: <div className={styles.stack}>{view.sections.length ? view.sections.map((section, sectionIndex) => <ConstructionPanel key={section.title + '-' + sectionIndex}><div className={styles.header}><CardHeader title={section.title} subtitle="Narrative generated from recorded project evidence and fixed rules" action={<StatusPill status={'Rule-match ' + Math.round(section.confidence * 100) + '%'} tone="info" />} /></div><div className={styles.body}><div className={styles.stack}><p className={styles.text + ' whitespace-pre-wrap'}>{section.text || 'No narrative text was supplied for this section.'}</p><p className={styles.metadata}>Rule-match score {Math.round(section.confidence * 100)}% · not calibrated certainty or independent verification.</p></div></div><div className={styles.footer}><h3 className={styles.rowTitle}>Source records</h3>{section.sources.length ? <div className={styles.actions + ' justify-start mt-3'}>{section.sources.map((source, sourceIndex) => <Link key={source.href + '-' + sourceIndex} href={source.href} className={styles.link}><Link2 size={16} aria-hidden="true" />{source.label}</Link>)}</div> : <p className={styles.text + ' mt-3'}>No source link was supplied for this section. Verify the underlying record before relying on this narrative.</p>}</div></ConstructionPanel>) : <ConstructionPanel><EmptyState icon={<FileText size={26} />} title="No draft sections supplied" description="No project narrative was supplied for the current digest week. Missing content is not filled in automatically." /></ConstructionPanel>}
        <ConstructionPanel><div className={styles.header}><CardHeader title="Human sign-off required" subtitle="Review preview only · no publication storage or recipient delivery" action={<TriangleAlert size={18} className="text-warning" />} /></div><div className={styles.body}><div className={styles.stack}><p className={styles.text}>Review the cited records and coverage gaps. This demo does not save a publication or send messages; the review action is a preview only.</p>{canMutate ? <div className={styles.actions}><Button variant="primary" type="button" disabled={pending || (view.coverageGaps.length > 0 && !confirmed)} onClick={publish}>{pending ? 'Checking…' : 'Review publication preview'}</Button></div> : <p className={styles.metadata}>Read-only digest. An authorised operator is required to review the publication preview.</p>}</div></div><p className={styles.footer}>No claim is independently verified by the rule-match score. Check the source project and approval authority before finalising a real client communication.</p></ConstructionPanel>
      </div> },
    ]} />
    {confirmation}
    {toast ? <ConstructionToast>{toast}</ConstructionToast> : null}
  </ConstructionFrame>;
}
