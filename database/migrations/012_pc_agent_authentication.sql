-- ============================================================================
-- MIGRATION 012: PC AGENT AUTHENTICATION (fixes a critical cross-tenant hole)
--
-- SECURITY AUDIT FINDING (critical): every "Agent ..." policy on computers,
-- computer_commands, cafe_sessions, and print_jobs was `USING (true)` /
-- `WITH CHECK (true)` for the anon role -- the same role the public anon key
-- authenticates as, and that anon key ships inside the web app's JS bundle,
-- so it is not a secret. In practice this meant ANYONE with that key
-- (extractable from the deployed site by anyone) could, for every tenant on
-- this shared multi-tenant project, not just their own:
--   - read the full `computers` table cross-tenant (hostnames, IPs, rates)
--   - INSERT a fake computer into any organization_id (no membership check)
--   - UPDATE any computer's status/rate/hostname/ip in any org
--   - read every pending computer_commands row cross-tenant (recon)
--   - mark ANY command completed before the real agent ever runs it --
--     directly defeating remote LOCK/RESTART/SHUTDOWN reliability, which
--     matters most for exactly the anti-theft use case this was built for
--   - read/write cafe_sessions and print_jobs the same way
--
-- AGENT_SECRET already existed as a field in the agent's .env and the
-- install scripts, but was never actually verified anywhere -- generated,
-- displayed, stored, and otherwise decorative. This migration makes it the
-- real credential: one secret per organization, sent by the agent on every
-- request as the `x-agent-secret` header, checked by every "Agent ..."
-- policy via agent_secret_ok() below. PostgREST exposes incoming request
-- headers to Postgres as the `request.headers` GUC, which is what makes a
-- plain RLS policy able to check this without a custom Edge Function.
--
-- Stored as plaintext (not hashed) and revoked from ordinary table access
-- (see the REVOKE below) -- deliberate: it has to be handed back out
-- in full by resolve_pc_provisioning_code() so a fresh remote install can
-- pick it up automatically (see pc-agent/remote-install.ps1), not just
-- checked once at creation like a password. Its blast radius if leaked
-- is bounded to "can write agent data for that one org", which is a large
-- improvement over the status quo of "no secret needed for any org".
--
-- BREAKING CHANGE: any already-installed agent's current AGENT_SECRET value
-- will not match the org's newly-established canonical secret below, so
-- its requests will start being rejected by RLS until its .env is updated
-- (or it's reinstalled via a fresh provisioning code, which now fetches
-- the correct secret automatically).
--
-- Apply AFTER migration 011 (there is no 011 yet at time of writing --
-- rename if one lands first). Safe to re-run except for the backfill,
-- which only touches rows where agent_secret is still null.
-- ============================================================================

alter table public.organizations add column if not exists agent_secret text;

