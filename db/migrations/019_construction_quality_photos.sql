-- Private inspection and punch-list images share the workspace transaction,
-- tenant/project/package RLS boundary and the database backup lifecycle.
create table if not exists construction_quality_photos (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  project_id text not null check(length(project_id) between 1 and 200),
  issue_id text not null check(length(issue_id) between 1 and 200),
  package_scope_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(package_scope_ids)='array'),
  name text not null check(length(name) between 1 and 110),
  content_type text not null check(content_type in ('image/png','image/jpeg','image/webp')),
  size_bytes integer not null check(size_bytes between 32 and 2097152),
  sha256 text not null check(length(sha256)=64),
  bytes bytea not null,
  created_by uuid not null references auth_users(id),
  created_at timestamptz not null default now(),
  check(octet_length(bytes)=size_bytes),
  check(encode(digest(bytes,'sha256'),'hex')=sha256)
);
create index if not exists construction_quality_photo_issue_idx on construction_quality_photos(tenant_id,project_id,issue_id,created_at);
alter table construction_quality_photos enable row level security;
alter table construction_quality_photos force row level security;
create policy construction_quality_photo_read on construction_quality_photos for select using(public.construction_drawing_access(tenant_id,project_id,package_scope_ids,false));
create policy construction_quality_photo_insert on construction_quality_photos for insert with check(public.construction_drawing_access(tenant_id,project_id,package_scope_ids,true) and created_by::text=current_setting('app.auth_user_id',true));

create or replace function construction_quality_photo_quota() returns trigger
language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $quality$
declare v_bytes bigint;v_files bigint;
begin
  if not public.construction_drawing_access(new.tenant_id,new.project_id,new.package_scope_ids,true) then raise exception 'Quality photo access denied';end if;
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text,812650));
  select coalesce(sum(size_bytes),0),count(*) into v_bytes,v_files from public.construction_quality_photos where tenant_id=new.tenant_id;
  if v_bytes+new.size_bytes>104857600 or v_files>=500 then raise exception 'Company quality photo storage limit reached';end if;
  return new;
end;
$quality$;
create trigger construction_quality_photo_quota before insert on construction_quality_photos for each row execute function construction_quality_photo_quota();
revoke all on construction_quality_photos from public;
revoke all on function construction_quality_photo_quota() from public;
do $grants$
declare v_role text;
begin
  foreach v_role in array array['propbrew_review_app','propbrew_review_runtime'] loop
    if exists(select from pg_roles where rolname=v_role) then
      execute format('grant select,insert on construction_quality_photos to %I',v_role);
    end if;
  end loop;
end;
$grants$;
