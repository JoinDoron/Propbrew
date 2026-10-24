-- A versioned persistence bridge for the existing synchronous domain working
-- set. The canonical database tenant is distinct from the fixed logical sample
-- tenant in private review; the namespace may never be relabelled in place.
create table if not exists workspace_records (
  tenant_id uuid primary key references tenants(id),
  domain_tenant_id text not null check (length(domain_tenant_id) between 1 and 200),
  payload jsonb not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_records_envelope check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['schemaVersion', 'collections', 'history', 'auxiliary', 'sequences']
    and payload->'schemaVersion' = '1'::jsonb
    and jsonb_typeof(payload->'collections') = 'object'
    and jsonb_typeof(payload->'history') = 'object'
    and jsonb_typeof(payload->'auxiliary') = 'object'
    and jsonb_typeof(payload->'sequences') = 'object'
  ),
  constraint workspace_records_bounded check (octet_length(payload::text) <= 33554432)
);

alter table workspace_records enable row level security;
alter table workspace_records force row level security;
drop policy if exists workspace_records_tenant_policy on workspace_records;
create policy workspace_records_tenant_policy on workspace_records
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));

create or replace function workspace_records_preserve_identity() returns trigger
language plpgsql as $$
begin
  if new.tenant_id is distinct from old.tenant_id
    or new.domain_tenant_id is distinct from old.domain_tenant_id then
    raise exception 'Workspace tenant identity is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists workspace_records_identity on workspace_records;
create trigger workspace_records_identity before update on workspace_records
  for each row execute function workspace_records_preserve_identity();

revoke all on workspace_records from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'propbrew_review_app') then
    grant select, insert, update on workspace_records to propbrew_review_app;
  end if;
  if exists (select 1 from pg_roles where rolname = 'propbrew_review_runtime') then
    grant select, insert, update on workspace_records to propbrew_review_runtime;
  end if;
end;
$$;
