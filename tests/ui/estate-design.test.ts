import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { EstatePropertiesWorkspace } from '@/components/workspaces/estate-properties-workspace';
import type { EstatePropertySummary } from '@/domain/estate/properties';

const property: EstatePropertySummary = {
  id: 'garden-estate', name: 'Lagos Gardens', address: 'Lekki, Lagos', unitTypes: ['Apartment'],
  unitCount: 10, occupiedUnits: 6, vacantUnits: 2, reservedUnits: 1, unavailableUnits: 1, occupancyPct: 60,
  units: [],
};

function view(properties: EstatePropertySummary[]) {
  return renderToStaticMarkup(createElement(EstatePropertiesWorkspace, { properties }));
}

describe('Estate design system adaptation', () => {
  it('shows the actual occupancy mix with a text alternative, not an invented growth chart', () => {
    const html = view([property]);
    expect(html).toContain('Registered unit availability: 6 occupied, 2 vacant, 1 reserved, 1 unavailable');
    expect(html).toContain('6 of 10 units');
    expect(html).toContain('60%');
    expect(html).toContain('10 registered units');
    expect(html).not.toMatch(/NaN|Infinity|% growth|last month/);
  });

  it('uses an honest unmeasured state when no property inventory exists', () => {
    const html = view([]);
    expect(html).toContain('No units registered yet');
    expect(html).toContain('Your property register starts here');
    expect(html).toContain('Registered unit availability: 0 occupied, 0 vacant, 0 reserved, 0 unavailable');
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('retains every zero category for readers without drawing a phantom bar segment', () => {
    const html = view([{ ...property, occupiedUnits: 10, vacantUnits: 0, reservedUnits: 0, unavailableUnits: 0, occupancyPct: 100 }]);
    expect(html).toContain('10 of 10 units');
    expect(html).toContain('100%');
    expect(html.match(/flex-grow:/g)).toHaveLength(1);
    expect(html).toContain('Registered unit availability: 10 occupied, 0 vacant, 0 reserved, 0 unavailable');
  });

  it('keeps colours theme-driven across charts, occupancy and primary form actions', () => {
    for (const file of ['estate-overview.module.css', 'estate-properties.module.css', 'estate-create-actions.module.css']) {
      const css = readFileSync(new URL(`../../src/components/workspaces/${file}`, import.meta.url), 'utf8');
      expect(css).toContain('var(--radius-card, 12px)');
      expect(css).toContain('var(--radius-control, 10px)');
      expect(css).toContain(':focus-visible');
      expect(css).not.toMatch(/#2346f0|#1837d1/i);
    }
    const actions = readFileSync(new URL('../../src/components/workspaces/estate-create-actions.module.css', import.meta.url), 'utf8');
    expect(actions).toContain('color: var(--on-primary)');
  });
});
