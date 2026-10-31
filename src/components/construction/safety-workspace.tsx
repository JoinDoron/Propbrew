'use client';

import { ConstructionSummary, ConstructionPanel, ConstructionKpi as Kpi, ConstructionFrame, ConstructionEmpty } from './construction-ui';
import { Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import styles from './construction-delivery-polish.module.css';

import { HardHat, ShieldAlert, AlertOctagon, CalendarCheck, Users, Flame, ArrowUpFromLine, Shovel, Box, Truck, Zap } from 'lucide-react';
import { humanizeStatus, toneVar, type Tone } from '@/lib/status-tones';
import { PERMIT_LABEL, SAFETY_EVENT_LABEL, type SafetyPermitType, type SafetyEventKind } from '@/domain/construction';
import { PageTabs } from '@/components/ui/page-tabs';
import { SafetyProjectSelector, PermitRequestForm, PermitActions, ToolboxTalkForm, CorrectiveActions } from './safety-operations';
import type { SafetyCorrectiveAction } from '@/domain/construction/types';

export type PermitRow = { id: string; ref: string; type: SafetyPermitType; location: string; requestedBy: string; requestedById?: string; supervisor: string; status: string; validFromISO: string; validToISO: string; controls: string[]; expired: boolean; clash: boolean; reviewNote?: string; activationNote?: string; closureNote?: string };
export type EventRow = { id: string; kind: SafetyEventKind; title: string; atISO: string; reportedBy: string; lostDays: number; closed: boolean; action?: string; zoneLabel?: string; corrective?: SafetyCorrectiveAction };
export type TalkRow = { id: string; topic: string; atISO: string; attendees: number; deliveredBy: string; location?: string };
type SafetyAccess = { projectId?: string; projects?: { id: string; name: string }[]; zones?: { id: string; label: string }[]; members?: { userId: string; name: string }[]; actorId?: string; todayISO?: string; canCreate?: boolean; canUpdate?: boolean; canReviewPermit?: boolean; canActivatePermit?: boolean; canAssignCorrection?: boolean; canVerifyCorrection?: boolean };

const PERMIT_ICON: Record<SafetyPermitType, React.ReactNode> = {
  hot_work: <Flame size={15} />, height: <ArrowUpFromLine size={15} />, excavation: <Shovel size={15} />,
  confined_space: <Box size={15} />, lifting: <Truck size={15} />, electrical: <Zap size={15} />,
};
const EVENT_TONE: Record<SafetyEventKind, Tone> = { near_miss: 'warn', first_aid: 'info', lost_time: 'danger', observation: 'muted' };
const STATUS_TONE: Record<string, Tone> = { requested: 'info', approved: 'success', active: 'progress', closed: 'muted', rejected: 'danger', expired: 'danger' };
const displayDate = (value: string) => new Date(value).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } as const : {}), timeZone: 'Africa/Lagos' });

