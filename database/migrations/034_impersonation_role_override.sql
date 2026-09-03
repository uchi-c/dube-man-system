-- ============================================================================
-- MIGRATION 034: FIX -- IMPERSONATION DIDN'T GRANT ADMIN-EQUIVALENT ACCESS
--
-- Reported live: a platform admin whose own public.users.role happens to be
-- something other than 'ADMIN' (e.g. 'CAFE_OPERATOR', left over from however
-- their own account was originally set up) got "Access restricted" when
-- using "View as tenant" -- and worse, would have hit RLS/RPC permission
-- failures trying to actually use most of the impersonated tenant's pages,
-- since is_role() checks (current_user_role()) also key off that same
-- column.
--
-- Migration 033's design already reasoned about this at the org-membership
-- level (an impersonation grant isn't a real membership, bypasses the
-- suspended-org lock, etc) but wrongly assumed every platform admin's own
-- role would already be 'ADMIN'. "View as tenant" promises full
-- admin-equivalent access to the tenant regardless of the platform admin's
-- own role -- that's the whole point of the feature -- so current_user_role()
-- now grants 'ADMIN' for the duration of any active impersonation grant,
-- same signature, same STABLE SECURITY DEFINER SQL function.
--
-- Not a new privilege-escalation path: the only way an is_impersonation row
-- can exist at all is through start_tenant_impersonation(), itself gated by
-- is_platform_admin(); the sole other write path to this table ("Admins
-- manage memberships" RLS policy) already requires the caller to already be
-- role = 'ADMIN', so a non-admin tenant employee cannot fabricate one for
-- themselves.
-- ============================================================================

create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
    select case
        when exists (
            select 1 from public.user_organization_memberships m
            where m.user_id = auth.uid()
              and m.is_impersonation
              and m.impersonation_expires_at > now()
        ) then 'ADMIN'::user_role
        else (select role from public.users where id = auth.uid())
    end
$$;
