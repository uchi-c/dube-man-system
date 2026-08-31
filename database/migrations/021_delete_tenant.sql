-- ============================================================================
-- MIGRATION 021: DELETE A TENANT
--
-- TenantsAdmin.tsx had no way to remove a tenant at all -- Manage only ever
-- edited billing or locked/unlocked access.
--
-- This is a soft delete, not a hard one, and deliberately so: products,
-- customers, sales, sale_items, printing_orders, etc. all have an
-- organization_id column added via a plain `references public.organizations
-- (id)` (see migration 001) -- no `on delete cascade`. A hard `delete from
-- organizations` would therefore fail with a foreign-key violation on the
-- first tenant that has ever recorded a sale, which in practice is every
-- real tenant. Hard-deleting would also permanently destroy financial
-- history that this platform's own billing (tenant_payments,
-- get_platform_financial_summary) depends on. So "delete" here means the
-- same thing migration 017 established for products/customers/staff: marked
-- gone, hidden from the active list, data kept intact underneath.
--
-- organizations.deleted_at also forces subscription_status to 'cancelled',
-- which is already enough to lock the tenant out immediately -- current_org_
-- ids()/is_org_locked() (migration 016) exclude 'cancelled' orgs from every
-- org-scoped table already. deleted_at itself just drives list_tenants_
-- billing() hiding it from the Tenants page and blocks re-deleting/re-
-- adding through the same path twice.
-- ============================================================================

alter table public.organizations add column if not exists deleted_at timestamptz;

comment on column public.organizations.deleted_at is 'Soft-delete marker set by delete_tenant_org(). Not a hard delete -- see migration 021 -- data underneath (products, sales, etc.) is kept, just locked out and hidden from the Tenants list.';

-- ---------------------------------------------------------------------------
-- delete_tenant_org: platform-admin only, soft delete.
-- ---------------------------------------------------------------------------
create or replace function public.delete_tenant_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can delete a tenant';
    end if;

    update public.organizations
    set deleted_at = now(),
        subscription_status = 'cancelled'
    where id = p_org_id
      and deleted_at is null;

    if not found then
        raise exception 'Tenant not found (or already deleted)';
    end if;
end;
$$;

revoke all on function public.delete_tenant_org(uuid) from public;
grant execute on function public.delete_tenant_org(uuid) to authenticated;
revoke execute on function public.delete_tenant_org(uuid) from anon;

comment on function public.delete_tenant_org(uuid) is 'Soft-deletes a tenant: sets deleted_at + cancels their subscription (which already locks out every org-scoped table via current_org_ids()). Platform-admin only. Does not touch the tenant''s underlying data.';

-- ---------------------------------------------------------------------------
-- list_tenants_billing: hide deleted tenants from the Tenants page.
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
    where o.deleted_at is null
    order by o.created_at desc;
end;
$$;

revoke all on function public.list_tenants_billing() from public;
grant execute on function public.list_tenants_billing() to authenticated;
revoke execute on function public.list_tenants_billing() from anon;
