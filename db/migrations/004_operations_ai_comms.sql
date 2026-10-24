-- Payment operations, communications reliability, retention, and AI controls.
create table if not exists tenant_settlement_accounts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  provider text not null, account_name text not null, account_number_last4 char(4) not null,
  provider_account_ref text, currency char(3) not null default 'NGN', is_active boolean not null default true,
  created_at timestamptz not null default now(), unique(tenant_id, provider, provider_account_ref)
);
create table if not exists settlement_lines (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  statement_ref text not null, statement_date date not null, amount_minor bigint not null,
  direction text not null check (direction in ('credit','debit')), narration text not null default '',
  status text not null default 'unmatched' check (status in ('unmatched','matched','approved','rejected')),
  payment_provider text, payment_event_id text, matched_by text, approved_by text, approved_at timestamptz,
  created_at timestamptz not null default now(), unique(tenant_id, statement_ref)
);
create table if not exists payment_adjustments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  provider text not null, reference text not null, kind text not null check (kind in ('refund','chargeback','partial_payment')),
  amount_minor bigint not null check (amount_minor > 0), reason text not null, status text not null default 'pending',
  requested_by text not null, approved_by text, approved_at timestamptz, provider_ref text, created_at timestamptz not null default now()
);
create table if not exists communication_queue (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  channel text not null, recipient text not null, body text not null, purpose text not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','dead_letter','blocked_approval')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(), last_error text,
  requires_approval boolean not null default false, approved_by text, approved_at timestamptz,
  created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists communication_queue_due_idx on communication_queue(status, next_attempt_at);
create table if not exists communication_preferences (
  tenant_id uuid not null references tenants(id), subject_id text not null, channel text not null,
  enabled boolean not null default true, quiet_start time, quiet_end time, emergency_override boolean not null default true,
  primary key (tenant_id, subject_id, channel)
);
create table if not exists communication_templates (
  tenant_id uuid not null references tenants(id), purpose text not null, channel text not null,
  subject text not null default '', body text not null, version integer not null default 1, active boolean not null default true,
  primary key (tenant_id, purpose, channel)
);
create table if not exists communication_delivery_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id), delivery_id uuid,
  provider text not null, provider_event_id text not null, status text not null, occurred_at timestamptz not null default now(), payload jsonb not null default '{}'::jsonb,
  unique(provider, provider_event_id)
);
create table if not exists audit_retention_jobs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id), requested_by text not null,
  mode text not null check (mode in ('delete','anonymise')), before_at timestamptz not null, status text not null default 'queued',
  affected_rows bigint, completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists ai_embeddings (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id), source_type text not null,
  source_id text not null, embedding jsonb not null, content_redacted text not null, created_at timestamptz not null default now(),
  unique(tenant_id, source_type, source_id)
);
create table if not exists ai_evaluations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id), feature text not null,
  dataset_version text not null, score numeric, results jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists ai_overrides (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id), interaction_id uuid,
  actor_id text not null, decision text not null, reason text not null, created_at timestamptz not null default now()
);
create table if not exists ai_provider_health (
  provider text primary key, status text not null, latency_ms integer, last_checked_at timestamptz not null default now(), error text
);

alter table tenant_settlement_accounts enable row level security;
alter table settlement_lines enable row level security;
alter table payment_adjustments enable row level security;
alter table communication_queue enable row level security;
alter table communication_preferences enable row level security;
alter table communication_templates enable row level security;
alter table communication_delivery_events enable row level security;
alter table audit_retention_jobs enable row level security;
alter table ai_embeddings enable row level security;
alter table ai_evaluations enable row level security;
alter table ai_overrides enable row level security;
create policy tenant_settlement_accounts_tenant_policy on tenant_settlement_accounts using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy settlement_lines_tenant_policy on settlement_lines using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy payment_adjustments_tenant_policy on payment_adjustments using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy communication_queue_tenant_policy on communication_queue using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy communication_preferences_tenant_policy on communication_preferences using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy communication_templates_tenant_policy on communication_templates using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy communication_delivery_events_tenant_policy on communication_delivery_events using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy audit_retention_jobs_tenant_policy on audit_retention_jobs using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy ai_embeddings_tenant_policy on ai_embeddings using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy ai_evaluations_tenant_policy on ai_evaluations using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
create policy ai_overrides_tenant_policy on ai_overrides using (tenant_id::text = current_setting('app.tenant_id', true)) with check (tenant_id::text = current_setting('app.tenant_id', true));
