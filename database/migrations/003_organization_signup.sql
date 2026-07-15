-- ============================================================================
-- MIGRATION 003: SELF-SERVICE ORGANIZATION SIGNUP
-- Lets a brand-new Supabase Auth user create their own organization and
-- become its ADMIN in one transaction, from the app's Signup page —
-- previously this required an admin to run SQL by hand (see
-- docs/DEPLOYMENT.md "Onboarding a new tenant").
--
-- Why a SECURITY DEFINER function instead of plain inserts: a brand-new
-- user has no public.users row yet (or, at best, only enough privilege to
-- insert themselves as STAFF — see "Users can create own staff profile" in
-- schema.sql). Both public.organizations and
-- public.user_organization_memberships only allow INSERT from an existing
-- ADMIN. A signing-up user is, by definition, neither yet — so this
-- function runs with elevated privileges to bootstrap all three rows
-- (organizations, users, user_organization_memberships), but is scoped
-- tightly to auth.uid() so it can only ever act on the CALLING user's own
-- account, not anyone else's.
--
-- Apply AFTER migration 001_multi_tenancy.sql.
-- Safe to re-run.
-- ============================================================================

create or replace function public.signup_new_organization(org_name text, owner_name text default null)
returns table (organization_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_org_id uuid;
    v_org_name text := trim(coalesce(org_name, ''));
begin
    if v_user_id is null then
        raise exception 'Must be signed in to create an organization';
    end if;

    -- One organization-creation per auth account. An account that already
    -- has a profile (whether from a prior signup or an admin-provisioned
    -- invite) must be added to additional organizations by an existing
    -- ADMIN instead — see docs/DEPLOYMENT.md "Onboarding a new tenant".
    if exists (select 1 from public.users where id = v_user_id) then
        raise exception 'This account already has a profile. Sign in instead, or ask an admin to add you to another organization.';
    end if;

    if v_org_name = '' then
        raise exception 'Organization name is required';
    end if;

    select email into v_email from auth.users where id = v_user_id;
    if v_email is null then
        raise exception 'Could not resolve the signed-in account''s email';
    end if;

    insert into public.organizations (name)
    values (v_org_name)
    returning id into v_org_id;

    insert into public.users (id, name, email, role)
    values (
        v_user_id,
        coalesce(nullif(trim(owner_name), ''), split_part(v_email, '@', 1)),
        v_email,
        'ADMIN'
    );

    -- Usually redundant with tr_auto_enroll_default_organization (which
    -- fires on the users insert above and already enrolls into the org when
    -- it's the only one), but explicit here so this function is correct
    -- standalone even if that trigger is ever changed — and it's a no-op
    -- via ON CONFLICT when the trigger already did it.
    insert into public.user_organization_memberships (user_id, org_id)
    values (v_user_id, v_org_id)
    on conflict (user_id, org_id) do nothing;

    return query select v_org_id, 'ADMIN'::public.user_role;
end;
$$;

-- Belt-and-suspenders: the function already raises an exception when
-- auth.uid() is null, so an anon caller gets a clean error either way. But
-- Supabase re-applies its default anon/authenticated/service_role execute
-- grants around function creation, so a single REVOKE ALL FROM PUBLIC issued
-- alongside the CREATE doesn't reliably strip anon's grant — REVOKE EXECUTE
-- FROM anon explicitly, as its own statement, does.
revoke all on function public.signup_new_organization(text, text) from public;
grant execute on function public.signup_new_organization(text, text) to authenticated;
revoke execute on function public.signup_new_organization(text, text) from anon;

comment on function public.signup_new_organization(text, text) is 'Self-service signup: creates an organization and makes the calling (already-authenticated) user its ADMIN. Scoped to auth.uid() — cannot act on any other account.';
