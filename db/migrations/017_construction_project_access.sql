-- Construction access is a separate security dimension from Estate sites.
-- Scoped profiles fail closed until an administrator assigns at least one
-- project; company-wide Construction profiles keep portfolio access.
alter table company_memberships add column if not exists construction_project_ids jsonb not null default '[]'::jsonb;
alter table company_memberships add column if not exists construction_package_ids jsonb not null default '[]'::jsonb;
alter table company_memberships add column if not exists construction_subcontractor_ids jsonb not null default '[]'::jsonb;
alter table company_memberships add column if not exists construction_task_ids jsonb not null default '[]'::jsonb;
alter table company_memberships add column if not exists all_construction_projects boolean not null default true;
alter table company_invitations add column if not exists construction_project_ids jsonb not null default '[]'::jsonb;
alter table company_invitations add column if not exists construction_package_ids jsonb not null default '[]'::jsonb;
alter table company_invitations add column if not exists construction_subcontractor_ids jsonb not null default '[]'::jsonb;
alter table company_invitations add column if not exists construction_task_ids jsonb not null default '[]'::jsonb;
alter table company_invitations add column if not exists all_construction_projects boolean not null default true;

alter table company_memberships drop constraint if exists company_memberships_construction_assignment_arrays_check;
alter table company_memberships add constraint company_memberships_construction_assignment_arrays_check check (
  jsonb_typeof(construction_project_ids)='array' and jsonb_typeof(construction_package_ids)='array'
  and jsonb_typeof(construction_subcontractor_ids)='array' and jsonb_typeof(construction_task_ids)='array'
);
alter table company_invitations drop constraint if exists company_invitations_construction_assignment_arrays_check;
alter table company_invitations add constraint company_invitations_construction_assignment_arrays_check check (
  jsonb_typeof(construction_project_ids)='array' and jsonb_typeof(construction_package_ids)='array'
  and jsonb_typeof(construction_subcontractor_ids)='array' and jsonb_typeof(construction_task_ids)='array'
);

update company_memberships set all_construction_projects=false
where operational_profile in ('project-manager','site-manager','quantity-surveyor','procurement-officer','planning-engineer',
  'construction-hse','quality-inspector','site-engineer','materials-storekeeper','subcontractor','construction-field-worker',
  'client-investor','consultant-approver');
update company_invitations set all_construction_projects=false
where operational_profile in ('project-manager','site-manager','quantity-surveyor','procurement-officer','planning-engineer',
  'construction-hse','quality-inspector','site-engineer','materials-storekeeper','subcontractor','construction-field-worker',
  'client-investor','consultant-approver');

create index if not exists company_memberships_construction_scope_idx
  on company_memberships(tenant_id,operational_profile,user_id) where status='active' and modules ? 'construction';

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
 insert into company_memberships(tenant_id,user_id,company_role,modules,facility_role,vendor_org_id,operational_profile,
   estate_ids,building_ids,unit_ids,all_estates,construction_project_ids,construction_package_ids,
   construction_subcontractor_ids,construction_task_ids,all_construction_projects)
 values(invitation.tenant_id,subject,invitation.company_role,invitation.modules,invitation.facility_role,invitation.vendor_org_id,
   invitation.operational_profile,invitation.estate_ids,invitation.building_ids,invitation.unit_ids,invitation.all_estates,
   invitation.construction_project_ids,invitation.construction_package_ids,invitation.construction_subcontractor_ids,
   invitation.construction_task_ids,invitation.all_construction_projects)
 on conflict(tenant_id,user_id) do update set company_role=excluded.company_role,modules=excluded.modules,
   facility_role=excluded.facility_role,vendor_org_id=excluded.vendor_org_id,operational_profile=excluded.operational_profile,
   estate_ids=excluded.estate_ids,building_ids=excluded.building_ids,unit_ids=excluded.unit_ids,all_estates=excluded.all_estates,
   construction_project_ids=excluded.construction_project_ids,construction_package_ids=excluded.construction_package_ids,
   construction_subcontractor_ids=excluded.construction_subcontractor_ids,construction_task_ids=excluded.construction_task_ids,
   all_construction_projects=excluded.all_construction_projects,status='active',version=company_memberships.version+1,updated_at=now();
 update company_invitations set accepted_at=now() where id=invitation.id;
 perform set_config('app.tenant_id',invitation.tenant_id::text,true);
 insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload)
 values(invitation.tenant_id,subject::text,'company.invitation.accepted','membership',subject::text,
   jsonb_build_object('role',invitation.company_role,'modules',invitation.modules,'operationalProfile',invitation.operational_profile,
     'constructionProjectIds',invitation.construction_project_ids,'constructionPackageIds',invitation.construction_package_ids,
     'constructionSubcontractorIds',invitation.construction_subcontractor_ids,'constructionTaskIds',invitation.construction_task_ids,
     'allConstructionProjects',invitation.all_construction_projects));
 return invitation.tenant_id;
end $$;
revoke all on function accept_company_invitation(text) from public;
