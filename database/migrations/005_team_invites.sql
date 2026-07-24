-- ============================================================================
-- MIGRATION 005: TEAM INVITES + ORG-SCOPED USER VISIBILITY
-- Lets an org's ADMIN invite a teammate by email and assign them a role
-- (ADMIN, STAFF, or CAFE_OPERATOR) instead of every new signup always
-- creating a brand-new organization. Also closes a cross-tenant gap: the
-- pre-existing "Admins manage users" policy on public.users had no
-- organization_id filter (public.users itself carries no organization_id —
-- membership lives in user_organization_memberships), so any ADMIN of ANY
-- org could read/update every user row platform-wide. That was harmless
-- while every deployment stayed single-tenant, but this migration's own
-- Team page is the first UI to actually list "all users" back to an admin,
-- so it's fixed here rather than shipped alongside a feature that would
-- immediately exercise the leak.
--
-- Apply AFTER migration 004_business_type.sql.
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ORG-SCOPE public.users RLS
-- ---------------------------------------------------------------------------

drop policy if exists "Users can read own profile" on public.users;
create policy "Users read own profile or org admins read org members" on public.users for select
    using (
        id = auth.uid()
        or (
            public.is_role(array['ADMIN']::public.user_role[])
            and id in (select user_id from public.user_organization_memberships where org_id in (select public.current_org_ids()))
        )
    );

-- Split the old blanket "Admins manage users" (for all) into update/delete
-- only, both org-scoped. Insert stays covered by "Users can create own staff
-- profile" (self-service) and the SECURITY DEFINER signup/invite functions
-- below, which don't need a direct table grant to admins at all.
drop policy if exists "Admins manage users" on public.users;

create policy "Org admins update org members" on public.users for update
    using (
        public.is_role(array['ADMIN']::public.user_role[])
        and id in (select user_id from public.user_organization_memberships where org_id in (select public.current_org_ids()))
    )
    with check (
        public.is_role(array['ADMIN']::public.user_role[])
        and id in (select user_id from public.user_organization_memberships where org_id in (select public.current_org_ids()))
    );

create policy "Org admins delete org members" on public.users for delete
    using (
        public.is_role(array['ADMIN']::public.user_role[])
        and id in (select user_id from public.user_organization_memberships where org_id in (select public.current_org_ids()))
    );

-- ---------------------------------------------------------------------------
-- 2. INVITES TABLE
-- ---------------------------------------------------------------------------

create table if not exists public.organization_invites (
    id uuid default uuid_generate_v4() primary key,
    org_id uuid not null references public.organizations(id) on delete cascade,
    email text not null,
    role public.user_role not null default 'STAFF',
    token text not null unique,
    invited_by uuid references public.users(id) on delete set null,
    created_at timestamptz default timezone('utc'::text, now()) not null,
    expires_at timestamptz default (timezone('utc'::text, now()) + interval '7 days') not null,
    accepted_at timestamptz,
    revoked_at timestamptz
);

alter table public.organization_invites enable row level security;

drop policy if exists "Org admins view their invites" on public.organization_invites;
create policy "Org admins view their invites" on public.organization_invites for select
    using (org_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));

-- Update-only (used to revoke a pending invite) — creation always goes
-- through create_organization_invite() below so token generation and the
-- "revoke any existing pending invite for this email" dedup logic can't be
-- bypassed by a direct insert.
drop policy if exists "Org admins revoke their invites" on public.organization_invites;
create policy "Org admins revoke their invites" on public.organization_invites for update
    using (org_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]))
    with check (org_id in (select public.current_org_ids()) and public.is_role(array['ADMIN']::public.user_role[]));

comment on table public.organization_invites is 'Pending/accepted/revoked invitations for someone to join an organization with a specific role. Tokens are opaque bearer credentials — anyone with the link can accept, so get_invite_info() and accept_organization_invite() are the only ways to read/consume one.';

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