-- Backfill existing orgs with a fresh secret. gen_random_uuid() (not
-- pgcrypto's gen_random_bytes()) deliberately -- it's core Postgres
-- (pg_catalog), always resolvable regardless of search_path, unlike
-- pgcrypto's functions which live in the "extensions" schema and are
-- unresolvable inside a `set search_path = public`-locked function (the
-- exact bug already hit once this project with uuid_generate_v4()).
-- Three UUIDs concatenated, hyphens stripped, is a 96-char hex secret.
update public.organizations
set agent_secret = replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
where agent_secret is null;

alter table public.organizations alter column agent_secret set not null;
alter table public.organizations alter column agent_secret
    set default (replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

-- Column-level REVOKE: even though RLS already scopes which *rows* of
-- organizations a role can see, this additionally guarantees the
-- agent_secret *column* is never returned by an ordinary `select *`,
-- regardless of row-level policy -- it's readable only through the
-- SECURITY DEFINER functions below, which control exactly who gets it.
revoke select (agent_secret) on public.organizations from anon, authenticated;

comment on column public.organizations.agent_secret is 'Shared secret this org''s PC agents send as the x-agent-secret header on every Supabase request -- the actual enforcement mechanism behind every "Agent ..." RLS policy (see agent_secret_ok()). Column-level access is revoked from anon/authenticated; only reachable via get_my_org_agent_secret() (admin, own org) and resolve_pc_provisioning_code() (anon, one-time code redemption).';

-- ---------------------------------------------------------------------------
-- Comparison helper, used directly inside RLS policies below.
-- ---------------------------------------------------------------------------
create or replace function public.agent_secret_ok(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.organizations o
        where o.id = p_org_id
          and o.agent_secret = coalesce(
              current_setting('request.headers', true)::json ->> 'x-agent-secret',
              ''
          )
    );
$$;

revoke all on function public.agent_secret_ok(uuid) from public;
grant execute on function public.agent_secret_ok(uuid) to anon, authenticated;

comment on function public.agent_secret_ok(uuid) is 'True if the current request''s x-agent-secret header matches this organization''s stored agent_secret. The enforcement point for every PC agent RLS policy -- see migration 012.';

-- ---------------------------------------------------------------------------
-- Admin-facing lookup, for a manual install (pc-agent/install.ps1 -AgentSecret)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_org_agent_secret()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_org_id uuid;
    v_secret text;
begin
    if not public.is_role(array['ADMIN']::public.user_role[]) then
        raise exception 'Only an organization admin can view the agent secret';
    end if;

    select org_id into v_org_id from public.user_organization_memberships where user_id = auth.uid() limit 1;
    if v_org_id is null then
        raise exception 'You are not a member of any organization';
    end if;

    select agent_secret into v_secret from public.organizations where id = v_org_id;
    return v_secret;
end;
$$;

revoke all on function public.get_my_org_agent_secret() from public;
grant execute on function public.get_my_org_agent_secret() to authenticated;
revoke execute on function public.get_my_org_agent_secret() from anon;

comment on function public.get_my_org_agent_secret() is 'Admin-only: returns the caller''s own organization''s agent_secret, for a manual pc-agent/install.ps1 -AgentSecret run.';

-- ---------------------------------------------------------------------------
-- Hand the secret to a fresh remote install automatically -- extends the
-- existing single-use provisioning code so remote-install.ps1 needs zero
-- manual secret coordination, unlike the old "share -AgentSecret by hand"
-- flow.
-- ---------------------------------------------------------------------------
-- Adding a column to the return table changes the function's return type,
-- which CREATE OR REPLACE can't do -- has to be dropped first.
drop function if exists public.resolve_pc_provisioning_code(text);

create function public.resolve_pc_provisioning_code(p_code text)
returns table (organization_id uuid, computer_code text, agent_secret text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row record;
begin
    select * into v_row from public.computer_provisioning_codes
    where code = upper(trim(p_code))
      and used_at is null
      and expires_at > timezone('utc'::text, now());

    if v_row is null then
        raise exception 'This code is invalid, expired, or already used. Ask your admin for a new one.';
    end if;

    update public.computer_provisioning_codes set used_at = timezone('utc'::text, now()) where id = v_row.id;

    return query
    select v_row.org_id, v_row.computer_code, o.agent_secret
    from public.organizations o
    where o.id = v_row.org_id;
end;
$$;

revoke all on function public.resolve_pc_provisioning_code(text) from public;
grant execute on function public.resolve_pc_provisioning_code(text) to anon, authenticated;

comment on function public.resolve_pc_provisioning_code(text) is 'Anon-callable: resolves a still-valid provisioning code to its organization_id/computer_code/agent_secret and marks it used. Called by pc-agent/remote-install.ps1 during a fresh install -- now hands back the org''s agent_secret too so the install is fully self-configuring.';

-- ---------------------------------------------------------------------------
-- Rewrite every "Agent ..." anon policy to require the matching secret.
-- ---------------------------------------------------------------------------

-- computers
drop policy if exists "Agent registers computer" on public.computers;
create policy "Agent registers computer" on public.computers for insert
    to anon
    with check (agent_secret_ok(organization_id));

drop policy if exists "Agent reads computers" on public.computers;
create policy "Agent reads computers" on public.computers for select
    to anon
    using (agent_secret_ok(organization_id));

drop policy if exists "Agent updates computer" on public.computers;
create policy "Agent updates computer" on public.computers for update
    to anon
    using (agent_secret_ok(organization_id))
    with check (agent_secret_ok(organization_id));

-- computer_commands (no organization_id column -- join through computers by computer_code)
drop policy if exists "Agent reads commands" on public.computer_commands;
create policy "Agent reads commands" on public.computer_commands for select
    to anon
    using (
        agent_secret_ok((select c.organization_id from public.computers c where c.computer_code = computer_commands.computer_code))
    );

drop policy if exists "Agent completes commands" on public.computer_commands;
create policy "Agent completes commands" on public.computer_commands for update
    to anon
    using (
        agent_secret_ok((select c.organization_id from public.computers c where c.computer_code = computer_commands.computer_code))
    )
    with check (
        agent_secret_ok((select c.organization_id from public.computers c where c.computer_code = computer_commands.computer_code))
    );

-- cafe_sessions
drop policy if exists "Agent reads cafe sessions" on public.cafe_sessions;
create policy "Agent reads cafe sessions" on public.cafe_sessions for select
    to anon
    using (agent_secret_ok(organization_id));

drop policy if exists "Agent updates cafe sessions" on public.cafe_sessions;
create policy "Agent updates cafe sessions" on public.cafe_sessions for update
    to anon
    using (agent_secret_ok(organization_id))
    with check (agent_secret_ok(organization_id));

-- print_jobs
drop policy if exists "Agent inserts print jobs" on public.print_jobs;
create policy "Agent inserts print jobs" on public.print_jobs for insert
    to anon
    with check (agent_secret_ok(organization_id));

drop policy if exists "Agent reads print jobs" on public.print_jobs;
create policy "Agent reads print jobs" on public.print_jobs for select
    to anon
    using (agent_secret_ok(organization_id));

-- ---------------------------------------------------------------------------
-- New orgs get their own secret automatically at signup.
-- ---------------------------------------------------------------------------
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

    insert into public.organizations (name, business_type, agent_secret)
    values (v_org_name, v_business_type, replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
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
