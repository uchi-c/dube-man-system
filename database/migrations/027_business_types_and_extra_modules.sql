-- ============================================================================
-- MIGRATION 027: CLOTHING/MECHANICS BUSINESS TYPES + PER-TENANT EXTRA MODULES
--
-- Two related gaps:
--
-- 1) business_type only covered general/pharmacy/cafe/printing/retail --
--    no option for a clothing store or a mechanic/auto-repair shop.
--
-- 2) 'general' business_type showed WiFi Management, PC Agent Hub, and
--    Internet Café management to every tenant of that type by default
--    (it was computed as "every tab except pharmacy") -- most general
--    dealers don't run a café or need remote PC monitoring. Those three
--    modules should only show for a tenant that specifically asked for
--    them, independent of business_type. organizations.extra_modules
--    holds that per-tenant opt-in list; the frontend (App.tsx) unions it
--    with whatever the business type's own default module set is.
--
-- extra_modules is intentionally a free-form text[] rather than three
-- booleans -- it's validated against a fixed allowlist by
-- update_tenant_extra_modules() below rather than by a table constraint,
-- so adding a future opt-in module doesn't need another migration.
-- ============================================================================

do $$ begin
    alter type public.business_type add value if not exists 'clothing';
exception when duplicate_object then null; end $$;

do $$ begin
    alter type public.business_type add value if not exists 'mechanics';
exception when duplicate_object then null; end $$;

alter table public.organizations add column if not exists extra_modules text[] not null default '{}';

comment on column public.organizations.extra_modules is 'Per-tenant opt-in nav modules beyond their business_type''s default set -- currently wifi/pc-agent/cafe, which most tenants (even general dealers) don''t need by default. Validated against a fixed allowlist by update_tenant_extra_modules(), not a table constraint, so a new opt-in module doesn''t need another migration.';

create or replace function public.update_tenant_extra_modules(p_org_id uuid, p_extra_modules text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_allowed text[] := array['wifi', 'pc-agent', 'cafe'];
    v_invalid text[];
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can change a tenant''s enabled modules';
    end if;

    select array_agg(m) into v_invalid
    from unnest(p_extra_modules) m
    where m <> all(v_allowed);

    if v_invalid is not null then
        raise exception 'Unknown module(s): %', array_to_string(v_invalid, ', ');
    end if;

    update public.organizations set extra_modules = coalesce(p_extra_modules, '{}') where id = p_org_id;
end;
$$;

revoke all on function public.update_tenant_extra_modules(uuid, text[]) from public;
grant execute on function public.update_tenant_extra_modules(uuid, text[]) to authenticated;
revoke execute on function public.update_tenant_extra_modules(uuid, text[]) from anon;

comment on function public.update_tenant_extra_modules(uuid, text[]) is 'Platform-admin-only: sets which opt-in modules (wifi/pc-agent/cafe) a tenant sees beyond their business_type default, for tenants that specifically asked for one.';

-- list_tenants_billing (migration 019) needs extra_modules too, so the
-- platform admin can see/edit it from Tenants without a second query.
drop function if exists public.list_tenants_billing();

create function public.list_tenants_billing()
returns table (
    organization_id uuid,
    name text,
    business_type public.business_type,
    monthly_price numeric,
    currency text,
    subscription_status text,
    next_payment_due date,
    last_payment_at timestamptz,
    billing_notes text,
    balance_due numeric,
    payment_method text,
    signup_source text,
    billing_cycle text,
    extra_modules text[],
    member_count bigint,
    admin_emails text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can list tenants';
    end if;

    return query
    select
        o.id,
        o.name,
        o.business_type,
        o.monthly_price,
        o.currency,
        o.subscription_status,
        o.next_payment_due,
        o.last_payment_at,
        o.billing_notes,
        o.balance_due,
        o.payment_method,
        o.signup_source,
        o.billing_cycle,
        o.extra_modules,
        (select count(*) from public.user_organization_memberships m where m.org_id = o.id),
        (select string_agg(u.email, ', ' order by u.email)
         from public.user_organization_memberships m
         join public.users u on u.id = m.user_id
         where m.org_id = o.id and u.role = 'ADMIN'),
        o.created_at
    from public.organizations o
    where o.deleted_at is null
    order by o.created_at desc;
end;
$$;

revoke all on function public.list_tenants_billing() from public;
grant execute on function public.list_tenants_billing() to authenticated;
revoke execute on function public.list_tenants_billing() from anon;
