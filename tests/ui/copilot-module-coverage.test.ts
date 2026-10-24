import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CopilotComposer, CopilotConversation, CopilotEmpty, CopilotMessage, CopilotSuggestions } from '@/components/ai/copilot-reference';
import { PAGE_META, visibleNav } from '@/config/nav';
import { workspaceForPath, type WorkspaceId } from '@/config/workspaces';
import { can, type Actor, type Role } from '@/lib/authz';

const actor = (role: Role): Actor => ({ userId: 'user-1', tenantId: 'tenant-1', roles: [role], estateIds: ['estate-1'], allEstates: false, unitIds: ['unit-1'], vendorOrgId: 'vendor-1', investorProjectIds: ['project-1'] });
const entries = { estate: '/estate/copilot', facility: '/copilot', shortlet: '/shortlet/copilot', construction: '/construction/copilot' } satisfies Record<WorkspaceId, string>;

describe('Module-specific Copilot entry points', () => {
  it.each(Object.entries(entries))('keeps %s assistant navigation inside the selected module', (module, href) => {
    const links = visibleNav('ops', actor('estate_manager'), module as WorkspaceId).flatMap((group) => group.items.map((item) => item.href));
    expect(links).toContain(href);
    expect(workspaceForPath(href)).toBe(module);
    expect(PAGE_META[href]).toBeDefined();
    for (const other of Object.values(entries).filter((entry) => entry !== href)) expect(links).not.toContain(other);
  });

  it.each(['resident', 'security', 'vendor', 'investor', 'platform_admin'] as const)('does not grant %s a Shortlet assistant through booking-read alone', (role) => {
    const links = visibleNav('ops', actor(role), 'shortlet').flatMap((group) => group.items.map((item) => item.href));
    expect(links).not.toContain('/shortlet/copilot');
  });

  it.each(['executive', 'estate_manager'] as const)('preserves %s financial-read and write grants when adding a navigation entry', (role) => {
    const person = actor(role);
    expect(can(person, 'bookings_amenities', 'read').allowed).toBe(true);
    expect(can(person, 'bookings_amenities', 'update').allowed).toBe(role === 'estate_manager');
  });
});

describe('Accessible shared conversation presentation', () => {
  it.each([{ busy: false, value: '', disabled: false }, { busy: true, value: 'Review recorded occupancy', disabled: false }, { busy: false, value: 'Review recorded occupancy', disabled: true }])('blocks submission for a blank, busy or unavailable composer (%j)', (props) => {
    const submit = vi.fn();
    const html = renderToStaticMarkup(createElement(CopilotComposer, { label: 'Ask the module copilot', onChange: vi.fn(), onSubmit: submit, ...props }));
    expect(html).toMatch(/<button[^>]+type="submit"[^>]+disabled=""/);
    expect(html).toMatch(/maxlength="2000"/i);
    expect(html).toContain('aria-describedby=');
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps separately embedded composers labelled with distinct controls and hints', () => {
    const html = renderToStaticMarkup(createElement('div', null, ...['Estate', 'Reports'].map((name) => createElement(CopilotComposer, { key: name, label: `Ask ${name}`, value: 'Recorded question', onChange: vi.fn(), onSubmit: vi.fn() }))));
    const labels = Array.from(html.matchAll(/<label for="([^"]+)"/g), (match) => match[1]);
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    for (const id of labels) expect(html).toContain(`id="${id}"`);
  });

  it('does not submit suggestions or invent replies when rendering an empty conversation', () => {
    const choose = vi.fn();
    const suggestions = renderToStaticMarkup(createElement(CopilotSuggestions, { items: ['Review the recorded snapshot'], onSelect: choose }));
    expect(suggestions).toContain('type="button"');
    expect(suggestions).toContain('Suggestions do not send a request');
    expect(choose).not.toHaveBeenCalled();
    const logProps = { label: 'Estate copilot conversation', busy: true, children: createElement(CopilotEmpty, { title: 'Start with an estate question', description: 'Read scoped recorded operations.' }) };
    const log = renderToStaticMarkup(createElement(CopilotConversation, logProps));
    expect(log).toContain('role="log"');
    expect(log).toContain('aria-label="Estate copilot conversation"');
    expect(log).toContain('aria-busy="true"');
    expect(log).toContain('tabindex="0"');
  });

  it('renders answer errors as alerts while preserving safe text and provenance', () => {
    const messageProps = { speaker: 'copilot' as const, name: 'Estate Copilot', error: true, sources: 'No independent source citation was supplied.', children: '<script>not executable</script>' };
    const html = renderToStaticMarkup(createElement(CopilotMessage, messageProps));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;not executable&lt;/script&gt;');
    expect(html).toContain('No independent source citation was supplied.');
  });
});
