import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EstateTargetSelect } from '@/components/estate/estate-target-select';

describe('Estate creation target selection', () => {
  it('connects an accessible required selector to its label and selected estate', () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(createElement(EstateTargetSelect, { options: [{ id: 'lekki', label: 'Lekki Gardens' }, { id: 'abuja', label: 'Abuja estate' }], value: 'abuja', onChange }));
    const labelFor = html.match(/<label[^>]*for="([^"]+)"/)?.[1];
    expect(labelFor).toBeTruthy();
    expect(html).toContain(`select id="${labelFor}"`);
    expect(html).toContain('Estate property');
    expect(html).toContain('required=""');
    expect(html).toContain('<option value="abuja" selected="">Abuja estate</option>');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables an empty target list and explains why a record cannot be created', () => {
    const html = renderToStaticMarkup(createElement(EstateTargetSelect, { options: [], value: '', onChange: vi.fn() }));
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).toContain('No authorised estate properties are available for this action.');
  });

  it('disables target changes while a creation request is pending', () => {
    const html = renderToStaticMarkup(createElement(EstateTargetSelect, { options: [{ id: 'estate', label: 'Estate' }], value: 'estate', onChange: vi.fn(), disabled: true }));
    expect(html).toMatch(/<select[^>]*disabled=""/);
  });
});
