-- ============================================================================
-- MIGRATION 014: PLATFORM ADMIN + MANUAL TENANT BILLING
--
-- Adds a cross-tenant "platform admin" capability (distinct from ADMIN,
-- which is scoped to one org via user_organization_memberships) so the
-- platform operator can create new tenants and track a flat monthly price
-- per tenant. Billing is manual for now -- no payment processor
-- integration, just a status + a payment ledger the platform admin updates
-- by hand. A platform admin gets nothing beyond tenant/billing management:
-- this deliberately does NOT grant them read access to any tenant's
-- operational data (sales, inventory, pharmacy records, etc).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Platform admin flag + helper, same shape as is_role()/current_org_ids().
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists is_platform_admin boolean not null default false;

comment on column public.users.is_platform_admin is 'Cross-tenant platform operator -- can create tenants and manage every organization''s billing. Not a per-org role (see user_organization_memberships); most users have this false.';

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select u.is_platform_admin from public.users u where u.id = auth.uid()), false)
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
revoke execute on function public.is_platform_admin() from anon;

comment on function public.is_platform_admin() is 'True if the signed-in user is a platform admin. Used to gate tenant creation and billing RPCs below.';

-- ---------------------------------------------------------------------------
-- 2) Billing columns on organizations -- a flat monthly price per tenant,
--    set at creation and editable later. No separate plans table: pricing
--    here is a plain per-org number a platform admin sets by hand, not a
--    catalog of reusable tiers.
-- ---------------------------------------------------------------------------
alter table public.organizations add column if not exists monthly_price numeric(10,2);
alter table public.organizations add column if not exists currency text not null default 'USD';
alter table public.organizations add column if not exists subscription_status text not null default 'trialing';
alter table public.organizations add column if not exists next_payment_due date;
alter table public.organizations add column if not exists last_payment_at timestamptz;
alter table public.organizations add column if not exists billing_notes text;

alter table public.organizations drop constraint if exists organizations_subscription_status_check;
alter table public.organizations add constraint organizations_subscription_status_check
    check (subscription_status in ('trialing','active','past_due','suspended','cancelled'));

-- Same bug class fixed for agent_secret in migration 013: Supabase's
-- default table-level grant to anon/authenticated automatically covers any
-- column added here unless explicitly revoked. Re-establish the narrow
-- SELECT allowlist (unchanged) and drop table-level UPDATE/INSERT/DELETE
-- entirely -- nothing in the app writes to organizations directly (no
-- .update()/.insert() call against this table is reachable from the
-- current frontend); every write already goes through a SECURITY DEFINER
-- function (signup_new_organization, and the tenant-billing functions
-- below), so there is no direct-write grant worth preserving.
revoke select, update, insert, delete on public.organizations from anon, authenticated;
grant select (id, name, created_at, business_type) on public.organizations to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Manual payment ledger. RLS enabled with zero policies -- reachable
--    only through the SECURITY DEFINER functions below, same lockdown
--    pattern already used for computer_provisioning_codes.
-- ---------------------------------------------------------------------------
create table public.tenant_payments (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    amount numeric(10,2) not null,
    currency text not null default 'USD',
    paid_at timestamptz not null default timezone('utc'::text, now()),
    note text,
    recorded_by uuid references public.users(id),
    created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.tenant_payments enable row level security;

comment on table public.tenant_payments is 'Manual payment log for tenant billing -- one row per recorded payment. No RLS policies: only reachable via record_tenant_payment()/list_tenant_payments(), both platform-admin-gated.';

-- ---------------------------------------------------------------------------
-- 4) Platform-admin RPCs.
-- ---------------------------------------------------------------------------

-- Creates the org row only -- the caller (an Edge Function, see
-- admin-create-tenant) still has to create the owner's auth account
-- separately, the same split admin-invite-user already uses for teammates,
-- because creating a password-based auth account needs Supabase Auth's
-- admin API (service role), not something a plain RPC can do.
create or replace function public.create_tenant_org(
    p_name text,
    p_business_type text,
    p_monthly_price numeric,
    p_currency text default 'USD'
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

    insert into public.organizations (name, business_type, agent_secret, monthly_price, currency, subscription_status)
    values (
        trim(p_name),
        v_business_type,
        replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        p_monthly_price,
        coalesce(nullif(trim(p_currency), ''), 'USD'),
        'trialing'
    )
    returning id into v_org_id;

    return v_org_id;
end;
$$;

revoke all on function public.create_tenant_org(text, text, numeric, text) from public;
grant execute on function public.create_tenant_org(text, text, numeric, text) to authenticated;
revoke execute on function public.create_tenant_org(text, text, numeric, text) from anon;

create or replace function public.list_tenants_billing()
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

create or replace function public.update_tenant_billing(
    p_org_id uuid,
    p_monthly_price numeric default null,
    p_currency text default null,
    p_subscription_status text default null,
    p_next_payment_due date default null,
    p_billing_notes text default null,
    p_clear_next_payment_due boolean default false
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
        billing_notes = coalesce(p_billing_notes, billing_notes)
    where id = p_org_id;

    if not found then
        raise exception 'Tenant not found';
    end if;
end;
$$;

revoke all on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean) from public;
grant execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean) to authenticated;
revoke execute on function public.update_tenant_billing(uuid, numeric, text, text, date, text, boolean) from anon;

-- Logs the payment and advances the tenant a month, matching how a small
-- manually-run business actually tracks this: mark paid, due date rolls
-- forward, status goes back to active.
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
        subscription_status = 'active'
    where id = p_org_id;
end;
$$;

revoke all on function public.record_tenant_payment(uuid, numeric, text) from public;
grant execute on function public.record_tenant_payment(uuid, numeric, text) to authenticated;
revoke execute on function public.record_tenant_payment(uuid, numeric, text) from anon;

create or replace function public.list_tenant_payments(p_org_id uuid)
returns table (
    id uuid,
    amount numeric,
    currency text,
    paid_at timestamptz,
    note text,
    recorded_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can view tenant payment history';
    end if;

    return query
    select p.id, p.amount, p.currency, p.paid_at, p.note, u.name
    from public.tenant_payments p
    left join public.users u on u.id = p.recorded_by
    where p.org_id = p_org_id
    order by p.paid_at desc;
end;
$$;

revoke all on function public.list_tenant_payments(uuid) from public;
grant execute on function public.list_tenant_payments(uuid) to authenticated;
revoke execute on function public.list_tenant_payments(uuid) from anon;
