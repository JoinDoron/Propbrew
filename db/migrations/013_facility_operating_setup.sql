-- Small pilot evidence files are immutable, private and separate from the
-- operational JSON working set. They join normal database backups and restore.
-- No public bucket, provider credential, signed URL or file path is trusted.
create table if not exists facility_evidence_files (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  site_id text not null check(length(site_id) between 1 and 200),
  resource_type text not null check(resource_type in ('asset','obligation')),
  resource_id text not null check(length(resource_id) between 1 and 200),
  content_type text not null check(content_type in ('image/png','image/jpeg','image/webp','application/pdf')),
  size_bytes integer not null check(size_bytes between 1 and 2097152),
  sha256 text not null check(length(sha256)=64),
  bytes bytea not null,
  created_by uuid not null references auth_users(id),
  created_at timestamptz not null default now(),
  check(octet_length(bytes)=size_bytes),
  check(encode(digest(bytes,'sha256'),'hex')=sha256)
);
create index if not exists facility_evidence_tenant_site_idx on facility_evidence_files(tenant_id,site_id,created_at);

create or replace function facility_evidence_access(company uuid,site text,p_write boolean default false)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $evidence$
  select company::text=current_setting('app.tenant_id',true)
    and public.demo_sandbox_access(company,p_write)
    and exists (
      select 1 from public.company_memberships m
      join public.tenants t on t.id=m.tenant_id
      join public.auth_sessions s on s."userId"=m.user_id
      where m.tenant_id=company and m.user_id::text=current_setting('app.auth_user_id',true)
        and s.id::text=current_setting('app.auth_session_id',true) and s."expiresAt">now()
        and m.status='active' and t.status='active'
        and m.modules->>'facility' in ('view','manage')
        and (not p_write or m.modules->>'facility'='manage')
        and (m.all_estates or m.estate_ids ? site)
    );
$evidence$;

alter table facility_evidence_files enable row level security;
alter table facility_evidence_files force row level security;
create policy facility_evidence_read on facility_evidence_files for select
  using(public.facility_evidence_access(tenant_id,site_id,false));
create policy facility_evidence_insert on facility_evidence_files for insert
  with check(public.facility_evidence_access(tenant_id,site_id,true) and created_by::text=current_setting('app.auth_user_id',true));

-- Enforce the company-wide limit even for a manager assigned to just one site.
-- The same lock is held by workspace mutations. Trigger output reveals no totals.
create or replace function facility_evidence_quota() returns trigger
language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $evidence$
declare v_bytes bigint;v_files bigint;
begin
  if not public.facility_evidence_access(new.tenant_id,new.site_id,true) then raise exception 'Evidence access denied';end if;
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text,812649));
  select coalesce(sum(size_bytes),0),count(*) into v_bytes,v_files from public.facility_evidence_files where tenant_id=new.tenant_id;
  if v_bytes+new.size_bytes>104857600 or v_files>=500 then raise exception 'Company evidence storage limit reached';end if;
  return new;
end;
$evidence$;
create trigger facility_evidence_quota before insert on facility_evidence_files for each row execute function facility_evidence_quota();
revoke all on facility_evidence_files from public;
revoke all on function facility_evidence_access(uuid,text,boolean),facility_evidence_quota() from public;

-- Discover only active real companies that explicitly enabled an automatic PPM
-- plan. User requests cannot enumerate the directory. Existing RLS is untouched.
create or replace function facility_maintenance_company_allowed(company uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $jobs$
  select public.estate_recurring_company_allowed(company);
$jobs$;
create or replace function facility_maintenance_company_ids(after_id uuid default null,batch_size integer default 100)
returns table(tenant_id uuid) language sql stable security definer set search_path=pg_catalog,public as $jobs$
  select w.tenant_id from public.workspace_records w
  where public.facility_maintenance_company_allowed(w.tenant_id)
    and (after_id is null or w.tenant_id>after_id)
    and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(w.payload#>'{auxiliary,facilityMaintenance,plans}')='array'
        then w.payload#>'{auxiliary,facilityMaintenance,plans}' else '[]'::jsonb end) p
      where p->>'enabled'='true' and p->>'autoGenerate'='true' and p->>'tenantId'=w.tenant_id::text
    )
  order by w.tenant_id limit greatest(1,least(coalesce(batch_size,100),100));
$jobs$;
revoke all on function facility_maintenance_company_allowed(uuid),facility_maintenance_company_ids(uuid,integer) from public;
do $grants$
declare v_role text;
begin
  foreach v_role in array array['propbrew_review_app','propbrew_review_runtime'] loop
    if exists(select from pg_roles where rolname=v_role) then
      execute format('grant select,insert on facility_evidence_files to %I',v_role);
      execute format('grant execute on function facility_evidence_access(uuid,text,boolean),facility_maintenance_company_allowed(uuid),facility_maintenance_company_ids(uuid,integer) to %I',v_role);
    end if;
  end loop;
end;
$grants$;