-- Admin action: invite a teammate into the caller's own organization.
create or replace function public.create_organization_invite(p_email text, p_role text default 'STAFF')
returns table (id uuid, token text, email text, role public.user_role, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
    v_role public.user_role;
    v_token text;
begin
    if not public.is_role(array['ADMIN']::public.user_role[]) then
        raise exception 'Only an organization admin can invite teammates';
    end if;

    select org_id into v_org_id from public.user_organization_memberships where user_id = auth.uid() limit 1;
    if v_org_id is null then
        raise exception 'You are not a member of any organization';
    end if;

    if p_email is null or trim(p_email) = '' then
        raise exception 'Email is required';
    end if;

    begin
        v_role := coalesce(nullif(trim(p_role), ''), 'STAFF')::public.user_role;
    exception when invalid_text_representation then
        raise exception 'Unknown role: %', p_role;
    end;

    -- Revoke any still-pending invite to the same email in this org first,
    -- so re-inviting someone (e.g. they lost the link) doesn't leave two
    -- valid tokens floating around.
    update public.organization_invites oi
    set revoked_at = timezone('utc'::text, now())
    where oi.org_id = v_org_id
      and lower(oi.email) = lower(trim(p_email))
      and oi.accepted_at is null
      and oi.revoked_at is null;

    -- gen_random_uuid() is built into core Postgres (pg_catalog, always on
    -- the search_path regardless of this function's own "set search_path"),
    -- unlike uuid_generate_v4() which lives in the uuid-ossp extension's
    -- "extensions" schema and is unresolvable here -- that's what was
    -- throwing "function uuid_generate_v4() does not exist".
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    return query
    insert into public.organization_invites (org_id, email, role, token, invited_by)
    values (v_org_id, lower(trim(p_email)), v_role, v_token, auth.uid())
    returning organization_invites.id, organization_invites.token, organization_invites.email, organization_invites.role, organization_invites.expires_at;
end;
$$;

revoke all on function public.create_organization_invite(text, text) from public;
grant execute on function public.create_organization_invite(text, text) to authenticated;
revoke execute on function public.create_organization_invite(text, text) from anon;

comment on function public.create_organization_invite(text, text) is 'Admin-only: creates (or replaces, if one is already pending for the same email) an invite for the caller''s own organization. Scoped to auth.uid()''s org — cannot invite into another tenant.';

-- Public lookup so the Signup page can show "You''re invited to join {org}
-- as {role}" before the visitor has authenticated. Safe to expose: the
-- token itself is the secret, and this only echoes back what its holder
-- already implicitly knows (which org, which role) — no other tenant data.
create or replace function public.get_invite_info(p_token text)
returns table (org_name text, role public.user_role, email text)
language sql
stable
security definer
set search_path = public
as $$
    select o.name, i.role, i.email
    from public.organization_invites i
    join public.organizations o on o.id = i.org_id
    where i.token = p_token
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > timezone('utc'::text, now())
$$;

revoke all on function public.get_invite_info(text) from public;
grant execute on function public.get_invite_info(text) to anon, authenticated;

comment on function public.get_invite_info(text) is 'Anon-callable: resolves a still-valid invite token to its org name / role / invited email, for the Signup page''s pre-auth "you''re joining X as Y" preview.';

-- Mirrors signup_new_organization's shape but joins an EXISTING org with
-- whatever role the inviting admin chose, instead of creating a new one.
create or replace function public.accept_organization_invite(p_token text, p_name text default null)
returns table (organization_id uuid, role public.user_role)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text;
    v_invite record;
begin
    if v_user_id is null then
        raise exception 'Must be signed in to accept an invite';
    end if;

    if exists (select 1 from public.users where id = v_user_id) then
        raise exception 'This account already has a profile. Sign in instead, or ask an admin to add you to another organization.';
    end if;

    select * into v_invite from public.organization_invites
    where token = p_token
      and accepted_at is null
      and revoked_at is null
      and expires_at > timezone('utc'::text, now());

    if v_invite is null then
        raise exception 'This invite link is invalid, expired, or already used';
    end if;

    select email into v_email from auth.users where id = v_user_id;
    if v_email is null then
        raise exception 'Could not resolve the signed-in account''s email';
    end if;

    insert into public.users (id, name, email, role)
    values (
        v_user_id,
        coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)),
        v_email,
        v_invite.role
    );

    insert into public.user_organization_memberships (user_id, org_id)
    values (v_user_id, v_invite.org_id)
    on conflict (user_id, org_id) do nothing;

    update public.organization_invites set accepted_at = timezone('utc'::text, now()) where id = v_invite.id;

    return query select v_invite.org_id, v_invite.role;
end;
$$;

revoke all on function public.accept_organization_invite(text, text) from public;
grant execute on function public.accept_organization_invite(text, text) to authenticated;
revoke execute on function public.accept_organization_invite(text, text) from anon;

comment on function public.accept_organization_invite(text, text) is 'Self-service invite acceptance: joins the calling (already-authenticated) user to the invite''s organization with the invite''s role. Scoped to auth.uid() — cannot act on any other account. Consumes the invite (single use).';
