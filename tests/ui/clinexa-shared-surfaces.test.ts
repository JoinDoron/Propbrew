import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AiSuggestionCard, ReadOnlyChip, ScopeBanner, formatMoney } from '@/components/domain';
import { ComingSoon } from '@/components/coming-soon';
import { money } from '@/domain/primitives';

const read = (file: string) => readFileSync(new URL(`../../src/components/${file}`, import.meta.url), 'utf8');
const sync = read('sync/sync-indicator.tsx');
const domain = read('domain/index.tsx');

describe('Clinexa shared application surfaces', () => {
  it('uses shared sync targets without changing the outbox drain or queue predicates', () => {
    expect(sync).toContain('className="pb-icon-action relative border transition-colors"');
    expect(sync).not.toContain('38px');
    expect(sync).toContain('useOutboxSync(owner);');
    expect(sync).toContain('const ops = useOutbox(owner);');
    expect(sync).toContain('const online = useOnline();');
    expect(sync).toContain("ops.filter((o) => o.status !== 'synced')");
    expect(sync).toContain('stats.pending + stats.conflicts');
    expect(sync).toContain('setForcedOffline(false); setForced(false)');
  });

  it('bounds the sync popover to narrow viewports and connects it to its trigger', () => {
    expect(sync).toContain('w-[min(340px,calc(100vw-24px))]');
    expect(sync).toContain('max-[640px]:fixed max-[640px]:right-3');
    expect(sync).toContain('aria-expanded={open}');
    expect(sync).toContain('aria-controls={popoverId}');
    expect(sync).toContain('id={popoverId} role="region"');
    expect(sync).toContain("event.key === 'Escape'");
    expect(sync).toContain('trigger.current?.focus()');
    expect(sync).toContain('aria-pressed={forced}');
    expect(sync).toContain('text-[14px] font-medium break-words');
    expect(sync).toContain('text-[12px] text-text-3 mt-1');
  });

  it('keeps placeholder framing aligned and its access-control disclosure intact', () => {
    const html = renderToStaticMarkup(createElement(ComingSoon, { requirementIds: ['FM-01'] }));
    expect(html).toContain('class="pb-page"');
    expect(html).toContain('access-controlled');
    expect(html).toContain('FM-01');
    expect(read('coming-soon.tsx')).not.toContain('mx-auto');
  });

  it('uses readable low-emphasis read-only metadata without altering scope formatting', () => {
    const html = renderToStaticMarkup(createElement(ReadOnlyChip));
    expect(html).toContain('text-[12px] font-medium');
    expect(html).toContain('Read-only');
    const scope = renderToStaticMarkup(createElement(ScopeBanner, { label: '2 estates' }));
    expect(scope).toContain('mb-3');
    expect(scope).toContain('Viewing 2 estates');
    expect(formatMoney(money(125000, 'NGN'))).toContain('1,250');
  });

  it('uses card tokens and wrapping rows for AI guidance', () => {
    expect(domain).toContain('rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6');
    expect(domain).toContain('text-[16px] font-medium');
    expect(domain).toContain('text-[14px] leading-relaxed');
    expect(domain).toContain('flex flex-wrap items-center gap-3 mt-4');
    expect(domain).toContain('[overflow-wrap:anywhere]');
  });

  it('retains confidence, sources, feature attribution and both human actions', () => {
    const props = {
      featureId: 'AI-E-03', title: 'Collection guidance', confidence: .92,
      sources: ['Invoice register', 'Recorded receipts'], children: 'Review the account before a reminder.',
      onApprove: createElement('button', { type: 'button' }, 'Approve reminder'),
      onOverride: createElement('button', { type: 'button' }, 'Override suggestion'),
    };
    const html = renderToStaticMarkup(createElement(AiSuggestionCard, props));
    for (const text of ['AI-E-03', '92% confidence', 'Invoice register', 'Recorded receipts', 'Approve reminder', 'Override suggestion', 'Review · approve · override']) {
      expect(html).toContain(text);
    }
  });

  it.each(['loading', 'error'] as const)('preserves the %s state without rendering ready-state actions', (state) => {
    const props = {
      featureId: 'AI-F-01', title: 'Asset guidance', state, confidence: .5, sources: [],
      children: 'Ready-only content', onApprove: 'Approve-only action', onOverride: 'Override-only action',
    };
    const html = renderToStaticMarkup(createElement(AiSuggestionCard, props));
    expect(html).toContain(state === 'loading' ? 'Generating suggestion…' : 'falling back to the manual flow');
    expect(html).not.toContain('Ready-only content');
    expect(html).not.toContain('Approve-only action');
    expect(html).not.toContain('Override-only action');
  });
});
