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

  it('splits the live prose-prefixed portfolio header into a paragraph and native table, preserving the bold Total row', () => {
    const html = render('Your portfolio has 2 properties and 12 registered unit records: | Property | Buildings | Registered units | Occupied | Vacant | Reserved |\n|---|---:|---:|---:|---:|---:|\n| Lekki Gardens | 1 | 10 | 4 | 6 | 0 |\n| QA Audit Estate | 1 | 2 | 1 | 1 | 0 |\n| **Total** | **2** | **12** | **5** | **7** | **0** |');
    expect(html).toContain('<p>Your portfolio has 2 properties and 12 registered unit records:</p>');
    expect(html.match(/<table\b/g)).toHaveLength(1);
    expect(html.match(/scope="col"/g)).toHaveLength(6);
    expect(html.match(/<td\b/g)).toHaveLength(18);
    expect(html).toContain('<strong>Total</strong>');
    expect(html).toContain('<strong>12</strong>');
    for (const value of ['Property', 'Buildings', 'Registered units', 'Occupied', 'Vacant', 'Reserved', 'QA Audit Estate']) expect(html).toContain(value);
    expect(html).not.toContain('|---');
    expect(html).not.toContain('records: | Property');
  });

  it('keeps prose-prefix HTML and arbitrary links inert while repairing a valid header', () => {
    const html = render('<script>unsafe()</script> [Unsafe](javascript:alert(1)): | **Property** | Units |\n|---|---:|\n| <img src=x onerror=alert(1)> | **2** |');
    expect(html).toContain('<p>&lt;script&gt;unsafe()&lt;/script&gt; [Unsafe](javascript:alert(1)):</p>');
    expect(html).toContain('<table');
    expect(html).toContain('<strong>Property</strong>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<script>|<img |<a /);
  });

  it.each([
    'Compare recorded A | B with C.',
    'Summary: | Property | Units |\n|---|--|\n| Estate | 2 |',
    'Summary: | Property | Units |\n|notes|---|\n| Estate | 2 |',
    'Summary: | Property | Units | Extra |\n|---|---|\n| Estate | 2 |',
    'Summary: `A|B` has no table separator.',
  ])('does not turn ordinary pipes or incomplete/malformed separators into a repaired table: %s', (text) => {
    expect(render(text)).not.toContain('<table');
    expect(render(text)).toContain('|');
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

describe('Numbered actions in streamed Copilot answers', () => {
  it('renders blank-line-separated numbered actions as one native list with consecutive numbering', () => {
    const html = render('1. **Verify the delivery**\n\n2. Review the recorded quantities\n   \n\n3) Escalate the remaining shortage\n\n4. Confirm the next approved step');
    expect(html.match(/<ol\b/g)).toHaveLength(1);
    expect(html.match(/<li\b/g)).toHaveLength(4);
    expect(html).toContain('<ol><li><strong>Verify the delivery</strong></li><li>Review the recorded quantities</li><li>Escalate the remaining shortage</li><li>Confirm the next approved step</li></ol>');
    expect(html).not.toContain('start="1"');
  });

  it('keeps intervening prose as a paragraph and preserves a new list that resumes at five', () => {
    const html = render('1. Inspect the record\n\n2. Review evidence\n\nPause here for manager approval.\n\n5. Record the approved outcome\n\n6. Verify the audit trail');
    expect(html.match(/<ol\b/g)).toHaveLength(2);
    expect(html).toContain('<ol><li>Inspect the record</li><li>Review evidence</li></ol><p>Pause here for manager approval.</p><ol start="5"><li>Record the approved outcome</li><li>Verify the audit trail</li></ol>');
  });

  it('preserves table, heading, code and different-list boundaries between numbered sections', () => {
    const html = render('1. First recorded action\n\n' + table + '\n\n5. Review the table\n\n# Manager checkpoint\n\n7. Confirm the scope\n\n```text\n8. Literal code action\n```\n\n9. Review the code\n\n- Separate supporting fact\n\n11. Final recorded action');
    expect(html.match(/<ol\b/g)).toHaveLength(5);
    expect(html.match(/<table\b/g)).toHaveLength(1);
    expect(html).toContain('<ol start="5"><li>Review the table</li></ol>');
    expect(html).toContain('<ol start="7"><li>Confirm the scope</li></ol><pre><code>8. Literal code action</code></pre><ol start="9">');
    expect(html).toContain('<ul><li>Separate supporting fact</li></ul><ol start="11">');
    expect(html).toContain('Manager checkpoint');
  });

  it('keeps partial numbered markers visible while every growing streamed prefix remains renderable', () => {
    const text = '5. **Review quantities**\n\n6. Confirm the next recorded action\n\nCheck with the manager.\n\n9) Continue after approval';
    for (let length = 0; length <= text.length; length++) expect(() => render(text.slice(0, length))).not.toThrow();
    expect(render('5. First action\n\n6')).toContain('<ol start="5"><li>First action</li></ol><p>6</p>');
    expect(render('5. First action\n\n6.')).toContain('<p>6.</p>');
    const html = render(text);
    expect(html).toContain('<ol start="5"><li><strong>Review quantities</strong></li><li>Confirm the next recorded action</li></ol>');
    expect(html).toContain('<p>Check with the manager.</p><ol start="9"><li>Continue after approval</li></ol>');
  });
});
