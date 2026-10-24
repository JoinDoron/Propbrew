'use client';

import { Fragment, useRef, useState } from 'react';
import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import {
  CopilotComposer, CopilotConversation, CopilotEmpty, CopilotFrame, CopilotLayout,
  CopilotMessage, CopilotPanel, CopilotSafeguards, CopilotSuggestions, CopilotSummary,
  copilotStyles as styles,
} from '@/components/ai/copilot-reference';
import type { DataAnswer } from '@/server/actions/ask-data';
import { CopilotStreamReply } from '@/components/ai/copilot-stream-reply';
import { useCopilotAutoScroll, useCopilotStream } from '@/components/ai/use-copilot-stream';
import { validCopilotSource } from '@/lib/ai/copilot-protocol';

const SUGGESTIONS = ['Which estate has the most overdue work orders?', 'What is the collection rate?', 'Who is in arrears?', 'How many open work orders?', 'SOS response times?', 'Preventive vs reactive?'];
const SAFEGUARDS = [
  { title: 'Check the source records', text: 'Open the linked Estate registers and check dates, scope and missing records before acting. A returned repository snapshot may not contain every record in the tenant.' },
  { title: 'Understand the answer method', text: 'A connected AI provider answers in your own words from the authorised records supplied for the request. Expand activity to review real application steps, not private model reasoning. Provider errors remain visible; no rules answer is substituted.' },
  { title: 'Keep approval with your team', text: 'Questions never approve, publish, send reminders, change charges or dispatch emergency help. Use the authorised Estate workflow for any action, with its existing human review.' },
] as const;

/** Compatibility renderer for recorded report previews; live conversations use CopilotStreamReply. */
export function EstateCopilotReply({ answer, error }: { answer?: DataAnswer; error?: string }) {
  return <CopilotMessage speaker="copilot" name="Estate Copilot" error={Boolean(error)} badges={<>
    <span className={styles.badge}><StatusPill status={error ? 'Request unsuccessful' : answer ? 'Rules-based answer' : 'Reading records'} tone={error ? 'danger' : answer ? 'muted' : 'progress'} /></span>
    {answer && <span className={styles.badge}><StatusPill status={answer.matched ? 'Rule matched' : 'No supported rule'} tone={answer.matched ? 'info' : 'warn'} /></span>}
  </>} sources={answer && <>
    <span>Source records · verify before acting</span>
    {answer.sources.length ? <div className={styles.actions}>{answer.sources.filter((source, index) => validCopilotSource('estate', { ...source, id: `recorded-${index}` })).map((source, index) => <Link key={`${source.href}-${index}`} href={source.href} className={styles.actionLink}><Link2 size={16} aria-hidden="true" />{source.label}</Link>)}</div> : <p className={styles.metadata}>No linked source records were supplied for this answer. Review the relevant authorised register before relying on it.</p>}
    <p className={styles.metadata}>Record snapshot · {answer.scopeLabel}. Verify source records before making operational or financial decisions. Rule-match scores are not calibrated AI confidence.</p>
  </>}>
    {error ? <p>{error}</p> : answer ? <>
      <p>{answer.answer}</p>
      {answer.matched && answer.metric && <p className={styles.metric}>{answer.metric}</p>}
      {!!answer.detail?.length && <ul className={styles.details}>{answer.detail.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
    </> : <p role="status">Reading scoped records…</p>}
  </CopilotMessage>;
}

/** Embedded callers keep their page tabs; standalone Estate Copilot owns its two sections. */
export function AskData({ standalone = false }: { standalone?: boolean }) {
  const [query, setQuery] = useState('');
  const { exchanges, busy, submit, stop, retry } = useCopilotStream({ endpoint: '/api/estate/copilot', module: 'estate' });
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useCopilotAutoScroll(log, exchanges);

  function ask(value: string) {
    const text = value.trim();
    if (!text || busy) return;
    setQuery('');
    void submit(text);
  }
  const assistant = <CopilotLayout conversation={<CopilotPanel title="Estate conversation" subtitle="Visible activity reports application steps, not private model reasoning." action={<span className={styles.badge}><StatusPill status={busy ? 'Request in progress' : 'Ready for a question'} tone={busy ? 'progress' : 'neutral'} /></span>}>
    <CopilotConversation label="Estate copilot conversation" busy={busy} logRef={log}>
      {exchanges.length === 0 && <CopilotEmpty title="Start with an estate question" description="Ask about your authorised estate records in your own words, then review the AI answer alongside its source links and coverage notices." />}
      {exchanges.map((exchange) => <Fragment key={exchange.id}>
        <CopilotMessage speaker="you"><p>{exchange.question}</p></CopilotMessage>
        <CopilotStreamReply exchange={exchange} name="Estate Copilot" busy={busy} onRetry={(id) => { void retry(id); }} />
      </Fragment>)}
    </CopilotConversation>
    <CopilotComposer label="Ask the estate copilot" value={query} onChange={setQuery} onSubmit={ask} busy={busy} onStop={stop} inputRef={composer} placeholder="e.g. What should I prioritise across my estate?" hint="AI can make mistakes. Questions do not approve or change records, send messages or dispatch emergency help." />
  </CopilotPanel>} sidebar={<CopilotSuggestions items={SUGGESTIONS} disabled={busy} onSelect={(suggestion) => { setQuery(suggestion); composer.current?.focus(); }} />} />;

  const safeguards = <CopilotSafeguards items={SAFEGUARDS} footer="Estate scope and capability checks still apply to every request and linked record. Monetary answers retain their recorded currency; mixed currencies require a separate Billing review, with no assumed conversion. SOS figures are recorded observations, not verified emergency dispatch or SLA measurements." />;

  return <CopilotFrame>
    <CopilotSummary eyebrow="Estate Copilot · scoped record context" title="Ask about your estate" description="Explore collections, residents, maintenance and recorded security activity with AI." note="A connected AI provider is required. Ask freely about the supplied records and continue with follow-up questions. Conversation stays in this browser session; verify source records before deciding." />
    {standalone ? <PageTabs label="Estate Copilot sections" items={[
      { id: 'assistant', label: 'Ask Copilot', content: assistant },
      { id: 'safeguards', label: 'Review & safeguards', content: safeguards },
    ]} /> : <>{assistant}{safeguards}</>}
  </CopilotFrame>;
}
