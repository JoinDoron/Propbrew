-- Background draft generation discovers only opted-in real-company workspaces.
-- No user/session is impersonated, no provider is called, and no RLS policy is
-- widened. Ordinary authenticated transactions cannot use the job directory.
create or replace function estate_recurring_company_allowed(company uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public as $jobs$
  select coalesce(nullif(current_setting('app.auth_user_id',true),''),'')=''
    and exists (
      select 1 from public.tenants t
      where t.id=company and t.status='active' and t.created_by_auth_user is not null
        and not public.propbrew_is_demo_user(t.created_by_auth_user::text)
        and t.id<>'6b20d921-50a1-4ccb-9018-d6f80204e223'::uuid
        and not exists(select 1 from public.demo_sandboxes d where d.tenant_id=t.id)
    );
$jobs$;

create or replace function estate_recurring_company_ids(after_id uuid default null, batch_size integer default 100)
returns table(tenant_id uuid) language sql stable security definer
set search_path=pg_catalog,public as $jobs$
  select w.tenant_id from public.workspace_records w
  where public.estate_recurring_company_allowed(w.tenant_id)
    and (after_id is null or w.tenant_id>after_id)
    and exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(w.payload#>'{auxiliary,estateBilling,rules}')='array'
          then w.payload#>'{auxiliary,estateBilling,rules}' else '[]'::jsonb end
      ) r where r->>'enabled'='true' and r->>'tenantId'=w.tenant_id::text
    )
  order by w.tenant_id
  limit greatest(1,least(coalesce(batch_size,100),100));
$jobs$;

revoke all on function estate_recurring_company_allowed(uuid),estate_recurring_company_ids(uuid,integer) from public;
do $jobs$ begin
  if exists(select from pg_roles where rolname='propbrew_review_app') then
    grant execute on function estate_recurring_company_allowed(uuid),estate_recurring_company_ids(uuid,integer) to propbrew_review_app;
  end if;
end $jobs$;
