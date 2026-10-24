'use client';

import { useEffect, useId, useState, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, CircleAlert, ClipboardCheck, Cpu, FileSearch, Send, ShieldCheck, Sparkles, Square, User } from 'lucide-react';
import type { CopilotActivity } from '@/lib/ai/copilot-protocol';
import { Button, Card, CardHeader, StatusPill } from '@/components/ui';
import type { Tone } from '@/lib/status-tones';
import styles from './copilot-reference.module.css';

export { styles as copilotStyles };

/** Presentation shared with Construction's Ask Copilot. Each module owns its data and actions. */
export function CopilotFrame({ children }: { children: ReactNode }) {
  return <div className={styles.workspace}>{children}</div>;
}

export function CopilotSummary({ eyebrow, title, description, note, badge = 'Human review required', tone = 'info', children }: { eyebrow: string; title: string; description: string; note?: string; badge?: string; tone?: Tone; children?: ReactNode }) {
  return <Card><div className={styles.summary}><span className={styles.summaryIcon}><Sparkles size={22} aria-hidden="true" /></span><div className={styles.summaryCopy}><p className={styles.eyebrow}>{eyebrow}</p><h2>{title}</h2><p className={styles.body}>{description}</p>{note && <p className={styles.metadata}>{note}</p>}</div><span className={styles.badge}><StatusPill status={badge} tone={tone} /></span></div>{children}</Card>;
}

export function CopilotPanel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <Card padded={false} className={`${styles.panel} ${className}`}><div className={styles.panelHeader}><CardHeader title={title} subtitle={subtitle} action={action} /></div>{children}</Card>;
}

export function CopilotLayout({ conversation, sidebar }: { conversation: ReactNode; sidebar: ReactNode }) {
  return <div className={styles.assistantLayout}>{conversation}<aside className={styles.stack} aria-label="Copilot suggestions and context">{sidebar}</aside></div>;
}

export function CopilotConversation({ label, busy = false, children, logRef }: { label: string; busy?: boolean; children: ReactNode; logRef?: RefObject<HTMLDivElement | null> }) {
  return <div ref={logRef} role="log" tabIndex={0} aria-label={label} aria-live="polite" aria-busy={busy} className={styles.conversation}>{children}</div>;
}

export function CopilotEmpty({ title, description, note = 'Suggestions fill your draft. You choose when to ask.' }: { title: string; description: string; note?: string }) {
  return <div className={styles.chatEmpty}><span className={styles.summaryIcon}><FileSearch size={24} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p><span>{note}</span></div>;
}

export function CopilotMessage({ speaker, name, badges, children, sources, error = false }: { speaker: 'you' | 'copilot'; name?: string; badges?: ReactNode; children: ReactNode; sources?: ReactNode; error?: boolean }) {
  return <article className={`${styles.message} ${speaker === 'you' ? styles.userMessage : ''}`}><span className={styles.recordIcon}>{speaker === 'you' ? <User size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}</span><div className={styles.messageContent}><div className={styles.messageHeading}><strong>{name ?? (speaker === 'you' ? 'You' : 'Copilot')}</strong>{badges && <div className={styles.badges}>{badges}</div>}</div><div className={styles.answer} role={error ? 'alert' : undefined}>{children}</div>{sources && <div className={styles.sources}>{sources}</div>}</div></article>;
}

export function CopilotComposer({ label, value, onChange, onSubmit, onStop, busy = false, disabled = false, placeholder, hint = 'Review the wording, then ask. Copilot provides guidance; it does not approve or change records.', submitLabel = 'Ask Copilot', maxLength = 2000, inputRef, footer }: { label: string; value: string; onChange: (value: string) => void; onSubmit: (value: string) => void; onStop?: () => void; busy?: boolean; disabled?: boolean; placeholder?: string; hint?: string; submitLabel?: string; maxLength?: number; inputRef?: RefObject<HTMLTextAreaElement | null>; footer?: ReactNode }) {
  const id = useId();
  return <form className={styles.composer} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); if (!busy && !disabled && value.trim()) onSubmit(value); }}><label htmlFor={`${id}-question`}>{label}</label><textarea id={`${id}-question`} ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-describedby={`${id}-hint`} rows={3} maxLength={maxLength} disabled={busy || disabled} /><div className={styles.composerFooter}><p id={`${id}-hint`}>{hint}</p>{busy && onStop ? <Button type="button" onClick={onStop} icon={<Square size={14} aria-hidden="true" />}>Stop response</Button> : <Button variant="primary" type="submit" disabled={busy || disabled || !value.trim()} icon={<Send size={16} />}>{busy ? 'Working…' : submitLabel}</Button>}</div>{footer}</form>;
}