export function SafetyWorkspace({ permits, events, talks, clashes, stats, projectName, projectId, projects, zones, members, actorId, todayISO, canCreate, canUpdate, canReviewPermit, canActivatePermit, canAssignCorrection, canVerifyCorrection }: {
  permits: PermitRow[]; events: EventRow[]; talks: TalkRow[];
  clashes: { aRef: string; bRef: string; location: string; aType: SafetyPermitType; bType: SafetyPermitType }[];
  stats: { daysSinceLTI: number | null; lostTimeEvents: number; nearMisses: number; activePermits: number; expiredPermits: number; talksThisMonth: number; openCorrectiveActions?: number; overdueCorrectiveActions?: number; score: number; band: Tone };
  projectName: string;
} & SafetyAccess) {
  return (
    <ConstructionFrame>
      <ConstructionSummary>
        <div className="relative flex items-center gap-5 flex-wrap">
          <Ring score={stats.score} band={stats.band} />
          <div className="min-w-0">
            <div className="text-[14px] text-text-3 flex items-center gap-1.5"><HardHat size={12} /> SITE SAFETY · {projectName.toUpperCase()}</div>
            <h2 className="text-[21px] font-medium tracking-[-0.02em] leading-tight mt-1">
              {stats.daysSinceLTI === null ? 'No lost-time injury on record' : `${stats.daysSinceLTI} days since the last lost-time injury`}
            </h2>
            <div className="text-[14px] text-text-3 mt-0.5">{stats.activePermits} active permit{stats.activePermits === 1 ? '' : 's'} · {stats.nearMisses} near miss{stats.nearMisses === 1 ? '' : 'es'} reported · {stats.talksThisMonth} toolbox talk{stats.talksThisMonth === 1 ? '' : 's'} this month</div>
            {projectId && projects && <SafetyProjectSelector projectId={projectId} projects={projects} />}
          </div>
        </div>
      </ConstructionSummary>

      {clashes.length > 0 && (
        <Card className={styles.section}>
          <CardHeader title="Recorded permit overlap" subtitle="Same recorded location and validity window · operator review required" action={<AlertOctagon size={20} className="text-negative" />} />
          {clashes.map((c, i) => (
            <div key={i} className={styles.notice}>
              <div><p className={styles.rowTitle}>{c.aRef} · {PERMIT_LABEL[c.aType]} / {c.bRef} · {PERMIT_LABEL[c.bType]}</p><p>Both permit records overlap at {c.location}. Confirm the location, validity windows and controls with the responsible supervisor before work; this alert does not verify current site activity.</p></div>
            </div>
          ))}
        </Card>
      )}

      <PageTabs label="Construction safety sections" items={[
        {
          id: 'permits', label: 'Permits to work', content: <div className={styles.stack}>
            {projectId && todayISO && canCreate && <PermitRequestForm projectId={projectId} todayISO={todayISO} zones={zones ?? []} />}
            <ConstructionPanel >
              <div className={styles.header}><CardHeader title="Permits to work" subtitle="Request → independent review → site controls confirmed → active → closed" /></div>
              <div>
                {permits.map((p) => (
                  <section key={p.id} className={`${styles.row} ${styles.section}`} aria-label={`${p.ref} permit details`}>
                    <CardHeader title={`${p.ref} · ${PERMIT_LABEL[p.type]}`} subtitle={p.location} action={<div className={styles.inline}><span aria-hidden="true">{PERMIT_ICON[p.type]}</span><StatusPill status={p.expired ? 'Expired' : humanizeStatus(p.status)} tone={p.expired ? 'danger' : STATUS_TONE[p.status] ?? 'muted'} />{p.clash && <StatusPill status="Recorded clash" tone="danger" />}</div>} />
                    <dl className={styles.facts}><div><dt>Requested by</dt><dd>{p.requestedBy}</dd></div><div><dt>Responsible supervisor</dt><dd>{p.supervisor}</dd></div><div><dt>Valid from · WAT</dt><dd>{displayDate(p.validFromISO)}</dd></div><div><dt>Valid until · WAT</dt><dd>{displayDate(p.validToISO)}</dd></div></dl>
                    <section className={styles.fieldSection}><h3 className={styles.title}>Recorded controls</h3>{p.controls.length ? <ul className={styles.list}>{p.controls.map((control, index) => <li key={`${index}-${control}`}>{control}</li>)}</ul> : <p className={styles.text}>No controls recorded. Confirm the source permit before relying on it.</p>}</section>
                    {p.reviewNote && <p className={styles.text}>Review: {p.reviewNote}</p>}
                    {p.activationNote && <p className={styles.text}>Activation check: {p.activationNote}</p>}
                    {p.closureNote && <p className={styles.text}>Closure: {p.closureNote}</p>}
                    {projectId && canUpdate && <PermitActions permit={p} actorId={actorId ?? ''} canReview={!!canReviewPermit} canActivate={!!canActivatePermit} />}
                  </section>
                ))}
                {permits.length === 0 && <ConstructionEmpty title="No permit records" />}
              </div>
            </ConstructionPanel>
          </div>
        },
        {
          id: 'events', label: 'Events & checks', content: <div className={styles.stack}>
            <div className={styles.twoColumns}>
              {/* Events */}
              <ConstructionPanel >
                <div className={styles.header}><CardHeader title="Safety events" subtitle="All recorded events, corrective actions and closure states" /></div>
                <div>
                  {events.map((e) => (
                    <section key={e.id} className={`${styles.row} ${styles.section}`}>
                      <CardHeader title={e.title} subtitle={`${displayDate(e.atISO)} · WAT`} action={<div className={styles.inline}><StatusPill status={SAFETY_EVENT_LABEL[e.kind]} tone={EVENT_TONE[e.kind]} /><StatusPill status={e.closed ? 'Closed' : 'Open'} tone={e.closed ? 'success' : 'warn'} /></div>} />
                      <dl className={styles.facts}><div><dt>Reported by</dt><dd>{e.reportedBy}</dd></div><div><dt>Location / zone</dt><dd>{e.zoneLabel || 'Not recorded'}</dd></div><div><dt>Lost days recorded</dt><dd>{e.lostDays}</dd></div></dl>
                      {e.action && <div className={styles.fieldSection}><h3 className={styles.title}>Corrective action</h3><p className={styles.text}>{e.action}</p></div>}
                      {projectId && todayISO && <CorrectiveActions event={e} members={members ?? []} actorId={actorId ?? ''} todayISO={todayISO} canUpdate={!!canUpdate} canAssign={!!canAssignCorrection} canVerify={!!canVerifyCorrection} />}
                    </section>
                  ))}
                  {events.length === 0 && <ConstructionEmpty title="No safety event records" />}
                </div>
              </ConstructionPanel>

              {/* Toolbox talks */}
              <ConstructionPanel >
                <div className={styles.header}><CardHeader title="Toolbox talks" subtitle="Recorded topics, facilitators and attendance counts" /></div>
                {projectId && todayISO && canCreate && <ToolboxTalkForm projectId={projectId} todayISO={todayISO} />}
                <div>
                  {talks.map((t) => (
                    <section key={t.id} className={`${styles.row} ${styles.section}`}>
                      <CardHeader title={t.topic} subtitle={`${displayDate(t.atISO)} · WAT`} />
                      <dl className={styles.facts}><div><dt>Attendance recorded</dt><dd>{t.attendees}</dd></div><div><dt>Delivered by</dt><dd>{t.deliveredBy}</dd></div>{t.location && <div><dt>Location</dt><dd>{t.location}</dd></div>}</dl>
                    </section>
                  ))}
                  {talks.length === 0 && <EmptyState title="No toolbox talks recorded" description="This does not establish that a briefing took place." />}
                </div>
              </ConstructionPanel>
            </div>
          </div>
        },
        {
          id: 'overview', label: 'Overview', content: <div className="pb-section">
            <div className={styles.metrics}>
              <Kpi label="Active permits" value={String(stats.activePermits)} tone="progress" icon={<CalendarCheck size={16} />} />
              <Kpi label="Lapsed permits" value={String(stats.expiredPermits)} tone={stats.expiredPermits ? 'danger' : 'success'} icon={<ShieldAlert size={16} />} />
              <Kpi label="Permit clashes" value={String(clashes.length)} tone={clashes.length ? 'danger' : 'success'} icon={<AlertOctagon size={16} />} />
              <Kpi label="Toolbox talks (30d)" value={String(stats.talksThisMonth)} tone={stats.talksThisMonth >= 2 ? 'success' : 'warn'} icon={<Users size={16} />} />
              <Kpi label="Open corrective work" value={String(stats.openCorrectiveActions ?? events.filter((e) => e.corrective && e.corrective.status !== 'verified').length)} tone="warn" icon={<HardHat size={16} />} />
              <Kpi label="Overdue corrections" value={String(stats.overdueCorrectiveActions ?? events.filter((e) => e.corrective && e.corrective.status !== 'verified' && todayISO && e.corrective.dueISO < todayISO).length)} tone="danger" icon={<ShieldAlert size={16} />} />
            </div>
          </div>
        }
      ]} />

      {/* Clashes */}

      {/* Permits */}

    </ConstructionFrame>
  );
}

function Ring({ score, band }: { score: number; band: Tone }) {
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }} role="img" aria-label={`${score} rule-derived safety record score, not an independent safety certification`}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-medium leading-none" style={{ color }}>{score}</span><span className="text-[12px] text-text-3">record score</span></div>
    </div>
  );
}
