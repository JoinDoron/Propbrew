'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, Languages, Megaphone, Search, Send, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { Card, CardHeader, KpiCard, StatusPill, Button, IconButton, EmptyState } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import type { Announcement } from '@/domain/entities';
import type { AnnouncementScope } from '@/domain/enums';
import { CHANNELS, BLOCKS, composeDraft, estimateReach, targetSize, analytics, readRate, engagementTone, type Channel, type Composed } from '@/domain/announcements';
import { sendAnnouncement } from '@/server/actions/announcements';
import { toneVar } from '@/lib/status-tones';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './announcements-workspace.module.css';

const SCOPES: AnnouncementScope[] = ['broadcast', 'estate', 'building'];
const AUDIENCES = ['All residents', 'Owners', 'Tenants', 'Committee'];

export function AnnouncementsWorkspace({ rows, canMutate }: { rows: readonly Announcement[]; canMutate: boolean }) {
  const [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const a = analytics(rows);
  const filtered = rows.filter((row) => `${row.title} ${row.body} ${row.audience}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className={layout.layout}>
    <div className={layout.toolbar}><div><h2 className={layout.sectionTitle}>Resident communications</h2><p className={layout.metadata}>Notices, audience targeting and recorded engagement in one place.</p></div>{canMutate ? <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => setComposing(true)}>Compose announcement</Button> : <StatusPill status="Read-only access" tone="muted" />}</div>
    <PageTabs label="Announcement sections" items={[
      { id: 'announcements', label: 'Announcements', content: <div className={layout.layout}>
        <Card><CardHeader title="Announcement register" subtitle="Read the full notice or prepare a manager-reviewed message." /><label className={layout.search}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search announcements" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notices, audience or message…" /></label><p className={layout.metadata}>Showing {filtered.length} of {rows.length} announcements</p></Card>
        {filtered.length ? <div className={layout.analytics}>{filtered.map((an) => {
          const rate = readRate(an);
          return <Card key={an.id} className={styles.noticeCard}>
            <div className={styles.noticeMeta}><StatusPill status={an.sentAt ? 'Recorded as sent' : 'Not sent'} tone={an.sentAt ? 'success' : 'warn'} /><span className={layout.metadata}>{an.scope} · {an.audience}</span>{an.aiDrafted && <StatusPill status="AI-drafted" tone="progress" />}</div>
            <h3 className={layout.sectionTitle}>{an.title}</h3><p className={styles.excerpt}>{an.body}</p>
            <div className={styles.readSummary}><div className={styles.noticeMeta}><span className={layout.metadata}>Recorded reads</span><span className={styles.count}>{an.read.toLocaleString()} / {an.delivered.toLocaleString()} · {rate}%</span></div><div className={styles.meter} role="img" aria-label={`${rate}% recorded read rate; ${an.read} reads from ${an.delivered} deliveries`}><span style={{ width: `${rate}%`, background: toneVar(engagementTone(rate)) }} /></div></div>
            <Button icon={<Eye size={16} />} onClick={() => setSelected(an)} aria-label={`View announcement ${an.title}`}>View notice</Button>
          </Card>;
        })}</div> : <Card><EmptyState icon={<Megaphone size={24} />} title={rows.length ? 'No announcements match your search' : 'No announcements in your scope yet'} description={rows.length ? 'Try another title, audience or message.' : canMutate ? 'Compose your first notice and review it before publishing.' : 'Published notices will appear here when available.'} /></Card>}
      </div> },
      { id: 'delivery', label: 'Delivery overview', content: <div className={layout.layout}>
        <div className={layout.metrics}><KpiCard label="Recorded as sent" value={String(a.sent)} icon={<Megaphone size={18} />} /><KpiCard label="Recorded deliveries" value={a.totalDelivered.toLocaleString()} icon={<Send size={18} />} /><KpiCard label="Average read rate" value={`${a.avgReadRate}%`} icon={<Users size={18} />} /><KpiCard label="Recorded reads" value={a.totalRead.toLocaleString()} icon={<Check size={18} />} /></div>
        <Card><CardHeader title="Delivery and engagement" subtitle="A snapshot of the notice records currently in your scope." /><div className="pb-table-scroll" role="region" aria-label="Announcement delivery register" tabIndex={0}><table className={`pb-data-table ${layout.table}`}><thead><tr>{['Announcement', 'Audience', 'Delivery record', 'Read rate', 'Details'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((an) => <tr key={an.id}><td><span className={styles.tableTitle}>{an.title}</span></td><td>{an.audience}</td><td>{an.delivered.toLocaleString()} deliveries · {an.read.toLocaleString()} reads</td><td>{readRate(an)}%</td><td><Button onClick={() => setSelected(an)} aria-label={`Review delivery record for ${an.title}`}>Review</Button></td></tr>)}</tbody></table></div>{!rows.length && <EmptyState icon={<Send size={24} />} title="No delivery records yet" description="Recorded engagement will appear when notices are available." />}<p className={layout.notice}>{a.drafts} notice(s) are not marked as sent. These are application records, not independently verified provider callbacks. Audience estimates use demonstration assumptions.</p></Card>
      </div> },
    ]} />
    {canMutate && composing && <Composer onClose={() => setComposing(false)} onSent={(text) => { setComposing(false); setMessage(text); }} />}
    {selected && <PortalDialog label="Announcement details" onClose={() => setSelected(null)} drawer width={600}><div className={layout.drawer}><div className={layout.dialogHeader}><div><h2 className={layout.dialogTitle}>{selected.title}</h2><p className={layout.metadata}>{selected.scope} · {selected.audience}</p></div><IconButton aria-label="Close announcement details" onClick={() => setSelected(null)}><X size={18} /></IconButton></div><div className={layout.dialogBody}><StatusPill status={selected.sentAt ? 'Recorded as sent' : 'Not sent'} tone={selected.sentAt ? 'success' : 'warn'} /><p className={styles.fullMessage}>{selected.body}</p><div className={layout.notice}>{selected.read.toLocaleString()} recorded reads · {selected.delivered.toLocaleString()} recorded deliveries. Provider delivery is not verified by this screen.</div></div></div></PortalDialog>}
    {message && <div className={layout.feedback} role="status"><span>{message}</span><IconButton aria-label="Dismiss announcement notification" onClick={() => setMessage(null)}><X size={18} /></IconButton></div>}
  </div>;
}

export function Composer({ onClose, onSent }: { onClose: () => void; onSent: (message: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [topic, setTopic] = useState('');
  const [composed, setComposed] = useState<Composed | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [lang, setLang] = useState<'en' | 'pcm'>('en');
  const [aiDrafted, setAiDrafted] = useState(false);
  const [approved, setApproved] = useState(false);
  const [scope, setScope] = useState<AnnouncementScope>('estate');
  const [audience, setAudience] = useState('All residents');
  const [block, setBlock] = useState('Block C');
  const [channels, setChannels] = useState<Channel[]>(['in_app', 'push']);
  const [schedule, setSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const size = targetSize(scope, audience, block);
  const reach = estimateReach(size, channels);
  const needsApproval = aiDrafted && !approved;
  const valid = Boolean(title.trim() && body.trim() && channels.length && !needsApproval && (!schedule || scheduleAt));
  function draft() { if (!topic.trim() || pending) return; const next = composeDraft(topic.trim()); setComposed(next); setTitle(next.draft.title); setBody(next.draft.body); setAiDrafted(true); setApproved(false); setLang('en'); setError(null); }
  function switchLang(next: 'en' | 'pcm') { if (!composed || pending) return; const translated = next === 'en' ? composed.draft : composed.pidgin; setLang(next); setTitle(translated.title); setBody(translated.body); setAiDrafted(true); setApproved(false); }
  function submit() {
    if (pending || !valid || !reviewing) return;
    const when = schedule ? new Date(scheduleAt) : null;
    if (when && (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now())) { setError('Choose a future date and time for this scheduled record.'); return; }
    setError(null);
    start(async () => { try { const result = await sendAnnouncement({ title, body, scope, audience, block, channels, aiDrafted, approved, scheduleAt: when?.toISOString() ?? null }); if (!result.ok) { setError(result.error); return; } router.refresh(); onSent(result.scheduled ? 'Scheduled announcement record saved. Delivery scheduling is not connected here.' : 'Announcement record saved. External channel delivery is not verified here.'); } catch { setError('The announcement could not be saved. Please try again.'); } });
  }
  return <PortalDialog label="Compose announcement" onClose={onClose} width={640} drawer canClose={!pending}><div className={layout.drawer}>
    <div className={layout.dialogHeader}><div><h2 className={layout.dialogTitle}>{reviewing ? 'Review announcement' : 'Compose announcement'}</h2><p className={layout.metadata}>A clear message, with a human decision before publishing.</p></div><IconButton aria-label="Close announcement composer" disabled={pending} onClick={onClose}><X size={18} /></IconButton></div>
    <form onSubmit={(event) => { event.preventDefault(); if (reviewing) submit(); else if (valid) setReviewing(true); }} aria-busy={pending}>
      <fieldset disabled={pending} className={styles.fields}>{!reviewing ? <>
        <section className={styles.draftPanel}><h3 className={layout.sectionTitle}><Sparkles size={16} aria-hidden="true" /> Assisted draft preview</h3><p className={layout.metadata}>Uses local message templates, not a connected AI provider. Review names, dates and translations.</p><label className="pb-form-label" htmlFor="announcement-topic">What is the notice about?</label><div className={styles.draftInput}><input id="announcement-topic" className="pb-form-control" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. water supply cut Saturday morning" /><Button type="button" onClick={draft} disabled={!topic.trim()} icon={<Sparkles size={16} />}>Draft preview</Button></div>{composed && <div className={styles.noticeMeta}><Languages size={16} aria-hidden="true" />{(['en', 'pcm'] as const).map((value) => <Button key={value} type="button" aria-pressed={lang === value} variant={lang === value ? 'primary' : 'secondary'} onClick={() => switchLang(value)}>{value === 'en' ? 'English' : 'Pidgin'}</Button>)}</div>}</section>
        <div><label className="pb-form-label" htmlFor="announcement-title">Title</label><input id="announcement-title" className="pb-form-control" value={title} onChange={(event) => { setTitle(event.target.value); setApproved(false); }} required placeholder="Announcement title" /></div>
        <div><label className="pb-form-label" htmlFor="announcement-message">Message</label><textarea id="announcement-message" className="pb-form-control" rows={6} value={body} onChange={(event) => { setBody(event.target.value); setApproved(false); }} required placeholder="Write a clear message for residents" /></div>
        <div className={styles.formGrid}><div><label className="pb-form-label" htmlFor="announcement-scope">Scope</label><select id="announcement-scope" className="pb-form-control" value={scope} onChange={(event) => setScope(event.target.value as AnnouncementScope)}>{SCOPES.map((value) => <option key={value}>{value}</option>)}</select></div><div><label className="pb-form-label" htmlFor="announcement-audience">{scope === 'building' ? 'Block' : 'Audience'}</label><select id="announcement-audience" className="pb-form-control" value={scope === 'building' ? block : audience} onChange={(event) => scope === 'building' ? setBlock(event.target.value) : setAudience(event.target.value)}>{(scope === 'building' ? Object.keys(BLOCKS) : AUDIENCES).map((value) => <option key={value}>{value}</option>)}</select></div></div>
        <fieldset className={styles.channelGroup}><legend className="pb-form-label">Delivery channels</legend><div className={styles.noticeMeta}>{CHANNELS.map((channel) => <label key={channel.key} className={styles.channel}><input type="checkbox" checked={channels.includes(channel.key)} onChange={() => setChannels((current) => current.includes(channel.key) ? current.filter((value) => value !== channel.key) : [...current, channel.key])} />{channel.label}</label>)}</div></fieldset>
        <p className={layout.notice}>Demonstration estimate: ~{reach.toLocaleString()} of {size.toLocaleString()} assumed recipients. This is not a verified recipient list or delivery guarantee.</p>
        {aiDrafted && <label className={styles.approval}><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span><strong><ShieldCheck size={16} aria-hidden="true" /> Manager approval</strong><span className={layout.metadata}>I have reviewed this assisted draft and approve it for the selected audience. Editing the text requires approval again.</span></span></label>}
        <label className={styles.channel}><input type="checkbox" checked={schedule} onChange={(event) => setSchedule(event.target.checked)} />Save as a scheduled announcement record</label>
        {schedule && <div><label className="pb-form-label" htmlFor="announcement-schedule">Scheduled date and time (your local time)</label><input id="announcement-schedule" type="datetime-local" className="pb-form-control" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} required /><p className={layout.metadata}>Saves the requested schedule; no background delivery worker is connected here.</p></div>}
      </> : <><StatusPill status={schedule ? 'Scheduled record' : 'Publish record'} tone="progress" /><h3 className={layout.sectionTitle}>{title}</h3><p className={styles.fullMessage}>{body}</p><div className={layout.notice}>{scope === 'building' ? block : audience} · {scope}<br />Channels requested: {channels.map((value) => CHANNELS.find((item) => item.key === value)?.label ?? value).join(', ')}{schedule && <><br />Requested local time: {scheduleAt.replace('T', ' ')}</>}</div><p className={layout.metadata}>Confirming saves this notice in Propbrew. It does not verify SMS, email or push delivery. Assisted drafts require manager approval.</p></>}{error && <p role="alert" className={styles.error}>{error}</p>}</fieldset>
      <div className={`${layout.actions} ${styles.dialogActions}`}><Button type="button" disabled={pending} onClick={reviewing ? () => { setReviewing(false); setError(null); } : onClose}>{reviewing ? 'Back to edit' : 'Cancel'}</Button><Button variant="primary" type="submit" disabled={pending || !valid} icon={reviewing ? <Send size={16} /> : <Eye size={16} />}>{pending ? 'Saving…' : reviewing ? 'Confirm and save notice' : 'Review announcement'}</Button></div>
    </form>
  </div></PortalDialog>;
}
