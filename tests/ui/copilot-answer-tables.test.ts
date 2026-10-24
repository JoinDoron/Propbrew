import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CopilotAnswer } from '@/components/ai/copilot-reference';

const render = (text: string) => renderToStaticMarkup(createElement(CopilotAnswer, { text }));
const table = '| Generator | Fuel | Status |\n| --- | ---: | :---: |\n| East generator | 12% | Review refuel |\n| West generator | 65% | Recorded running |';

describe('Safe native tables in streamed Copilot answers', () => {
  it('renders the actual three-column generator format as a named semantic native table', () => {
    const html = render(table);
    expect(html).toContain('<table'); expect(html).toContain('<thead><tr>'); expect(html).toContain('<tbody><tr>');
    expect(html.match(/scope="col"/g)).toHaveLength(3);
    expect(html.match(/<td\b/g)).toHaveLength(6);
    for (const text of ['East generator', '12%', 'Review refuel', 'West generator', '65%', 'Recorded running']) expect(html).toContain(text);
    expect(html).toContain('data-align="right"'); expect(html).toContain('data-align="center"');
    expect(html).not.toContain('| ---');
    expect(html).toMatch(/role="region" tabindex="0" aria-label="AI answer table 1; scroll horizontally for all columns"/);
    expect(html).toMatch(/<caption[^>]*>AI answer table 1<\/caption>/);
  });

  it('preserves exact native currencies, emphasis and inline or escaped pipes inside cells', () => {
    const html = render('| **Recorded item** | Native value | Note |\n| --- | ---: | --- |\n| *Lift filter* | NGN ₦1,234.56 | `SKU|42` |\n| Transfer \\| receipt | USD US$20.01 | Keep currencies separate |');
    for (const text of ['<strong>Recorded item</strong>', '<em>Lift filter</em>', 'NGN ₦1,234.56', 'USD US$20.01', '<code>SKU|42</code>', 'Transfer | receipt', 'Keep currencies separate']) expect(html).toContain(text);
    expect(html.match(/<td\b/g)).toHaveLength(6);
    expect(html).not.toContain('NaN'); expect(html).not.toContain('currency conversion');
  });

  it('keeps partial headers as text, then renders partial streamed rows without inventing missing values', () => {
    expect(render('| Unit | Balance |\n| --- | --')).not.toContain('<table');
    const header = '| Unit | Balance | Status |\n| --- | --- | --- |';
    expect(render(header)).toContain('<tbody></tbody>');
    const partial = render(header + '\n| Unit 2B | NGN ₦10.');
    expect(partial).toContain('NGN ₦10.'); expect(partial.match(/<td\b/g)).toHaveLength(3);
    expect(partial).toContain('aria-label="No cell text supplied"></td>');
    expect(partial).not.toMatch(/undefined|NaN|₦0/);
    const full = render(header + '\n| Unit 2B | NGN ₦10.01 | Awaiting review |');
    expect(full).toContain('NGN ₦10.01'); expect(full).toContain('Awaiting review');
  });

  it('keeps HTML and arbitrary generated links inert in table headers and cells', () => {
    const html = render('| <img src=x onerror=alert(1)> | Evidence |\n| --- | --- |\n| <script>private()</script> | [Unsafe](javascript:alert(1)) |\n| **Review** | [External](https://untrusted.invalid) |');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;'); expect(html).toContain('&lt;script&gt;private()&lt;/script&gt;');
    expect(html).not.toContain('<img '); expect(html).not.toContain('<script>'); expect(html).not.toContain('<a ');
    expect(html).toContain('[Unsafe](javascript:alert(1))'); expect(html).toContain('<strong>Review</strong>');
  });

  it('recognises tables beside prose and semantic lists without requiring extra blank lines', () => {
    const html = render('**SL-4207**\n- **Apartment:** Unit 2B\n- **Stay:** 24–26 October 2026\nRecorded generator status:\n' + table + '\nReview the source records.\n1. Inspect the recorded unit\n2. Confirm the next step');
    expect(html).toContain('<p><strong>SL-4207</strong></p><ul>');
    expect(html).toContain('<li><strong>Apartment:</strong> Unit 2B</li>');
    expect(html).toContain('<li><strong>Stay:</strong> 24–26 October 2026</li>');
    expect(html).toContain('<p>Recorded generator status:</p>'); expect(html).toContain('<table');
    expect(html).toContain('<p>Review the source records.</p><ol>');
    expect(html).toContain('<li>Inspect the recorded unit</li>');
  });

  it('keeps code fences literal, including blank lines and pipe-shaped content', () => {
    const html = render('```text\n' + table + '\n\n<script>not executable</script>\n```\n# Next recorded section\n' + table);
    expect(html.match(/<table\b/g)).toHaveLength(1);
    expect(html).toContain('<pre><code>| Generator | Fuel | Status |');
    expect(html).toContain('&lt;script&gt;not executable&lt;/script&gt;');
    expect(html).toContain('Next recorded section');
  });

  it('bounds native row and column counts while retaining all overflow facts as ordinary text', () => {
    const manyRows = render('| Record | Amount |\n| --- | --- |\n' + Array.from({ length: 102 }, (_, index) => `| Record-${index} | NGN ₦${index}.01 |`).join('\n'));
    expect(manyRows.match(/<td\b/g)).toHaveLength(200);
    expect(manyRows).toContain('Record-101'); expect(manyRows).toContain('NGN ₦101.01');
    const tooWide = render('| ' + Array.from({ length: 13 }, (_, index) => 'Column-' + index).join(' | ') + ' |\n| ' + Array.from({ length: 13 }, () => '---').join(' | ') + ' |');
    expect(tooWide).not.toContain('<table'); expect(tooWide).toContain('Column-12');
  });

  it('retains malformed or overfull rows visibly without dropping an extra cell or coercing amounts', () => {
    const html = render('| Item | Value |\n| --- | --- |\n| Full row | ₦10.01 |\n| Extra row | USD 20.01 | Extra fact |');
    expect(html).toContain('<table'); expect(html).toContain('₦10.01');
    expect(html).toContain('| Extra row | USD 20.01 | Extra fact |');
    expect(html).not.toMatch(/NaN|undefined/);
    expect(render('| Header | Value |\n| wrong | --- |\n| Row | 42 |')).not.toContain('<table');
  });

  it('contains horizontal overflow on narrow screens and retains all columns and keyboard access', () => {
    const html = render(table + '\n\n' + table);
    expect(html.match(/role="region" tabindex="0"/g)).toHaveLength(2);
    expect(html).toContain('AI answer table 1; scroll horizontally for all columns');
    expect(html).toContain('AI answer table 2; scroll horizontally for all columns');
    const captions = [...html.matchAll(/<caption id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(captions).size).toBe(2);
    const css = readFileSync(new URL('../../src/components/ai/copilot-reference.module.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.answerTableScroll\s*\{[^}]*min-width:0;[^}]*max-width:100%;[^}]*overflow-x:auto;[^}]*overscroll-behavior-x:contain/);
    expect(css).toMatch(/\.answerTable\s*\{[^}]*width:max-content;[^}]*min-width:100%/);
    expect(css).toMatch(/\.answerTableScroll:focus-visible\s*\{[^}]*outline:2px solid var\(--primary\)/);
    expect(css).not.toMatch(/answerTable[^}]*display:none/);
  });

  it('handles every growing prefix of a realistic streamed answer without losing the final table', () => {
    for (let length = 0; length <= table.length; length++) expect(() => render(table.slice(0, length))).not.toThrow();
    const html = render(table);
    expect(html.match(/<th\b/g)).toHaveLength(3); expect(html.match(/<td\b/g)).toHaveLength(6);
  });
});
