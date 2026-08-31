-- ============================================================================
-- MIGRATION 020: TRACK WHICH PRICING TIER / BILLING CYCLE A TENANT IS ON
--
-- The public pricing page (PricingSection.tsx) shows three tiers and a
-- Monthly/Quarterly/Yearly toggle, but nothing captured which one someone
-- actually picked -- every "Start free trial" button routed to the same
-- generic signup form, which doesn't collect a plan or cycle at all. This
-- closes that gap:
--
-- 1) organizations.billing_cycle ('monthly' | 'quarterly' | 'yearly').
--    The "tier" itself doesn't need a separate column -- business_type
--    already determines it 1:1 (general/retail -> Retail & General,
--    cafe/printing -> Café & Printing, pharmacy -> Pharmacy), same
--    grouping SUGGESTED_PRICE (TenantsAdmin.tsx) and PricingSection.tsx
--    already use.
--
-- 2) signup_new_organization now takes a billing_cycle and computes
--    monthly_price/currency server-side from business_type (150/200/350
--    ZMW) instead of leaving them null -- the client never gets to submit
--    an arbitrary price, the server is the source of truth for what each
--    tier actually costs, same numbers as the public pricing page.
--
-- 3) create_tenant_org and update_tenant_billing gain p_billing_cycle so
--    the platform admin's Tenants page can set/edit it too, and
--    list_tenants_billing returns it so it's visible there.
--
-- 4) get_my_organization_billing() -- new, NOT platform-admin-gated (any
--    org member can call it for their own org) -- so a tenant's own
--    dashboard can show "your plan" without needing platform-admin
--    access. Deliberately not filtered through current_org_ids() (which
--    excludes locked orgs): a locked-out tenant still needs to see their
--    own plan/status, arguably more than an active one does.
-- ============================================================================

alter table public.organizations add column if not exists billing_cycle text not null default 'monthly'
  check (billing_cycle in ('monthly', 'quarterly', 'yearly'));

comment on column public.organizations.billing_cycle is 'Which billing cadence this tenant signed up under or was set to. Purely informational -- payments are still recorded manually (record_tenant_payment) regardless of cycle.';

-- ---------------------------------------------------------------------------
-- 1) signup_new_organization: capture billing_cycle, compute the real price.
-- ---------------------------------------------------------------------------
drop function if exists public.signup_new_organization(text, text, text);

