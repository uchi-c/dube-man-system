-- ============================================================================
-- MIGRATION 004: ORGANIZATION BUSINESS TYPE
-- Lets a tenant declare what kind of business it runs (general, pharmacy,
-- cafe, printing, retail) so the app can tailor which modules its nav shows.
-- Purely additive — existing organizations default to 'general', which shows
-- every module exactly like before this migration (nothing hides itself
-- without an explicit choice).
--
-- Apply AFTER migration 003_organization_signup.sql.
-- Safe to re-run.
-- ============================================================================

do $$ begin
    create type public.business_type as enum ('general', 'pharmacy', 'cafe', 'printing', 'retail');
exception when duplicate_object then null; end $$;

alter table public.organizations
    add column if not exists business_type public.business_type not null default 'general';

comment on column public.organizations.business_type is
    'What kind of business this tenant runs. Drives which nav modules the app shows by default (general = everything, unchanged from pre-migration behavior).';

-- Replace the 2-arg signup_new_organization from migration 003 with a
-- 3-arg version. Drop the old overload first (rather than leaving both) so
-- there's exactly one signature to grant/revoke and reason about.
drop function if exists public.signup_new_organization(text, text) cascade;

create or replace function public.signup_new_organization(
    org_name text,
    owner_name text default null,
    business_type text default 'general'
)
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
    v_business_type public.business_type;
begin
    if v_user_id is null then
        raise exception 'Must be signed in to create an organization';
    end if;

    if exists (select 1 from public.users where id = v_user_id) then
        raise exception 'This account already has a profile. Sign in instead, or ask an admin to add you to another organization.';
    end if;

    if v_org_name = '' then
        raise exception 'Organization name is required';
    end if;

    begin
        v_business_type := coalesce(nullif(trim(business_type), ''), 'general')::public.business_type;
    exception when invalid_text_representation then
        raise exception 'Unknown business type: %', business_type;
    end;

    select email into v_email from auth.users where id = v_user_id;
    if v_email is null then
        raise exception 'Could not resolve the signed-in account''s email';
    end if;

    insert into public.organizations (name, business_type)
    values (v_org_name, v_business_type)
    returning id into v_org_id;

    insert into public.users (id, name, email, role)
    values (
        v_user_id,
        coalesce(nullif(trim(owner_name), ''), split_part(v_email, '@', 1)),
        v_email,
        'ADMIN'
    );

    insert into public.user_organization_memberships (user_id, org_id)
    values (v_user_id, v_org_id)
    on conflict (user_id, org_id) do nothing;

    return query select v_org_id, 'ADMIN'::public.user_role;
end;
$$;

-- Same ACL hardening as migration 003 (Supabase re-applies default schema
-- grants around CREATE FUNCTION, so anon's execute grant must be revoked as
-- its own later statement — see 003_organization_signup.sql for detail).
revoke all on function public.signup_new_organization(text, text, text) from public;
grant execute on function public.signup_new_organization(text, text, text) to authenticated;
revoke execute on function public.signup_new_organization(text, text, text) from anon;

comment on function public.signup_new_organization(text, text, text) is 'Self-service signup: creates an organization (with a business type) and makes the calling (already-authenticated) user its ADMIN. Scoped to auth.uid() — cannot act on any other account.';
