-- Immutable PDF bytes are separate from the workspace JSON and share its
-- PostgreSQL transaction, backup and company/project security boundary.
create table if not exists construction_drawing_files (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  project_id text not null check(length(project_id) between 1 and 200),
  doc_id text not null check(length(doc_id) between 1 and 200),
  package_scope_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(package_scope_ids)='array'),
  request_key text not null check(length(request_key) between 16 and 100),
  request_hash text not null check(length(request_hash)=64),
  name text not null check(length(name) between 1 and 110),
  content_type text not null check(content_type='application/pdf'),
  size_bytes integer not null check(size_bytes between 32 and 15728640),
  sha256 text not null check(length(sha256)=64),
  bytes bytea not null,
  created_by uuid not null references auth_users(id),
  created_at timestamptz not null default now(),
  unique(tenant_id,doc_id),
  unique(tenant_id,created_by,request_key),
  check(octet_length(bytes)=size_bytes),
  check(encode(digest(bytes,'sha256'),'hex')=sha256)
);
create index if not exists construction_drawing_project_idx on construction_drawing_files(tenant_id,project_id,created_at);

create or replace function construction_drawing_access(company uuid,project text,packages jsonb,p_write boolean default false)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $drawing$
  select company::text=current_setting('app.tenant_id',true)
    and public.demo_sandbox_access(company,p_write)
    and exists (
      select 1 from public.company_memberships m
      join public.tenants t on t.id=m.tenant_id
      join public.auth_sessions s on s."userId"=m.user_id
      where m.tenant_id=company and m.user_id::text=current_setting('app.auth_user_id',true)
        and s.id::text=current_setting('app.auth_session_id',true) and s."expiresAt">now()
        and m.status='active' and t.status='active'
        and m.modules->>'construction' in ('view','manage')
        and (not p_write or m.modules->>'construction'='manage')
        and coalesce(m.operational_profile,'') <> 'construction-field-worker'
        and (coalesce(m.operational_profile,'') not in ('site-engineer','subcontractor') or exists (
          select 1 from jsonb_array_elements_text(packages) package_id where m.construction_package_ids ? package_id
        ))
        and (
          (coalesce(m.operational_profile,'') in ('project-manager','site-manager','quantity-surveyor','procurement-officer','planning-engineer','construction-hse','quality-inspector','site-engineer','materials-storekeeper','subcontractor','construction-field-worker','client-investor','consultant-approver') and m.construction_project_ids ? project)
          or (coalesce(m.operational_profile,'') not in ('project-manager','site-manager','quantity-surveyor','procurement-officer','planning-engineer','construction-hse','quality-inspector','site-engineer','materials-storekeeper','subcontractor','construction-field-worker','client-investor','consultant-approver') and (m.all_construction_projects or m.construction_project_ids ? project))
        )
    );
$drawing$;
alter table construction_drawing_files enable row level security;
alter table construction_drawing_files force row level security;
create policy construction_drawing_read on construction_drawing_files for select using(public.construction_drawing_access(tenant_id,project_id,package_scope_ids,false));
create policy construction_drawing_insert on construction_drawing_files for insert with check(public.construction_drawing_access(tenant_id,project_id,package_scope_ids,true) and created_by::text=current_setting('app.auth_user_id',true));

create or replace function construction_drawing_quota() returns trigger
language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $drawing$
declare v_bytes bigint;v_files bigint;
begin
  if not public.construction_drawing_access(new.tenant_id,new.project_id,new.package_scope_ids,true) then raise exception 'Drawing access denied';end if;
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text,812649));
  select coalesce(sum(size_bytes),0),count(*) into v_bytes,v_files from public.construction_drawing_files where tenant_id=new.tenant_id;
  if v_bytes+new.size_bytes>314572800 or v_files>=500 then raise exception 'Company drawing storage limit reached';end if;
  return new;
end;
$drawing$;
create trigger construction_drawing_quota before insert on construction_drawing_files for each row execute function construction_drawing_quota();
revoke all on construction_drawing_files from public;
revoke all on function construction_drawing_access(uuid,text,jsonb,boolean),construction_drawing_quota() from public;
do $grants$
declare v_role text;
begin
  foreach v_role in array array['propbrew_review_app','propbrew_review_runtime'] loop
    if exists(select from pg_roles where rolname=v_role) then
      execute format('grant select,insert on construction_drawing_files to %I',v_role);
      execute format('grant execute on function construction_drawing_access(uuid,text,jsonb,boolean) to %I',v_role);
    end if;
  end loop;
end;
$grants$;
