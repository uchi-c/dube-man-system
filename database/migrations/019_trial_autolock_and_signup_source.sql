-- ============================================================================
-- MIGRATION 019: AUTO-LOCK EXPIRED TRIALS, FIX SELF-SERVICE TRIAL SETUP,
-- TRACK SIGNUP SOURCE
--
-- Two real gaps found while wiring up self-service signup (migration 018's
-- follow-on):
--
-- 1) signup_new_organization (the self-service path, called from Signup.tsx)
--    never set next_payment_due -- only create_tenant_org (the platform-
--    admin "Add tenant" path) did. A self-service tenant's
--    subscription_status defaulted to 'trialing' but with no due date, so
--    it could never be flagged overdue or locked by anything date-based.
--    Fixed here: signup_new_organization now sets next_payment_due to 7
--    days out too, same as create_tenant_org.
--
-- 2) Locking a tenant has always been a manual action -- the platform admin
--    had to notice an overdue trial in "Needs attention" and click Lock.
--    current_org_ids() and is_org_locked() (migration 016) now also treat
--    a 'trialing' org whose next_payment_due has passed as locked, with no
--    admin action or scheduled job required -- it's computed at query
--    time, so it's correct the instant the due date passes and needs no
--    cron. This deliberately only covers trial expiry, not an overdue paid
--    subscription ('active'/'past_due' stays a manual Lock decision, same
--    as today, since a paying customer being briefly late is a different
--    situation from a trial simply running out).
--
-- Also adds organizations.signup_source ('admin' | 'self_service') so the
-- Tenants page and a future signup-notification check can tell the two
-- creation paths apart, and owner_notified_at so a polling notification
-- check can mark a self-service signup as already reported to the
-- platform owner without needing separate state elsewhere.
-- ============================================================================

alter table public.organizations add column if not exists signup_source text not null default 'admin'
  check (signup_source in ('admin', 'self_service'));
alter table public.organizations add column if not exists owner_notified_at timestamptz;

comment on column public.organizations.signup_source is 'How this tenant was created: admin (platform admin used Add tenant) or self_service (signup_new_organization, the public /signup form).';
comment on column public.organizations.owner_notified_at is 'Set once the platform owner has been notified about this self-service signup, so a polling check never reports the same signup twice.';

-- ---------------------------------------------------------------------------
-- 1) signup_new_organization: set the 7-day trial clock + signup_source.
-- ---------------------------------------------------------------------------
create or replace function public.signup_new_organization(
    org_name text,
    owner_name text default null,
    business_type text default 'general'
)
returns table (organization_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_org_id uuid;
    v_org_name text := trim(coalesce(org_name, ''));
    v_business_type public.business_type;
begin
    if v_user_id is null then
        raise exception 'Must be signed in to create an organization';
    end if;

    if exists (select 1 from public.users where id = v_user_id) then
        raise exception 'This account already has a profile. Sign in instead, or ask an admin to add you to another organization.';
    end if;

    if v_org_name = '' then
        raise exception 'Organization name is required';
    end if;

    begin
        v_business_type := coalesce(nullif(trim(business_type), ''), 'general')::public.business_type;
    exception when invalid_text_representation then
        raise exception 'Unknown business type: %', business_type;
    end;

    select email into v_email from auth.users where id = v_user_id;
    if v_email is null then
        raise exception 'Could not resolve the signed-in account''s email';
    end if;

    insert into public.organizations (name, business_type, agent_secret, subscription_status, next_payment_due, signup_source)
    values (
        v_org_name,
        v_business_type,
        replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        'trialing',
        (timezone('utc'::text, now()) + interval '7 days')::date,
        'self_service'
    )
    returning id into v_org_id;

    insert into public.users (id, name, email, role)
    values (
        v_user_id,
        coalesce(nullif(trim(owner_name), ''), split_part(v_email, '@', 1)),
        v_email,
        'ADMIN'
    );

    insert into public.user_organization_memberships (user_id, org_id)
    values (v_user_id, v_org_id)
    on conflict (user_id, org_id) do nothing;

    return query select v_org_id, 'ADMIN'::public.user_role;
end;
$$;

revoke all on function public.signup_new_organization(text, text, text) from public;
grant execute on function public.signup_new_organization(text, text, text) to authenticated;
revoke execute on function public.signup_new_organization(text, text, text) from anon;

-- ---------------------------------------------------------------------------
-- create_tenant_org: mark admin-created tenants explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.create_tenant_org(
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
        subscription_status, next_payment_due, payment_method, signup_source
    )
    values (
        trim(p_name),
        v_business_type,
        replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        p_monthly_price,
        coalesce(nullif(trim(p_currency), ''), 'USD'),
        'trialing',
        (timezone('utc'::text, now()) + interval '7 days')::date,
        nullif(trim(p_payment_method), ''),
        'admin'
    )
    returning id into v_org_id;

    return v_org_id;
end;
$$;

revoke all on function public.create_tenant_org(text, text, numeric, text, text) from public;
grant execute on function public.create_tenant_org(text, text, numeric, text, text) to authenticated;
revoke execute on function public.create_tenant_org(text, text, numeric, text, text) from anon;

-- ---------------------------------------------------------------------------
-- 2) Auto-lock: a trial past its due date is locked automatically.
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
      and not (o.subscription_status = 'trialing' and o.next_payment_due < current_date)
$$;

create or replace function public.is_org_locked(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select o.subscription_status in ('suspended', 'cancelled')
             or (o.subscription_status = 'trialing' and o.next_payment_due < current_date)
         from public.organizations o
         join public.user_organization_memberships m on m.org_id = o.id
         where o.id = p_org_id and m.user_id = auth.uid()),
        false
    )
$$;

-- ---------------------------------------------------------------------------
-- list_tenants_billing gains signup_source.
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
    signup_source text,
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