create function public.signup_new_organization(
    org_name text,
    owner_name text default null,
    business_type text default 'general',
    billing_cycle text default 'monthly'
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
    v_billing_cycle text := coalesce(nullif(trim(billing_cycle), ''), 'monthly');
    v_monthly_price numeric;
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

    if v_billing_cycle not in ('monthly', 'quarterly', 'yearly') then
        raise exception 'Unknown billing cycle: %', billing_cycle;
    end if;

    -- Same three tiers as the public pricing page (PricingSection.tsx) and
    -- SUGGESTED_PRICE (TenantsAdmin.tsx) -- computed here, not trusted from
    -- the client, so a self-service signup always gets the real price.
    v_monthly_price := case
        when v_business_type = 'pharmacy' then 350
        when v_business_type in ('cafe', 'printing') then 200
        else 150
    end;

    select email into v_email from auth.users where id = v_user_id;
    if v_email is null then
        raise exception 'Could not resolve the signed-in account''s email';
    end if;

    insert into public.organizations (
        name, business_type, agent_secret, subscription_status, next_payment_due,
        signup_source, monthly_price, currency, billing_cycle
    )
    values (
        v_org_name,
        v_business_type,
        replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        'trialing',
        (timezone('utc'::text, now()) + interval '7 days')::date,
        'self_service',
        v_monthly_price,
        'ZMW',
        v_billing_cycle
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

revoke all on function public.signup_new_organization(text, text, text, text) from public;
grant execute on function public.signup_new_organization(text, text, text, text) to authenticated;
revoke execute on function public.signup_new_organization(text, text, text, text) from anon;

-- ---------------------------------------------------------------------------
-- create_tenant_org gains p_billing_cycle.
-- ---------------------------------------------------------------------------
drop function if exists public.create_tenant_org(text, text, numeric, text, text);

create function public.create_tenant_org(
    p_name text,
    p_business_type text,
    p_monthly_price numeric,
    p_currency text default 'USD',
    p_payment_method text default null,
    p_billing_cycle text default 'monthly'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
    v_business_type public.business_type;
    v_billing_cycle text := coalesce(nullif(trim(p_billing_cycle), ''), 'monthly');
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can create a tenant';
    end if;

    if trim(coalesce(p_name, '')) = '' then
        raise exception 'Tenant name is required';
    end if;

    if v_billing_cycle not in ('monthly', 'quarterly', 'yearly') then
        raise exception 'Unknown billing cycle: %', p_billing_cycle;
    end if;

    begin
        v_business_type := coalesce(nullif(trim(p_business_type), ''), 'general')::public.business_type;
    exception when invalid_text_representation then
        raise exception 'Unknown business type: %', p_business_type;
    end;

    insert into public.organizations (
        name, business_type, agent_secret, monthly_price, currency,
        subscription_status, next_payment_due, payment_method, signup_source, billing_cycle
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
        'admin',
        v_billing_cycle
    )
    returning id into v_org_id;

    return v_org_id;
end;
$$;

revoke all on function public.create_tenant_org(text, text, numeric, text, text, text) from public;
grant execute on function public.create_tenant_org(text, text, numeric, text, text, text) to authenticated;
revoke execute on function public.create_tenant_org(text, text, numeric, text, text, text) from anon;

-- ---------------------------------------------------------------------------
-- update_tenant_billing gains p_billing_cycle.
-- ---------------------------------------------------------------------------
drop function if exists public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text);

create function public.update_tenant_billing(
    p_org_id uuid,
    p_monthly_price numeric default null,
    p_currency text default null,
    p_subscription_status text default null,
    p_next_payment_due date default null,
    p_billing_notes text default null,
    p_clear_next_payment_due boolean default false,
    p_balance_due numeric default null,
    p_payment_method text default null,
    p_billing_cycle text default null
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

    if p_billing_cycle is not null and p_billing_cycle not in ('monthly', 'quarterly', 'yearly') then
        raise exception 'Unknown billing cycle: %', p_billing_cycle;
    end if;

    update public.organizations set
        monthly_price = coalesce(p_monthly_price, monthly_price),
        currency = coalesce(nullif(trim(p_currency), ''), currency),
        subscription_status = coalesce(p_subscription_status, subscription_status),
        next_payment_due = case when p_clear_next_payment_due then null else coalesce(p_next_payment_due, next_payment_due) end,
        billing_notes = coalesce(p_billing_notes, billing_notes),
        balance_due = coalesce(p_balance_due, balance_due),
        payment_method = coalesce(nullif(trim(p_payment_method), ''), payment_method),
        billing_cycle = coalesce(p_billing_cycle, billing_cycle)
    where id = p_org_id;

    if not found then
        raise exception 'Tenant not found';
    end if;
end;
$$;

revoke all on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text, text) from public;
grant execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text, text) to authenticated;
revoke execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric, text, text) from anon;

-- ---------------------------------------------------------------------------
-- list_tenants_billing gains billing_cycle.
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
    billing_cycle text,
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

-- ---------------------------------------------------------------------------
-- 4) get_my_organization_billing: a tenant's own view of their plan.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_organization_billing(p_org_id uuid default null)
returns table (
    organization_id uuid,
    name text,
    business_type public.business_type,
    monthly_price numeric,
    currency text,
    subscription_status text,
    next_payment_due date,
    balance_due numeric,
    billing_cycle text
)
language sql
stable
security definer
set search_path = public
as $$
    select o.id, o.name, o.business_type, o.monthly_price, o.currency,
           o.subscription_status, o.next_payment_due, o.balance_due, o.billing_cycle
    from public.organizations o
    join public.user_organization_memberships m on m.org_id = o.id
    where m.user_id = auth.uid()
      and (p_org_id is null or o.id = p_org_id)
    order by o.created_at desc
    limit 1
$$;

revoke all on function public.get_my_organization_billing(uuid) from public;
grant execute on function public.get_my_organization_billing(uuid) to authenticated;
revoke execute on function public.get_my_organization_billing(uuid) from anon;

comment on function public.get_my_organization_billing(uuid) is 'A tenant''s own plan/billing snapshot -- any org member can call this for their own org (not platform-admin gated, unlike list_tenants_billing). Used by the tenant-side dashboard "Your plan" card.';
