-- ============================================================================
-- MIGRATION 017: DELETE SUPPORT FOR PRODUCTS/CUSTOMERS/STAFF
--
-- The app had no delete action anywhere -- every "Add X" page (Team,stock,
-- customers, pharmacy, printing orders) was add/edit only. This adds the
-- missing delete paths:
--
-- 1) products.is_active / customers.is_active (soft delete, default true).
--    Both are referenced by RESTRICT foreign keys elsewhere (sale_items.
--    product_id, printing_orders.customer_id) that would reject a hard
--    delete the moment the record has ever been used in a real
--    transaction -- so "delete" here means hide from the active list,
--    same convention medicines.is_active already established. Existing
--    fetch queries are updated (in application code, this migration only
--    adds the column) to filter is_active = true.
--
-- 2) "Remove staff" = deleting the caller's user_organization_memberships
--    row for that person, not touching their auth account or public.users
--    profile -- so every sale/log/dispensing record they ever created
--    keeps their real name (those FKs are all ON DELETE SET NULL against
--    users, not against memberships). The existing "Admins manage
--    memberships" RLS policy (migration 013) already lets an org admin
--    delete a membership row in their own org; the missing piece is a
--    guard against deleting the *last* admin's membership and orphaning
--    the org with nobody able to manage it -- prevent_last_admin_demotion
--    (migration 007) only fires on a role UPDATE, not a membership
--    DELETE, so it doesn't cover this. This trigger mirrors that same
--    "count other admins in this org" check for the delete case.
-- ============================================================================

alter table public.products add column if not exists is_active boolean not null default true;
alter table public.customers add column if not exists is_active boolean not null default true;

comment on column public.products.is_active is 'False = deleted from the active list. Not a hard delete: sale_items.product_id is ON DELETE RESTRICT, so a sold product cannot be hard-deleted anyway -- this is the actual delete mechanism.';
comment on column public.customers.is_active is 'False = deleted from the active list. Not a hard delete: printing_orders.customer_id is ON DELETE RESTRICT, so a customer with orders cannot be hard-deleted anyway -- this is the actual delete mechanism.';

create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_other_admins int;
begin
    if (select role from public.users where id = old.user_id) = 'ADMIN' then
        select count(*) into v_other_admins
        from public.users u
        join public.user_organization_memberships m on m.user_id = u.id
        where m.org_id = old.org_id
          and u.id <> old.user_id
          and u.role = 'ADMIN';

        if v_other_admins = 0 then
            raise exception 'Cannot remove this member: they are the only Admin in the organization. Promote another member to Admin first.';
        end if;
    end if;

    return old;
end;
$$;

drop trigger if exists tr_prevent_last_admin_removal on public.user_organization_memberships;
create trigger tr_prevent_last_admin_removal
    before delete on public.user_organization_memberships
    for each row execute function public.prevent_last_admin_removal();
