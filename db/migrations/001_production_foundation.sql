-- Reeve production foundation: PostgreSQL + tenant isolation.
create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code char(2) not null default 'NG',
  data_residency text not null default 'NG',
  created_at timestamptz not null default now()
);
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  auth_subject text not null unique,
  email text not null,
  mfa_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  actor_subject text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  request_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists idempotency_keys (
  tenant_id uuid not null references tenants(id),
  key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, key)
);
create index if not exists audit_events_tenant_created_idx on audit_events(tenant_id, created_at desc);

alter table app_users enable row level security;
alter table audit_events enable row level security;
alter table idempotency_keys enable row level security;
create policy app_users_tenant_policy on app_users using (tenant_id::text = current_setting('app.tenant_id', true));
create policy audit_events_tenant_policy on audit_events using (tenant_id::text = current_setting('app.tenant_id', true));
create policy idempotency_tenant_policy on idempotency_keys using (tenant_id::text = current_setting('app.tenant_id', true));
