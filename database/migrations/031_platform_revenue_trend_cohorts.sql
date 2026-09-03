-- ============================================================================
-- MIGRATION 031: PLATFORM REVENUE TREND + SIGNUP COHORTS
--
-- PlatformFinance.tsx already shows MRR/outstanding/collected-this-month
-- as point-in-time stat cards (get_platform_financial_summary(), migration
-- 018) plus a flat payments table. Missing: how that revenue has moved
-- over time, and which signup cohorts it's coming from -- both platform-
-- admin only, both read-only aggregates over tenant_payments/organizations
-- that already exist.
--
-- Kept intentionally modest: a monthly collected-revenue trend, and a
-- "tenants signed up this month -> how many are still active + their
-- current MRR" cohort rollup -- not a full retention-curve engine, which
-- would need meaningfully more historical state than this schema tracks.
-- ============================================================================

create or replace function public.get_platform_revenue_trend(p_months int default 6)
returns table (month date, currency text, collected numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can view the revenue trend';
    end if;

    if p_months is null or p_months < 1 or p_months > 36 then
        raise exception 'p_months must be between 1 and 36';
    end if;

    return query
    select
        date_trunc('month', p.paid_at)::date,
        p.currency,
        sum(p.amount)
    from public.tenant_payments p
    where p.paid_at >= date_trunc('month', current_date) - (p_months - 1) * interval '1 month'
    group by 1, 2
    order by 1, 2;
end;
$$;

revoke all on function public.get_platform_revenue_trend(int) from public;
grant execute on function public.get_platform_revenue_trend(int) to authenticated;
revoke execute on function public.get_platform_revenue_trend(int) from anon;

comment on function public.get_platform_revenue_trend(int) is 'Monthly collected revenue (sum of tenant_payments.amount) per currency for the last p_months months. Platform-admin callers only.';

create or replace function public.get_platform_signup_cohorts(p_months int default 6)
returns table (
    cohort_month date,
    currency text,
    tenant_count bigint,
    active_count bigint,
    current_mrr numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can view signup cohorts';
    end if;

    if p_months is null or p_months < 1 or p_months > 36 then
        raise exception 'p_months must be between 1 and 36';
    end if;

    return query
    select
        date_trunc('month', o.created_at)::date,
        o.currency,
        count(*),
        count(*) filter (where o.subscription_status = 'active'),
        coalesce(sum(o.monthly_price) filter (where o.subscription_status = 'active'), 0)
    from public.organizations o
    where o.deleted_at is null
      and o.created_at >= date_trunc('month', current_date) - (p_months - 1) * interval '1 month'
    group by 1, 2
    order by 1, 2;
end;
$$;

revoke all on function public.get_platform_signup_cohorts(int) from public;
grant execute on function public.get_platform_signup_cohorts(int) to authenticated;
revoke execute on function public.get_platform_signup_cohorts(int) from anon;

comment on function public.get_platform_signup_cohorts(int) is 'Tenants grouped by signup month for the last p_months months -- how many signed up, how many are still active, and their combined current MRR. Platform-admin callers only.';
