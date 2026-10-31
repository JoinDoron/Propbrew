-- Immutable coordination models. Metadata and detected issues are committed in
-- the same company workspace transaction as these private bytes.
create table if not exists construction_model_files (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  project_id text not null check(length(project_id) between 1 and 200),
  package_scope_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(package_scope_ids)='array'),
  request_key text not null check(length(request_key) between 16 and 100),
  request_hash text not null check(length(request_hash)=64),
  name text not null check(length(name) between 1 and 120),
  format text not null check(format in ('obj','glb')),
  discipline text not null check(length(discipline) between 2 and 80),
  size_bytes integer not null check(size_bytes between 32 and 12582912),
  sha256 text not null check(length(sha256)=64),
  bytes bytea not null,
  created_by uuid not null references auth_users(id),
  created_at timestamptz not null default now(),
  unique(tenant_id,created_by,request_key),
  check(octet_length(bytes)=size_bytes),
  check(encode(digest(bytes,'sha256'),'hex')=sha256)
);
create index if not exists construction_model_project_idx on construction_model_files(tenant_id,project_id,created_at);
alter table construction_model_files enable row level security;
alter table construction_model_files force row level security;
create policy construction_model_read on construction_model_files for select using(public.construction_drawing_access(tenant_id,project_id,package_scope_ids,false));
create policy construction_model_insert on construction_model_files for insert with check(public.construction_drawing_access(tenant_id,project_id,package_scope_ids,true) and created_by::text=current_setting('app.auth_user_id',true));

create or replace function construction_model_quota() returns trigger
language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $model$
declare v_bytes bigint; v_files bigint;
begin
  if not public.construction_drawing_access(new.tenant_id,new.project_id,new.package_scope_ids,true) then raise exception 'Model access denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text,812651));
  select coalesce(sum(size_bytes),0),count(*) into v_bytes,v_files from public.construction_model_files where tenant_id=new.tenant_id;
  if v_bytes+new.size_bytes>251658240 or v_files>=40 then raise exception 'Company model storage limit reached'; end if;
  return new;
end;
$model$;
create trigger construction_model_quota before insert on construction_model_files for each row execute function construction_model_quota();
revoke all on construction_model_files from public;
revoke all on function construction_model_quota() from public;
do $grants$
declare v_role text;
begin
  foreach v_role in array array['propbrew_review_app','propbrew_review_runtime'] loop
    if exists(select from pg_roles where rolname=v_role) then
      execute format('grant select,insert on construction_model_files to %I',v_role);
    end if;
  end loop;
end;
$grants$;
