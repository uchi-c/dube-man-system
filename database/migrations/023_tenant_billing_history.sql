-- ============================================================================
-- MIGRATION 023: A TENANT'S OWN VIEW OF THEIR OWN PAYMENT HISTORY
--
-- list_tenant_payments(p_org_id) already exists (migration 015) but is
-- platform-admin only -- exactly like list_tenants_billing() was before
-- get_my_organization_billing() (migration 020) gave tenants a view of
-- their own plan. Same gap here: a tenant currently has no way to see their
-- own payment history at all, only the platform admin does via
-- TenantsAdmin's Manage panel. This adds the tenant-side equivalent,
-- following the exact same auth pattern as get_my_organization_billing():
-- gated by org membership (any role), not platform-admin, and NOT filtered
-- through current_org_ids() -- a locked-out tenant still needs to see their
-- own payment history, arguably more than an active one does.
-- ============================================================================

create or replace function public.get_my_organization_payments(p_org_id uuid default null, p_limit integer default 50)
returns table (
    id uuid,
    amount numeric,
    currency text,
    paid_at timestamptz,
    note text
)
language sql
stable
security definer
set search_path = public
as $$
    select p.id, p.amount, p.currency, p.paid_at, p.note
    from public.tenant_payments p
    where p.org_id = coalesce(
        p_org_id,
        (
            select m.org_id
            from public.user_organization_memberships m
            join public.organizations o on o.id = m.org_id
            where m.user_id = auth.uid()
            order by o.created_at desc
            limit 1
        )
    )
    and exists (
        select 1 from public.user_organization_memberships m
        where m.user_id = auth.uid() and m.org_id = p.org_id
    )
    order by p.paid_at desc
    limit greatest(p_limit, 1)
$$;

revoke all on function public.get_my_organization_payments(uuid, integer) from public;
grant execute on function public.get_my_organization_payments(uuid, integer) to authenticated;
revoke execute on function public.get_my_organization_payments(uuid, integer) from anon;

comment on function public.get_my_organization_payments(uuid, integer) is 'A tenant''s own payment history -- any org member can call this for their own org (not platform-admin gated, unlike list_tenant_payments). Used by the tenant-side dashboard billing history section.';
