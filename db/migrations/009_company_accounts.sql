-- Native personal accounts (Better Auth 1.7.12), company membership and audit.
-- Auth tables are server-only identity authority; operational tables retain tenant RLS.

create table if not exists auth_users (
  id uuid primary key default gen_random_uuid(),
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null default false,
  "image" text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null,
  "twoFactorEnabled" boolean default false
);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references auth_users(id) on delete cascade,
  "activeCompanyId" text
);
create index if not exists auth_sessions_userid_idx on auth_sessions("userId");

create table if not exists auth_accounts (
  id uuid primary key default gen_random_uuid(),
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references auth_users(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create index if not exists auth_accounts_userid_idx on auth_accounts("userId");

create table if not exists auth_verifications (
  id uuid primary key default gen_random_uuid(),
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);
create index if not exists auth_verifications_identifier_idx on auth_verifications("identifier");

create table if not exists auth_two_factor (
  id uuid primary key default gen_random_uuid(),
  "secret" text not null,
  "backupCodes" text not null,
  "userId" uuid not null references auth_users(id) on delete cascade,
  "verified" boolean default true,
  "failedVerificationCount" integer default 0,
  "lockedUntil" timestamptz
);
create index if not exists auth_two_factor_secret_idx on auth_two_factor("secret");
create index if not exists auth_two_factor_userid_idx on auth_two_factor("userId");

create table if not exists auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

create unique index if not exists auth_users_email_folded_idx on auth_users(lower(email));
create unique index if not exists auth_accounts_provider_identity_idx on auth_accounts("providerId", "accountId");

alter table tenants add column if not exists status text not null default 'active' check (status in ('active','suspended'));
alter table tenants add column if not exists created_by_auth_user uuid references auth_users(id);

create or replace function company_modules_valid(grants jsonb) returns boolean language sql immutable strict as $$
 select jsonb_typeof(grants) = 'object' and not exists (
   select 1 from jsonb_each(grants) g where g.key not in ('estate','facility','shortlet','construction') or g.value not in ('"view"'::jsonb,'"manage"'::jsonb)
 );
$$;
create table if not exists company_memberships (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id), user_id uuid not null references auth_users(id),
 company_role text not null check(company_role in ('owner','admin','member')), status text not null default 'active' check(status in ('active','suspended','revoked')),
 modules jsonb not null check(company_modules_valid(modules)), estate_ids jsonb not null default '[]' check(jsonb_typeof(estate_ids)='array'), all_estates boolean not null default true,
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(tenant_id,user_id)
);
create index if not exists company_memberships_user_active_idx on company_memberships(user_id,tenant_id) where status='active';

-- Fixed search path and no caller-controlled SQL. Returns only the caller's role.
create or replace function company_member_role(company uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select company_role from company_memberships where tenant_id=company and user_id::text=current_setting('app.auth_user_id',true) and status='active';
$$;
create or replace function company_initial_owner(company uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from tenants where id=company and created_by_auth_user::text=current_setting('app.auth_user_id',true))
 and not exists(select 1 from company_memberships where tenant_id=company);
$$;
revoke all on function company_member_role(uuid), company_initial_owner(uuid) from public;

alter table company_memberships enable row level security;
alter table company_memberships force row level security;
create policy company_memberships_read on company_memberships for select using (
 user_id::text=current_setting('app.auth_user_id',true) or company_member_role(tenant_id) in ('owner','admin')
);
create policy company_memberships_insert on company_memberships for insert with check (
 (company_member_role(tenant_id)='owner') or
 (company_member_role(tenant_id)='admin' and company_role<>'owner') or
 (company_role='owner' and user_id::text=current_setting('app.auth_user_id',true) and company_initial_owner(tenant_id))
);
create policy company_memberships_update on company_memberships for update using (
 company_member_role(tenant_id)='owner' or (company_member_role(tenant_id)='admin' and company_role<>'owner')
) with check (company_member_role(tenant_id)='owner' or (company_member_role(tenant_id)='admin' and company_role<>'owner'));

create table if not exists company_invitations (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id), email text not null,
 token_hash text not null unique, company_role text not null check(company_role in ('admin','member')),
 modules jsonb not null check(company_modules_valid(modules)), created_by uuid not null references auth_users(id),
 expires_at timestamptz not null, accepted_at timestamptz, cancelled_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists company_invitations_company_idx on company_invitations(tenant_id,created_at desc);
alter table company_invitations enable row level security;
alter table company_invitations force row level security;
create policy company_invitations_manage on company_invitations using(company_member_role(tenant_id) in ('owner','admin')) with check(company_member_role(tenant_id) in ('owner','admin'));

-- Recipient lookup exposes no invitation directory: a 256-bit one-time token is required.
create or replace function company_invitation_for_token(token text) returns table(id uuid,tenant_id uuid,email text,company_role text,modules jsonb,company_name text,expires_at timestamptz) language sql stable security definer set search_path=public,pg_temp as $$
 select i.id,i.tenant_id,i.email,i.company_role,i.modules,t.name,i.expires_at from company_invitations i join tenants t on t.id=i.tenant_id
 where i.token_hash=token and lower(i.email)=(select lower(u.email) from auth_users u where u.id::text=current_setting('app.auth_user_id',true))
 and i.accepted_at is null and i.cancelled_at is null and i.expires_at>now() and t.status='active';
$$;
revoke all on function company_invitation_for_token(text) from public;

create or replace function accept_company_invitation(token text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare invitation company_invitations; subject uuid; existing company_memberships;
begin
 subject := nullif(current_setting('app.auth_user_id',true),'')::uuid;
 if subject is null then raise exception 'An authenticated account is required'; end if;
 select * into invitation from company_invitations where token_hash=token for update;
 if found then perform pg_advisory_xact_lock(hashtextextended(invitation.tenant_id::text,812649)); end if;
 if not found or invitation.accepted_at is not null or invitation.cancelled_at is not null or invitation.expires_at<=now()
   or lower(invitation.email) is distinct from (select lower(email) from auth_users where id=subject)
   or not exists(select from tenants where id=invitation.tenant_id and status='active')
   or not exists(select from company_memberships where tenant_id=invitation.tenant_id and user_id=invitation.created_by and status='active' and company_role in ('owner','admin'))
 then raise exception 'Invitation is unavailable'; end if;
 select * into existing from company_memberships where tenant_id=invitation.tenant_id and user_id=subject for update;
 if found and existing.status='active' then raise exception 'Already a member'; end if;
 insert into company_memberships(tenant_id,user_id,company_role,modules) values(invitation.tenant_id,subject,invitation.company_role,invitation.modules)
 on conflict(tenant_id,user_id) do update set company_role=excluded.company_role,modules=excluded.modules,status='active',version=company_memberships.version+1,updated_at=now();
 update company_invitations set accepted_at=now() where id=invitation.id;
 perform set_config('app.tenant_id',invitation.tenant_id::text,true);
 insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload) values(invitation.tenant_id,subject::text,'company.invitation.accepted','membership',subject::text,jsonb_build_object('role',invitation.company_role,'modules',invitation.modules));
 return invitation.tenant_id;
end $$;
revoke all on function accept_company_invitation(text) from public;

alter table tenants enable row level security;
alter table tenants force row level security;
create policy tenants_context_read on tenants for select using(id::text=current_setting('app.tenant_id',true) or company_member_role(id) is not null);
create policy tenants_account_create on tenants for insert with check(id::text=current_setting('app.tenant_id',true) and created_by_auth_user::text=current_setting('app.auth_user_id',true));

create table if not exists auth_security_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth_users(id), event text not null,
 created_at timestamptz not null default now(), payload jsonb not null default '{}'
);
create index if not exists auth_security_events_user_idx on auth_security_events(user_id,created_at desc);
alter table auth_security_events enable row level security;
alter table auth_security_events force row level security;
create policy auth_security_events_self on auth_security_events using(user_id::text=current_setting('app.auth_user_id',true)) with check(user_id::text=current_setting('app.auth_user_id',true));
create table if not exists auth_action_limits (key text primary key, window_start timestamptz not null, count integer not null);

revoke all on auth_users,auth_sessions,auth_accounts,auth_verifications,auth_two_factor,auth_rate_limits,auth_security_events,auth_action_limits,company_memberships,company_invitations from public;
do $$ begin
 if exists(select from pg_roles where rolname='propbrew_review_app') then
  grant select,insert,update,delete on auth_users,auth_sessions,auth_accounts,auth_verifications,auth_two_factor,auth_rate_limits to propbrew_review_app;
  grant select,insert,update on company_memberships,company_invitations,auth_action_limits to propbrew_review_app;
  grant select,insert on tenants,auth_security_events to propbrew_review_app;
  grant insert on audit_events to propbrew_review_app;
  grant select,insert on ai_feature_controls to propbrew_review_app;
  grant execute on function company_member_role(uuid),company_initial_owner(uuid),company_invitation_for_token(text),accept_company_invitation(text) to propbrew_review_app;
 end if;
end $$;
