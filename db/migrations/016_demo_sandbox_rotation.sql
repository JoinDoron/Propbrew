-- Production recovery: a demo login can outlive its 24-hour private workspace. Rotate an expired
-- sandbox instead of trapping the still-valid session in an unrecoverable
-- "demo sandbox expired" loop. The retired tenant and its records are kept for
-- audit/recovery, but are detached from the session and remain inaccessible.
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
  select * into v_existing from public.demo_sandboxes d where d.auth_session_id=v_session for update;
  if found and v_existing.auth_user_id<>v_user then raise exception 'The demo sandbox is unavailable'; end if;
  if found and v_existing.expires_at>now() then
    return query select v_existing.tenant_id,v_existing.expires_at; return;
  end if;
  if found then
    update public.demo_sandboxes set auth_session_id=null where tenant_id=v_existing.tenant_id;
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
    values(p_id,v_user::text,'demo.sandbox.created','demo_sandbox',p_id::text,'{"source":"repository-fixtures","modules":4,"reason":"created_or_rotated"}'::jsonb);
  return query select p_id,v_expiry;
end;
$demo$;

revoke all on function ensure_demo_sandbox(uuid,jsonb) from public;
do $grants$
declare v_role text;
begin
  foreach v_role in array array['propbrew_review_app','propbrew_review_runtime'] loop
    if exists(select 1 from pg_roles where rolname=v_role) then
      execute format('grant execute on function ensure_demo_sandbox(uuid,jsonb) to %I',v_role);
    end if;
  end loop;
end;
$grants$;
