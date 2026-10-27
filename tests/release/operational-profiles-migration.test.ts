import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../db/migrations/015_operational_profiles.sql', import.meta.url), 'utf8');

describe('Operational profile assignment migration', () => {
  it('persists profile, estate, block and resident-unit assignments on members and invitations', () => {
    for (const fragment of [
      'company_memberships add column if not exists operational_profile',
      'company_memberships add column if not exists building_ids',
      'company_memberships add column if not exists unit_ids',
      'company_invitations add column if not exists operational_profile',
      'company_invitations add column if not exists estate_ids',
      'company_invitations add column if not exists building_ids',
      'company_invitations add column if not exists unit_ids',
      'company_memberships_profile_roster_idx',
    ]) expect(sql).toContain(fragment);
  });

  it('copies every assignment through invitation acceptance and into durable audit evidence', () => {
    for (const fragment of [
      'invitation.operational_profile',
      'invitation.estate_ids',
      'invitation.building_ids',
      'invitation.unit_ids',
      'invitation.all_estates',
      "'operationalProfile',invitation.operational_profile",
      "'buildingIds',invitation.building_ids",
      "'unitIds',invitation.unit_ids",
    ]) expect(sql).toContain(fragment);
  });
});
