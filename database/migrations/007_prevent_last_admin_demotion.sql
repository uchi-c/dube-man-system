-- ============================================================================
-- MIGRATION 007: PREVENT LAST-ADMIN SELF-LOCKOUT
-- A live incident: an org's only Admin accidentally changed their own role
-- to Staff via the Team page's role dropdown, which immediately hid the
-- Team page from them (Admin-only) -- locking them out of ever undoing it
-- without direct database access. Blocks that at the source: a role change
-- away from ADMIN is rejected outright if it would leave any of that user's
-- organizations with zero admins, regardless of which client path attempts
-- it (UI, direct API call, another RPC) -- RLS alone can't express this,
-- since "is there another admin left" isn't a property of the row being
-- written.
--
-- Apply AFTER migration 006_widen_financial_reports.sql.
-- Safe to re-run.
-- ============================================================================

create or replace function public.prevent_last_admin_demotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
    v_other_admins int;
begin
    if old.role = 'ADMIN' and new.role <> 'ADMIN' then
        for v_org_id in
            select org_id from public.user_organization_memberships where user_id = old.id
        loop
            select count(*) into v_other_admins
            from public.users u
            join public.user_organization_memberships m on m.user_id = u.id
            where m.org_id = v_org_id
              and u.id <> old.id
              and u.role = 'ADMIN';

            if v_other_admins = 0 then
                raise exception 'Cannot change this role: they are the only Admin in the organization. Promote another member to Admin first.';
            end if;
        end loop;
    end if;

    return new;
end;
$$;

drop trigger if exists tr_prevent_last_admin_demotion on public.users;
create trigger tr_prevent_last_admin_demotion
    before update on public.users
    for each row execute function public.prevent_last_admin_demotion();

comment on function public.prevent_last_admin_demotion() is 'Blocks any UPDATE that would change a role away from ADMIN if that would leave one of the user''s organizations with zero admins. Fires regardless of caller (RLS-independent).';
