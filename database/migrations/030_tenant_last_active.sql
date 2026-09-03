-- ============================================================================
-- MIGRATION 030: TENANT LAST-ACTIVE SIGNAL
--
-- TenantsAdmin.tsx already flags billing-side risk thoroughly (overdue,
-- due-soon, suspended, balance owed -- see daysUntilDue/isOverdue/
-- isDueSoon in that file), but has no way to see whether a tenant that
-- LOOKS fine billing-wise has actually stopped using the product -- the
-- single most useful churn signal, and the one billing status can't show
-- (a tenant can be "active" and fully paid up while nobody has opened
-- the app in a month).
--
-- Supabase Auth already stamps auth.users.last_sign_in_at on every login,
-- so this needs no new tracking -- just a platform-admin-only read of
-- data that already exists. Deliberately a separate narrow RPC rather
-- than adding a column to list_tenants_billing(): that function's
-- RETURNS TABLE shape has already had to be regenerated (and once
-- briefly regressed, migration 027) each time a field was added, so a
-- purely additive, independently-fetched signal is the lower-risk shape
-- here.
-- ============================================================================

create or replace function public.get_tenant_last_active()
returns table (organization_id uuid, last_active_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can view tenant activity';
    end if;

    return query
    select m.org_id, max(u.last_sign_in_at)
    from public.user_organization_memberships m
    join auth.users u on u.id = m.user_id
    group by m.org_id;
end;
$$;

revoke all on function public.get_tenant_last_active() from public;
grant execute on function public.get_tenant_last_active() to authenticated;
revoke execute on function public.get_tenant_last_active() from anon;

comment on function public.get_tenant_last_active() is 'Most recent auth.users.last_sign_in_at across each org''s members -- the one churn signal billing status alone cannot show. Platform-admin callers only.';
