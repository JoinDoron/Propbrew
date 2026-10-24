'use client';

import { useState } from 'react';
import { TrendingUp, Wallet, CalendarClock, X, PiggyBank } from 'lucide-react';
import { Button, CardHeader, EmptyState, IconButton, StatusPill } from '@/components/ui';
import { PortalCard, PortalKpi, portalMoney } from './portal-patterns';
import { PortalDialog } from './portal-dialog';
import { PageTabs } from '@/components/ui/page-tabs';
import type { InvestorProject } from '@/domain/entities';
import { forecastProject } from '@/domain/investors';
import { holdingOf, constructionProgress, paymentSchedule, handoverCountdown } from '@/domain/investor-portal';
import { NOW_MS } from '@/domain/ppm';
import type { Tone } from '@/lib/status-tones';
import layout from '@/components/ui/workspace-layout.module.css';

const STATUS_TONE: Record<InvestorProject['status'], Tone> = { planning: 'neutral', selling: 'info', construction: 'warn', completed: 'success' };
export const investorCurrency = (project: InvestorProject) => project.unitsSold > 0 ? project.salesToDate.currency : project.salesTarget.currency;
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
function scheduledHandover(project: InvestorProject) { const countdown = handoverCountdown(project.handoverDate, NOW_MS); return countdown.days <= 0 ? 'Scheduled date passed · completion unverified' : `${countdown.label} to scheduled date`; }

export function InvestorPortfolioWorkspace({ projects }: { projects: InvestorProject[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const currencies = [...new Set(projects.map(investorCurrency))].sort();
  const [currency, setCurrency] = useState<string>(currencies.includes('NGN') ? 'NGN' : currencies[0] ?? 'NGN');
  const holdings = projects.map((project) => ({ project, holding: holdingOf(project) }));
  const scoped = holdings.filter(({ project }) => investorCurrency(project) === currency);
  const invested = scoped.reduce((sum, item) => sum + item.holding.investedMinor, 0);
  const projected = scoped.reduce((sum, item) => sum + item.holding.projectedValueMinor, 0);
  const units = scoped.reduce((sum, item) => sum + item.holding.unitsHeld, 0);
  const roi = invested ? Math.round((projected - invested) / invested * 100) : 0;
  const nextHandover = [...scoped].sort((a, b) => a.project.handoverDate.localeCompare(b.project.handoverDate))[0]?.project;
  const open = projects.find((project) => project.id === openId);
  return <div className={layout.layout}>
    <div className={layout.notice}><PiggyBank size={18} /><p>Illustrative investment workspace<span>Holding sizes, invested values, progress and instalment statuses below are modelled from demo assumptions, not verified ownership, site evidence or bank transactions. No language model or payment provider is connected.</span></p></div>
    <PageTabs label="Investment portfolio sections" items={[
      { id: 'projects', label: 'My projects', content: <div className={layout.grid}>{holdings.length ? holdings.map(({ project, holding }) => { const progress = constructionProgress(project); const nativeCurrency = investorCurrency(project); return <PortalCard key={project.id}><CardHeader title={project.name.split(' (')[0]} subtitle={project.location} action={<StatusPill status={project.status} tone={STATUS_TONE[project.status]} />} /><dl className={layout.facts}><div><dt>Sample units</dt><dd>{holding.unitsHeld}</dd></div><div><dt>Modelled invested value</dt><dd>{portalMoney(holding.investedMinor, nativeCurrency)}</dd></div><div><dt>Illustrative value at handover</dt><dd>{portalMoney(holding.projectedValueMinor, nativeCurrency)}</dd></div></dl><div className="mt-6"><div className={layout.toolbar}><span className={layout.metadata}>Modelled construction progress</span><span className="text-sm tabular-nums">{progress.pct}%</span></div><progress className="h-2 w-full mt-3 accent-primary" aria-label={`${project.name} modelled construction progress`} value={progress.pct} max={100} /></div><p className={`${layout.metadata} mt-4`}>{scheduledHandover(project)}</p><div className={`${layout.actions} mt-6`}><Button onClick={() => setOpenId(project.id)}>View project details</Button></div></PortalCard>; }) : <PortalCard><EmptyState title="No investment holdings linked" description="Only project records within your investor scope appear here." /></PortalCard>}</div> },
      { id: 'summary', label: 'Portfolio summary', content: <div className={layout.layout}><div className={layout.toolbar}><p className={layout.body}>Illustrative values are separated by currency. No FX conversion.</p><label className={layout.field}><span className={layout.label}>Summary currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)} className={layout.select}>{(currencies.length ? currencies : ['NGN']).map((value) => <option key={value}>{value}</option>)}</select></label></div><div className={layout.metrics}><PortalKpi label={`Modelled invested · ${currency}`} value={portalMoney(invested, currency)} note={`${units} sample units · ${scoped.length} projects`} tone="info" icon={<Wallet size={18} />} /><PortalKpi label={`Illustrative handover value · ${currency}`} value={portalMoney(projected, currency)} note="Not a valuation or guaranteed return" tone="success" icon={<TrendingUp size={18} />} /><PortalKpi label="Illustrative return" value={`${roi}%`} note="Derived from the sample stake" tone="progress" icon={<PiggyBank size={18} />} /><PortalKpi label="Earliest scheduled handover" value={nextHandover ? monthLabel(nextHandover.handoverDate) : 'Not recorded'} note="Schedule only · completion unverified" tone="warn" icon={<CalendarClock size={18} />} /></div></div> },
    ]} />
    {open && <ProjectDrawer project={open} onClose={() => setOpenId(null)} />}
  </div>;
}