/** Application progress only. Provider reasoning and hidden thought tokens are never displayed. */
export function CopilotActivityPanel({ activities, status, startedAt, completedAt }: { activities: CopilotActivity[]; status: 'submitted' | 'streaming' | 'complete' | 'stopped' | 'error'; startedAt: number; completedAt?: number }) {
  const active = status === 'submitted' || status === 'streaming';
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, startedAt]);
  const seconds = Math.max(0, Math.floor(((completedAt ?? now) - startedAt) / 1000));
  const latest = [...activities].reverse().find((activity) => activity.status === 'active');
  const title = active ? latest?.label ?? 'Preparing your question' : status === 'complete' ? `Worked for ${seconds}s` : status === 'stopped' ? `Stopped after ${seconds}s` : 'Connection needs attention';
  return <details className={`${styles.activity} ${active ? styles.activityActive : ''}`}>
    <summary aria-label={`${title} — show request activity`}><span className={styles.activityMark} aria-hidden="true">{active ? <Sparkles size={16} /> : status === 'error' ? <CircleAlert size={16} /> : <Check size={16} />}</span><span role="status">{title}{active && <span className={styles.activityElapsed} aria-hidden="true"> · {seconds}s</span>}</span><ChevronDown size={15} className={styles.activityChevron} aria-hidden="true" /></summary>
    <div className={styles.activityBody}><p>Activity · steps taken by Propbrew</p><ol>{activities.map((activity) => <li key={activity.id} data-status={activity.status}><span aria-hidden="true">{activity.status === 'complete' ? <Check size={13} /> : activity.status === 'error' ? <CircleAlert size={13} /> : <span className={styles.activityDot} />}</span>{activity.label}<span className={styles.srOnly}> — {activity.status === 'active' && !active ? 'interrupted' : activity.status}</span></li>)}</ol><small>These are application steps, not the model’s private reasoning.</small></div>
  </details>;
}

