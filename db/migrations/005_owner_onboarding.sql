-- Pre-tenant onboarding is scoped only to an authenticated identity, never a
-- fabricated tenant. Application connections must not be superuser/BYPASSRLS.
create table if not exists owner_onboardings (
  auth_subject text primary key check (length(auth_subject) between 1 and 200),
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  version integer not null check (version > 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists owner_property_setups (
  auth_subject text primary key references owner_onboardings(auth_subject),
  property jsonb not null check (jsonb_typeof(property) = 'object'),
  plan_key text not null check (length(plan_key) between 1 and 80),
  status text not null default 'pending_activation' check (status = 'pending_activation'),
  created_at timestamptz not null default now()
);

create table if not exists owner_onboarding_events (
  id uuid primary key,
  auth_subject text not null references owner_onboardings(auth_subject),
  event text not null check (event = 'owner_onboarding.completed'),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (auth_subject, event)
);

create index if not exists owner_onboarding_events_subject_created_idx
  on owner_onboarding_events(auth_subject, created_at desc);

alter table owner_onboardings enable row level security;
alter table owner_onboardings force row level security;
alter table owner_property_setups enable row level security;
alter table owner_property_setups force row level security;
alter table owner_onboarding_events enable row level security;
alter table owner_onboarding_events force row level security;

drop policy if exists owner_onboardings_subject_policy on owner_onboardings;
drop policy if exists owner_onboardings_subject_read on owner_onboardings;
create policy owner_onboardings_subject_read on owner_onboardings for select
  using (auth_subject = (select current_setting('app.auth_subject', true)));
drop policy if exists owner_onboardings_subject_insert on owner_onboardings;
create policy owner_onboardings_subject_insert on owner_onboardings for insert
  with check (auth_subject = (select current_setting('app.auth_subject', true)));
drop policy if exists owner_onboardings_subject_update on owner_onboardings;
create policy owner_onboardings_subject_update on owner_onboardings for update
  using (auth_subject = (select current_setting('app.auth_subject', true)))
  with check (auth_subject = (select current_setting('app.auth_subject', true)));
drop policy if exists owner_property_setups_subject_policy on owner_property_setups;
drop policy if exists owner_property_setups_subject_read on owner_property_setups;
create policy owner_property_setups_subject_read on owner_property_setups for select
  using (auth_subject = (select current_setting('app.auth_subject', true)));
drop policy if exists owner_property_setups_subject_insert on owner_property_setups;
create policy owner_property_setups_subject_insert on owner_property_setups for insert
  with check (auth_subject = (select current_setting('app.auth_subject', true)));
drop policy if exists owner_onboarding_events_subject_policy on owner_onboarding_events;
drop policy if exists owner_onboarding_events_subject_read on owner_onboarding_events;
create policy owner_onboarding_events_subject_read on owner_onboarding_events for select
  using (auth_subject = (select current_setting('app.auth_subject', true)));
drop policy if exists owner_onboarding_events_subject_insert on owner_onboarding_events;
create policy owner_onboarding_events_subject_insert on owner_onboarding_events for insert
  with check (auth_subject = (select current_setting('app.auth_subject', true)));

revoke all on owner_onboardings, owner_property_setups, owner_onboarding_events from public;
