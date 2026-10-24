create table if not exists payment_events (
  provider text not null,
  event_id text not null,
  tenant_id uuid not null references tenants(id),
  reference text not null,
  amount_minor bigint not null,
  currency char(3) not null default 'NGN',
  status text not null,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  primary key(provider, event_id)
);
create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  subject_id text not null, purpose text not null, policy_version text not null,
  granted_at timestamptz, withdrawn_at timestamptz, retention_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists consent_subject_idx on consent_records(tenant_id, subject_id, purpose);
create table if not exists communication_deliveries (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  channel text not null, recipient_hash text not null, purpose text not null,
  provider_id text, status text not null, attempts integer not null default 1,
  last_error text, created_at timestamptz not null default now(), delivered_at timestamptz
);
create index if not exists communication_delivery_tenant_idx on communication_deliveries(tenant_id, created_at desc);
create table if not exists ai_interactions (
  id uuid primary key, tenant_id uuid not null references tenants(id), actor_id text not null,
  feature text not null, model text not null, source text not null,
  prompt_redacted text not null, grounding_redacted text not null, output_redacted text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_interactions_tenant_feature_idx on ai_interactions(tenant_id, feature, created_at desc);
create table if not exists ai_feature_controls (
  tenant_id uuid not null references tenants(id), feature text not null,
  enabled boolean not null default true, daily_cap_minor_ngn bigint,
  primary key (tenant_id, feature)
);
