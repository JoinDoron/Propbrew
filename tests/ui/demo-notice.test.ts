import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('global demo and snapshot notices', () => {
  it('does not render the demo banner in the application shell or workspace chooser', () => {
    for (const path of ['src/components/shell-frame.tsx', 'src/app/(ops)/workspaces/page.tsx']) {
      const code = source(path);
      expect(code).not.toContain('DemoNotice');
      expect(code).not.toContain('Demo account notice');
      expect(code).not.toContain('Private demo sandbox');
      expect(code).not.toContain('Reset sample data');
    }
  });

  it('does not reserve construction page space for the company-records disclaimer', () => {
    const code = source('src/components/construction/construction-ui.tsx');
    expect(code).not.toContain('data-construction-snapshot');
    expect(code).not.toContain('Company records');
    expect(code).not.toContain('Recorded snapshot');
    expect(code).not.toContain('Forecasts and rule-match scores');
  });

  it('does not add a demo notice to the company chooser', () => {
    const code = source('src/components/auth/company-chooser.tsx');
    expect(code).not.toContain('Private demo sandbox');
    expect(code).not.toContain('Add, edit and test workflows across all four modules');
  });
});
