import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'db/migrations/017_construction_project_access.sql'), 'utf8');

describe('Construction project-access migration', () => {
  it('persists every Construction assignment dimension on memberships and invitations', () => {
    for (const table of ['company_memberships', 'company_invitations']) {
      for (const column of ['construction_project_ids', 'construction_package_ids', 'construction_subcontractor_ids', 'construction_task_ids', 'all_construction_projects']) {
        expect(sql).toContain(`alter table ${table} add column if not exists ${column}`);
      }
    }
  });

  it('copies immutable invitation scopes into the accepted membership and fails scoped profiles closed', () => {
    expect(sql).toContain('construction_project_ids=excluded.construction_project_ids');
    expect(sql).toContain('construction_package_ids=excluded.construction_package_ids');
    expect(sql).toContain('construction_subcontractor_ids=excluded.construction_subcontractor_ids');
    expect(sql).toContain('construction_task_ids=excluded.construction_task_ids');
    expect(sql).toContain('set all_construction_projects=false');
  });
});