function ProjectDrawer({ project, onClose }: { project: InvestorProject; onClose: () => void }) {
  const holding = holdingOf(project);
  const progress = constructionProgress(project);
  const forecast = forecastProject(project);
  const schedule = paymentSchedule(project, holding);
  const currency = investorCurrency(project);
  return <PortalDialog label="Investment project details" onClose={onClose} width={680} drawer><div className={layout.drawer}><header className={layout.dialogHeader}><div><h2 className={layout.dialogTitle}>{project.name.split(' (')[0]}</h2><p className={layout.metadata}>{project.location} · scheduled handover {monthLabel(project.handoverDate)}</p></div><IconButton aria-label="Close dialog" onClick={onClose}><X size={18} /></IconButton></header><div className={layout.dialogBody}>
    <PortalCard><CardHeader title="Illustrative holding" subtitle="Not proof of investment ownership" /><dl className={layout.facts}><div><dt>Sample units / ownership</dt><dd>{holding.unitsHeld} · {holding.ownershipPct}%</dd></div><div><dt>Modelled invested value</dt><dd>{portalMoney(holding.investedMinor, currency)}</dd></div><div><dt>Modelled unit price</dt><dd>{portalMoney(holding.unitPriceMinor, currency)}</dd></div><div><dt>Illustrative handover value</dt><dd>{portalMoney(holding.projectedValueMinor, currency)}</dd></div><div><dt>Illustrative gain / return</dt><dd>{portalMoney(holding.gainMinor, currency)} · {holding.roiPct}%</dd></div></dl><p className={`${layout.metadata} mt-6`}>Sample holding size is generated from a deterministic project identifier. Values apply the recorded projected return to that sample stake. This is not a verified ledger or investment recommendation.</p></PortalCard>
    <PortalCard><CardHeader title="Modelled construction progress" subtitle={`${progress.pct}% · ${scheduledHandover(project)}`} /><ol className="m-0 p-0 list-none space-y-4">{progress.milestones.map((milestone) => <li key={milestone.key} className={layout.toolbar}><span className={layout.body}>{milestone.label}</span><StatusPill status={`Modelled: ${milestone.state}`} tone={milestone.state === 'done' ? 'success' : milestone.state === 'current' ? 'info' : 'neutral'} /></li>)}</ol><p className={`${layout.metadata} mt-6`}>Progress is derived from project lifecycle status, not a signed construction inspection.</p></PortalCard>
    <PortalCard><CardHeader title="Illustrative project sales" subtitle="Rules-based estimate · assumptions shown" /><dl className={layout.facts}><div><dt>Recorded units sold</dt><dd>{project.unitsSold} / {project.unitsTotal} · {forecast.pctSold}%</dd></div><div><dt>Assumed months on market</dt><dd>{forecast.monthsOnMarket}</dd></div><div><dt>Modelled sales pace</dt><dd>{forecast.monthlyPace} units/month</dd></div><div><dt>Illustrative sell-out date</dt><dd>{forecast.remaining === 0 ? 'No units remaining in record' : forecast.selloutISO ? monthLabel(forecast.selloutISO) : 'Insufficient recorded sales pace'}</dd></div></dl></PortalCard>
    <PortalCard><CardHeader title="Sample payment schedule" subtitle="Not an invoice, amount due or proof of payment" /><p className={`${layout.body} mb-6`}>Paid/due/upcoming labels are modelled from construction stages. They do not verify bank payments or contractual obligations. Payment collection is not connected.</p><ul className="m-0 p-0 list-none space-y-6">{schedule.map((instalment) => <li key={instalment.label} className="border-b border-border pb-6 last:border-0"><div className={layout.toolbar}><h4 className={layout.title}>{instalment.label}</h4><StatusPill status={`Modelled: ${instalment.status}`} tone={instalment.status === 'due' ? 'warn' : instalment.status === 'paid' ? 'success' : 'neutral'} /></div><p className={`${layout.body} mt-3`}>{portalMoney(instalment.amountMinor, currency)} · {instalment.pctOfPlan}% · illustrative date {monthLabel(instalment.dueISO)}</p>{instalment.status === 'due' ? <Button disabled className="mt-4">Payment not connected</Button> : null}</li>)}</ul></PortalCard>
    <p className={layout.metadata}>Reference snapshot: {new Date(NOW_MS).toLocaleDateString('en-NG', { dateStyle: 'long', timeZone: 'Africa/Lagos' })}. All native currencies are retained without conversion.</p>
  </div></div></PortalDialog>;
}
