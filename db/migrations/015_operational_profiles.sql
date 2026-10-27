-- Persist operational user types and their record assignments. Workspace grants
-- remain a ceiling; these fields narrow a member to a profile and explicit
-- property/block/unit/vendor scope.
alter table company_memberships add column if not exists operational_profile text;
alter table company_memberships add column if not exists building_ids jsonb not null default '[]'::jsonb;
alter table company_memberships add column if not exists unit_ids jsonb not null default '[]'::jsonb;
alter table company_invitations add column if not exists operational_profile text;
alter table company_invitations add column if not exists estate_ids jsonb not null default '[]'::jsonb;
alter table company_invitations add column if not exists building_ids jsonb not null default '[]'::jsonb;
alter table company_invitations add column if not exists unit_ids jsonb not null default '[]'::jsonb;
alter table company_invitations add column if not exists all_estates boolean not null default true;

alter table company_memberships drop constraint if exists company_memberships_operational_profile_check;
alter table company_memberships add constraint company_memberships_operational_profile_check check (
  operational_profile is null or operational_profile ~ '^[a-z][a-z0-9-]{1,79}$'
);
alter table company_invitations drop constraint if exists company_invitations_operational_profile_check;
alter table company_invitations add constraint company_invitations_operational_profile_check check (
  operational_profile is null or operational_profile ~ '^[a-z][a-z0-9-]{1,79}$'
);
alter table company_memberships drop constraint if exists company_memberships_assignment_arrays_check;
alter table company_memberships add constraint company_memberships_assignment_arrays_check check (
  jsonb_typeof(estate_ids)='array' and jsonb_typeof(building_ids)='array' and jsonb_typeof(unit_ids)='array'
);
alter table company_invitations drop constraint if exists company_invitations_assignment_arrays_check;
alter table company_invitations add constraint company_invitations_assignment_arrays_check check (
  jsonb_typeof(estate_ids)='array' and jsonb_typeof(building_ids)='array' and jsonb_typeof(unit_ids)='array'
);

update company_memberships set operational_profile=case
  when facility_role='technician' then 'field-technician'
  when facility_role='vendor' then 'vendor-technician'
  when facility_role='manager' and modules->>'facility'='manage' then 'facility-manager'
  when modules = '{"estate":"manage"}'::jsonb then 'portfolio-manager'
  when modules = '{"shortlet":"manage"}'::jsonb then 'shortlet-manager'
  when modules = '{"construction":"manage"}'::jsonb then 'project-director'
  else operational_profile end
where operational_profile is null and company_role='member';

update company_invitations set operational_profile=case
  when facility_role='technician' then 'field-technician'
  when facility_role='vendor' then 'vendor-technician'
  when facility_role='manager' and modules->>'facility'='manage' then 'facility-manager'
  when modules = '{"estate":"manage"}'::jsonb then 'portfolio-manager'
  when modules = '{"shortlet":"manage"}'::jsonb then 'shortlet-manager'
  when modules = '{"construction":"manage"}'::jsonb then 'project-director'
  else operational_profile end
where operational_profile is null and company_role='member';

create index if not exists company_memberships_profile_roster_idx
  on company_memberships(tenant_id,operational_profile,user_id) where status='active' and operational_profile is not null;

create or replace function accept_company_invitation(token text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare invitation company_invitations; subject uuid; existing company_memberships;
begin
 subject := nullif(current_setting('app.auth_user_id',true),'')::uuid;
 if subject is null then raise exception 'An authenticated account is required'; end if;
 select * into invitation from company_invitations where token_hash=token for update;
 if found then perform pg_advisory_xact_lock(hashtextextended(invitation.tenant_id::text,812649)); end if;
 if not found or invitation.accepted_at is not null or invitation.cancelled_at is not null or invitation.expires_at<=now()
   or lower(invitation.email) is distinct from (select lower(email) from auth_users where id=subject)
   or not exists(select from tenants where id=invitation.tenant_id and status='active')
   or not exists(select from company_memberships where tenant_id=invitation.tenant_id and user_id=invitation.created_by and status='active' and company_role in ('owner','admin'))
 then raise exception 'Invitation is unavailable'; end if;
 select * into existing from company_memberships where tenant_id=invitation.tenant_id and user_id=subject for update;
 if found and existing.status='active' then raise exception 'Already a member'; end if;
 insert into company_memberships(tenant_id,user_id,company_role,modules,facility_role,vendor_org_id,operational_profile,estate_ids,building_ids,unit_ids,all_estates)
 values(invitation.tenant_id,subject,invitation.company_role,invitation.modules,invitation.facility_role,invitation.vendor_org_id,invitation.operational_profile,invitation.estate_ids,invitation.building_ids,invitation.unit_ids,invitation.all_estates)
 on conflict(tenant_id,user_id) do update set company_role=excluded.company_role,modules=excluded.modules,
   facility_role=excluded.facility_role,vendor_org_id=excluded.vendor_org_id,operational_profile=excluded.operational_profile,
   estate_ids=excluded.estate_ids,building_ids=excluded.building_ids,unit_ids=excluded.unit_ids,all_estates=excluded.all_estates,
   status='active',version=company_memberships.version+1,updated_at=now();
 update company_invitations set accepted_at=now() where id=invitation.id;
 perform set_config('app.tenant_id',invitation.tenant_id::text,true);
 insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload)
 values(invitation.tenant_id,subject::text,'company.invitation.accepted','membership',subject::text,
   jsonb_build_object('role',invitation.company_role,'modules',invitation.modules,'operationalProfile',invitation.operational_profile,
     'estateIds',invitation.estate_ids,'buildingIds',invitation.building_ids,'unitIds',invitation.unit_ids,
     'facilityRole',invitation.facility_role,'vendorOrgId',invitation.vendor_org_id));
 return invitation.tenant_id;
end $$;
revoke all on function accept_company_invitation(text) from public;
