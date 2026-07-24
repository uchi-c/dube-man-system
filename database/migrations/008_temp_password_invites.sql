-- ============================================================================
-- MIGRATION 008: TEMP-PASSWORD TEAM INVITES
-- Replaces "share a link, they set their own password" with "admin sees a
-- one-time temporary password, staff logs in with it and is forced to set
-- their own" -- reported live: invite links opened for an unauthenticated
-- visitor were landing back on the sign-in screen instead of the join form
-- (a separate client-side bug in App.tsx, fixed alongside this), so a
-- credential the teammate can log in with directly is more reliable than a
-- link that has to survive being copy-pasted through chat apps.
--
-- The actual account creation (calling Supabase Auth's admin API to set the
-- temporary password) happens in the admin-invite-user Edge Function using
-- the service role key -- Postgres alone can't hash/set an auth password.
-- This migration only adds what that function and the forced-change screen
-- need on the public schema side.
--
-- Apply AFTER migration 007_prevent_last_admin_demotion.sql.
-- Safe to re-run.
-- ============================================================================

alter table public.users
    add column if not exists must_change_password boolean not null default false;

comment on column public.users.must_change_password is 'Set true when an admin creates this account with a temporary password (admin-invite-user Edge Function). The app forces a ResetPassword screen until clear_must_change_password() runs, which only ever happens right after the user successfully sets their own password.';

-- No general "users can update their own row" policy exists (see migration
-- 005 -- only org admins can update org members), which is deliberate: it
-- keeps a compromised or careless client from ever being able to rewrite
-- its own role. A narrow SECURITY DEFINER function that can only ever flip
-- this one flag for auth.uid() itself avoids widening that policy just for
-- this.
create or replace function public.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.users set must_change_password = false where id = auth.uid();
end;
$$;

revoke all on function public.clear_must_change_password() from public;
grant execute on function public.clear_must_change_password() to authenticated;
revoke execute on function public.clear_must_change_password() from anon;

comment on function public.clear_must_change_password() is 'Self-service only: clears the caller''s own must_change_password flag. Called right after supabase.auth.updateUser({ password }) succeeds on the forced-change screen -- never callable on another account.';
