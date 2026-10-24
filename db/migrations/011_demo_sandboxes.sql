-- Editable demonstrations are scoped to a verified server session. Shared
-- login identities never grant access to another visitor's sample company.
create table if not exists demo_sandboxes (
  tenant_id uuid primary key references tenants(id),
  auth_user_id uuid not null references auth_users(id),
  auth_session_id uuid unique references auth_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reset_count integer not null default 0 check(reset_count >= 0),
  last_reset_at timestamptz,
  check(expires_at > created_at)
);
create index if not exists demo_sandboxes_user_session_idx on demo_sandboxes(auth_user_id,auth_session_id);
create index if not exists demo_sandboxes_expiry_idx on demo_sandboxes(expires_at);

create or replace function propbrew_is_demo_user(subject text) returns boolean
language sql immutable set search_path=pg_catalog,public as $demo$
  select coalesce(subject in ('8fd60a0b-3fd5-4301-8f01-8c42c2e34d01','8fd60a0b-3fd5-4301-8f01-8c42c2e34d02','8fd60a0b-3fd5-4301-8f01-8c42c2e34d03','8fd60a0b-3fd5-4301-8f01-8c42c2e34d04'),false);
$demo$;

create or replace function demo_sandbox_access(p_tenant uuid,p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $demo$
declare v_user text:=current_setting('app.auth_user_id',true); v_session text:=current_setting('app.auth_session_id',true);
begin
  -- The former shared sample remains immutable, even if a caller projects a
  -- manager role. Existing visitors upgrade to a private sandbox on entry.
  if p_tenant='6b20d921-50a1-4ccb-9018-d6f80204e223'::uuid then
    return not p_write and public.propbrew_is_demo_user(v_user) and exists(
      select 1 from public.auth_sessions s where s.id::text=v_session and s."userId"::text=v_user and s."expiresAt">now()
    );
  end if;
  if public.propbrew_is_demo_user(v_user) or exists(select 1 from public.demo_sandboxes d where d.tenant_id=p_tenant) then
    return exists(select 1 from public.demo_sandboxes d join public.auth_sessions s on s.id=d.auth_session_id
      where d.tenant_id=p_tenant and d.auth_user_id::text=v_user and d.auth_session_id::text=v_session
        and s."userId"=d.auth_user_id and s."expiresAt">now() and d.expires_at>now()
        and exists(select 1 from public.tenants t where t.id=d.tenant_id and t.status='active'));
  end if;
  return true;
end;
$demo$;

alter table demo_sandboxes enable row level security;
alter table demo_sandboxes force row level security;
create policy demo_sandboxes_own_session on demo_sandboxes for select using(
  auth_user_id::text=current_setting('app.auth_user_id',true)
  and auth_session_id::text=current_setting('app.auth_session_id',true)
  and demo_sandbox_access(tenant_id,false)
);

create or replace function current_demo_sandbox() returns table(tenant_id uuid,expires_at timestamptz)
language sql stable security definer set search_path=pg_catalog,public as $demo$
  select d.tenant_id,d.expires_at from public.demo_sandboxes d
  where d.auth_user_id::text=current_setting('app.auth_user_id',true)
    and d.auth_session_id::text=current_setting('app.auth_session_id',true)
    and public.propbrew_is_demo_user(d.auth_user_id::text)
    and public.demo_sandbox_access(d.tenant_id,false);
$demo$;

create or replace function demo_payload_valid(p_state jsonb,p_tenant uuid) returns boolean
language sql immutable set search_path=pg_catalog,public as $demo$
  select coalesce(jsonb_typeof(p_state)='object'
    and p_state->'schemaVersion'='1'::jsonb
    and jsonb_typeof(p_state->'collections')='object'
    and p_state->'history'='{}'::jsonb and p_state->'sequences'='{}'::jsonb
    and p_state->'auxiliary'->'demoFixture'->>'source'='repository-fixtures'
    and p_state->'auxiliary'->'demoFixture'->>'tenantId'=p_tenant::text
    and octet_length(p_state::text)<=8388608
    and not jsonb_path_exists(p_state,'$.**.tenantId ? (@ != $tenant)',jsonb_build_object('tenant',p_tenant::text)),false);
$demo$;

create or replace function ensure_demo_sandbox(p_id uuid,p_state jsonb) returns table(id uuid,expires_at timestamptz)
language plpgsql volatile security definer set search_path=pg_catalog,public as $demo$
declare v_user uuid:=nullif(current_setting('app.auth_user_id',true),'')::uuid;
  v_session uuid:=nullif(current_setting('app.auth_session_id',true),'')::uuid;
  v_expiry timestamptz; v_existing public.demo_sandboxes%rowtype; v_feature text;
begin
  if not public.propbrew_is_demo_user(v_user::text) or v_session is null then raise exception 'A verified demo session is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_session::text,906382));
  select least(s."expiresAt",now()+interval '24 hours') into v_expiry from public.auth_sessions s
    where s.id=v_session and s."userId"=v_user and s."expiresAt">now() for update;
  if not found then raise exception 'The demo session is unavailable'; end if;
  select * into v_existing from public.demo_sandboxes d where d.auth_session_id=v_session;
  if found then
    if v_existing.auth_user_id<>v_user or v_existing.expires_at<=now() then raise exception 'The demo sandbox expired'; end if;
    return query select v_existing.tenant_id,v_existing.expires_at; return;
  end if;
  if p_id is null or p_id='6b20d921-50a1-4ccb-9018-d6f80204e223'::uuid
    or exists(select 1 from public.tenants t where t.id=p_id)
    or not public.demo_payload_valid(p_state,p_id) then raise exception 'A fresh source-only demo workspace is required'; end if;
  insert into public.tenants(id,name,country_code,data_residency,created_by_auth_user)
    values(p_id,'Your private demo sandbox · Sample data','NG','Railway us-west2',v_user);
  insert into public.demo_sandboxes(tenant_id,auth_user_id,auth_session_id,expires_at) values(p_id,v_user,v_session,v_expiry);
  insert into public.company_memberships(tenant_id,user_id,company_role,modules,all_estates)
    values(p_id,v_user,'member','{"estate":"manage","facility":"manage","shortlet":"manage","construction":"manage"}'::jsonb,true);
  insert into public.workspace_records(tenant_id,domain_tenant_id,payload) values(p_id,p_id::text,p_state);
  foreach v_feature in array array['estate_copilot','facility_copilot','shortlet_copilot','construction_copilot'] loop
    insert into public.ai_feature_controls(tenant_id,feature,enabled,daily_cap_minor_ngn) values(p_id,v_feature,true,50000);
  end loop;
  update public.auth_sessions s set "activeCompanyId"=p_id::text,"updatedAt"=now() where s.id=v_session and s."userId"=v_user;
  insert into public.audit_events(tenant_id,actor_subject,action,entity,entity_id,payload)
    values(p_id,v_user::text,'demo.sandbox.created','demo_sandbox',p_id::text,'{"source":"repository-fixtures","modules":4}'::jsonb);
  return query select p_id,v_expiry;
end;
$demo$;

create or replace function reset_demo_sandbox(p_state jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $demo$
declare v_sandbox record; v_user text:=current_setting('app.auth_user_id',true); v_reset_at timestamptz; v_reset_iso text;
begin
  select * into v_sandbox from public.current_demo_sandbox();
  if not found then raise exception 'The demo sandbox is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_sandbox.tenant_id::text,812649));
  if not public.demo_sandbox_access(v_sandbox.tenant_id,true) or not public.demo_payload_valid(p_state,v_sandbox.tenant_id) then raise exception 'The sandbox reset is unavailable'; end if;
  -- A reset invalidates previously captured offline operations. Its boundary
  -- comes from the database clock after locking, never from supplied state.
  v_reset_at:=clock_timestamp();
  v_reset_iso:=to_char(v_reset_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  update public.workspace_records set payload=jsonb_set(p_state,'{auxiliary,demoResetAt}',to_jsonb(v_reset_iso),true),version=version+1,updated_at=v_reset_at
    where tenant_id=v_sandbox.tenant_id and domain_tenant_id=v_sandbox.tenant_id::text;
  if not found then raise exception 'The demo workspace is unavailable'; end if;
  update public.demo_sandboxes set reset_count=reset_count+1,last_reset_at=v_reset_at where tenant_id=v_sandbox.tenant_id;
  insert into public.audit_events(tenant_id,actor_subject,action,entity,entity_id,payload,created_at)
    values(v_sandbox.tenant_id,v_user,'demo.sandbox.reset','demo_sandbox',v_sandbox.tenant_id::text,jsonb_build_object('source','repository-fixtures','resetAt',v_reset_iso),v_reset_at);
end;
$demo$;

-- Restrictive policies compose with existing tenant/user policies. A forged
-- company selection cannot cross a demo session boundary, even for shared users.
do $policies$
declare v_table text; v_column text;
begin
  for v_table,v_column in
    select c.relname,a.attname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and not a.attisdropped
      where n.nspname='public' and c.relkind='r' and c.relrowsecurity
        and ((a.attname='tenant_id' and c.relname not in ('demo_sandboxes','ai_company_budget_reservations')) or (c.relname='tenants' and a.attname='id'))
  loop
    execute format('create policy demo_session_read on public.%I as restrictive for select using (public.demo_sandbox_access(%I,false))',v_table,v_column);
    execute format('create policy demo_session_insert on public.%I as restrictive for insert with check (public.demo_sandbox_access(%I,true))',v_table,v_column);
    execute format('create policy demo_session_update on public.%I as restrictive for update using (public.demo_sandbox_access(%I,true)) with check (public.demo_sandbox_access(%I,true))',v_table,v_column,v_column);
    execute format('create policy demo_session_delete on public.%I as restrictive for delete using (public.demo_sandbox_access(%I,true))',v_table,v_column);
  end loop;
end;
$policies$;

revoke all on demo_sandboxes from public;
revoke all on function propbrew_is_demo_user(text),demo_sandbox_access(uuid,boolean),current_demo_sandbox(),demo_payload_valid(jsonb,uuid),ensure_demo_sandbox(uuid,jsonb),reset_demo_sandbox(jsonb) from public;
do $grants$
declare v_role text;
begin
  foreach v_role in array array['propbrew_review_app','propbrew_review_runtime'] loop
    if exists(select 1 from pg_roles where rolname=v_role) then
      execute format('grant select on demo_sandboxes to %I',v_role);
      execute format('grant execute on function propbrew_is_demo_user(text),demo_sandbox_access(uuid,boolean),current_demo_sandbox(),ensure_demo_sandbox(uuid,jsonb),reset_demo_sandbox(jsonb) to %I',v_role);
    end if;
  end loop;
end;
$grants$;

-- Preserve the native ceiling while adding a shared public-demo allowance.
create or replace function reserve_company_copilot_budget(
  p_tenant uuid, p_request uuid, p_actor text, p_feature text, p_model text,
  p_reserved bigint, p_tenant_cap bigint, p_feature_cap bigint
) returns table(allowed boolean, reason text)
language plpgsql volatile security definer set search_path = pg_catalog, public as $company_budget$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_cap bigint;
  v_used numeric;
  v_allowed boolean;
  v_reason text;
  v_demo_used numeric;
begin
  if p_tenant is null or p_tenant::text is distinct from current_setting('app.tenant_id', true) then
    raise exception 'Tenant context mismatch';
  end if;
  if not public.demo_sandbox_access(p_tenant,true) then raise exception 'Demo session context mismatch'; end if;
  if p_request is null or p_reserved is null or p_reserved < 0 or p_tenant_cap < 0 or p_feature_cap < 0
    or p_actor is null or length(btrim(p_actor)) = 0 or length(p_actor) > 200
    or p_feature is null or length(btrim(p_feature)) = 0 or length(p_feature) > 80
    or p_model is null or length(btrim(p_model)) = 0 or length(p_model) > 200 then
    raise exception 'Invalid budget reservation';
  end if;
  -- Keep membership and company suspension from racing an accepted reservation.
  perform 1 from public.company_memberships m join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant and m.user_id::text = p_actor and m.status = 'active' and t.status = 'active'
    for share of m, t;
  if not found then raise exception 'An active company membership is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('propbrew:company-ai:' || v_day::text, 714232));
  -- Public sandbox churn has its own shared ceiling and cannot consume the
  -- full native-company platform allowance. The same lock serializes both caps.
  if exists(select 1 from public.demo_sandboxes where tenant_id=p_tenant) then
    select coalesce(sum(r.reserved_cost_minor_ngn),0) into v_demo_used
      from public.ai_company_budget_reservations r
      -- Historical template spend remains charged to the native platform
      -- ceiling; that immutable template cannot open new reservations.
      where r.budget_day=v_day and exists(select 1 from public.demo_sandboxes d where d.tenant_id=r.tenant_id);
    if v_demo_used+p_reserved>100000 then
      return query select false,'demo_daily_budget_exceeded'::text; return;
    end if;
  end if;
  if exists(select 1 from public.ai_company_budget_reservations where tenant_id = p_tenant and request_id = p_request) then
    return query select false, 'request_already_reserved'::text;
    return;
  end if;
  select daily_cap_minor_ngn into v_cap from public.ai_company_budget_policy where singleton for share;
  if not found then
    return query select false, 'global_budget_unavailable'::text;
    return;
  end if;
  select coalesce(sum(reserved_cost_minor_ngn), 0) into v_used
    from public.ai_company_budget_reservations where budget_day = v_day;
  -- Zero explicitly suspends new company requests, including zero-cost inputs.
  if v_cap = 0 or v_used + p_reserved > v_cap then
    return query select false, 'global_daily_budget_exceeded'::text;
    return;
  end if;

  select r.allowed, r.reason into v_allowed, v_reason from public.reserve_copilot_budget(
    p_tenant, p_request, p_actor, p_feature, p_model, p_reserved, p_tenant_cap, p_feature_cap
  ) r;
  if v_allowed is distinct from true then
    return query select false, coalesce(v_reason, 'ledger_unavailable')::text;
    return;
  end if;
  insert into public.ai_company_budget_reservations(tenant_id, request_id, budget_day, reserved_cost_minor_ngn)
    values(p_tenant, p_request, v_day, p_reserved);
  -- Final usage, failed calls and expired reservations never refund this
  -- platform allowance. A new UTC day starts a separate reservation window.
  return query select true, null::text;
end;
$company_budget$;
