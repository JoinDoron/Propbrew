'use client';

import { Fragment, useRef, useState } from 'react';
import { PageTabs } from '@/components/ui/page-tabs';
import { StatusPill } from '@/components/ui';
import { CopilotComposer, CopilotConversation, CopilotEmpty, CopilotLayout, CopilotMessage, CopilotPanel, CopilotSafeguards, CopilotSuggestions, CopilotSummary } from '@/components/ai/copilot-reference';
import { CopilotStreamReply } from '@/components/ai/copilot-stream-reply';
import { useCopilotAutoScroll, useCopilotStream } from '@/components/ai/use-copilot-stream';
import { validCopilotSource } from '@/lib/ai/copilot-protocol';
import { ConstructionFrame } from './construction-ui';

/** Compatibility reader for older responses; new conversations use verified NDJSON metadata. */
export function constructionSources(header: string | null): { label: string; href: string }[] {
  try {
    const sources: unknown = JSON.parse(decodeURIComponent(header ?? '[]'));
    if (!Array.isArray(sources)) return [];
    return sources.filter((entry, index): entry is { label: string; href: string } => !!entry && typeof entry === 'object' && validCopilotSource('construction', { ...entry, id: `legacy-${index}` }));
  } catch { return []; }
}

export function CopilotWorkspace({ suggestions, canSeeCommercials }: { suggestions: string[]; canSeeCommercials: boolean }) {
  const [question, setQuestion] = useState('');
  const { exchanges, busy, submit, stop, retry } = useCopilotStream({ endpoint: '/api/construction/copilot', module: 'construction' });
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useCopilotAutoScroll(log, exchanges);
  function ask(value: string) { if (busy || !value.trim()) return; setQuestion(''); void submit(value); }
  return <ConstructionFrame>
    <CopilotSummary eyebrow="Construction Copilot · scoped record context" title="Ask about the build" description="Explore schedule, materials, procurement, workforce and recorded risk with AI." note={`A connected AI provider is required. Answers cite the authorised records supplied to the model; verify them before deciding${canSeeCommercials ? '.' : ' · commercial figures hidden for your access level.'} Conversation stays in this browser session.`} />
    <PageTabs label="Construction Copilot sections" items={[
      { id: 'assistant', label: 'Ask Copilot', content: <CopilotLayout conversation={<CopilotPanel title="Construction conversation" subtitle="Visible activity reports application steps, not private model reasoning." action={<StatusPill status={busy ? 'Request in progress' : 'Ready for a question'} tone={busy ? 'progress' : 'neutral'} />}>
        <CopilotConversation label="Construction copilot conversation" busy={busy} logRef={log}>
          {!exchanges.length && <CopilotEmpty title="Start with a construction question" description="Ask a question in your own words about your authorised construction records. Review the answer with its source links and coverage notices." />}
          {exchanges.map((exchange) => <Fragment key={exchange.id}><CopilotMessage speaker="you">{exchange.question}</CopilotMessage><CopilotStreamReply exchange={exchange} name="Construction Copilot" busy={busy} onRetry={(id) => { void retry(id); }} /></Fragment>)}
        </CopilotConversation>
        <CopilotComposer label="Ask the construction copilot" value={question} onChange={setQuestion} onSubmit={ask} busy={busy} onStop={stop} inputRef={composer} placeholder="e.g. Which project needs attention, and why?" hint="Ask freely about the supplied records. AI can make mistakes; it does not approve, commit costs or change records." />
      </CopilotPanel>} sidebar={<CopilotSuggestions items={suggestions} disabled={busy} onSelect={(value) => { setQuestion(value); composer.current?.focus(); }} />} /> },
      { id: 'safeguards', label: 'Review & safeguards', content: <CopilotSafeguards items={[
        { title: 'Check the source record', text: 'Open the citations and verify dates, quantities, native currencies and reporting coverage. The model can only use the authorised context supplied for this request.' },
        { title: 'Understand the activity', text: 'The expandable activity shows real application steps such as access checks and record loading. It does not expose private model reasoning. A provider error stays visible; no rules answer is substituted.' },
        { title: 'Keep approval with the team', text: 'The copilot never transacts. Record updates, commitments and approvals stay in their authorised Construction workflows, with their existing human review.' },
      ]} footer={`${canSeeCommercials ? 'Your role permits commercial details in the supplied construction context.' : 'Commercial figures are hidden for your access level.'} An answer or citation does not grant additional access. Follow-up turns are held in this browser session and are not trusted source evidence.`} /> },
    ]} />
  </ConstructionFrame>;
}
