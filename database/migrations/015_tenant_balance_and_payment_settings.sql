-- ============================================================================
-- MIGRATION 015: OUTSTANDING BALANCE + PLATFORM PAYMENT INSTRUCTIONS
--
-- Two additions to the manual billing feature from migration 014:
--
-- 1) organizations.balance_due -- an outstanding amount owed, independent
--    of monthly_price/next_payment_due. monthly_price + next_payment_due
--    model "pay this much every month"; balance_due models "this tenant
--    currently owes this much" (arrears, a manually-entered opening
--    balance, etc). record_tenant_payment now reduces it by the amount
--    paid, in addition to its existing next-due-date/status behavior.
--
--    No extra column-grant work needed here: organizations' table-level
--    SELECT/UPDATE/INSERT/DELETE were already fully revoked from
--    anon/authenticated in migration 014 (replaced with a narrow SELECT
--    allowlist), so a new column added now is NOT exposed by default --
--    the bug class fixed for agent_secret/the other billing columns
--    doesn't recur as long as that revoke stays in place.
--
-- 2) platform_settings -- a one-row table holding free-text payment
--    instructions (e.g. which mobile money line(s) tenants pay into).
--    Platform-admin only, same lockdown pattern as tenant_payments: RLS
--    enabled, zero policies, reachable only via the functions below.
-- ============================================================================

alter table public.organizations add column if not exists balance_due numeric(10,2) not null default 0;

comment on column public.organizations.balance_due is 'Outstanding amount this tenant currently owes, independent of the monthly_price/next_payment_due cycle. Reduced by record_tenant_payment(), editable directly via update_tenant_billing().';

create table public.platform_settings (
    id boolean primary key default true check (id),
    payment_instructions text,
    updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.platform_settings enable row level security;

comment on table public.platform_settings is 'Singleton row (id is always true) of platform-wide settings -- currently just how tenants should pay. Platform-admin only; no RLS policies, reachable only via get_platform_payment_instructions()/update_platform_payment_instructions().';

insert into public.platform_settings (id, payment_instructions) values (true, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- update_tenant_billing gains balance_due -- return type unchanged (void),
-- so this is a plain signature change: drop first since a new default
-- parameter still changes the function's identity for overload matching.
-- ---------------------------------------------------------------------------
drop function if exists public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean);

create function public.update_tenant_billing(
    p_org_id uuid,
    p_monthly_price numeric default null,
    p_currency text default null,
    p_subscription_status text default null,
    p_next_payment_due date default null,
    p_billing_notes text default null,
    p_clear_next_payment_due boolean default false,
    p_balance_due numeric default null
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
        balance_due = coalesce(p_balance_due, balance_due)
    where id = p_org_id;

    if not found then
        raise exception 'Tenant not found';
    end if;
end;
$$;

revoke all on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric) from public;
grant execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric) to authenticated;
revoke execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean, numeric) from anon;

-- ---------------------------------------------------------------------------
-- record_tenant_payment now also draws down balance_due by the amount paid.
-- ---------------------------------------------------------------------------
create or replace function public.record_tenant_payment(
    p_org_id uuid,
    p_amount numeric,
    p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_currency text;
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can record a payment';
    end if;

    select currency into v_currency from public.organizations where id = p_org_id;
    if not found then
        raise exception 'Tenant not found';
    end if;

    if p_amount is null or p_amount <= 0 then
        raise exception 'Payment amount must be greater than zero';
    end if;

    insert into public.tenant_payments (org_id, amount, currency, note, recorded_by)
    values (p_org_id, p_amount, coalesce(v_currency, 'USD'), nullif(trim(p_note), ''), auth.uid());

    update public.organizations
    set last_payment_at = timezone('utc'::text, now()),
        next_payment_due = (timezone('utc'::text, now()) + interval '1 month')::date,
        subscription_status = 'active',
        balance_due = greatest(balance_due - p_amount, 0)
    where id = p_org_id;
end;
$$;

revoke all on function public.record_tenant_payment(uuid, numeric, text) from public;
grant execute on function public.record_tenant_payment(uuid, numeric, text) to authenticated;
revoke execute on function public.record_tenant_payment(uuid, numeric, text) from anon;

-- ---------------------------------------------------------------------------
-- list_tenants_billing gains balance_due. Return type changes -> drop first.
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
-- Platform payment instructions -- read/write, platform-admin only.
-- ---------------------------------------------------------------------------
create or replace function public.get_platform_payment_instructions()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can view payment instructions';
    end if;
    return (select payment_instructions from public.platform_settings where id = true);
end;
$$;

revoke all on function public.get_platform_payment_instructions() from public;
grant execute on function public.get_platform_payment_instructions() to authenticated;
revoke execute on function public.get_platform_payment_instructions() from anon;

create or replace function public.update_platform_payment_instructions(p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can edit payment instructions';
    end if;
    update public.platform_settings set payment_instructions = p_text, updated_at = timezone('utc'::text, now()) where id = true;
end;
$$;

revoke all on function public.update_platform_payment_instructions(text) from public;
grant execute on function public.update_platform_payment_instructions(text) to authenticated;
revoke execute on function public.update_platform_payment_instructions(text) from anon;