/** Small, safe answer formatting. React escapes HTML; links come only from the source catalogue. */
export function CopilotAnswer({ text }: { text: string }) {
  const id = useId();
  const inline = (value: string): ReactNode[] => value.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part.startsWith('*') && part.endsWith('*') ? <em key={index}>{part.slice(1, -1)}</em> : part);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let position = 0, tableNumber = 0;
  while (position < lines.length) {
    if (!lines[position].trim()) { position++; continue; }
    const key = position;
    if (/^\s*```/.test(lines[position])) {
      const code: string[] = [];
      position++;
      while (position < lines.length && !/^\s*```\s*$/.test(lines[position])) code.push(lines[position++]);
      if (position < lines.length) position++;
      blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^#{1,4} (.*)$/.exec(lines[position]);
    if (heading) { blocks.push(<p key={key} className={styles.answerHeading}>{inline(heading[1])}</p>); position++; continue; }
    const table = answerTableHeader(lines, position);
    if (table) {
      position += 2;
      const rows: string[][] = [];
      // A bounded native table never drops overflow text: remaining lines become ordinary text.
      while (position < lines.length && rows.length < 100 && lines[position].trim() && lines[position].includes('|')) {
        const cells = answerTableCells(lines[position]);
        if (cells.length > table.headers.length || answerTableHeader(lines, position)) break;
        rows.push(cells); position++;
      }
      const captionId = `${id}-table-${++tableNumber}`;
      blocks.push(<div key={key} className={styles.answerTableScroll} role="region" tabIndex={0} aria-label={`AI answer table ${tableNumber}; scroll horizontally for all columns`}>
        <table className={styles.answerTable}>
          <caption id={captionId} className={styles.srOnly}>AI answer table {tableNumber}</caption>
          <thead><tr>{table.headers.map((header, column) => <th key={column} scope="col" data-align={table.align[column]}>{inline(header)}</th>)}</tr></thead>
          <tbody>{rows.map((cells, row) => <tr key={row}>{table.headers.map((_, column) => <td key={column} data-align={table.align[column]} aria-label={cells[column] === undefined || !cells[column] ? 'No cell text supplied' : undefined}>{inline(cells[column] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>);
      continue;
    }
    const plain: string[] = [];
    const kind = answerLineKind(lines[position]);
    while (position < lines.length && lines[position].trim()) {
      if (plain.length && (answerLineKind(lines[position]) !== kind || answerTableHeader(lines, position) || /^\s*```|^#{1,4} /.test(lines[position]))) break;
      plain.push(lines[position++]);
    }
    if (plain.every((line) => /^[-*] /.test(line))) blocks.push(<ul key={key}>{plain.map((line, row) => <li key={row}>{inline(line.slice(2))}</li>)}</ul>);
    else if (plain.every((line) => /^\d+[.)] /.test(line))) blocks.push(<ol key={key}>{plain.map((line, row) => <li key={row}>{inline(line.replace(/^\d+[.)] /, ''))}</li>)}</ol>);
    else blocks.push(<p key={key}>{inline(plain.join('\n'))}</p>);
  }
  return <div className={styles.formattedAnswer}>{blocks}</div>;
}

const answerLineKind = (line: string) => /^[-*] /.test(line) ? 'bullet' : /^\d+[.)] /.test(line) ? 'ordered' : 'paragraph';

/** Pipes escaped with a backslash or inside inline code remain part of a cell. */
function answerTableCells(line: string): string[] {
  const value = line.trim();
  const cells: string[] = [];
  let cell = '', codeTicks = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '\\' && value[index + 1] === '|') { cell += '|'; index++; continue; }
    if (char === '`') {
      let count = 1;
      while (value[index + count] === '`') count++;
      if (codeTicks === count) codeTicks = 0;
      else if (codeTicks === 0) codeTicks = count;
      cell += '`'.repeat(count); index += count - 1; continue;
    }
    if (char === '|' && codeTicks === 0) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  if (value.startsWith('|')) cells.shift();
  if (cells.at(-1) === '' && value.endsWith('|') && !value.endsWith('\\|')) cells.pop();
  return cells;
}

function answerTableHeader(lines: string[], position: number): { headers: string[]; align: ('left' | 'right' | 'center')[] } | null {
  if (!lines[position]?.includes('|') || !lines[position + 1]?.includes('|')) return null;
  const headers = answerTableCells(lines[position]), delimiters = answerTableCells(lines[position + 1]);
  if (!headers.length || headers.length > 12 || headers.length !== delimiters.length || headers.some((header) => !header) || !delimiters.every((delimiter) => /^:?-{3,}:?$/.test(delimiter))) return null;
  return { headers, align: delimiters.map((delimiter) => delimiter.startsWith(':') && delimiter.endsWith(':') ? 'center' : delimiter.endsWith(':') ? 'right' : 'left') };
}

export function CopilotSuggestions({ items, onSelect, disabled = false, emptyText = 'No suggested questions are available for this scope. Write a question about your recorded operations.', note = 'Suggestions do not send a request until you select Ask Copilot.' }: { items: readonly string[]; onSelect: (question: string) => void; disabled?: boolean; emptyText?: string; note?: string }) {
  return <CopilotPanel title="Suggested questions" subtitle="Choose a starting point for your draft."><div className={styles.suggestions}>{items.length ? items.map((item) => <Button type="button" key={item} disabled={disabled} onClick={() => onSelect(item)}>{item}</Button>) : <p className={styles.body}>{emptyText}</p>}</div><p className={styles.footnote}><ShieldCheck size={16} aria-hidden="true" />{note}</p></CopilotPanel>;
}

export function CopilotSafeguards({ items, title = 'How to review a Copilot answer', subtitle = 'Treat generated guidance as a starting point for a human decision.', footer }: { items: readonly { title: string; text: string; icon?: ReactNode }[]; title?: string; subtitle?: string; footer?: ReactNode }) {
  const icons = [<FileSearch key="source" size={20} aria-hidden="true" />, <Cpu key="method" size={20} aria-hidden="true" />, <ClipboardCheck key="review" size={20} aria-hidden="true" />];
  return <CopilotPanel title={title} subtitle={subtitle}><div className={styles.safeguards}>{items.map((item, index) => <div key={item.title}><span className={styles.recordIcon}>{item.icon ?? icons[index % icons.length]}</span><h3>{item.title}</h3><p>{item.text}</p></div>)}</div>{footer && <div className={styles.footnote}>{footer}</div>}</CopilotPanel>;
}
