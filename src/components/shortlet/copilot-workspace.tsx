'use client';

import { Fragment, useRef, useState } from 'react';
import { StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { CopilotFrame, CopilotSummary, CopilotPanel, CopilotLayout, CopilotConversation, CopilotEmpty, CopilotMessage, CopilotComposer, CopilotSuggestions, CopilotSafeguards, copilotStyles as styles } from '@/components/ai/copilot-reference';
import { CopilotStreamReply, copilotSnapshot } from '@/components/ai/copilot-stream-reply';
import { useCopilotAutoScroll, useCopilotStream } from '@/components/ai/use-copilot-stream';

export function ShortletCopilotWorkspace({ snapshotISO, suggestions }: { snapshotISO: string; suggestions: readonly string[] }) {
  const [question, setQuestion] = useState('');
  const { exchanges, busy, submit, stop, retry } = useCopilotStream({ endpoint: '/api/shortlet/copilot', module: 'shortlet' });
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useCopilotAutoScroll(log, exchanges);
  function ask(value: string) { if (busy || !value.trim()) return; setQuestion(''); void submit(value); }
  return <CopilotFrame>
    <CopilotSummary eyebrow="Shortlet Copilot · recorded operations" title="Ask about your stays" description="Explore bookings, occupancy, overlapping stays, maintenance, guest ratings and recorded pricing with AI." note="A connected AI provider is required. Ask in your own words; each answer includes the supplied record context and coverage. Conversation stays in this browser session." badge="AI · human review required" />
    <PageTabs label="Shortlet Copilot sections" items={[
      { id: 'assistant', label: 'Ask Copilot', content: <CopilotLayout conversation={<CopilotPanel title="Shortlet conversation" subtitle="Visible activity reports application steps, not private model reasoning." action={<StatusPill status={busy ? 'Request in progress' : 'Ready for a question'} tone={busy ? 'progress' : 'neutral'} />}>
        <CopilotConversation label="Shortlet copilot conversation" busy={busy} logRef={log}>
          {!exchanges.length && <CopilotEmpty title="Start with a Shortlet question" description="Ask about your authorised stay records in your own words. Sources point back to the existing Shortlet workflows for review." />}
          {exchanges.map((exchange) => <Fragment key={exchange.id}><CopilotMessage speaker="you">{exchange.question}</CopilotMessage><CopilotStreamReply exchange={exchange} name="Shortlet Copilot" busy={busy} onRetry={(id) => { void retry(id); }} /></Fragment>)}
        </CopilotConversation>
        <CopilotComposer label="Ask the Shortlet copilot" value={question} onChange={setQuestion} onSubmit={ask} busy={busy} onStop={stop} inputRef={composer} placeholder="e.g. What should I review before the next arrivals?" hint="AI can make mistakes. This assistant does not approve, message, refund or change a booking." />
      </CopilotPanel>} sidebar={<><CopilotSuggestions items={suggestions} disabled={busy} onSelect={(value) => { setQuestion(value); composer.current?.focus(); }} /><CopilotPanel title="Record context" subtitle="Shortlet scope only"><div className={styles.bodyPadding}><p className={styles.body}>Authorised records are loaded when you ask. The answer reports missing or partial coverage and its actual source snapshot.</p><p className={`${styles.metadata} mt-4`}>Operating snapshot · {copilotSnapshot(snapshotISO)}. Native currencies remain separate. Recorded payments and caution states are not settlement evidence.</p></div></CopilotPanel></>} /> },
      { id: 'safeguards', label: 'Review & safeguards', content: <CopilotSafeguards subtitle="AI guidance supports, but does not replace, your operating decision." items={[
        { title: 'Check the recorded source', text: 'Open the linked register and verify dates, status, quantities and any coverage warning. Calendar records are not a live channel availability guarantee.' },
        { title: 'Understand the method', text: 'A real provider answers from the supplied authorised context and bounded follow-up conversation. Activity shows real application stages, not private reasoning. Pricing suggestions are advisory; native currencies are never assumed equivalent.' },
        { title: 'Keep control of the action', text: 'Use the existing authorised workflows to change a booking, record a payment or inspection, or apply a rate. Guest messaging remains a planning preview, not a connected send. Existing grants and human reviews remain unchanged.' },
      ]} footer="Guest contact fields, guest tokens, Wi-Fi passwords, access instructions and bank account fields are excluded from this assistant’s structured context. A provider failure is shown explicitly; no built-in answer is substituted. No answer or source link grants additional access." /> },
    ]} />
  </CopilotFrame>;
}
