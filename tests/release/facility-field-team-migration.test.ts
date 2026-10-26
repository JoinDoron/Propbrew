import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../db/migrations/014_facility_field_team.sql', import.meta.url), 'utf8');

describe('Facility field-team database migration', () => {
  it('persists constrained duties, vendor binding, lookup indexing and invitation propagation', () => {
    for (const fragment of ['facility_role text', 'vendor_org_id text', "'manager','technician','vendor'", 'company_memberships_facility_roster_idx', 'invitation.facility_role', 'invitation.vendor_org_id']) expect(sql).toContain(fragment);
  });
  it('preserves the company invitation lock and durable audit event', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('company.invitation.accepted');
    expect(sql).toContain('jsonb_build_object');
  });
});
