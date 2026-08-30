-- ============================================================================
-- MIGRATION 016: LOCK/PAUSE ENFORCEMENT, 7-DAY TRIAL, PER-TENANT PAYMENT METHOD
--
-- Three additions:
--
-- 1) subscription_status already had a 'suspended' value (and 'cancelled')
--    selectable in the Tenants UI, but nothing enforced it -- a "suspended"
--    tenant's staff could keep using the app exactly as before. This
--    migration makes it real: current_org_ids() (the function nearly every
--    org-scoped RLS policy in this schema routes through -- verified via
--    pg_policies before writing this) now excludes a caller's memberships
--    in any org whose subscription_status is 'suspended' or 'cancelled'.
--    One function change, and a locked tenant's staff loses access to
--    every operational table at once: sales, inventory, pharmacy records,
--    cafe sessions, print jobs, computers, etc.
--
--    That same exclusion means a locked org disappears from its own
--    members' view of "organizations" too (that policy is also gated by
--    current_org_ids()) -- which would otherwise surface as a confusing
--    "not a member of any organization" error rather than a clear paused
--    message. is_org_locked() below exists so the client can detect this
--    directly (bypassing the exclusion) and show an actual "paused, here's
--    how to pay" screen instead.
--
-- 2) create_tenant_org now sets next_payment_due to 7 days out
--    automatically -- a real trial window, not just a status label with no
--    clock on it. The existing due-soon/overdue machinery (see migration
--    015 and the Tenants page) already does the rest: a trial tenant shows
--    up as "due soon" then "overdue" on its own once the week is up.
--
-- 3) organizations.payment_method -- a free-text note of how this specific
--    tenant actually pays (distinct from platform_settings'
--    payment_instructions, which is how they should pay YOU) surfaced on
--    the Tenants page.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a) The enforcement point.
-- ---------------------------------------------------------------------------
create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    select m.org_id
    from public.user_organization_memberships m
    join public.organizations o on o.id = m.org_id
    where m.user_id = auth.uid()
      and o.subscription_status not in ('suspended', 'cancelled')
$$;

-- ---------------------------------------------------------------------------
-- 1b) Client-side lock check, independent of current_org_ids()'s exclusion.
-- ---------------------------------------------------------------------------
create or replace function public.is_org_locked(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select o.subscription_status in ('suspended', 'cancelled')
         from public.organizations o
         join public.user_organization_memberships m on m.org_id = o.id
         where o.id = p_org_id and m.user_id = auth.uid()),
        false
    )
$$;

revoke all on function public.is_org_locked(uuid) from public;
grant execute on function public.is_org_locked(uuid) to authenticated;
revoke execute on function public.is_org_locked(uuid) from anon;

comment on function public.is_org_locked(uuid) is 'True if the caller is a member of org p_org_id and it is suspended/cancelled. Used by the client to show a paused screen -- current_org_ids() already hides a locked org from its own members, so this is the one place that still checks directly.';

-- Any signed-in user can now read this (was platform-admin only) -- a
-- locked-out tenant needs to see how to pay to get reactivated.
create or replace function public.get_platform_payment_instructions()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select payment_instructions from public.platform_settings where id = true
$$;

revoke all on function public.get_platform_payment_instructions() from public;
grant execute on function public.get_platform_payment_instructions() to authenticated;
revoke execute on function public.get_platform_payment_instructions() from anon;

-- ---------------------------------------------------------------------------
-- 3) payment_method column.
-- ---------------------------------------------------------------------------
alter table public.organizations add column if not exists payment_method text;

-- ---------------------------------------------------------------------------
-- 2) create_tenant_org: 7-day trial due date + payment method.
-- ---------------------------------------------------------------------------
drop function if exists public.create_tenant_org(text, text, numeric, text);

create function public.create_tenant_org(
    p_name text,
    p_business_type text,
    p_monthly_price numeric,
    p_currency text default 'USD',
    p_payment_method text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
    v_business_type public.business_type;
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can create a tenant';
    end if;

    if trim(coalesce(p_name, '')) = '' then
        raise exception 'Tenant name is required';
    end if;

    begin
        v_business_type := coalesce(nullif(trim(p_business_type), ''), 'general')::public.business_type;
    exception when invalid_text_representation then
        raise exception 'Unknown business type: %', p_business_type;
    end;

    insert into public.organizations (
        name, business_type, agent_secret, monthly_price, currency,
        subscription_status, next_payment_due, payment_method
    )
    values (
        trim(p_name),
        v_business_type,
        replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        p_monthly_price,
        coalesce(nullif(trim(p_currency), ''), 'USD'),
        'trialing',
        (timezone('utc'::text, now()) + interval '7 days')::date,
        nullif(trim(p_payment_method), '')
    )
    returning id into v_org_id;

    return v_org_id;
end;
$$;

revoke all on function public.create_tenant_org(text, text, numeric, text, text) from public;
grant execute on function public.create_tenant_org(text, text, numeric, text, text) to authenticated;
revoke execute on function public.create_tenant_org(text, text, numeric, text, text) from anon;

-- ---------------------------------------------------------------------------
-- update_tenant_billing gains payment_method.
-- ---------------------------------------------------------------------------
drop function if exists public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric);

create function public.update_tenant_billing(
    p_org_id uuid,
    p_monthly_price numeric default null,
    p_currency text default null,
    p_subscription_status text default null,
    p_next_payment_due date default null,
    p_billing_notes text default null,
    p_clear_next_payment_due boolean default false,
    p_balance_due numeric default null,
    p_payment_method text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can edit tenant billing';
    end if;

    update public.organizations set
        monthly_price = coalesce(p_monthly_price, monthly_price),
        currency = coalesce(nullif(trim(p_currency), ''), currency),
        subscription_status = coalesce(p_subscription_status, subscription_status),
        next_payment_due = case when p_clear_next_payment_due then null else coalesce(p_next_payment_due, next_payment_due) end,
        billing_notes = coalesce(p_billing_notes, billing_notes),
        balance_due = coalesce(p_balance_due, balance_due),
        payment_method = coalesce(nullif(trim(p_payment_method), ''), payment_method)
    where id = p_org_id;

    if not found then
        raise exception 'Tenant not found';
    end if;
end;
$$;

revoke all on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text) from public;
grant execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text) to authenticated;
revoke execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text) from anon;

-- ---------------------------------------------------------------------------
-- list_tenants_billing gains payment_method.
-- ---------------------------------------------------------------------------
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
        (select count(*) from public.user_organization_memberships m where m.org_id = o.id),
        (select string_agg(u.email, ', ' order by u.email)
         from public.user_organization_memberships m
         join public.users u on u.id = m.user_id
         where m.org_id = o.id and u.role = 'ADMIN'),
        o.created_at
    from public.organizations o
    order by o.created_at desc;
end;
$$;

revoke all on function public.list_tenants_billing() from public;
grant execute on function public.list_tenants_billing() to authenticated;
revoke execute on function public.list_tenants_billing() from anon;
