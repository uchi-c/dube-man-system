-- ============================================================================
-- MIGRATION 026: PLATFORM ADMIN MANAGEMENT
--
-- Until now, is_platform_admin (migration 014) could only be flipped by
-- directly editing the users table -- there was no in-app way for the
-- platform owner to add a co-founder/engineer as a fellow platform admin,
-- or to see who currently has that access. This adds:
--
--   - list_platform_admins(): who currently has cross-tenant access.
--   - find_user_by_email(): look up an existing Uruu OS account by email,
--     so an existing tenant admin/staff member can be promoted without
--     creating a duplicate account.
--   - set_platform_admin(): grant/revoke is_platform_admin on an existing
--     user. Guards against removing the last platform admin, the same
--     "can't demote the last ADMIN" shape migration 007 already applies
--     at the org level.
--
-- Creating a *brand-new* account for someone who doesn't have one yet
-- still needs Supabase Auth's admin API (a password-based account can't
-- be created by a plain RPC) -- that's the new admin-invite-platform-admin
-- edge function, which calls set_platform_admin-equivalent logic directly
-- after creating the account, gated by the same is_platform_admin() check.
-- ============================================================================

create or replace function public.list_platform_admins()
returns table (id uuid, name text, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can list platform admins';
    end if;

    return query
    select u.id, u.name, u.email, u.created_at
    from public.users u
    where u.is_platform_admin = true
    order by u.created_at asc;
end;
$$;

revoke all on function public.list_platform_admins() from public;
grant execute on function public.list_platform_admins() to authenticated;
revoke execute on function public.list_platform_admins() from anon;

comment on function public.list_platform_admins() is 'Every user with cross-tenant platform-admin access. Platform-admin callers only.';

create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, name text, email text, is_platform_admin boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can look up users';
    end if;

    return query
    select u.id, u.name, u.email, u.is_platform_admin
    from public.users u
    where lower(u.email) = lower(trim(p_email));
end;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;
revoke execute on function public.find_user_by_email(text) from anon;

comment on function public.find_user_by_email(text) is 'Look up an existing Uruu OS account by email, so it can be promoted to platform admin without creating a duplicate account. Platform-admin callers only.';

create or replace function public.set_platform_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin_count int;
begin
    if not public.is_platform_admin() then
        raise exception 'Only a platform admin can grant or revoke platform admin access';
    end if;

    if not exists (select 1 from public.users where id = p_user_id) then
        raise exception 'User not found';
    end if;

    if not p_is_admin then
        select count(*) into v_admin_count from public.users where is_platform_admin = true;
        if v_admin_count <= 1 then
            raise exception 'Cannot remove the last platform admin';
        end if;
    end if;

    update public.users set is_platform_admin = p_is_admin where id = p_user_id;
end;
$$;

revoke all on function public.set_platform_admin(uuid, boolean) from public;
grant execute on function public.set_platform_admin(uuid, boolean) to authenticated;
revoke execute on function public.set_platform_admin(uuid, boolean) from anon;

comment on function public.set_platform_admin(uuid, boolean) is 'Grant or revoke is_platform_admin on an existing user. Platform-admin callers only; refuses to remove the last remaining platform admin.';
