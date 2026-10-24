import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageTabs } from '@/components/ui/page-tabs';
import { nextPageTab } from '@/lib/page-tabs';

const ids = ['overview', 'register', 'insights'];
const items = ids.map((id) => ({ id, label: id, content: createElement('p', null, `${id} content`) }));

describe('page-local tabs', () => {
  it('links every tab to its panel and keeps only the selected tab in the tab order', () => {
    const html = renderToStaticMarkup(createElement(PageTabs, { label: 'Estate sections', items }));
    expect(html).toContain('role="tablist" aria-label="Estate sections"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(html.match(/aria-selected="true" tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="false" tabindex="-1"/g)).toHaveLength(2);
    expect(html.match(/hidden=""/g)).toHaveLength(2);
    for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) expect(html).toContain(`id="${match[1]}" role="tabpanel"`);
    for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(html).toContain(`id="${match[1]}" aria-controls=`);
  });
  it('retains all section content and allows a valid initial section', () => {
    const html = renderToStaticMarkup(createElement(PageTabs, { label: 'Sections', items, defaultTab: 'register' }));
    for (const id of ids) expect(html).toContain(`${id} content`);
    expect(html).toMatch(/aria-selected="true" tabindex="0"[^>]*>register/);
  });
  it('falls back safely for a stale or unauthorised selection and handles empty items', () => {
    expect(renderToStaticMarkup(createElement(PageTabs, { label: 'Sections', items, defaultTab: 'removed' }))).toMatch(/aria-selected="true" tabindex="0"[^>]*>overview/);
    expect(renderToStaticMarkup(createElement(PageTabs, { label: 'None', items: [] }))).toBe('');
  });
  it('supports controlled selection and makes counts available to screen readers', () => {
    const counted = [{ ...items[0], count: 0 }, ...items.slice(1)];
    const html = renderToStaticMarkup(createElement(PageTabs, { label: 'Sections', items: counted, defaultTab: 'overview', activeTab: 'insights' }));
    expect(html).toMatch(/aria-selected="true" tabindex="0"[^>]*>insights/);
    expect(html).toContain('>0</span>');
  });
  it('creates independent tab/panel IDs for multiple page groups', () => {
    const html = renderToStaticMarkup(createElement('div', null, createElement(PageTabs, { label: 'First', items }), createElement(PageTabs, { label: 'Second', items })));
    const elementIds = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(elementIds).size).toBe(elementIds.length);
  });
  it.each([
    ['overview', 'ArrowRight', 'register'], ['insights', 'ArrowRight', 'overview'],
    ['overview', 'ArrowLeft', 'insights'], ['register', 'ArrowLeft', 'overview'],
    ['register', 'Home', 'overview'], ['overview', 'End', 'insights'],
    ['register', 'Tab', null], ['register', 'Enter', null], ['missing', 'ArrowRight', 'register'],
  ])('moves focus from %s with %s to %s', (current, key, expected) => {
    expect(nextPageTab(ids, current, key)).toBe(expected);
  });
  it('handles a single tab and no tabs without throwing', () => {
    expect(nextPageTab(['only'], 'only', 'ArrowLeft')).toBe('only');
    expect(nextPageTab([], 'missing', 'End')).toBeNull();
  });
});
