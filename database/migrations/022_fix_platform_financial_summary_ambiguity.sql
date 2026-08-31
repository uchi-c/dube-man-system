-- ============================================================================
-- MIGRATION 022: FIX get_platform_financial_summary() -- ALWAYS ERRORED
--
-- The Finance page (PlatformFinance.tsx) has been broken since migration 018
-- created this function: `returns table (currency text, ...)` implicitly
-- declares a PL/pgSQL variable named `currency` in scope for the whole
-- function body, and the inner subquery's bare `select currency from
-- public.organizations union select currency from public.tenant_payments`
-- is ambiguous between that variable and the real table columns --
-- Postgres's default plpgsql.variable_conflict = error setting refuses to
-- guess and raises "column reference \"currency\" is ambiguous" on every
-- single call, regardless of data. Confirmed by reproducing the exact error
-- live as the real platform admin. Fix: alias the table columns explicitly
-- (o.currency / p.currency) so there's no bare `currency` left to clash with
-- the outer variable. Same signature, so create-or-replace is sufficient --
-- no drop needed.
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
        select o.currency from public.organizations o
        union
        select p.currency from public.tenant_payments p
    ) cur
    order by cur.currency;
end;
$$;
