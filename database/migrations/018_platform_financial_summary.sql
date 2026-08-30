-- ============================================================================
-- MIGRATION 018: PLATFORM-WIDE FINANCIAL SUMMARY FOR THE PLATFORM OWNER
--
-- Everything on the Tenants page (migrations 014-016) is per-tenant: one
-- row's balance_due, one row's payment history. The platform owner has no
-- view of their own SaaS revenue across all tenants at once -- no MRR, no
-- "collected this month", no cross-tenant payment feed. This adds exactly
-- that, as two read-only, platform-admin-gated functions (same is_
-- platform_admin() guard as every other function in this file's family):
--
-- 1) get_platform_financial_summary() -- one row per currency (tenants
--    aren't all billed in the same currency, so summing across currencies
--    would be meaningless) with:
--      - mrr: sum of monthly_price for orgs currently 'active' (the
--        recurring revenue actually being collected, not trial pipeline
--        or lapsed accounts)
--      - outstanding_balance: sum of balance_due across every tenant,
--        any status -- money owed right now
--      - collected_this_month / collected_all_time: sums of real,
--        already-recorded tenant_payments rows (an append-only ledger,
--        not a snapshot -- see migration 014), so these are actual cash
--        collected, not projections
--      - tenant_count: how many tenants bill in this currency
--
-- 2) list_all_tenant_payments(p_limit) -- list_tenant_payments (migration
--    014) is scoped to one org; this is the same shape joined across every
--    tenant, most recent first, for a platform-wide "recent payments" feed.
-- ============================================================================

create or replace function public.get_platform_financial_summary()
returns table (
    currency text,
    mrr numeric,
    outstanding_balance numeric,
    collected_this_month numeric,
    collected_all_time numeric,
    tenant_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can view platform financials';
    end if;

    return query
    select
        cur.currency,
        coalesce((
            select sum(o.monthly_price) from public.organizations o
            where o.currency = cur.currency and o.subscription_status = 'active'
        ), 0),
        coalesce((
            select sum(o.balance_due) from public.organizations o
            where o.currency = cur.currency
        ), 0),
        coalesce((
            select sum(p.amount) from public.tenant_payments p
            where p.currency = cur.currency and p.paid_at >= date_trunc('month', timezone('utc', now()))
        ), 0),
        coalesce((
            select sum(p.amount) from public.tenant_payments p
            where p.currency = cur.currency
        ), 0),
        (select count(*) from public.organizations o where o.currency = cur.currency)
    from (
        select currency from public.organizations
        union
        select currency from public.tenant_payments
    ) cur
    order by cur.currency;
end;
$$;

revoke all on function public.get_platform_financial_summary() from public;
grant execute on function public.get_platform_financial_summary() to authenticated;
revoke execute on function public.get_platform_financial_summary() from anon;

comment on function public.get_platform_financial_summary() is 'Platform owner''s cross-tenant revenue summary, one row per billing currency. Platform-admin only.';

create or replace function public.list_all_tenant_payments(p_limit int default 50)
returns table (
    id uuid,
    org_id uuid,
    org_name text,
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
        raise exception 'Only a platform admin can view platform payments';
    end if;

    return query
    select p.id, p.org_id, o.name, p.amount, p.currency, p.paid_at, p.note, u.name
    from public.tenant_payments p
    join public.organizations o on o.id = p.org_id
    left join public.users u on u.id = p.recorded_by
    order by p.paid_at desc
    limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.list_all_tenant_payments(int) from public;
grant execute on function public.list_all_tenant_payments(int) to authenticated;
revoke execute on function public.list_all_tenant_payments(int) from anon;

comment on function public.list_all_tenant_payments(int) is 'Most recent payments across every tenant, most recent first. Platform-admin only.';
