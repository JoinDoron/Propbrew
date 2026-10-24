-- Public company accounts share one bounded platform AI allowance. This is a
-- conservative reservation ceiling, not a provider invoice or tenant balance.
-- No provider call runs while the transaction/advisory locks are held.
create table if not exists ai_company_budget_policy (
  singleton boolean primary key default true check (singleton),
  daily_cap_minor_ngn bigint not null default 500000 check (daily_cap_minor_ngn between 0 and 500000),
  updated_at timestamptz not null default now()
);
insert into ai_company_budget_policy(singleton, daily_cap_minor_ngn)
  values (true, 500000) on conflict (singleton) do nothing;

create table if not exists ai_company_budget_reservations (
  tenant_id uuid not null references tenants(id),
  request_id uuid not null,
  budget_day date not null,
  reserved_cost_minor_ngn bigint not null check (reserved_cost_minor_ngn >= 0),
  reserved_at timestamptz not null default now(),
  primary key (tenant_id, request_id)
);
create index if not exists ai_company_budget_reservations_day_idx
  on ai_company_budget_reservations(budget_day) include (reserved_cost_minor_ngn);

-- No policies expose platform totals to tenants. Only the administrator/owner
-- and the fixed definer function may access these tables.
alter table ai_company_budget_policy enable row level security;
alter table ai_company_budget_reservations enable row level security;
revoke all on ai_company_budget_policy, ai_company_budget_reservations from public;

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
begin
  if p_tenant is null or p_tenant::text is distinct from current_setting('app.tenant_id', true) then
    raise exception 'Tenant context mismatch';
  end if;
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

revoke all on function reserve_company_copilot_budget(uuid,uuid,text,text,text,bigint,bigint,bigint) from public;
do $$
begin
  if exists(select 1 from pg_roles where rolname = 'propbrew_review_app') then
    revoke all on ai_company_budget_policy, ai_company_budget_reservations from propbrew_review_app;
    grant execute on function reserve_company_copilot_budget(uuid,uuid,text,text,text,bigint,bigint,bigint) to propbrew_review_app;
  end if;
  if exists(select 1 from pg_roles where rolname = 'propbrew_review_runtime') then
    revoke all on ai_company_budget_policy, ai_company_budget_reservations from propbrew_review_runtime;
    grant execute on function reserve_company_copilot_budget(uuid,uuid,text,text,text,bigint,bigint,bigint) to propbrew_review_runtime;
  end if;
end;
$$;
