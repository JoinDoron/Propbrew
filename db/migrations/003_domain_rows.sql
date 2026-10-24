-- Transitional durable repository for the domain modules.
-- Rows remain JSONB until each bounded context gets its final typed table;
-- tenant_id is still a real FK and RLS boundary from day one.
create table if not exists domain_rows (
  tenant_id uuid not null references tenants(id),
  entity text not null,
  row_id text not null,
  payload jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, entity, row_id)
);
create index if not exists domain_rows_tenant_entity_idx on domain_rows(tenant_id, entity, updated_at desc);
alter table domain_rows enable row level security;
drop policy if exists domain_rows_tenant_policy on domain_rows;
create policy domain_rows_tenant_policy on domain_rows
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));
