-- Facility field identities are company memberships with an operational duty.
-- Company role remains the administration boundary; facility_role narrows the
-- operational matrix and never grants a workspace by itself.
alter table company_memberships add column if not exists facility_role text;
alter table company_memberships add column if not exists vendor_org_id text;
alter table company_invitations add column if not exists facility_role text;
alter table company_invitations add column if not exists vendor_org_id text;

alter table company_memberships drop constraint if exists company_memberships_facility_role_check;
alter table company_memberships add constraint company_memberships_facility_role_check check (
  facility_role is null or facility_role in ('manager','technician','vendor')
);
alter table company_memberships drop constraint if exists company_memberships_vendor_binding_check;
alter table company_memberships add constraint company_memberships_vendor_binding_check check (
  (facility_role='vendor' and vendor_org_id is not null and length(btrim(vendor_org_id)) between 1 and 200)
  or (facility_role is distinct from 'vendor' and vendor_org_id is null)
);
alter table company_invitations drop constraint if exists company_invitations_facility_role_check;
alter table company_invitations add constraint company_invitations_facility_role_check check (
  facility_role is null or facility_role in ('manager','technician','vendor')
);
alter table company_invitations drop constraint if exists company_invitations_vendor_binding_check;
alter table company_invitations add constraint company_invitations_vendor_binding_check check (
  (facility_role='vendor' and vendor_org_id is not null and length(btrim(vendor_org_id)) between 1 and 200)
  or (facility_role is distinct from 'vendor' and vendor_org_id is null)
);

update company_memberships set facility_role='manager'
where facility_role is null and modules->>'facility'='manage';
update company_invitations set facility_role='manager'
where facility_role is null and modules->>'facility'='manage';

create index if not exists company_memberships_facility_roster_idx
  on company_memberships(tenant_id,facility_role,user_id) where status='active' and facility_role is not null;

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
 insert into company_memberships(tenant_id,user_id,company_role,modules,facility_role,vendor_org_id)
 values(invitation.tenant_id,subject,invitation.company_role,invitation.modules,invitation.facility_role,invitation.vendor_org_id)
 on conflict(tenant_id,user_id) do update set company_role=excluded.company_role,modules=excluded.modules,
   facility_role=excluded.facility_role,vendor_org_id=excluded.vendor_org_id,status='active',
   version=company_memberships.version+1,updated_at=now();
 update company_invitations set accepted_at=now() where id=invitation.id;
 perform set_config('app.tenant_id',invitation.tenant_id::text,true);
 insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload)
 values(invitation.tenant_id,subject::text,'company.invitation.accepted','membership',subject::text,
   jsonb_build_object('role',invitation.company_role,'modules',invitation.modules,'facilityRole',invitation.facility_role,'vendorOrgId',invitation.vendor_org_id));
 return invitation.tenant_id;
end $$;
revoke all on function accept_company_invitation(text) from public;
